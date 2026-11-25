//! The code a device's Docs example puts into main.c, one marked region per piece:
//!
//! ```text
//! /* STM-DOCS BEGIN <type>:<key> <ROLE> · Docs 예제 */ … /* STM-DOCS END <type>:<key> <ROLE> */
//! ```
//!
//! Ported from `src/device-code-insertion.js` (installDeviceRegions, removeDeviceRegions and their helpers) with
//! feature 51: in a project that generates a pair of `.c/.h` files per peripheral, the initialisation of a device is
//! in `gpio.c`, `i2c.c` … (the generator writes it there from the Pinout settings Docs changed), and main.c gets the
//! `#include "i2c.h"` and the `MX_I2C1_Init();` call instead of a second definition.
//!
//! Regions are found by their markers only, so the code between them may be edited freely. Offsets are byte offsets.

use crate::csource::{c_functions, find, is_space, is_word, is_word_start, mask_c, Function};
use std::collections::{HashMap, HashSet};

/// Roles every device has for itself; the others (headers, handles, MX_<PERIPH>_Init …) are written once and owned by
/// one device.
pub const PER_DEVICE_ROLES: [&str; 4] = ["DECL", "INIT", "LOOP", "MX_GPIO_Init"];
pub const DOCS_INCLUDES: [&str; 2] = ["#include <stdio.h>", "#include <math.h>"];
const USER_2: &[u8] = b"/* USER CODE BEGIN 2 */";
const USER_3: &[u8] = b"/* USER CODE BEGIN 3 */";
const TAIL_FUNCTIONS: [&str; 3] = ["_write", "__io_putchar", "Error_Handler"];
const NO_MAIN: &str = "main.c에 main(void) 함수가 필요합니다.";
const NO_LOOP: &str = "main(void)에 while (1) { ... } 실행 루프를 추가하세요.";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Region {
    pub tag: String,
    pub role: String,
    /// The whole lines of the region, markers included.
    pub start: usize,
    pub end: usize,
    pub body_start: usize,
    pub body_end: usize,
    /// The BEGIN and END markers themselves.
    pub begin: (usize, usize),
    pub close: (usize, usize),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Broken {
    pub tag: String,
    pub role: String,
    pub reason: &'static str,
}

/// What one device contributes (device-assistance.js deviceModule).
#[derive(Clone, Debug, Default)]
pub struct Module {
    pub declarations: String,
    pub init: String,
    pub step: String,
    /// Body of MX_GPIO_Init for the device's pins.
    pub gpio: String,
    /// MX_<PERIPH>_Init: (name, body).
    pub functions: Vec<(String, String)>,
    /// Handles: (type, name).
    pub handles: Vec<(String, String)>,
    pub coupled: Option<Coupled>,
}

/// The per-peripheral files of the project (feature 51).
#[derive(Clone, Debug, Default)]
pub struct Coupled {
    /// Init function → the pair that defines it ("MX_I2C1_Init" → "i2c").
    pub functions: HashMap<String, String>,
    /// Handle → the pair that defines it ("hi2c1" → "i2c").
    pub handles: HashMap<String, String>,
    /// Statements that must run before a call Docs adds (the F1 ADC clock before MX_ADC1_Init).
    pub before: HashMap<String, String>,
    /// The pair already holds the body (the generator wrote it from the Pinout). False for register-level examples:
    /// their bodies are returned as `FileRegion`s for the caller to put into the pair.
    pub in_pair: bool,
}

/// Another applied device and the shared roles it needs: a shared region this device stops needing goes to it.
#[derive(Clone, Debug)]
pub struct Other {
    pub tag: String,
    pub needs: HashSet<String>,
}

/// A body for a function of a per-peripheral file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileRegion {
    pub group: String,
    pub function: String,
    pub body: String,
}

