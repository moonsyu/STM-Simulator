//! What the editor does to a whole project: main.c and the board's settings back to how a new project starts,
//! bringing in a CubeIDE project's files (.ioc, sources, startup code, linker script), the first circuit a Pinout
//! suggests, and the USB descriptor source an FSP project with the USB stack gets.
//!
//! Moved here from `src/code-reset.js`, `src/board-reset.js`, `src/firmware-import.js`, `src/ioc-circuit.js` and
//! `src/ra-usb-descriptor.js` (feature 62). The projects come exactly as the JavaScript side has them.

use crate::csedit::{
    base_name, folder_of, name_clash, normalize_text, MAX_SOURCE_BYTES, MAX_SOURCE_FILES,
    SOURCE_PATH,
};
use crate::js_re;
use crate::project::{
    as_json, blank_project, board, entries, get, raw, text, undefined, units, validate_project,
    BROKEN,
};
use crate::raconfig::{num, show, there, truthy};
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

type R<T> = Result<T, String>;

/// `structuredClone(project)` of something a property can be set on. (A list takes properties too, and none of
/// them is a project's: it is refused by the check as an empty object is.)
fn copy(project: &Value) -> R<Map<String, Value>> {
    match project {
        Value::Object(o) if there(Some(project)).is_some() && num(project).is_none() => {
            Ok(o.clone())
        }
        Value::Array(_) => Ok(Map::new()),
        _ => Err(BROKEN.into()),
    }
}
fn expand(source: &str) -> String {
    crate::cformat::format_code(source, 4.0, None).0
}
fn generate(mcu: Option<&Value>, minimal: bool) -> R<String> {
    crate::pfiles::generate_hal(&mcu.map_or(Value::Null, as_json), minimal, false)
}

// ---------- main.c and the board's settings as a new project has them ----------

