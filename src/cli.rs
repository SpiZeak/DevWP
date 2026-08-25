//! Command-line interface.
//!
//! The same binary serves both surfaces: invoked without arguments it launches
//! the desktop GUI (`main.rs`); invoked with a subcommand it runs headless.
//! Every command calls the same `backend` functions as the UI — there is no
//! separate CLI code path for the actual work.
//!
//! Output goes to stdout, errors and warnings to stderr. Exit codes: `0` on
//! success, `1` when an operation fails, `2` for usage errors (clap).

use crate::backend::site::{
    format_domain, is_valid_email, MultisiteConfig, MultisiteType, Site, SiteCreateRequest,
    SiteUpdateRequest, WordPressInstallConfig,
};
use crate::backend::utils::{NotificationType, OperationResult};
use crate::backend::{docker, lifecycle, settings, site, system, utils, wp_cli, xdebug};
use crate::state;
use clap::{Args, Parser, Subcommand, ValueEnum};
use std::io::{self, Write};

/// Marker width for the doctor report label column.
const DOCTOR_LABEL_WIDTH: usize = 24;

#[derive(Parser, Debug)]
#[command(
    name = "devwp",
    version,
    about = "DevWP – simplified local WordPress development with Docker, Nginx, and PHP-FPM",
    long_about = "DevWP – simplified local WordPress development with Docker, Nginx, and PHP-FPM.\n\
        \n\
        Run without a subcommand to launch the desktop GUI. With a subcommand,\n\
        the same binary works as a CLI and drives the identical backend:\n\
        sites, the Docker service stack, WP-CLI, Xdebug and settings.\n\
        \n\
        Examples:\n  \
        devwp site create shop --wp-title Shop --wp-user admin\n  \
        devwp services start && devwp wp shop.test plugin list\n  \
        devwp xdebug on"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Initialize the DevWP environment (state dir, webroot, service stack)
    Init(InitArgs),
    /// Check the environment for problems and print a PASS/WARN/FAIL report
    Doctor,
    /// Show configuration paths and environment facts
    Info {
        /// Print machine-readable JSON instead of a labeled list
        #[arg(long)]
        json: bool,
    },
    /// Manage WordPress sites
    #[command(alias = "sites")]
    Site {
        #[command(subcommand)]
        command: SiteCommand,
    },
    /// Manage the Docker service stack (nginx, php, mariadb, redis, mailpit)
    #[command(alias = "service")]
    Services {
        #[command(subcommand)]
        command: ServicesCommand,
    },
    /// Run a WP-CLI command inside a site's php container
    #[command(
        after_help = "Examples:\n  devwp wp example.test plugin list\n  devwp wp example.test core update\n  devwp wp example.test search-replace \"olddomain\" \"newdomain\""
    )]
    Wp {
        /// Site domain, as shown by `devwp site list`
        #[arg(value_name = "DOMAIN")]
        domain: String,
        /// WP-CLI command and arguments, passed through verbatim
        #[arg(
            value_name = "ARGS",
            trailing_var_arg = true,
            allow_hyphen_values = true,
            num_args = 1..
        )]
        args: Vec<String>,
    },
    /// Run `composer update` inside a site's php container
    Composer {
        /// Site domain, as shown by `devwp site list`
        #[arg(value_name = "DOMAIN")]
        domain: String,
    },
    /// Show or change the Xdebug state (restarts the php service)
    Xdebug {
        /// What to do: show the status (default), enable, disable, or flip it
        #[arg(default_value = "status")]
        action: XdebugAction,
    },
    /// Read and write DevWP settings (stored in settings.json)
    Settings {
        #[command(subcommand)]
        command: SettingsCommand,
    },
    /// Open a site's URL in the default browser
    Open {
        /// Site domain, as shown by `devwp site list`
        #[arg(value_name = "DOMAIN")]
        domain: String,
    },
}

#[derive(Args, Debug)]
pub struct InitArgs {
    /// Use DIR as the webroot (saved as the `webroot_path` setting) instead of
    /// the current value / ~/www default
    #[arg(long, value_name = "DIR")]
    pub webroot: Option<String>,
    /// Only prepare directories and checks; do not run `docker compose up`
    #[arg(long)]
    pub skip_start: bool,
}

