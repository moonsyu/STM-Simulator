//! The code an STM32 ARM build adds to the project's sources (CubeIDE keeps it in Core/Src): interrupt handlers
//! (stm32xxxx_it.c), newlib system calls (syscalls.c) and the heap (sysmem.c). The build compiles them as one file,
//! __stm_environment.c; the editor shows the same text split into CubeIDE's files, read only.
//!
//! Moved here from `src/build-environment.js` (feature 62).

use crate::csedit::irq_handlers;
use crate::explorer::{cube_header, hal_msp, it_header};
use crate::jsre::{is_space, is_word, trim};
use crate::mcu::{js_display, F1};
use crate::periph::{is_serial, is_timer, js_truthy, serial_handle};
use serde_json::{json, Value};

pub fn prefix_of(family: &str) -> &'static str {
    if family == F1 {
        "stm32f1xx"
    } else {
        "stm32f4xx"
    }
}
pub fn startup_of(family: &str) -> &'static str {
    if family == F1 {
        "startup_stm32f103xb.s"
    } else {
        "startup_stm32f446xx.s"
    }
}
/// The HAL modules the ARM build compiles from the SDK (CubeIDE's Drivers/<HAL>/Src).
pub fn hal_modules() -> Value {
    json!({
        "STM32F446RE": ["hal", "hal_rcc", "hal_rcc_ex", "hal_gpio", "hal_cortex", "hal_pwr", "hal_pwr_ex", "hal_flash", "hal_flash_ex", "hal_dma", "hal_dma_ex", "hal_can", "hal_i2s", "hal_i2s_ex", "hal_uart", "hal_usart", "hal_adc", "hal_adc_ex", "hal_i2c", "hal_spi", "hal_tim", "hal_tim_ex", "hal_dcmi", "hal_dcmi_ex", "hal_sd", "ll_sdmmc", "hal_iwdg", "hal_wwdg", "hal_rtc", "hal_rtc_ex", "hal_dac", "hal_dac_ex", "hal_crc"],
        "STM32F103RB": ["hal", "hal_rcc", "hal_rcc_ex", "hal_gpio", "hal_gpio_ex", "hal_cortex", "hal_pwr", "hal_flash", "hal_flash_ex", "hal_dma", "hal_can", "hal_uart", "hal_usart", "hal_adc", "hal_adc_ex", "hal_i2c", "hal_spi", "hal_tim", "hal_tim_ex", "hal_iwdg", "hal_wwdg", "hal_rtc", "hal_rtc_ex", "hal_crc"],
    })
}
/// The linker script's file name as CubeIDE names it, and the memory of the part.
fn linker(family: &str) -> (&'static str, &'static str, &'static str) {
    if family == F1 {
        ("STM32F103RBTX_FLASH.ld", "128K", "20K")
    } else {
        ("STM32F446RETX_FLASH.ld", "512K", "128K")
    }
}
pub fn linker_name(family: &str) -> &'static str {
    linker(family).0
}
/// The linker script the ARM build uses unless the project has its own .ld file.
pub fn linker_script(family: &str) -> String {
    let (_, flash, ram) = linker(family);
    format!(
        "ENTRY(Reset_Handler)
MEMORY {{ FLASH (rx) : ORIGIN = 0x08000000, LENGTH = {flash}
RAM (xrw) : ORIGIN = 0x20000000, LENGTH = {ram} }}
_estack = ORIGIN(RAM) + LENGTH(RAM);
SECTIONS {{
 .isr_vector : {{ KEEP(*(.isr_vector)) }} >FLASH
 .text : {{ *(.text*) *(.rodata*) KEEP(*(.init)) KEEP(*(.fini)) . = ALIGN(4); }} >FLASH
 .ARM.extab : {{ *(.ARM.extab*) }} >FLASH
 .ARM.exidx : {{ __exidx_start = .; *(.ARM.exidx*) __exidx_end = .; }} >FLASH
 .preinit_array : {{ PROVIDE_HIDDEN(__preinit_array_start = .); KEEP(*(.preinit_array*)) PROVIDE_HIDDEN(__preinit_array_end = .); }} >FLASH
 .init_array : {{ PROVIDE_HIDDEN(__init_array_start = .); KEEP(*(SORT(.init_array.*))) KEEP(*(.init_array)) PROVIDE_HIDDEN(__init_array_end = .); }} >FLASH
 .fini_array : {{ PROVIDE_HIDDEN(__fini_array_start = .); KEEP(*(.fini_array*)) PROVIDE_HIDDEN(__fini_array_end = .); }} >FLASH
 _sidata = LOADADDR(.data);
 .data : {{ . = ALIGN(4); _sdata = .; *(.data*) . = ALIGN(4); _edata = .; }} >RAM AT>FLASH
 .bss : {{ . = ALIGN(4); _sbss = .; __bss_start__ = .; *(.bss*) *(COMMON) . = ALIGN(8); _ebss = .; __bss_end__ = .; end = .; _end = .; }} >RAM
 .heap_stack (NOLOAD) : {{ . = ALIGN(8); . += 0x400; . += 0x1000; . = ALIGN(8); }} >RAM
}}
"
    )
}

