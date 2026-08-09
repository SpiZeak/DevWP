//! Embedded application assets served through the `devwp://` custom scheme.
//!
//! Keeping assets embedded (instead of relying on filesystem layout next to
//! the executable) makes `cargo run` and every packaged bundle behave
//! identically. Fonts are the full static MonaspaceNeon NF set (~52 MB);
//! switching to the variable font later would shrink the binary a lot.

use dioxus::desktop::wry::http::{Request, Response};
use std::borrow::Cow;

pub static STYLE_CSS: &str = include_str!("assets/style.css");
pub static ICON_PNG: &[u8] = include_bytes!("assets/icon_32.png");

fn font_bytes(name: &str) -> Option<&'static [u8]> {
    match name {
        "MonaspaceNeonNF-Bold.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Bold.woff2"))
        }
        "MonaspaceNeonNF-BoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-BoldItalic.woff2"
        )),
        "MonaspaceNeonNF-ExtraBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-ExtraBold.woff2"
        )),
        "MonaspaceNeonNF-ExtraBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-ExtraBoldItalic.woff2"
        )),
        "MonaspaceNeonNF-ExtraLight.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-ExtraLight.woff2"
        )),
        "MonaspaceNeonNF-ExtraLightItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-ExtraLightItalic.woff2"
        )),
        "MonaspaceNeonNF-Italic.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Italic.woff2"))
        }
        "MonaspaceNeonNF-Light.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Light.woff2"))
        }
        "MonaspaceNeonNF-LightItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-LightItalic.woff2"
        )),
        "MonaspaceNeonNF-Medium.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Medium.woff2"))
        }
        "MonaspaceNeonNF-MediumItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-MediumItalic.woff2"
        )),
        "MonaspaceNeonNF-Regular.woff2" => {
            Some(include_bytes!("assets/fonts/MonaspaceNeonNF-Regular.woff2"))
        }
        "MonaspaceNeonNF-SemiBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiBold.woff2"
        )),
        "MonaspaceNeonNF-SemiBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiBoldItalic.woff2"
        )),
        "MonaspaceNeonNF-SemiWideBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideBold.woff2"
        )),
        "MonaspaceNeonNF-SemiWideBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideBoldItalic.woff2"
        )),
        "MonaspaceNeonNF-SemiWideExtraBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideExtraBold.woff2"
        )),
        "MonaspaceNeonNF-SemiWideExtraBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideExtraBoldItalic.woff2"
        )),
        "MonaspaceNeonNF-SemiWideExtraLight.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideExtraLight.woff2"
        )),
        "MonaspaceNeonNF-SemiWideExtraLightItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideExtraLightItalic.woff2"
        )),
        "MonaspaceNeonNF-SemiWideItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideItalic.woff2"
        )),
        "MonaspaceNeonNF-SemiWideLight.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideLight.woff2"
        )),
        "MonaspaceNeonNF-SemiWideLightItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideLightItalic.woff2"
        )),
        "MonaspaceNeonNF-SemiWideMedium.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideMedium.woff2"
        )),
        "MonaspaceNeonNF-SemiWideMediumItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideMediumItalic.woff2"
        )),
        "MonaspaceNeonNF-SemiWideRegular.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideRegular.woff2"
        )),
        "MonaspaceNeonNF-SemiWideSemiBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideSemiBold.woff2"
        )),
        "MonaspaceNeonNF-SemiWideSemiBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-SemiWideSemiBoldItalic.woff2"
        )),
        "MonaspaceNeonNF-WideBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideBold.woff2"
        )),
        "MonaspaceNeonNF-WideBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideBoldItalic.woff2"
        )),
        "MonaspaceNeonNF-WideExtraBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideExtraBold.woff2"
        )),
        "MonaspaceNeonNF-WideExtraBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideExtraBoldItalic.woff2"
        )),
        "MonaspaceNeonNF-WideExtraLight.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideExtraLight.woff2"
        )),
        "MonaspaceNeonNF-WideExtraLightItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideExtraLightItalic.woff2"
        )),
        "MonaspaceNeonNF-WideItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideItalic.woff2"
        )),
        "MonaspaceNeonNF-WideLight.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideLight.woff2"
        )),
        "MonaspaceNeonNF-WideLightItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideLightItalic.woff2"
        )),
        "MonaspaceNeonNF-WideMedium.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideMedium.woff2"
        )),
        "MonaspaceNeonNF-WideMediumItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideMediumItalic.woff2"
        )),
        "MonaspaceNeonNF-WideRegular.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideRegular.woff2"
        )),
        "MonaspaceNeonNF-WideSemiBold.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideSemiBold.woff2"
        )),
        "MonaspaceNeonNF-WideSemiBoldItalic.woff2" => Some(include_bytes!(
            "assets/fonts/MonaspaceNeonNF-WideSemiBoldItalic.woff2"
        )),
        _ => None,
    }
}

/// Serve a request for the `devwp://` scheme. URLs look like
/// `devwp:///assets/style.css` and relative font urls inside the CSS
/// resolve to `devwp:///assets/fonts/…`.
pub fn serve(request: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let path = request.uri().path();
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
            match font_bytes(name) {
                Some(bytes) => ("font/woff2", Cow::Borrowed(bytes)),
                None => return not_found(),
            }
        }
        _ => return not_found(),
    };

    Response::builder()
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .unwrap_or_else(|_| not_found())
}

fn not_found() -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(404)
        .body(Cow::Borrowed(b"Not Found".as_slice()))
        .unwrap()
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
