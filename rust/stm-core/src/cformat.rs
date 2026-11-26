//! Built-in C/C++ code formatter used when clangd is unavailable (circuit simulator, emulator, no tools).
//! `format_c` rewrites leading indentation plus a few unambiguous spacing rules (keyword parentheses, braces, commas)
//! and never changes the number of lines. `format_code` also puts each statement on its own line. Neither touches
//! string/char literals, comments, preprocessor lines or operator spacing.
//!
//! Moved here from `src/c-format.js` (feature 62); that file now only calls these functions.

use crate::js_re;
use crate::jsre::{eol, is_space, is_word, lines, trim, trim_end, trim_start, utf16_prefix};
use regex_lite::Captures;

js_re!(CONTROL, r"^(if|for|while|switch|else\s+if)\b");
js_re!(KEYWORD_PAREN, r"\b(if|for|while|switch|return|sizeof)\s*\(");
js_re!(PAREN_BRACE, r"\)\s*\{");
js_re!(ELSE_BRACE, r"\belse\s*\{");
js_re!(BRACE_ELSE, r"\}\s*else\b");
js_re!(DO_BRACE, r"\bdo\s*\{");
js_re!(BRACE_WHILE, r"\}\s*while\b");
js_re!(SPACE_COMMA, r"\s+,");
js_re!(SPACE_SEMI, r"\s+;");
js_re!(CONTINUED, r"\\\s*$");
js_re!(LABEL, r"^(case\b[^:]*|default)\s*:");
js_re!(SWITCH, r"\bswitch\b");
js_re!(FLAT, r"\b(extern|namespace)\b");
js_re!(LEADING_CLOSE, r"^\}\s*");
js_re!(ENDS_PAREN, r"\)\s*$");
js_re!(
    BRANCH_KEYWORD,
    r"^\s*(?:if|for|while|switch|do|else|case|default)\b"
);
js_re!(STARTS_BRACE_OR_SEMI, r"^\s*[{;]");
js_re!(INIT_BEFORE, r"(?:[=,(\[]|\breturn)\s*$");
js_re!(THEN_ELSE, r"^\s*else\b");
js_re!(
    KEEPS_NAME,
    r"^\s*(?:while\b|[;,)]|[A-Za-z_]\w*\s*(?:[;,]|$))"
);
js_re!(ENDS_ELSE, r"\belse$");
js_re!(THEN_IF, r"^\s*if\b");
js_re!(CASE_LABEL, r"^\s*(?:case\b|default\b)");
js_re!(THEN_BRACE, r"^\s*\{");

/// One segment of a line: code, or a comment / literal that is left as written.
#[derive(Debug, Clone, PartialEq)]
pub struct Part {
    pub code: bool,
    pub text: String,
}

/// Splits one line into code and non-code segments, carrying block-comment state across lines.
pub fn scan(line: &str, in_comment: &mut bool) -> Vec<Part> {
    let chars: Vec<char> = line.chars().collect();
    let mut parts: Vec<Part> = Vec::new();
    let mut code = String::new();
    let text = |from: usize, to: usize| chars[from..to.min(chars.len())].iter().collect::<String>();
    // The index of `*/` at or after `from`.
    let close = |from: usize| {
        (from..chars.len().saturating_sub(1)).find(|&k| chars[k] == '*' && chars[k + 1] == '/')
    };
    macro_rules! flush {
        () => {
            if !code.is_empty() {
                parts.push(Part {
                    code: true,
                    text: std::mem::take(&mut code),
                });
            }
        };
    }
    let mut i = 0;
    while i < chars.len() {
        if *in_comment {
            let end = close(i);
            let stop = end.map_or(chars.len(), |e| e + 2);
            flush!();
            parts.push(Part {
                code: false,
                text: text(i, stop),
            });
            i = stop;
            if end.is_some() {
                *in_comment = false;
            }
            continue;
        }
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '/' && next == Some('/') {
            flush!();
            parts.push(Part {
                code: false,
                text: text(i, chars.len()),
            });
            break;
        }
        if c == '/' && next == Some('*') {
            *in_comment = true;
            flush!();
            let end = close(i + 2);
            let stop = end.map_or(chars.len(), |e| e + 2);
            parts.push(Part {
                code: false,
                text: text(i, stop),
            });
            i = stop;
            if end.is_some() {
                *in_comment = false;
            }
            continue;
        }
        if c == '"' || c == '\'' {
            let mut j = i + 1;
            while j < chars.len() && chars[j] != c {
                if chars[j] == '\\' {
                    j += 1;
                }
                j += 1;
            }
            flush!();
            parts.push(Part {
                code: false,
                text: text(i, j + 1),
            });
            i = j + 1;
            continue;
        }
        code.push(c);
        i += 1;
    }
    flush!();
    parts
}

