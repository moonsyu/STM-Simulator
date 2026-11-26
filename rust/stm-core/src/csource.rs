//! Reading C source as text: comments and strings masked, top-level functions, the `USER CODE` sections.
//! Ported from `src/c-source-edit.js` (maskC, cFunctions, USER_SECTION, topLevelItems) for the regeneration code in
//! `regen.rs`. Offsets are byte offsets into the UTF-8 source; masking keeps them (every masked character becomes
//! as many spaces as it has bytes).

/// JavaScript's `\s` for the ASCII range (space, tab, LF, VT, FF, CR). Source text beyond ASCII is never white space
/// here; the generator writes none and user code with such characters keeps them as ordinary text.
pub fn is_space(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\n' | 0x0b | 0x0c | b'\r')
}

pub fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

pub fn is_word_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_'
}

/// Comments, string literals and character literals replaced by spaces (newlines stay), offsets unchanged.
pub fn mask_c(source: &str) -> String {
    let bytes = source.as_bytes();
    let mut out = bytes.to_vec();
    let mut i = 0;
    while i < bytes.len() {
        let end = match bytes[i] {
            b'/' if bytes.get(i + 1) == Some(&b'*') => find(bytes, b"*/", i + 2).map(|at| at + 2),
            // A line comment runs to the end of the line (the newline is not part of it).
            b'/' if bytes.get(i + 1) == Some(&b'/') => Some(
                bytes[i..]
                    .iter()
                    .position(|&b| b == b'\n')
                    .map_or(bytes.len(), |n| i + n),
            ),
            quote @ (b'"' | b'\'') => literal_end(bytes, i, quote),
            _ => None,
        };
        match end {
            Some(end) => {
                for b in &mut out[i..end] {
                    if *b != b'\n' {
                        *b = b' ';
                    }
                }
                i = end;
            }
            None => i += 1,
        }
    }
    // Only ASCII spaces replaced bytes, so every multi-byte character was either kept whole or replaced whole.
    String::from_utf8(out).expect("masking keeps the text valid UTF-8")
}

/// The end of a string or character literal starting at `start` (`"(?:\\.|[^"\\])*"`): `None` when it is not closed.
/// As in the JavaScript pattern, an escape takes any character except a newline.
fn literal_end(bytes: &[u8], start: usize, quote: u8) -> Option<usize> {
    let mut i = start + 1;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => {
                if bytes.get(i + 1).is_none_or(|&b| b == b'\n') {
                    return None;
                }
                i += 2;
            }
            b if b == quote => return Some(i + 1),
            _ => i += 1,
        }
    }
    None
}

pub fn find(haystack: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if from > haystack.len() || needle.is_empty() {
        return None;
    }
    haystack[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|at| from + at)
}

pub fn rfind(haystack: &[u8], needle: &[u8], before: usize) -> Option<usize> {
    let end = before.min(haystack.len());
    haystack[..end]
        .windows(needle.len())
        .rposition(|w| w == needle)
}

/// A function defined at brace depth 0.
#[derive(Debug, Clone, PartialEq)]
pub struct Function {
    pub name: String,
    /// Where its text starts (after the previous `;`, `}` or newline, leading white space skipped).
    pub start: usize,
    /// One past its closing brace.
    pub end: usize,
    /// The position of its opening brace.
    pub open: usize,
}