#[derive(Debug)]
pub enum Outcome<T> {
    Done(T),
    /// A shared region has to be released and the other devices were not given: call again with them.
    NeedOthers,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RemoveReport {
    pub removed: usize,
    pub retagged: usize,
    pub missing: Vec<String>,
}

// ---- Markers and regions ----------------------------------------------------------------------------------------

pub fn docs_marker(tag: &str, role: &str, begin: bool) -> String {
    if begin {
        format!("/* STM-DOCS BEGIN {tag} {role} · Docs 예제 */")
    } else {
        format!("/* STM-DOCS END {tag} {role} */")
    }
}

struct Mark {
    begin: bool,
    tag: String,
    role: String,
    start: usize,
    end: usize,
}

/// `/\* STM-DOCS (BEGIN|END) ([A-Za-z0-9_-]+:[A-Za-z0-9_-]+) ([A-Za-z0-9_]+)[^*]*\*/` after the fixed head.
fn mark_at(source: &str, p: usize) -> Option<(bool, String, String, usize)> {
    let s = source.as_bytes();
    let (begin, mut i) = if s[p..].starts_with(b"BEGIN ") {
        (true, p + 6)
    } else if s[p..].starts_with(b"END ") {
        (false, p + 4)
    } else {
        return None;
    };
    let tag_char = |b: u8| b.is_ascii_alphanumeric() || b == b'_' || b == b'-';
    let tag_start = i;
    while i < s.len() && tag_char(s[i]) {
        i += 1;
    }
    if i == tag_start || s.get(i) != Some(&b':') {
        return None;
    }
    i += 1;
    let key_start = i;
    while i < s.len() && tag_char(s[i]) {
        i += 1;
    }
    if i == key_start || s.get(i) != Some(&b' ') {
        return None;
    }
    let tag = source[tag_start..i].to_string();
    i += 1;
    let role_start = i;
    while i < s.len() && is_word(s[i]) {
        i += 1;
    }
    if i == role_start {
        return None;
    }
    let role = source[role_start..i].to_string();
    while i < s.len() && s[i] != b'*' {
        i += 1;
    }
    (s.get(i) == Some(&b'*') && s.get(i + 1) == Some(&b'/')).then_some((begin, tag, role, i + 2))
}

fn marks(source: &str) -> Vec<Mark> {
    let s = source.as_bytes();
    let head = b"/* STM-DOCS ";
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(at) = find(s, head, from) {
        match mark_at(source, at + head.len()) {
            Some((begin, tag, role, end)) => {
                out.push(Mark {
                    begin,
                    tag,
                    role,
                    start: at,
                    end,
                });
                from = end;
            }
            None => from = at + 1,
        }
    }
    out
}

/// The start of the line when only blanks precede `i` on it, else `i`.
fn line_start(s: &[u8], i: usize) -> usize {
    let mut j = i;
    while j > 0 && matches!(s[j - 1], b' ' | b'\t') {
        j -= 1;
    }
    if j == 0 || s[j - 1] == b'\n' {
        j
    } else {
        i
    }
}

/// Past the line break when only blanks follow `i` on its line, else `i`.
fn line_end(s: &[u8], i: usize) -> usize {
    let mut j = i;
    while j < s.len() && matches!(s[j], b' ' | b'\t' | b'\r') {
        j += 1;
    }
    if j < s.len() && s[j] == b'\n' {
        j + 1
    } else if j >= s.len() {
        j
    } else {
        i
    }
}

fn after_line(s: &[u8], i: usize) -> usize {
    s[i.min(s.len())..]
        .iter()
        .position(|&b| b == b'\n')
        .map_or(s.len(), |n| i + n + 1)
}

pub fn docs_regions(source: &str) -> (Vec<Region>, Vec<Broken>) {
    let s = source.as_bytes();
    let marks = marks(source);
    let mut used = vec![false; marks.len()];
    let (mut regions, mut broken) = (Vec::new(), Vec::new());
    for (i, a) in marks.iter().enumerate() {
        if !a.begin {
            continue;
        }
        let mut close = None;
        for (k, b) in marks.iter().enumerate().skip(i + 1) {
            if b.tag == a.tag && b.role == a.role {
                if !b.begin {
                    close = Some(k);
                }
                break;
            }
        }
        match close {
            None => broken.push(Broken {
                tag: a.tag.clone(),
                role: a.role.clone(),
                reason: "END 표시를 찾을 수 없습니다",
            }),
            Some(j) => {
                used[i] = true;
                used[j] = true;
                let b = &marks[j];
                regions.push(Region {
                    tag: a.tag.clone(),
                    role: a.role.clone(),
                    start: line_start(s, a.start),
                    end: line_end(s, b.end),
                    body_start: line_end(s, a.end),
                    body_end: line_start(s, b.start),
                    begin: (a.start, a.end),
                    close: (b.start, b.end),
                });
            }
        }
    }
    for (i, m) in marks.iter().enumerate() {
        if !m.begin && !used[i] {
            broken.push(Broken {
                tag: m.tag.clone(),
                role: m.role.clone(),
                reason: "BEGIN 표시를 찾을 수 없습니다",
            });
        }
    }
    (regions, broken)
}

fn regions_of(source: &str) -> Vec<Region> {
    docs_regions(source).0
}

pub fn without_docs_regions(source: &str) -> String {
    let mut out = source.to_string();
    for r in regions_of(source).iter().rev() {
        out.replace_range(r.start..r.end, "");
    }
    out
}

/// Indentation follows the file (CubeMX output uses two spaces per level): `/\n( +|\t)(?![*\s])\S/`.
pub fn indent_unit(source: &str) -> String {
    let s = source.as_bytes();
    for (k, &b) in s.iter().enumerate() {
        if b != b'\n' {
            continue;
        }
        let mut j = k + 1;
        if s.get(j) == Some(&b' ') {
            while s.get(j) == Some(&b' ') {
                j += 1;
            }
        } else if s.get(j) == Some(&b'\t') {
            j += 1;
        } else {
            continue;
        }
        if s.get(j).is_some_and(|&c| c != b'*' && !is_space(c)) {
            return source[k + 1..j].to_string();
        }
    }
    "    ".to_string()
}

fn indent_with(text: &str, pad: &str, unit: &str) -> String {
    let mut depth: i64 = 0;
    let mut lines = Vec::new();
    for line in text.split('\n') {
        let t = line.trim();
        let mask = mask_c(t);
        let lead = mask.bytes().take_while(|&b| b == b'}').count() as i64;
        lines.push(if t.is_empty() {
            String::new()
        } else {
            format!("{pad}{}{t}", unit.repeat((depth - lead).max(0) as usize))
        });
        depth += mask.bytes().filter(|&b| b == b'{').count() as i64;
        depth -= mask.bytes().filter(|&b| b == b'}').count() as i64;
    }
    lines.join("\n")
}

fn region_text(tag: &str, role: &str, body: &str, pad: &str, unit: &str) -> String {
    let body = body.trim();
    let inner = if body.is_empty() {
        String::new()
    } else {
        indent_with(body, pad, unit) + "\n"
    };
    format!(
        "{pad}{}\n{inner}{pad}{}\n",
        docs_marker(tag, role, true),
        docs_marker(tag, role, false)
    )
}

fn insert_at(source: &str, at: usize, text: &str) -> String {
    let s = source.as_bytes();
    let before = if at > 0 && s[at - 1] != b'\n' {
        "\n"
    } else {
        ""
    };
    let after = if at < s.len() && s[at] != b'\n' && !text.ends_with('\n') {
        "\n"
    } else {
        ""
    };
    format!("{}{before}{text}{after}{}", &source[..at], &source[at..])
}

fn replace_region(source: &str, region: &Region, body: &str) -> String {
    let pad: String = source[region.start..]
        .chars()
        .take_while(|&c| c == ' ' || c == '\t')
        .collect();
    format!(
        "{}{}{}",
        &source[..region.start],
        region_text(&region.tag, &region.role, body, &pad, &indent_unit(source)),
        &source[region.end..]
    )
}

fn retag_region(source: &str, region: &Region, tag: &str) -> String {
    format!(
        "{}{}{}{}{}",
        &source[..region.begin.0],
        docs_marker(tag, &region.role, true),
        &source[region.begin.1..region.close.0],
        docs_marker(tag, &region.role, false),
        &source[region.close.1..]
    )
}

fn remove_region_tidy(source: &str, r: &Region) -> String {
    let s = source.as_bytes();
    let mut start = r.start;
    if start >= 2 && s[start - 1] == b'\n' && s[start - 2] == b'\n' && s.get(r.end) == Some(&b'\n')
    {
        start -= 1;
    }
    format!("{}{}", &source[..start], &source[r.end..])
}

fn inside_region(regions: &[Region], at: usize) -> Option<&Region> {
    regions.iter().find(|r| at >= r.start && at < r.end)
}

fn last_region<'a>(
    regions: &'a [Region],
    role: &str,
    from: usize,
    to: usize,
) -> Option<&'a Region> {
    regions
        .iter()
        .rev()
        .find(|r| r.role == role && r.start >= from && r.end <= to)
}

// ---- Small matchers on masked source ---------------------------------------------------------------------------

fn skip_ws(m: &[u8], mut i: usize) -> usize {
    while i < m.len() && is_space(m[i]) {
        i += 1;
    }
    i
}

/// `\b` in front of a word character at `i`.
fn boundary(m: &[u8], i: usize) -> bool {
    i == 0 || !is_word(m[i - 1])
}

fn word_end(m: &[u8], mut i: usize) -> usize {
    while i < m.len() && is_word(m[i]) {
        i += 1;
    }
    i
}

fn expect(m: &[u8], i: usize, b: u8) -> Option<usize> {
    (m.get(i) == Some(&b)).then_some(i + 1)
}

/// `\s*\(\s*\)\s*;` at `i` → the end of the match.
fn empty_call_tail(m: &[u8], i: usize) -> Option<usize> {
    let j = expect(m, skip_ws(m, i), b'(')?;
    let j = expect(m, skip_ws(m, j), b')')?;
    expect(m, skip_ws(m, j), b';')
}

/// First `\bNAME\s*\(\s*\)\s*;` in `m`.
fn find_call(m: &[u8], name: &str) -> Option<usize> {
    let n = name.as_bytes();
    (0..m.len()).find(|&i| {
        boundary(m, i) && m[i..].starts_with(n) && empty_call_tail(m, i + n.len()).is_some()
    })
}

/// `^MX_\w+_Init$`.
pub fn is_mx_init(name: &str) -> bool {
    name.len() >= 9
        && name.starts_with("MX_")
        && name.ends_with("_Init")
        && name.bytes().all(is_word)
}

/// Every `\bMX_\w+_Init\s*\(\s*\)\s*;` in `m`: the start of each.
fn mx_init_calls(m: &[u8]) -> Vec<usize> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < m.len() {
        if boundary(m, i) && m[i..].starts_with(b"MX_") {
            let e = word_end(m, i);
            // The masked text is ASCII wherever a word is.
            if is_mx_init(std::str::from_utf8(&m[i..e]).unwrap_or("")) {
                if let Some(end) = empty_call_tail(m, e) {
                    out.push(i);
                    i = end;
                    continue;
                }
            }
            i = e.max(i + 1);
        } else {
            i += 1;
        }
    }
    out
}