/// Normalizes spacing inside a code-only segment.
fn space(text: &str) -> String {
    let text = KEYWORD_PAREN.replace_all(text, |caps: &Captures| {
        if &caps[1] == "sizeof" {
            "sizeof(".to_string()
        } else {
            format!("{} (", &caps[1])
        }
    });
    let text = PAREN_BRACE.replace_all(&text, ") {");
    let text = ELSE_BRACE.replace_all(&text, "else {");
    let text = BRACE_ELSE.replace_all(&text, "} else");
    let text = DO_BRACE.replace_all(&text, "do {");
    let text = BRACE_WHILE.replace_all(&text, "} while");
    // A comma followed by something that is not a space gets one.
    let mut spaced = String::with_capacity(text.len() + 8);
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        spaced.push(c);
        if c == ',' && chars.peek().is_some_and(|next| !is_space(*next)) {
            spaced.push(' ');
        }
    }
    let text = SPACE_COMMA.replace_all(&spaced, ",");
    SPACE_SEMI.replace_all(&text, ";").into_owned()
}

/// A range of source lines, 1-based and inclusive.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Range {
    pub start: f64,
    pub end: f64,
}
impl Range {
    fn has(self, line: usize) -> bool {
        let line = line as f64;
        line >= self.start && line <= self.end
    }
}
/// Spaces per level: 1 to 8, 4 when the setting is not a number.
fn unit(tab_size: f64) -> String {
    // JavaScript's `tabSize|0||4`.
    let whole = if tab_size.is_finite() {
        tab_size.trunc() as i64 as i32
    } else {
        0
    };
    let whole = if whole == 0 { 4 } else { whole };
    " ".repeat(whole.clamp(1, 8) as usize)
}

struct Brace {
    switch: bool,
    flat: bool,
}

