//! Edits of C sources and of a project's list of source files, and the interrupt handlers CubeMX writes.
//! Moved here from `src/c-source-edit.js` (maskC, cFunctions, insertMainHooks, replaceIdentifiers, checksum),
//! `src/source-files.js` and `src/irq-handlers.js` (feature 62); those files now only call these functions.
//! Offsets count UTF-16 units, as the JavaScript callers use them: see `jsre::Text`.

use crate::csource;
use crate::js_re;
use crate::jsre::{trim, Text};
use crate::periph::{is_serial, is_timer, js_truthy, serial_handle, timer_of_irq};
use regex_lite::Captures;
use serde_json::{json, Map, Value};

// ---------- c-source-edit.js ----------

/// The source with comments and literals as spaces, and the same for its stand-in (see `jsre::Text`).
fn masked(text: &Text) -> Text {
    let before = text.proxy().as_bytes();
    let after = csource::mask_c(text.proxy());
    let hide: Vec<bool> = before
        .iter()
        .zip(after.as_bytes())
        .map(|(a, b)| a != b)
        .collect();
    text.masked(&hide)
}
/// Offset-preserving masking allows edits without interpreting comments or string literals as C.
pub fn mask_c(source: &str) -> String {
    let text = Text::new(source);
    let all = masked(&text);
    all.slice(0, all.len())
}
/// `[{name, start, end, open, body, text, signature}]` of the functions defined at brace depth 0.
pub fn c_functions(source: &str) -> Result<Vec<Value>, String> {
    let text = Text::new(source);
    Ok(csource::c_functions_as_javascript(text.proxy())?
        .into_iter()
        .map(|f| {
            json!({
                "name": f.name, "start": f.start, "end": f.end, "open": f.open,
                "body": text.slice(f.open + 1, f.end - 1),
                "text": text.slice(f.start, f.end),
                "signature": trim(&text.slice(f.start, f.open)),
            })
        })
        .collect())
}

js_re!(
    PLACEHOLDER_WAIT,
    r"(/\* USER CODE BEGIN 3 \*/)\s*HAL_Delay\(500\);\s*(/\* USER CODE END 3 \*/)"
);
js_re!(
    MAIN_LOOP,
    r"\b(?:while\s*\(\s*(?:1|true)\s*\)|for\s*\(\s*;\s*;\s*\))\s*\{"
);
/// Adds the calls of the device code to `main`: STM_Devices_Init before the loop, STM_Devices_Step in it.
pub fn insert_main_hooks(source: &str) -> Result<String, String> {
    if source.contains("STM_Devices_Init();") && source.contains("STM_Devices_Step();") {
        return Ok(source.to_string());
    }
    // Remove only the untouched generator's placeholder wait, never a user's loop logic.
    let source = PLACEHOLDER_WAIT.replace(source, |m: &Captures| format!("{}\n{}", &m[1], &m[2]));
    let text = Text::new(&source);
    let main = csource::c_functions_as_javascript(text.proxy())?
        .into_iter()
        .find(|f| f.name == "main")
        .ok_or("예제를 적용하려면 main(void) 함수가 필요합니다.")?;
    let mask = masked(&text);
    let proxy = mask.proxy();
    let mut from = main.open + 1;
    let mut found = None;
    // The first `while (1) {` / `for (;;) {` of main that is not inside another block.
    while let Some(m) = MAIN_LOOP.find_at(proxy, from) {
        if m.start() >= main.end {
            break;
        }
        let depth: i64 = proxy.as_bytes()[main.open + 1..m.start()]
            .iter()
            .map(|b| match b {
                b'{' => 1,
                b'}' => -1,
                _ => 0,
            })
            .sum();
        if depth == 0 {
            found = Some(m);
            break;
        }
        from = m.end();
    }
    let lop = found.ok_or("main 함수에 while(1) { ... } 실행 루프를 추가한 뒤 다시 적용하세요.")?;
    let place = |needle: &str, fallback: usize| {
        text.proxy()
            .get(main.open..)
            .and_then(|rest| rest.find(needle))
            .map(|at| main.open + at)
            .filter(|at| *at < main.end)
            .map_or(fallback, |at| at + 23)
    };
    let mut insertions = [
        (
            place("/* USER CODE BEGIN 2 */", lop.start()),
            "\n  STM_Devices_Init();\n  ",
        ),
        (
            place("/* USER CODE BEGIN 3 */", lop.end()),
            "\n    STM_Devices_Step();\n    ",
        ),
    ];
    // The later place first (a stable sort, as JavaScript's: equal places keep their order).
    insertions.sort_by_key(|a| std::cmp::Reverse(a.0));
    let (first, second) = (insertions[1], insertions[0]);
    // `second` (the later place) was inserted first in the JavaScript; at one and the same place the text of the
    // insertion made last comes first.
    let mut out = String::from("#include \"stm_device_docs.h\"\n");
    out.push_str(&text.slice(0, first.0));
    out.push_str(first.1);
    out.push_str(&text.slice(first.0, second.0));
    out.push_str(second.1);
    out.push_str(&text.slice(second.0, text.len()));
    Ok(out)
}