#[derive(Subcommand, Debug)]
pub enum SiteCommand {
    /// List all sites (merges sites.json with directories found in the webroot)
    List {
        /// Print machine-readable JSON instead of a table
        #[arg(long)]
        json: bool,
    },
    /// Show one site's stored configuration
    Show {
        /// Site domain, as shown by `devwp site list`
        #[arg(value_name = "DOMAIN")]
        domain: String,
        /// Print machine-readable JSON instead of a labeled list
        #[arg(long)]
        json: bool,
    },
    /// Create a site: directories, nginx config, hosts entry, TLS certificate
    #[command(
        after_help = "The domain gets a `.test` suffix when it has no dot: `devwp site create shop` creates `shop.test`.\n\
        WordPress is installed when any --wp-* flag is given; omitted values default to\n\
        admin/root/root/root@example.com (same defaults as the GUI). A bare `--wp-password`\n\
        prompts on stdin instead of taking the value from the command line.\n\n\
        Examples:\n  \
        devwp site create shop --wp-title \"My Shop\"\n  \
        devwp site create multisite.test --multisite subdomain\n  \
        devwp site create symlinks.test --webroot public --aliases \"a.test b.test\""
    )]
    Create(SiteCreateArgs),
    /// Change a site's aliases or web root (regenerates cert + nginx config)
    Update(SiteUpdateArgs),
    /// Delete a site: files, nginx config, sites.json entry and hosts entries
    #[command(
        after_help = "The site directory under the webroot is removed. The site's MariaDB\ndatabase is kept (same behaviour as the GUI)."
    )]
    Delete(SiteDeleteArgs),
}

#[derive(Args, Debug)]
pub struct SiteCreateArgs {
    /// Domain for the site; `.test` is appended when it contains no dot
    #[arg(value_name = "DOMAIN")]
    pub domain: String,
    /// Relative web-root segment inside the site directory (e.g. `public`)
    #[arg(long = "webroot", value_name = "DIR")]
    pub web_root: Option<String>,
    /// Comma- or space-separated alias domains
    #[arg(long, value_name = "ALIASES")]
    pub aliases: Option<String>,
    /// Set up the nginx config for WordPress multisite
    #[arg(long, value_enum, value_name = "TYPE")]
    pub multisite: Option<MultisiteKind>,
    /// WordPress site title (giving any --wp-* flag triggers a WP install)
    #[arg(long, value_name = "TITLE")]
    pub wp_title: Option<String>,
    /// WordPress admin username (default: root)
    #[arg(long, value_name = "USER")]
    pub wp_user: Option<String>,
    /// WordPress admin password (default: root); given without a value it is
    /// read from a stdin prompt instead of the command line
    #[arg(
        long,
        value_name = "PASSWORD",
        num_args = 0..=1,
        default_missing_value = ""
    )]
    pub wp_password: Option<String>,
    /// WordPress admin email (default: root@example.com)
    #[arg(long, value_name = "EMAIL")]
    pub wp_email: Option<String>,
}

#[derive(Args, Debug)]
pub struct SiteUpdateArgs {
    /// Site domain, as shown by `devwp site list`
    #[arg(value_name = "DOMAIN")]
    pub domain: String,
    /// Replace the alias list (comma- or space-separated)
    #[arg(long, value_name = "ALIASES")]
    pub aliases: Option<String>,
    /// Replace the relative web-root segment (e.g. `public`)
    #[arg(long = "webroot", value_name = "DIR")]
    pub web_root: Option<String>,
}

#[derive(Args, Debug)]
pub struct SiteDeleteArgs {
    /// Site domain, as shown by `devwp site list`
    #[arg(value_name = "DOMAIN")]
    pub domain: String,
    /// Do not ask for confirmation
    #[arg(short, long)]
    pub yes: bool,
}

#[derive(Subcommand, Debug)]
pub enum ServicesCommand {
    /// Show container states, health and detected versions
    Status {
        /// Print machine-readable JSON instead of a table
        #[arg(long)]
        json: bool,
    },
    /// Start the stack (`docker compose up -d nginx`), mirroring the GUI launch
    Start,
    /// Stop the whole stack (`docker compose down`), mirroring the GUI close
    Stop,
    /// Restart one container (service name, devwp_* name or container id)
    #[command(after_help = "Example:\n  devwp services restart php")]
    Restart {
        /// Service to restart: nginx, php, mariadb, redis, mailpit (or a
        /// devwp_* container name / container id)
        #[arg(value_name = "SERVICE")]
        service: String,
    },
}