/// Functions of a source (`cFunctions`): `name(params) {` at brace depth 0, `if`/`while`/`for`/`switch` excluded.
/// `Err` when a function's braces do not close.
pub fn c_functions(source: &str) -> Result<Vec<Function>, String> {
    c_functions_from(source, false)
}
/// The same as the JavaScript `cFunctions` found them: its pattern takes `if (…) … name(…) {` as one match when no
/// `;`, `{` or `}` is between the `if (` and the function's `)` (a `#if (X == 1)` line above a function), and goes on
/// after that match — such a function is not listed. The callers that were JavaScript (`csedit.rs`) keep that.
pub fn c_functions_as_javascript(source: &str) -> Result<Vec<Function>, String> {
    c_functions_from(source, true)
}
fn c_functions_from(source: &str, whole_keyword_match: bool) -> Result<Vec<Function>, String> {
    let masked = mask_c(source);
    let m = masked.as_bytes();
    let src = source.as_bytes();
    let mut found = Vec::new();
    let mut from = 0;
    while let Some((at, name_end, open)) = next_call_head(m, from) {
        let name = &masked[at..name_end];
        if ["if", "while", "for", "switch"].contains(&name) {
            // Stepping one byte finds a function whose `(…)` the keyword's match would have taken with it.
            from = if whole_keyword_match {
                open + 1
            } else {
                at + 1
            };
            continue;
        }
        let depth: i64 = m[..at]
            .iter()
            .map(|&b| match b {
                b'{' => 1,
                b'}' => -1,
                _ => 0,
            })
            .sum();
        if depth != 0 {
            from = open + 1;
            continue;
        }
        let mut end = open + 1;
        let mut level = 1;
        while end < m.len() && level > 0 {
            match m[end] {
                b'{' => level += 1,
                b'}' => level -= 1,
                _ => {}
            }
            end += 1;
        }
        if level > 0 {
            return Err("C 함수 중괄호를 확인하세요.".into());
        }
        let mut start = at;
        while start > 0 && !matches!(m[start - 1], b';' | b'}' | b'\n') {
            start -= 1;
        }
        while start < src.len() && is_space(src[start]) {
            start += 1;
        }
        found.push(Function {
            name: name.to_string(),
            start,
            end,
            open,
        });
        from = end;
    }
    Ok(found)
}

/// The next `\b([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*\{` at or after `from`: (start of the name, end of the name, position
/// of the `{`). The parameter part is greedy in the JavaScript pattern: the last `)` before a `{` that has no `;`,
/// `{` or `}` between the `(` and it.
fn next_call_head(m: &[u8], from: usize) -> Option<(usize, usize, usize)> {
    let mut i = from;
    while i < m.len() {
        if is_word_start(m[i]) && (i == 0 || !is_word(m[i - 1])) {
            let mut name_end = i + 1;
            while name_end < m.len() && is_word(m[name_end]) {
                name_end += 1;
            }
            let mut j = name_end;
            while j < m.len() && is_space(m[j]) {
                j += 1;
            }
            if j < m.len() && m[j] == b'(' {
                // [^;{}]* then `)` \s* `{`: the candidates are every `)` before the first `;`, `{` or `}`.
                let stop = m[j + 1..]
                    .iter()
                    .position(|&b| matches!(b, b';' | b'{' | b'}'))
                    .map_or(m.len(), |n| j + 1 + n);
                let mut close = stop;
                while close > j + 1 {
                    close -= 1;
                    if m[close] == b')' {
                        let mut k = close + 1;
                        while k < m.len() && is_space(m[k]) {
                            k += 1;
                        }
                        if k < m.len() && m[k] == b'{' {
                            return Some((i, name_end, k));
                        }
                    }
                }
            }
            // No match starting at this name: the next attempt starts at the following position, as the regex does
            // (a later `\b` inside the same word is not a word start preceded by a non-word character).
            i = name_end;
        } else {
            i += 1;
        }
    }
    None
}

/// One `/* USER CODE BEGIN tag */ … /* USER CODE END tag */` section.
#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    pub start: usize,
    pub end: usize,
    pub tag: String,
    /// The text between the two comments.
    pub body_start: usize,
    pub body_end: usize,
}

const BEGIN: &[u8] = b"/* USER CODE BEGIN ";

