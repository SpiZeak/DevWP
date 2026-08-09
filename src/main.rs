#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use dioxus::desktop::{Config, LogicalSize, WindowBuilder, WindowCloseBehaviour};
use tracing::Level;

fn main() {
    // Disable WebKit's use of DMA-BUF on Linux to prevent rendering issues in apps using Nvidia drivers.
    #[cfg(target_os = "linux")]
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let _ = dioxus::logger::init(Level::INFO);

    let window_builder = WindowBuilder::new()
        .with_title("DevWP")
        .with_inner_size(LogicalSize::new(1200.0, 800.0))
        .with_min_inner_size(LogicalSize::new(800.0, 600.0));

    let icon = dioxus::desktop::icon_from_memory(devwp::assets::ICON_PNG).ok();

    // Close requests are intercepted in the UI (compose-down first), so start
    // in "hide" mode and let the shutdown handler switch to closing when done.
    let config = Config::new()
        .with_window(window_builder)
        .with_close_behaviour(WindowCloseBehaviour::WindowHides);
    let config = match icon {
        Some(icon) => config.with_icon(icon),
        None => config,
    };

    dioxus::LaunchBuilder::new()
        .with_cfg(config)
        .launch(devwp::app::app);
}
