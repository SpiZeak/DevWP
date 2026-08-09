use dioxus::prelude::*;

#[component]
pub fn FormInput(
    label: String,
    value: String,
    onchange: EventHandler<String>,
    placeholder: String,
    #[props(optional)] autofocus: Option<bool>,
    #[props(optional)] help_text: Option<Element>,
    #[props(optional)] input_type: Option<String>,
    #[props(optional)] id: Option<String>,
) -> Element {
    let input_id = id.unwrap_or_else(|| {
        format!(
            "input-{}",
            label.to_lowercase().replace(char::is_whitespace, "-")
        )
    });
    let input_type = input_type.unwrap_or_else(|| "text".to_string());
    rsx! {
        div { class: "mb-5",
            label { class: "block mb-1 text-sm", "for": {input_id.clone()}, {label} }
            input {
                id: {input_id.clone()},
                "type": {input_type},
                value: {value},
                class: "bg-gunmetal-400 p-2 border border-gunmetal-500 focus:border-pumpkin rounded focus:outline-none focus:ring-1 focus:ring-pumpkin w-full text-seasalt transition-colors",
                placeholder: {placeholder},
                autofocus: autofocus.unwrap_or(false),
                oninput: move |ev| onchange.call(ev.value()),
            }
            { help_text }
        }
    }
}