/// `\s*\(\s*void\s*\)\s*;` at `i`.
fn void_prototype_tail(m: &[u8], i: usize) -> Option<usize> {
    let j = skip_ws(m, expect(m, skip_ws(m, i), b'(')?);
    if !m[j..].starts_with(b"void") {
        return None;
    }
    let j = expect(m, skip_ws(m, j + 4), b')')?;
    expect(m, skip_ws(m, j), b';')
}

/// `\bvoid\s+NAME\s*\(\s*void\s*\)\s*;` anywhere in `m`.
fn has_prototype(m: &[u8], name: &str) -> bool {
    let n = name.as_bytes();
    (0..m.len()).any(|i| {
        if !boundary(m, i) || !m[i..].starts_with(b"void") {
            return false;
        }
        let j = skip_ws(m, i + 4);
        j > i + 4 && m[j..].starts_with(n) && void_prototype_tail(m, j + n.len()).is_some()
    })
}

/// Lines `^[ \t]*(?:static\s+)?void\s+(?:MX_\w+_Init|SystemClock_Config|Error_Handler)\s*\(\s*void\s*\)\s*;`: the
/// start of each.
fn init_prototypes(m: &[u8]) -> Vec<usize> {
    let mut out = Vec::new();
    let mut line = 0;
    let mut resume = 0;
    while line <= m.len() {
        if line >= resume {
            if let Some(end) = init_prototype_at(m, line) {
                out.push(line);
                resume = end;
            }
        }
        match m[line.min(m.len())..].iter().position(|&b| b == b'\n') {
            Some(n) => line += n + 1,
            None => break,
        }
    }
    out
}

fn init_prototype_at(m: &[u8], line: usize) -> Option<usize> {
    let mut j = line;
    while j < m.len() && matches!(m[j], b' ' | b'\t') {
        j += 1;
    }
    if m[j..].starts_with(b"static") {
        let k = skip_ws(m, j + 6);
        if k > j + 6 {
            j = k;
        }
    }
    if !m[j..].starts_with(b"void") {
        return None;
    }
    let k = skip_ws(m, j + 4);
    if k == j + 4 {
        return None;
    }
    let e = word_end(m, k);
    let name = std::str::from_utf8(&m[k..e]).unwrap_or("");
    if !(is_mx_init(name) || name == "SystemClock_Config" || name == "Error_Handler") {
        return None;
    }
    void_prototype_tail(m, e)
}

/// `\bTYPE\s+NAME\b` anywhere in `m`.
fn has_declaration(m: &[u8], kind: &str, name: &str) -> bool {
    let (t, n) = (kind.as_bytes(), name.as_bytes());
    (0..m.len()).any(|i| {
        if !boundary(m, i) || !m[i..].starts_with(t) {
            return false;
        }
        let j = skip_ws(m, i + t.len());
        j > i + t.len() && m[j..].starts_with(n) && !m.get(j + n.len()).is_some_and(|&b| is_word(b))
    })
}

/// `\bWORD\b`.
fn has_word(text: &[u8], word: &str) -> bool {
    let w = word.as_bytes();
    (0..text.len()).any(|i| {
        boundary(text, i)
            && text[i..].starts_with(w)
            && !text.get(i + w.len()).is_some_and(|&b| is_word(b))
    })
}

/// The line `GPIO_InitTypeDef GPIO_InitStruct = {0};` taken out once
/// (`/^[ \t]*GPIO_InitTypeDef\s+GPIO_InitStruct\s*=\s*\{\s*0\s*\}\s*;[ \t]*\r?\n?/m`).
fn without_gpio_declaration(body: &str) -> String {
    let s = body.as_bytes();
    let mut line = 0;
    loop {
        if let Some(end) = gpio_declaration_at(s, line) {
            return format!("{}{}", &body[..line], &body[end..]);
        }
        match s[line.min(s.len())..].iter().position(|&b| b == b'\n') {
            Some(n) => line += n + 1,
            None => return body.to_string(),
        }
    }
}

fn gpio_declaration_at(s: &[u8], line: usize) -> Option<usize> {
    let mut j = line;
    while j < s.len() && matches!(s[j], b' ' | b'\t') {
        j += 1;
    }
    if !s[j..].starts_with(b"GPIO_InitTypeDef") {
        return None;
    }
    let k = skip_ws(s, j + 16);
    if k == j + 16 || !s[k..].starts_with(b"GPIO_InitStruct") {
        return None;
    }
    let mut j = k + 15;
    for b in *b"={0};" {
        j = expect(s, skip_ws(s, j), b)?;
    }
    while j < s.len() && matches!(s[j], b' ' | b'\t') {
        j += 1;
    }
    if s.get(j) == Some(&b'\r') {
        j += 1;
    }
    if s.get(j) == Some(&b'\n') {
        j += 1;
    }
    Some(j)
}

/// The first `\bHAL_\w+_Init\s*\(\s*&\s*\w+\b` of a masked body, as text.
fn hal_init_call(m: &[u8]) -> Option<&[u8]> {
    let mut i = 0;
    while i < m.len() {
        if boundary(m, i) && m[i..].starts_with(b"HAL_") {
            let e = word_end(m, i);
            if e - i >= 10 && m[i..e].ends_with(b"_Init") {
                if let Some(j) = expect(m, skip_ws(m, e), b'(') {
                    if let Some(j) = expect(m, skip_ws(m, j), b'&') {
                        let j = skip_ws(m, j);
                        let k = word_end(m, j);
                        if k > j {
                            return Some(&m[i..k]);
                        }
                    }
                }
            }
            i = e.max(i + 1);
        } else {
            i += 1;
        }
    }
    None
}

fn squeeze(bytes: &[u8]) -> Vec<u8> {
    bytes.iter().copied().filter(|&b| !is_space(b)).collect()
}

/// Top-level statements of a block of C (device-code-insertion.js statements).
pub fn statements(source: &str) -> Vec<&str> {
    let mask = mask_c(source);
    let m = mask.as_bytes();
    let mut out = Vec::new();
    let (mut start, mut brace, mut paren) = (0usize, 0i64, 0i64);
    for (i, &c) in m.iter().enumerate() {
        match c {
            b'(' => paren += 1,
            b')' => paren -= 1,
            b'{' => brace += 1,
            b'}' => brace -= 1,
            _ => {}
        }
        let closes = brace == 0 && paren == 0;
        let ends = (c == b';' && closes) || (c == b'}' && closes && !continues(m, i + 1));
        if ends {
            out.push(&source[start..=i]);
            start = i + 1;
        }
    }
    if !source[start..].trim().is_empty() {
        out.push(&source[start..]);
    }
    out
}

/// `/^\s*(?:else\b|;)/` on what follows a closing brace.
fn continues(m: &[u8], from: usize) -> bool {
    let j = skip_ws(m, from);
    m.get(j) == Some(&b';')
        || (m[j.min(m.len())..].starts_with(b"else") && !m.get(j + 4).is_some_and(|&b| is_word(b)))
}

