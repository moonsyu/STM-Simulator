//! An example's one-file main.c as a project that generates a pair of `.c/.h` files per peripheral (feature 51:
//! examples open with the option on and their code already divided).
//!
//! The init functions (`MX_…_Init`), their prototypes and the handles that the generated pairs of the example's
//! Pinout settings define leave main.c; main.c includes the pairs' headers instead. An init function the example
//! wrote differently from the generator (a peripheral set up by hand beyond what the Pinout stores) keeps its body:
//! the pair's source is returned with that body, for the project to store as an edited file. What the pairs do not
//! define stays in main.c.

use crate::csource::{c_functions, is_space, is_word, mask_c};
use crate::docs_regions::coupling_of;
use std::collections::{HashMap, HashSet};

/// The order CubeMX lists the pairs' headers in (peripheral-files.js ORDER); gpio is last.
const ORDER: [&str; 13] = [
    "adc", "dac", "dcmi", "dma", "i2c", "iwdg", "rtc", "sdio", "spi", "tim", "usart", "wwdg",
    "gpio",
];

#[derive(Debug, PartialEq, Eq)]
pub struct Coupled {
    pub main: String,
    /// Pair sources whose init function has the example's body: (name, text).
    pub files: Vec<(String, String)>,
}

fn squeeze(text: &str) -> String {
    text.chars()
        .filter(|c| !(c.is_ascii() && is_space(*c as u8)))
        .collect()
}

fn line_start(s: &[u8], mut i: usize) -> usize {
    while i > 0 && s[i - 1] != b'\n' {
        i -= 1;
    }
    i
}

fn after_line(s: &[u8], i: usize) -> usize {
    s[i.min(s.len())..]
        .iter()
        .position(|&b| b == b'\n')
        .map_or(s.len(), |n| i + n + 1)
}

