//! C source symbols for "go to definition" (Ctrl+click, F12) and the Outline view, like CubeIDE's indexer: includes,
//! macros, typedef names, enum constants, global variables, function definitions and prototypes, each with its line.
//! A text scan (no preprocessor): every #if branch counts, so a name can have several definitions.
//! Also the fields of a C struct type, for member completion after "." and "->".
//!
//! Moved here from `src/c-symbols.js` and `src/c-struct-fields.js` (feature 62); those files now only call these
//! functions. Offsets and columns count UTF-16 units, as the editor does: see `jsre::Text`.

use crate::js_re;
use crate::jsre::{re, trim, Text};
use regex_lite::Regex;
use serde_json::{json, Value};

const KEYWORDS: &[&str] = &[
    "if", "for", "while", "switch", "return", "sizeof", "do", "else", "case", "default", "goto",
    "break", "continue", "typedef", "struct", "union", "enum", "static", "extern", "const",
    "volatile", "inline", "register", "auto", "signed", "unsigned", "void", "int", "char", "short",
    "long", "float", "double",
];
fn keyword(name: &str) -> bool {
    !name.is_empty() && KEYWORDS.contains(&name)
}
/// The places of an outline entry, best first: function bodies, macros, typedefs, enum constants, variables,
/// prototypes; includes last.
pub fn kind_rank(kind: &str) -> u32 {
    match kind {
        "function" => 0,
        "macro" => 1,
        "typedef" => 2,
        "enum" => 3,
        "variable" => 4,
        "declaration" => 5,
        "include" => 9,
        _ => 8,
    }
}
fn is_ascii_space(b: u8) -> bool {
    matches!(b, b'\t' | b'\n' | 0x0B | 0x0C | b'\r' | b' ')
}

/// Comments and string/char literals marked to become spaces (offsets and line breaks are kept).
fn literal_mask(proxy: &[u8]) -> Vec<bool> {
    let mut hide = vec![false; proxy.len()];
    let n = proxy.len();
    let mut i = 0;
    while i < n {
        let c = proxy[i];
        let end = if c == b'/' && proxy.get(i + 1) == Some(&b'*') {
            (i + 2..n.saturating_sub(1))
                .find(|&k| proxy[k] == b'*' && proxy[k + 1] == b'/')
                .map(|k| k + 2)
        } else if c == b'/' && proxy.get(i + 1) == Some(&b'/') {
            Some((i..n).find(|&k| proxy[k] == b'\n').unwrap_or(n))
        } else if c == b'"' || c == b'\'' {
            // (?:\\.|[^"\\\n])*" — a backslash takes the next character with it (not a line break).
            let mut j = i + 1;
            loop {
                match proxy.get(j) {
                    Some(&q) if q == c => break Some(j + 1),
                    Some(b'\\') if proxy.get(j + 1).is_some_and(|x| *x != b'\n' && *x != b'\r') => {
                        j += 2
                    }
                    Some(b'\\') | Some(b'\n') | None => break None,
                    Some(_) => j += 1,
                }
            }
        } else {
            None
        };
        match end {
            Some(end) => {
                hide[i..end].iter_mut().for_each(|h| *h = true);
                i = end;
            }
            None => i += 1,
        }
    }
    hide
}
/// Preprocessor lines marked to become spaces. `crlf`: a `\` before `\r\n` also continues the line (the outline's
/// scan); otherwise only a `\` right before the line break does (the struct reader's).
fn directive_mask(proxy: &[u8], crlf: bool) -> Vec<bool> {
    let mut hide = vec![false; proxy.len()];
    let n = proxy.len();
    let mut line = 0;
    while line < n {
        let line_end = |from: usize| (from..n).find(|&k| proxy[k] == b'\n').unwrap_or(n);
        let mut at = line;
        while at < n && (proxy[at] == b' ' || proxy[at] == b'\t') {
            at += 1;
        }
        let mut end = line_end(line);
        if proxy.get(at) == Some(&b'#') {
            // Lines that end with a backslash carry on.
            loop {
                let continued = end < n
                    && end > at
                    && (proxy[end - 1] == b'\\'
                        || (crlf
                            && end >= 2
                            && proxy[end - 1] == b'\r'
                            && proxy[end - 2] == b'\\'));
                if !continued {
                    break;
                }
                end = line_end(end + 1);
            }
            hide[line..end].iter_mut().for_each(|h| *h = true);
        }
        line = end + 1;
    }
    hide
}
fn squash(text: &str) -> String {
    js_re!(SPACES, r"\s+");
    trim(&SPACES.replace_all(text, " ")).to_string()
}