/// Formats C source. `tab_size` spaces per level. With `range`, only those lines are rewritten (indentation is still
/// computed from the whole file). The line count never changes.
pub fn format_c(source: &str, tab_size: f64, range: Option<Range>) -> String {
    let unit = unit(tab_size);
    let mut out: Vec<String> = Vec::new();
    let mut in_comment = false;
    // One entry per open brace.
    let mut stack: Vec<Brace> = Vec::new();
    let (mut paren, mut hanging, mut continued) = (0i64, 0i64, false);
    let mut header = String::new();
    for (index, raw) in lines(source).into_iter().enumerate() {
        let was_comment = in_comment;
        let in_range = range.is_none_or(|r| r.has(index + 1));
        let trimmed = trim(raw);
        // Preprocessor lines (and their backslash continuations) are kept verbatim.
        if !was_comment && (continued || trimmed.starts_with('#')) {
            continued = CONTINUED.is_match(raw);
            out.push(if in_range {
                trim_end(raw).to_string()
            } else {
                raw.to_string()
            });
            continue;
        }
        if trimmed.is_empty() {
            out.push(if in_range {
                String::new()
            } else {
                raw.to_string()
            });
            continue;
        }
        let parts = scan(trimmed, &mut in_comment);
        let code_text = parts
            .iter()
            .filter(|p| p.code)
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let depth = stack.iter().filter(|b| !b.flat).count() as i64;
        let top = stack.last();
        let top_switch = top.is_some_and(|b| b.switch);
        let mut level = depth + i64::from(top_switch);
        if !was_comment && trimmed.starts_with('}') {
            level = depth - i64::from(top.is_some_and(|b| !b.flat));
        }
        if !was_comment && LABEL.is_match(trimmed) && top_switch {
            level = depth;
        }
        let mut kind = "";
        if was_comment {
            kind = if trimmed.starts_with('*') {
                "star"
            } else {
                "keep"
            };
        } else if paren > 0 {
            // Continuation of an open call or condition.
            level += 2;
        } else if hanging != 0 && !trimmed.starts_with('{') {
            level += hanging;
        }
        let indent = unit.repeat(level.max(0) as usize);
        let text = match kind {
            "star" => format!("{indent} {trimmed}"),
            "keep" => trim_end(raw).to_string(),
            _ => {
                let joined: String = parts
                    .iter()
                    .map(|p| {
                        if p.code {
                            space(&p.text)
                        } else {
                            p.text.clone()
                        }
                    })
                    .collect();
                format!("{indent}{}", trim_end(&joined))
            }
        };
        out.push(if in_range { text } else { raw.to_string() });
        // Update nesting from code characters only.
        for ch in code_text.chars() {
            if ch == '(' || ch == '[' {
                paren += 1;
            } else if ch == ')' || ch == ']' {
                paren = (paren - 1).max(0);
            }
            match ch {
                '{' => {
                    stack.push(Brace {
                        switch: SWITCH.is_match(&header),
                        flat: FLAT.is_match(&header) && !header.contains(['(', ')', '=']),
                    });
                    header.clear();
                }
                '}' => {
                    stack.pop();
                    header.clear();
                }
                ';' => header.clear(),
                other => header.push(other),
            }
        }
        // Brace-less control statements indent exactly the next statement.
        let body = trim(&code_text);
        if !was_comment && !body.is_empty() && paren == 0 {
            let head = LEADING_CLOSE.replace(body, "");
            let control = (CONTROL.is_match(&head) && ENDS_PAREN.is_match(&head))
                || head == "else"
                || head == "do";
            hanging = if control { (hanging + 1).min(4) } else { 0 };
        }
    }
    out.join(eol(source))
}

/// True when `text` (the rest of a line) is one simple statement that ends with `;` before any brace or comment.
fn single_statement(text: &str) -> bool {
    if trim(text).is_empty() || BRANCH_KEYWORD.is_match(text) || STARTS_BRACE_OR_SEMI.is_match(text)
    {
        return false;
    }
    let chars: Vec<char> = text.chars().collect();
    let mut depth = 0i64;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '"' || c == '\'' {
            i += 1;
            while i < chars.len() && chars[i] != c {
                if chars[i] == '\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
            continue;
        }
        if c == '/' && matches!(chars.get(i + 1), Some('/') | Some('*')) {
            return false;
        }
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            '{' | '}' => return false,
            ';' if depth == 0 => return true,
            _ => {}
        }
        i += 1;
    }
    false
}

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Init,
    Block,
    Added,
}
#[derive(Clone, Copy, PartialEq)]
enum Chain {
    None,
    Else,
    If,
}