#[derive(Subcommand, Debug)]
pub enum SettingsCommand {
    /// List all settings as key/value pairs
    List {
        /// Print machine-readable JSON instead of key = value lines
        #[arg(long)]
        json: bool,
    },
    /// Print the value of one setting
    Get {
        /// Setting key, e.g. `webroot_path`
        #[arg(value_name = "KEY")]
        key: String,
    },
    /// Set a setting, creating it if needed
    #[command(after_help = "Example:\n  devwp settings set webroot_path ~/www")]
    Set {
        /// Setting key
        #[arg(value_name = "KEY")]
        key: String,
        /// Setting value
        #[arg(value_name = "VALUE")]
        value: String,
    },
    /// Remove a setting
    Unset {
        /// Setting key
        #[arg(value_name = "KEY")]
        key: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum XdebugAction {
    /// Print whether Xdebug is enabled (default)
    Status,
    /// Enable Xdebug (no-op when already enabled)
    On,
    /// Disable Xdebug (no-op when already disabled)
    Off,
    /// Flip to the opposite of the current state
    Toggle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum MultisiteKind {
    /// Multisite using paths (example.test/site2)
    Subdirectory,
    /// Multisite using subdomains (site2.example.test)
    Subdomain,
}

/// Entry point from `main.rs` once argument presence has been detected.
/// Never returns normally on `--help`/`--version`/usage errors (clap exits).
pub fn run() -> i32 {
    let cli = Cli::parse();
    utils::set_headless_mode(true);

    // Signal reads/writes need a live Dioxus runtime, so drain pending
    // notifications before `with_runtime` tears it down.
    let result = with_runtime(|| {
        let result = execute(cli.command);
        print_pending_notifications();
        result
    });

    match result {
        Ok(()) => 0,
        Err(e) => {
            errln(format!("error: {e}"));
            1
        }
    }
}

/// Dispatch a parsed command. Kept separate from `run` so parse tests never
/// need to touch the Dioxus runtime.
fn execute(command: Commands) -> Result<(), String> {
    match command {
        Commands::Init(args) => cmd_init(args),
        Commands::Doctor => cmd_doctor(),
        Commands::Info { json } => cmd_info(json),
        Commands::Site { command } => cmd_site(command),
        Commands::Services { command } => cmd_services(command),
        Commands::Wp { domain, args } => cmd_wp(domain, args),
        Commands::Composer { domain } => cmd_composer(domain),
        Commands::Xdebug { action } => cmd_xdebug(action),
        Commands::Settings { command } => cmd_settings(command),
        Commands::Open { domain } => cmd_open(domain),
    }
}

// ── init / doctor / info ──────────────────────────────────────

fn cmd_init(args: InitArgs) -> Result<(), String> {
    if let Some(webroot) = &args.webroot {
        let res = settings::save_setting("webroot_path".to_string(), webroot.clone());
        if !res.success {
            return Err(res
                .error
                .unwrap_or_else(|| format!("failed to save webroot '{webroot}'")));
        }
        outln(format!("Webroot setting saved: {webroot}"));
    }

    let state_dir = utils::ensure_state_root()?;
    let webroot = settings::ensure_webroot_exists()?;
    outln(format!("State directory: {}", state_dir.display()));
    outln(format!("Webroot:          {}", webroot.display()));

    docker::daemon_reachable().map_err(|e| format!("Docker daemon is not reachable: {e}"))?;
    outln("Docker daemon:    reachable");

    if !args.skip_start {
        cmd_services_start()?;
    }

    outln("Done. Create your first site with `devwp site create <name>`.");
    Ok(())
}

enum Check {
    Pass(String),
    Warn(String),
    Fail(String),
}

fn report(label: &str, check: Check) -> bool {
    let is_fail = matches!(check, Check::Fail(_));
    let (tag, detail) = match check {
        Check::Pass(d) => ("PASS", d),
        Check::Warn(d) => ("WARN", d),
        Check::Fail(d) => ("FAIL", d),
    };
    outln(format!("{label:<DOCTOR_LABEL_WIDTH$} {tag}  {detail}"));
    is_fail
}

fn cmd_doctor() -> Result<(), String> {
    let mut failed = false;

    let docker_ok = docker::daemon_reachable().is_ok();
    failed |= report(
        "docker daemon",
        if docker_ok {
            Check::Pass("reachable".to_string())
        } else {
            Check::Fail("daemon not reachable — is Docker running?".to_string())
        },
    );

    let root = utils::project_root();
    let compose_found = root.join("compose.yml").exists();
    failed |= report(
        "compose.yml",
        if compose_found {
            Check::Pass(root.display().to_string())
        } else {
            Check::Fail(format!(
                "not found under {} — run from the DevWP checkout",
                root.display()
            ))
        },
    );

    match utils::ensure_state_root() {
        Ok(dir) => {
            let _ = report("state directory", Check::Pass(dir.display().to_string()));
        }
        Err(e) => failed |= report("state directory", Check::Fail(e)),
    }

    let webroot = settings::get_webroot_from_settings();
    if webroot.exists() {
        let _ = report("webroot", Check::Pass(webroot.display().to_string()));
    } else {
        let _ = report(
            "webroot",
            Check::Warn(format!(
                "{} missing (created by `devwp init`)",
                webroot.display()
            )),
        );
    }

    match site::find_mkcert() {
        Ok(mkcert) => {
            let _ = report("mkcert", Check::Pass(mkcert));
        }
        Err(e) => {
            let _ = report("mkcert", Check::Warn(e));
        }
    }

    if docker_ok {
        match docker::get_container_status() {
            Ok(containers) => {
                let running = containers
                    .iter()
                    .filter(|c| c.state == docker::ContainerState::Running)
                    .count();
                let check = if containers.is_empty() {
                    Check::Warn("stack not started — run `devwp services start`".to_string())
                } else if running == containers.len() {
                    Check::Pass(format!("{running}/{} running", containers.len()))
                } else {
                    Check::Warn(format!(
                        "{running}/{} running — restart flapping services with `devwp services restart <svc>`",
                        containers.len()
                    ))
                };
                let _ = report("service stack", check);
            }
            Err(e) => {
                let _ = report("service stack", Check::Warn(e));
            }
        }
    }

    if failed {
        return Err("one or more checks failed".to_string());
    }
    Ok(())
}

fn cmd_info(json: bool) -> Result<(), String> {
    let sites = site::get_sites();
    let value = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "projectRoot": utils::project_root().display().to_string(),
        "stateDir": utils::state_root().display().to_string(),
        "sitesFile": site::sites_file()?.display().to_string(),
        "settingsFile": settings::settings_file()?.display().to_string(),
        "webroot": settings::get_webroot_from_settings().display().to_string(),
        "xdebugEnabled": xdebug::get_xdebug_status(),
        "siteCount": sites.len(),
    });

    if json {
        return out_json(&value);
    }

    outln(format!("devwp v{}", env!("CARGO_PKG_VERSION")));
    outln(format!(
        "Project root:   {}",
        utils::project_root().display()
    ));
    outln(format!("State dir:      {}", utils::state_root().display()));
    outln(format!(
        "Sites file:      {}",
        site::sites_file()?.display()
    ));
    outln(format!(
        "Settings file:   {}",
        settings::settings_file()?.display()
    ));
    outln(format!(
        "Webroot:         {}",
        settings::get_webroot_from_settings().display()
    ));
    outln(format!(
        "Xdebug:          {}",
        if xdebug::get_xdebug_status() {
            "enabled"
        } else {
            "disabled"
        }
    ));
    outln(format!("Sites:           {}", sites.len()));
    Ok(())
}

// ── site ──────────────────────────────────────────────────────

fn cmd_site(cmd: SiteCommand) -> Result<(), String> {
    match cmd {
        SiteCommand::List { json } => cmd_site_list(json),
        SiteCommand::Show { domain, json } => cmd_site_show(domain, json),
        SiteCommand::Create(args) => cmd_site_create(args),
        SiteCommand::Update(args) => cmd_site_update(args),
        SiteCommand::Delete(args) => cmd_site_delete(args),
    }
}

fn cmd_site_list(json: bool) -> Result<(), String> {
    let sites = site::get_sites();
    if json {
        out_json(&sites)?;
        return Ok(());
    }
    if sites.is_empty() {
        outln("No sites found. Create one with `devwp site create <name>`.");
        return Ok(());
    }

    let rows: Vec<[String; 6]> = sites
        .iter()
        .map(|s| {
            [
                s.name.clone(),
                s.status.to_string(),
                s.url.clone(),
                or_dash(s.aliases.as_deref()),
                or_dash(s.web_root.as_deref()),
                s.multisite
                    .as_ref()
                    .filter(|m| m.enabled)
                    .map(|m| m.site_type.to_string())
                    .unwrap_or_else(|| "-".into()),
            ]
        })
        .collect();
    let headers = ["NAME", "STATUS", "URL", "ALIASES", "WEB ROOT", "MULTISITE"];
    let widths: Vec<usize> = (0..headers.len())
        .map(|i| {
            rows.iter()
                .map(|r| r[i].len())
                .chain([headers[i].len()])
                .max()
                .unwrap_or(0)
        })
        .collect();
    fn or_dash(v: Option<&str>) -> String {
        match v.filter(|v| !v.trim().is_empty()) {
            Some(v) => v.to_string(),
            None => "-".to_string(),
        }
    }

    fn row(cells: [&str; 6], widths: &[usize]) -> String {
        let padded: Vec<String> = cells
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{:<w$}", c, w = widths[i]))
            .collect();
        padded.join("  ").trim_end().to_string()
    }
    outln(row(headers, &widths));
    for r in &rows {
        outln(row([&r[0], &r[1], &r[2], &r[3], &r[4], &r[5]], &widths));
    }
    Ok(())
}

fn cmd_site_show(domain: String, json: bool) -> Result<(), String> {
    let site = resolve_site(&domain)?;
    if json {
        out_json(&site)?;
        return Ok(());
    }
    outln(format!("Name:      {}", site.name));
    outln(format!("Status:    {}", site.status));
    outln(format!("URL:       {}", site.url));
    outln(format!("Path:      {}", site.path));
    outln(format!(
        "Aliases:   {}",
        site.aliases.as_deref().unwrap_or("-")
    ));
    outln(format!(
        "Web root:  {}",
        site.web_root.as_deref().unwrap_or("-")
    ));
    if let Some(m) = site.multisite.as_ref().filter(|m| m.enabled) {
        outln(format!("Multisite: {}", m.site_type));
    }
    Ok(())
}

fn cmd_site_create(args: SiteCreateArgs) -> Result<(), String> {
    if let Some(email) = &args.wp_email {
        if !is_valid_email(email) {
            return Err(format!("invalid --wp-email address: '{email}'"));
        }
    }

    let wants_wordpress = args.wp_title.is_some()
        || args.wp_user.is_some()
        || args.wp_password.is_some()
        || args.wp_email.is_some();

    // A bare `--wp-password` (no value) switches to a stdin prompt so the
    // credential never lands in shell history or the host process list.
    let wp_password = match args.wp_password.as_deref() {
        Some("") => Some(read_wp_password()?),
        given => given.map(str::to_string),
    };

    let domain = format_domain(&args.domain);
    let request = SiteCreateRequest {
        domain: domain.clone(),
        web_root: args.web_root.clone(),
        aliases: args.aliases.clone(),
        multisite: args.multisite.map(|kind| MultisiteConfig {
            enabled: true,
            site_type: match kind {
                MultisiteKind::Subdirectory => MultisiteType::Subdirectory,
                MultisiteKind::Subdomain => MultisiteType::Subdomain,
            },
        }),
        wordpress: wants_wordpress.then(|| WordPressInstallConfig {
            title: args.wp_title.clone().unwrap_or_default(),
            admin_user: args.wp_user.clone().unwrap_or_default(),
            admin_password: wp_password.unwrap_or_default(),
            admin_email: args.wp_email.clone().unwrap_or_default(),
        }),
    };

    if wants_wordpress {
        outln(format!(
            "Creating '{domain}' and installing WordPress (this can take a minute)..."
        ));
    } else {
        outln(format!("Creating '{domain}'..."));
    }

    site::create_site(request)?;
    outln(format!("Site created: https://{domain}"));
    Ok(())
}

/// Prompt for the WordPress admin password on stdin (echo is not disabled —
/// no terminal-raw-mode dependency; acceptable for a local dev credential).
fn read_wp_password() -> Result<String, String> {
    let _ = write!(io::stdout(), "WordPress admin password: ");
    let _ = io::stdout().flush();
    let mut password = String::new();
    io::stdin()
        .read_line(&mut password)
        .map_err(|e| format!("failed to read password: {e}"))?;
    let trimmed = password.trim_end_matches(['\r', '\n']);
    if trimmed.is_empty() {
        outln("(empty input — using the default 'root')");
    } else {
        outln("");
    }
    Ok(trimmed.to_string())
}

fn cmd_site_update(args: SiteUpdateArgs) -> Result<(), String> {
    if args.aliases.is_none() && args.web_root.is_none() {
        return Err("nothing to update: pass --aliases and/or --webroot".to_string());
    }
    let site = resolve_site(&args.domain)?;
    let result = site::update_site(
        site,
        SiteUpdateRequest {
            aliases: args.aliases.clone(),
            web_root: args.web_root.clone(),
        },
    )?;
    check_operation(result)
}

fn cmd_site_delete(args: SiteDeleteArgs) -> Result<(), String> {
    let site = resolve_site(&args.domain)?;

    if !args.yes {
        errln(format!(
            "This deletes '{}' and all files under '{}'.",
            site.name, site.path
        ));
        let mut answer = String::new();
        let _ = write!(io::stdout(), "Delete? [y/N] ");
        let _ = io::stdout().flush();
        io::stdin()
            .read_line(&mut answer)
            .map_err(|e| format!("failed to read confirmation: {e}"))?;
        let answer = answer.trim().to_ascii_lowercase();
        if answer != "y" && answer != "yes" {
            return Err("aborted by user".to_string());
        }
    }

    let name = site.name.clone();
    site::delete_site(site)?;
    outln(format!("Site '{name}' deleted."));
    outln(format!(
        "Note: database '{}' was kept in MariaDB (same behaviour as the GUI).",
        name.replace(['.', '-'], "_")
    ));
    Ok(())
}

/// Find a site by exact name first, then with the `.test` suffix appended, so
/// both `devwp site show example.test` and `... show example` work.
fn resolve_site(name: &str) -> Result<Site, String> {
    let formatted = format_domain(name);
    site::get_sites()
        .into_iter()
        .find(|s| s.name == name || s.name == formatted)
        .ok_or_else(|| format!("site '{name}' not found. Run `devwp site list` for known sites."))
}

// ── services ──────────────────────────────────────────────────

fn cmd_services(cmd: ServicesCommand) -> Result<(), String> {
    match cmd {
        ServicesCommand::Status { json } => cmd_services_status(json),
        ServicesCommand::Start => cmd_services_start(),
        ServicesCommand::Stop => cmd_services_stop(),
        ServicesCommand::Restart { service } => cmd_services_restart(service),
    }
}

fn cmd_services_status(json: bool) -> Result<(), String> {
    let containers = docker::get_container_status()?;
    if json {
        out_json(&containers)?;
        return Ok(());
    }
    if containers.is_empty() {
        outln("No containers found. Start the stack with `devwp services start`.");
        return Ok(());
    }

    let name_w = containers
        .iter()
        .map(|c| c.name.len())
        .chain([4])
        .max()
        .unwrap_or(4);
    outln(format!(
        "{:<name_w$}  STATE         HEALTH   VERSION",
        "NAME"
    ));
    for c in &containers {
        let health = c.health.clone().unwrap_or_else(|| "-".to_string());
        let version = c.version.clone().unwrap_or_else(|| "-".to_string());
        outln(format!(
            "{:<name_w$}  {:<13}  {:<8}  {version}",
            c.name,
            c.state.to_string(),
            health
        ));
    }
    Ok(())
}

fn cmd_services_start() -> Result<(), String> {
    outln("Starting services (the first run may build images)...");
    // The Bollard lifecycle streams build/pull output into the global build
    // log instead of stdout; drain whatever accumulated so first-run builds
    // stay visible (and failures diagnosable) in headless mode.
    let seen = state::build_logs().len();
    let result = lifecycle::start_services_sync();
    let logs = state::build_logs();
    for line in &logs[seen.min(logs.len())..] {
        outln(line.clone());
    }
    result?;
    outln("Services started.");
    Ok(())
}

fn cmd_services_stop() -> Result<(), String> {
    outln("Stopping services...");
    lifecycle::stop_services_sync()?;
    outln("Services stopped.");
    Ok(())
}

fn cmd_services_restart(service: String) -> Result<(), String> {
    let container = resolve_container(&service);
    block_on(docker::restart_container(container.clone()))?;
    outln(format!("Restarted '{container}'."));
    Ok(())
}

/// Map compose service names to their container names; pass anything else
/// (devwp_* names, container ids) through unchanged.
fn resolve_container(name: &str) -> String {
    match name {
        "php" | "nginx" | "mariadb" | "redis" | "mailpit" => format!("devwp_{name}"),
        other => other.to_string(),
    }
}

// ── wp / composer ─────────────────────────────────────────────

fn cmd_wp(domain: String, args: Vec<String>) -> Result<(), String> {
    let site = resolve_site(&domain)?;
    let result = block_on(wp_cli::run_wp_cli(wp_cli::WpCliRequest {
        site,
        command: join_wp_args(&args),
    }))?;
    print_tool_output(result)
}

/// Re-quote raw argv so arguments containing spaces survive the
/// `shell_words::split` inside `run_wp_cli` unchanged.
fn join_wp_args(args: &[String]) -> String {
    args.iter()
        .map(|a| shell_words::quote(a).into_owned())
        .collect::<Vec<_>>()
        .join(" ")
}

fn cmd_composer(domain: String) -> Result<(), String> {
    let site = resolve_site(&domain)?;
    let result = block_on(wp_cli::run_composer_update(site))?;
    print_tool_output(result)
}

/// Shared handling for wp/composer results (`{success, output, error}`).
fn print_tool_output(result: serde_json::Value) -> Result<(), String> {
    let success = result
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let output = result.get("output").and_then(|v| v.as_str()).unwrap_or("");
    let error = result.get("error").and_then(|v| v.as_str()).unwrap_or("");

    if !output.trim().is_empty() {
        outln(output.trim_end());
    }
    if success {
        if !error.trim().is_empty() {
            errln(error.trim_end());
        }
        Ok(())
    } else {
        Err(if error.trim().is_empty() {
            "command failed with no output".to_string()
        } else {
            error.trim_end().to_string()
        })
    }
}

// ── xdebug ────────────────────────────────────────────────────

fn enabled_word(enabled: bool) -> &'static str {
    if enabled {
        "enabled"
    } else {
        "disabled"
    }
}

