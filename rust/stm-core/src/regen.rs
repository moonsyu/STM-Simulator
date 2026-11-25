//! Regenerating a source the CubeMX way (ported from `src/c-source-edit.js`: keepUserCode, topLevelItems,
//! adoptOutsideCode, dropShadowedHandlers, regenerateMain).
//!
//! The text of every `/* USER CODE BEGIN x */ … /* USER CODE END x */` section of the previous source replaces that
//! section of the new one. Code the user wrote outside the sections is moved into a section first, so it is carried
//! over; what the generator itself writes (the same function name, the same declaration) is generated again.
//!
//! Feature 52: "what the generator writes" is asked of every text the generator makes — the new main.c, the main.c
//! the previous settings made, and `generator`, the other texts it makes (the per-peripheral files gpio.c, usart.c …
//! and the single-file main.c of the same settings). Before, only the first two were asked: after "주변장치별 .c/.h"
//! had been switched on and applied without generating, both were per-peripheral, MX_GPIO_Init and huart2 of the
//! old single-file main.c looked like the user's and were moved into USER CODE instead of leaving main.c.

use crate::csource::{
    c_functions, find, flat, is_space, is_word, is_word_start, mask_c, rfind, user_sections,
    Function,
};
use std::collections::{HashMap, HashSet};

fn trim_ascii(text: &str) -> &str {
    text.trim_matches(|c: char| c.is_ascii() && is_space(c as u8))
}

/// `keepUserCode`: the user sections of `previous` put into `generated`. A section equal to the one in
/// `previous_default` (what the previous settings generate) was never changed and takes the new generated text. A
/// changed section the new source no longer has is kept under `#if 0` at the end of section 4.
pub fn keep_user_code(previous: &str, generated: &str, previous_default: &str) -> String {
    let mut untouched: HashMap<String, String> = HashMap::new();
    for s in user_sections(previous_default) {
        untouched
            .entry(s.tag.clone())
            .or_insert_with(|| flat(&previous_default[s.body_start..s.body_end]));
    }
    // Insertion order matters for the orphans.
    let mut old: Vec<(String, &str)> = Vec::new();
    for s in user_sections(previous) {
        let body = &previous[s.body_start..s.body_end];
        if !old.iter().any(|(tag, _)| *tag == s.tag)
            && untouched.get(&s.tag).map(String::as_str) != Some(flat(body).as_str())
        {
            old.push((s.tag.clone(), body));
        }
    }
    let mut used: HashSet<&str> = HashSet::new();
    let mut out = String::with_capacity(generated.len() + previous.len() / 2);
    let mut at = 0;
    for s in user_sections(generated) {
        out.push_str(&generated[at..s.start]);
        match old.iter().find(|(tag, _)| *tag == s.tag) {
            Some((tag, body)) if !used.contains(tag.as_str()) => {
                used.insert(tag.as_str());
                out.push_str(&generated[s.start..s.body_start]);
                out.push_str(body);
                out.push_str(&generated[s.body_end..s.end]);
            }
            _ => out.push_str(&generated[s.start..s.end]),
        }
        at = s.end;
    }
    out.push_str(&generated[at..]);
    let orphans: Vec<&(String, &str)> = old
        .iter()
        .filter(|(tag, body)| !used.contains(tag.as_str()) && !trim_ascii(body).is_empty())
        .collect();
    if !orphans.is_empty() {
        let mut kept = String::new();
        for (tag, body) in orphans {
            kept.push_str(&format!(
                "/* USER CODE {tag}: 새 코드에 이 구간이 없어 보관합니다. */\n#if 0\n{}\n#endif\n",
                strip_first_blank_and_tail(body)
            ));
        }
        match rfind(out.as_bytes(), b"/* USER CODE END 4 */", out.len()) {
            Some(at) => out.insert_str(at, &kept),
            None => {
                out.push('\n');
                out.push_str(&kept);
            }
        }
    }
    out
}