/// Splits compact C into one statement per line: after `;` outside parentheses, after a block `{`, around a block
/// `}` (keeping `} else`, `} while`, `};`) and after `case …:`. Initializer braces (`= {0, 1}`), `for (;;)` headers,
/// strings, comments and preprocessor lines are kept. A brace-less branch that follows a braced `}` on the same line
/// (`} else stmt;`, `} else if (c) stmt;`) gets braces so the whole chain reads the same. Returns, for every source
/// line, the (not yet indented) lines it becomes.
pub fn split_statements(source: &str) -> Vec<Vec<String>> {
    let mut groups: Vec<Vec<String>> = Vec::new();
    let mut in_comment = false;
    let mut braces: Vec<Kind> = Vec::new();
    let (mut paren, mut continued) = (0i64, false);
    for raw in lines(source) {
        if !in_comment && (continued || trim(raw).starts_with('#')) {
            continued = CONTINUED.is_match(raw);
            groups.push(vec![raw.to_string()]);
            continue;
        }
        if trim(raw).is_empty() {
            groups.push(vec![String::new()]);
            continue;
        }
        let parts = scan(raw, &mut in_comment);
        let part_chars: Vec<Vec<char>> = parts.iter().map(|p| p.text.chars().collect()).collect();
        let mut pieces: Vec<String> = Vec::new();
        let (mut line, mut statement) = (String::new(), String::new());
        let (mut pending, mut chain, mut header) = (false, Chain::None, false);
        // The rest of the source line after character `i` of part `pi`.
        let rest = |pi: usize, i: usize| -> String {
            let mut out: String = part_chars[pi][i + 1..].iter().collect();
            for p in &parts[pi + 1..] {
                out.push_str(&p.text);
            }
            out
        };
        macro_rules! flush {
            () => {
                if !trim(&line).is_empty() {
                    pieces.push(trim_end(&line).to_string());
                }
                line.clear();
            };
        }
        macro_rules! add_brace {
            () => {
                line.push_str(" {");
                braces.push(Kind::Added);
                statement.clear();
                pending = true;
                chain = Chain::None;
            };
        }
        for (pi, part) in parts.iter().enumerate() {
            // A comment after a statement stays on its line; anything else starts the next line.
            if !part.code {
                if pending {
                    pending = false;
                    if part.text.starts_with("//") || part.text.starts_with("/*") {
                        line.push(' ');
                    } else {
                        flush!();
                    }
                }
                line.push_str(&part.text);
                statement.push_str(&part.text);
                continue;
            }
            let t = &part_chars[pi];
            for i in 0..t.len() {
                let ch = t[i];
                let top = braces.last().copied();
                let init = top == Some(Kind::Init);
                if pending {
                    if is_space(ch) {
                        continue;
                    }
                    pending = false;
                    flush!();
                }
                if ch == '{' {
                    let kind = if init || INIT_BEFORE.is_match(&line) {
                        Kind::Init
                    } else {
                        Kind::Block
                    };
                    braces.push(kind);
                    line.push(ch);
                    chain = Chain::None;
                    if kind == Kind::Block {
                        statement.clear();
                        pending = true;
                    } else {
                        statement.push(ch);
                    }
                    continue;
                }
                if ch == '}' && !braces.is_empty() && top != Some(Kind::Added) {
                    braces.pop();
                    if init {
                        line.push(ch);
                        statement.push(ch);
                        continue;
                    }
                    flush!();
                    line.push('}');
                    statement.clear();
                    let after = rest(pi, i);
                    if THEN_ELSE.is_match(&after) {
                        chain = Chain::Else;
                    } else if !KEEPS_NAME.is_match(&after) {
                        // `} T;` / `} g, h;` of a typedef or variable declaration keeps its name on the brace line.
                        pending = true;
                    }
                    continue;
                }
                if ch == '(' {
                    paren += 1;
                } else if ch == ')' {
                    paren = (paren - 1).max(0);
                }
                line.push(ch);
                statement.push(ch);
                if chain == Chain::Else
                    && ENDS_ELSE.is_match(&line)
                    && !t.get(i + 1).is_some_and(|c| is_word(*c))
                {
                    let after = rest(pi, i);
                    if THEN_IF.is_match(&after) {
                        chain = Chain::If;
                        header = false;
                    } else if single_statement(&after) {
                        add_brace!();
                    } else {
                        chain = Chain::None;
                    }
                    continue;
                }
                if chain == Chain::If {
                    if ch == '(' {
                        header = true;
                    } else if ch == ')' && header && paren == 0 {
                        chain = Chain::None;
                        if single_statement(&rest(pi, i)) {
                            add_brace!();
                        }
                    }
                    continue;
                }
                if init || paren != 0 {
                    continue;
                }
                if ch == ';' {
                    statement.clear();
                    if top == Some(Kind::Added) {
                        braces.pop();
                        flush!();
                        line.push('}');
                        if THEN_ELSE.is_match(&rest(pi, i)) {
                            chain = Chain::Else;
                        } else {
                            pending = true;
                        }
                    } else {
                        pending = true;
                    }
                } else if ch == ':' && t.get(i + 1) != Some(&':') && CASE_LABEL.is_match(&statement)
                {
                    // `case N: {` keeps its block brace on the label line.
                    statement.clear();
                    if !THEN_BRACE.is_match(&rest(pi, i)) {
                        pending = true;
                    }
                }
            }
        }
        flush!();
        groups.push(pieces);
    }
    groups
}