/// The project with main.c as its kind of project starts: e² studio's empty hal_entry() for FSP, an empty sketch,
/// an empty host program, or the code generated from the Pinout (with the generated _write / _read when USART2 is
/// on, so printf / scanf go to the ST-LINK virtual COM port as in a new project).
pub fn reset_main_code(original: &Value) -> R<Value> {
    let mut project = copy(original)?;
    let mode = get(original, "firmware").and_then(|f| text(get(f, "mode")));
    let host = get(original, "ide")
        .and_then(|i| get(i, "native"))
        .and_then(|n| text(get(n, "target")))
        == Some("host");
    let code = if mode == Some("fsp") {
        crate::ragen::hal_entry(false)
    } else if mode != Some("hal") {
        "void setup() {\n}\n\nvoid loop() {\n}\n".to_string()
    } else if host {
        "int main(void) {\n    return 0;\n}\n".to_string()
    } else {
        let mcu = get(original, "mcu");
        let mut code = generate(mcu, true)?;
        let uart = mcu
            .and_then(|m| get(m, "peripherals"))
            .and_then(|p| get(p, "USART2"));
        if crate::halgen::stdio_uart(
            &json!({"peripherals": {"USART2": uart.map_or(Value::Null, as_json)}}),
        ) {
            // The minimal code has no stdio functions.
            let full = crate::csedit::c_functions(&generate(mcu, false)?)?
                .iter()
                .filter(|f| f["name"] == "_write" || f["name"] == "_read")
                .filter_map(|f| f["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n\n");
            if let (false, Some(at)) = (full.is_empty(), code.find("/* USER CODE BEGIN 4 */")) {
                code.insert_str(at, &format!("{full}\n\n"));
            }
        }
        expand(&code)
    };
    project.insert("code".into(), json!(code));
    // A later Docs apply starts from the selected device, not all previous examples.
    project.shift_remove("deviceDocs");
    if let Some(points) = get(original, "ide")
        .and_then(|i| get(i, "breakpoints"))
        .filter(|b| truthy(b))
    {
        let list = points
            .as_array()
            .ok_or("project.ide.breakpoints.filter is not a function")?;
        let mut kept = Vec::with_capacity(list.len());
        for p in list {
            if p.is_null() || there(Some(p)).is_none() {
                return Err(BROKEN.into());
            }
            if text(get(p, "file")) != Some("main.c") {
                kept.push(p.clone());
            }
        }
        project["ide"]["breakpoints"] = Value::Array(kept);
    }
    validate_project(&Value::Object(project))
}
/// The project without its circuit, with the pin and peripheral defaults of its own board (an F103RB project
/// resets to F1 settings) and main.c generated from them; the other source files the user added are kept.
pub fn reset_board_configuration(original: &Value) -> R<Value> {
    let default = json!(crate::boards::DEFAULT_BOARD_ID);
    let on = board(Some(
        get(original, "boardId")
            .filter(|id| !id.is_null())
            .unwrap_or(&default),
    ))
    .ok_or(BROKEN)?;
    let mut project = copy(original)?;
    let empty = blank_project(on.get("mcuFamily"))?;
    project.insert("components".into(), json!([]));
    project.insert("wires".into(), json!([]));
    project.insert("surfaces".into(), empty["surfaces"].clone());
    project.insert("mcu".into(), empty["mcu"].clone());
    project.shift_remove("deviceDocs");
    reset_main_code(&validate_project(&Value::Object(project))?)
}

// ---------- bringing in a CubeIDE project ----------

js_re!(SOURCE, SOURCE_PATH);
js_re!(IOC_NAME, r"^[\w.-]+\.ioc$");
js_re!(CORE_MAIN, r"(^|/)Core/Src/main\.c$");
js_re!(STARTUP, r"(?i)(^|/)startup_[^/]*\.s$");
/// `name` ends in one of the endings (as the JavaScript's `/\.(c|h)$/` did).
fn ends(name: &str, endings: &[&str]) -> bool {
    endings.iter().any(|e| name.ends_with(e))
}
struct Incoming<'a> {
    name: &'a str,
    text: String,
}
/// The project with a CubeIDE project's files: the .ioc as its Pinout, main.c and the other sources as its sources.
/// → `{project, warnings, regenerated}`.
pub fn import_firmware(project: &Value, files: &Value) -> R<Value> {
    let list = files
        .as_array()
        .filter(|l| !l.is_empty() && l.len() <= MAX_SOURCE_FILES + 1)
        .ok_or(".ioc 및 .c/.h 파일을 선택하세요.")?;
    let mut warnings: Vec<String> = Vec::new();
    let mut incoming: Vec<Incoming> = Vec::with_capacity(list.len());
    let mut size = 0;
    for file in list {
        let name = text(get(file, "name")).filter(|n| {
            (IOC_NAME.is_match(n) || SOURCE.is_match(n) && ends(n, &[".c", ".h", ".s", ".ld"]))
                && !incoming.iter().any(|f| f.name == *n)
        });
        let (true, Some(name), Some(body)) = (truthy(file), name, text(get(file, "text"))) else {
            return Err("파일 이름, 확장자 또는 중복을 확인하세요.".into());
        };
        size += units(body);
        incoming.push(Incoming {
            name,
            text: normalize_text(body),
        });
    }
    if size > MAX_SOURCE_BYTES {
        return Err("가져올 파일은 합계 1 MB 이하로 선택하세요.".into());
    }
    let iocs: Vec<&Incoming> = incoming
        .iter()
        .filter(|f| f.name.ends_with(".ioc"))
        .collect();
    if iocs.len() > 1 {
        return Err(".ioc 파일은 하나만 선택하세요.".into());
    }
    let default = json!(crate::boards::DEFAULT_BOARD_ID);
    let on = board(Some(
        get(project, "boardId")
            .filter(|id| !id.is_null())
            .unwrap_or(&default),
    ));
    let mut next = copy(project);
    let family_of_board = || -> R<&str> {
        on.and_then(|b| b["mcuFamily"].as_str())
            .ok_or_else(|| BROKEN.to_string())
    };
    if let Some(ioc) = iocs.first() {
        let imported = crate::ioc::import_ioc(&ioc.text)?;
        let family = imported["config"]["family"].as_str().unwrap_or("");
        if family != family_of_board()? {
            let for_family = crate::boards::catalog()
                .as_array()
                .into_iter()
                .flatten()
                .find(|b| b["mcuFamily"].as_str() == Some(family))
                .and_then(|b| b["name"].as_str().map(String::from))
                .unwrap_or_else(|| family.to_string());
            return Err(format!(
                "이 .ioc는 {family}용입니다. 현재 보드는 {}이니 {for_family} 보드로 새 프로젝트를 만든 뒤 가져오세요.",
                on.map_or("", |b| b["name"].as_str().unwrap_or(""))
            ));
        }
        next.as_mut()
            .map_err(|e| e.clone())?
            .insert("mcu".into(), imported["config"].clone());
        warnings.extend(
            imported["warnings"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|w| w.as_str().map(String::from)),
        );
    }
    let next = next.as_mut().map_err(|e| e.clone())?;
    if next
        .get("mcu")
        .is_none_or(|m| m.is_null() || there(Some(m)).is_none())
    {
        next.insert(
            "mcu".into(),
            crate::mcuconfig::default_mcu(family_of_board()?)?,
        );
    }
    let sources: Vec<&Incoming> = incoming
        .iter()
        .filter(|f| ends(f.name, &[".c", ".h"]))
        .collect();
    let build: Vec<&Incoming> = incoming
        .iter()
        .filter(|f| ends(f.name, &[".s", ".ld"]))
        .collect();
    if sources.is_empty() && !build.is_empty() {
        return Err("시작 코드·링커 스크립트는 main.c를 함께 가져올 때 들어옵니다. 이미 있는 프로젝트에는 파일 추가로 넣으세요.".into());
    }
    if !sources.is_empty() {
        // main.c: at the top, or where CubeIDE keeps it (Core/Src); its folder is remembered so the tree stays as
        // imported.
        let mains: Vec<&Incoming> = sources
            .iter()
            .copied()
            .filter(|f| base_name(f.name) == "main.c")
            .collect();
        let main = mains
            .iter()
            .find(|f| f.name == "main.c")
            .or_else(|| mains.iter().find(|f| CORE_MAIN.is_match(f.name)))
            .or(mains.first())
            .copied()
            .ok_or("C 소스를 가져올 때 main.c를 함께 선택하세요.")?;
        if mains.len() > 1 {
            let others: Vec<&str> = mains
                .iter()
                .filter(|f| f.name != main.name)
                .map(|f| f.name)
                .collect();
            warnings.push(format!(
                "main.c가 여러 개라 {}을 주 소스로 썼습니다: {}는 가져오지 않았습니다.",
                main.name,
                others.join(", ")
            ));
        }
        // Names a project cannot hold (MAIN.C beside main.c, two names that differ only in case, a file where a
        // folder is) are left out with a warning: with them the project could not be saved or opened again.
        let mut kept: Vec<&Incoming> = Vec::new();
        let mut left: Vec<&str> = Vec::new();
        let clash = |kept: &[&Incoming], name: &str| {
            let names: Vec<&str> = kept.iter().map(|k| k.name).collect();
            !name_clash(&names, name).is_empty()
        };
        for f in sources.iter().filter(|f| base_name(f.name) != "main.c") {
            if clash(&kept, f.name) {
                left.push(f.name);
            } else {
                kept.push(f);
            }
        }
        if !left.is_empty() {
            warnings.push(format!(
                "이름이 겹쳐 가져오지 않은 파일: {}",
                left.join(", ")
            ));
        }
        // The project's own startup code and linker script come along (the ARM build then uses them in place of the
        // SDK's startup file and the script the app writes) — only the ones of this board's MCU: a startup file of
        // another MCU would give a wrong vector table, and the _RAM script would link the program into RAM.
        let family = show(next.get("mcu").and_then(|m| get(m, "family")));
        let digits = family
            .strip_prefix("STM32F")
            .filter(|rest| rest.len() >= 3 && rest.bytes().take(3).all(|b| b.is_ascii_digit()))
            .map_or("", |rest| &rest[..3]);
        let mut skipped: Vec<&str> = Vec::new();
        for f in &build {
            let base = base_name(f.name).to_ascii_lowercase();
            let startup = base.ends_with(".s");
            let fits = if startup {
                base.starts_with(&format!("startup_stm32f{digits}"))
            } else {
                base.contains(&format!("f{digits}")) && !base.ends_with("_ram.ld")
            };
            let twice = if startup {
                kept.iter().any(|k| STARTUP.is_match(k.name))
            } else {
                kept.iter().any(|k| k.name.ends_with(".ld"))
            };
            if digits.is_empty() || !fits || twice || clash(&kept, f.name) {
                skipped.push(f.name);
            } else {
                kept.push(f);
            }
        }
        if !skipped.is_empty() {
            warnings.push(format!("가져오지 않은 시작 코드·링커 스크립트: {} (이 보드의 MCU 것이 아니거나 _RAM 스크립트이거나 이미 하나 가져옴). 앱이 넣는 것으로 빌드합니다.", skipped.join(", ")));
        }
        next.insert("code".into(), json!(main.text));
        let mut firmware = Map::new();
        firmware.insert("mode".into(), json!("hal"));
        firmware.insert(
            "files".into(),
            kept.iter()
                .map(|f| json!({"name": f.name, "text": f.text}))
                .collect(),
        );
        if !folder_of(main.name).is_empty() {
            firmware.insert("mainFolder".into(), json!(folder_of(main.name)));
        }
        next.insert("firmware".into(), Value::Object(firmware));
    }
    // Only an .ioc: the settings change and main.c is generated from them as CubeMX does (USER CODE sections kept),
    // so the import shows in the code too. A configuration that cannot be generated leaves main.c as it was, with
    // the reason. A main.c without USER CODE sections (written by hand) is never replaced: it would lose everything
    // outside them.
    let mut regenerated = false;
    let code = match get(project, "code").filter(|c| truthy(c)) {
        Some(c) => show(Some(c)),
        None => String::new(),
    };
    if !iocs.is_empty() && sources.is_empty() && !code.contains("/* USER CODE BEGIN ") {
        warnings.push("main.c에 USER CODE 구역이 없어 코드는 그대로 두었습니다. Pinout & Configuration의 \"설정으로 HAL 코드 생성\"으로 이 설정의 코드를 만들 수 있습니다.".into());
    } else if !iocs.is_empty() && sources.is_empty() {
        let previous = generate(get(project, "mcu"), false)
            .map(|main| expand(&main))
            .unwrap_or_default();
        let next_mcu = next.get("mcu").cloned().unwrap_or(Value::Null);
        let mut again = || -> R<()> {
            let generated = expand(&generate(Some(&next_mcu), false)?);
            let others: Vec<String> = next
                .get("firmware")
                .and_then(|f| get(f, "files"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|f| show(get(f, "text")))
                .collect();
            let generator = crate::overrides::generator_texts(&[
                get(project, "mcu").map_or(Value::Null, as_json),
                as_json(&next_mcu),
            ]);
            let (code, moved) =
                crate::regen::regenerate_main(&code, &generated, &previous, &others, &generator);
            next.insert("code".into(), json!(code));
            regenerated = true;
            if !moved.is_empty() {
                warnings.push(format!(
                    "USER CODE 구역 밖에 있던 코드를 구역 안으로 옮겨 유지했습니다: {}",
                    moved.join(", ")
                ));
            }
            // Edited generated files (feature 45) are regenerated with the new settings as well.
            let files: Vec<Value> = get(project, "firmware")
                .and_then(|f| get(f, "files"))
                .filter(|f| truthy(f))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let asked = json!({
                "code": get(project, "code").map_or(Value::Null, as_json),
                "mcu": get(project, "mcu").map_or(Value::Null, as_json),
                "firmware": {"files": files.iter().map(|f| json!({"name": f.get("name"), "text": f.get("text"), "origin": f.get("origin"), "base": f.get("base")})).collect::<Vec<_>>()},
            });
            let plan =
                crate::overrides::regenerate_overrides(&as_json(&asked), &as_json(&next_mcu))?;
            let mut applied = Vec::new();
            for (f, action) in files
                .iter()
                .zip(plan["actions"].as_array().into_iter().flatten())
            {
                match action.as_str() {
                    Some("keep") => applied.push(f.clone()),
                    Some(_) => {}
                    None => {
                        let mut merged = f.as_object().cloned().unwrap_or_default();
                        for (key, value) in action.as_object().into_iter().flatten() {
                            merged.insert(key.clone(), value.clone());
                        }
                        applied.push(Value::Object(merged));
                    }
                }
            }
            if let Some(firmware) = next.get_mut("firmware").filter(|f| truthy(f)) {
                firmware["files"] = Value::Array(applied);
            }
            Ok(())
        };
        if let Err(reason) = again() {
            warnings.push(format!("main.c는 바꾸지 않았습니다: {reason}"));
        }
    }
    Ok(
        json!({"project": validate_project(&Value::Object(next.clone()))?, "warnings": warnings, "regenerated": regenerated}),
    )
}

// ---------- a first circuit from the Pinout (feature 13) ----------
// An .ioc says what each pin does and how it is labelled, not what is wired to it, so every pin function gets the
// part a beginner would wire to try it out — an LED with its resistor on an output, a button on an input, a
// potentiometer on an ADC channel, a memory module on an I2C / SPI bus, a terminal on a UART.

static PINS: LazyLock<Value> = LazyLock::new(crate::pins::tables);
/// The header pins of a board (`boardPins` of pins.js).
fn board_pins(board: Option<&Value>) -> &'static [Value] {
    let id = text(board).unwrap_or("");
    let list = if id == "fpb-ra6e1" {
        &PINS["FPB_PINS"]
    } else {
        PINS["BOARD_PINS"].get(id).unwrap_or(&PINS["NUCLEO_PINS"])
    };
    list.as_array().map_or(&[], Vec::as_slice)
}
/// A header pin wired to `name` (D0/D1, PA2/PA3, PC14/PC15 and PH0 have none: their solder bridges are open).
fn board_pin(pins: &[Value], name: Option<&Value>) -> Option<String> {
    let name = text(name)?;
    let wired = pins.iter().find(|p| {
        p["label"] == name
            && p["signal"] != "NC"
            && ["CN5", "CN6", "CN8", "CN9"].contains(&p["header"].as_str().unwrap_or(""))
    });
    let signal = PINS["ALIASES"]
        .get(name)
        .and_then(Value::as_str)
        .filter(|a| !a.is_empty())
        .unwrap_or(name);
    wired
        .or_else(|| pins.iter().find(|p| p["signal"] == signal))
        .and_then(|p| p["id"].as_str().map(String::from))
}
// Pins the NUCLEO boards already have a part on: no external part is made for them.
const ONBOARD: [(&str, &str); 4] = [
    ("PA5", "보드의 LD2(초록 LED)"),
    ("PC13", "보드의 B1(USER 버튼)"),
    ("PA2", "ST-LINK 가상 COM 포트(USART2 TX)"),
    ("PA3", "ST-LINK 가상 COM 포트(USART2 RX)"),
];
fn onboard(pin: &str) -> Option<&'static str> {
    ONBOARD
        .iter()
        .find(|(p, _)| *p == pin)
        .map(|(_, what)| *what)
}
// Outputs that select or control a device rather than drive a load.
js_re!(
    CONTROL,
    r"(?i)(^|_)(CS|NSS|SS|DC|RS|RST|RES|RESET|EN|WR|RD|LAT|LATCH|STB)\d*$"
);
js_re!(CHIP_SELECT, r"(?i)(^|_)(CS|NSS|SS)\d*$");
js_re!(DISPLAY, r"(?i)OLED|SSD1306|DISPLAY");
js_re!(BUZZER, r"(?i)BUZZ|BEEP");
js_re!(SERVO, r"(?i)SERVO");
js_re!(ADC_CHANNEL, r"^ADC1_IN\d+$");
js_re!(TIMER_CHANNEL, r"^(TIM\d+)_CH\d$");
/// `id` is `<prefix><digit>` (`/^I2C\d$/`).
fn numbered(id: &str, prefix: &str) -> bool {
    id.strip_prefix(prefix)
        .is_some_and(|n| n.len() == 1 && n.as_bytes()[0].is_ascii_digit())
}
/// What could be wired to this Pinout: `[{key, kind, title, pins, parts, note?, skipped?}]` (skipped: listed with
/// the reason, not built).
pub fn suggest_circuit(mcu: &Value, board: Option<&Value>) -> R<Vec<Value>> {
    if mcu.is_null() {
        return Err(BROKEN.into());
    }
    let header = board_pins(board);
    let all = get(mcu, "pins").filter(|p| truthy(p));
    let function = |p: &Value| -> R<Option<String>> {
        if p.is_null() || there(Some(p)).is_none() {
            return Err(BROKEN.into());
        }
        Ok(get(p, "function").map(|f| show(Some(f))))
    };
    let mut pins: Vec<(String, &Value)> = Vec::new();
    for (pin, p) in all.map(entries).unwrap_or_default() {
        if !matches!(function(p)?.as_deref(), Some("Reset" | "Reserved")) {
            pins.push((pin, p));
        }
    }
    let none = json!({});
    let per = get(mcu, "peripherals")
        .filter(|p| truthy(p))
        .unwrap_or(&none);
    let label_of = |p: &Value| match get(p, "label").filter(|l| truthy(l)) {
        Some(l) => show(Some(l)),
        None => String::new(),
    };
    let label = |pin: &str| {
        all.and_then(|a| get(a, pin))
            .map_or(String::new(), label_of)
    };
    let name = |pin: &str| {
        let l = label(pin);
        if l.is_empty() {
            pin.to_string()
        } else {
            format!("{pin} ({l})")
        }
    };
    // The pin with a function: the first in the order of the Pinout.
    let signal_pin = |wanted: &str| -> R<Option<String>> {
        let all = get(mcu, "pins").filter(|p| !p.is_null()).ok_or(BROKEN)?;
        for (pin, p) in entries(all) {
            if function(p)?.as_deref() == Some(wanted) {
                return Ok(Some(pin));
            }
        }
        Ok(None)
    };
    let enabled = |id: &str| -> R<bool> {
        let p = &per[id];
        if p.is_null() || there(Some(p)).is_none() {
            return Err(BROKEN.into());
        }
        Ok(get(p, "enabled").is_some_and(truthy))
    };
    let ids = |prefixes: &[&str]| -> R<Vec<String>> {
        let mut found = Vec::new();
        for (id, _) in entries(per) {
            if prefixes.iter().any(|p| numbered(&id, p)) && enabled(&id)? {
                found.push(id);
            }
        }
        Ok(found)
    };
    let mut out: Vec<Value> = Vec::new();
    let mut used: Vec<String> = Vec::new();
    // A pin without a header terminal (PA2 / PA3 on a NUCLEO-64: solder bridges SB62 / SB63 are open) cannot be
    // wired.
    let mut add = |mut s: Map<String, Value>, used: &mut Vec<String>| {
        let on: Vec<String> = s["pins"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| p.as_str().map(String::from))
            .collect();
        let off: Vec<&str> = on
            .iter()
            .filter(|p| board_pin(header, Some(&json!(p))).is_none())
            .map(String::as_str)
            .collect();
        if !off.is_empty() && !s.contains_key("skipped") {
            s.insert("parts".into(), json!([]));
            s.insert(
                "skipped".into(),
                json!(format!(
                    "{}은 보드 헤더에 나와 있지 않아 배선할 수 없습니다.",
                    off.join("·")
                )),
            );
        }
        out.push(Value::Object(s));
        used.extend(on);
    };
    let entry = |key: &str, kind: &str, title: String, pins: &[&str], parts: &[&str]| {
        let mut s = Map::new();
        s.insert("key".into(), json!(key));
        s.insert("kind".into(), json!(kind));
        s.insert("title".into(), json!(title));
        s.insert("pins".into(), json!(pins));
        s.insert("parts".into(), json!(parts));
        s
    };
    // Buses first: they claim their pins and, for SPI, a chip-select output.
    for id in ids(&["I2C"])? {
        let (Some(scl), Some(sda)) = (
            signal_pin(&format!("{id}_SCL"))?,
            signal_pin(&format!("{id}_SDA"))?,
        ) else {
            continue;
        };
        let labels: Vec<String> = pins
            .iter()
            .map(|(_, p)| match get(p, "label").filter(|l| !l.is_null()) {
                Some(l) => show(Some(l)),
                None => String::new(),
            })
            .collect();
        let oled = DISPLAY.is_match(&format!(
            "{}{}{}",
            label(&scl),
            label(&sda),
            labels.join(" ")
        ));
        let mut s = entry(
            &id,
            if oled { "oled" } else { "i2c" },
            format!(
                "{id} — {}",
                if oled {
                    "OLED 디스플레이(SSD1306, 0x3C)"
                } else {
                    "I²C 메모리 모듈(0x50)"
                }
            ),
            &[&scl, &sda],
            &[if oled { "OLED" } else { "I²C 메모리" }],
        );
        s.insert("scl".into(), json!(scl));
        s.insert("sda".into(), json!(sda));
        add(s, &mut used);
    }
    for id in ids(&["SPI"])? {
        let (Some(sck), Some(miso), Some(mosi)) = (
            signal_pin(&format!("{id}_SCK"))?,
            signal_pin(&format!("{id}_MISO"))?,
            signal_pin(&format!("{id}_MOSI"))?,
        ) else {
            continue;
        };
        let mut cs = None;
        for (pin, p) in &pins {
            if function(p)?.as_deref() == Some("GPIO_Output")
                && !used.contains(pin)
                && CHIP_SELECT.is_match(&label_of(p))
            {
                cs = Some(pin.clone());
                break;
            }
        }
        match cs {
            Some(cs) => {
                let mut s = entry(
                    &id,
                    "spi",
                    format!("{id} — SPI 메모리 모듈 (CS {})", name(&cs)),
                    &[&sck, &miso, &mosi, &cs],
                    &["SPI 메모리"],
                );
                for (key, pin) in [("sck", &sck), ("miso", &miso), ("mosi", &mosi), ("cs", &cs)] {
                    s.insert(key.into(), json!(pin));
                }
                add(s, &mut used);
            }
            None => {
                let mut s = entry(
                    &id,
                    "spi",
                    format!("{id} — SPI 장치"),
                    &[&sck, &miso, &mosi],
                    &[],
                );
                s.insert(
                    "skipped".into(),
                    json!("CS로 쓸 GPIO 출력(라벨이 CS·NSS로 끝나는 핀)이 없어 만들지 않습니다."),
                );
                add(s, &mut used);
            }
        }
    }
    for id in ids(&["UART", "USART"])? {
        let (Some(tx), Some(rx)) = (
            signal_pin(&format!("{id}_TX"))?,
            signal_pin(&format!("{id}_RX"))?,
        ) else {
            continue;
        };
        if let (Some(what), Some(_)) = (onboard(&tx), onboard(&rx)) {
            let short = what.split('(').next().unwrap_or(what);
            let mut s = entry(&id, "uart", format!("{id} — {short}"), &[&tx, &rx], &[]);
            s.insert(
                "skipped".into(),
                json!("보드의 ST-LINK가 PC와 연결합니다. 하단 직렬 모니터를 쓰세요."),
            );
            add(s, &mut used);
        } else {
            let baud = get(&per[&id], "baud")
                .filter(|b| !b.is_null())
                .cloned()
                .unwrap_or(json!(115_200));
            let mut s = entry(
                &id,
                "uart",
                format!("{id} — 외부 UART 터미널 ({} baud)", show(Some(&baud))),
                &[&tx, &rx],
                &["UART 터미널"],
            );
            s.insert("tx".into(), json!(tx));
            s.insert("rx".into(), json!(rx));
            s.insert("baud".into(), baud);
            add(s, &mut used);
        }
    }
    for (pin, p) in &pins {
        if used.contains(pin) {
            continue;
        }
        let f = function(p)?;
        let shown = f.clone().unwrap_or_else(|| "undefined".into());
        let f = f.as_deref();
        let plain = |kind: &str, title: String, parts: &[&str]| {
            let mut s = entry(pin, kind, title, &[pin], parts);
            s.insert("pin".into(), json!(pin));
            s
        };
        let skipped = |kind: &str, title: String, why: &str| {
            let mut s = entry(pin, kind, title, &[pin], &[]);
            s.insert("skipped".into(), json!(why));
            s
        };
        let tag = label_of(p);
        if let (Some(what), Some("GPIO_Output" | "GPIO_Input" | "GPIO_EXTI")) = (onboard(pin), f) {
            add(
                skipped(
                    "onboard",
                    format!("{} — {what}", name(pin)),
                    "보드에 이미 있는 부품입니다.",
                ),
                &mut used,
            );
            continue;
        }
        if f == Some("GPIO_Output") {
            if CONTROL.is_match(&tag) {
                add(
                    skipped(
                        "control",
                        format!("{} — 장치 제어 핀", name(pin)),
                        "CS·DC·RST 같은 제어 신호라 부품을 만들지 않습니다.",
                    ),
                    &mut used,
                );
            } else if BUZZER.is_match(&tag) {
                add(
                    plain("buzzer", format!("{} — 능동 부저", name(pin)), &["부저"]),
                    &mut used,
                );
            } else {
                add(
                    plain(
                        "led",
                        format!("{} — LED와 330 Ω 저항", name(pin)),
                        &["LED", "330 Ω"],
                    ),
                    &mut used,
                );
            }
        } else if matches!(f, Some("GPIO_Input" | "GPIO_EXTI")) {
            let pull = text(get(p, "pull"));
            let down = pull == Some("PULLDOWN");
            let mut s = plain(
                "button",
                format!(
                    "{} — 버튼 (누르면 {})",
                    name(pin),
                    if down { "3.3 V" } else { "GND" }
                ),
                &["버튼"],
            );
            s.insert("to".into(), json!(if down { "3V3" } else { "GND" }));
            s.insert(
                "note".into(),
                if pull == Some("NOPULL") {
                    json!("Pinout에서 Pull-up을 켜지 않으면 버튼을 뗐을 때 입력이 떠 있습니다.")
                } else {
                    undefined()
                },
            );
            add(s, &mut used);
        } else if ADC_CHANNEL.is_match(&shown) {
            add(
                plain(
                    "pot",
                    format!("{} — 가변저항 10 kΩ ({shown})", name(pin)),
                    &["가변저항"],
                ),
                &mut used,
            );
        } else if let Some(timer) = TIMER_CHANNEL.captures(&shown).and_then(|c| c.get(1)) {
            let t = &per[timer.as_str()];
            if get(t, "enabled").is_some_and(truthy) && text(get(t, "mode")) == Some("pwm") {
                if SERVO.is_match(&tag) {
                    add(
                        plain(
                            "servo",
                            format!("{} — RC 서보 ({shown} PWM)", name(pin)),
                            &["서보"],
                        ),
                        &mut used,
                    );
                } else {
                    add(
                        plain(
                            "led",
                            format!("{} — LED와 330 Ω 저항 ({shown} PWM 밝기)", name(pin)),
                            &["LED", "330 Ω"],
                        ),
                        &mut used,
                    );
                }
            }
        }
    }
    Ok(out)
}
/// The parts and wires of a suggested circuit as they are made.
struct Made {
    header: &'static [Value],
    components: Vec<Value>,
    wires: Vec<Value>,
    count: Vec<(&'static str, usize)>,
}
impl Made {
    /// A new part named `<prefix><n>`; its id.
    fn part(&mut self, kind: &str, prefix: &'static str, extra: Value) -> String {
        let n = match self.count.iter_mut().find(|c| c.0 == prefix) {
            Some(c) => {
                c.1 += 1;
                c.1
            }
            None => {
                self.count.push((prefix, 1));
                1
            }
        };
        let id = format!("{prefix}{n}").to_lowercase();
        let mut c = Map::new();
        c.insert("id".into(), json!(id));
        c.insert("name".into(), json!(format!("{prefix}{n}")));
        c.insert("type".into(), json!(kind));
        c.insert("x".into(), json!(800));
        c.insert("y".into(), json!(200 + 40 * self.components.len()));
        c.insert("rotation".into(), json!(0));
        for (key, value) in extra.as_object().into_iter().flatten() {
            c.insert(key.clone(), value.clone());
        }
        self.components.push(Value::Object(c));
        id
    }
    /// The header pin of a signal (`undefined` when the board has none).
    fn pin(&self, name: Option<&Value>) -> Value {
        board_pin(self.header, name).map_or_else(undefined, |id| json!(id))
    }
    fn wire(&mut self, from: Value, to: Value, color: &str) {
        let id = format!("w{}", self.wires.len() + 1);
        self.wires
            .push(json!({"id": id, "from": from, "to": to, "color": color}));
    }
    /// A wire from a supply pin of the board.
    fn power(&mut self, to: Value, name: Option<&Value>) {
        let color = if text(name) == Some("GND") {
            "#4e647b"
        } else {
            "#dd654c"
        };
        self.wire(self.pin(name), to, color);
    }
}
fn end(id: &str, key: &str) -> Value {
    json!(format!("part:{id}:{key}"))
}
/// The project with the chosen suggestions as parts and wires, its other circuit replaced (the JavaScript side lets
/// the example layout engine place and route them on the breadboard).
pub fn circuit_parts(project: &Value, suggestions: &Value, board: Option<&Value>) -> R<Value> {
    let header = board_pins(board);
    let mut p = copy(project)?;
    let own = |v: Option<&Value>| -> Map<String, Value> {
        v.filter(|x| truthy(x))
            .map(|x| {
                entries(x)
                    .into_iter()
                    .map(|(k, x)| (k, x.clone()))
                    .collect()
            })
            .unwrap_or_default()
    };
    let mut surfaces = own(get(project, "surfaces"));
    for key in ["board", "breadboard"] {
        let mut surface = own(get(project, "surfaces").and_then(|s| get(s, key)));
        surface.insert("hidden".into(), json!(false));
        surfaces.insert(key.into(), Value::Object(surface));
    }
    let mut made = Made {
        header,
        components: Vec::new(),
        wires: Vec::new(),
        count: Vec::new(),
    };
    const SIGNAL: &str = "#23a68a";
    const DATA: &str = "#8064d8";
    let (gnd, v33, v5) = (json!("GND"), json!("3V3"), json!("5V"));
    // A text is a list of its letters to JavaScript: none of them is a suggestion.
    let nothing = Vec::new();
    let list = match suggestions {
        Value::Array(list) => list,
        Value::String(_) => &nothing,
        _ => return Err("suggestions is not iterable".into()),
    };
    for s in list {
        if s.is_null() || there(Some(s)).is_none() {
            return Err(BROKEN.into());
        }
        if get(s, "skipped").is_some_and(truthy) {
            continue;
        }
        let at = |key: &str| made.pin(get(s, key));
        match text(get(s, "kind")) {
            Some("led") => {
                let (from, r) = (at("pin"), made.part("resistor", "R", json!({"value": 330})));
                let led = made.part("led", "LED", json!({"color": "red"}));
                made.wire(from, end(&r, "a"), SIGNAL);
                made.wire(end(&r, "b"), end(&led, "a"), SIGNAL);
                made.power(end(&led, "b"), Some(&gnd));
            }
            Some("buzzer") => {
                let (from, b) = (at("pin"), made.part("buzzer", "BZ", json!({})));
                made.wire(from, end(&b, "a"), SIGNAL);
                made.power(end(&b, "b"), Some(&gnd));
            }
            Some("button") => {
                let (from, b) = (at("pin"), made.part("button", "SW", json!({})));
                made.wire(from, end(&b, "a"), DATA);
                made.power(end(&b, "d"), get(s, "to"));
            }
            Some("pot") => {
                let from = at("pin");
                let v = made.part(
                    "potentiometer",
                    "VR",
                    json!({"value": 10000, "position": 50}),
                );
                made.power(end(&v, "p1"), Some(&gnd));
                made.wire(from, end(&v, "p2"), DATA);
                made.power(end(&v, "p3"), Some(&v33));
            }
            Some("servo") => {
                let (from, v) = (at("pin"), made.part("servo", "SERVO", json!({})));
                made.power(end(&v, "p1"), Some(&v5));
                made.power(end(&v, "p2"), Some(&gnd));
                made.wire(from, end(&v, "p3"), SIGNAL);
            }
            Some(kind @ ("i2c" | "oled")) => {
                let (sda, scl, oled) = (at("sda"), at("scl"), kind == "oled");
                let m = made.part(
                    kind,
                    if oled { "OLED" } else { "I2C" },
                    json!({"address": if oled { 60 } else { 80 }}),
                );
                made.power(end(&m, "p1"), Some(&v33));
                made.power(end(&m, "p2"), Some(&gnd));
                made.wire(sda, end(&m, "p3"), DATA);
                made.wire(scl, end(&m, "p4"), SIGNAL);
            }
            Some("spi") => {
                let from = [at("cs"), at("sck"), at("mosi"), at("miso")];
                let m = made.part("spi", "SPI", json!({}));
                made.power(end(&m, "p1"), Some(&v33));
                made.power(end(&m, "p2"), Some(&gnd));
                for (pin, (to, color)) in from.into_iter().zip([
                    ("p3", SIGNAL),
                    ("p4", SIGNAL),
                    ("p5", SIGNAL),
                    ("p6", DATA),
                ]) {
                    made.wire(pin, end(&m, to), color);
                }
            }
            Some("uart") => {
                let (rx, tx) = (at("rx"), at("tx"));
                let m = made.part("uart", "UART", json!({"baud": raw(get(s, "baud"))}));
                made.power(end(&m, "p1"), Some(&v33));
                made.power(end(&m, "p2"), Some(&gnd));
                made.wire(end(&m, "p3"), rx, DATA);
                made.wire(tx, end(&m, "p4"), SIGNAL);
            }
            _ => {}
        }
    }
    let Made {
        components, wires, ..
    } = made;
    // A list in the place of a project came back as that list.
    if project.is_array() && components.is_empty() {
        return Ok(project.clone());
    }
    p.insert("components".into(), Value::Array(components));
    p.insert("wires".into(), Value::Array(wires));
    p.insert("surfaces".into(), Value::Object(surfaces));
    Ok(Value::Object(p))
}

// ---------- the USB descriptor source of an FSP project (feature 41) ----------

/// FSP 6.6 ra/fsp/src/r_usb_pcdc/r_usb_pcdc_descriptor.c.template (BSD-3-Clause, Renesas), as it is: the USB PCDC
/// descriptors (g_usb_descriptor) a project with the USB stack gets as its user source
/// src/r_usb_pcdc_descriptor.c. RASC writes the same file from this template.
static USB: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("data/usb_descriptor.json")).expect("usb_descriptor.json")
});
/// Whether a project with these source names still needs the descriptor file (none of them is one, in any folder).
pub fn usb_descriptor_missing(names: &[Value]) -> bool {
    let file = USB["RA_USB_DESCRIPTOR_FILE"].as_str().unwrap_or("");
    !names.iter().any(|name| {
        let shown = show(there(Some(name)));
        shown.rsplit('/').next() == Some(file)
    })
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let a = |i: usize| there(args.get(i));
    let v = |i: usize| a(i).unwrap_or(&null);
    Some(match name {
        "reset_main_code" => reset_main_code(v(0)),
        "reset_board_configuration" => reset_board_configuration(v(0)),
        "import_firmware" => import_firmware(v(0), v(1)),
        "suggest_circuit" => suggest_circuit(v(0), a(1)).map(Value::Array),
        "circuit_parts" => circuit_parts(v(0), v(1), a(2)),
        "usb_descriptor_tables" => Ok(USB.clone()),
        "usb_descriptor_missing" => Ok(json!(usb_descriptor_missing(
            v(0).as_array().map_or(&[][..], Vec::as_slice)
        ))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::project_for_board;

    #[test]
    fn main_and_board_go_back_to_a_new_project() {
        let blank = project_for_board(None).unwrap();
        let mut edited = blank.clone();
        edited["code"] = json!("int main(void) { return 1; }\n");
        edited["components"] = json!([{"id": "a", "type": "led", "name": "LED", "x": 1, "y": 2, "rotation": 0, "color": "red"}]);
        edited["ide"] = json!({"breakpoints": [{"file": "main.c", "line": 1}], "watches": []});
        let reset = reset_main_code(&edited).unwrap();
        assert!(reset["code"].as_str().unwrap().contains("int _write("));
        assert_eq!(reset["ide"]["breakpoints"], json!([]));
        assert_eq!(reset["components"].as_array().unwrap().len(), 1);
        let board = reset_board_configuration(&edited).unwrap();
        assert_eq!(board["components"], json!([]));
        assert_eq!(board["mcu"], blank["mcu"]);
        let mut sketch = edited.clone();
        sketch["firmware"] = json!({"mode": "sketch", "files": []});
        sketch.as_object_mut().unwrap().shift_remove("mcu");
        assert_eq!(
            reset_main_code(&sketch).unwrap()["code"],
            "void setup() {\n}\n\nvoid loop() {\n}\n"
        );
    }

    #[test]
    fn sources_come_in_with_main_c() {
        let project = project_for_board(None).unwrap();
        let files = json!([
            {"name": "Core/Src/main.c", "text": "int main(void)\r\n{\r\n  return 0;\r\n}\r\n"},
            {"name": "Core/Inc/app.h", "text": "#pragma once\n"},
            {"name": "startup_stm32f446xx.s", "text": "/* startup */\n"},
            {"name": "startup_stm32f103xb.s", "text": "/* startup */\n"},
        ]);
        let got = import_firmware(&project, &files).unwrap();
        assert_eq!(
            got["project"]["code"],
            "int main(void)\n{\n  return 0;\n}\n"
        );
        assert_eq!(got["project"]["firmware"]["mainFolder"], "Core/Src");
        assert_eq!(
            got["project"]["firmware"]["files"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert!(got["warnings"][0]
            .as_str()
            .unwrap()
            .contains("startup_stm32f103xb.s"));
        assert_eq!(got["regenerated"], false);
        assert_eq!(
            import_firmware(&project, &json!([{"name": "a.txt", "text": ""}])).unwrap_err(),
            "파일 이름, 확장자 또는 중복을 확인하세요."
        );
    }

    #[test]
    fn a_pinout_suggests_parts() {
        let mcu = json!({"pins": {
            "PA0": {"function": "GPIO_Output", "label": "LED_RED"},
            "PA1": {"function": "GPIO_Input", "pull": "NOPULL"},
            "PA5": {"function": "GPIO_Output"},
            "PB8": {"function": "I2C1_SCL"}, "PB9": {"function": "I2C1_SDA"},
        }, "peripherals": {"I2C1": {"enabled": true}}});
        let board = json!("nucleo-f446re");
        let got = suggest_circuit(&mcu, Some(&board)).unwrap();
        let kinds: Vec<&str> = got.iter().map(|s| s["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["i2c", "led", "button", "onboard"]);
        let project = project_for_board(None).unwrap();
        let built = circuit_parts(&project, &Value::Array(got), Some(&board)).unwrap();
        assert_eq!(built["components"].as_array().unwrap().len(), 4);
        assert_eq!(built["wires"][0]["id"], "w1");
        assert_eq!(built["surfaces"]["breadboard"]["hidden"], false);
        assert!(usb_descriptor_missing(&[
            json!("main.c"),
            json!("src/app.c")
        ]));
        assert!(!usb_descriptor_missing(&[json!(
            "src/r_usb_pcdc_descriptor.c"
        )]));
    }
}
