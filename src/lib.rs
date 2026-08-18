// `unused_braces` fires on Dioxus RSX expression children, where braces are
// required to distinguish them from attributes; `clone_on_copy` is pervasive
// because dioxus signals are Copy handles cloned for closures.
#![allow(unused_braces, clippy::clone_on_copy)]

pub mod app;
pub mod assets;
pub mod backend;
pub mod cli;
pub mod components;
pub mod state;

pub use app::app;