const SBRK: &str = "extern char end, _estack;
__attribute__((weak)) void *_sbrk(ptrdiff_t increment) {
  static uintptr_t current;
  const uintptr_t base=(uintptr_t)&end, limit=(uintptr_t)&_estack-0x1000;
  if(!current) current=base;
  if((increment>0 && (uintptr_t)increment>limit-current) || (increment<0 && (uintptr_t)(-(increment+1))+1>current-base)) { errno=ENOMEM; return (void*)-1; }
  void *previous=(void*)current; current+=increment; return previous;
}";
// The remaining newlib system calls, as STM32CubeIDE's syscalls.c has them (weak: a project's own syscalls.c wins).
// Without them newlib's nosys stubs link in and every build warns "_close is not implemented".
const SYSCALLS: &str = "__attribute__((weak)) int __io_getchar(void) { return -1; }
__attribute__((weak)) int _read(int file, char *ptr, int len) { (void)file; int i=0; for(;i<len;i++){ int c=__io_getchar(); if(c<0) break; ptr[i]=(char)c; } return i; }
__attribute__((weak)) int _close(int file) { (void)file; return -1; }
__attribute__((weak)) int _fstat(int file, struct stat *st) { (void)file; st->st_mode=S_IFCHR; return 0; }
__attribute__((weak)) int _isatty(int file) { (void)file; return 1; }
__attribute__((weak)) int _lseek(int file, int ptr, int dir) { (void)file; (void)ptr; (void)dir; return 0; }
__attribute__((weak)) int _getpid(void) { return 1; }
__attribute__((weak)) int _kill(int pid, int sig) { (void)pid; (void)sig; errno=EINVAL; return -1; }";