js_re!(
    TOKEN,
    r#"/\*[\s\S]*?\*/|//[^\n]*|"(?:\\[^\n\r\x{2028}\x{2029}]|[^"\\])*"|'(?:\\[^\n\r\x{2028}\x{2029}]|[^'\\])*'|\b[A-Za-z_]\w*\b"#
);
/// Every identifier that `mapping` names replaced by its text; comments and literals are left alone.
pub fn replace_identifiers(source: &str, mapping: &Value) -> String {
    TOKEN
        .replace_all(source, |m: &Captures| {
            let token = &m[0];
            match mapping.get(token).filter(|to| js_truthy(to)) {
                Some(Value::String(to)) => to.clone(),
                Some(other) => crate::mcu::js_display(Some(other)),
                None => token.to_string(),
            }
        })
        .into_owned()
}
/// FNV-1a over the UTF-16 units of a text, in hexadecimal.
pub fn checksum(text: &str) -> String {
    let mut h: u32 = 2_166_136_261;
    for unit in text.encode_utf16() {
        h = (h ^ u32::from(unit)).wrapping_mul(16_777_619);
    }
    format!("{h:x}")
}

// ---------- source-files.js ----------

/// A project source name: a file name, or a path of up to six folders (`Core/Src/app.c`, as a CubeIDE project keeps
/// its files). Folder and file names are letters, digits, _ . - and do not start with a dot, so `.` / `..` cannot
/// appear. .s (startup code) and .ld (linker script) are the two other kinds a CubeIDE project holds.
pub const SOURCE_PATH: &str =
    r"^(?:[A-Za-z0-9_][\w.-]{0,40}/){0,6}[A-Za-z0-9_][\w.-]{0,70}\.(c|h|cpp|hpp|cc|s|ld)$";
pub const MAX_SOURCE_FILES: usize = 120;
pub const MAX_SOURCE_BYTES: usize = 1_000_000;
js_re!(SOURCE_PATH_RE, SOURCE_PATH);
js_re!(RESERVED, r"(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)");
js_re!(
    INCLUDE_LINE,
    r#"(?m)^([ \t]*#[ \t]*include[ \t]*")([^"\n]+)(")"#
);