/// A statement that declares a local:
/// `/^\s*(?:(?:static|const|volatile|unsigned|signed|struct|enum)\s+)*(?!return\b|else\b|goto\b|case\b)[A-Za-z_]\w*(?:\s*\*+\s*|\s+)\**[A-Za-z_]\w*\s*(?:\[|=|;|,)/`
fn is_declaration(m: &[u8]) -> bool {
    const QUALIFIERS: [&[u8]; 7] = [
        b"static",
        b"const",
        b"volatile",
        b"unsigned",
        b"signed",
        b"struct",
        b"enum",
    ];
    const NOT_TYPES: [&[u8]; 4] = [b"return", b"else", b"goto", b"case"];
    // Positions after 0, 1, 2 … qualifiers: the pattern may take any number of them.
    let mut starts = vec![skip_ws(m, 0)];
    loop {
        let p = *starts.last().unwrap();
        let next = QUALIFIERS.iter().find_map(|q| {
            if !m[p..].starts_with(q) {
                return None;
            }
            let j = skip_ws(m, p + q.len());
            (j > p + q.len()).then_some(j)
        });
        match next {
            Some(j) => starts.push(j),
            None => break,
        }
    }
    starts.iter().rev().any(|&p| {
        if NOT_TYPES
            .iter()
            .any(|w| m[p..].starts_with(w) && !m.get(p + w.len()).is_some_and(|&b| is_word(b)))
        {
            return false;
        }
        if !m.get(p).is_some_and(|&b| is_word_start(b)) {
            return false;
        }
        let q = word_end(m, p);
        let mut j = skip_ws(m, q);
        if m.get(j) == Some(&b'*') {
            while m.get(j) == Some(&b'*') {
                j += 1;
            }
            j = skip_ws(m, j);
        } else if j == q {
            return false;
        }
        while m.get(j) == Some(&b'*') {
            j += 1;
        }
        if !m.get(j).is_some_and(|&b| is_word_start(b)) {
            return false;
        }
        let j = skip_ws(m, word_end(m, j));
        matches!(m.get(j), Some(b'[' | b'=' | b';' | b','))
    })
}

/// Local declarations of two devices must not collide in one scope; such blocks get their own braces.
pub fn scoped(text: &str) -> String {
    if statements(text)
        .iter()
        .any(|s| is_declaration(mask_c(s).as_bytes()))
    {
        format!("{{\n{}\n}}", text.trim())
    } else {
        text.to_string()
    }
}

/// Whitespace-insensitive search: the tokens of `snippet` with any white space between them. The first match, when it
/// ends by `to`.
pub fn loose_find(source: &str, snippet: &str, from: usize, to: usize) -> Option<(usize, usize)> {
    let tokens: Vec<&[u8]> = snippet
        .split(|c: char| c.is_ascii() && is_space(c as u8))
        .filter(|t| !t.is_empty())
        .map(str::as_bytes)
        .collect();
    if tokens.is_empty() {
        return None;
    }
    let s = source.as_bytes();
    for i in from..s.len() {
        let mut j = i;
        let mut matched = true;
        for (n, token) in tokens.iter().enumerate() {
            if n > 0 {
                j = skip_ws(s, j);
            }
            if !s[j..].starts_with(token) {
                matched = false;
                break;
            }
            j += token.len();
        }
        if matched {
            return (j <= to).then_some((i, j));
        }
    }
    None
}

// ---- Where a region goes ----------------------------------------------------------------------------------------

struct MainLoop {
    main: Function,
    at: usize,
    open: usize,
}

/// `\b(?:while\s*\(\s*(?:1|true)\s*\)|for\s*\(\s*;\s*;\s*\))\s*\{` at `i` → the end of the match.
fn loop_at(m: &[u8], i: usize) -> Option<usize> {
    if !boundary(m, i) {
        return None;
    }
    let j = if m[i..].starts_with(b"while") {
        let j = skip_ws(m, expect(m, skip_ws(m, i + 5), b'(')?);
        let j = if m[j..].starts_with(b"true") {
            j + 4
        } else {
            expect(m, j, b'1')?
        };
        expect(m, skip_ws(m, j), b')')?
    } else if m[i..].starts_with(b"for") {
        let j = expect(m, skip_ws(m, i + 3), b'(')?;
        let j = expect(m, skip_ws(m, j), b';')?;
        let j = expect(m, skip_ws(m, j), b';')?;
        expect(m, skip_ws(m, j), b')')?
    } else {
        return None;
    };
    expect(m, skip_ws(m, j), b'{')
}

fn main_loop(source: &str) -> Result<MainLoop, String> {
    let main = c_functions(source)?
        .into_iter()
        .find(|f| f.name == "main")
        .ok_or(NO_MAIN)?;
    let mask = mask_c(source);
    let m = mask.as_bytes();
    let mut i = main.open + 1;
    while i < m.len() {
        match loop_at(m, i) {
            Some(end) => {
                if i >= main.end {
                    break;
                }
                let depth: i64 = m[main.open + 1..i]
                    .iter()
                    .map(|&b| match b {
                        b'{' => 1,
                        b'}' => -1,
                        _ => 0,
                    })
                    .sum();
                if depth == 0 {
                    return Ok(MainLoop {
                        main,
                        at: i,
                        open: end - 1,
                    });
                }
                i = end;
            }
            None => i += 1,
        }
    }
    Err(NO_LOOP.into())
}

/// An include of a per-peripheral header goes under `#include "main.h"`, as the generator writes them.
fn after_main_h(source: &str) -> Option<usize> {
    let s = source.as_bytes();
    let regions = regions_of(source);
    let mut line = 0;
    while line < s.len() {
        let end = after_line(s, line);
        let text = source[line..end].trim();
        if text.starts_with('#')
            && text[1..].trim_start().starts_with("include")
            && text.contains("\"main.h\"")
            && inside_region(&regions, line).is_none()
        {
            return Some(end);
        }
        line = end;
    }
    None
}