/// The sections in order, not overlapping (`String.matchAll(USER_SECTION)`): the tag is the shortest text on the
/// line (at least one character) for which a matching END comment follows.
pub fn user_sections(source: &str) -> Vec<Section> {
    let bytes = source.as_bytes();
    let mut sections = Vec::new();
    let mut from = 0;
    while let Some(start) = find(bytes, BEGIN, from) {
        let tag_start = start + BEGIN.len();
        let line_end = bytes[tag_start..]
            .iter()
            .position(|&b| b == b'\n' || b == b'\r')
            .map_or(bytes.len(), |n| tag_start + n);
        let mut matched = None;
        // `(.+?) \*/`: every ` */` on the line is a possible end of the tag, the nearest first.
        let mut probe = tag_start + 1;
        while let Some(close) = find(&bytes[..line_end], b" */", probe) {
            let tag = &source[tag_start..close];
            let body_start = close + 3;
            let end_marker = format!("/* USER CODE END {tag} */");
            if let Some(body_end) = find(bytes, end_marker.as_bytes(), body_start) {
                matched = Some(Section {
                    start,
                    end: body_end + end_marker.len(),
                    tag: tag.to_string(),
                    body_start,
                    body_end,
                });
                break;
            }
            probe = close + 1;
        }
        match matched {
            Some(section) => {
                from = section.end;
                sections.push(section);
            }
            None => from = start + 1,
        }
    }
    sections
}

/// `text.replace(/\s+/g, ' ').trim()`.
pub fn flat(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut pending = false;
    for c in text.chars() {
        if c.is_ascii() && is_space(c as u8) {
            pending = true;
        } else {
            if pending && !out.is_empty() {
                out.push(' ');
            }
            pending = false;
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masking_keeps_offsets_and_newlines() {
        let source = "int a; /* x\n y */ char *s = \"a\\\"b // c\"; // tail\nchar c = '\\'';\n";
        let masked = mask_c(source);
        assert_eq!(masked.len(), source.len());
        assert_eq!(masked.matches('\n').count(), source.matches('\n').count());
        assert!(!masked.contains("tail") && !masked.contains("x") && masked.contains("char *s = "));
        assert_eq!(
            mask_c("a = \"한글\"; // 주석"),
            format!("a = {}; {}", " ".repeat(8), " ".repeat(9))
        );
        // An unclosed literal is left as it is.
        assert_eq!(mask_c("x = \"open\nint y;"), "x = \"open\nint y;");
    }

    #[test]
    fn functions_at_depth_zero() {
        let source =
            "static void a(void)\n{\n  if (x) { y(); }\n}\nint main(void) {\n  while (1) { }\n}\n";
        let fns = c_functions(source).unwrap();
        assert_eq!(
            fns.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(),
            ["a", "main"]
        );
        assert_eq!(
            &source[fns[0].start..fns[0].end],
            "static void a(void)\n{\n  if (x) { y(); }\n}"
        );
        assert_eq!(
            &source[fns[1].start..fns[1].end],
            "int main(void) {\n  while (1) { }\n}"
        );
        assert!(c_functions("void f(void) {").is_err());
        // A call in an initializer is not a definition; a prototype is not one either.
        assert!(c_functions("int v = f(1);\nvoid g(void);\n")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn sections_with_their_tags() {
        let source = "/* USER CODE BEGIN 2 */\n  x();\n/* USER CODE END 2 */\n/* USER CODE BEGIN USART2_Init 0 */\n/* USER CODE END USART2_Init 0 */\n/* USER CODE BEGIN 9 */ no end\n";
        let sections = user_sections(source);
        assert_eq!(
            sections.iter().map(|s| s.tag.as_str()).collect::<Vec<_>>(),
            ["2", "USART2_Init 0"]
        );
        assert_eq!(
            &source[sections[0].body_start..sections[0].body_end],
            "\n  x();\n"
        );
        assert_eq!(sections[0].start, 0);
        assert_eq!(
            &source[sections[1].start..sections[1].end],
            "/* USER CODE BEGIN USART2_Init 0 */\n/* USER CODE END USART2_Init 0 */"
        );
    }

    #[test]
    fn flat_collapses_white_space() {
        assert_eq!(flat("  a \n\t b  c \n"), "a b c");
        assert_eq!(flat(""), "");
    }
}