#[derive(Debug, Clone, PartialEq)]
pub struct Symbol {
    pub name: String,
    pub kind: &'static str,
    pub line: usize,
    pub column: usize,
    pub detail: String,
}

js_re!(
    INCLUDE,
    r#"(?m)^[ \t]*#[ \t]*include[ \t]*([<"])([^>"\n]+)[>"]"#
);
js_re!(
    DEFINE,
    r"(?m)^([ \t]*#[ \t]*define[ \t]+)([A-Za-z_]\w*)(\([^)\n]*\))?"
);
js_re!(EXTERN_END, r"\bextern\s*$");
js_re!(NAME_END, r"([A-Za-z_]\w*)\s*$");
js_re!(AGGREGATE, r"\b(struct|union|enum)\b[^;=]*$");
js_re!(ENUM_HEAD, r"\benum\b[^;=]*$");
js_re!(TYPEDEF, r"\btypedef\b");
js_re!(ENUMERATOR, r"(^|,)(\s*)([A-Za-z_]\w*)");
js_re!(COMMA_END, r",\s*$");
js_re!(NAME_START, r"^\s*([A-Za-z_]\w*)");
js_re!(TYPEDEF_START, r"^typedef\b");
js_re!(
    TYPEDEF_NAME,
    r"\(\s*\*\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*)\s*(\[[^\]]*\]\s*)*$"
);
js_re!(
    PROTOTYPE,
    r"([A-Za-z_]\w*)\s*\([^()]*(\([^()]*\)[^()]*)*\)\s*$"
);
js_re!(EXTERN_START, r"^extern\b");
js_re!(DECLARATOR, r"([A-Za-z_]\w*)\s*(\[[^\]]*\]\s*)*$");
js_re!(STARS_END, r"[\s*]*$");

struct Block {
    kind: &'static str,
    typedef: bool,
    start: usize,
}