/// `body.replace(/^\s*\n|\s+$/g, '')`: the leading white space up to its last newline, and the trailing white space.
fn strip_first_blank_and_tail(body: &str) -> &str {
    let bytes = body.as_bytes();
    let lead = bytes
        .iter()
        .position(|&b| !is_space(b))
        .unwrap_or(bytes.len());
    let start = bytes[..lead]
        .iter()
        .rposition(|&b| b == b'\n')
        .map_or(0, |n| n + 1);
    let rest = &body[start..];
    let end = rest
        .as_bytes()
        .iter()
        .rposition(|&b| !is_space(b))
        .map_or(0, |n| n + 1);
    // With only white space left the first alternative has taken everything up to the last newline already.
    &rest[..end.min(rest.len())]
}

fn names_of(text: &str) -> Vec<Function> {
    c_functions(text).unwrap_or_default()
}

/// `^\w+_(IRQ)?Handler$`
fn is_handler_name(name: &str) -> bool {
    ["_IRQHandler", "_Handler"]
        .iter()
        .any(|suffix| name.len() > suffix.len() && name.ends_with(suffix))
        && name.bytes().all(is_word)
}

/// `^HAL_\w+Callback$`
fn is_hal_callback(name: &str) -> bool {
    name.starts_with("HAL_")
        && name.ends_with("Callback")
        && name.len() > "HAL_Callback".len()
        && name.bytes().all(is_word)
}

/// Removes the functions at `spans` (sorted here from the end): `source.slice(0, start).replace(/\n\n$/, '\n') +
/// source.slice(end).replace(/^\n/, '')` for each.
fn remove_functions(source: &str, mut doomed: Vec<(usize, usize)>) -> String {
    doomed.sort_by_key(|span| std::cmp::Reverse(span.0));
    let mut out = source.to_string();
    for (start, end) in doomed {
        let mut head = out[..start].to_string();
        if head.ends_with("\n\n") {
            head.pop();
        }
        let tail = &out[end..];
        let tail = tail.strip_prefix('\n').unwrap_or(tail);
        out = head + tail;
    }
    out
}

/// `dropShadowedHandlers`: a handler the user wrote (in a user section, or in another source) replaces the generated
/// one, which would otherwise be defined twice.
pub fn drop_shadowed_handlers(source: &str, others: &[String]) -> String {
    let spans: Vec<(usize, usize)> = user_sections(source)
        .iter()
        .map(|s| (s.start, s.end))
        .collect();
    let in_user = |at: usize| spans.iter().any(|&(a, b)| at >= a && at < b);
    let handlers: Vec<Function> = names_of(source)
        .into_iter()
        .filter(|f| is_handler_name(&f.name))
        .collect();
    let elsewhere: HashSet<String> = others
        .iter()
        .flat_map(|t| names_of(t))
        .map(|f| f.name)
        .collect();
    let user: HashSet<&str> = handlers
        .iter()
        .filter(|f| in_user(f.start))
        .map(|f| f.name.as_str())
        .collect();
    let doomed = handlers
        .iter()
        .filter(|f| {
            !in_user(f.start) && (user.contains(f.name.as_str()) || elsewhere.contains(&f.name))
        })
        .map(|f| (f.start, f.end))
        .collect();
    remove_functions(source, doomed)
}

/// A callback or stdio hook the user defines in a user section replaces the generated one of the same name.
fn drop_shadowed_callbacks(source: &str) -> String {
    let Ok(fns) = c_functions(source) else {
        return source.to_string();
    };
    let spans: Vec<(usize, usize)> = user_sections(source)
        .iter()
        .map(|s| (s.start, s.end))
        .collect();
    let in_user = |at: usize| spans.iter().any(|&(a, b)| at >= a && at < b);
    let user: HashSet<&str> = fns
        .iter()
        .filter(|f| in_user(f.start))
        .map(|f| f.name.as_str())
        .collect();
    let hook = |name: &str| {
        is_hal_callback(name) || ["__io_putchar", "__io_getchar", "_write", "_read"].contains(&name)
    };
    let doomed = fns
        .iter()
        .filter(|f| !in_user(f.start) && user.contains(f.name.as_str()) && hook(&f.name))
        .map(|f| (f.start, f.end))
        .collect();
    remove_functions(source, doomed)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Function,
    Declaration,
    Directive,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Function => "function",
            Kind::Declaration => "declaration",
            Kind::Directive => "directive",
        }
    }
}