/// (offset, indentation level) for a new region of `role`.
fn anchor_for(source: &str, role: &str) -> Result<(usize, usize), String> {
    let s = source.as_bytes();
    let regions = regions_of(source);
    if matches!(role, "DECL" | "INIT" | "LOOP") || role.ends_with("_CALL") {
        let ml = main_loop(source)?;
        let (open, end) = (ml.main.open, ml.main.end);
        match role {
            "DECL" => {
                let at = last_region(&regions, "DECL", open, end)
                    .map_or_else(|| after_line(s, open), |r| r.end);
                return Ok((at, 1));
            }
            "INIT" => {
                if let Some(r) = last_region(&regions, "INIT", open, end) {
                    return Ok((r.end, 1));
                }
                let at = match find(s, USER_2, open) {
                    Some(u) if u < ml.at => after_line(s, u),
                    _ => line_start(s, ml.at),
                };
                return Ok((at, 1));
            }
            "LOOP" => {
                if let Some(r) = last_region(&regions, "LOOP", open, end) {
                    return Ok((r.end, 2));
                }
                let at = match find(s, USER_3, ml.open) {
                    Some(u) if u < end => after_line(s, u),
                    _ => after_line(s, ml.open),
                };
                return Ok((at, 2));
            }
            _ => {}
        }
        // Peripheral init calls follow the last MX_*_Init() call before the user section, as in CubeMX output.
        let mask = mask_c(source);
        let m = mask.as_bytes();
        let limit = match find(s, USER_2, open) {
            Some(u) if u < ml.at => u,
            _ => ml.at,
        };
        let mut at: Option<usize> = None;
        for index in mx_init_calls(&m[..limit]) {
            if index > open {
                at = Some(
                    inside_region(&regions, index).map_or_else(|| after_line(s, index), |r| r.end),
                );
            }
        }
        for r in &regions {
            if r.role.ends_with("_CALL") && r.start > open && r.end <= limit {
                at = Some(at.map_or(r.end, |a| a.max(r.end)));
            }
        }
        let at = at.unwrap_or_else(|| {
            let body = &m[open..limit.max(open)];
            match find_call(body, "SystemClock_Config").or_else(|| find_call(body, "HAL_Init")) {
                Some(index) => after_line(s, open + index),
                None => last_region(&regions, "DECL", open, end)
                    .map_or_else(|| after_line(s, open), |r| r.end),
            }
        });
        return Ok((at, 1));
    }
    let fns = c_functions(source)?;
    let first = fns.first();
    let top = || match first {
        None => s.len(),
        Some(f) => {
            inside_region(&regions, f.start).map_or_else(|| line_start(s, f.start), |r| r.start)
        }
    };
    if role.ends_with("_PROTO") {
        let mask = mask_c(source);
        let mut at: Option<usize> = None;
        for index in init_prototypes(mask.as_bytes()) {
            if first.is_some_and(|f| index > f.start) {
                break;
            }
            at = Some(
                inside_region(&regions, index).map_or_else(|| after_line(s, index), |r| r.end),
            );
        }
        for r in &regions {
            if r.role.ends_with("_PROTO") && (first.is_none() || r.end <= top()) {
                at = Some(at.map_or(r.end, |a| a.max(r.end)));
            }
        }
        return Ok((at.unwrap_or_else(top), 0));
    }
    if role.starts_with("INC_") {
        return Ok((after_main_h(source).unwrap_or_else(top), 0));
    }
    if role == "HEADERS" || role.starts_with("HANDLE_") {
        return Ok((top(), 0));
    }
    // A created MX_*_Init definition: after the last MX init definition, else before the support functions.
    let mut at: Option<usize> = None;
    for f in &fns {
        if is_mx_init(&f.name) || f.name == "SystemClock_Config" {
            let here =
                inside_region(&regions, f.start).map_or_else(|| after_line(s, f.end), |r| r.end);
            at = Some(at.map_or(here, |a| a.max(here)));
        }
    }
    let at = at.unwrap_or_else(|| {
        fns.iter()
            .find(|f| TAIL_FUNCTIONS.contains(&f.name.as_str()))
            .map_or(s.len(), |f| line_start(s, f.start))
    });
    Ok((at, 0))
}

fn function_end_anchor(source: &str, name: &str) -> Result<(usize, usize), String> {
    let f = c_functions(source)?
        .into_iter()
        .find(|f| f.name == name)
        .ok_or_else(|| format!("{name} 함수를 찾을 수 없습니다."))?;
    Ok((line_start(source.as_bytes(), f.end - 1), 1))
}

/// Creates an empty CubeMX-style MX_GPIO_Init (prototype, definition and call) when the file has none.
fn ensure_gpio_init(source: &str) -> Result<String, String> {
    if c_functions(source)?
        .iter()
        .any(|f| f.name == "MX_GPIO_Init")
    {
        return Ok(source.to_string());
    }
    let mut source = source.to_string();
    if !has_prototype(mask_c(&source).as_bytes(), "MX_GPIO_Init") {
        let (at, _) = anchor_for(&source, "MX_GPIO_Init_PROTO")?;
        source = insert_at(&source, at, "static void MX_GPIO_Init(void);\n");
    }
    let fns = c_functions(&source)?;
    let unit = indent_unit(&source);
    let definition = format!("\nstatic void MX_GPIO_Init(void) {{\n{unit}GPIO_InitTypeDef GPIO_InitStruct = {{0}};\n}}\n");
    source = if let Some(clock) = fns.iter().find(|f| f.name == "SystemClock_Config") {
        insert_at(
            &source,
            after_line(source.as_bytes(), clock.end - 1),
            &definition,
        )
    } else if let Some(tail) = fns
        .iter()
        .find(|f| TAIL_FUNCTIONS.contains(&f.name.as_str()))
    {
        insert_at(
            &source,
            line_start(source.as_bytes(), tail.start),
            &format!("{}\n", &definition[1..]),
        )
    } else {
        let kept = source.trim_end_matches(|c: char| c.is_ascii() && is_space(c as u8));
        format!("{kept}\n{definition}")
    };
    let main = main_loop(&source)?.main;
    let mask = mask_c(&source);
    let body = &mask.as_bytes()[main.open..main.end];
    if find_call(body, "MX_GPIO_Init").is_none() {
        let at = match find_call(body, "SystemClock_Config").or_else(|| find_call(body, "HAL_Init"))
        {
            Some(index) => after_line(source.as_bytes(), main.open + index),
            None => after_line(source.as_bytes(), main.open),
        };
        source = insert_at(
            &source,
            at,
            &format!("{}MX_GPIO_Init();\n", indent_unit(&source)),
        );
    }
    Ok(source)
}

// ---- Writing regions --------------------------------------------------------------------------------------------

enum Anchor<'a> {
    Role,
    FunctionEnd(&'a str),
}

fn definition_role(role: &str) -> bool {
    is_mx_init(role) && role != "MX_GPIO_Init"
}

fn insert_region(
    source: &str,
    tag: &str,
    role: &str,
    text: &str,
    anchor: &Anchor,
) -> Result<String, String> {
    let (at, level) = match anchor {
        Anchor::Role => anchor_for(source, role)?,
        Anchor::FunctionEnd(name) => function_end_anchor(source, name)?,
    };
    let s = source.as_bytes();
    let pad = if level == 0
        && definition_role(role)
        && at > 1
        && s[at - 1] == b'\n'
        && s[at - 2] != b'\n'
    {
        "\n"
    } else {
        ""
    };
    let unit = indent_unit(source);
    let text = region_text(tag, role, text, &unit.repeat(level), &unit);
    Ok(insert_at(source, at, &format!("{pad}{text}")))
}

fn set_region(
    source: &str,
    tag: &str,
    role: &str,
    text: &str,
    anchor: &Anchor,
) -> Result<String, String> {
    let regions = regions_of(source);
    let current = regions.iter().find(|r| r.tag == tag && r.role == role);
    if text.trim().is_empty() {
        return Ok(current.map_or_else(|| source.to_string(), |r| remove_region_tidy(source, r)));
    }
    match current {
        Some(r) => Ok(replace_region(source, r, text)),
        None => insert_region(source, tag, role, text, anchor),
    }
}

/// A region written once and owned by one device: left alone when another device has it.
fn shared_region(
    source: &str,
    tag: &str,
    role: &str,
    content: impl Fn(&str) -> String,
) -> Result<String, String> {
    if regions_of(source)
        .iter()
        .find(|r| r.role == role)
        .is_some_and(|r| r.tag != tag)
    {
        return Ok(source.to_string());
    }
    set_region(
        source,
        tag,
        role,
        &content(&without_docs_regions(source)),
        &Anchor::Role,
    )
}

fn has_call(source: &str, name: &str) -> Result<bool, String> {
    let main = main_loop(source)?.main;
    let mask = mask_c(source);
    Ok(find_call(&mask.as_bytes()[main.open..main.end], name).is_some())
}

/// The GPIO setup of a device as it goes into an MX_GPIO_Init that may not declare GPIO_InitStruct.
fn gpio_body(source: &str, body: &str) -> Result<String, String> {
    let stripped = without_gpio_declaration(body);
    if stripped.trim().is_empty() {
        return Ok(String::new());
    }
    let outside = without_docs_regions(source);
    let declared = c_functions(&outside)?
        .iter()
        .find(|f| f.name == "MX_GPIO_Init")
        .is_some_and(|f| {
            has_declaration(
                mask_c(&outside[f.open + 1..f.end - 1]).as_bytes(),
                "GPIO_InitTypeDef",
                "GPIO_InitStruct",
            )
        });
    Ok(
        if declared || !has_word(stripped.as_bytes(), "GPIO_InitStruct") {
            stripped
        } else {
            format!("{{\nGPIO_InitTypeDef GPIO_InitStruct = {{0}};\n{stripped}\n}}")
        },
    )
}