fn cmd_xdebug(action: XdebugAction) -> Result<(), String> {
    let current = xdebug::get_xdebug_status();
    let target = match action {
        XdebugAction::Status => {
            outln(format!("xdebug is {}", enabled_word(current)));
            return Ok(());
        }
        XdebugAction::On => true,
        XdebugAction::Off => false,
        XdebugAction::Toggle => !current,
    };

    if current == target {
        outln(format!("xdebug is already {}", enabled_word(current)));
        return Ok(());
    }
    block_on(xdebug::set_xdebug(target))?;
    outln(format!(
        "xdebug {} (php service restarted)",
        enabled_word(target)
    ));
    Ok(())
}

// ── settings ──────────────────────────────────────────────────

fn cmd_settings(cmd: SettingsCommand) -> Result<(), String> {
    match cmd {
        SettingsCommand::List { json } => {
            let mut map = settings::read_settings();
            if json {
                out_json(&map)?;
                return Ok(());
            }
            if map.is_empty() {
                outln("No settings defined.");
                return Ok(());
            }
            let mut keys: Vec<_> = map.keys().cloned().collect();
            keys.sort();
            for key in keys {
                outln(format!("{key} = {}", map.remove(&key).unwrap_or_default()));
            }
            Ok(())
        }
        SettingsCommand::Get { key } => match settings::get_setting(key.clone()) {
            Some(value) => {
                outln(value);
                Ok(())
            }
            None => Err(format!("setting '{key}' is not set")),
        },
        SettingsCommand::Set { key, value } => check_operation(settings::save_setting(key, value)),
        SettingsCommand::Unset { key } => check_operation(settings::delete_setting(key)),
    }
}