/// A top-level item of a source outside the user sections.
#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub kind: Kind,
    pub name: String,
    /// Where it starts, the comment block directly above included (as the JavaScript computes it: the item's own
    /// start minus the length of that block).
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub comment: String,
}

/// `([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*$`: the identifier a text ends with, array brackets after it allowed.
fn last_name(text: &str) -> Option<&str> {
    let b = text.as_bytes();
    let mut end = b.len();
    loop {
        while end > 0 && is_space(b[end - 1]) {
            end -= 1;
        }
        if end > 0 && b[end - 1] == b']' {
            // `\[[^\]]*\]`: the nearest `[` before, with no `]` between.
            let open = b[..end - 1].iter().rposition(|&c| c == b'[' || c == b']')?;
            if b[open] != b'[' {
                return None;
            }
            end = open;
        } else {
            break;
        }
    }
    let mut start = end;
    while start > 0 && is_word(b[start - 1]) {
        start -= 1;
    }
    // The leftmost place the pattern can start: the first letter or underscore of the run.
    let first = (start..end).find(|&i| is_word_start(b[i]))?;
    Some(&text[first..end])
}

/// `([A-Za-z_]\w*)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$`: the name before the parameter list a head ends with (one
/// level of nested parentheses in it).
fn fn_name(head: &str) -> Option<&str> {
    let b = head.as_bytes();
    let mut end = b.len();
    while end > 0 && is_space(b[end - 1]) {
        end -= 1;
    }
    if end == 0 || b[end - 1] != b')' {
        return None;
    }
    let mut depth = 0usize;
    let mut open = None;
    for i in (0..end).rev() {
        match b[i] {
            b')' => {
                depth += 1;
                if depth > 2 {
                    return None;
                }
            }
            b'(' => {
                depth -= 1;
                if depth == 0 {
                    open = Some(i);
                    break;
                }
            }
            _ => {}
        }
    }
    let mut at = open?;
    while at > 0 && is_space(b[at - 1]) {
        at -= 1;
    }
    let name_end = at;
    while at > 0 && is_word(b[at - 1]) {
        at -= 1;
    }
    let first = (at..name_end).find(|&i| is_word_start(b[i]))?;
    Some(&head[first..name_end])
}

/// `\(\s*\*\s*(?:(?:const|volatile)\s+)*([A-Za-z_]\w*)`: the name of a pointer declarator such as `(*handler[2])`.
fn pointer_name(head: &str) -> Option<&str> {
    let b = head.as_bytes();
    let skip_space = |mut i: usize| {
        while i < b.len() && is_space(b[i]) {
            i += 1;
        }
        i
    };
    for open in (0..b.len()).filter(|&i| b[i] == b'(') {
        let mut i = skip_space(open + 1);
        if i >= b.len() || b[i] != b'*' {
            continue;
        }
        i = skip_space(i + 1);
        loop {
            let qualifier = ["const", "volatile"]
                .iter()
                .find(|q| head[i..].starts_with(*q))
                .map(|q| i + q.len());
            match qualifier {
                Some(after) if after < b.len() && is_space(b[after]) => i = skip_space(after),
                _ => break,
            }
        }
        if i < b.len() && is_word_start(b[i]) {
            let mut end = i + 1;
            while end < b.len() && is_word(b[end]) {
                end += 1;
            }
            return Some(&head[i..end]);
        }
    }
    None
}

