//! Feature 45: every file of the CubeIDE project tree is edited in place, as in CubeIDE. A file the app writes (what
//! the build adds, the per-peripheral pairs) or reads from the STM32Cube SDK becomes a project file on its first edit
//! — only that file is stored, under the path the tree shows it at, with `origin` ('gen' or 'sdk', and `of`: the SDK
//! path). The build then compiles it in place of the generated / SDK one.
//!
//! Two kinds of files, as STM32CubeMX treats them:
//! - regenerated: main.c, main.h, stm32xxxx_it.c, stm32xxxx_hal_conf.h and the per-peripheral .c/.h pairs.
//!   Generating the code again keeps only what is inside the USER CODE sections.
//! - generated once: syscalls.c, sysmem.c, system_stm32xxxx.c, the startup file, the linker script and Drivers/.
//!   CubeMX does not write them again once they exist, so an edit stays.
//!
//! A file without `origin` is the user's own: it is never regenerated.
//!
//! Moved here from `src/project-overrides.js` (feature 62).

use crate::buildenv::{build_environment, prefix_of};
use crate::cformat::format_code;
use crate::jsre::{is_word, trim};
use crate::mcu::js_display;
use crate::mcuconfig::validate_mcu;
use crate::periph::js_truthy;
use crate::pfiles::{generate_hal, peripheral_files};
use crate::regen::keep_user_code;
use serde_json::{json, Value};

const PAIRS: [&str; 13] = [
    "gpio", "usart", "i2c", "spi", "tim", "adc", "dac", "dma", "rtc", "iwdg", "wwdg", "sdio",
    "dcmi",
];
const BROKEN: &str = "Cannot read properties of undefined";