/// Full formatting (편집 → 코드 정렬, `}` block, save): `split_statements` then `format_c` indentation. Returns the
/// text and, for every source line, the formatted lines it became, so the editor can apply the change line by line
/// and keep breakpoints on their statements. With `range`, only those source lines change.
pub fn format_code(
    source: &str,
    tab_size: f64,
    range: Option<Range>,
) -> (String, Vec<Vec<String>>) {
    let original = lines(source);
    let groups = split_statements(source);
    let flat: Vec<&str> = groups.iter().flatten().map(String::as_str).collect();
    let formatted_text = format_c(&flat.join("\n"), tab_size, None);
    let formatted: Vec<&str> = formatted_text.split('\n').collect();
    let mut k = 0;
    let mut out: Vec<Vec<String>> = Vec::with_capacity(groups.len());
    for (index, group) in groups.iter().enumerate() {
        let end = (k + group.len()).min(formatted.len());
        let own: Vec<String> = formatted[k.min(end)..end]
            .iter()
            .map(|s| s.to_string())
            .collect();
        k += group.len();
        out.push(if range.is_none_or(|r| r.has(index + 1)) {
            own
        } else {
            vec![original.get(index).copied().unwrap_or("").to_string()]
        });
    }
    let text = out
        .iter()
        .flatten()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(eol(source));
    (text, out)
}