pub fn base_name(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}
pub fn folder_of(name: &str) -> &str {
    name.rfind('/').map_or("", |at| &name[..at])
}
/// Source text as the app keeps it: no byte order mark, lines ending in \n.
pub fn normalize_text(text: &str) -> String {
    let text = text.strip_prefix('\u{FEFF}').unwrap_or(text);
    // Most sources are already so: one copy, without looking at each character twice.
    if !text.contains('\r') {
        return text.to_string();
    }
    text.replace("\r\n", "\n").replace('\r', "\n")
}
/// The file an #include "x.h" / "dir/x.h" written in `from` means: the same folder first, then the path from the
/// root, then any folder.
pub fn resolve_include<'a>(names: &[&'a str], include: &str, from: &str) -> Option<&'a str> {
    let clean = include.strip_prefix("./").unwrap_or(include);
    let here = folder_of(from);
    let joined = if here.is_empty() {
        clean.to_string()
    } else {
        format!("{here}/{clean}")
    };
    let mut parts: Vec<&str> = Vec::new();
    for p in joined.split('/') {
        if p == ".." {
            parts.pop();
        } else if p != "." {
            parts.push(p);
        }
    }
    let exact = parts.join("/");
    let suffix = format!("/{clean}");
    names
        .iter()
        .copied()
        .find(|n| *n == exact)
        .or_else(|| names.iter().copied().find(|n| *n == clean))
        .or_else(|| names.iter().copied().find(|n| n.ends_with(&suffix)))
        .or_else(|| {
            if clean.contains('/') {
                None
            } else {
                names.iter().copied().find(|n| base_name(n) == clean)
            }
        })
}
/// JavaScript's `toLowerCase` for the names a project can have (ASCII; other text is lowered as Rust does).
fn lower(text: &str) -> String {
    text.to_lowercase()
}
/// Why `name` cannot be added next to the sources `names`, or "": "main" (main.c in any case or folder is the
/// project's main source), "same" (the name exists, compared without case as Windows does), "folder" (a file would
/// have to be a folder too: app.c next to app.c/x.c).
pub fn name_clash(names: &[&str], name: &str) -> &'static str {
    let low = lower(name);
    if base_name(&low) == "main.c" {
        return "main";
    }
    for other in names {
        let o = lower(other);
        if o == low {
            return "same";
        }
        if o.starts_with(&format!("{low}/")) || low.starts_with(&format!("{o}/")) {
            return "folder";
        }
    }
    ""
}
/// Rewrites or finds the #include lines of `text` (a source named `from`) that mean the file `target` among `names`.
fn includes_of(
    text: &str,
    from: &str,
    names: &[&str],
    target: &str,
    to: Option<&str>,
) -> (bool, String) {
    let mut found = false;
    let out = INCLUDE_LINE.replace_all(text, |m: &Captures| {
        let path = &m[2];
        if resolve_include(names, path, from) != Some(target) {
            return m[0].to_string();
        }
        found = true;
        match to {
            // The written path keeps its folders and gets the new file name ("Inc/app.h" → "Inc/util.h").
            Some(to) => format!(
                "{}{}{to}{}",
                &m[1],
                &path[..path.len() - base_name(path).len()],
                &m[3]
            ),
            None => m[0].to_string(),
        }
    });
    (found, out.into_owned())
}
/// Adds, renames or deletes a source file. `project`: `{code, firmware}` → the two as they are afterwards.
pub fn change_source_file(
    project: &Value,
    action: &str,
    name: Option<&str>,
    next_name: Option<&str>,
) -> Result<Value, String> {
    let mut code = project
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let mut firmware = match project.get("firmware") {
        Some(f) if !f.is_null() => f.clone(),
        _ => json!({"mode": "sketch", "files": []}),
    };
    let mut files: Vec<Value> = firmware
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let name_of = |f: &Value| {
        f.get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    if action != "add" && name == Some("main.c") {
        return Err("main.c는 이름 변경·삭제할 수 없습니다.".into());
    }
    let target = if action == "rename" { next_name } else { name };
    if action != "delete" {
        let good = target.filter(|t| {
            SOURCE_PATH_RE.is_match(t) && !t.split('/').any(|part| RESERVED.is_match(part))
        });
        let Some(target) = good else {
            return Err("영문·숫자·밑줄로 된 .c, .h, .cpp, .hpp 파일명을 입력하세요. 폴더는 Core/Src/app.c처럼 /로 나눕니다.".into());
        };
        if lower(base_name(target)) == "main.c" {
            return Err("main.c는 프로젝트의 주 소스 이름입니다. 다른 이름을 쓰세요.".into());
        }
        let others: Vec<String> = files
            .iter()
            .map(name_of)
            .filter(|n| action != "rename" || Some(n.as_str()) != name)
            .collect();
        let others: Vec<&str> = others.iter().map(String::as_str).collect();
        match name_clash(&others, target) {
            "same" => return Err("같은 이름의 파일이 이미 있습니다.".into()),
            "folder" => {
                return Err(
                    "파일 이름과 폴더 이름이 겹칩니다: 다른 소스의 경로에 같은 이름이 있습니다."
                        .into(),
                )
            }
            _ => {}
        }
    }
    let name = name.unwrap_or("");
    if action == "add" {
        if files.len() >= MAX_SOURCE_FILES {
            return Err(format!(
                "보조 소스는 {MAX_SOURCE_FILES}개까지 추가할 수 있습니다."
            ));
        }
        let text = if name.ends_with(".h") || name.ends_with(".hpp") {
            "#pragma once\n"
        } else if name.ends_with(".s") || name.ends_with(".ld") {
            ""
        } else {
            "#include \"main.h\"\n\n"
        };
        files.push(json!({"name": name, "text": text}));
    } else {
        let index = files
            .iter()
            .position(|f| name_of(f) == name)
            .ok_or("파일을 찾을 수 없습니다.")?;
        // Only the #include lines that mean this file: another folder may hold a header of the same name
        // (Core/Inc/app.h and Drivers/app.h), and its includes stay as they are.
        let all: Vec<String> = files.iter().map(name_of).collect();
        let names: Vec<&str> = all.iter().map(String::as_str).collect();
        let main_folder = firmware
            .get("mainFolder")
            .filter(|f| js_truthy(f))
            .map(|f| crate::mcu::js_display(Some(f)));
        let main = main_folder.map_or("main.c".to_string(), |folder| format!("{folder}/main.c"));
        let text_of = |f: &Value| {
            f.get("text")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string()
        };
        if action == "delete" {
            let used = includes_of(&code, &main, &names, name, None).0
                || files.iter().any(|f| {
                    name_of(f) != name
                        && includes_of(&text_of(f), &name_of(f), &names, name, None).0
                });
            if used {
                return Err(
                    "다른 소스에서 include하는 파일입니다. 해당 include를 먼저 수정하세요.".into(),
                );
            }
            files.remove(index);
        } else if action == "rename" {
            let next = next_name.unwrap_or("");
            let to = base_name(next);
            code = includes_of(&code, &main, &names, name, Some(to)).1;
            for f in files.iter_mut() {
                let text = includes_of(&text_of(f), &name_of(f), &names, name, Some(to)).1;
                if let Some(map) = f.as_object_mut() {
                    map.insert("text".into(), json!(text));
                }
            }
            if let Some(map) = files[index].as_object_mut() {
                map.insert("name".into(), json!(next));
            }
        } else {
            return Err("파일 작업이 올바르지 않습니다.".into());
        }
    }
    if let Some(map) = firmware.as_object_mut() {
        map.insert("files".into(), Value::Array(files));
    }
    Ok(json!({"code": code, "firmware": firmware}))
}

// ---------- irq-handlers.js ----------

pub fn dma_handle(request: &str) -> String {
    if request == "MEMTOMEM" {
        "hdma_memtomem".into()
    } else {
        format!("hdma_{}", request.to_lowercase())
    }
}
fn digits_of(id: &str) -> String {
    id.chars().filter(char::is_ascii_digit).collect()
}
/// `Number(text)` of the digits after a pin's port.
fn pin_number(pin: &str) -> f64 {
    let text = pin.get(2..).unwrap_or("").trim();
    if text.is_empty() {
        0.0
    } else {
        text.parse().unwrap_or(f64::NAN)
    }
}
js_re!(EXTI_ID, r"^EXTI(\d+)(?:_(\d+))?$");
js_re!(I2C_ID, r"^(I2C[123])_(EV|ER)$");
js_re!(SPI_ID, r"^SPI[123]$");

/// Interrupt handlers of the enabled NVIC lines, as CubeMX writes them into stm32xxxx_it.c:
/// `[{name, irq, body, extern, shown}]` — `body` is empty for a line with nothing to serve (a peripheral that is off),
/// `shown` marks handlers the generated main.c carries.
pub fn irq_handlers(mcu: &Value) -> Vec<Value> {
    let empty = Map::new();
    let section = |key: &str| mcu.get(key).and_then(Value::as_object).unwrap_or(&empty);
    let (peripherals, pins) = (section("peripherals"), section("pins"));
    let enabled = |id: &str| {
        peripherals
            .get(id)
            .and_then(|p| p.get("enabled"))
            .is_some_and(js_truthy)
    };
    let mut out: Vec<Value> = Vec::new();
    let mut streams: Vec<String> = Vec::new();
    // DMA stream interrupts generated by MX_DMA_Init need HAL_DMA_IRQHandler on the linked handle.
    for (request, d) in section("dma") {
        let Some(stream) = d.get("stream").filter(|s| js_truthy(s)) else {
            continue;
        };
        let stream = crate::mcu::js_display(Some(stream));
        if streams.contains(&stream) {
            continue;
        }
        let handle = dma_handle(request);
        out.push(json!({
            "name": format!("{stream}_IRQHandler"), "irq": format!("{stream}_IRQn"),
            "body": format!("HAL_DMA_IRQHandler(&{handle});"), "extern": format!("extern DMA_HandleTypeDef {handle};"),
            "shown": true,
        }));
        streams.push(stream);
    }
    // Each enabled interrupt calls the HAL handler of its own peripheral; EXTI lines only serve the pins they route.
    let exti_pins = |lo: f64, hi: f64| -> String {
        pins.iter()
            .filter(|(pin, q)| {
                let n = pin_number(pin);
                q.get("function") == Some(&json!("GPIO_EXTI")) && n >= lo && n <= hi
            })
            .map(|(pin, _)| {
                format!(
                    "HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_{});",
                    pin.get(2..).unwrap_or("")
                )
            })
            .collect()
    };
    // What a handler adds to `{name, irq, shown: false}`, in the order its keys are written.
    let of =
        |kind: &str, id: &str, name: &str, call: &str, shown: bool| -> Vec<(&'static str, Value)> {
            if enabled(id) {
                vec![
                    (
                        "extern",
                        json!(format!("extern {kind}_HandleTypeDef {name};")),
                    ),
                    ("body", json!(format!("{call}(&{name});"))),
                    ("shown", json!(shown)),
                ]
            } else {
                vec![("body", json!(""))]
            }
        };
    let body = |id: &str| -> Vec<(&'static str, Value)> {
        // A timer/UART interrupt left on for a disabled peripheral has no handle to serve.
        if (is_timer(id) || is_serial(id)) && !enabled(id) {
            return vec![("body", json!(""))];
        }
        if is_timer(id) {
            let n = &id[3..];
            return vec![
                ("body", json!(format!("HAL_TIM_IRQHandler(&htim{n});"))),
                (
                    "extern",
                    json!(format!("extern TIM_HandleTypeDef htim{n};")),
                ),
                ("shown", json!(true)),
            ];
        }
        if is_serial(id) {
            let sync =
                peripherals.get(id).and_then(|p| p.get("mode")) == Some(&json!("synchronous"));
            let (kind, handle) = if sync {
                ("USART", format!("husart{}", digits_of(id)))
            } else {
                ("UART", serial_handle(id))
            };
            return vec![
                ("body", json!(format!("HAL_{kind}_IRQHandler(&{handle});"))),
                (
                    "extern",
                    json!(format!("extern {kind}_HandleTypeDef {handle};")),
                ),
                ("shown", json!(true)),
            ];
        }
        if let Some(m) = EXTI_ID.captures(id) {
            let a: f64 = m[1].parse().unwrap_or(f64::NAN);
            let b: f64 = m
                .get(2)
                .map_or(a, |g| g.as_str().parse().unwrap_or(f64::NAN));
            return vec![
                ("body", json!(exti_pins(a.min(b), a.max(b)))),
                ("shown", json!(true)),
            ];
        }
        if let Some(m) = I2C_ID.captures(id) {
            return of(
                "I2C",
                &m[1],
                &format!("h{}", m[1].to_lowercase()),
                &format!("HAL_I2C_{}_IRQHandler", &m[2]),
                false,
            );
        }
        if SPI_ID.is_match(id) {
            return of(
                "SPI",
                id,
                &format!("h{}", id.to_lowercase()),
                "HAL_SPI_IRQHandler",
                false,
            );
        }
        match id {
            "ADC" | "ADC1_2" => of("ADC", "ADC1", "hadc1", "HAL_ADC_IRQHandler", false),
            "DCMI" => of("DCMI", "DCMI", "hdcmi", "HAL_DCMI_IRQHandler", true),
            // RTC: alarm (EXTI 17), F4 wakeup (EXTI 22), F1 second / overflow interrupt.
            "RTC_Alarm" => of("RTC", "RTC", "hrtc", "HAL_RTC_AlarmIRQHandler", true),
            "RTC_WKUP" => of(
                "RTC",
                "RTC",
                "hrtc",
                "HAL_RTCEx_WakeUpTimerIRQHandler",
                true,
            ),
            "RTC" => of("RTC", "RTC", "hrtc", "HAL_RTCEx_RTCIRQHandler", true),
            "SDIO" => of("SD", "SDIO", "hsd", "HAL_SD_IRQHandler", true),
            "WWDG" => of("WWDG", "WWDG", "hwwdg", "HAL_WWDG_IRQHandler", true),
            _ => vec![("body", json!(""))],
        }
    };
    for (irq, p) in section("nvic") {
        let id = irq.replacen("_IRQn", "", 1);
        if !p.get("enabled").is_some_and(js_truthy) || streams.contains(&id) {
            continue;
        }
        let mut h = Map::new();
        h.insert("name".into(), json!(format!("{id}_IRQHandler")));
        h.insert("irq".into(), json!(irq));
        h.insert("shown".into(), json!(false));
        for (key, value) in body(timer_of_irq(irq).unwrap_or(&id)) {
            h.insert(key.into(), value);
        }
        // TIM6_DAC_IRQn: TIM6's update and the DAC's DMA underrun share the vector, as CubeMX's handler serves both.
        if irq == "TIM6_DAC_IRQn" && enabled("DAC") {
            let text = |h: &Map<String, Value>, key: &str| {
                h.get(key).and_then(Value::as_str).unwrap_or("").to_string()
            };
            let dac_body = "HAL_DAC_IRQHandler(&hdac);";
            let dac_extern = "extern DAC_HandleTypeDef hdac;";
            let own_extern = text(&h, "extern");
            let joined = if own_extern.is_empty() {
                dac_extern.to_string()
            } else {
                format!("{own_extern}\n{dac_extern}")
            };
            let own_body = text(&h, "body");
            h.insert("body".into(), json!(format!("{own_body}{dac_body}")));
            h.insert("extern".into(), json!(joined));
            h.insert("shown".into(), json!(true));
        }
        out.push(Value::Object(h));
    }
    out
}
/// CubeMX-style handler text for main.c, with its two user sections.
pub fn handler_text(h: &Value) -> Vec<String> {
    let field = |key: &str| crate::mcu::js_display(h.get(key));
    let (name, irq) = (field("name"), field("irq"));
    let body = h.get("body").and_then(Value::as_str).unwrap_or("");
    let mut lines = vec![
        format!("void {name}(void) {{"),
        format!("  /* USER CODE BEGIN {irq} 0 */"),
        format!("  /* USER CODE END {irq} 0 */"),
    ];
    // One line per statement: the text is split after every `;`.
    let mut statement = String::new();
    let mut pieces: Vec<String> = Vec::new();
    for c in body.chars() {
        statement.push(c);
        if c == ';' {
            pieces.push(std::mem::take(&mut statement));
        }
    }
    if !statement.is_empty() || pieces.is_empty() {
        pieces.push(statement);
    }
    lines.extend(pieces.into_iter().map(|s| format!("  {s}")));
    lines.push(format!("  /* USER CODE BEGIN {irq} 1 */"));
    lines.push(format!("  /* USER CODE END {irq} 1 */"));
    lines.push("}".into());
    lines
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
    let opt = |i: usize| args.get(i).and_then(Value::as_str);
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let list = |i: usize| -> Vec<&str> {
        args.get(i)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(|item| item.as_str().unwrap_or(""))
                    .collect()
            })
            .unwrap_or_default()
    };
    Some(Ok(match name {
        "mask_c" => json!(mask_c(s(0))),
        "c_functions" => return Some(c_functions(s(0)).map(Value::Array)),
        "insert_main_hooks" => return Some(insert_main_hooks(s(0)).map(|text| json!(text))),
        "replace_identifiers" => json!(replace_identifiers(s(0), v(1))),
        "checksum" => json!(checksum(s(0))),
        "source_tables" => {
            json!({"path": SOURCE_PATH, "maxFiles": MAX_SOURCE_FILES, "maxBytes": MAX_SOURCE_BYTES})
        }
        "base_name" => json!(base_name(s(0))),
        "folder_of" => json!(folder_of(s(0))),
        "normalize_text" => json!(normalize_text(s(0))),
        // [names, include, from] → name | null
        "resolve_include" => json!(resolve_include(&list(0), s(1), s(2))),
        "name_clash" => json!(name_clash(&list(0), s(1))),
        // [{code, firmware}, action, name, nextName] → {code, firmware}
        "change_source_file" => return Some(change_source_file(v(0), s(1), opt(2), opt(3))),
        "dma_handle" => json!(dma_handle(s(0))),
        "irq_handlers" => Value::Array(irq_handlers(v(0))),
        "handler_text" => json!(handler_text(v(0))),
        _ => return None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_edits() {
        assert_eq!(
            mask_c("a /* 가 */ \"x\" b // c\nd"),
            "a             b     \nd"
        );
        let f = c_functions("/* 가 */ int main(void) { return 0; }\n").unwrap();
        // The text of a function starts after the previous `;`, `}` or line break: a comment before it is part of it.
        assert_eq!(f[0]["start"], json!(0));
        assert_eq!(f[0]["open"], json!(23));
        assert_eq!(f[0]["signature"], json!("/* 가 */ int main(void)"));
        assert_eq!(f[0]["body"], json!(" return 0; "));
        let hooked = insert_main_hooks("int main(void) {\n  /* USER CODE BEGIN 2 */\n  /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    HAL_Delay(500);\n    /* USER CODE END 3 */\n  }\n}\n").unwrap();
        assert_eq!(hooked, "#include \"stm_device_docs.h\"\nint main(void) {\n  /* USER CODE BEGIN 2 */\n  STM_Devices_Init();\n  \n  /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    STM_Devices_Step();\n    \n/* USER CODE END 3 */\n  }\n}\n");
        assert!(insert_main_hooks("void f(void){}").is_err());
        assert_eq!(
            replace_identifiers("a = b; /* a */ \"a\" a1", &json!({"a": "x", "b": ""})),
            "x = b; /* a */ \"a\" a1"
        );
        assert_eq!(checksum(""), "811c9dc5");
        assert_eq!(checksum("a"), "e40c292c");
    }

    #[test]
    fn source_files() {
        let names = ["Core/Inc/app.h", "Drivers/app.h", "util.h"];
        assert_eq!(
            resolve_include(&names, "app.h", "Core/Inc/x.c"),
            Some("Core/Inc/app.h")
        );
        assert_eq!(
            resolve_include(&names, "../Inc/app.h", "Core/Src/x.c"),
            Some("Core/Inc/app.h")
        );
        assert_eq!(
            resolve_include(&names, "./util.h", "Core/Src/x.c"),
            Some("util.h")
        );
        assert_eq!(resolve_include(&names, "no.h", ""), None);
        assert_eq!(name_clash(&["App.c", "dir/x.c"], "app.c"), "same");
        assert_eq!(name_clash(&["dir/x.c"], "DIR"), "folder");
        assert_eq!(name_clash(&[], "Core/Src/MAIN.C"), "main");
        assert_eq!(normalize_text("\u{FEFF}a\r\nb\rc"), "a\nb\nc");
        let p = json!({"code": "#include \"app.h\"\n", "firmware": {"mode": "hal", "files": [{"name": "app.h", "text": "x", "keep": 1}]}});
        let renamed = change_source_file(&p, "rename", Some("app.h"), Some("Inc/util.h")).unwrap();
        assert_eq!(renamed["code"], json!("#include \"util.h\"\n"));
        assert_eq!(
            renamed["firmware"]["files"][0],
            json!({"name": "Inc/util.h", "text": "x", "keep": 1})
        );
        assert_eq!(
            change_source_file(&p, "delete", Some("app.h"), None).unwrap_err(),
            "다른 소스에서 include하는 파일입니다. 해당 include를 먼저 수정하세요."
        );
        assert_eq!(change_source_file(&p, "add", Some("con.c"), None).unwrap_err(), "영문·숫자·밑줄로 된 .c, .h, .cpp, .hpp 파일명을 입력하세요. 폴더는 Core/Src/app.c처럼 /로 나눕니다.");
        let added = change_source_file(&json!({"code": ""}), "add", Some("a.h"), None).unwrap();
        assert_eq!(
            added["firmware"],
            json!({"mode": "sketch", "files": [{"name": "a.h", "text": "#pragma once\n"}]})
        );
    }

    #[test]
    fn handlers() {
        let mcu = json!({
            "pins": {"PC13": {"function": "GPIO_EXTI"}, "PA0": {"function": "GPIO_EXTI"}},
            "peripherals": {"USART2": {"enabled": true}, "TIM6": {"enabled": true}, "DAC": {"enabled": true}},
            "dma": {"USART2_RX": {"stream": "DMA1_Stream5"}},
            "nvic": {"USART2_IRQn": {"enabled": true}, "EXTI15_10_IRQn": {"enabled": true}, "TIM6_DAC_IRQn": {"enabled": true}, "DMA1_Stream5_IRQn": {"enabled": true}, "SPI1_IRQn": {"enabled": true}, "TIM2_IRQn": {"enabled": false}},
        });
        let h = irq_handlers(&mcu);
        assert_eq!(h.len(), 5);
        assert_eq!(
            h[0],
            json!({"name": "DMA1_Stream5_IRQHandler", "irq": "DMA1_Stream5_IRQn", "body": "HAL_DMA_IRQHandler(&hdma_usart2_rx);", "extern": "extern DMA_HandleTypeDef hdma_usart2_rx;", "shown": true})
        );
        assert_eq!(h[1]["body"], json!("HAL_UART_IRQHandler(&huart2);"));
        assert_eq!(
            h[2]["body"],
            json!("HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_13);")
        );
        assert_eq!(
            h[3]["body"],
            json!("HAL_TIM_IRQHandler(&htim6);HAL_DAC_IRQHandler(&hdac);")
        );
        assert_eq!(
            h[4],
            json!({"name": "SPI1_IRQHandler", "irq": "SPI1_IRQn", "shown": false, "body": ""})
        );
        assert_eq!(
            handler_text(&h[3]),
            [
                "void TIM6_DAC_IRQHandler(void) {",
                "  /* USER CODE BEGIN TIM6_DAC_IRQn 0 */",
                "  /* USER CODE END TIM6_DAC_IRQn 0 */",
                "  HAL_TIM_IRQHandler(&htim6);",
                "  HAL_DAC_IRQHandler(&hdac);",
                "  /* USER CODE BEGIN TIM6_DAC_IRQn 1 */",
                "  /* USER CODE END TIM6_DAC_IRQn 1 */",
                "}"
            ]
        );
        assert_eq!(
            handler_text(&json!({"name": "X", "irq": "Y", "body": ""}))[3],
            "  "
        );
    }
}