/// The name a top-level declaration (comments and strings masked) introduces: `x` of `int x[2] = …`, `t` of
/// `int (*t[2])(void)`, `Reading` of `typedef struct { … } Reading`, `P` of `struct P { … }`.
fn declared_name(text: &str) -> String {
    // text.replace(/;\s*$/, '')
    let trimmed = text.trim_end_matches(|c: char| c.is_ascii() && is_space(c as u8));
    let body = trimmed.strip_suffix(';').unwrap_or(text);
    let open = body.find('{');
    let eq = body.find('=');
    if let Some(open) = open {
        if eq.is_none_or(|eq| open < eq) {
            let after = &body[body.rfind('}').map_or(0, |n| n + 1)..];
            let after = after.split('=').next().unwrap_or("");
            return last_name(after)
                .or_else(|| last_name(&body[..open]))
                .unwrap_or("")
                .to_string();
        }
    }
    let head = eq.map_or(body, |eq| &body[..eq]);
    pointer_name(head)
        .or_else(|| last_name(head.split('(').next().unwrap_or("")))
        .unwrap_or("")
        .to_string()
}

/// The comment lines right above an item: `((?:[ \t]*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)[ \t]*\n)+)[ \t]*$` on the gap
/// between the previous item and this one. Returns the matched block (the leftmost start that reaches the end).
fn comment_above(gap: &str) -> &str {
    let b = gap.as_bytes();
    let blank = |mut i: usize| {
        while i < b.len() && (b[i] == b' ' || b[i] == b'\t') {
            i += 1;
        }
        i
    };
    // One `[ \t]*(?:// … | /* … */)[ \t]*\n` from `from`: its end, or None.
    let unit = |from: usize| -> Option<usize> {
        let i = blank(from);
        if b.get(i) != Some(&b'/') {
            return None;
        }
        let after = match b.get(i + 1) {
            Some(b'/') => b[i..].iter().position(|&c| c == b'\n').map(|n| i + n)?,
            Some(b'*') => {
                // The lazy `[\s\S]*?\*/` may pass a `*/` that is not followed by `[ \t]*\n`.
                let mut close = find(b, b"*/", i + 2)?;
                loop {
                    let k = blank(close + 2);
                    if b.get(k) == Some(&b'\n') {
                        return Some(k + 1);
                    }
                    close = find(b, b"*/", close + 1)?;
                }
            }
            _ => return None,
        };
        // A line comment takes the rest of its line; the `[ \t]*` after it is empty.
        Some(after + 1)
    };
    for start in 0..b.len() {
        if !gap.is_char_boundary(start) {
            continue;
        }
        let mut at = start;
        let mut units = 0;
        while let Some(next) = unit(at) {
            at = next;
            units += 1;
        }
        if units > 0 && blank(at) == b.len() {
            return &gap[start..at];
        }
    }
    ""
}