/// The body of a generated init function without the USER CODE lines the pair adds around it.
fn generated_body(body: &str) -> String {
    body.lines()
        .filter(|line| {
            let t = line.trim();
            !(t.starts_with("/* USER CODE BEGIN ") || t.starts_with("/* USER CODE END "))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The pair source with the body of `name` replaced by the example's (the USER CODE lines of the function stay).
fn with_body(source: &str, name: &str, body: &str) -> Option<String> {
    let f = c_functions(source)
        .ok()?
        .into_iter()
        .find(|f| f.name == name)?;
    let inner = &source[f.open + 1..f.end - 1];
    let lines: Vec<&str> = inner.split('\n').collect();
    let first = lines
        .iter()
        .position(|l| l.trim().starts_with("/* USER CODE END ") && l.contains("_Init 0 */"))?;
    let last = lines
        .iter()
        .rposition(|l| l.trim().starts_with("/* USER CODE BEGIN ") && l.contains("_Init 2 */"))?;
    if last <= first {
        return None;
    }
    let body = body.trim_matches(|c: char| c == '\n' || c == '\r');
    let mut out: Vec<&str> = lines[..=first].to_vec();
    out.extend(body.split('\n').map(|l| l.trim_end_matches('\r')));
    out.extend(&lines[last..]);
    Some(format!(
        "{}{}{}",
        &source[..f.open + 1],
        out.join("\n"),
        &source[f.end - 1..]
    ))
}

/// `#include "<group>.h"` (with or without a folder) on a line of `text`.
fn includes_header(text: &str, group: &str) -> bool {
    let (plain, nested) = (format!("\"{group}.h\""), format!("/{group}.h\""));
    text.lines().any(|line| {
        let line = line.trim_start();
        line.starts_with('#')
            && line[1..].trim_start().starts_with("include")
            && (line.contains(&plain) || line.contains(&nested))
    })
}

/// `main` with the code of the pairs taken out, or `None` when it cannot be divided safely (it stays one file).
pub fn couple_example(main: &str, pairs: &[(String, String)]) -> Option<Coupled> {
    let (functions, handles) = coupling_of(pairs);
    let fns = c_functions(main).ok()?;
    let mask = mask_c(main);
    let (s, m) = (main.as_bytes(), mask.as_bytes());
    // (start, end) of what leaves main.c, and the pairs it goes to.
    let mut cuts: Vec<(usize, usize)> = Vec::new();
    let mut groups: HashSet<&str> = HashSet::new();
    let mut files: HashMap<String, String> = HashMap::new();
    let pair_text = |group: &str| {
        let name = format!("{group}.c");
        pairs
            .iter()
            .find(|(n, _)| n.rsplit('/').next() == Some(name.as_str()))
            .map(|(_, t)| t.as_str())
    };
    let mut moved: HashSet<&str> = HashSet::new();
    for f in &fns {
        let Some(group) = functions.get(&f.name) else {
            continue;
        };
        let head = squeeze(&main[f.start..f.open]);
        if head != format!("staticvoid{}(void)", f.name) && head != format!("void{}(void)", f.name)
        {
            return None;
        }
        let body = &main[f.open + 1..f.end - 1];
        let source: String = match files.get(group) {
            Some(text) => text.clone(),
            None => pair_text(group)?.to_string(),
        };
        let theirs = c_functions(&source)
            .ok()?
            .into_iter()
            .find(|g| g.name == f.name)?;
        if squeeze(body) != squeeze(&generated_body(&source[theirs.open + 1..theirs.end - 1])) {
            let changed = with_body(&source, &f.name, body)?;
            files.insert(group.clone(), changed);
        }
        let start = line_start(s, f.start);
        let mut end = after_line(s, f.end - 1);
        // One blank line between what is left.
        if start >= 2
            && s[start - 1] == b'\n'
            && s[start - 2] == b'\n'
            && s.get(end) == Some(&b'\n')
        {
            end += 1;
        }
        cuts.push((start, end));
        groups.insert(group.as_str());
        moved.insert(f.name.as_str());
    }
    // Top-level lines: the prototypes of the moved functions and the handles the pairs define.
    let mut depth: i64 = 0;
    let mut line = 0;
    while line < s.len() {
        let end = after_line(s, line);
        if depth == 0 {
            let text = main[line..end].trim();
            let prototype = text
                .strip_suffix("(void);")
                .map(|t| t.strip_prefix("static ").unwrap_or(t))
                .and_then(|t| t.strip_prefix("void "))
                .map(str::trim)
                .filter(|name| moved.contains(name));
            let handle = text
                .strip_suffix(';')
                .and_then(|t| t.split_once(' '))
                .filter(|(kind, name)| {
                    kind.ends_with("_HandleTypeDef") && name.bytes().all(is_word)
                })
                .and_then(|(_, name)| handles.get_key_value(name));
            if prototype.is_some() {
                cuts.push((line, end));
            } else if let Some((_, group)) = handle {
                cuts.push((line, end));
                groups.insert(group.as_str());
            }
        }
        for &b in &m[line..end] {
            match b {
                b'{' => depth += 1,
                b'}' => depth -= 1,
                _ => {}
            }
        }
        line = end;
    }
    cuts.sort_unstable();
    let mut out = main.to_string();
    for &(start, end) in cuts.iter().rev() {
        out.replace_range(start..end, "");
    }
    // A handle of a moved pair that main.c still defines (written another way) would be defined twice.
    let left = mask_c(&out);
    for (handle, group) in &handles {
        if groups.contains(group.as_str()) && defines_handle(left.as_bytes(), handle) {
            return None;
        }
    }
    let mut names: Vec<&str> = groups
        .into_iter()
        .filter(|g| !includes_header(&out, g))
        .collect();
    names.sort_by_key(|g| (ORDER.iter().position(|o| o == g).unwrap_or(ORDER.len()), *g));
    if !names.is_empty() {
        let o = out.as_bytes();
        let mut at = None;
        let mut line = 0;
        while line < o.len() {
            let end = after_line(o, line);
            let text = out[line..end].trim();
            if text.starts_with('#')
                && text[1..].trim_start().starts_with("include")
                && text.contains("\"main.h\"")
            {
                at = Some(end);
                break;
            }
            line = end;
        }
        let at = at?;
        let includes: String = names
            .iter()
            .map(|g| format!("#include \"{g}.h\"\n"))
            .collect();
        let glue = if at > 0 && out.as_bytes()[at - 1] != b'\n' {
            "\n"
        } else {
            ""
        };
        out.insert_str(at, &format!("{glue}{includes}"));
    }
    let mut files: Vec<(String, String)> = files
        .into_iter()
        .map(|(group, text)| (format!("{group}.c"), text))
        .collect();
    files.sort();
    Some(Coupled { main: out, files })
}

/// Puts `#include "<group>.h"` under `#include "main.h"`, among the pairs' headers already there in CubeMX's order.
/// `None` when main.h is not included.
fn insert_pair_include(code: &str, group: &str) -> Option<String> {
    if includes_header(code, group) {
        return Some(code.to_string());
    }
    let s = code.as_bytes();
    let rank = |g: &str| ORDER.iter().position(|o| *o == g).unwrap_or(ORDER.len());
    let pair_of = |line: &str| -> Option<usize> {
        let t = line
            .trim()
            .strip_prefix('#')?
            .trim_start()
            .strip_prefix("include")?
            .trim();
        let name = t.strip_prefix('"')?.strip_suffix(".h\"")?;
        ORDER.iter().position(|o| *o == name)
    };
    let mut line = 0;
    let mut at = None;
    while line < s.len() {
        let end = after_line(s, line);
        let text = code[line..end].trim();
        if text.starts_with('#')
            && text[1..].trim_start().starts_with("include")
            && text.contains("\"main.h\"")
        {
            at = Some(end);
            break;
        }
        line = end;
    }
    let mut at = at?;
    while at < s.len() {
        let end = after_line(s, at);
        match pair_of(&code[at..end]) {
            Some(other) if other < rank(group) => at = end,
            _ => break,
        }
    }
    let glue = if at > 0 && s[at - 1] != b'\n' {
        "\n"
    } else {
        ""
    };
    Some(format!(
        "{}{glue}#include \"{group}.h\"\n{}",
        &code[..at],
        &code[at..]
    ))
}

/// `text` inserted in front of the line that holds `marker`.
fn before_line(code: &str, marker: &str, text: &str) -> Option<String> {
    let at = code.find(marker)?;
    let line = code[..at].rfind('\n').map_or(0, |n| n + 1);
    Some(format!("{}{text}{}", &code[..line], &code[line..]))
}

/// The pieces the generator writes for USART2 alone.
pub struct ConsolePieces<'a> {
    /// MX_USART2_UART_Init with the pins' GPIO setup inside, for a one-file main.c. `None`: the project has
    /// per-peripheral files — usart.c and gpio.c hold the init code, main.c includes usart.h.
    pub setup: Option<&'a str>,
    pub write: &'a str,
    pub read: &'a str,
}

/// An example's main.c with printf / scanf on USART2 (the ST-LINK virtual COM port): `_write` / `_read`, the call
/// of MX_USART2_UART_Init and — in a one-file main.c — the function, its prototype and the handle. `None`: the
/// example keeps its code (it has its own stdio functions or uses USART2 itself, or a marker is missing).
pub fn add_console(code: &str, pieces: &ConsolePieces) -> Option<String> {
    let own = c_functions(code).ok()?;
    let has = |name: &str| own.iter().any(|f| f.name == name);
    if has("_write")
        || has("_read")
        || has("MX_USART2_UART_Init")
        || has_word(code.as_bytes(), "huart2")
    {
        return None;
    }
    let mut code = code.to_string();
    // The ITM __io_putchar the generator (or an advanced example) wrote gives way to _write.
    match own.iter().find(|f| f.name == "__io_putchar") {
        Some(f) if code[f.open + 1..f.end - 1].contains("ITM_SendChar") => {
            let head = &code[..f.start];
            let head = head
                .strip_suffix("\n\n")
                .map_or(head.to_string(), |h| format!("{h}\n"));
            let tail = &code[f.end..];
            code = format!("{head}{}", tail.strip_prefix('\n').unwrap_or(tail));
        }
        Some(_) => return None,
        None => {}
    }
    let stdio = format!("{}\n\n{}\n\n", pieces.write, pieces.read);
    match pieces.setup {
        Some(setup) => {
            code = before_line(
                &code,
                "/* USER CODE BEGIN 4 */",
                &format!("{setup}\n\n{stdio}"),
            )?;
            code = before_line(
                &code,
                "/* USER CODE BEGIN 2 */",
                "    MX_USART2_UART_Init();\n",
            )?;
            code = before_line(
                &code,
                "/* USER CODE BEGIN 0 */",
                "void MX_USART2_UART_Init(void);\n\n",
            )?;
            code = before_line(
                &code,
                "/* USER CODE BEGIN PV */",
                "UART_HandleTypeDef huart2;\n",
            )?;
        }
        None => {
            code = before_line(&code, "/* USER CODE BEGIN 4 */", &stdio)?;
            code = before_line(
                &code,
                "/* USER CODE BEGIN 2 */",
                "    MX_USART2_UART_Init();\n",
            )?;
            code = insert_pair_include(&code, "usart")?;
        }
    }
    Some(code.replacen(
        " * printf: SWV ITM port 0 (enable SWV in the debugger). Enable USART2 in Pinout to print on the UART.",
        " * printf / scanf: USART2 (ST-LINK virtual COM port) through _write / _read below.",
        1,
    ))
}

/// `\bWORD\b` in raw text.
fn has_word(text: &[u8], word: &str) -> bool {
    let w = word.as_bytes();
    (0..text.len()).any(|i| {
        (i == 0 || !is_word(text[i - 1]))
            && text[i..].starts_with(w)
            && !text.get(i + w.len()).is_some_and(|&b| is_word(b))
    })
}

/// `…_HandleTypeDef NAME` at brace depth 0 of masked text.
fn defines_handle(m: &[u8], name: &str) -> bool {
    let n = name.as_bytes();
    let mut depth: i64 = 0;
    for i in 0..m.len() {
        match m[i] {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            _ => {}
        }
        if depth != 0 || !m[i..].starts_with(n) || m.get(i + n.len()).is_some_and(|&b| is_word(b)) {
            continue;
        }
        // The word in front of the name is the handle type.
        let mut j = i;
        while j > 0 && is_space(m[j - 1]) {
            j -= 1;
        }
        if j < i && m[..j].ends_with(b"_HandleTypeDef") {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN: &str = "#include \"main.h\"\n#include <stdio.h>\n\nI2C_HandleTypeDef hi2c1;\nCAN_HandleTypeDef hcan;\n\n/* USER CODE BEGIN PV */\n/* USER CODE END PV */\n\nvoid SystemClock_Config(void);\nstatic void MX_GPIO_Init(void);\nstatic void MX_I2C1_Init(void);\n\nint main(void) {\n    HAL_Init();\n    MX_GPIO_Init();\n    MX_I2C1_Init();\n    while (1) {\n    }\n}\n\nstatic void MX_GPIO_Init(void) {\n    __HAL_RCC_GPIOB_CLK_ENABLE();\n}\n\nstatic void MX_I2C1_Init(void) {\n    hi2c1.Instance = I2C1;\n    hi2c1.Init.ClockSpeed = 400000;\n}\n\nvoid Error_Handler(void) {\n}\n";

    fn pairs() -> Vec<(String, String)> {
        let pair = |name: &str, handle: &str, function: &str, tag: &str, body: &str| {
            (
                format!("{name}.c"),
                format!("#include \"{name}.h\"\n\n{handle}\nvoid {function}(void) {{\n  /* USER CODE BEGIN {tag}_Init 0 */\n\n  /* USER CODE END {tag}_Init 0 */\n{body}  /* USER CODE BEGIN {tag}_Init 2 */\n\n  /* USER CODE END {tag}_Init 2 */\n}}\n"),
            )
        };
        vec![
            (
                "i2c.h".into(),
                "extern I2C_HandleTypeDef hi2c1;\nvoid MX_I2C1_Init(void);\n".into(),
            ),
            pair(
                "i2c",
                "I2C_HandleTypeDef hi2c1;\n",
                "MX_I2C1_Init",
                "I2C1",
                "  hi2c1.Instance = I2C1;\n  hi2c1.Init.ClockSpeed = 100000;\n",
            ),
            pair(
                "gpio",
                "",
                "MX_GPIO_Init",
                "GPIO",
                "  __HAL_RCC_GPIOB_CLK_ENABLE();\n",
            ),
        ]
    }

    #[test]
    fn the_init_code_of_the_pairs_leaves_main() {
        let out = couple_example(MAIN, &pairs()).unwrap();
        assert!(out.main.starts_with(
            "#include \"main.h\"\n#include \"i2c.h\"\n#include \"gpio.h\"\n#include <stdio.h>\n"
        ));
        assert!(
            !out.main.contains("static void MX_") && !out.main.contains("I2C_HandleTypeDef hi2c1;")
        );
        // What no pair defines stays.
        assert!(
            out.main.contains("CAN_HandleTypeDef hcan;")
                && out.main.contains("void SystemClock_Config(void);")
        );
        assert!(out
            .main
            .contains("    MX_GPIO_Init();\n    MX_I2C1_Init();"));
        assert!(
            out.main.ends_with("}\n\nvoid Error_Handler(void) {\n}\n"),
            "{}",
            out.main
        );
        // The example sets 400 kHz by hand: i2c.c keeps that body; gpio.c is what the generator writes.
        assert_eq!(out.files.len(), 1);
        let (name, text) = &out.files[0];
        assert_eq!(name, "i2c.c");
        assert!(text.contains("  /* USER CODE END I2C1_Init 0 */\n    hi2c1.Instance = I2C1;\n    hi2c1.Init.ClockSpeed = 400000;\n  /* USER CODE BEGIN I2C1_Init 2 */"), "{text}");
        // Dividing the result again changes nothing.
        let again = couple_example(&out.main, &pairs()).unwrap();
        assert_eq!(again.main, out.main);
        assert!(again.files.is_empty());
    }

    #[test]
    fn the_console_in_both_forms() {
        let main = "#include \"main.h\"\n#include \"gpio.h\"\n\n/* USER CODE BEGIN PV */\n/* USER CODE END PV */\n\n/* USER CODE BEGIN 0 */\n/* USER CODE END 0 */\n\nint main(void) {\n    MX_GPIO_Init();\n    /* USER CODE BEGIN 2 */\n    /* USER CODE END 2 */\n    while (1) {\n    }\n}\n\nint __io_putchar(int ch) {\n    ITM_SendChar(ch);\n    return ch;\n}\n\n/* USER CODE BEGIN 4 */\n/* USER CODE END 4 */\n";
        let (write, read) = (
            "int _write(int file, char *ptr, int len) {\n    return len;\n}",
            "int _read(int file, char *ptr, int len) {\n    return 0;\n}",
        );
        let divided = add_console(
            main,
            &ConsolePieces {
                setup: None,
                write,
                read,
            },
        )
        .unwrap();
        assert!(
            divided.starts_with("#include \"main.h\"\n#include \"usart.h\"\n#include \"gpio.h\"\n"),
            "{divided}"
        );
        assert!(divided.contains(
            "    MX_GPIO_Init();\n    MX_USART2_UART_Init();\n    /* USER CODE BEGIN 2 */"
        ));
        assert!(divided.contains("}\n\nint _write(int file, char *ptr, int len) {\n    return len;\n}\n\nint _read(int file, char *ptr, int len) {\n    return 0;\n}\n\n/* USER CODE BEGIN 4 */"), "{divided}");
        assert!(
            !divided.contains("ITM_SendChar")
                && !divided.contains("huart2")
                && !divided.contains("void MX_USART2_UART_Init")
        );
        let one = add_console(
            main,
            &ConsolePieces {
                setup: Some("void MX_USART2_UART_Init(void) {\n}"),
                write,
                read,
            },
        )
        .unwrap();
        assert!(one.contains("UART_HandleTypeDef huart2;\n/* USER CODE BEGIN PV */"));
        assert!(one.contains("void MX_USART2_UART_Init(void);\n\n/* USER CODE BEGIN 0 */"));
        assert!(one.contains("void MX_USART2_UART_Init(void) {\n}\n\nint _write"));
        assert!(!one.contains("usart.h"));
        // An example with its own stdio, or one that uses USART2, keeps its code.
        assert!(add_console(
            &divided,
            &ConsolePieces {
                setup: None,
                write,
                read
            }
        )
        .is_none());
        assert!(add_console(
            &main.replace("ITM_SendChar(ch);", "huart2.Instance = USART2;"),
            &ConsolePieces {
                setup: None,
                write,
                read
            }
        )
        .is_none());
        assert!(add_console(
            &main.replace("ITM_SendChar(ch);", "other(ch);"),
            &ConsolePieces {
                setup: None,
                write,
                read
            }
        )
        .is_none());
    }

    #[test]
    fn a_main_that_cannot_be_divided_safely_stays_one_file() {
        // The handle is defined another way: i2c.c would define it a second time.
        let odd = MAIN.replace("I2C_HandleTypeDef hi2c1;", "I2C_HandleTypeDef hi2c1 = {0};");
        assert_eq!(couple_example(&odd, &pairs()), None);
        let odd = MAIN.replace(
            "static void MX_GPIO_Init(void) {",
            "static void MX_GPIO_Init(int unused) {",
        );
        assert_eq!(couple_example(&odd, &pairs()), None);
        assert_eq!(
            couple_example(&MAIN.replace("#include \"main.h\"\n", ""), &pairs()),
            None
        );
    }
}
