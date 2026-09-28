//! Site export/import as `.tar.xz` archives.
//!
//! An archive contains the site's webroot files, an optional MariaDB dump and
//! a metadata file describing the site entry:
//!
//! ```text
//! devwp-site.json   SiteArchiveMeta (format version + site entry)
//! database.sql      mariadb-dump output (absent when the site had no DB)
//! files/            contents of <webroot>/<site>
//! ```
//!
//! Compression is xz preset 9 with the "extreme" flag (`xz -9e`) — the
//! slowest, best-compression mode liblzma offers. Decompression speed is
//! unaffected by the preset, so imports stay fast.

use crate::backend::docker::{
    exec_in_container, exec_in_container_with_stdin, require_containers_running_sync, ExecOptions,
};
use crate::backend::settings::{ensure_webroot_exists, get_webroot_from_settings};
use crate::backend::site::{self, db_name_for, validate_site_name, Site, SiteStatus};
use crate::backend::utils::{
    emit_notification, NotificationType, DB_HOST, DB_ROOT_PASSWORD, DB_ROOT_USER,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

/// Archive layout version; imports refuse other versions.
pub const ARCHIVE_FORMAT_VERSION: u32 = 1;

const META_FILE: &str = "devwp-site.json";
const DB_FILE: &str = "database.sql";
const FILES_DIR: &str = "files";

/// `xz -9e`: preset 9 | LZMA_PRESET_EXTREME (`1 << 31`, see lzma-sys).
const XZ_PRESET_9E: u32 = 9 | (1 << 31);

/// Everything the import needs to reconstruct a site, read from
/// [`META_FILE`] inside the archive. `path`/`url`/`status` are recomputed on
/// import against the current webroot; only the meaningful fields travel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteArchiveMeta {
    pub format: u32,
    pub site: Site,
    /// Whether the archive contains a `database.sql` to restore.
    pub database: bool,
}

/// UI-facing description of an in-flight export/import; drives the transfer
/// modal. Written from blocking worker threads through the global SyncSignal.
#[derive(Debug, Clone)]
pub struct SiteTransferJob {
    pub exporting: bool,
    pub site: String,
    pub message: String,
}

/// Result of a successful [`unpack_site_archive`].
#[derive(Debug)]
struct UnpackedSite {
    meta: SiteArchiveMeta,
    dump: Option<String>,
}

// ── Pack/unpack (pure fs + compression, unit-testable) ────────

fn db_client_args() -> Vec<String> {
    vec![format!("-u{DB_ROOT_USER}"), format!("-p{DB_ROOT_PASSWORD}")]
}

/// Dump the site's database via `mariadb-dump` in the mariadb container.
/// `None` when the database does not exist (site was never WP-installed).
/// `--hex-blob` keeps binary columns textual so the exec's UTF-8 output
/// channel round-trips them exactly.
fn dump_database(db_name: &str) -> Result<Option<String>, String> {
    if !database_exists(db_name)? {
        return Ok(None);
    }
    let mut argv = vec!["mariadb-dump".to_string()];
    argv.extend(db_client_args());
    argv.push("--hex-blob".to_string());
    argv.push("--default-character-set=utf8mb4".to_string());
    argv.push(db_name.to_string());
    let argv_refs: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = exec_in_container(DB_HOST, &argv_refs, &ExecOptions::default())?;
    if !output.success() {
        return Err(format!("Database dump failed: {}", output.stderr));
    }
    Ok(Some(output.stdout))
}

/// Whether the site's database exists (`SHOW DATABASES` — the name is
/// charset-validated by `validate_site_name` before it ever gets here).
fn database_exists(db_name: &str) -> Result<bool, String> {
    let mut argv = vec!["mariadb".to_string()];
    argv.extend(db_client_args());
    argv.push("-N".to_string());
    argv.push("-B".to_string());
    argv.push("-e".to_string());
    argv.push("SHOW DATABASES".to_string());
    let argv_refs: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = exec_in_container(DB_HOST, &argv_refs, &ExecOptions::default())?;
    if !output.success() {
        return Err(format!("Failed to list databases: {}", output.stderr));
    }
    Ok(output.stdout.lines().any(|l| l.trim() == db_name))
}