fn base(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}
/// `gpio.c`, `usart.h`, …: a file of a per-peripheral pair.
fn is_pair(name: &str) -> bool {
    name.strip_suffix(".c")
        .or_else(|| name.strip_suffix(".h"))
        .is_some_and(|stem| PAIRS.contains(&stem))
}
/// Files the built-in interpreter does not compile: only the ARM GCC build uses an edit there.
pub fn arm_only(name: &str) -> bool {
    let b = base(name);
    let system = b.strip_suffix(".c").is_some_and(|stem| {
        stem == "syscalls"
            || stem == "sysmem"
            || stem
                .strip_prefix("system_stm32")
                .is_some_and(|rest| !rest.is_empty() && rest.chars().all(is_word))
    });
    let lower = name.to_ascii_lowercase();
    name.starts_with("Drivers/")
        || name.starts_with("Middlewares/")
        || system
        || lower.ends_with(".s")
        || lower.ends_with(".ld")
}
/// Whether generating the code rewrites this file (only its USER CODE sections survive).
pub fn regenerated(name: &str, family: &str) -> bool {
    let (b, p) = (base(name), prefix_of(family));
    b == "main.c"
        || b == "main.h"
        || b.strip_prefix(p)
            .is_some_and(|rest| rest == "_it.c" || rest == "_hal_conf.h")
        || is_pair(b)
}
/// What is inside each `/* USER CODE BEGIN x */ … /* USER CODE END x */` of the text, in order.
fn user_sections(text: &str) -> Vec<&str> {
    const BEGIN: &str = "/* USER CODE BEGIN ";
    let mut found = Vec::new();
    let mut from = 0;
    while let Some(at) = text[from..].find(BEGIN).map(|i| from + i) {
        let name_at = at + BEGIN.len();
        let line_end = text[name_at..]
            .find(['\n', '\r', '\u{2028}', '\u{2029}'])
            .map_or(text.len(), |i| name_at + i);
        // The shortest name (at least one character) whose END comment follows.
        let mut section = None;
        let mut search = name_at + text[name_at..].chars().next().map_or(1, char::len_utf8);
        while let Some(close) = text
            .get(search..line_end)
            .and_then(|rest| rest.find(" */"))
            .map(|i| search + i)
        {
            let end_mark = format!("/* USER CODE END {} */", &text[name_at..close]);
            let body_at = close + 3;
            if let Some(end) = text[body_at..].find(&end_mark) {
                section = Some((body_at, body_at + end, body_at + end + end_mark.len()));
                break;
            }
            search = close + 1;
        }
        match section {
            Some((start, end, after)) => {
                found.push(&text[start..end]);
                from = after;
            }
            None => from = at + 1,
        }
    }
    found
}
fn files_of(project: &Value) -> impl Iterator<Item = &Value> {
    project
        .get("firmware")
        .and_then(|f| f.get("files"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
}
fn name_of(file: &Value) -> Option<&Value> {
    file.get("name")
}
/// What the generator writes for a regenerated file today, for the project as it would be without that file.
fn generated_text(name: &Value, project: &Value, mcu: &Value) -> Result<Option<String>, String> {
    let shown = js_display(Some(name));
    let own = files_of(project).find(|f| name_of(f) == Some(name));
    let own_text = own.map(|f| js_display(f.get("text")));
    let sections = own_text
        .as_deref()
        .map_or(String::new(), |t| user_sections(t).join("\n"));
    let b = base(&shown);
    if is_pair(b) {
        // A Pinout the generator refuses gives no file.
        let pairs = peripheral_files(mcu, false, false).unwrap_or_default();
        return Ok(pairs
            .into_iter()
            .find(|(file, _)| file == b)
            .map(|(_, text)| text));
    }
    let family = mcu.get("family").and_then(Value::as_str).unwrap_or("");
    // hal_conf.h is the SDK's template (the app does not write its own): an edit is not merged, it goes back to the
    // template.
    if b == format!("{}_hal_conf.h", prefix_of(family)) {
        return Ok(None);
    }
    // The file itself is left out (it would hide every handler), but what the user wrote in its USER CODE sections
    // stays: a handler written there is not generated again.
    let mut files: Vec<Value> = files_of(project)
        .filter(|f| name_of(f) != Some(name))
        .map(|f| json!({"name": f.get("name"), "text": f.get("text")}))
        .collect();
    if !trim(&sections).is_empty() {
        files.push(json!({"name": "__user_sections.c", "text": sections}));
    }
    let without = json!({"code": project.get("code"), "mcu": mcu, "firmware": {"files": files}});
    let env = build_environment(&without)?;
    Ok(env["files"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|f| f["file"].as_str().is_some_and(|file| base(file) == b))
        .and_then(|f| f["text"].as_str())
        .map(String::from))
}
/// Lines of `current` that are the user's (not in `before`, the generated text they started from) and are not in
/// `after`.
pub fn lost_lines(current: &str, before: &str, after: &str) -> usize {
    let count = |text: &str| -> Vec<(String, usize)> {
        let mut lines: Vec<(String, usize)> = Vec::new();
        for line in text.split('\n') {
            let t = trim(line);
            if t.is_empty() {
                continue;
            }
            match lines.iter_mut().find(|(l, _)| l == t) {
                Some(entry) => entry.1 += 1,
                None => lines.push((t.to_string(), 1)),
            }
        }
        lines
    };
    let (was, now) = (count(before), count(after));
    let of = |list: &[(String, usize)], line: &str| {
        list.iter().find(|(l, _)| l == line).map_or(0, |(_, n)| *n)
    };
    count(current)
        .iter()
        .map(|(line, n)| n.saturating_sub(of(&was, line) + of(&now, line)))
        .sum()
}
/// `String(text || '')`.
fn text_or_empty(v: Option<&Value>) -> String {
    match v {
        Some(x) if js_truthy(x) => js_display(Some(x)),
        _ => String::new(),
    }
}
/// `String(value ?? '')`.
fn text_or_default(v: Option<&Value>) -> String {
    match v {
        Some(x) if !x.is_null() => js_display(Some(x)),
        _ => String::new(),
    }
}
/// The project's regenerated overrides for a new Pinout (main.c is handled by regenerateMain): each takes the new
/// generated text with the USER CODE sections of the edited one. An override equal to what is generated is dropped
/// (only edited files are stored); hal_conf.h goes back to the SDK template (it has no sections).
/// The answer says what becomes of each file of the project, in order — "keep", "drop" or `{text, base}` — and
/// `report: [{name, lost, reset}]` (`lost`: the user's lines outside the sections that go).
pub fn regenerate_overrides(project: &Value, next_mcu: &Value) -> Result<Value, String> {
    if project.is_null() {
        return Err(BROKEN.into());
    }
    let current_mcu = project.get("mcu").unwrap_or(&Value::Null);
    let family = next_mcu
        .get("family")
        .filter(|f| js_truthy(f))
        .or_else(|| current_mcu.get("family"));
    let family = family.and_then(Value::as_str).unwrap_or("");
    let (mut actions, mut report) = (Vec::new(), Vec::new());
    for f in files_of(project) {
        if f.is_null() {
            return Err(BROKEN.into());
        }
        let ours = matches!(f.get("origin").and_then(Value::as_str), Some("gen" | "sdk"));
        if !ours || !regenerated(&js_display(name_of(f)), family) {
            actions.push(json!("keep"));
            continue;
        }
        let name = name_of(f).unwrap_or(&Value::Null);
        // The text the file was edited from (kept since 1.51.0), else what the current settings generate.
        let before = match f.get("base").and_then(Value::as_str) {
            Some(text) => Some(text.to_string()),
            None => generated_text(name, project, current_mcu)?,
        };
        let before = before.unwrap_or_default();
        let after = generated_text(name, project, next_mcu)?;
        // hal_conf.h, or a pair whose peripheral is off: the edit goes (the file is not generated any more).
        let Some(after) = after else {
            report.push(json!({"name": name, "lost": lost_lines(&text_or_empty(f.get("text")), &before, ""), "reset": true}));
            actions.push(json!("drop"));
            continue;
        };
        let merged = keep_user_code(&text_or_default(f.get("text")), &after, &before);
        let lost = lost_lines(&text_or_empty(f.get("text")), &before, &merged);
        if lost > 0 {
            report.push(json!({"name": name, "lost": lost, "reset": false}));
        }
        actions.push(if merged == after {
            json!("drop")
        } else {
            json!({"text": merged, "base": after})
        });
    }
    Ok(json!({"actions": actions, "report": report}))
}
/// 4-space formatting of generated code (`expandC`).
fn expand(source: &str) -> String {
    format_code(source, 4.0, None).0
}
fn with(mcu: &Value, couple: bool) -> Value {
    let mut copy = mcu.as_object().cloned().unwrap_or_default();
    copy.insert("coupleFiles".into(), json!(couple));
    Value::Object(copy)
}
/// Every text the generator makes for these Pinouts, in both forms: main.c as one file, and the per-peripheral files
/// (gpio.c/h, usart.c/h …). regenerateMain asks them what is the generator's (feature 52).
pub fn generator_texts(mcus: &[Value]) -> Vec<String> {
    let mut texts = Vec::new();
    for mcu in mcus.iter().filter(|m| js_truthy(m)) {
        // A Pinout the generator refuses gives nothing.
        if let Ok(main) = generate_hal(&with(mcu, false), false, false) {
            texts.push(expand(&main));
        }
        if let Ok(pairs) =
            validate_mcu(&with(mcu, true)).and_then(|clean| peripheral_files(&clean, false, false))
        {
            texts.extend(pairs.into_iter().map(|(_, text)| text));
        }
    }
    texts
}
/// The main.c a Pinout generates (with the per-peripheral option), as the pinout dialog writes it; "" when the
/// generator refuses the Pinout.
pub fn generated_main(mcu: &Value) -> String {
    generate_hal(mcu, false, false).map_or(String::new(), |text| expand(&text))
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let shown = |i: usize| js_display(args.get(i));
    let family = |i: usize| {
        args.get(i)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    Some(match name {
        "override_arm_only" => Ok(json!(arm_only(&shown(0)))),
        "override_regenerated" => Ok(json!(regenerated(&shown(0), &family(1)))),
        "override_file_kind" => Ok(json!(if regenerated(&shown(0), &family(1)) {
            "regen"
        } else {
            "once"
        })),
        "override_lost_lines" => Ok(json!(lost_lines(
            &text_or_empty(args.first()),
            &text_or_empty(args.get(1)),
            &text_or_empty(args.get(2))
        ))),
        "regenerate_overrides" => regenerate_overrides(v(0), v(1)),
        // What generating main.c for the next Pinout changes: the same, with main.c's own lost lines first.
        "generation_plan" => regenerate_overrides(v(0), v(1)).map(|mut plan| {
            let lost = lost_lines(
                &text_or_empty(v(0).get("code")),
                &text_or_empty(args.get(3)),
                &text_or_empty(args.get(2)),
            );
            if lost > 0 {
                if let Some(report) = plan["report"].as_array_mut() {
                    report.insert(0, json!({"name": "main.c", "lost": lost, "reset": false}));
                }
            }
            plan
        }),
        "generator_texts" => Ok(json!(generator_texts(args))),
        "generated_main" => Ok(json!(generated_main(v(0)))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_and_sections() {
        assert!(
            arm_only("Drivers/STM32F4xx_HAL_Driver/Src/x.c")
                && arm_only("Core/Src/system_stm32f4xx.c")
                && arm_only("a/STARTUP.S")
                && arm_only("x.ld")
        );
        assert!(
            !arm_only("Core/Src/main.c") && !arm_only("system_stm32.c") && !arm_only("syscalls.h")
        );
        assert!(
            regenerated("Core/Src/gpio.c", "STM32F446RE")
                && regenerated("stm32f1xx_it.c", "STM32F103RB")
                && regenerated("Core/Inc/main.h", "")
        );
        assert!(
            !regenerated("stm32f1xx_it.c", "STM32F446RE")
                && !regenerated("gpio.cpp", "")
                && !regenerated("syscalls.c", "")
        );
        let text = "/* USER CODE BEGIN 1 */a/* USER CODE END 1 */ x /* USER CODE BEGIN Init */\nb\n/* USER CODE END Init */ /* USER CODE BEGIN Z */ never closed";
        assert_eq!(user_sections(text), ["a", "\nb\n"]);
        assert_eq!(lost_lines("a\nb\nb\n  c  \n", "a\nb", "c"), 1);
    }
}
