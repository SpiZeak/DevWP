use dioxus::prelude::*;

#[component]
pub fn Toggle(
    #[props(optional)] checked: Option<bool>,
    #[props(optional)] title: Option<String>,
    #[props(optional)] onchange: Option<EventHandler<bool>>,
    #[props(optional)] class: Option<String>,
    #[props(optional)] disabled: Option<bool>,
) -> Element {
    let disabled = disabled.unwrap_or(false);
    let checked = checked.unwrap_or(false);
    let label_class = format!(
        "inline-flex items-center {} {}",
        if disabled {
            "cursor-not-allowed opacity-60"
        } else {
            "cursor-pointer"
        },
        class.unwrap_or_default()
    );
    let input_class = if disabled {
        "sr-only peer pointer-events-none"
    } else {
        "sr-only peer"
    };
    rsx! {
        label { class: {label_class}, title: title.unwrap_or_default(),
            input {
                class: {input_class},
                "type": "checkbox",
                checked: checked,
                disabled: disabled,
                onchange: move |ev: FormEvent| {
                    if let Some(onchange) = onchange {
                        onchange.call(ev.checked());
                    }
                },
            }
            div {
                "aria-hidden": "true",
                class: "peer after:top-[2px] after:absolute relative bg-emerald-700 after:bg-seasalt peer-checked:bg-amber-600 after:border after:border-emerald-600 peer-checked:after:border-seasalt rounded-full after:rounded-full peer-focus:outline-none peer-focus:ring-amber-800 w-11 after:w-5 h-6 after:h-5 after:content-[''] after:transition-all rtl:peer-checked:after:-translate-x-full peer-checked:after:translate-x-full after:start-[2px]",
            }
        }
    }
}