/// `topLevelItems`: the functions, declarations and preprocessor directives of a source outside the user sections.
/// `None` when the source cannot be read this way (unbalanced braces, an item running into a user section).
pub fn top_level_items(source: &str) -> Option<Vec<Item>> {
    let masked = mask_c(source);
    let m = masked.as_bytes();
    let src = source.as_bytes();
    let sections: Vec<(usize, usize)> = user_sections(source)
        .iter()
        .map(|s| (s.start, s.end))
        .collect();
    let section = |at: usize| sections.iter().copied().find(|&(a, b)| at >= a && at < b);
    let mut items = Vec::new();
    let (mut i, mut gap_start) = (0usize, 0usize);
    while i < m.len() {
        if let Some((_, end)) = section(i) {
            i = end;
            gap_start = i;
            continue;
        }
        if is_space(m[i]) {
            i += 1;
            continue;
        }
        let start = i;
        let (mut end, kind, name);
        let line_start = rfind(m, b"\n", i).map_or(0, |n| n + 1);
        if m[i] == b'#' && m[line_start..i].iter().all(|&c| c == b' ' || c == b'\t') {
            // To the end of the line, a line ending in a backslash continuing on the next.
            end = i;
            loop {
                end = find(m, b"\n", end).unwrap_or(m.len());
                if end > 0 && src[end - 1] == b'\\' && end < m.len() {
                    end += 1;
                } else {
                    break;
                }
            }
            kind = Kind::Directive;
            name = flat(&source[start..end]);
        } else {
            // Up to the first `;` or `{` at parenthesis depth 0: a `{` after `)` without `=` opens a function body.
            let mut j = i;
            let mut paren = 0i64;
            while j < m.len() && !(paren == 0 && (m[j] == b';' || m[j] == b'{')) {
                match m[j] {
                    b'(' => paren += 1,
                    b')' => paren -= 1,
                    _ => {}
                }
                j += 1;
            }
            let head = &masked[i..j];
            let ends_with_paren = head
                .trim_end_matches(|c: char| c.is_ascii() && is_space(c as u8))
                .ends_with(')');
            let is_fn = j < m.len() && m[j] == b'{' && ends_with_paren && !head.contains('=');
            if j < m.len() && m[j] == b'{' {
                let mut depth = 1;
                j += 1;
                while j < m.len() && depth > 0 {
                    match m[j] {
                        b'{' => depth += 1,
                        b'}' => depth -= 1,
                        _ => {}
                    }
                    j += 1;
                }
                if depth > 0 {
                    return None;
                }
                if !is_fn {
                    while j < m.len() && m[j] != b';' {
                        if m[j] == b'{' {
                            return None;
                        }
                        j += 1;
                    }
                    j += 1;
                }
            } else {
                j += 1;
            }
            end = j.min(m.len());
            kind = if is_fn {
                Kind::Function
            } else {
                Kind::Declaration
            };
            name = if is_fn {
                fn_name(head).unwrap_or("").to_string()
            } else {
                declared_name(&masked[i..end])
            };
        }
        if end > 0 && section(end - 1).is_some() {
            return None;
        }
        // A comment after the item on its last line (`int n; /* count */`) is part of it.
        {
            let eol = find(src, b"\n", end).unwrap_or(src.len());
            let rest = &source[end..eol];
            if trailing_comment(rest) {
                end += rest.len();
            }
        }
        let comment = comment_above(&source[gap_start..start]);
        items.push(Item {
            kind,
            name,
            start: start.saturating_sub(comment.len()),
            end,
            text: source[start..end].to_string(),
            comment: comment.to_string(),
        });
        i = end;
        gap_start = end;
    }
    Some(items)
}

/// `^[ \t]*(\/\/.*|\/\*.*\*\/)[ \t]*$` on the rest of a line.
fn trailing_comment(rest: &str) -> bool {
    if rest.contains('\r') {
        return false;
    }
    let text = rest.trim_start_matches([' ', '\t']);
    if text.starts_with("//") {
        return true;
    }
    let tail = text.trim_end_matches([' ', '\t']);
    tail.starts_with("/*") && tail.len() >= 4 && tail.ends_with("*/")
}