/// Restore a SQL dump through `mariadb`'s stdin in the mariadb container
/// (no temp files, no bind mounts — the dump travels over the Docker API).
fn restore_database(db_name: &str, dump: &str) -> Result<(), String> {
    site::create_database(db_name)?;
    let mut argv = vec!["mariadb".to_string()];
    argv.extend(db_client_args());
    argv.push(db_name.to_string());
    let argv_refs: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = exec_in_container_with_stdin(
        DB_HOST,
        &argv_refs,
        &ExecOptions::default(),
        dump.as_bytes(),
    )?;
    if !output.success() {
        return Err(format!("Database restore failed: {}", output.stderr));
    }
    Ok(())
}

fn append_bytes<W: Write>(
    builder: &mut tar::Builder<W>,
    path: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let mut header = tar::Header::new_gnu();
    header.set_mode(0o644);
    header.set_size(bytes.len() as u64);
    header.set_cksum();
    builder
        .append_data(&mut header, path, std::io::Cursor::new(bytes))
        .map_err(|e| format!("Archive write of `{path}` failed: {e}"))
}

/// Build the `.tar.xz` archive at `dest`. The metadata file is written first
/// so an import can refuse a foreign archive before extracting anything. A
/// failed pack removes the partial archive file.
fn pack_site_archive(
    dest: &Path,
    site: &Site,
    dump: Option<&str>,
    site_dir: &Path,
    on_progress: &dyn Fn(&str),
) -> Result<(), String> {
    let result = (|| {
        on_progress("Compressing archive (xz preset 9e — best compression, slow by design)…");
        let file = fs::File::create(dest)
            .map_err(|e| format!("Failed to create {}: {e}", dest.display()))?;
        // Easy encoder with preset 9e: the .xz container format driven at
        // liblzma's slowest, best-compression setting.
        let stream = xz2::stream::Stream::new_easy_encoder(XZ_PRESET_9E, xz2::stream::Check::Crc64)
            .map_err(|e| format!("Failed to configure xz encoder: {e}"))?;
        let encoder = xz2::write::XzEncoder::new_stream(file, stream);
        let mut builder = tar::Builder::new(encoder);

        let meta = SiteArchiveMeta {
            format: ARCHIVE_FORMAT_VERSION,
            site: site.clone(),
            database: dump.is_some(),
        };
        let meta_bytes = serde_json::to_vec_pretty(&meta)
            .map_err(|e| format!("Failed to serialize site metadata: {e}"))?;
        append_bytes(&mut builder, META_FILE, &meta_bytes)?;
        if let Some(dump) = dump {
            append_bytes(&mut builder, DB_FILE, dump.as_bytes())?;
        }
        builder
            .append_dir_all(FILES_DIR, site_dir)
            .map_err(|e| format!("Failed to archive {}: {e}", site_dir.display()))?;

        let encoder = builder
            .into_inner()
            .map_err(|e| format!("Failed to finish archive: {e}"))?;
        encoder
            .finish()
            .map_err(|e| format!("Failed to finish archive: {e}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(dest);
    }
    result
}

/// Join `rel` onto `dest`, refusing absolute paths and `..` traversal.
fn safe_join(dest: &Path, rel: &Path) -> Result<PathBuf, String> {
    if rel.is_absolute() {
        return Err(format!(
            "Archive entry has an absolute path: {}",
            rel.display()
        ));
    }
    let mut out = dest.to_path_buf();
    for component in rel.components() {
        match component {
            Component::Normal(segment) => out.push(segment),
            Component::CurDir => {}
            _ => {
                return Err(format!(
                    "Archive entry escapes the destination: {}",
                    rel.display()
                ));
            }
        }
    }
    Ok(out)
}

/// Read the archive at `archive` and extract its `files/` tree into `dest`.
/// Every entry is validated (no traversal, no links, only files and dirs)
/// and the metadata must appear before any file entry. Returns the parsed
/// metadata and the optional SQL dump.
fn unpack_site_archive(
    archive: &Path,
    dest: &Path,
    on_progress: &dyn Fn(&str),
) -> Result<UnpackedSite, String> {
    on_progress("Reading archive…");
    let file = fs::File::open(archive)
        .map_err(|e| format!("Failed to open {}: {e}", archive.display()))?;
    let mut tar = tar::Archive::new(xz2::read::XzDecoder::new(file));
    fs::create_dir_all(dest).map_err(|e| format!("Failed to create {}: {e}", dest.display()))?;

    let mut meta: Option<SiteArchiveMeta> = None;
    let mut dump: Option<String> = None;

    for entry in tar
        .entries()
        .map_err(|e| format!("Corrupt archive (not a DevWP site export?): {e}"))?
    {
        let mut entry = entry.map_err(|e| format!("Corrupt archive entry: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("Corrupt archive entry path: {e}"))?
            .to_path_buf();
        if path.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return Err(format!(
                "Archive entry escapes the destination: {}",
                path.display()
            ));
        }

        let Some(top) = path
            .components()
            .next()
            .map(|c| c.as_os_str().to_os_string())
        else {
            continue;
        };
        let top = top.to_string_lossy().to_string();

        match top.as_str() {
            META_FILE => {
                if meta.is_some() {
                    return Err("Corrupt archive: duplicate site metadata".to_string());
                }
                let mut text = String::new();
                entry
                    .read_to_string(&mut text)
                    .map_err(|e| format!("Corrupt site metadata: {e}"))?;
                let parsed: SiteArchiveMeta = serde_json::from_str(&text)
                    .map_err(|e| format!("Corrupt site metadata: {e}"))?;
                if parsed.format != ARCHIVE_FORMAT_VERSION {
                    return Err(format!(
                        "Unsupported archive format version {} (this DevWP understands {})",
                        parsed.format, ARCHIVE_FORMAT_VERSION
                    ));
                }
                meta = Some(parsed);
            }
            DB_FILE => {
                if dump.is_some() {
                    return Err("Corrupt archive: duplicate database dump".to_string());
                }
                let mut text = String::new();
                entry
                    .read_to_string(&mut text)
                    .map_err(|e| format!("Corrupt database dump: {e}"))?;
                dump = Some(text);
            }
            FILES_DIR => {
                let Some(parsed_meta) = &meta else {
                    return Err(format!(
                        "Not a DevWP site archive: `{META_FILE}` must precede the files"
                    ));
                };
                if dump.is_none() && parsed_meta.database {
                    return Err(
                        "Corrupt archive: metadata promises a database dump that is missing"
                            .to_string(),
                    );
                }
                if entry
                    .link_name()
                    .map_err(|e| format!("Corrupt archive entry: {e}"))?
                    .is_some()
                {
                    return Err(format!(
                        "Archive contains a symlink/hardlink, refusing: {}",
                        path.display()
                    ));
                }
                let rel = path
                    .strip_prefix(FILES_DIR)
                    .map_err(|e| format!("Corrupt archive entry path {}: {e}", path.display()))?;
                if rel.as_os_str().is_empty() {
                    continue;
                }
                let target = safe_join(dest, rel)?;
                let header_type = entry.header().entry_type();
                if header_type.is_dir() {
                    fs::create_dir_all(&target)
                        .map_err(|e| format!("Failed to create {}: {e}", target.display()))?;
                } else if header_type.is_file() {
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
                    }
                    let mut out = fs::File::create(&target)
                        .map_err(|e| format!("Failed to create {}: {e}", target.display()))?;
                    std::io::copy(&mut entry, &mut out)
                        .map_err(|e| format!("Failed to extract {}: {e}", target.display()))?;
                } else {
                    return Err(format!(
                        "Archive entry `{}` is neither a file nor a directory",
                        path.display()
                    ));
                }
            }
            other => {
                return Err(format!("Unexpected entry in archive: `{other}`"));
            }
        }
    }

    let meta = meta.ok_or_else(|| format!("Not a DevWP site archive (missing `{META_FILE}`)"))?;
    Ok(UnpackedSite { meta, dump })
}

// ── Export / import orchestration ─────────────────────────────

/// Export `site` to a `.tar.xz` archive at `dest` (webroot files + database
/// dump + metadata, xz -9e compressed). Requires the mariadb container for
/// the dump. Returns the archive path.
pub fn export_site(
    site: Site,
    dest: PathBuf,
    on_progress: &dyn Fn(&str),
) -> Result<PathBuf, String> {
    validate_site_name(&site.name)?;
    let webroot = get_webroot_from_settings();
    let site_dir = webroot.join(&site.name);
    if !site_dir.is_dir() {
        return Err(format!("Site directory not found: {}", site_dir.display()));
    }

    on_progress("Dumping database…");
    require_containers_running_sync(&[DB_HOST])?;
    let dump = dump_database(&db_name_for(&site.name))?;

    pack_site_archive(&dest, &site, dump.as_deref(), &site_dir, on_progress)?;
    Ok(dest)
}

/// Import a site from a `.tar.xz` archive created by [`export_site`].
/// Restores files into the (current) webroot, the database via the mariadb
/// container's stdin, and rewrites nginx config / hosts entry / TLS cert for
/// the site. Returns the reconstructed site entry.
pub fn import_site(archive: &Path, on_progress: &dyn Fn(&str)) -> Result<Site, String> {
    // Import touches the stack (DB restore, nginx reload) and the webroot;
    // refuse before any mutation while required containers are down.
    require_containers_running_sync(&[DB_HOST, "devwp_nginx"])?;
    let webroot = ensure_webroot_exists()?;

    // Stage the extraction in the webroot (same filesystem, so the final
    // move is an atomic rename) under a dot name that never collides with a
    // real site; it is renamed away on success and removed on failure.
    let staging = webroot.join(format!(
        ".devwp-import-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
    ));
    let result = import_site_staged(archive, &webroot, &staging, on_progress);
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn import_site_staged(
    archive: &Path,
    webroot: &Path,
    staging: &Path,
    on_progress: &dyn Fn(&str),
) -> Result<Site, String> {
    let unpacked = unpack_site_archive(archive, staging, on_progress)?;
    let name = validate_site_name(&unpacked.meta.site.name)?;
    let site_dir = webroot.join(&name);
    if site_dir.exists() || site::site_entry_exists(&name) {
        return Err(format!(
            "A site named `{name}` already exists — delete it before importing"
        ));
    }

    if let Some(dump) = &unpacked.dump {
        on_progress("Restoring database…");
        restore_database(&db_name_for(&name), dump)?;
    }

    on_progress("Moving site files into the webroot…");
    fs::rename(staging, &site_dir)
        .map_err(|e| format!("Failed to move site files into place: {e}"))?;

    on_progress("Writing site configuration…");
    let imported = Site {
        name: name.clone(),
        path: site_dir.to_string_lossy().to_string(),
        url: format!("https://{name}"),
        status: SiteStatus::Active,
        aliases: unpacked.meta.site.aliases.clone(),
        web_root: unpacked.meta.site.web_root.clone(),
        multisite: unpacked.meta.site.multisite.clone(),
    };
    site::generate_nginx_config(
        &name,
        imported.aliases.as_deref(),
        imported.web_root.as_deref(),
        imported.multisite.as_ref(),
    )?;
    site::upsert_site(imported.clone())?;

    // Regenerate TLS certificate (covers the imported domain + aliases), then
    // reload nginx from the same callback — same ordering guarantee as
    // create_site (nginx reads certs at config load only).
    let domains_for_cert = site::collect_domains(&site::get_sites());
    site::run_cert_regen(move || {
        if let Err(e) = site::regenerate_certificate(&domains_for_cert) {
            emit_notification(
                NotificationType::Warning,
                format!("Certificate regeneration failed: {e}"),
            );
        }
        site::nginx_reload();
    });

    if let Err(e) = site::add_hosts_entry(&name, imported.aliases.as_deref()) {
        emit_notification(
            NotificationType::Warning,
            format!(
                "Site imported but hosts entry not added: {e}\nThe site is restored but the domain won't resolve without a hosts entry."
            ),
        );
    }

    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::site::{MultisiteConfig, MultisiteType};
    use std::fs;

    fn sample_site() -> Site {
        Site {
            name: "example.test".to_string(),
            path: "/home/x/www/example.test".to_string(),
            url: "https://example.test".to_string(),
            status: SiteStatus::Active,
            aliases: Some("alias.test".to_string()),
            web_root: Some("public".to_string()),
            multisite: Some(MultisiteConfig {
                enabled: true,
                site_type: MultisiteType::Subdirectory,
            }),
        }
    }

    fn no_progress(_: &str) {}

    /// Append a valid metadata entry to a hand-built test archive.
    fn append_meta_entry<W: Write>(builder: &mut tar::Builder<W>) {
        let meta = SiteArchiveMeta {
            format: ARCHIVE_FORMAT_VERSION,
            site: sample_site(),
            database: false,
        };
        let mut header = tar::Header::new_gnu();
        let bytes = serde_json::to_vec(&meta).expect("serialize");
        header.set_size(bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, META_FILE, std::io::Cursor::new(&bytes))
            .expect("append meta");
    }

    fn write_site_dir(dir: &Path) {
        fs::create_dir_all(dir.join("wp-content/uploads/2026/09")).expect("create dirs");
        fs::write(dir.join("wp-config.php"), "<?php // config\n").expect("write config");
        fs::write(dir.join("wp-content/uploads/2026/09/a.txt"), "nested\n").expect("write nested");
    }

    #[test]
    fn pack_unpack_roundtrips_files_metadata_and_dump() {
        let base = std::env::temp_dir().join("devwp-transfer-roundtrip");
        let _ = fs::remove_dir_all(&base);
        let site_dir = base.join("site");
        write_site_dir(&site_dir);
        let archive = base.join("example.test.tar.xz");
        let dest = base.join("restored");

        pack_site_archive(
            &archive,
            &sample_site(),
            Some("-- fake dump\n"),
            &site_dir,
            &no_progress,
        )
        .expect("pack");
        let unpacked = unpack_site_archive(&archive, &dest, &no_progress).expect("unpack");

        assert_eq!(unpacked.meta.format, ARCHIVE_FORMAT_VERSION);
        assert_eq!(unpacked.meta.site, sample_site());
        assert!(unpacked.meta.database);
        assert_eq!(unpacked.dump.as_deref(), Some("-- fake dump\n"));
        assert_eq!(
            fs::read_to_string(dest.join("wp-config.php")).expect("read config"),
            "<?php // config\n"
        );
        assert_eq!(
            fs::read_to_string(dest.join("wp-content/uploads/2026/09/a.txt")).expect("read nested"),
            "nested\n"
        );

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn pack_without_dump_reports_no_database() {
        let base = std::env::temp_dir().join("devwp-transfer-nodb");
        let _ = fs::remove_dir_all(&base);
        let site_dir = base.join("site");
        fs::create_dir_all(&site_dir).expect("create site dir");
        fs::write(site_dir.join("index.php"), "<?php\n").expect("write index");
        let archive = base.join("no-db.tar.xz");

        pack_site_archive(&archive, &sample_site(), None, &site_dir, &no_progress).expect("pack");
        let unpacked =
            unpack_site_archive(&archive, &base.join("out"), &no_progress).expect("unpack");
        assert!(!unpacked.meta.database);
        assert!(unpacked.dump.is_none());
        assert!(base.join("out/index.php").is_file());

        let _ = fs::remove_dir_all(&base);
    }

    /// Build an archive containing one hand-crafted entry at `entry_path`.
    /// Each call gets its own directory so parallel tests can't delete each
    /// other's archives during cleanup.
    fn malicious_archive(name: &str, entry_path: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("devwp-transfer-malicious-{name}"));
        fs::create_dir_all(&dir).expect("create dir");
        let archive = dir.join(name);
        let mut builder = tar::Builder::new(xz2::write::XzEncoder::new(
            fs::File::create(&archive).expect("create archive"),
            6,
        ));
        // tar-rs refuses `..` via set_path, so write the hostile name straight
        // into the raw GNU header field (append writes the header as-is).
        let mut header = tar::Header::new_gnu();
        {
            let gnu = header.as_gnu_mut().expect("gnu header");
            gnu.name = [0; 100];
            gnu.name[..entry_path.len()].copy_from_slice(entry_path.as_bytes());
        }
        header.set_size(4);
        header.set_mode(0o644);
        header.set_entry_type(tar::EntryType::Regular);
        header.set_cksum();
        builder
            .append(&header, std::io::Cursor::new(b"evil"))
            .expect("append entry");
        builder
            .into_inner()
            .expect("finish")
            .finish()
            .expect("flush");
        archive
    }

    #[test]
    fn unpack_rejects_traversal_entries() {
        let archive = malicious_archive("traversal.tar.xz", "files/../../evil.txt");
        let dest = std::env::temp_dir().join("devwp-transfer-malicious/out-traversal");
        let err =
            unpack_site_archive(&archive, &dest, &no_progress).expect_err("must refuse traversal");
        assert!(err.contains("escapes"), "unexpected error: {err}");
        let _ = fs::remove_dir_all(archive.parent().unwrap());
    }

    #[test]
    fn unpack_rejects_archives_without_metadata() {
        let archive = malicious_archive("no-meta.tar.xz", "files/index.php");
        let dest = std::env::temp_dir().join("devwp-transfer-malicious/out-nometa");
        let err = unpack_site_archive(&archive, &dest, &no_progress)
            .expect_err("must refuse archive without metadata");
        assert!(err.contains("devwp-site.json"), "unexpected error: {err}");
        let _ = fs::remove_dir_all(archive.parent().unwrap());
    }

    #[test]
    fn unpack_rejects_unknown_top_level_entries() {
        let archive = malicious_archive("stray.tar.xz", "stray.txt");
        let dest = std::env::temp_dir().join("devwp-transfer-malicious/out-stray");
        let err = unpack_site_archive(&archive, &dest, &no_progress)
            .expect_err("must refuse stray entries");
        assert!(err.contains("stray.txt"), "unexpected error: {err}");
        let _ = fs::remove_dir_all(archive.parent().unwrap());
    }

    #[test]
    fn unpack_rejects_unexpected_file_types_and_links() {
        let dir = std::env::temp_dir().join("devwp-transfer-links");
        fs::create_dir_all(&dir).expect("create dir");

        // Symlink entry whose link target also traverses, preceded by valid
        // metadata so the refusal comes from the symlink check.
        let archive = dir.join("symlink.tar.xz");
        let mut builder = tar::Builder::new(xz2::write::XzEncoder::new(
            fs::File::create(&archive).expect("create archive"),
            6,
        ));
        append_meta_entry(&mut builder);
        let mut header = tar::Header::new_gnu();
        header.set_size(0);
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_cksum();
        builder
            .append_link(&mut header, "files/wp-config.php", "../../etc/passwd")
            .expect("append link");
        builder
            .into_inner()
            .expect("finish")
            .finish()
            .expect("flush");

        let err =
            unpack_site_archive(&archive, &dir.join("out"), &no_progress).expect_err("must refuse");
        assert!(err.contains("symlink"), "unexpected error: {err}");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unpack_rejects_unknown_format_version() {
        let dir = std::env::temp_dir().join("devwp-transfer-version");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create dir");
        let meta = SiteArchiveMeta {
            format: 99,
            site: sample_site(),
            database: false,
        };
        let archive = dir.join("future.tar.xz");
        let mut builder = tar::Builder::new(xz2::write::XzEncoder::new(
            fs::File::create(&archive).expect("create archive"),
            6,
        ));
        let mut header = tar::Header::new_gnu();
        let bytes = serde_json::to_vec(&meta).expect("serialize");
        header.set_size(bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, META_FILE, std::io::Cursor::new(&bytes))
            .expect("append meta");
        builder
            .into_inner()
            .expect("finish")
            .finish()
            .expect("flush");

        let err =
            unpack_site_archive(&archive, &dir.join("out"), &no_progress).expect_err("must refuse");
        assert!(err.contains("format version"), "unexpected error: {err}");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn safe_join_refuses_absolute_and_parent_paths() {
        let root = Path::new("/tmp/root");
        assert_eq!(safe_join(root, Path::new("a/b")).unwrap(), root.join("a/b"));
        assert_eq!(safe_join(root, Path::new("./a")).unwrap(), root.join("a"));
        assert!(safe_join(root, Path::new("/etc")).is_err());
        assert!(safe_join(root, Path::new("a/../../b")).is_err());
    }
}
