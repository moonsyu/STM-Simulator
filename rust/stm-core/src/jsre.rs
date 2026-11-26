//! Regular expressions and text helpers that behave as the JavaScript this crate's code was moved from (feature 62).
//!
//! `regex-lite` is ASCII for `\w`, `\d` and `\b`, as a JavaScript expression without the `u` flag is. `\s` differs:
//! JavaScript's also matches the Unicode spaces and line separators, so `re` rewrites `\s` and `\S`.

use regex_lite::Regex;

/// The characters JavaScript's `\s` matches, as the inside of a character class.
const SPACE: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";

/// Whether `c` is white space to JavaScript (`\s`, `trim`).
pub fn is_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n'
            | '\u{B}'
            | '\u{C}'
            | '\r'
            | ' '
            | '\u{A0}'
            | '\u{1680}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    ) || ('\u{2000}'..='\u{200A}').contains(&c)
}
/// `[A-Za-z0-9_]` (JavaScript's `\w`).
pub fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
pub fn trim(text: &str) -> &str {
    text.trim_matches(is_space)
}
pub fn trim_start(text: &str) -> &str {
    text.trim_start_matches(is_space)
}
pub fn trim_end(text: &str) -> &str {
    text.trim_end_matches(is_space)
}
/// `text.split(/\r?\n/)`.
pub fn lines(text: &str) -> Vec<&str> {
    text.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}
/// The line ending a text uses: CRLF when it has one.
pub fn eol(text: &str) -> &'static str {
    if text.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

