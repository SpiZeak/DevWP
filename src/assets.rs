//! Embedded application assets.
//!
//! Assets are served through dioxus-desktop's own `dioxus://` scheme under the
//! `/assets/*` path (via `use_asset_handler`), so the webview loads them
//! same-origin. Keeping everything embedded (instead of relying on filesystem
//! layout next to the executable) makes `cargo run` and every packaged bundle
//! behave identically. Fonts are the full static MonaspaceNeon NF set (~52 MB);
//! switching to the variable font later would shrink the binary a lot.

use dioxus::desktop::wry::http::{Request, Response};
use dioxus::desktop::RequestAsyncResponder;
use std::borrow::Cow;

pub static STYLE_CSS: &str = include_str!("assets/style.css");
pub static ICON_PNG: &[u8] = include_bytes!("assets/icon_32.png");

fn font_bytes(name: &str) -> Option<&'static [u8]> {
    match name {
        "MonaspaceNeonNF-Regular.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Regular.woff2"))
        }
        "MonaspaceNeonNF-Medium.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Medium.woff2"))
        }
        "MonaspaceNeonNF-SemiBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiBold.woff2"
        )),
        "MonaspaceNeonNF-Bold.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Bold.woff2"))
        }
        _ => None,
    }
}

/// Build a response for a request path, or `None` when the path is unknown.
/// Paths look like `/assets/style.css` and `/assets/fonts/…` (the latter are
/// the relative font URLs inside the stylesheet).
fn response_for_path(path: &str) -> Option<Response<Cow<'static, [u8]>>> {
    let rel = path.strip_prefix('/').unwrap_or(path);
    let rel = rel.strip_prefix("assets/").unwrap_or(rel);
    let rel = percent_decode(rel);

    let (mime, bytes): (&'static str, Cow<'static, [u8]>) = match rel.as_str() {
        "style.css" => (
            "text/css; charset=utf-8",
            Cow::Borrowed(STYLE_CSS.as_bytes()),
        ),
        path if path.starts_with("fonts/") => {
            let name = &path["fonts/".len()..];
            ("font/woff2", Cow::Borrowed(font_bytes(name)?))
        }
        _ => return None,
    };

    Response::builder()
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .ok()
}

/// Handle a request for a `/assets/*` path on the dioxus scheme.
pub fn handle_asset_request(request: Request<Vec<u8>>, responder: RequestAsyncResponder) {
    tracing::debug!(uri = %request.uri(), "serving embedded asset");
    let response = response_for_path(request.uri().path()).unwrap_or_else(|| {
        Response::builder()
            .status(404)
            .body(Cow::Borrowed(b"Not Found".as_slice()))
            .unwrap()
    });
    responder.respond(response);
}

/// Minimal percent-decoding for asset URLs (enough for our fixed paths).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
