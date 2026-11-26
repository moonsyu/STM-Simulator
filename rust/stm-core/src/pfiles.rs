//! CubeMX › Project Manager › Code Generator › "Generate peripheral initialization as a pair of '.c/.h' files per
//! peripheral": gpio.c/.h, i2c.c/.h, usart.c/.h … hold the handles and the MX_*_Init functions, and main.c includes
//! the headers. The pairs are cut out of the one-file main.c the generator writes (`halgen.rs`), so both forms always
//! carry the same initialisation.
//!
//! The pairs are generated files (read only, like stm32xxxx_it.c): they are not stored in the project. A build adds
//! them when a project source includes one of their headers — the Pinout option on, or a main.c pasted from a CubeIDE
//! project that was generated this way.
//!
//! Moved here from `src/peripheral-files.js`, with `generateHal` of `src/mcu-config.js` (feature 62).

use crate::explorer::cube_header;
use crate::halgen::generate_main;
use crate::js_re;
use crate::jsre::re;
use crate::mcuconfig::{config_problems, validate_mcu};
use crate::periph::js_truthy;
use serde_json::{json, Value};

js_re!(HANDLE, r"^(\w+)_HandleTypeDef (\w+);$");
js_re!(PROTOTYPE, r"^static void (MX_\w+_Init)\(void\);$");
js_re!(DEFINITION, r"^static void (MX_\w+_Init)\(void\) \{$");
js_re!(INIT_ID, r"^MX_([A-Z0-9]+?)\d*_");
js_re!(BLOCK_COMMENT, r"/\*[\s\S]*?\*/");
js_re!(LINE_COMMENT, r"//[^\n]*");
js_re!(SOURCE_NAME, r"(?i)\.(c|h|cpp|hpp|cc)$");
js_re!(
    PAIR_INCLUDE,
    r#"(?m)^[ \t]*#[ \t]*include[ \t]*"(?:[\w./-]*/)?(?:gpio|usart|i2c|spi|tim|adc|dac|dma|rtc|iwdg|wwdg|sdio|dcmi)\.h""#
);
js_re!(INIT_OF_PAIR, r"(?m)^void (MX_\w+_Init)\(void\) \{$");

/// File names as CubeMX writes them: one pair per kind of peripheral (usart.c holds every USART and UART).
fn group_of_init(name: &str) -> String {
    let id = INIT_ID
        .captures(name)
        .map_or("", |m| m.get(1).unwrap().as_str());
    match id {
        "USART" | "UART" => "usart".into(),
        "SDIO" => "sdio".into(),
        other => other.to_lowercase(),
    }
}
fn group_of_handle(kind: &str) -> String {
    match kind {
        "USART" | "UART" => "usart".into(),
        "SD" => "sdio".into(),
        other => other.to_lowercase(),
    }
}
const ORDER: [&str; 13] = [
    "adc", "dac", "dcmi", "dma", "i2c", "iwdg", "rtc", "sdio", "spi", "tim", "usart", "wwdg",
    "gpio",
];
/// The header CubeMX writes on top of each pair (feature 56).
fn note(file: &str) -> String {
    let name = &file[..file.len() - 2];
    let brief = if file.ends_with(".h") {
        format!("This file contains all the function prototypes for\nthe {name}.c file")
    } else if name == "gpio" {
        "This file provides code for the configuration\nof all used GPIO pins.".to_string()
    } else {
        format!(
            "This file provides code for the configuration\nof the {} instances.",
            name.to_uppercase()
        )
    };
    cube_header(file, &brief)
}

#[derive(Default)]
struct Group {
    handles: Vec<(String, String)>,
    functions: Vec<(String, Vec<String>)>,
}
/// A generated file: its name and text.
pub type File = (String, String);