/// `#if`, `#ifdef`, … at the start of a line: the directive and what follows it. A line with a carriage return (or
/// another line terminator) in it is not one, as the JavaScript pattern's `.` did not match those.
fn directive(line: &str) -> Option<(&str, &str)> {
    let rest = line
        .trim_start_matches([' ', '\t'])
        .strip_prefix('#')?
        .trim_start_matches([' ', '\t']);
    let end = rest.find(|c: char| !is_word(c)).unwrap_or(rest.len());
    let word = &rest[..end];
    if !["if", "ifdef", "ifndef", "elif", "else", "endif"].contains(&word) {
        return None;
    }
    let tail = &rest[end..];
    if tail.contains(['\r', '\u{2028}', '\u{2029}']) {
        return None;
    }
    Some((word, tail))
}
/// Lines inside `#if 0` (up to its #else/#elif/#endif, nesting followed) do not define anything; `#if 1 … #else`
/// drops the #else part. Other conditions are kept, both branches.
fn live_lines(text: &str) -> String {
    struct Level {
        known: bool,
        live: bool,
        taken: bool,
    }
    let mut stack: Vec<Level> = Vec::new();
    let mut out: Vec<&str> = Vec::new();
    for line in text.split('\n') {
        let Some((word, tail)) = directive(line) else {
            if stack.iter().all(|s| s.live) {
                out.push(line);
            }
            continue;
        };
        if matches!(word, "if" | "ifdef" | "ifndef") {
            let c = if word == "if" { trim(tail) } else { "" };
            stack.push(Level {
                known: c == "0" || c == "1",
                live: c != "0",
                taken: c == "1",
            });
            continue;
        }
        if word == "endif" {
            stack.pop();
        } else if let Some(top) = stack.last_mut() {
            if top.known {
                top.live = !top.taken && !top.live;
                top.taken = top.taken || top.live;
            } else {
                top.live = true;
            }
        }
    }
    out.join("\n")
}
/// The text without comments and without the lines a `#if 0` hides.
fn strip_c(text: &str) -> String {
    // Block comments: each `/* … */` becomes a space; one that is never closed stays.
    let mut blocks = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("/*") {
        let Some(close) = rest[at + 2..].find("*/") else {
            break;
        };
        blocks.push_str(&rest[..at]);
        blocks.push(' ');
        rest = &rest[at + 2 + close + 2..];
    }
    blocks.push_str(rest);
    // Line comments: `//` up to the end of the line.
    let mut lines = String::with_capacity(blocks.len());
    let mut rest = blocks.as_str();
    while let Some(at) = rest.find("//") {
        lines.push_str(&rest[..at]);
        lines.push(' ');
        let after = &rest[at..];
        rest = &after[after.find('\n').unwrap_or(after.len())..];
    }
    lines.push_str(rest);
    live_lines(&lines)
}
/// `\bname\s*\(\s*(?:void)?\s*\)\s*\{` somewhere in the text: a definition of the function.
fn defines(text: &str, name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    let first_word = name.chars().next().is_some_and(is_word);
    let mut from = 0;
    while let Some(found) = text[from..].find(name) {
        let at = from + found;
        from = at + text[at..].chars().next().map_or(1, char::len_utf8);
        let before_word = text[..at].chars().next_back().is_some_and(is_word);
        if before_word == first_word {
            continue;
        }
        let spaces = |s: &'_ str| -> usize { s.find(|c: char| !is_space(c)).unwrap_or(s.len()) };
        let mut rest = &text[at + name.len()..];
        rest = &rest[spaces(rest)..];
        let Some(inside) = rest.strip_prefix('(') else {
            continue;
        };
        rest = &inside[spaces(inside)..];
        rest = rest.strip_prefix("void").unwrap_or(rest);
        rest = &rest[spaces(rest)..];
        let Some(after) = rest.strip_prefix(')') else {
            continue;
        };
        if after[spaces(after)..].starts_with('{') {
            return true;
        }
    }
    false
}
fn family_of(project: &Value) -> &str {
    project
        .get("mcu")
        .and_then(|m| m.get("family"))
        .and_then(Value::as_str)
        .unwrap_or("")
}
fn section(tag: &str) -> [String; 4] {
    [
        format!("/* USER CODE BEGIN {tag} */"),
        String::new(),
        format!("/* USER CODE END {tag} */"),
        String::new(),
    ]
}
const BROKEN: &str = "Cannot read properties of undefined";

/// The main.h the ARM build writes when the project has none: the HAL include, Error_Handler and the Pinout labels.
pub fn main_header(project: &Value) -> Result<String, String> {
    if project.is_null() {
        return Err(BROKEN.into());
    }
    let p = prefix_of(family_of(project));
    let mut labels: Vec<(&String, &Value)> = Vec::new();
    for (pin, q) in project
        .get("mcu")
        .and_then(|m| m.get("pins"))
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if q.is_null() {
            return Err(BROKEN.into());
        }
        if q.get("label").is_some_and(js_truthy) {
            labels.push((pin, q));
        }
    }
    let mut out: Vec<String> = vec![
        "#pragma once".into(),
        String::new(),
        format!("#include \"{p}_hal.h\""),
        String::new(),
    ];
    for tag in ["Includes", "ET", "EC", "EM"] {
        out.extend(section(tag));
    }
    out.push("void Error_Handler(void);".into());
    out.push(String::new());
    out.extend(section("EFP"));
    if !labels.is_empty() {
        out.push("/* Pinout labels (CubeMX writes them here; the build also passes them to every source). */".into());
        for (pin, q) in labels {
            let label = js_display(q.get("label"));
            let number: String = pin.chars().skip(2).collect();
            let port = pin
                .chars()
                .nth(1)
                .map_or("undefined".to_string(), String::from);
            out.push(format!("#define {label}_Pin GPIO_PIN_{number}"));
            out.push(format!("#define {label}_GPIO_Port GPIO{port}"));
        }
        out.push(String::new());
    }
    out.extend(section("Private defines"));
    Ok(out.join("\n"))
}

/// `void NAME(void) { BODY }` taken apart.
fn handler_parts(line: &str) -> Option<(&str, &str)> {
    let rest = line.strip_prefix("void ")?;
    let end = rest.find(|c: char| !is_word(c)).unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    let body = rest[end..].strip_prefix("(void) { ")?.strip_suffix(" }")?;
    Some((&rest[..end], body))
}