/// Only the leading indentation of each line, as `format_c` computes it; the rest of every line stays as written.
pub fn reindent_c(source: &str, tab_size: f64) -> String {
    let before: Vec<&str> = source.split('\n').collect();
    let formatted = format_c(source, tab_size, None);
    let after: Vec<&str> = formatted.split('\n').collect();
    if after.len() != before.len() {
        return source.to_string();
    }
    before
        .iter()
        .zip(after)
        .map(|(line, formatted)| {
            if trim(line).is_empty() {
                line.to_string()
            } else {
                let indent = &formatted[..formatted.len() - trim_start(formatted).len()];
                format!("{indent}{}", trim_start(line))
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Line range (1-based) of the block whose `}` sits on `line` (the last `}` before `column`, if given), or `None`.
/// `column` counts UTF-16 units from 1, as an editor does.
pub fn block_range(source: &str, line: f64, column: Option<f64>) -> Option<(usize, usize)> {
    let all = lines(source);
    let mut in_comment = false;
    let mut opens: Vec<usize> = Vec::new();
    let mut found = None;
    for (i, full) in all.iter().enumerate() {
        if (i as f64) >= line {
            break;
        }
        let on_line = (i + 1) as f64 == line;
        let text = match (on_line, column) {
            (true, Some(column)) if column.is_finite() => {
                utf16_prefix(full, (column - 1.0).max(0.0) as usize)
            }
            (true, Some(column)) if column.is_nan() || column < 0.0 => "",
            _ => full,
        };
        if trim(text).starts_with('#') && !in_comment {
            continue;
        }
        for part in scan(text, &mut in_comment) {
            if !part.code {
                continue;
            }
            for ch in part.text.chars() {
                if ch == '{' {
                    opens.push(i + 1);
                } else if ch == '}' {
                    let start = opens.pop();
                    if on_line {
                        found = start.map(|start| (start, i + 1));
                    }
                }
            }
        }
    }
    found
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[serde_json::Value]) -> Option<Result<serde_json::Value, String>> {
    use serde_json::{json, Value};
    let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
    let f = |i: usize| args.get(i).and_then(Value::as_f64).unwrap_or(f64::NAN);
    // {start, end} | null
    let range = |i: usize| {
        args.get(i).filter(|r| r.is_object()).map(|r| Range {
            start: r.get("start").and_then(Value::as_f64).unwrap_or(f64::NAN),
            end: r.get("end").and_then(Value::as_f64).unwrap_or(f64::NAN),
        })
    };
    Some(Ok(match name {
        // [source, tabSize, range | null] → text
        "format_c" => json!(format_c(s(0), f(1), range(2))),
        // [source] → [[line]]
        "split_statements" => json!(split_statements(s(0))),
        // [source, tabSize, range | null] → {text, lines}
        "format_code" => {
            let (text, lines) = format_code(s(0), f(1), range(2));
            json!({"text": text, "lines": lines})
        }
        // [source, tabSize] → text
        "reindent_c" => json!(reindent_c(s(0), f(1))),
        // [source, line, column | null] → {start, end} | null
        "block_range" => match block_range(s(0), f(1), args.get(2).and_then(Value::as_f64)) {
            Some((start, end)) => json!({"start": start, "end": end}),
            None => Value::Null,
        },
        _ => return None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indentation_and_spacing() {
        let source =
            "int main(void){\nif(x){\ny=1 ;\n}else{\nfoo(a,b);\n}\nwhile(1)\nz++;\nreturn 0;\n}";
        assert_eq!(
            format_c(source, 4.0, None),
            "int main(void) {\n    if (x) {\n        y=1;\n    } else {\n        foo(a, b);\n    }\n    while (1)\n        z++;\n    return 0;\n}"
        );
        assert_eq!(format_c("a\r\n  b", 2.0, None), "a\r\nb");
        assert_eq!(
            format_c("switch(x){\ncase 1:\nf();\nbreak;\n}", 2.0, None),
            "switch (x) {\n  case 1:\n    f();\n    break;\n}"
        );
        assert_eq!(
            format_c(
                "  x;\n  y;",
                4.0,
                Some(Range {
                    start: 2.0,
                    end: 2.0
                })
            ),
            "  x;\ny;"
        );
        assert_eq!(
            format_c("#define A \\\n   1\n  s = \"a ,b\";  // c ,d", 4.0, None),
            "#define A \\\n   1\ns = \"a ,b\";  // c ,d"
        );
    }

    #[test]
    fn one_statement_per_line() {
        let (text, groups) = format_code(
            "void f(void){int a[2]={1,2};if(a[0])g();else h(); for(;;){k();}}",
            4.0,
            None,
        );
        assert_eq!(
            text,
            "void f(void) {\n    int a[2]={1, 2};\n    if (a[0])g();\n    else h();\n    for (;;) {\n        k();\n    }\n}"
        );
        assert_eq!(groups.len(), 1);
        assert_eq!(
            split_statements("if(a){b();} else x=1;"),
            [["if(a){", "b();", "} else {", "x=1;", "}"]]
        );
        assert_eq!(
            split_statements("typedef struct { int a; } T;"),
            [["typedef struct {", "int a;", "} T;"]]
        );
        assert_eq!(
            split_statements("case 1: { a(); }"),
            [["case 1: {", "a();", "}"]]
        );
    }

    #[test]
    fn reindent_and_block_range() {
        assert_eq!(reindent_c("{\nx  =  1 ;\n}", 4.0), "{\n    x  =  1 ;\n}");
        assert_eq!(block_range("f(){\n a;\n}", 3.0, None), Some((1, 3)));
        assert_eq!(block_range("f(){\n a;\n}", 3.0, Some(1.0)), None);
        assert_eq!(block_range("{ } }", 1.0, Some(4.0)), Some((1, 1)));
        assert_eq!(block_range("}", 1.0, None), None);
    }
}