/// One-file main.c text → the main.c that includes the pairs, and the pairs (`i2c.h`, `i2c.c`, …).
pub fn split_main(text: &str) -> Result<(String, Vec<File>), String> {
    // Groups in the order they first came.
    let mut groups: Vec<(String, Group)> = Vec::new();
    fn group(groups: &mut Vec<(String, Group)>, key: String) -> &mut Group {
        if let Some(at) = groups.iter().position(|(name, _)| *name == key) {
            return &mut groups[at].1;
        }
        groups.push((key, Group::default()));
        &mut groups.last_mut().unwrap().1
    }
    let lines: Vec<&str> = text.split('\n').collect();
    let pv = lines
        .iter()
        .position(|line| *line == "/* USER CODE BEGIN PV */");
    let mut kept: Vec<String> = Vec::new();
    let mut dma = false;
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if let Some(m) = HANDLE
            .captures(line)
            .filter(|_| pv.is_some_and(|pv| i < pv))
        {
            group(&mut groups, group_of_handle(&m[1]))
                .handles
                .push((m[1].to_string(), m[2].to_string()));
            if &m[1] == "DMA" {
                dma = true;
            }
            i += 1;
            continue;
        }
        if PROTOTYPE.is_match(line) {
            i += 1;
            continue;
        }
        if let Some(m) = DEFINITION.captures(line) {
            let name = m[1].to_string();
            let end = (i..lines.len())
                .find(|&k| lines[k] == "}")
                .ok_or_else(|| format!("생성 코드의 {name} 끝을 찾지 못했습니다."))?;
            let body = lines[i + 1..end].iter().map(|s| s.to_string()).collect();
            group(&mut groups, group_of_init(&name))
                .functions
                .push((name, body));
            i = end;
            // One blank line between what is left.
            if kept.last().is_some_and(String::is_empty) && lines.get(i + 1) == Some(&"") {
                i += 1;
            }
            i += 1;
            continue;
        }
        kept.push(line.to_string());
        i += 1;
    }
    let rank = |name: &str| {
        ORDER
            .iter()
            .position(|o| *o == name)
            .map_or(99, |at| at + 1)
    };
    let mut names: Vec<String> = groups.iter().map(|(name, _)| name.clone()).collect();
    names.sort_by(|a, b| rank(a).cmp(&rank(b)).then_with(|| a.cmp(b)));
    let at = kept
        .iter()
        .position(|line| line == "#include \"main.h\"")
        .ok_or("생성 코드에 main.h 포함이 없습니다.")?;
    for (k, name) in names.iter().enumerate() {
        kept.insert(at + 1 + k, format!("#include \"{name}.h\""));
    }
    let mut files: Vec<File> = Vec::new();
    for name in &names {
        let g = &groups.iter().find(|(n, _)| n == name).unwrap().1;
        let guard = format!("__{}_H__", name.to_uppercase());
        let mut header: Vec<String> = vec![
            note(&format!("{name}.h")),
            format!("#ifndef {guard}"),
            format!("#define {guard}"),
            String::new(),
            "#include \"main.h\"".into(),
            String::new(),
            "/* USER CODE BEGIN Includes */".into(),
            "/* USER CODE END Includes */".into(),
            String::new(),
        ];
        header.extend(
            g.handles
                .iter()
                .map(|(kind, h)| format!("extern {kind}_HandleTypeDef {h};")),
        );
        if !g.handles.is_empty() {
            header.push(String::new());
        }
        header.extend(
            [
                "/* USER CODE BEGIN Private defines */",
                "/* USER CODE END Private defines */",
                "",
            ]
            .map(String::from),
        );
        header.extend(g.functions.iter().map(|(f, _)| format!("void {f}(void);")));
        header.extend(
            [
                "",
                "/* USER CODE BEGIN Prototypes */",
                "/* USER CODE END Prototypes */",
                "",
            ]
            .map(String::from),
        );
        header.push(format!("#endif /* {guard} */"));
        header.push(String::new());
        // A peripheral with a DMA request links its handle (kept in dma.c) inside its init function.
        let mut source: Vec<String> =
            vec![note(&format!("{name}.c")), format!("#include \"{name}.h\"")];
        if dma && name != "dma" {
            source.push("#include \"dma.h\"".into());
        }
        source
            .extend(["", "/* USER CODE BEGIN 0 */", "/* USER CODE END 0 */", ""].map(String::from));
        source.extend(
            g.handles
                .iter()
                .map(|(kind, h)| format!("{kind}_HandleTypeDef {h};")),
        );
        for (f, body) in &g.functions {
            let tag = f.strip_prefix("MX_").unwrap_or(f);
            let tag = tag.strip_suffix("_Init").unwrap_or(tag);
            source.push(String::new());
            source.push(format!("void {f}(void) {{"));
            source.push(format!("  /* USER CODE BEGIN {tag}_Init 0 */"));
            source.push(String::new());
            source.push(format!("  /* USER CODE END {tag}_Init 0 */"));
            source.extend(body.iter().cloned());
            source.push(format!("  /* USER CODE BEGIN {tag}_Init 2 */"));
            source.push(String::new());
            source.push(format!("  /* USER CODE END {tag}_Init 2 */"));
            source.push("}".into());
        }
        source
            .extend(["", "/* USER CODE BEGIN 1 */", "/* USER CODE END 1 */", ""].map(String::from));
        files.push((format!("{name}.h"), header.join("\n")));
        files.push((format!("{name}.c"), source.join("\n")));
    }
    Ok((kept.join("\n"), files))
}
/// The pairs for a Pinout configuration.
pub fn peripheral_files(
    config: &Value,
    minimal: bool,
    legacy_gpio: bool,
) -> Result<Vec<File>, String> {
    Ok(split_main(&generate_main(config, minimal, legacy_gpio)?)?.1)
}
/// main.c for a Pinout configuration with the option on.
pub fn generate_split_main(
    config: &Value,
    minimal: bool,
    legacy_gpio: bool,
) -> Result<String, String> {
    Ok(split_main(&generate_main(config, minimal, legacy_gpio)?)?.0)
}
/// The main.c of a project's settings: checked first (the problems are the error), split when the settings ask for
/// a pair of files per peripheral.
pub fn generate_hal(config: &Value, minimal: bool, legacy_gpio: bool) -> Result<String, String> {
    let clean = validate_mcu(config)?;
    let errors = config_problems(&clean)?;
    if !errors.is_empty() {
        return Err(errors.join("\n"));
    }
    let text = generate_main(&clean, minimal, legacy_gpio)?;
    if clean.get("coupleFiles").is_some_and(js_truthy) && !minimal {
        Ok(split_main(&text)?.0)
    } else {
        Ok(text)
    }
}