/// The existing function already calls the peripheral's HAL_<X>_Init(&handle) that the Docs body would add.
fn initialises(source: &str, f: &Function, body: &str) -> bool {
    let mask = mask_c(body);
    match hal_init_call(mask.as_bytes()) {
        None => false,
        Some(call) => {
            let call = squeeze(call);
            let own = squeeze(mask_c(&source[f.start..f.end]).as_bytes());
            own.windows(call.len()).any(|w| w == call.as_slice())
        }
    }
}

fn install_function(source: &str, tag: &str, name: &str, body: &str) -> Result<String, String> {
    let regions = regions_of(source);
    let current = regions.iter().find(|r| r.role == name);
    if current.is_some_and(|r| r.tag != tag) {
        return Ok(source.to_string());
    }
    let definition = format!("static void {name}(void) {{\n{}\n}}", body.trim());
    let find = |text: &str| -> Result<Option<Function>, String> {
        Ok(c_functions(text)?.into_iter().find(|f| f.name == name))
    };
    let existing = find(source)?;
    let call_role = format!("{name}_CALL");
    let call = format!("{name}();");
    let mut source = if let Some(r) = current {
        let is_definition = existing
            .as_ref()
            .is_none_or(|f| f.start >= r.start && f.end <= r.end);
        replace_region(source, r, if is_definition { &definition } else { body })
    } else if let Some(f) = &existing {
        // An MX_<PERIPH>_Init already in the file (from the Pinout or the example) already initialises the
        // peripheral: adding the Docs body inside it would declare its locals twice and initialise twice.
        if initialises(source, f, body) {
            return if has_call(source, name)? {
                Ok(source.to_string())
            } else {
                insert_region(source, tag, &call_role, &call, &Anchor::Role)
            };
        }
        insert_region(source, tag, name, body, &Anchor::FunctionEnd(name))?
    } else {
        insert_region(source, tag, name, &definition, &Anchor::Role)?
    };
    let regions = regions_of(&source);
    let own = regions.iter().find(|r| r.role == name);
    let now = find(&source)?;
    let created = matches!((own, &now), (Some(r), Some(f)) if f.start >= r.start && f.end <= r.end);
    let proto_role = format!("{name}_PROTO");
    if created
        && !regions.iter().any(|r| r.role == proto_role)
        && !has_prototype(mask_c(&source).as_bytes(), name)
    {
        source = insert_region(
            &source,
            tag,
            &proto_role,
            &format!("static void {name}(void);"),
            &Anchor::Role,
        )?;
    }
    if !regions_of(&source).iter().any(|r| r.role == call_role) && !has_call(&source, name)? {
        source = insert_region(&source, tag, &call_role, &call, &Anchor::Role)?;
    }
    Ok(source)
}

/// The shared roles a module writes: a region with one of them is kept for the device, or handed to another device
/// that needs it when this one is removed.
pub fn module_needs(module: &Module) -> HashSet<String> {
    let mut needs: HashSet<String> = HashSet::from(["HEADERS".to_string()]);
    for (_, name) in &module.handles {
        needs.insert(format!("HANDLE_{name}"));
    }
    for (name, _) in &module.functions {
        needs.insert(name.clone());
        needs.insert(format!("{name}_PROTO"));
        needs.insert(format!("{name}_CALL"));
    }
    if let Some(coupled) = &module.coupled {
        for (name, _) in &module.functions {
            if let Some(group) = coupled.functions.get(name) {
                needs.insert(format!("INC_{group}"));
            }
        }
        for (_, name) in &module.handles {
            if let Some(group) = coupled.handles.get(name) {
                needs.insert(format!("INC_{group}"));
            }
        }
        if has_gpio(module) {
            if let Some(group) = coupled.functions.get("MX_GPIO_Init") {
                needs.insert(format!("INC_{group}"));
                needs.insert("MX_GPIO_Init_CALL".to_string());
            }
        }
    }
    needs
}

fn has_gpio(module: &Module) -> bool {
    !without_gpio_declaration(&module.gpio).trim().is_empty()
}

enum Released {
    Source(String),
    NeedOthers,
}