fn check_operation(result: OperationResult) -> Result<(), String> {
    if result.success {
        outln(result.message);
        Ok(())
    } else {
        Err(result.error.unwrap_or(result.message))
    }
}

// ── open ──────────────────────────────────────────────────────

fn cmd_open(domain: String) -> Result<(), String> {
    let site = resolve_site(&domain)?;
    let url = site.url.clone();
    system::open_external(url.clone())?;
    outln(format!("Opened {url}"));
    Ok(())
}

// ── shared helpers ────────────────────────────────────────────

fn outln(text: impl AsRef<str>) {
    let _ = writeln!(io::stdout(), "{}", text.as_ref());
}

fn errln(text: impl AsRef<str>) {
    let _ = writeln!(io::stderr(), "{}", text.as_ref());
}

fn out_json(value: &impl serde::Serialize) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value).map_err(|e| format!("serialize JSON: {e}"))?;
    outln(json);
    Ok(())
}

/// Surface warnings/errors the backend pushed as GUI notifications while the
/// command ran (e.g. "site created but hosts entry not added") on stderr.
fn print_pending_notifications() {
    for n in state::notifications().iter() {
        if matches!(
            n.notification_type,
            NotificationType::Warning | NotificationType::Error
        ) {
            errln(format!("[{}] {}", n.notification_type, n.message));
        }
    }
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
        .block_on(future)
}