/// The symbols of a source file, in the order they are written.
pub fn c_symbols(source: &str) -> Vec<Symbol> {
    let text = Text::new(source);
    let masked = text.masked(&literal_mask(text.proxy().as_bytes()));
    let code = masked.masked(&directive_mask(masked.proxy().as_bytes(), true));
    let mut out: Vec<Symbol> = Vec::new();
    let mut starts = vec![0usize];
    for (i, b) in text.proxy().bytes().enumerate() {
        if b == b'\n' {
            starts.push(i + 1);
        }
    }
    let mut add = |name: &str, kind: &'static str, offset: usize, detail: &str| {
        if name.is_empty() || (kind != "include" && keyword(name)) {
            return;
        }
        let line = starts.partition_point(|&start| start <= offset).max(1);
        out.push(Symbol {
            name: name.to_string(),
            kind,
            line,
            column: offset - starts[line - 1] + 1,
            detail: squash(detail),
        });
    };
    // The file name is a string literal (masked), so includes are read from the text where the # is not in a comment.
    for m in INCLUDE.captures_iter(text.proxy()) {
        let whole = m.get(0).unwrap();
        let hash = whole.start() + whole.as_str().find('#').unwrap();
        if masked.byte(hash) != b'#' {
            continue;
        }
        let (open, file) = (m.get(1).unwrap(), m.get(2).unwrap());
        let name = text.slice(file.start(), file.end());
        let offset = whole.start()
            + whole
                .as_str()
                .find(file.as_str())
                .unwrap_or(file.start() - whole.start());
        let close = if open.as_str() == "<" { ">" } else { "\"" };
        add(
            &name,
            "include",
            offset,
            &format!("{}{name}{close}", open.as_str()),
        );
    }
    for m in DEFINE.captures_iter(masked.proxy()) {
        let name = m.get(2).unwrap();
        let params = m
            .get(3)
            .map_or(String::new(), |p| masked.slice(p.start(), p.end()));
        add(
            name.as_str(),
            "macro",
            name.start(),
            &format!("{}{params}", name.as_str()),
        );
    }
    // Brace scan at file level: function bodies, struct/union/enum bodies (typedef names, enum constants), initializers.
    let proxy = code.proxy();
    let bytes = proxy.as_bytes();
    let mut blocks: Vec<Block> = Vec::new();
    let (mut depth, mut stmt, mut skip_name) = (0usize, 0usize, false);
    // `code.slice(from, to)` of the stand-in: empty when the range is.
    let part = |from: usize, to: usize| if from < to { &proxy[from..to] } else { "" };
    for i in 0..bytes.len() {
        let c = bytes[i];
        if c == b'{' {
            if depth > 0 {
                blocks.push(Block {
                    kind: "inner",
                    typedef: false,
                    start: i,
                });
                depth += 1;
                continue;
            }
            let head = part(stmt, i);
            if EXTERN_END.is_match(head) {
                blocks.push(Block {
                    kind: "extern",
                    typedef: false,
                    start: i,
                });
                stmt = i + 1;
                continue;
            }
            let mut kind = "init";
            // The last character before the brace that is not white space.
            let before = (0..i).rev().find(|&j| !is_ascii_space(bytes[j]));
            if let Some(j) = before.filter(|&j| bytes[j] == b')') {
                // The parenthesis that opens the one at `j`: the name before it is the function's.
                let (mut k, mut p, mut found) = (j as isize, 0i64, false);
                while k >= stmt as isize {
                    match bytes[k as usize] {
                        b')' => p += 1,
                        b'(' => {
                            p -= 1;
                            if p == 0 {
                                found = true;
                                break;
                            }
                        }
                        _ => {}
                    }
                    k -= 1;
                }
                let to = if found {
                    k as usize
                } else {
                    (stmt as isize - 1).max(0) as usize
                };
                let before_paren = if found || stmt > 0 {
                    part(stmt, to)
                } else {
                    ""
                };
                if let Some(m) = NAME_END.captures(before_paren) {
                    let name = m.get(1).unwrap();
                    if !keyword(name.as_str()) && !before_paren.contains('=') {
                        kind = "function";
                        add(
                            name.as_str(),
                            "function",
                            stmt + name.start(),
                            &code.slice(stmt, j + 1),
                        );
                    }
                }
            } else if AGGREGATE.is_match(head) {
                kind = if ENUM_HEAD.is_match(head) {
                    "enum"
                } else {
                    "struct"
                };
            }
            blocks.push(Block {
                kind,
                typedef: TYPEDEF.is_match(head),
                start: i,
            });
            depth += 1;
            continue;
        }
        if c == b'}' {
            let Some(b) = blocks.pop() else { continue };
            if b.kind == "extern" {
                stmt = i + 1;
                continue;
            }
            depth -= 1;
            if depth > 0 {
                continue;
            }
            if b.kind == "enum" {
                let from = b.start + 1;
                let body = part(from, i);
                for m in ENUMERATOR.captures_iter(body) {
                    let name = m.get(3).unwrap();
                    let at = from + name.start();
                    let index = m.get(0).unwrap().start();
                    let end = body
                        .get(index + 1..)
                        .and_then(|rest| rest.find(','))
                        .map_or(body.len(), |comma| index + 1 + comma + 1);
                    let detail = code.slice(at, from + end);
                    add(name.as_str(), "enum", at, &COMMA_END.replace(&detail, ""));
                }
            }
            if b.kind == "function" {
                stmt = i + 1;
                continue;
            }
            if b.kind == "struct" || b.kind == "enum" {
                if b.typedef {
                    if let Some(m) = NAME_START.captures(&proxy[i + 1..]) {
                        let name = m.get(1).unwrap();
                        let aggregate = if b.kind == "enum" { "enum" } else { "struct" };
                        add(
                            name.as_str(),
                            "typedef",
                            i + 1 + name.start(),
                            &format!("typedef {aggregate} {}", name.as_str()),
                        );
                    }
                    skip_name = true;
                }
                stmt = i + 1;
            }
            continue;
        }
        if c == b';' && depth == 0 {
            let s = part(stmt, i);
            let t = squash(s);
            if skip_name || t.is_empty() {
                skip_name = false;
                stmt = i + 1;
                continue;
            }
            // `stmt + s.lastIndexOf(name)`: -1 when the name is not there (it always is).
            let at = |name: &str| {
                s.rfind(name)
                    .map_or(stmt.saturating_sub(1), |found| stmt + found)
            };
            if TYPEDEF_START.is_match(&t) {
                let name = TYPEDEF_NAME
                    .captures(&t)
                    .and_then(|m| m.get(1).or(m.get(2)).map(|g| g.as_str().to_string()))
                    .unwrap_or_default();
                if !name.is_empty() {
                    add(&name, "typedef", at(&name), &code.slice(stmt, i));
                }
            } else {
                let decl = t.split('=').next().unwrap_or("");
                let prototype = PROTOTYPE.captures(decl).filter(|_| t == decl);
                if let Some(m) = prototype {
                    let name = m.get(1).unwrap().as_str();
                    add(name, "declaration", at(name), &code.slice(stmt, i));
                } else {
                    // One symbol per declarator: `uint32_t a, *b = 0, c[2] = {1, 2};` declares a, b and c with the same
                    // type.
                    let kind = if EXTERN_START.is_match(&t) {
                        "declaration"
                    } else {
                        "variable"
                    };
                    let mut type_name: Option<String> = None;
                    let mut offset = 0usize;
                    for piece in split_declarators(s) {
                        // The declarator without its initializer, as a range of the code.
                        let d_len = piece.find('=').unwrap_or(piece.len());
                        let d = &piece[..d_len];
                        let d_start = stmt + offset;
                        let found = DECLARATOR.captures(d);
                        if found.is_some()
                            && type_name.is_none()
                            && !trim(d).contains(|ch: char| is_ascii_space(ch as u8) || ch == '*')
                        {
                            break;
                        }
                        if let Some(m) = found {
                            let name = m.get(1).unwrap();
                            let whole = m.get(0).unwrap().start();
                            if type_name.is_none() {
                                let head = code.slice(d_start, d_start + whole);
                                type_name = Some(STARS_END.replace(&head, "").into_owned());
                            }
                            let own = code.slice(d_start, d_start + d_len);
                            let detail = if offset != 0 {
                                format!("{} {}", type_name.as_deref().unwrap_or(""), trim(&own))
                            } else {
                                own
                            };
                            add(name.as_str(), kind, d_start + whole, &detail);
                        }
                        offset += piece.len() + 1;
                    }
                }
            }
            stmt = i + 1;
        }
    }
    out.sort_by(|a, b| a.line.cmp(&b.line).then(a.column.cmp(&b.column)));
    out
}
/// A declaration split at its top-level commas (not those inside initializer braces, brackets or parentheses).
fn split_declarators(text: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let (mut depth, mut start) = (0i64, 0usize);
    for (i, c) in text.bytes().enumerate() {
        match c {
            b'(' | b'[' | b'{' => depth += 1,
            b')' | b']' | b'}' => depth -= 1,
            b',' if depth == 0 => {
                parts.push(&text[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&text[start..]);
    parts
}

js_re!(
    STORAGE,
    r"\b(static|extern|inline|__weak|__STATIC_INLINE|__STATIC_FORCEINLINE|__INLINE|__NO_RETURN|__IO|const|volatile)\b|__attribute__\s*\(\(.*?\)\)"
);
js_re!(
    CALL_SHAPE,
    r"^(.*?)\b([A-Za-z_]\w*)\s*\((.*)\)\s*(?:__attribute__.*)?;?$"
);
js_re!(DIMENSIONS, r"^\s*((\[[^\]]*\]\s*)*)");
js_re!(ANY_SPACE, r"\s+");
/// Outline text as CubeIDE shows it: name(params) : return type, variable : type.
pub fn outline_label(name: &str, kind: &str, detail: &str) -> String {
    if kind == "function" || kind == "declaration" {
        if let Some(m) = CALL_SHAPE.captures(detail).filter(|m| &m[2] == name) {
            let ret = squash(&STORAGE.replace_all(&m[1], ""));
            let tail = if ret.is_empty() {
                String::new()
            } else {
                format!(" : {ret}")
            };
            return format!("{name}({}){tail}", squash(&m[3]));
        }
    }
    if kind == "variable" {
        let found = detail
            .rfind(name)
            .filter(|_| !name.is_empty() || !detail.is_empty());
        let type_name = match found {
            Some(i) if i > 0 => squash(&STORAGE.replace_all(&detail[..i], "")),
            _ => String::new(),
        };
        // `detail.slice(i + name.length)`: from the end of the name, or (name not there) one before that length.
        let after = match found {
            Some(i) => detail.get(i + name.len()..).unwrap_or(""),
            None => {
                let from = name.encode_utf16().count().saturating_sub(1);
                let skip: usize = detail
                    .char_indices()
                    .scan(0usize, |seen, (at, c)| {
                        let here = *seen;
                        *seen += c.len_utf16();
                        Some((here, at))
                    })
                    .find(|(units, _)| *units >= from)
                    .map_or(detail.len(), |(_, at)| at);
                &detail[skip..]
            }
        };
        let dims = DIMENSIONS
            .captures(after)
            .and_then(|m| m.get(1))
            .map_or(String::new(), |g| {
                ANY_SPACE.replace_all(g.as_str(), "").into_owned()
            });
        return if type_name.is_empty() {
            name.to_string()
        } else {
            format!("{name}{dims} : {type_name}")
        };
    }
    if kind == "macro" || kind == "include" {
        return if detail.is_empty() {
            name.to_string()
        } else {
            detail.to_string()
        };
    }
    name.to_string()
}
/// The places (indexes) of the best definitions of a name among entries of these kinds.
pub fn pick_definitions(kinds: &[&str]) -> Vec<usize> {
    let Some(best) = kinds.iter().map(|kind| kind_rank(kind)).min() else {
        return Vec::new();
    };
    (0..kinds.len())
        .filter(|&i| kind_rank(kinds[i]) == best)
        .collect()
}

// ---------- struct fields (c-struct-fields.js) ----------

js_re!(IDENTIFIER, r"^[A-Za-z_]\w*$");
js_re!(
    QUALIFIERS,
    r"\b(?:__IO|__I|__O|__IM|__OM|__IOM|const|volatile|static|register|struct|union|enum)\b"
);
js_re!(STARS_AND_SPACE, r"[*\s]+");
js_re!(TAG_OF, r"^\s*(?:struct|union)\s+([A-Za-z_]\w*)");
js_re!(FUNCTION_POINTER, r"\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\(");
js_re!(
    FIRST_DECLARATOR,
    r"^((?s:.)*?)([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*(?::\s*\w+\s*)?(?:,|$)"
);
js_re!(
    FIELD_NAME,
    r"([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*(?::\s*\w+\s*)?$"
);
js_re!(AGGREGATE_HEAD, r"\b(?:struct|union)\b[^;{}]*$");

fn struct_text(source: &str) -> Text {
    let text = Text::new(source);
    let masked = text.masked(&literal_mask(text.proxy().as_bytes()));
    masked.masked(&directive_mask(masked.proxy().as_bytes(), false))
}
/// The body between the braces that end at `close` (index of "}"): its range.
fn body_before(bytes: &[u8], close: usize) -> Option<(usize, usize)> {
    let mut depth = 0i64;
    for i in (0..=close.min(bytes.len().saturating_sub(1))).rev() {
        if bytes[i] == b'}' {
            depth += 1;
        } else if bytes[i] == b'{' {
            depth -= 1;
            if depth == 0 {
                return Some((i + 1, close));
            }
        }
    }
    None
}
fn body_after(bytes: &[u8], open: usize) -> Option<(usize, usize)> {
    let mut depth = 0i64;
    for (i, b) in bytes.iter().enumerate().skip(open) {
        if *b == b'{' {
            depth += 1;
        } else if *b == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some((open + 1, i));
            }
        }
    }
    None
}
/// The range of `text[from..to]` without the white space around it.
fn trimmed(bytes: &[u8], mut from: usize, mut to: usize) -> (usize, usize) {
    while from < to && is_ascii_space(bytes[from]) {
        from += 1;
    }
    while to > from && is_ascii_space(bytes[to - 1]) {
        to -= 1;
    }
    (from, to)
}

/// `[{name, type}]` of the struct or union type `type_name` defined in `source`; empty when it is not defined there.
pub fn struct_fields(source: &str, type_name: &str) -> Vec<(String, String)> {
    if !IDENTIFIER.is_match(type_name) {
        return Vec::new();
    }
    let text = struct_text(source);
    let proxy = text.proxy();
    let bytes = proxy.as_bytes();
    let mut body = re(&format!(r"\}}\s*{type_name}\s*;"))
        .find(proxy)
        .and_then(|end| body_before(bytes, end.start()));
    if body.is_none() {
        body = re(&format!(r"\b(?:struct|union)\s+{type_name}\s*\{{"))
            .find(proxy)
            .and_then(|tag| body_after(bytes, tag.end() - 1));
    }
    let Some((body_start, body_end)) = body else {
        return Vec::new();
    };
    // Declarations at the top level of the body; a nested struct or union contributes the names declared after its
    // "}".
    let mut out: Vec<(String, String)> = Vec::new();
    let mut add = |name: &str, type_text: &str| {
        if !name.is_empty() && !out.iter().any(|(seen, _)| seen == name) {
            let cleaned = QUALIFIERS.replace_all(type_text, " ");
            let cleaned = STARS_AND_SPACE.replace_all(&cleaned, " ");
            out.push((name.to_string(), trim(&cleaned).to_string()));
        }
    };
    let (mut depth, mut start) = (0i64, body_start);
    for i in body_start..=body_end {
        let ch = if i < body_end { bytes[i] } else { 0 };
        if ch == b'{' {
            depth += 1;
        } else if ch == b'}' {
            depth -= 1;
        }
        if i < body_end && !(ch == b';' && depth == 0) {
            continue;
        }
        let (mut from, to) = trimmed(bytes, start.min(i), i);
        start = i + 1;
        if from == to {
            continue;
        }
        let decl = &proxy[from..to];
        let type_text;
        if let Some(close) = decl.rfind('}') {
            type_text = TAG_OF
                .captures(decl)
                .map_or(String::new(), |m| m[1].to_string());
            from += close + 1;
        } else {
            if let Some(m) = FUNCTION_POINTER.captures(decl) {
                add(&m[1], "");
                continue;
            }
            let Some(first) = FIRST_DECLARATOR.captures(decl) else {
                continue;
            };
            let head = first.get(1).unwrap().end();
            type_text = text.slice(from, from + head);
            from += head;
        }
        for part in proxy[from..to].split(',') {
            let (a, b) = trimmed(part.as_bytes(), 0, part.len());
            if let Some(m) = FIELD_NAME.captures(&part[a..b]) {
                add(&m[1], &type_text);
            }
        }
    }
    out
}

/// Fields of a variable declared together with its struct: "struct { int raw; } reading;" or "struct Tag { … } a,
/// *b;".
pub fn inline_struct_fields(source: &str, name: &str) -> Vec<(String, String)> {
    if !IDENTIFIER.is_match(name) {
        return Vec::new();
    }
    let text = struct_text(source);
    let proxy = text.proxy();
    let bytes = proxy.as_bytes();
    // After the struct's "}" come the declarators, some with an initializer in braces: } config = {0}, *active;
    // The character after the name (and spaces) is one of ; = , [ — it is not part of the match.
    let pattern = re(&format!(
        r"\}}(?:[^;{{}}]|\{{[^{{}}]*\}})*?\b{name}\b\s*([;=,\[])"
    ));
    let mut at = 0;
    while at <= proxy.len() {
        let Some(m) = pattern.captures_at(proxy, at) else {
            break;
        };
        let whole = m.get(0).unwrap();
        at = (m.get(1).unwrap().start()).max(whole.start() + 1);
        let Some((from, to)) = body_before(bytes, whole.start()) else {
            continue;
        };
        // The same reader, on a copy that names the type.
        let open = from - 1;
        let head = &proxy[open.saturating_sub(80)..open];
        if !AGGREGATE_HEAD.is_match(head) {
            continue;
        }
        return struct_fields(
            &format!("typedef struct {{{}}} __inline_t;", text.slice(from, to)),
            "__inline_t",
        );
    }
    Vec::new()
}

const NOT_A_TYPE: [&str; 14] = [
    "return", "else", "case", "goto", "sizeof", "typedef", "if", "while", "for", "switch", "do",
    "new", "delete", "throw",
];
/// The declared type name of the variable or parameter `name` in `source` ("ADC_HandleTypeDef" for hadc1), or "".
pub fn declared_type(source: &str, name: &str) -> String {
    if !IDENTIFIER.is_match(name) {
        return String::new();
    }
    let text = struct_text(source);
    let proxy = text.proxy();
    let pattern: Regex = re(&format!(
        r"\b([A-Za-z_]\w*)\s*(?:\*\s*)*(?:\b(?:const|volatile)\s*)?\b{name}\b\s*([;=,\[)])"
    ));
    let mut at = 0;
    while at <= proxy.len() {
        let Some(m) = pattern.captures_at(proxy, at) else {
            break;
        };
        let found = &m[1];
        if !NOT_A_TYPE.contains(&found) && found != name {
            return found.to_string();
        }
        at = m.get(2).unwrap().start().max(m.get(0).unwrap().start() + 1);
    }
    String::new()
}

js_re!(
    ACCESS,
    r"([A-Za-z_]\w*(?:\s*\[[^\]]*\])?(?:\s*(?:\.|->)\s*[A-Za-z_]\w*(?:\s*\[[^\]]*\])?)*)\s*(?:\.|->)\s*$"
);
js_re!(ACCESS_SPLIT, r"\s*(?:\.|->)\s*");
js_re!(INDEX_END, r"\s*\[[^\]]*\]$");
/// "hadc1.Init." → ["hadc1", "Init"] for the text before the cursor, or `None` when it does not end in a member
/// access.
pub fn access_chain(before: &str) -> Option<Vec<String>> {
    let m = ACCESS.captures(before)?;
    Some(
        ACCESS_SPLIT
            .split(&m[1])
            .map(|part| INDEX_END.replace(part, "").into_owned())
            .collect(),
    )
}

fn fields_json(fields: Vec<(String, String)>) -> Value {
    Value::Array(
        fields
            .into_iter()
            .map(|(name, type_name)| json!({"name": name, "type": type_name}))
            .collect(),
    )
}
/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
    Some(Ok(match name {
        "kind_ranks" => json!({"function": 0, "macro": 1, "typedef": 2, "enum": 3, "variable": 4, "declaration": 5, "include": 9}),
        // [source] → [{name, kind, line, column, detail}]
        "c_symbols" => Value::Array(
            c_symbols(s(0))
                .into_iter()
                .map(|x| json!({"name": x.name, "kind": x.kind, "line": x.line, "column": x.column, "detail": x.detail}))
                .collect(),
        ),
        // [name, kind, detail] → text
        "outline_label" => json!(outline_label(s(0), s(1), s(2))),
        // [[kind]] → [index]
        "pick_definitions" => {
            let kinds: Vec<&str> = args
                .first()
                .and_then(Value::as_array)
                .map(|list| list.iter().map(|k| k.as_str().unwrap_or("")).collect())
                .unwrap_or_default();
            json!(pick_definitions(&kinds))
        }
        "struct_fields" => fields_json(struct_fields(s(0), s(1))),
        "inline_struct_fields" => fields_json(inline_struct_fields(s(0), s(1))),
        "declared_type" => json!(declared_type(s(0), s(1))),
        "access_chain" => json!(access_chain(s(0))),
        _ => return None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(source: &str) -> Vec<String> {
        c_symbols(source)
            .into_iter()
            .map(|s| format!("{}:{}@{}:{}", s.kind, s.name, s.line, s.column))
            .collect()
    }

    #[test]
    fn outline_of_a_file() {
        let source = "#include \"main.h\"\n#define LED(x) (x)\n/* 한글 주석 { */\ntypedef struct { int a; } Pair;\nenum Mode { OFF, ON = 2 };\nstatic uint32_t count, *next = 0;\nvoid tick(void);\nint main(void) {\n  return 0;\n}\n";
        assert_eq!(
            names(source),
            [
                "include:main.h@1:11",
                "macro:LED@2:9",
                "typedef:Pair@4:27",
                "enum:OFF@5:13",
                "enum:ON@5:18",
                "variable:count@6:17",
                "variable:next@6:25",
                "declaration:tick@7:6",
                "function:main@8:5"
            ]
        );
        let all = c_symbols(source);
        assert_eq!(all[1].detail, "LED(x)");
        assert_eq!(all[4].detail, "ON = 2");
        assert_eq!(all[6].detail, "static uint32_t *next");
        assert_eq!(
            outline_label("main", "function", "int main(void)"),
            "main(void) : int"
        );
        assert_eq!(
            outline_label("count", "variable", "static uint32_t count"),
            "count : uint32_t"
        );
        assert_eq!(
            outline_label("buf", "variable", "char buf[8] [2]"),
            "buf[8][2] : char"
        );
        assert_eq!(
            pick_definitions(&["declaration", "function", "function", "macro"]),
            [1, 2]
        );
    }

    #[test]
    fn fields_of_a_struct() {
        let source = "typedef struct {\n  __IO uint32_t CR; /* c */\n  uint8_t *buf, len[2];\n  void (*cb)(int);\n  struct { int x; } in;\n  unsigned bits : 3;\n} Dev_t;\nDev_t dev;\nstruct { int raw; } reading = {0}, *last;\n";
        assert_eq!(
            struct_fields(source, "Dev_t"),
            [
                ("CR".to_string(), "uint32_t".to_string()),
                ("buf".into(), "uint8_t".into()),
                ("len".into(), "uint8_t".into()),
                ("cb".into(), "".into()),
                ("in".into(), "".into()),
                ("bits".into(), "unsigned".into())
            ]
        );
        assert_eq!(
            inline_struct_fields(source, "last"),
            [("raw".to_string(), "int".to_string())]
        );
        assert_eq!(declared_type(source, "dev"), "Dev_t");
        assert_eq!(declared_type("return x;", "x"), "");
        assert_eq!(
            access_chain("  hadc1 . Init[2]->"),
            Some(vec!["hadc1".to_string(), "Init".to_string()])
        );
        assert_eq!(access_chain("x + "), None);
    }
}