fn release(source: &str, region: &Region, others: Option<&[Other]>) -> (Released, bool) {
    let Some(others) = others else {
        return (Released::NeedOthers, false);
    };
    match others
        .iter()
        .find(|o| o.tag != region.tag && o.needs.contains(&region.role))
    {
        Some(heir) => (
            Released::Source(retag_region(source, region, &heir.tag)),
            true,
        ),
        None => (Released::Source(remove_region_tidy(source, region)), false),
    }
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

/// main.c of a project with per-peripheral files: the header of the pair that holds the device's init code.
fn include_region(source: &str, tag: &str, group: &str) -> Result<String, String> {
    shared_region(source, tag, &format!("INC_{group}"), |outside| {
        if includes_header(outside, group) {
            String::new()
        } else {
            format!("#include \"{group}.h\"")
        }
    })
}

/// … and the call of its init function, when main does not call it yet.
fn call_region(source: &str, tag: &str, name: &str, before: &str) -> Result<String, String> {
    let role = format!("{name}_CALL");
    if regions_of(source).iter().any(|r| r.role == role) || has_call(source, name)? {
        return Ok(source.to_string());
    }
    let text = if before.trim().is_empty() {
        format!("{name}();")
    } else {
        format!("{{\n{}\n}}\n{name}();", before.trim())
    };
    insert_region(source, tag, &role, &text, &Anchor::Role)
}

/// Functions main.c defines itself: everything but a definition inside this device's own region.
fn defined_in_main(source: &str, tag: &str) -> Result<HashSet<String>, String> {
    let regions = regions_of(source);
    Ok(c_functions(source)?
        .into_iter()
        .filter(|f| {
            !regions
                .iter()
                .any(|r| r.tag == tag && r.role == f.name && f.start >= r.start && f.end <= r.end)
        })
        .map(|f| f.name)
        .collect())
}

/// Writes one device's regions into main.c. Regions of other devices are never touched; shared resources (headers,
/// handles, MX_<PERIPH>_Init) are written once and owned by one device. With per-peripheral files, the init functions
/// and handles those files define are included and called instead of written, and the bodies the files do not hold
/// yet are returned.
pub fn install_device_regions(
    source: &str,
    tag: &str,
    module: &Module,
    others: Option<&[Other]>,
) -> Result<Outcome<(String, Vec<FileRegion>)>, String> {
    let (_, broken) = docs_regions(source);
    if let Some(bad) = broken.iter().find(|b| b.tag == tag) {
        return Err(format!(
            "main.c의 {tag} {} 영역 표시가 손상되었습니다({}). 남은 STM-DOCS 표시를 복구하거나 삭제한 뒤 다시 적용하세요.",
            bad.role, bad.reason
        ));
    }
    main_loop(source)?;
    let need = module_needs(module);
    let mut source = source.to_string();
    loop {
        let regions = regions_of(&source);
        let Some(r) = regions.iter().find(|r| {
            r.tag == tag && !PER_DEVICE_ROLES.contains(&r.role.as_str()) && !need.contains(&r.role)
        }) else {
            break;
        };
        match release(&source, r, others).0 {
            Released::Source(next) => source = next,
            Released::NeedOthers => return Ok(Outcome::NeedOthers),
        }
    }
    source = set_region(&source, tag, "DECL", &module.declarations, &Anchor::Role)?;
    // Code the program already has outside Docs regions (e.g. the device's own HAL example) is not added a second time.
    let present = |source: &str, text: &str| {
        !text.trim().is_empty() && {
            let outside = without_docs_regions(source);
            loose_find(&outside, text, 0, outside.len()).is_some()
        }
    };
    let init = if present(&source, &module.init) {
        String::new()
    } else {
        scoped(&module.init)
    };
    source = set_region(&source, tag, "INIT", &init, &Anchor::Role)?;
    let step = if present(&source, &module.step) {
        String::new()
    } else {
        scoped(&module.step)
    };
    source = set_region(&source, tag, "LOOP", &step, &Anchor::Role)?;

    let mut file_regions = Vec::new();
    let own = defined_in_main(&source, tag)?;
    // The pair that defines `name`, unless main.c defines the function itself.
    let pair_of = |name: &str| -> Option<&Coupled> {
        module
            .coupled
            .as_ref()
            .filter(|c| c.functions.contains_key(name) && !own.contains(name))
    };
    if has_gpio(module) {
        if let Some(coupled) = pair_of("MX_GPIO_Init") {
            let group = &coupled.functions["MX_GPIO_Init"];
            source = set_region(&source, tag, "MX_GPIO_Init", "", &Anchor::Role)?;
            source = include_region(&source, tag, group)?;
            source = call_region(&source, tag, "MX_GPIO_Init", "")?;
            if !coupled.in_pair {
                file_regions.push(FileRegion {
                    group: group.clone(),
                    function: "MX_GPIO_Init".into(),
                    body: module.gpio.clone(),
                });
            }
        } else {
            source = ensure_gpio_init(&source)?;
            let body = gpio_body(&source, &module.gpio)?;
            source = set_region(
                &source,
                tag,
                "MX_GPIO_Init",
                &body,
                &Anchor::FunctionEnd("MX_GPIO_Init"),
            )?;
        }
    } else {
        source = set_region(&source, tag, "MX_GPIO_Init", "", &Anchor::Role)?;
    }
    source = shared_region(&source, tag, "HEADERS", |outside| {
        DOCS_INCLUDES
            .iter()
            .filter(|line| !outside.contains(&line[9..]))
            .copied()
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    for (kind, name) in &module.handles {
        let role = format!("HANDLE_{name}");
        let pair = module.coupled.as_ref().and_then(|c| c.handles.get(name));
        let declared = has_declaration(
            mask_c(&without_docs_regions(&source)).as_bytes(),
            kind,
            name,
        );
        let theirs = regions_of(&source)
            .iter()
            .any(|r| r.role == role && r.tag != tag);
        match pair {
            Some(group) if !declared && !theirs => {
                source = set_region(&source, tag, &role, "", &Anchor::Role)?;
                source = include_region(&source, tag, group)?;
            }
            _ => {
                source = shared_region(&source, tag, &role, |outside| {
                    if has_declaration(mask_c(outside).as_bytes(), kind, name) {
                        String::new()
                    } else {
                        format!("{kind} {name};")
                    }
                })?;
            }
        }
    }
    for (name, body) in &module.functions {
        match pair_of(name) {
            Some(coupled) => {
                let group = &coupled.functions[name];
                source = set_region(&source, tag, name, "", &Anchor::Role)?;
                source = set_region(&source, tag, &format!("{name}_PROTO"), "", &Anchor::Role)?;
                source = include_region(&source, tag, group)?;
                let before = coupled.before.get(name).map_or("", String::as_str);
                source = call_region(&source, tag, name, before)?;
                if !coupled.in_pair {
                    file_regions.push(FileRegion {
                        group: group.clone(),
                        function: name.clone(),
                        body: body.clone(),
                    });
                }
            }
            None => source = install_function(&source, tag, name, body)?,
        }
    }
    Ok(Outcome::Done((source, file_regions)))
}

/// Removes one device's regions by marker, whatever was edited inside them.
pub fn remove_device_regions(
    source: &str,
    tag: &str,
    others: Option<&[Other]>,
) -> Outcome<(String, RemoveReport)> {
    let mut report = RemoveReport {
        missing: docs_regions(source)
            .1
            .iter()
            .filter(|b| b.tag == tag)
            .map(|b| format!("{}: {}", b.role, b.reason))
            .collect(),
        ..RemoveReport::default()
    };
    let mut source = source.to_string();
    loop {
        let regions = regions_of(&source);
        let Some(r) = regions.iter().find(|r| r.tag == tag) else {
            break;
        };
        if PER_DEVICE_ROLES.contains(&r.role.as_str()) {
            source = remove_region_tidy(&source, r);
            report.removed += 1;
        } else {
            match release(&source, r, others) {
                (Released::NeedOthers, _) => return Outcome::NeedOthers,
                (Released::Source(next), retagged) => {
                    source = next;
                    if retagged {
                        report.retagged += 1;
                    } else {
                        report.removed += 1;
                    }
                }
            }
        }
    }
    Outcome::Done((source, report))
}

/// A register-level body for a function of a per-peripheral file (`gpio.c`, `i2c.c` …): one region at the end of
/// the function, owned by one device as in main.c. An empty body takes the device's region out.
pub fn set_file_function_region(
    source: &str,
    tag: &str,
    name: &str,
    body: &str,
) -> Result<String, String> {
    let per_device = PER_DEVICE_ROLES.contains(&name);
    if !per_device
        && regions_of(source)
            .iter()
            .any(|r| r.role == name && r.tag != tag)
    {
        return Ok(source.to_string());
    }
    let body = if name == "MX_GPIO_Init" {
        gpio_body(source, body)?
    } else {
        body.to_string()
    };
    set_region(source, tag, name, &body, &Anchor::FunctionEnd(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAIN: &str = "#include \"main.h\"\n\nstatic void MX_GPIO_Init(void);\n\nint main(void) {\n  HAL_Init();\n  SystemClock_Config();\n  MX_GPIO_Init();\n  /* USER CODE BEGIN 2 */\n  /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    /* USER CODE END 3 */\n  }\n}\n\nstatic void MX_GPIO_Init(void) {\n  GPIO_InitTypeDef GPIO_InitStruct = {0};\n  __HAL_RCC_GPIOA_CLK_ENABLE();\n}\n";
    const COUPLED_MAIN: &str = "#include \"main.h\"\n#include \"gpio.h\"\n\nint main(void) {\n  HAL_Init();\n  SystemClock_Config();\n  MX_GPIO_Init();\n  /* USER CODE BEGIN 2 */\n  /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    /* USER CODE END 3 */\n  }\n}\n";

    fn i2c_module(coupled: Option<Coupled>) -> Module {
        Module {
            declarations: "uint8_t value;".into(),
            init: "value = 1;".into(),
            step: "int local = value; HAL_Delay(local);".into(),
            gpio: "GPIO_InitTypeDef GPIO_InitStruct = {0};\nGPIO_InitStruct.Pin = GPIO_PIN_8;\nHAL_GPIO_Init(GPIOB, &GPIO_InitStruct);".into(),
            functions: vec![("MX_I2C1_Init".into(), "hi2c1.Instance = I2C1;\nHAL_I2C_Init(&hi2c1);".into())],
            handles: vec![("I2C_HandleTypeDef".into(), "hi2c1".into())],
            coupled,
        }
    }

    fn done(
        outcome: Result<Outcome<(String, Vec<FileRegion>)>, String>,
    ) -> (String, Vec<FileRegion>) {
        match outcome.unwrap() {
            Outcome::Done(x) => x,
            Outcome::NeedOthers => panic!("others needed"),
        }
    }

    #[test]
    fn markers_and_regions() {
        let text = format!(
            "a\n  {}\n  x();\n  {}\nb\n",
            docs_marker("lcd:u1", "INIT", true),
            docs_marker("lcd:u1", "INIT", false)
        );
        let (regions, broken) = docs_regions(&text);
        assert!(broken.is_empty());
        assert_eq!(regions.len(), 1);
        let r = &regions[0];
        assert_eq!((r.tag.as_str(), r.role.as_str()), ("lcd:u1", "INIT"));
        assert_eq!(&text[r.body_start..r.body_end], "  x();\n");
        assert_eq!(without_docs_regions(&text), "a\nb\n");
        let (_, broken) = docs_regions("/* STM-DOCS END lcd:u1 INIT */");
        assert_eq!(broken[0].reason, "BEGIN 표시를 찾을 수 없습니다");
    }

    #[test]
    fn one_file_main_gets_the_init_code_itself() {
        let (code, files) = done(install_device_regions(
            MAIN,
            "lcd:u1",
            &i2c_module(None),
            Some(&[]),
        ));
        assert!(files.is_empty());
        assert!(code.contains("static void MX_I2C1_Init(void) {"));
        assert!(code.contains("I2C_HandleTypeDef hi2c1;"));
        assert!(code.contains("/* STM-DOCS BEGIN lcd:u1 MX_GPIO_Init · Docs 예제 */\n  GPIO_InitStruct.Pin = GPIO_PIN_8;"));
        assert!(code.contains("  MX_GPIO_Init();\n  /* STM-DOCS BEGIN lcd:u1 MX_I2C1_Init_CALL · Docs 예제 */\n  MX_I2C1_Init();"));
        // A local declaration gets its own scope.
        assert!(code.contains("    {\n      int local = value; HAL_Delay(local);\n    }"));
        // Applying again changes nothing, and removing gives the file back.
        assert_eq!(
            done(install_device_regions(
                &code,
                "lcd:u1",
                &i2c_module(None),
                Some(&[])
            ))
            .0,
            code
        );
        match remove_device_regions(&code, "lcd:u1", Some(&[])) {
            Outcome::Done((back, report)) => {
                // The blank line in front of a definition added at the end of the file stays.
                assert_eq!(back, format!("{MAIN}\n"));
                assert!(report.missing.is_empty() && report.retagged == 0 && report.removed > 0);
            }
            Outcome::NeedOthers => panic!(),
        }
    }

    #[test]
    fn with_per_peripheral_files_main_includes_and_calls() {
        let coupled = Coupled {
            functions: HashMap::from([
                ("MX_GPIO_Init".to_string(), "gpio".to_string()),
                ("MX_I2C1_Init".to_string(), "i2c".to_string()),
            ]),
            handles: HashMap::from([("hi2c1".to_string(), "i2c".to_string())]),
            before: HashMap::new(),
            in_pair: true,
        };
        let module = i2c_module(Some(coupled));
        let (code, files) = done(install_device_regions(
            COUPLED_MAIN,
            "lcd:u1",
            &module,
            Some(&[]),
        ));
        assert!(files.is_empty());
        assert!(!code.contains("static void MX_"), "{code}");
        assert!(!code.contains("I2C_HandleTypeDef hi2c1;"));
        assert!(!code.contains("GPIO_InitStruct"));
        assert!(code.contains("#include \"main.h\"\n/* STM-DOCS BEGIN lcd:u1 INC_i2c · Docs 예제 */\n#include \"i2c.h\"\n"), "{code}");
        assert!(!code.contains("INC_gpio"), "gpio.h is already included");
        assert!(code.contains("  MX_GPIO_Init();\n  /* STM-DOCS BEGIN lcd:u1 MX_I2C1_Init_CALL · Docs 예제 */\n  MX_I2C1_Init();"));
        assert_eq!(
            done(install_device_regions(&code, "lcd:u1", &module, Some(&[]))).0,
            code
        );
        match remove_device_regions(&code, "lcd:u1", Some(&[])) {
            Outcome::Done((back, _)) => assert_eq!(back, COUPLED_MAIN),
            Outcome::NeedOthers => panic!(),
        }
        // A register-level example: the bodies go to the files.
        let mut bare = module.clone();
        bare.coupled.as_mut().unwrap().in_pair = false;
        let (_, files) = done(install_device_regions(
            COUPLED_MAIN,
            "lcd:u1",
            &bare,
            Some(&[]),
        ));
        assert_eq!(
            files
                .iter()
                .map(|f| (f.group.as_str(), f.function.as_str()))
                .collect::<Vec<_>>(),
            [("gpio", "MX_GPIO_Init"), ("i2c", "MX_I2C1_Init")]
        );
        let gpio_c = "#include \"gpio.h\"\n\nvoid MX_GPIO_Init(void) {\n  GPIO_InitTypeDef GPIO_InitStruct = {0};\n}\n";
        let file =
            set_file_function_region(gpio_c, "lcd:u1", "MX_GPIO_Init", &files[0].body).unwrap();
        assert!(file.contains("  /* STM-DOCS BEGIN lcd:u1 MX_GPIO_Init · Docs 예제 */\n  GPIO_InitStruct.Pin = GPIO_PIN_8;"));
        assert_eq!(
            set_file_function_region(&file, "lcd:u1", "MX_GPIO_Init", "").unwrap(),
            gpio_c
        );
    }

    #[test]
    fn a_shared_region_goes_to_the_device_that_still_needs_it() {
        let module = i2c_module(None);
        let (code, _) = done(install_device_regions(MAIN, "lcd:u1", &module, Some(&[])));
        assert!(matches!(
            remove_device_regions(&code, "lcd:u1", None),
            Outcome::NeedOthers
        ));
        let other = Other {
            tag: "rtc:u2".into(),
            needs: module_needs(&module),
        };
        match remove_device_regions(&code, "lcd:u1", Some(&[other])) {
            Outcome::Done((kept, report)) => {
                assert!(kept.contains("/* STM-DOCS BEGIN rtc:u2 MX_I2C1_Init · Docs 예제 */"));
                assert!(!kept.contains("lcd:u1"));
                assert!(report.retagged >= 3);
            }
            Outcome::NeedOthers => panic!(),
        }
    }

    #[test]
    fn declarations_and_statements() {
        assert_eq!(
            statements("a(); if (x) { b(); } else { c(); } d();"),
            ["a();", " if (x) { b(); } else { c(); }", " d();"]
        );
        for text in [
            "int x;",
            "unsigned x = 1;",
            "static const char *name = 0;",
            "uint8_t data[4];",
            "struct point p;",
        ] {
            assert!(is_declaration(text.as_bytes()), "{text}");
        }
        for text in [
            "return x;",
            "x = 1;",
            "f(a, b);",
            "goto done;",
            "HAL_Delay(1);",
        ] {
            assert!(!is_declaration(text.as_bytes()), "{text}");
        }
        assert_eq!(loose_find("a  =\n b ;", "a = b;", 0, 99), None);
        assert_eq!(loose_find("x a  =\n b; y", "a = b;", 0, 99), Some((2, 10)));
    }
}
