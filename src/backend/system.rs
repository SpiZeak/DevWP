use crate::backend::utils::open_target;

pub fn open_external(url: &str) -> Result<(), String> {
    open_target(url)
}

pub fn open_directory(path: &str) -> Result<(), String> {
    open_target(path)
}
