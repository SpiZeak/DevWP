use dioxus::prelude::*;

#[component]
pub fn Toggle(
    #[props(optional)] checked: Option<bool>,
    #[props(optional)] title: Option<&'static str>,
    #[props(optional)] onchange: Option<EventHandler<bool>>,
    #[props(optional)] class: Option<&'static str>,
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
                class: "peer after:top-[2px] after:absolute relative bg-raised after:bg-seasalt peer-checked:bg-accent rounded-full after:rounded-full peer-focus:outline-none w-11 after:w-5 h-6 after:h-5 after:content-[''] after:transition-all rtl:peer-checked:after:-translate-x-full peer-checked:after:translate-x-full after:start-[2px]",
            }
        }
    }
}