/// `adoptOutsideCode`: user code outside the user sections of `previous` moved into its sections. Returns the source
/// and the names of what moved. `known` are the texts the generator writes (the new main.c, the one the previous
/// settings made, and its other files): an item with the same text, or a function or declaration of the same name,
/// is the generator's and is not moved.
pub fn adopt_outside_code(previous: &str, known: &[&str]) -> (String, Vec<String>) {
    let unchanged = || (previous.to_string(), Vec::new());
    if !previous.contains("/* USER CODE BEGIN PV */")
        || !previous.contains("/* USER CODE BEGIN 4 */")
    {
        return unchanged();
    }
    let Some(items) = top_level_items(previous) else {
        return unchanged();
    };
    let known: Vec<Item> = known
        .iter()
        .filter(|t| !t.is_empty())
        .flat_map(|t| top_level_items(t).unwrap_or_default())
        .collect();
    if known.is_empty() {
        return unchanged();
    }
    let texts: HashSet<String> = known.iter().map(|k| flat(&k.text)).collect();
    let names: HashSet<&str> = known
        .iter()
        .filter(|k| k.kind != Kind::Directive && !k.name.is_empty())
        .map(|k| k.name.as_str())
        .collect();
    let Some(main) = items
        .iter()
        .position(|k| k.kind == Kind::Function && k.name == "main")
    else {
        return unchanged();
    };
    let has = |tag: &str| previous.contains(&format!("/* USER CODE END {tag} */"));
    // A callback or handler written without the generator's user section, under a name the generator also writes, is
    // the user's own version: it is kept and the generated one is dropped (drop_shadowed_callbacks).
    let own = |k: &Item| {
        k.kind == Kind::Function
            && (is_hal_callback(&k.name) || k.name.ends_with("_Handler"))
            && !k.text.contains("/* USER CODE BEGIN ")
    };
    let user: Vec<&Item> = items
        .iter()
        .enumerate()
        .filter(|(index, k)| {
            !(texts.contains(&flat(&k.text))
                || (k.kind != Kind::Directive && names.contains(k.name.as_str()) && !own(k))
                || *index == main
                || (k.kind == Kind::Declaration && k.name.is_empty()))
        })
        .map(|(_, k)| k)
        .collect();
    if user.is_empty() {
        return unchanged();
    }
    let main_start = items[main].start;
    // The sections in the order a JavaScript object lists its keys: "0" and "4" first, then by first use.
    let mut groups: Vec<(&str, Vec<&Item>)> = Vec::new();
    for k in &user {
        let tag = if k.start >= main_start {
            "4"
        } else if k.kind == Kind::Directive && is_include(&k.text) && has("Includes") {
            "Includes"
        } else if k.kind == Kind::Function {
            if has("0") {
                "0"
            } else {
                "4"
            }
        } else {
            "PV"
        };
        match groups.iter_mut().find(|(t, _)| *t == tag) {
            Some((_, list)) => list.push(k),
            None => groups.push((tag, vec![k])),
        }
    }
    groups.sort_by_key(|(tag, _)| match *tag {
        "0" => 0,
        "4" => 1,
        _ => 2,
    });
    let mut source = previous.to_string();
    // Remove from the end so offsets stay valid, then append each group to its section in source order.
    let mut by_start: Vec<&Item> = user.clone();
    by_start.sort_by_key(|k| std::cmp::Reverse(k.start));
    for k in by_start {
        let tail = &source[k.end..];
        // .replace(/^[ \t]*\n/, '')
        let blank = tail
            .as_bytes()
            .iter()
            .position(|&c| c != b' ' && c != b'\t')
            .unwrap_or(tail.len());
        let tail = if tail.as_bytes().get(blank) == Some(&b'\n') {
            &tail[blank + 1..]
        } else {
            tail
        };
        source = source[..k.start].to_string() + tail;
    }
    for (tag, list) in &groups {
        let marker = format!("/* USER CODE END {tag} */");
        let at = find(source.as_bytes(), marker.as_bytes(), 0);
        let line_start = match at {
            Some(at) if at > 0 => rfind(source.as_bytes(), b"\n", at).map_or(0, |n| n + 1),
            // String.lastIndexOf with a position at or before 0 looks at index 0 only.
            _ => usize::from(source.starts_with('\n')),
        };
        let text = list
            .iter()
            .map(|k| format!("{}{}", k.comment, k.text))
            .collect::<Vec<_>>()
            .join("\n")
            + "\n";
        source.insert_str(line_start, &text);
    }
    let moved = user
        .iter()
        .map(|k| {
            if k.name.is_empty() {
                flat(&k.text).chars().take(40).collect()
            } else {
                k.name.clone()
            }
        })
        .collect();
    (source, moved)
}

/// `^#\s*include\b`
fn is_include(text: &str) -> bool {
    let Some(rest) = text.strip_prefix('#') else {
        return false;
    };
    let rest = rest.trim_start_matches(|c: char| c.is_ascii() && is_space(c as u8));
    rest.strip_prefix("include")
        .is_some_and(|after| after.as_bytes().first().is_none_or(|&b| !is_word(b)))
}