/// The build's added code for a HAL project: {text} for the build and {files} as CubeIDE would name them.
pub fn build_environment(project: &Value) -> Result<Value, String> {
    if project.is_null() {
        return Err(BROKEN.into());
    }
    let family = family_of(project);
    let p = prefix_of(family);
    // (name, text) of main.c and the project's files. A file without a name has `None`.
    let code = project.get("code").and_then(Value::as_str).unwrap_or("");
    let mut files: Vec<(Option<&str>, &str)> = vec![(Some("main.c"), code)];
    for f in project
        .get("firmware")
        .and_then(|f| f.get("files"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if f.is_null() {
            return Err(BROKEN.into());
        }
        files.push((
            f.get("name").and_then(Value::as_str),
            f.get("text").and_then(Value::as_str).unwrap_or(""),
        ));
    }
    // Interrupt handlers must be strong: the startup file's Default_Handler aliases are weak too, and a weak-vs-weak
    // tie leaves SysTick unhandled (HAL_Delay would hang). A handler the user's sources already define is left out,
    // so imported Cube stm32f4xx_it.c files still link. Comments and `#if 0` blocks do not count as definitions.
    let user_text = strip_c(&files.iter().map(|f| f.1).collect::<Vec<_>>().join("\n"));
    let mut stripped: Vec<Option<String>> = vec![None; files.len()];
    let mut owner = |name: &str| -> Option<&str> {
        for (i, f) in files.iter().enumerate() {
            let text = stripped[i].get_or_insert_with(|| strip_c(f.1));
            if defines(text, name) {
                return f.0;
            }
        }
        None
    };
    let handler = |name: &str, body: &str| -> Option<String> {
        if defines(&user_text, name) {
            None
        } else {
            Some(format!("void {name}(void) {{ {body} }}"))
        }
    };
    let mut it: Vec<String> = Vec::new();
    let mut skipped: Vec<(String, Option<String>)> = Vec::new();
    match handler("SysTick_Handler", "HAL_IncTick();") {
        Some(tick) => it.push(tick),
        None => skipped.push((
            "SysTick_Handler".into(),
            owner("SysTick_Handler").map(String::from),
        )),
    }
    // A synchronous USART uses a USART_HandleTypeDef named husartN (as the generated main.c does).
    let mcu = project.get("mcu").unwrap_or(&Value::Null);
    for (id, q) in mcu
        .get("peripherals")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if q.is_null() {
            return Err(BROKEN.into());
        }
        if !q.get("enabled").is_some_and(js_truthy) {
            continue;
        }
        if is_serial(id) {
            if q.get("mode") == Some(&json!("synchronous")) {
                it.push(format!(
                    "extern USART_HandleTypeDef husart{};",
                    id.chars().filter(char::is_ascii_digit).collect::<String>()
                ));
            } else {
                it.push(format!("extern UART_HandleTypeDef {};", serial_handle(id)));
            }
        }
        if is_timer(id) {
            it.push(format!("extern TIM_HandleTypeDef htim{};", &id[3..]));
        }
    }
    // DMA streams and every enabled NVIC line get the handler CubeMX writes into stm32xxxx_it.c, unless a source
    // defines it.
    for h in irq_handlers(mcu) {
        let name = js_display(h.get("name"));
        match handler(&name, &js_display(h.get("body"))) {
            None => {
                if h.get("body").is_some_and(js_truthy) {
                    let file = owner(&name).map(String::from);
                    skipped.push((name, file));
                }
            }
            Some(text) => {
                if let Some(e) = h.get("extern").filter(|e| js_truthy(e)) {
                    it.push(js_display(Some(e)));
                }
                it.push(text);
            }
        }
    }
    let mut syscalls: Vec<&str> = vec![
        "__attribute__((weak)) void _init(void) {}",
        "__attribute__((weak)) void _fini(void) {}",
        "__attribute__((weak)) int __io_putchar(int ch) { return ch; }",
        "__attribute__((weak)) int _write(int file, char *ptr, int len) { (void)file; for(int i=0;i<len;i++) __io_putchar(ptr[i]); return len; }",
    ];
    syscalls.push(SYSCALLS);
    let mut text: Vec<&str> = vec![
        "#include \"main.h\"",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include <errno.h>",
        "#include <sys/stat.h>",
    ];
    text.extend(&syscalls);
    text.push(SBRK);
    text.extend(it.iter().map(String::as_str));
    let text = text.join("\n");
    // As CubeMX writes stm32xxxx_it.c: each handler between its "<IRQ> 0" and "<IRQ> 1" USER CODE sections.
    let mut view_it: Vec<String> = vec![
        cube_header(&format!("{p}_it.c"), "Interrupt Service Routines."),
        "#include \"main.h\"".into(),
        String::new(),
        "/* USER CODE BEGIN Includes */".into(),
        "/* USER CODE END Includes */".into(),
        String::new(),
    ];
    if !skipped.is_empty() {
        view_it.push("/* 프로젝트 소스에 있어 여기서는 만들지 않는 핸들러:".into());
        for (name, file) in &skipped {
            let of = file
                .as_ref()
                .filter(|f| !f.is_empty())
                .map_or(String::new(), |f| format!(" — {f}"));
            view_it.push(format!(" *   {name}(){of}"));
        }
        view_it.push(" */".into());
        view_it.push(String::new());
    }
    let mut externs: Vec<&String> = Vec::new();
    for line in it.iter().filter(|l| l.starts_with("extern ")) {
        if !externs.contains(&line) {
            externs.push(line);
        }
    }
    view_it.extend(externs.into_iter().cloned());
    view_it.extend([
        "/* USER CODE BEGIN EV */".to_string(),
        "/* USER CODE END EV */".into(),
        String::new(),
    ]);
    for line in it.iter().filter(|l| !l.starts_with("extern ")) {
        match handler_parts(line) {
            None => view_it.extend([line.clone(), String::new()]),
            Some((name, body)) => {
                let irq = format!(
                    "{}_IRQn",
                    name.strip_suffix("_IRQHandler")
                        .or_else(|| name.strip_suffix("_Handler"))
                        .unwrap_or(name)
                );
                view_it.extend([
                    format!("void {name}(void)"),
                    "{".into(),
                    format!("  /* USER CODE BEGIN {irq} 0 */"),
                    String::new(),
                    format!("  /* USER CODE END {irq} 0 */"),
                    format!("  {body}"),
                    format!("  /* USER CODE BEGIN {irq} 1 */"),
                    String::new(),
                    format!("  /* USER CODE END {irq} 1 */"),
                    "}".into(),
                    String::new(),
                ]);
            }
        }
    }
    view_it.extend([
        "/* USER CODE BEGIN 1 */".to_string(),
        "/* USER CODE END 1 */".into(),
        String::new(),
    ]);
    view_it.push(format!(
        "/* NMI_Handler, HardFault_Handler, MemManage_Handler, BusFault_Handler, UsageFault_Handler, SVC_Handler,\n * DebugMon_Handler, PendSV_Handler와 정의하지 않은 다른 IRQ는 {}의 Default_Handler(무한 반복)가 받습니다. */",
        startup_of(family)
    ));
    let mut view_syscalls: Vec<String> = vec![
        cube_header("syscalls.c", "STM32CubeIDE Minimal System calls file"),
        "#include <errno.h>".into(),
        "#include <sys/stat.h>".into(),
        String::new(),
    ];
    for l in &syscalls {
        view_syscalls.extend([l.to_string(), String::new()]);
    }
    let view_sysmem = [
        cube_header("sysmem.c", "STM32CubeIDE System Memory calls file").as_str(),
        "#include <errno.h>",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "",
        SBRK,
    ]
    .join("\n");
    // main.h and the linker script are written by the build too, unless the project has its own.
    let has = |test: &dyn Fn(&str) -> bool| -> Result<bool, String> {
        for f in &files {
            let Some(name) = f.0 else {
                return Err(BROKEN.into());
            };
            if test(name.rsplit('/').next().unwrap_or(name)) {
                return Ok(true);
            }
        }
        Ok(false)
    };
    let mut out = vec![
        json!({"file": format!("Core/Src/{p}_it.c"), "text": view_it.join("\n") + "\n"}),
        json!({"file": "Core/Src/syscalls.c", "text": view_syscalls.join("\n")}),
        json!({"file": "Core/Src/sysmem.c", "text": view_sysmem + "\n"}),
    ];
    if !has(&|n| n == "main.h")? {
        out.push(json!({"file": "Core/Inc/main.h", "text": cube_header("main.h", "Header for main.c file.\nThis file contains the common defines of the application.") + "\n" + &main_header(project)?}));
    }
    if !has(&|n| n.ends_with(".ld"))? {
        let name = linker_name(family);
        out.push(json!({"file": name, "text": cube_header(name, "Linker script: FLASH and RAM sizes, the sections,\na heap of 1 KB and a stack of 4 KB.") + "\n" + &linker_script(family)}));
    }
    // What CubeIDE's Core folder also has (feature 56): the prototypes of the handlers and HAL_MspInit (USER CODE
    // sections only — the same as the HAL's weak default until something is written there; the build compiles it once
    // it is edited).
    let handler_names: Vec<String> = it
        .iter()
        .filter_map(|l| {
            let rest = l.strip_prefix("void ")?;
            let end = rest.find(|c: char| !is_word(c)).unwrap_or(rest.len());
            (end > 0 && rest[end..].starts_with("(void) {")).then(|| rest[..end].to_string())
        })
        .collect();
    if !has(&|n| n == format!("{p}_it.h"))? {
        out.push(
            json!({"file": format!("Core/Inc/{p}_it.h"), "text": it_header(p, &handler_names)}),
        );
    }
    if !has(&|n| n == format!("{p}_hal_msp.c"))? {
        out.push(json!({"file": format!("Core/Src/{p}_hal_msp.c"), "text": hal_msp(p)}));
    }
    Ok(json!({"text": text, "files": out}))
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let family = v(0).as_str().unwrap_or("");
    Some(match name {
        "prefix_of" => Ok(json!(prefix_of(family))),
        "startup_of" => Ok(json!(startup_of(family))),
        "hal_modules" => Ok(hal_modules()),
        "linker_name" => Ok(json!(linker_name(family))),
        "linker_script" => Ok(json!(linker_script(family))),
        "main_header" => main_header(v(0)).map(|text| json!(text)),
        "build_environment" => build_environment(v(0)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comments_and_dead_blocks_do_not_define() {
        let text = "/* void A(void) { } */\n// void B(void) {\n#if 0\nvoid C(void) {\n#else\nvoid D ( void )\n{\n#endif\n#if 1\nvoid E(){\n#else\nvoid F(void){\n#endif\nxvoid_G(void){ G2 (void) {";
        let live = strip_c(text);
        for (name, there) in [
            ("A", false),
            ("B", false),
            ("C", false),
            ("D", true),
            ("E", true),
            ("F", false),
            ("G", false),
            ("G2", true),
        ] {
            assert_eq!(defines(&live, name), there, "{name}\n{live}");
        }
        // A directive on a CRLF line is not seen as one (the JavaScript pattern's `.` stops at the carriage return).
        assert!(defines(
            &strip_c("#if 0\r\nvoid H(void) {\r\n#endif\r\n"),
            "H"
        ));
    }

    #[test]
    fn a_project_with_its_own_handler() {
        let project = json!({
            "code": "void SysTick_Handler(void) { HAL_IncTick(); }\nint main(void) { }\n",
            "mcu": {"family": "STM32F103RB", "pins": {"PA5": {"function": "GPIO_Output", "label": "LD2"}},
                "peripherals": {"USART2": {"enabled": true, "baud": 9600}, "TIM2": {"enabled": true}}, "nvic": {"USART2_IRQn": {"enabled": true, "priority": 0}}},
            "firmware": {"files": [{"name": "Core/Inc/main.h", "text": ""}]},
        });
        let env = build_environment(&project).unwrap();
        let text = env["text"].as_str().unwrap();
        assert!(!text.contains("void SysTick_Handler"));
        assert!(text.contains("extern UART_HandleTypeDef huart2;\nextern TIM_HandleTypeDef htim2;"));
        assert!(text.contains("void USART2_IRQHandler(void) { HAL_UART_IRQHandler(&huart2); }"));
        let names: Vec<&str> = env["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["file"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            [
                "Core/Src/stm32f1xx_it.c",
                "Core/Src/syscalls.c",
                "Core/Src/sysmem.c",
                "STM32F103RBTX_FLASH.ld",
                "Core/Inc/stm32f1xx_it.h",
                "Core/Src/stm32f1xx_hal_msp.c"
            ]
        );
        let it = env["files"][0]["text"].as_str().unwrap();
        assert!(it.contains(" *   SysTick_Handler() — main.c"));
        assert!(it.contains("void USART2_IRQHandler(void)\n{\n  /* USER CODE BEGIN USART2_IRQn 0 */\n\n  /* USER CODE END USART2_IRQn 0 */\n  HAL_UART_IRQHandler(&huart2);\n"));
        assert!(main_header(&project)
            .unwrap()
            .contains("#define LD2_Pin GPIO_PIN_5\n#define LD2_GPIO_Port GPIOA"));
    }
}
