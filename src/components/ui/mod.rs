pub mod form_input;
pub mod icon;
pub mod modal_base;
pub mod spinner;
pub mod toggle;

pub use form_input::FormInput;
pub use icon::Icon;
pub use modal_base::ModalBase;
pub use spinner::Spinner;
pub use toggle::Toggle;

use dioxus::prelude::*;

/// Component-local state that can be mutated from spawned tasks (timers).
pub fn use_sync_signal<T: Send + Sync + 'static>(initial: T) -> SyncSignal<T> {
    use_hook(move || SyncSignal::new_maybe_sync(initial))
}