/// Run `f` inside a Dioxus runtime (root scope) so global signal writes have
/// a home — the same pattern as `tests/integration.rs`.
fn with_runtime<T>(f: impl FnOnce() -> T) -> T {
    use dioxus::dioxus_core::{NoOpMutations, RuntimeGuard, VirtualDom};
    use dioxus::prelude::*;

    let mut dom = VirtualDom::new(|| rsx! { div { "cli" } });
    let mut noop = NoOpMutations;
    dom.rebuild(&mut noop);
    let runtime = dom.runtime();
    let guard = RuntimeGuard::new(runtime.clone());
    let result = runtime.in_scope(dioxus::core::ScopeId::ROOT, f);
    drop(guard);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn clap_definition_is_valid() {
        Cli::command().debug_assert();
    }

    #[test]
    fn parses_site_list() {
        let cli = Cli::try_parse_from(["devwp", "site", "list"]).unwrap();
        assert!(matches!(
            cli.command,
            Commands::Site {
                command: SiteCommand::List { json: false }
            }
        ));
    }

    #[test]
    fn parses_site_list_json() {
        let cli = Cli::try_parse_from(["devwp", "site", "list", "--json"]).unwrap();
        assert!(matches!(
            cli.command,
            Commands::Site {
                command: SiteCommand::List { json: true }
            }
        ));
    }

    #[test]
    fn parses_site_create_options() {
        let cli = Cli::try_parse_from([
            "devwp",
            "site",
            "create",
            "shop",
            "--webroot",
            "public",
            "--aliases",
            "a.test,b.test",
            "--multisite",
            "subdomain",
            "--wp-title",
            "My Shop",
            "--wp-email",
            "admin@shop.test",
        ])
        .unwrap();
        match cli.command {
            Commands::Site {
                command: SiteCommand::Create(args),
            } => {
                assert_eq!(args.domain, "shop");
                assert_eq!(args.web_root.as_deref(), Some("public"));
                assert_eq!(args.aliases.as_deref(), Some("a.test,b.test"));
                assert_eq!(args.multisite, Some(MultisiteKind::Subdomain));
                assert_eq!(args.wp_title.as_deref(), Some("My Shop"));
                assert_eq!(args.wp_email.as_deref(), Some("admin@shop.test"));
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn wp_captures_trailing_args_verbatim() {
        let cli = Cli::try_parse_from([
            "devwp",
            "wp",
            "example.test",
            "search-replace",
            "old value",
            "--all-tables",
        ])
        .unwrap();
        match cli.command {
            Commands::Wp { domain, args } => {
                assert_eq!(domain, "example.test");
                assert_eq!(args, ["search-replace", "old value", "--all-tables"]);
            }
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn xdebug_defaults_to_status() {
        let cli = Cli::try_parse_from(["devwp", "xdebug"]).unwrap();
        assert!(matches!(
            cli.command,
            Commands::Xdebug {
                action: XdebugAction::Status
            }
        ));
    }

    #[test]
    fn parses_xdebug_on() {
        let cli = Cli::try_parse_from(["devwp", "xdebug", "on"]).unwrap();
        assert!(matches!(
            cli.command,
            Commands::Xdebug {
                action: XdebugAction::On
            }
        ));
    }

    #[test]
    fn parses_settings_set() {
        let cli =
            Cli::try_parse_from(["devwp", "settings", "set", "webroot_path", "/tmp/www"]).unwrap();
        assert!(matches!(
            cli.command,
            Commands::Settings {
                command: SettingsCommand::Set { ref key, ref value }
            } if key == "webroot_path" && value == "/tmp/www"
        ));
    }

    #[test]
    fn rejects_unknown_command() {
        assert!(Cli::try_parse_from(["devwp", "nope"]).is_err());
    }

    #[test]
    fn rejects_site_create_without_domain() {
        assert!(Cli::try_parse_from(["devwp", "site", "create"]).is_err());
    }

    #[test]
    fn wp_password_accepts_value_or_prompt_mode() {
        let bare = Cli::try_parse_from(["devwp", "site", "create", "s", "--wp-password"]).unwrap();
        match bare.command {
            Commands::Site {
                command: SiteCommand::Create(args),
            } => assert_eq!(args.wp_password.as_deref(), Some("")),
            other => panic!("unexpected command: {other:?}"),
        }
        let valued =
            Cli::try_parse_from(["devwp", "site", "create", "s", "--wp-password=secret"]).unwrap();
        match valued.command {
            Commands::Site {
                command: SiteCommand::Create(args),
            } => assert_eq!(args.wp_password.as_deref(), Some("secret")),
            other => panic!("unexpected command: {other:?}"),
        }
    }

    #[test]
    fn resolves_service_short_names_to_containers() {
        assert_eq!(resolve_container("php"), "devwp_php");
        assert_eq!(resolve_container("mailpit"), "devwp_mailpit");
        assert_eq!(resolve_container("devwp_nginx"), "devwp_nginx");
        assert_eq!(resolve_container("abc123"), "abc123");
    }

    #[test]
    fn wp_args_roundtrip_through_shell_split() {
        let args: Vec<String> = ["search-replace", "old value", "--all-tables"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let split = shell_words::split(&join_wp_args(&args)).unwrap();
        assert_eq!(split, args);
    }

    #[test]
    fn site_status_display_matches_serde() {
        use crate::backend::site::SiteStatus;
        assert_eq!(SiteStatus::Active.to_string(), "active");
        assert_eq!(SiteStatus::Provisioning.to_string(), "provisioning");
    }
}