/// A JavaScript regular expression source as a `regex-lite` one: `\s` and `\S` become JavaScript's classes.
pub fn translate(pattern: &str) -> String {
    let mut out = String::with_capacity(pattern.len() + 16);
    let mut chars = pattern.chars().peekable();
    let mut in_class = false;
    while let Some(c) = chars.next() {
        match c {
            '\\' => match chars.next() {
                Some('s') if in_class => out.push_str(SPACE),
                Some('s') => {
                    out.push('[');
                    out.push_str(SPACE);
                    out.push(']');
                }
                Some('S') if !in_class => {
                    out.push_str("[^");
                    out.push_str(SPACE);
                    out.push(']');
                }
                // JavaScript escapes `/` in a literal; it is a plain character.
                Some('/') => out.push('/'),
                Some(other) => {
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            },
            '[' if !in_class => {
                in_class = true;
                out.push('[');
                if chars.peek() == Some(&'^') {
                    out.push(chars.next().unwrap());
                }
                // `[]…]` is an empty class in JavaScript; it is not used by the moved code.
            }
            ']' if in_class => {
                in_class = false;
                out.push(']');
            }
            // A `[` inside a class is a literal in JavaScript.
            '[' => out.push_str("\\["),
            other => out.push(other),
        }
    }
    out
}
/// Compiles a JavaScript regular expression source (see `translate`). Panics on a pattern that does not compile:
/// the patterns are fixed texts of this crate, covered by its tests.
pub fn re(pattern: &str) -> Regex {
    Regex::new(&translate(pattern)).unwrap_or_else(|e| panic!("regex {pattern}: {e}"))
}

/// A regular expression compiled the first time it is used: `js_re!(NAME, r"pattern")`.
#[macro_export]
macro_rules! js_re {
    ($name:ident, $pattern:expr) => {
        static $name: std::sync::LazyLock<regex_lite::Regex> =
            std::sync::LazyLock::new(|| $crate::jsre::re($pattern));
    };
}

/// The first `units` UTF-16 code units of `text` (`text.slice(0, units)` in JavaScript, for a position an editor
/// gives).
pub fn utf16_prefix(text: &str, units: usize) -> &str {
    let mut seen = 0;
    for (at, c) in text.char_indices() {
        if seen + c.len_utf16() > units {
            return &text[..at];
        }
        seen += c.len_utf16();
    }
    text
}

/// A text as JavaScript indexes it — by UTF-16 unit — with a stand-in of one byte per unit to search in.
///
/// The moved code works with offsets into a string (`m.index`, `slice`, a column for the editor). In the stand-in
/// (`proxy`) every unit is one ASCII byte, so a byte offset there is the JavaScript offset: an ASCII unit is itself,
/// a white-space unit that is not ASCII is a vertical tab (white space to `\s`, not a blank or a line break) and any
/// other unit is DEL (not a word character, not white space). What is read out comes from the real units (`slice`).
pub struct Text {
    units: Vec<u16>,
    proxy: String,
}
impl Text {
    pub fn new(text: &str) -> Self {
        Self::from_units(text.encode_utf16().collect())
    }
    fn from_units(units: Vec<u16>) -> Self {
        let proxy = units
            .iter()
            .map(|&u| match u {
                0..=0x7F => u as u8 as char,
                _ if char::from_u32(u32::from(u)).is_some_and(is_space) => '\u{B}',
                _ => '\u{7F}',
            })
            .collect();
        Text { units, proxy }
    }
    pub fn len(&self) -> usize {
        self.units.len()
    }
    pub fn is_empty(&self) -> bool {
        self.units.is_empty()
    }
    /// The stand-in: one ASCII byte per UTF-16 unit.
    pub fn proxy(&self) -> &str {
        &self.proxy
    }
    pub fn byte(&self, at: usize) -> u8 {
        self.proxy.as_bytes()[at]
    }
    /// The real text of units `from..to` (`text.slice(from, to)`).
    pub fn slice(&self, from: usize, to: usize) -> String {
        let to = to.min(self.units.len());
        if from >= to {
            return String::new();
        }
        String::from_utf16_lossy(&self.units[from..to])
    }
    /// The text with a space in place of every unit `hide` marks, line breaks kept (comments and literals blanked).
    pub fn masked(&self, hide: &[bool]) -> Text {
        Self::from_units(
            self.units
                .iter()
                .zip(hide)
                .map(|(&u, &h)| {
                    if h && u != u16::from(b'\n') {
                        u16::from(b' ')
                    } else {
                        u
                    }
                })
                .collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_by_utf16_unit() {
        let t = Text::new("a가😀\u{3000}b\n");
        assert_eq!(t.len(), 7);
        assert_eq!(t.proxy(), "a\u{7F}\u{7F}\u{7F}\u{B}b\n");
        assert_eq!(t.slice(1, 4), "가😀");
        let m = t.masked(&[false, true, true, true, false, false, true]);
        assert_eq!(m.slice(0, 7), "a   \u{3000}b\n");
    }

    #[test]
    fn spaces_as_in_javascript() {
        assert!(re(r"^\s+$").is_match("\u{A0}\t \u{FEFF}\u{3000}"));
        assert!(!re(r"^\s+$").is_match("\u{85}"));
        assert!(re(r"^[^\s;]+$").is_match("a,b"));
        assert!(!re(r"^[^\s;]+$").is_match("a\u{2003}b"));
        assert!(re(r"^\S+$").is_match("한글"));
        assert_eq!(trim("\u{FEFF} x \u{A0}"), "x");
        assert!(re(r"^\/[/*]").is_match("/* x"));
        assert!(re(r"(?:[=,(\[]|\breturn)\s*$").is_match("x = "));
        assert!(re(r"\bcase\b").is_match("case 1:") && !re(r"\bcase\b").is_match("uppercase1"));
    }

    #[test]
    fn lines_and_prefixes() {
        assert_eq!(lines("a\r\nb\n\nc"), ["a", "b", "", "c"]);
        assert_eq!(eol("a\r\nb"), "\r\n");
        assert_eq!(utf16_prefix("a😀b", 1), "a");
        assert_eq!(utf16_prefix("a😀b", 3), "a😀");
        assert_eq!(utf16_prefix("가나다", 2), "가나");
    }
}
