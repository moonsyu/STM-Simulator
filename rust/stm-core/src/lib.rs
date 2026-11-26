//! Feature code of STM-Simulator in Rust. The app loads this crate as WebAssembly (`src/rust-core.js`) and calls
//! one entry point with JSON: `{"fn": name, "args": value}` in, `{"ok": value}` or `{"error": message}` out.
//! New and changed features are written here (the user's decision of 2026-11-25); the screens stay in JavaScript.

pub mod build_level;
pub mod cformat;
pub mod clock;
pub mod couple;
pub mod csedit;
pub mod csource;
pub mod csymbols;
pub mod docs_regions;
pub mod duty;
pub mod explorer;
pub mod family;
pub mod halgen;
pub mod jsre;
pub mod mcu;
pub mod mcuconfig;
pub mod periph;
pub mod regen;

use serde_json::{json, Value};

/// Runs one named function. Kept apart from the WebAssembly boundary so `cargo test` covers it on the host.
pub fn dispatch(name: &str, args: &Value) -> Result<Value, String> {
    match name {
        // {"family": "STM32F446RE"} → ["PA0", …]
        "family_gpio_pins" => {
            let family = args
                .get("family")
                .and_then(Value::as_str)
                .ok_or("family_gpio_pins: family가 필요합니다.")?;
            family::gpio_pins(family)
                .map(|pins| json!(pins))
                .ok_or_else(|| format!("지원하지 않는 MCU입니다: {family}"))
        }
        // {"family": "STM32F446RE"} → {"family", "pins": {}, "peripherals": {}, "nvic": {}, "timerClockHz", "coupleFiles"}
        "new_project_mcu" => {
            let family = args
                .get("family")
                .and_then(Value::as_str)
                .ok_or("new_project_mcu: family가 필요합니다.")?;
            let mcu = family::new_project_mcu(family)
                .ok_or_else(|| format!("지원하지 않는 MCU입니다: {family}"))?;
            let mut out = json!({
                "family": mcu.family,
                "pins": {},
                "peripherals": {},
                "nvic": {},
                "timerClockHz": mcu.timer_clock_hz,
            });
            if mcu.couple_files {
                out["coupleFiles"] = json!(true);
            }
            Ok(out)
        }
        // {"source", "tag", "module", "others": [{"tag", "needs": [role]}] | null}
        //   → {"source", "fileRegions": [{"group", "function", "body"}]} | {"needOthers": true}
        "docs_install" => {
            let others = docs_others(args);
            match docs_regions::install_device_regions(
                text(args, "source"),
                text(args, "tag"),
                &docs_module(args.get("module").unwrap_or(&Value::Null)),
                others.as_deref(),
            )? {
                docs_regions::Outcome::NeedOthers => Ok(json!({ "needOthers": true })),
                docs_regions::Outcome::Done((source, files)) => Ok(json!({
                    "source": source,
                    "fileRegions": files
                        .iter()
                        .map(|r| json!({ "group": r.group, "function": r.function, "body": r.body }))
                        .collect::<Vec<_>>(),
                })),
            }
        }
        // {"source", "tag", "others"} → {"source", "report": {"removed", "retagged", "missing"}} | {"needOthers": true}
        "docs_remove" => {
            let others = docs_others(args);
            match docs_regions::remove_device_regions(
                text(args, "source"),
                text(args, "tag"),
                others.as_deref(),
            ) {
                docs_regions::Outcome::NeedOthers => Ok(json!({ "needOthers": true })),
                docs_regions::Outcome::Done((source, report)) => Ok(json!({
                    "source": source,
                    "report": { "removed": report.removed, "retagged": report.retagged, "missing": report.missing },
                })),
            }
        }
        // {"files": [{"name", "text"}], "inPair": bool, "before": {function: statements}}
        //   → {"functions": {name: pair}, "handles": {name: pair}, "before", "inPair", "stored"}: the `coupled` of a module
        "docs_coupling" => {
            let files: Vec<(String, String)> = args
                .get("files")
                .and_then(Value::as_array)
                .map(|list| {
                    list.iter()
                        .map(|f| (text(f, "name").to_string(), text(f, "text").to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let (functions, handles) = docs_regions::coupling_of(&files);
            Ok(json!({
                "functions": functions,
                "handles": handles,
                "before": text_map(args.get("before")),
                "inPair": args.get("inPair").and_then(Value::as_bool).unwrap_or(true),
                "stored": texts(args, "stored"),
            }))
        }
        // {"main", "pairs": [{"name", "text"}]} → {"main", "files": [{"name", "text"}]} | null (it stays one file)
        "couple_example" => {
            let pairs: Vec<(String, String)> = args
                .get("pairs")
                .and_then(Value::as_array)
                .map(|list| {
                    list.iter()
                        .map(|f| (text(f, "name").to_string(), text(f, "text").to_string()))
                        .collect()
                })
                .unwrap_or_default();
            Ok(match couple::couple_example(text(args, "main"), &pairs) {
                Some(out) => json!({
                    "main": out.main,
                    "files": out.files.iter().map(|(name, text)| json!({ "name": name, "text": text })).collect::<Vec<_>>(),
                }),
                None => Value::Null,
            })
        }
        // {"code", "setup": text | null, "write", "read"} → the code with the UART console | null (it keeps its code)
        "add_console" => Ok(couple::add_console(
            text(args, "code"),
            &couple::ConsolePieces {
                setup: args.get("setup").and_then(Value::as_str),
                write: text(args, "write"),
                read: text(args, "read"),
            },
        )
        .map_or(Value::Null, Value::String)),
        // {"module"} → [role]
        "docs_module_needs" => {
            let mut needs: Vec<String> = docs_regions::module_needs(&docs_module(
                args.get("module").unwrap_or(&Value::Null),
            ))
            .into_iter()
            .collect();
            needs.sort_unstable();
            Ok(json!(needs))
        }
        // {"source", "tag", "name", "body"} → the per-peripheral file with the device's region in function `name`
        "docs_file_function" => Ok(json!(docs_regions::set_file_function_region(
            text(args, "source"),
            text(args, "tag"),
            text(args, "name"),
            text(args, "body"),
        )?)),
        // → {"levels": [{"flag", "label"}], "default": "-O0", "configurations": ["Debug", "Release"]}
        "build_levels" => Ok(json!({
            "levels": build_level::LEVELS
                .iter()
                .map(|(flag, label)| json!({ "flag": flag, "label": label }))
                .collect::<Vec<_>>(),
            "default": build_level::DEFAULT,
            "configurations": build_level::CONFIGURATIONS,
        })),
        // {"value": {"Debug"?, "Release"?} | null} → what a project stores (the default level left out)
        "build_level_settings" => Ok(Value::Object(build_level::settings(
            args.get("value").unwrap_or(&Value::Null),
        )?)),
        // {"stored", "configuration"} → "-O0" …
        "build_level_flag" => Ok(json!(build_level::flag(
            args.get("stored").unwrap_or(&Value::Null),
            text(args, "configuration"),
        ))),
        // {"paths": [place of each file], "includes": [include directory]} → {"name", "path", "folders", "rows", "includes"}
        "explorer_tree" => Ok(explorer::to_json(&explorer::tree(
            &texts(args, "paths"),
            &texts(args, "includes"),
        ))),
        // {"file", "brief"} → the header CubeMX writes on top of a generated file
        "cube_header" => Ok(json!(explorer::cube_header(
            text(args, "file"),
            text(args, "brief")
        ))),
        // {"prefix": "stm32f1xx", "handlers": [name]} → stm32f1xx_it.h
        "it_header" => Ok(json!(explorer::it_header(
            text(args, "prefix"),
            &texts(args, "handlers")
        ))),
        // {"prefix"} → stm32f1xx_hal_msp.c
        "hal_msp" => Ok(json!(explorer::hal_msp(text(args, "prefix")))),
        // → ["STM32F446RE", "STM32F103RB"]
        "families" => Ok(json!(family::FAMILIES)),
        // Clock Configuration (clock.rs). A tree is the object a project stores as `mcu.clock`.
        // → {"hsi", "hse", "ahb", "apb", "adc", "pllP", "limits"}
        "clock_tables" => Ok(clock::tables()),
        // {"family"} → tree
        "clock_default_tree" => Ok(Value::Object(clock::default_tree(text(args, "family")))),
        // {"family", "hz"} → tree
        "clock_tree_from_timer_hz" => Ok(Value::Object(clock::tree_from_timer_hz(
            text(args, "family"),
            args.get("hz").and_then(Value::as_f64).unwrap_or(f64::NAN),
        ))),
        // {"family", "tree"} → {"hsi", "hse", "vcoIn", "vco", "pll", "pllQ", "sysclk", "hclk", "pclk1", "pclk2", "tim1", "tim2", "adc"}
        "clock_frequencies" => Ok(clock::frequencies_json(&clock::frequencies(
            text(args, "family"),
            &object(args, "tree"),
        ))),
        // {"family", "hclk"} → {"latency", "overDrive"}
        "clock_flash" => {
            let hclk = args.get("hclk").and_then(Value::as_f64).unwrap_or(f64::NAN);
            Ok(json!({
                "latency": clock::flash_latency(text(args, "family"), hclk),
                "overDrive": clock::needs_over_drive(text(args, "family"), hclk),
            }))
        }
        // {"family", "tree"} → {"problems": [text], "adc": text | null}
        "clock_problems" => {
            let (family, tree) = (text(args, "family"), object(args, "tree"));
            Ok(json!({
                "problems": clock::problems(family, &tree)?,
                "adc": clock::adc_problem(family, &tree)?,
            }))
        }
        // {"family", "tree": any} → tree, or the error of the first bad field
        "clock_validate" => Ok(Value::Object(clock::validate(
            text(args, "family"),
            args.get("tree").unwrap_or(&Value::Null),
        )?)),
        // {"family", "values": {.ioc key: text}} → tree | null
        "clock_tree_from_ioc" => Ok(clock::tree_from_ioc(
            text(args, "family"),
            &object(args, "values"),
        )?
        .map_or(Value::Null, Value::Object)),
        // {"previous", "generated", "previousDefault", "others": [text], "generator": [text]} → {"code", "moved"}
        "regenerate_main" => {
            let (code, moved) = regen::regenerate_main(
                text(args, "previous"),
                text(args, "generated"),
                text(args, "previousDefault"),
                &texts(args, "others"),
                &texts(args, "generator"),
            );
            Ok(json!({ "code": code, "moved": moved }))
        }
        // {"previous", "generated", "previousDefault"} → text
        "keep_user_code" => Ok(json!(regen::keep_user_code(
            text(args, "previous"),
            text(args, "generated"),
            text(args, "previousDefault")
        ))),
        // {"previous", "generated", "previousDefault", "generator": [text]} → {"source", "moved"}
        "adopt_outside_code" => {
            let generator = texts(args, "generator");
            let mut known = vec![text(args, "generated"), text(args, "previousDefault")];
            known.extend(generator.iter().map(String::as_str));
            let (source, moved) = regen::adopt_outside_code(text(args, "previous"), &known);
            Ok(json!({ "source": source, "moved": moved }))
        }
        // {"source", "others": [text]} → text
        "drop_shadowed_handlers" => Ok(json!(regen::drop_shadowed_handlers(
            text(args, "source"),
            &texts(args, "others")
        ))),
        // {"source"} → [{"kind", "name", "start", "end", "text", "comment"}] or null; offsets in UTF-16 code units
        "top_level_items" => {
            let source = text(args, "source");
            Ok(match regen::top_level_items(source) {
                Some(items) => json!(items
                    .iter()
                    .map(|k| json!({
                        "kind": k.kind.as_str(),
                        "name": k.name,
                        "start": utf16_offset(source, k.start),
                        "end": utf16_offset(source, k.end),
                        "text": k.text,
                        "comment": k.comment,
                    }))
                    .collect::<Vec<_>>()),
                None => Value::Null,
            })
        }
        // [argument, …] → a function of a module that takes its arguments in order (rust-core.js rustFn)
        _ => args
            .as_array()
            .and_then(|list| {
                periph::call(name, list)
                    .or_else(|| mcu::call(name, list))
                    .or_else(|| cformat::call(name, list))
                    .or_else(|| csymbols::call(name, list))
                    .or_else(|| csedit::call(name, list))
                    .or_else(|| halgen::call(name, list))
                    .or_else(|| mcuconfig::call(name, list))
            })
            .unwrap_or_else(|| Err(format!("stm-core: 알 수 없는 함수입니다: {name}"))),
    }
}

/// {"a": "x", …} → the map; anything else reads as empty.
fn text_map(value: Option<&Value>) -> std::collections::HashMap<String, String> {
    value
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// The module of a device as device-assistance.js deviceModule makes it.
fn docs_module(value: &Value) -> docs_regions::Module {
    let pairs = |key: &str, first: &str, second: &str| -> Vec<(String, String)> {
        value
            .get(key)
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .map(|item| {
                        (
                            text(item, first).to_string(),
                            text(item, second).to_string(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default()
    };
    docs_regions::Module {
        declarations: text(value, "declarations").to_string(),
        init: text(value, "init").to_string(),
        step: text(value, "step").to_string(),
        gpio: text(value, "gpio").to_string(),
        functions: pairs("functions", "name", "body"),
        handles: pairs("handles", "type", "name"),
        coupled: value
            .get("coupled")
            .filter(|c| c.is_object())
            .map(|c| docs_regions::Coupled {
                functions: text_map(c.get("functions")),
                handles: text_map(c.get("handles")),
                before: text_map(c.get("before")),
                in_pair: c.get("inPair").and_then(Value::as_bool).unwrap_or(true),
                stored: texts(c, "stored").into_iter().collect(),
            }),
    }
}

/// The other applied devices, or `None` when the caller has not worked them out yet.
fn docs_others(args: &Value) -> Option<Vec<docs_regions::Other>> {
    args.get("others").and_then(Value::as_array).map(|list| {
        list.iter()
            .map(|o| docs_regions::Other {
                tag: text(o, "tag").to_string(),
                needs: texts(o, "needs").into_iter().collect(),
            })
            .collect()
    })
}

/// A text argument; missing or not a string reads as empty (JavaScript's `String(value || '')`).
fn object(args: &Value, key: &str) -> serde_json::Map<String, Value> {
    args.get(key)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn text<'a>(args: &'a Value, key: &str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or("")
}

/// A list-of-texts argument; entries that are not strings read as empty.
fn texts(args: &Value, key: &str) -> Vec<String> {
    args.get(key)
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .map(|v| v.as_str().unwrap_or("").to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// A byte offset of `source` as the offset JavaScript uses for the same place (UTF-16 code units).
fn utf16_offset(source: &str, byte: usize) -> usize {
    source[..byte.min(source.len())].encode_utf16().count()
}

/// The JSON text of a request → the JSON text of its answer. A request that is not JSON is an error answer too.
pub fn call(request: &str) -> String {
    let answer = match serde_json::from_str::<Value>(request) {
        Ok(value) => {
            let name = value.get("fn").and_then(Value::as_str).unwrap_or("");
            match dispatch(name, value.get("args").unwrap_or(&Value::Null)) {
                Ok(result) => json!({ "ok": result }),
                Err(message) => json!({ "error": message }),
            }
        }
        Err(error) => json!({ "error": format!("stm-core: 요청을 읽을 수 없습니다: {error}") }),
    };
    answer.to_string()
}

// ---------------------------------------------------------------------------------------------- WebAssembly boundary
// The caller owns the memory it asks for: stm_alloc → write the request → stm_call → read the answer → stm_free both.

/// Reserves `len` bytes in the module's memory and returns their address.
#[no_mangle]
pub extern "C" fn stm_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len.max(1));
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// Gives back memory from `stm_alloc` or from an answer of `stm_call`.
///
/// # Safety
/// `pointer` and `len` must be what `stm_alloc(len)` returned, or the address and length of an answer.
#[no_mangle]
pub unsafe extern "C" fn stm_free(pointer: *mut u8, len: usize) {
    if !pointer.is_null() {
        drop(Vec::from_raw_parts(pointer, 0, len.max(1)));
    }
}

/// Answers the request at `pointer` (`len` bytes of UTF-8 JSON). The result packs the answer's address in the high
/// 32 bits and its length in the low 32 bits; the caller frees it with `stm_free`.
///
/// # Safety
/// `pointer` must address `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn stm_call(pointer: *const u8, len: usize) -> u64 {
    let request = std::slice::from_raw_parts(pointer, len);
    let answer = match std::str::from_utf8(request) {
        Ok(text) => call(text),
        Err(_) => json!({ "error": "stm-core: 요청이 UTF-8이 아닙니다." }).to_string(),
    };
    let mut bytes = answer.into_bytes();
    bytes.shrink_to_fit();
    // An answer's allocation has capacity == length (at least one byte), which is what stm_free rebuilds.
    if bytes.is_empty() {
        bytes.push(b' ');
    }
    let length = bytes.len() as u64;
    let address = bytes.as_mut_ptr() as u64;
    std::mem::forget(bytes);
    (address << 32) | length
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_call_answers_in_json() {
        let answer: Value = serde_json::from_str(&call(
            r#"{"fn":"family_gpio_pins","args":{"family":"STM32F103RB"}}"#,
        ))
        .unwrap();
        assert_eq!(answer["ok"].as_array().unwrap().len(), 51);
        let answer: Value = serde_json::from_str(&call(r#"{"fn":"families"}"#)).unwrap();
        assert_eq!(answer["ok"], json!(["STM32F446RE", "STM32F103RB"]));
    }

    #[test]
    fn errors_are_answers_not_panics() {
        for request in [
            r#"{"fn":"family_gpio_pins","args":{"family":"R7FA6E10F"}}"#,
            r#"{"fn":"family_gpio_pins"}"#,
            r#"{"fn":"nope"}"#,
            "not json",
            "",
        ] {
            let answer: Value = serde_json::from_str(&call(request)).unwrap();
            assert!(answer["error"].is_string(), "{request} → {answer}");
        }
    }

    #[test]
    fn the_boundary_round_trips_through_raw_memory() {
        let request = br#"{"fn":"family_gpio_pins","args":{"family":"STM32F446RE"}}"#;
        unsafe {
            let input = stm_alloc(request.len());
            std::ptr::copy_nonoverlapping(request.as_ptr(), input, request.len());
            let packed = stm_call(input, request.len());
            stm_free(input, request.len());
            // On the host the address does not fit 32 bits; this test checks the length half and the round trip of
            // a wasm-sized address is covered by the JavaScript tests.
            let length = (packed & 0xffff_ffff) as usize;
            assert!(length > 50 * 5);
        }
    }
}
