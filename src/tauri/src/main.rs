#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Disable WebKit's use of DMA-BUF on Linux to prevent rendering issues in Tauri apps using Nvidia drivers.
    #[cfg(target_os = "linux")]
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    devwp_lib::run();
}