fn base_name(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}
/// The generated pairs a build of this project adds: none unless a project source includes one of their headers; a
/// pair is left out when the project has a file of that name or already defines one of its init functions.
/// `project`: `{code, mcu, firmware: {mode, files}}`.
pub fn generated_sources(project: &Value) -> Vec<File> {
    let firmware = project.get("firmware");
    let hal = firmware.and_then(|f| f.get("mode")) == Some(&json!("hal"));
    let Some(mcu) = project.get("mcu").filter(|m| hal && js_truthy(m)) else {
        return Vec::new();
    };
    let text_of =
        |f: &Value, key: &str| f.get(key).and_then(Value::as_str).unwrap_or("").to_string();
    let mut sources: Vec<File> = vec![("main.c".into(), text_of(project, "code"))];
    for f in firmware
        .and_then(|f| f.get("files"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        sources.push((text_of(f, "name"), text_of(f, "text")));
    }
    sources.retain(|(name, _)| SOURCE_NAME.is_match(name));
    let joined = sources
        .iter()
        .map(|(_, text)| text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let text = LINE_COMMENT
        .replace_all(&BLOCK_COMMENT.replace_all(&joined, " "), " ")
        .into_owned();
    if !PAIR_INCLUDE.is_match(&text) {
        return Vec::new();
    }
    let Ok(files) = peripheral_files(mcu, false, false) else {
        return Vec::new();
    };
    let own: Vec<String> = sources
        .iter()
        .map(|(name, _)| base_name(name).to_lowercase())
        .collect();
    let included = |name: &str| {
        re(&format!(
            r#"(?m)^[ \t]*#[ \t]*include[ \t]*"(?:[\w./-]*/)?{name}\.h""#
        ))
        .is_match(&text)
    };
    let defines =
        |name: &str| re(&format!(r"\b{name}\s*\(\s*(?:void)?\s*\)\s*\{{")).is_match(&text);
    let mut out = Vec::new();
    for pair in files.chunks(2) {
        let [header, source] = pair else { continue };
        let name = &header.0[..header.0.len() - 2];
        // Only what the project asks for by including it (dma.h is pulled in by the pairs that use it).
        if !included(name) && name != "dma" {
            continue;
        }
        if !own.contains(&header.0) {
            out.push(header.clone());
        }
        let inits = INIT_OF_PAIR
            .captures_iter(&source.1)
            .any(|m| defines(&m[1]));
        if !own.contains(&source.0) && !inits {
            out.push(source.clone());
        }
    }
    out
}

fn files_json(files: Vec<File>) -> Value {
    Value::Array(
        files
            .into_iter()
            .map(|(name, text)| json!({"name": name, "text": text}))
            .collect(),
    )
}
/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let on = |i: usize| args.get(i).is_some_and(js_truthy);
    Some(match name {
        // [text] → {main, files: [{name, text}]}
        "split_main" => split_main(v(0).as_str().unwrap_or(""))
            .map(|(main, files)| json!({"main": main, "files": files_json(files)})),
        // [config, minimal, legacyGpio]
        "peripheral_files" => peripheral_files(v(0), on(1), on(2)).map(files_json),
        "generate_split_main" => generate_split_main(v(0), on(1), on(2)).map(|text| json!(text)),
        "generate_hal" => generate_hal(v(0), on(1), on(2)).map(|text| json!(text)),
        // [{code, mcu, firmware}] → [{name, text}]
        "generated_sources" => Ok(files_json(generated_sources(v(0)))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Value {
        json!({
            "family": "STM32F446RE",
            "pins": {"PA5": {"function": "GPIO_Output", "pull": "NOPULL", "edge": "RISING", "label": "", "initial": 0}, "PA2": {"function": "USART2_TX", "pull": "NOPULL", "edge": "RISING", "label": "", "initial": 0}, "PA3": {"function": "USART2_RX", "pull": "NOPULL", "edge": "RISING", "label": "", "initial": 0}},
            "peripherals": {"USART2": {"enabled": true, "baud": 115200}},
            "nvic": {}, "timerClockHz": 16000000, "coupleFiles": true,
        })
    }

    #[test]
    fn pairs_of_a_project() {
        assert_eq!(group_of_init("MX_USART2_UART_Init"), "usart");
        assert_eq!(group_of_init("MX_I2C1_Init"), "i2c");
        assert_eq!(group_of_init("MX_TIM10_Init"), "tim");
        assert_eq!(group_of_init("MX_SDIO_SD_Init"), "sdio");
        assert_eq!(group_of_init("MX_GPIO_Init"), "gpio");
        let one = generate_main(&config(), false, false).unwrap();
        let (main, files) = split_main(&one).unwrap();
        assert_eq!(
            files.iter().map(|f| f.0.as_str()).collect::<Vec<_>>(),
            ["usart.h", "usart.c", "gpio.h", "gpio.c"]
        );
        assert!(main.contains("#include \"main.h\"\n#include \"usart.h\"\n#include \"gpio.h\"\n"));
        assert!(
            !main.contains("static void MX_GPIO_Init")
                && !main.contains("UART_HandleTypeDef huart2;")
        );
        assert!(main.contains("  MX_USART2_UART_Init();"));
        assert!(
            files[0].1.contains("extern UART_HandleTypeDef huart2;\n")
                && files[0].1.contains("void MX_USART2_UART_Init(void);\n")
        );
        assert!(files[1].1.contains("UART_HandleTypeDef huart2;\n\nvoid MX_USART2_UART_Init(void) {\n  /* USER CODE BEGIN USART2_UART_Init 0 */\n"));
        assert_eq!(generate_hal(&config(), false, false).unwrap(), main);
        let mut bad = config();
        bad["pins"]["PA13"] = json!({"function": "GPIO_Output", "pull": "NOPULL", "edge": "RISING", "label": "", "initial": 0});
        assert!(generate_hal(&bad, false, false)
            .unwrap_err()
            .starts_with("PA13: SWD 디버그 핀"));
    }

    #[test]
    fn what_a_build_adds() {
        let project = |code: &str, files: Value| json!({"code": code, "mcu": config(), "firmware": {"mode": "hal", "files": files}});
        assert!(generated_sources(&project("int main(void){}", json!([]))).is_empty());
        assert!(generated_sources(&project("// #include \"gpio.h\"\n", json!([]))).is_empty());
        let names = |p: &Value| {
            generated_sources(p)
                .into_iter()
                .map(|f| f.0)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            names(&project(
                "#include \"gpio.h\"\n#include \"Core/Inc/usart.h\"\n",
                json!([])
            )),
            ["usart.h", "usart.c", "gpio.h", "gpio.c"]
        );
        assert_eq!(
            names(&project(
                "#include \"gpio.h\"\n",
                json!([{"name": "Core/Src/GPIO.c", "text": ""}])
            )),
            ["gpio.h"]
        );
        assert_eq!(
            names(&project(
                "#include \"gpio.h\"\nvoid MX_GPIO_Init(void) {}\n",
                json!([])
            )),
            ["gpio.h"]
        );
        assert!(generated_sources(
            &json!({"code": "#include \"gpio.h\"", "mcu": config(), "firmware": {"mode": "sketch"}})
        )
        .is_empty());
    }
}