/// `regenerateMain`: user sections kept, user code outside them moved into sections, shadowed handlers dropped.
/// `generator`: the other texts the generator makes (feature 52), asked together with `generated` and
/// `previous_default` what is the generator's.
pub fn regenerate_main(
    previous: &str,
    generated: &str,
    previous_default: &str,
    others: &[String],
    generator: &[String],
) -> (String, Vec<String>) {
    let mut known: Vec<&str> = vec![generated, previous_default];
    known.extend(generator.iter().map(String::as_str));
    let (adopted, moved) = adopt_outside_code(previous, &known);
    let code = drop_shadowed_callbacks(&drop_shadowed_handlers(
        &keep_user_code(&adopted, generated, previous_default),
        others,
    ));
    (code, moved)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GENERATED: &str = "#include \"main.h\"\n/* USER CODE BEGIN Includes */\n/* USER CODE END Includes */\n\nUART_HandleTypeDef huart2;\n/* USER CODE BEGIN PV */\n/* USER CODE END PV */\n\nstatic void MX_GPIO_Init(void);\n\n/* USER CODE BEGIN 0 */\n/* USER CODE END 0 */\n\nint main(void) {\n  MX_GPIO_Init();\n  /* USER CODE BEGIN 2 */\n  /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    HAL_Delay(500);\n    /* USER CODE END 3 */\n  }\n}\n\nstatic void MX_GPIO_Init(void) {\n  __HAL_RCC_GPIOA_CLK_ENABLE();\n}\n\n/* USER CODE BEGIN 4 */\n/* USER CODE END 4 */\n";

    #[test]
    fn user_sections_are_kept_and_untouched_ones_take_the_new_text() {
        let previous = GENERATED.replace(
            "/* USER CODE BEGIN 2 */\n",
            "/* USER CODE BEGIN 2 */\n  mine();\n",
        );
        let generated = GENERATED.replace("HAL_Delay(500);", "HAL_Delay(100);");
        let out = keep_user_code(&previous, &generated, GENERATED);
        assert!(out.contains("/* USER CODE BEGIN 2 */\n  mine();\n  /* USER CODE END 2 */"));
        assert!(
            out.contains("HAL_Delay(100);"),
            "section 3 was never changed: the new text"
        );
        // Without the previous default every section counts as the user's.
        assert!(keep_user_code(&previous, &generated, "").contains("HAL_Delay(500);"));
    }

    #[test]
    fn a_section_the_new_source_lacks_is_kept_under_if_0() {
        let previous = GENERATED.replace("/* USER CODE BEGIN 4 */\n", "/* USER CODE BEGIN 4 */\n/* USER CODE BEGIN TIM2 */\n  tick++;\n/* USER CODE END TIM2 */\n");
        let out = keep_user_code(&previous, GENERATED, GENERATED);
        // The nested section is part of section 4's text, which carries over as it is.
        assert!(out.contains("tick++;"));
        let orphan = "/* USER CODE BEGIN X */\n  keep_me();\n/* USER CODE END X */\n".to_string()
            + GENERATED;
        let out = keep_user_code(&orphan, GENERATED, GENERATED);
        assert!(out.contains("/* USER CODE X: 새 코드에 이 구간이 없어 보관합니다. */\n#if 0\n  keep_me();\n#endif\n/* USER CODE END 4 */"), "{out}");
    }

    #[test]
    fn items_of_a_source() {
        let source = "#include \"a.h\"\n#define M(x) \\\n  (x)\n// note\nint count[2] = {1, 2}; /* n */\ntypedef struct { int a; } Reading;\nstatic int (*table[2])(void);\nvoid helper(int a)\n{\n  if (a) { }\n}\n";
        let items = top_level_items(source).unwrap();
        let brief: Vec<(&str, &str)> = items
            .iter()
            .map(|k| (k.kind.as_str(), k.name.as_str()))
            .collect();
        assert_eq!(
            brief,
            [
                ("directive", "#include \"a.h\""),
                ("directive", "#define M(x) \\ (x)"),
                ("declaration", "count"),
                ("declaration", "Reading"),
                ("declaration", "table"),
                ("function", "helper")
            ]
        );
        assert_eq!(items[2].comment, "// note\n");
        assert_eq!(items[2].text, "int count[2] = {1, 2}; /* n */");
        assert!(top_level_items("void f(void) {").is_none());
    }

    #[test]
    fn user_code_outside_the_sections_moves_into_them() {
        let previous = GENERATED
            .replace(
                "UART_HandleTypeDef huart2;\n",
                "UART_HandleTypeDef huart2;\nint counter;\n",
            )
            .replace(
                "int main(void) {",
                "static void blink(void) { counter++; }\n\nint main(void) {",
            )
            + "void after(void) { }\n";
        let (source, moved) = adopt_outside_code(&previous, &[GENERATED, GENERATED]);
        assert_eq!(moved, ["counter", "blink", "after"]);
        assert!(source.contains("/* USER CODE BEGIN PV */\nint counter;\n/* USER CODE END PV */"));
        assert!(source.contains("/* USER CODE BEGIN 0 */\nstatic void blink(void) { counter++; }\n/* USER CODE END 0 */"));
        assert!(
            source.contains("/* USER CODE BEGIN 4 */\nvoid after(void) { }\n/* USER CODE END 4 */")
        );
        // The generator's own items stay where they are.
        assert!(source.contains("\nUART_HandleTypeDef huart2;\n/* USER CODE BEGIN PV */"));
    }

    #[test]
    fn feature_52_what_the_generator_wrote_in_one_file_is_not_user_code_when_it_moves_to_other_files(
    ) {
        // The project's main.c was generated as one file. The settings now make per-peripheral files, and both the
        // new main.c and the "previous default" are already in that form.
        let coupled = GENERATED
            .replace("UART_HandleTypeDef huart2;\n", "")
            .replace("static void MX_GPIO_Init(void);\n\n", "")
            .replace(
                "static void MX_GPIO_Init(void) {\n  __HAL_RCC_GPIOA_CLK_ENABLE();\n}\n\n",
                "",
            )
            .replace(
                "#include \"main.h\"\n",
                "#include \"main.h\"\n#include \"gpio.h\"\n",
            );
        let previous = GENERATED.replace(
            "/* USER CODE BEGIN 2 */\n",
            "/* USER CODE BEGIN 2 */\n  mine();\n",
        );
        // Before: MX_GPIO_Init and huart2 were taken for the user's and moved into USER CODE.
        let (code, moved) = regenerate_main(&previous, &coupled, &coupled, &[], &[]);
        assert!(!moved.is_empty() && code.contains("MX_GPIO_Init(void) {"));
        // With the generator's other texts (gpio.c, usart.c and the single-file main.c of the settings) they go.
        let gpio_c =
            "#include \"gpio.h\"\nvoid MX_GPIO_Init(void) {\n  __HAL_RCC_GPIOA_CLK_ENABLE();\n}\n"
                .to_string();
        let (code, moved) = regenerate_main(
            &previous,
            &coupled,
            &coupled,
            &[],
            &[gpio_c, GENERATED.to_string()],
        );
        assert_eq!(moved, Vec::<String>::new());
        assert!(
            !code.contains("MX_GPIO_Init(void) {") && !code.contains("UART_HandleTypeDef huart2;"),
            "{code}"
        );
        assert!(code.contains("#include \"gpio.h\"") && code.contains("  mine();\n"));
    }

    #[test]
    fn a_handler_of_the_user_replaces_the_generated_one() {
        let source = "void SysTick_Handler(void) {\n  HAL_IncTick();\n}\n\n/* USER CODE BEGIN 4 */\nvoid SysTick_Handler(void) { mine(); }\n/* USER CODE END 4 */\n";
        let out = drop_shadowed_handlers(source, &[]);
        assert_eq!(out.matches("SysTick_Handler").count(), 1);
        assert!(out.contains("mine();"));
        let generated = "void USART2_IRQHandler(void) {\n}\nint main(void) {\n}\n";
        assert!(!drop_shadowed_handlers(
            generated,
            &["void USART2_IRQHandler(void) { own(); }".to_string()]
        )
        .contains("USART2_IRQHandler"));
        assert!(
            is_handler_name("USART2_IRQHandler")
                && is_handler_name("SysTick_Handler")
                && !is_handler_name("Handler")
                && !is_handler_name("Error_Handle")
        );
        assert!(is_hal_callback("HAL_UART_RxCpltCallback") && !is_hal_callback("HAL_Callback"));
    }
}
