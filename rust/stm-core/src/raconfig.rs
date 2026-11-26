//! Renesas RA MCU profiles and the FPB-RA6E1 board's pin facts, shared by the project model, the code generator, the
//! build and the emulator. Sources: RA6E1 Group User's Manual: Hardware R01UH0930EJ0140 Rev.1.40 (Table 1.16 Pin
//! list, LQFP100) and FPB-RA6E1 v1 User's Manual R20UT4960EG0100 Rev.1.00 (Tables 5-9).
//!
//! Moved here from `src/ra-config.js` (feature 62). The comments on each table and check are in that file's history;
//! the ones that explain a decision are kept next to the code below.

use crate::js_re;
use crate::jsre::trim;
use crate::mcu::{js_display, js_number, number};
use crate::periph::js_truthy;
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

// ---------- values as JavaScript sees them ----------

/// A number JSON cannot carry (NaN, the infinities) and `undefined` as an argument travel as `{"\u{1}nf": "NaN"}`
/// (`src/rust-core.js` `exact`), so a setting that is not a number is refused with the same message as before.
pub const NF: &str = "\u{1}nf";
fn marker(v: &Value) -> Option<&str> {
    v.as_object()
        .filter(|o| o.len() == 1)
        .and_then(|o| o.get(NF))
        .and_then(Value::as_str)
}
/// `typeof v === 'number'`: the number.
pub(crate) fn num(v: &Value) -> Option<f64> {
    match marker(v) {
        Some("NaN") => Some(f64::NAN),
        Some("Infinity") => Some(f64::INFINITY),
        Some("-Infinity") => Some(f64::NEG_INFINITY),
        Some(_) => None,
        None => v.as_f64(),
    }
}
/// Whether JavaScript takes the value as true (a NaN or an `undefined` that came as a marker is not).
pub(crate) fn truthy(v: &Value) -> bool {
    match marker(v) {
        Some("Infinity" | "-Infinity") => true,
        Some(_) => false,
        None => js_truthy(v),
    }
}
/// The value as JSON would have carried it: without the properties that are `undefined`.
fn without_undefined(v: &Value) -> Value {
    match v {
        Value::Object(o) if marker(v).is_none() => Value::Object(
            o.iter()
                .filter(|(_, x)| marker(x) != Some("undefined"))
                .map(|(k, x)| (k.clone(), without_undefined(x)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(without_undefined).collect()),
        other => other.clone(),
    }
}
/// A number for the answer: one JSON cannot carry goes as the marker.
pub(crate) fn out(v: f64) -> Value {
    if v.is_nan() {
        json!({NF: "NaN"})
    } else if v.is_infinite() {
        json!({NF: if v > 0.0 { "Infinity" } else { "-Infinity" }})
    } else {
        number(v)
    }
}
/// An argument or a property that is there (`undefined` is not).
pub(crate) fn there(v: Option<&Value>) -> Option<&Value> {
    v.filter(|x| marker(x) != Some("undefined"))
}
/// `${v}`.
pub(crate) fn show(v: Option<&Value>) -> String {
    match there(v) {
        None => "undefined".into(),
        Some(x) => match num(x) {
            Some(n) => js_number(n),
            None => js_display(Some(x)),
        },
    }
}
/// A text as `Number(text)` reads it.
fn text_number(text: &str) -> f64 {
    let t = trim(text);
    if t.is_empty() {
        return 0.0;
    }
    let (sign, body) = match t.as_bytes()[0] {
        b'-' => (-1.0, &t[1..]),
        b'+' => (1.0, &t[1..]),
        _ => (1.0, t),
    };
    if body == "Infinity" {
        return sign * f64::INFINITY;
    }
    if sign == 1.0 && t.len() == body.len() {
        for (prefix, radix) in [
            ("0x", 16),
            ("0X", 16),
            ("0o", 8),
            ("0O", 8),
            ("0b", 2),
            ("0B", 2),
        ] {
            if let Some(digits) = body.strip_prefix(prefix) {
                return if digits.is_empty() {
                    f64::NAN
                } else {
                    u128::from_str_radix(digits, radix).map_or(f64::NAN, |n| n as f64)
                };
            }
        }
    }
    let bytes = body.as_bytes();
    let digits = |from: usize| {
        bytes[from..]
            .iter()
            .take_while(|b| b.is_ascii_digit())
            .count()
    };
    let whole = digits(0);
    let mut at = whole;
    let mut fraction = 0;
    if bytes.get(at) == Some(&b'.') {
        fraction = digits(at + 1);
        at += 1 + fraction;
    }
    if whole + fraction == 0 {
        return f64::NAN;
    }
    if matches!(bytes.get(at), Some(b'e' | b'E')) {
        let mut e = at + 1;
        if matches!(bytes.get(e), Some(b'+' | b'-')) {
            e += 1;
        }
        let n = digits(e);
        if n == 0 {
            return f64::NAN;
        }
        at = e + n;
    }
    if at != bytes.len() {
        return f64::NAN;
    }
    sign * body.parse::<f64>().unwrap_or(f64::NAN)
}
/// `Number(v)`: what arithmetic makes of a value.
pub(crate) fn to_num(v: Option<&Value>) -> f64 {
    match there(v) {
        None => f64::NAN,
        Some(x) => match x {
            Value::Null => 0.0,
            Value::Bool(b) => f64::from(u8::from(*b)),
            Value::String(s) => text_number(s),
            Value::Array(items) => match items.len() {
                0 => 0.0,
                1 => text_number(&js_display(Some(x))),
                _ => f64::NAN,
            },
            _ => num(x).unwrap_or(f64::NAN),
        },
    }
}
/// `Math.round`: halves go up.
pub(crate) fn js_round(v: f64) -> f64 {
    if v.fract() == -0.5 {
        v.ceil()
    } else {
        v.round()
    }
}
/// `+v.toFixed(3)` printed: three decimals, halves up, without trailing zeros.
pub(crate) fn fixed3(v: f64) -> String {
    js_number(to_fixed3(v).parse::<f64>().unwrap_or(f64::NAN))
}
/// `v.toFixed(3)`: three decimals, halves up.
pub(crate) fn to_fixed3(v: f64) -> String {
    if !v.is_finite() {
        return js_number(v);
    }
    // A double is exactly half-way between two thousandths only when it is an odd number of sixteenths.
    let sixteenths = v * 16.0;
    if sixteenths.fract() == 0.0 && (sixteenths.abs() % 2.0) == 1.0 {
        format!("{:.3}", ((v * 1000.0).floor() + 1.0) / 1000.0)
    } else {
        format!("{v:.3}")
    }
}
/// `Number.isInteger(v)`.
fn int(v: &Value) -> Option<f64> {
    v.as_f64().filter(|x| x.is_finite() && x.fract() == 0.0)
}
fn int_in(v: &Value, low: f64, high: f64) -> bool {
    int(v).is_some_and(|x| x >= low && x <= high)
}
/// `p[key] ?? default`.
pub(crate) fn or(p: &Value, key: &str, default: Value) -> Value {
    match p.get(key) {
        Some(v) if !v.is_null() => v.clone(),
        _ => default,
    }
}
fn is_one_of(v: &Value, list: &[&str]) -> bool {
    v.as_str().is_some_and(|s| list.contains(&s))
}
fn is_number_of(v: &Value, list: &[f64]) -> bool {
    v.as_f64().is_some_and(|x| list.contains(&x))
}
fn c_name(s: &str) -> bool {
    let b = s.as_bytes();
    !b.is_empty()
        && b.len() <= 41
        && (b[0].is_ascii_alphabetic() || b[0] == b'_')
        && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
}
/// `PREFIX` and one digit: the digit (`/^GPT(\d)$/`).
fn channel_of(id: &str, prefix: &str) -> Option<u32> {
    let rest = id.strip_prefix(prefix)?;
    (rest.len() == 1)
        .then(|| rest.chars().next().and_then(|c| c.to_digit(10)))
        .flatten()
}
/// `PREFIX` and digits (`/^TRANSFER\d+$/`): the digits.
fn digits_after<'a>(id: &'a str, prefix: &str) -> Option<&'a str> {
    id.strip_prefix(prefix)
        .filter(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_digit()))
}
const BROKEN: &str = "Cannot read properties of undefined";

// ---------- tables ----------

pub const FAMILY_ID: &str = "R7FA6E10F";
const PART: &str = "R7FA6E10F2CFP";
/// Ports of the LQFP100 package (76 I/O), in pin-list order of the port number.
pub const PORTS: [&str; 76] = [
    "P000", "P001", "P002", "P003", "P004", "P005", "P006", "P007", "P008", "P014", "P015", "P100",
    "P101", "P102", "P103", "P104", "P105", "P106", "P107", "P108", "P109", "P110", "P111", "P112",
    "P113", "P114", "P115", "P200", "P201", "P205", "P206", "P207", "P208", "P209", "P210", "P211",
    "P212", "P213", "P214", "P300", "P301", "P302", "P303", "P304", "P305", "P306", "P307", "P400",
    "P401", "P402", "P403", "P404", "P405", "P406", "P407", "P408", "P409", "P410", "P411", "P412",
    "P413", "P414", "P415", "P500", "P501", "P502", "P503", "P504", "P505", "P600", "P601", "P602",
    "P608", "P609", "P610", "P708",
];
/// External interrupt (ICU IRQn) of each pin (Table 1.16 "Ex. Interrupt"; -DS pins also wake deep standby).
pub const IRQ_PINS: [(&str, u32); 37] = [
    ("P000", 6),
    ("P001", 7),
    ("P002", 8),
    ("P004", 9),
    ("P005", 10),
    ("P006", 11),
    ("P008", 12),
    ("P015", 13),
    ("P100", 2),
    ("P101", 1),
    ("P104", 1),
    ("P105", 0),
    ("P110", 3),
    ("P111", 4),
    ("P205", 1),
    ("P206", 0),
    ("P212", 3),
    ("P213", 2),
    ("P301", 6),
    ("P302", 5),
    ("P304", 9),
    ("P305", 8),
    ("P400", 0),
    ("P401", 5),
    ("P402", 4),
    ("P403", 14),
    ("P404", 15),
    ("P408", 7),
    ("P409", 6),
    ("P410", 5),
    ("P411", 4),
    ("P414", 9),
    ("P415", 8),
    ("P501", 11),
    ("P502", 12),
    ("P505", 14),
    ("P708", 11),
];
/// The pins whose interrupt input is IRQn-DS (it also cancels Deep Software Standby); one per channel.
pub const IRQ_DS: [&str; 15] = [
    "P000", "P001", "P002", "P004", "P005", "P006", "P008", "P205", "P206", "P212", "P213", "P401",
    "P402", "P403", "P404",
];
/// Pins the board or the debugger uses: SWD (J-Link OB), the boot mode pin, NMI, and the crystal pins.
pub const RESERVED: [(&str, &str); 6] = [
    ("P300", "SWCLK (J-Link OB)"),
    ("P108", "SWDIO (J-Link OB)"),
    ("P201", "MD (부트 모드)"),
    ("P200", "NMI"),
    ("P212", "EXTAL (24 MHz 미장착)"),
    ("P213", "XTAL (24 MHz 미장착)"),
];
/// Peripheral pin functions (Table 1.16, LQFP100). SPI0's pins are not offered: they could not be checked against the
/// hardware manual.
pub const PERIPHERAL_PINS: [(&str, &[&str]); 33] = [
    ("SCI0_TXD", &["P101", "P411"]),
    ("SCI0_RXD", &["P100", "P410"]),
    ("SCI1_TXD", &["P213"]),
    ("SCI1_RXD", &["P212", "P708"]),
    ("SCI2_TXD", &["P302", "P112"]),
    ("SCI2_RXD", &["P301", "P113"]),
    ("SCI3_TXD", &["P409"]),
    ("SCI3_RXD", &["P408"]),
    ("SCI4_TXD", &["P207", "P205"]),
    ("SCI4_RXD", &["P206"]),
    ("SCI9_TXD", &["P109", "P602"]),
    ("SCI9_RXD", &["P110", "P601"]),
    ("SCI9_SCK", &["P111"]),
    ("SPI1_MISO", &["P100", "P410"]),
    ("SPI1_MOSI", &["P101", "P411"]),
    ("SPI1_RSPCK", &["P102", "P412"]),
    ("SPI1_SSL0", &["P103", "P413"]),
    ("GPT1_GTIOCA", &["P105", "P109", "P405"]),
    ("GPT1_GTIOCB", &["P104", "P110", "P406"]),
    ("GPT2_GTIOCA", &["P103", "P113"]),
    ("GPT2_GTIOCB", &["P102", "P114"]),
    ("GPT4_GTIOCA", &["P205", "P302", "P115"]),
    ("GPT4_GTIOCB", &["P301", "P608"]),
    ("GPT5_GTIOCA", &["P101", "P609"]),
    ("GPT5_GTIOCB", &["P100", "P610"]),
    ("GPT6_GTIOCA", &["P400", "P407", "P601"]),
    ("GPT6_GTIOCB", &["P401", "P408", "P600"]),
    ("GPT7_GTIOCA", &["P304"]),
    ("GPT7_GTIOCB", &["P303", "P602"]),
    ("IIC0_SCL", &["P400", "P408"]),
    ("IIC0_SDA", &["P401", "P407"]),
    ("IIC1_SCL", &["P205"]),
    ("IIC1_SDA", &["P206"]),
];
pub const SCI_CHANNELS: [u32; 6] = [0, 1, 2, 3, 4, 9];
pub const SPI_CHANNELS: [u32; 1] = [1];
pub const SCI_SPI_CHANNELS: [u32; 1] = [9];
/// ADC12 unit 0 analog inputs (Table 1.16 ADC12 column).
pub const ADC_CHANNELS: [(&str, u32); 11] = [
    ("P000", 0),
    ("P001", 1),
    ("P002", 2),
    ("P003", 3),
    ("P004", 4),
    ("P005", 5),
    ("P006", 6),
    ("P007", 7),
    ("P008", 8),
    ("P014", 12),
    ("P015", 13),
];
pub const GPT_CHANNELS: [u32; 6] = [1, 2, 4, 5, 6, 7];
pub const GPT_32BIT: [u32; 2] = [1, 2];
pub const IIC_CHANNELS: [u32; 2] = [0, 1];
pub const IIC_RATES: [(&str, f64); 3] = [
    ("STANDARD", 100_000.0),
    ("FAST", 400_000.0),
    ("FASTPLUS", 1_000_000.0),
];
pub const IIC_SLAVE_ADDRESS: u32 = 0x42;
pub const AGT_CHANNELS: [u32; 6] = [0, 1, 2, 3, 4, 5];
const LOCO_HZ: f64 = 32768.0;
pub const TIMER_UNITS: [&str; 5] = ["Hz", "kHz", "s", "ms", "us"];
/// TPCS: 1 … 64, 256, 1024 (7 and 9 are not valid on the RA6E1).
const GPT_DIVIDERS: [u32; 9] = [0, 1, 2, 3, 4, 5, 6, 8, 10];
/// Maximum frequency of each RA6E1 internal clock in MHz.
pub const CLOCK_LIMITS: [(&str, f64); 6] = [
    ("iclk", 200.0),
    ("pclka", 100.0),
    ("pclkb", 50.0),
    ("pclkc", 50.0),
    ("pclkd", 100.0),
    ("fclk", 50.0),
];
/// FPB-RA6E1 default (no main crystal): HOCO 20 MHz / 2 x 20 = PLL 200 MHz; ICLK 200, PCLKA 100, PCLKB 50, PCLKC 50
/// (ADC), PCLKD 100 (GPT), FCLK 50 MHz.
const CLOCK_DEFAULT: [(&str, f64); 10] = [
    ("xtalHz", 24_000_000.0),
    ("hocoMHz", 20.0),
    ("pllDiv", 2.0),
    ("pllMul", 20.0),
    ("iclkDiv", 1.0),
    ("pclkaDiv", 2.0),
    ("pclkbDiv", 4.0),
    ("pclkcDiv", 4.0),
    ("pclkdDiv", 2.0),
    ("fclkDiv", 4.0),
];
const PIN_FUNCTIONS: [&str; 5] = ["GPIO_Output", "GPIO_Input", "IRQ", "Analog", "Peripheral"];
/// Watchdog timeouts, dividers and defaults (timeout, clock divider): WDT, IWDT.
pub(crate) fn wdt_info(id: &str) -> Option<([f64; 4], [f64; 6], f64, f64)> {
    match id {
        "WDT" => Some((
            [1024.0, 4096.0, 8192.0, 16384.0],
            [4.0, 64.0, 128.0, 512.0, 2048.0, 8192.0],
            16384.0,
            8192.0,
        )),
        "IWDT" => Some((
            [128.0, 512.0, 1024.0, 2048.0],
            [1.0, 16.0, 32.0, 64.0, 128.0, 256.0],
            2048.0,
            256.0,
        )),
        _ => None,
    }
}
const WDT_WINDOW_START: [f64; 4] = [100.0, 75.0, 50.0, 25.0];
const WDT_WINDOW_END: [f64; 4] = [0.0, 25.0, 50.0, 75.0];
pub const IWDT_HZ: f64 = 15000.0;
const WDT_DIVISION_CODE: [(&str, i32); 10] = [
    ("1", 0),
    ("4", 1),
    ("16", 2),
    ("32", 3),
    ("64", 4),
    ("128", 15),
    ("256", 5),
    ("512", 6),
    ("2048", 7),
    ("8192", 8),
];
const WDT_START_CODE: [(&str, i32); 4] = [("25", 0), ("50", 1), ("75", 2), ("100", 3)];
const WDT_END_CODE: [(&str, i32); 4] = [("75", 0), ("50", 1), ("25", 2), ("0", 3)];
const CAN_BITRATES: [f64; 4] = [125.0, 250.0, 500.0, 1000.0];
const LPM_MODES: [&str; 3] = ["SLEEP", "STANDBY", "DEEP"];
const LPM_POWER: [(&str, u32); 3] = [("DEEPCUT0", 0), ("DEEPCUT1", 1), ("DEEPCUT3", 3)];
const CANCEL_IRQS: [u32; 13] = [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15];
static LPM_WAKE_BITS: LazyLock<Vec<(String, u32)>> = LazyLock::new(|| {
    let mut v: Vec<(String, u32)> = (0..16).map(|n| (format!("IRQ{n}"), n)).collect();
    for (k, b) in [
        ("IWDT", 16),
        ("LVD1", 18),
        ("LVD2", 19),
        ("RTCALM", 24),
        ("RTCPRD", 25),
        ("USBFS", 27),
        ("AGT1UD", 28),
        ("AGT1CA", 29),
        ("AGT1CB", 30),
        ("IIC0", 31),
        ("AGT3UD", 32),
        ("AGT3CA", 33),
        ("AGT3CB", 34),
    ] {
        v.push((k.into(), b));
    }
    v
});
static LPM_CANCEL_BITS: LazyLock<Vec<(String, u32)>> = LazyLock::new(|| {
    let mut v: Vec<(String, u32)> = CANCEL_IRQS
        .iter()
        .map(|n| (format!("IRQ{n}"), *n))
        .collect();
    for (k, b) in [
        ("LVD1", 16),
        ("LVD2", 17),
        ("RTC_INTERVAL", 18),
        ("RTC_ALARM", 19),
        ("NMI", 20),
        ("USBFS", 24),
        ("AGT1", 26),
        ("AGT3", 27),
    ] {
        v.push((k.into(), b));
    }
    v
});
/// The sources the settings offer (the ones the simulator models), in bit order.
static LPM_WAKE: LazyLock<Vec<String>> = LazyLock::new(|| {
    (0..16)
        .map(|n| format!("IRQ{n}"))
        .chain(["IWDT", "RTCALM", "RTCPRD", "AGT1UD", "AGT3UD"].map(String::from))
        .collect()
});
static LPM_CANCEL: LazyLock<Vec<String>> = LazyLock::new(|| {
    CANCEL_IRQS
        .iter()
        .map(|n| format!("IRQ{n}"))
        .chain(["RTC_INTERVAL", "RTC_ALARM", "AGT1", "AGT3"].map(String::from))
        .collect()
});
/// The events the settings offer: the ones the simulator's peripherals raise (bsp_elc.h of the RA6E1, FSP 6.6). An
/// event name is the ELC_EVENT_ constant without its prefix.
static ELC_EVENTS: LazyLock<Vec<(String, u32)>> = LazyLock::new(|| {
    let mut v: Vec<(String, u32)> = (0..16).map(|n| (format!("ICU_IRQ{n}"), 1 + n)).collect();
    v.extend((0..8).map(|n| (format!("DMAC{n}_INT"), 0x20 + n)));
    v.push(("DTC_COMPLETE".into(), 0x29));
    v.extend((0..6).map(|n| (format!("AGT{n}_INT"), 0x40 + 3 * n)));
    v.push(("ELC_SOFTWARE_EVENT_0".into(), 0xb5));
    v.push(("ELC_SOFTWARE_EVENT_1".into(), 0xb6));
    v.extend(
        [
            (1, 0xcf),
            (2, 0xd8),
            (4, 0xea),
            (5, 0xf3),
            (6, 0xfc),
            (7, 0x105),
        ]
        .map(|(ch, e)| (format!("GPT{ch}_COUNTER_OVERFLOW"), e)),
    );
    v.push(("ADC0_SCAN_END".into(), 0x160));
    for (ch, e) in [
        (0, 0x180),
        (1, 0x186),
        (2, 0x18c),
        (3, 0x192),
        (4, 0x198),
        (9, 0x1b6),
    ] {
        for (i, k) in ["RXI", "TXI", "TEI", "ERI"].iter().enumerate() {
            v.push((format!("SCI{ch}_{k}"), e + i as u32));
        }
    }
    v
});
fn elc_event(name: &str) -> Option<u32> {
    ELC_EVENTS.iter().find(|(k, _)| k == name).map(|(_, v)| *v)
}
/// ELSRn of the RA6E1 (bsp_elc.h elc_peripheral_t). The simulator links ADC0; the others are kept as written.
pub const ELC_PERIPHERALS: [(&str, u32); 15] = [
    ("GPT_A", 0),
    ("GPT_B", 1),
    ("GPT_C", 2),
    ("GPT_D", 3),
    ("GPT_E", 4),
    ("GPT_F", 5),
    ("GPT_G", 6),
    ("GPT_H", 7),
    ("ADC0", 8),
    ("ADC0_B", 9),
    ("DAC0", 12),
    ("IOPORT1", 14),
    ("IOPORT2", 15),
    ("IOPORT3", 16),
    ("IOPORT4", 17),
];
const ADC_TRIGGERS: [&str; 2] = ["SOFTWARE", "ELC"];
const TRANSFER_MODES: [&str; 3] = ["NORMAL", "REPEAT", "BLOCK"];
const TRANSFER_ADDR_MODES: [&str; 3] = ["FIXED", "INCREMENTED", "DECREMENTED"];

pub(crate) fn rtc_defaults() -> Value {
    json!({"clockSource": "LOCO", "start": "HOST_TIME", "freqCompare": 255, "callback": "rtc_callback", "alarmPriority": 12, "periodicPriority": 12, "carryPriority": 12})
}
pub(crate) fn flash_defaults() -> Value {
    json!({"bgo": false, "callback": "", "readyPriority": 12, "errorPriority": 12})
}
pub(crate) fn usb_defaults() -> Value {
    json!({"callback": "", "priority": 12, "resumePriority": 12})
}
pub(crate) fn can_defaults() -> Value {
    json!({"bitrate": 500, "idMode": "STANDARD", "mailboxes": [{"type": "TRANSMIT", "id": 0}, {"type": "RECEIVE", "id": 0x100}, {"type": "RECEIVE", "id": 0x101}, {"type": "RECEIVE", "id": 0x102}],
        "mask": 0x7FF, "priority": 12, "callback": "can_callback"})
}
pub(crate) fn lpm_defaults() -> Value {
    json!({"mode": "SLEEP", "wake": [], "ioKeep": true, "power": "DEEPCUT0", "cancel": [], "cancelRising": []})
}
pub(crate) fn transfer_defaults() -> Value {
    json!({"driver": "DTC", "channel": 0, "activation": "ADC0_SCAN_END", "mode": "NORMAL", "size": 2, "srcMode": "FIXED", "destMode": "INCREMENTED", "repeatArea": "DESTINATION", "irq": "END",
        "length": 1, "blocks": 0, "callback": "", "priority": 12})
}
fn pairs<T: Copy + Into<Value>>(list: &[(&str, T)]) -> Value {
    Value::Object(
        list.iter()
            .map(|(k, v)| ((*k).to_string(), (*v).into()))
            .collect(),
    )
}
fn named(list: &[(String, u32)]) -> Value {
    Value::Object(list.iter().map(|(k, v)| (k.clone(), json!(v))).collect())
}
/// Every table of the module, by the name `src/ra-config.js` exports it under.
pub fn tables() -> Value {
    let clock: Value = Value::Object(
        CLOCK_DEFAULT
            .iter()
            .map(|(k, v)| ((*k).to_string(), number(*v)))
            .collect(),
    );
    let numbers = |list: &[(&str, f64)]| {
        Value::Object(
            list.iter()
                .map(|(k, v)| ((*k).to_string(), number(*v)))
                .collect(),
        )
    };
    let wdt = |id: &str| {
        let (timeouts, dividers, timeout, divider) = wdt_info(id).unwrap();
        json!({"timeouts": timeouts.map(number), "dividers": dividers.map(number), "defaults": {"timeout": number(timeout), "clockDiv": number(divider)}})
    };
    json!({
        "RA_FAMILY_ID": FAMILY_ID,
        "RA6E1_PORTS": PORTS.as_slice(),
        "RA_IRQ_PINS": pairs(&IRQ_PINS),
        "RA_IRQ_DS": IRQ_DS,
        "RA_BSP_DEFAULTS": {"stackBytes": 0x400, "heapBytes": 0x400},
        "RA_RESERVED": pairs(&RESERVED),
        "RA_FAMILIES": {FAMILY_ID: {"id": FAMILY_ID, "vendor": "renesas", "series": 6, "group": "RA6E1", "part": PART, "core": "Cortex-M33", "fpu": true, "flashKB": 1024, "ramKB": 256,
            "dataFlashKB": 8, "package": "LQFP", "pins": 100, "featureSet": "F", "ielsr": 96, "ports": PORTS.as_slice(), "clock": clock,
            "cpu": ["-mcpu=cortex-m33", "-mthumb", "-mfpu=fpv5-sp-d16", "-mfloat-abi=hard"]}},
        "FPB_RA6E1": {"leds": {"LED1": "P408", "LED2": "P407"}, "userSwitch": "P205",
            "arduino": {"A0": "P000", "A1": "P001", "A2": "P002", "A3": "P003", "A4": "P004", "A5": "P008", "D0": "P110", "D1": "P109", "D2": "P409", "D3": "P104", "D4": "P107", "D5": "P105",
                "D6": "P303", "D7": "P113", "D8": "P402", "D9": "P302", "D10": "P103", "D11": "P101", "D12": "P100", "D13": "P102", "SDA": "P401", "SCL": "P400"},
            "pullups": {"P400": 2200, "P401": 2200}},
        "RA_CLOCK_LIMITS": numbers(&CLOCK_LIMITS),
        "RA_PERIPHERAL_PINS": Value::Object(PERIPHERAL_PINS.iter().map(|(k, v)| ((*k).to_string(), json!(v))).collect()),
        "RA_SCI_CHANNELS": SCI_CHANNELS,
        "RA_SPI_CHANNELS": SPI_CHANNELS,
        "RA_SCI_SPI_CHANNELS": SCI_SPI_CHANNELS,
        "RA_ADC_CHANNELS": pairs(&ADC_CHANNELS),
        "RA_GPT_CHANNELS": GPT_CHANNELS,
        "RA_IIC_CHANNELS": IIC_CHANNELS,
        "RA_IIC_RATES": numbers(&IIC_RATES),
        "RA_IIC_SLAVE_ADDRESS": IIC_SLAVE_ADDRESS,
        "RA_AGT_CHANNELS": AGT_CHANNELS,
        "RA_GPT_32BIT": GPT_32BIT,
        "RA_TIMER_UNITS": TIMER_UNITS,
        "RA_WDT": {"WDT": wdt("WDT"), "IWDT": wdt("IWDT")},
        "RA_WDT_WINDOW_START": WDT_WINDOW_START.map(number),
        "RA_WDT_WINDOW_END": WDT_WINDOW_END.map(number),
        "RA_IWDT_HZ": number(IWDT_HZ),
        "WDT_DIVISION_CODE": pairs(&WDT_DIVISION_CODE),
        "WDT_TIMEOUT_ENUM": {"128": 0, "512": 1, "1024": 2, "2048": 3, "4096": 4, "8192": 5, "16384": 6},
        "RA_RTC_DEFAULTS": rtc_defaults(),
        "RA_FLASH_DEFAULTS": flash_defaults(),
        "RA_USB_DEFAULTS": usb_defaults(),
        "RA_CAN_BITRATES": CAN_BITRATES.map(number),
        "RA_CAN_DEFAULTS": can_defaults(),
        "RA_LPM_MODES": LPM_MODES,
        "RA_LPM_MODE_NAMES": {"SLEEP": "Sleep", "STANDBY": "Software Standby", "DEEP": "Deep Software Standby"},
        "RA_LPM_WUPEN_MASK": 0x7_fb0d_ffff_u64,
        "RA_LPM_DPSIER_MASK": 0x0d1f_dff3_u32,
        "RA_LPM_DPSIEGR_MASK": 0x0013_dff3_u32,
        "RA_LPM_WAKE_BITS": named(&LPM_WAKE_BITS),
        "RA_LPM_CANCEL_BITS": named(&LPM_CANCEL_BITS),
        "RA_LPM_WAKE": LPM_WAKE.as_slice(),
        "RA_LPM_CANCEL": LPM_CANCEL.as_slice(),
        "RA_LPM_POWER": pairs(&LPM_POWER),
        "RA_LPM_DEFAULTS": lpm_defaults(),
        "RA_ELC_EVENTS": named(&ELC_EVENTS),
        "RA_ELC_PERIPHERALS": pairs(&ELC_PERIPHERALS),
        "RA_ADC_TRIGGERS": ADC_TRIGGERS,
        "RA_DMAC_CHANNELS": [0, 1, 2, 3, 4, 5, 6, 7],
        "RA_TRANSFER_MODES": TRANSFER_MODES,
        "RA_TRANSFER_ADDR_MODES": TRANSFER_ADDR_MODES,
        "RA_TRANSFER_DEFAULTS": transfer_defaults(),
        "RA_ADC_ELC_EVENTS": adc_elc_events(),
        "RA_PSEL_NAMES": {"3": "IOPORT_PERIPHERAL_GPT1", "4": "IOPORT_PERIPHERAL_SCI0_2_4_6_8", "5": "IOPORT_PERIPHERAL_SCI1_3_5_7_9", "6": "IOPORT_PERIPHERAL_SPI", "7": "IOPORT_PERIPHERAL_IIC"},
    })
}
/// The events the ADC0 ELC start trigger offers: not its own scan end, not DTC_COMPLETE (neither engine raises it).
fn adc_elc_events() -> Vec<&'static str> {
    ELC_EVENTS
        .iter()
        .map(|(k, _)| k.as_str())
        .filter(|k| *k != "ADC0_SCAN_END" && *k != "DTC_COMPLETE")
        .collect()
}

// ---------- names ----------

pub(crate) fn irq_of(pin: &str) -> Option<u32> {
    IRQ_PINS.iter().find(|(p, _)| *p == pin).map(|(_, n)| *n)
}
/// The RASC name of a pin's interrupt function: "IRQ1-DS", "IRQ6", or "" for a pin without one.
pub fn irq_name(pin: &str) -> String {
    match irq_of(pin) {
        None => String::new(),
        Some(n) => format!("IRQ{n}{}", if IRQ_DS.contains(&pin) { "-DS" } else { "" }),
    }
}
pub(crate) fn family_check(family: Option<&Value>) -> Result<(), String> {
    if family.and_then(Value::as_str) == Some(FAMILY_ID) {
        Ok(())
    } else {
        Err(format!("{}: 지원하지 않는 RA MCU입니다.", show(family)))
    }
}
/// "P408", "p408" or "BSP_IO_PORT_04_PIN_08" → "P408".
pub fn pin_name(pin: Option<&Value>) -> String {
    let shown = match there(pin) {
        Some(v) if marker(v).map_or_else(|| truthy(v), |m| m != "NaN") => show(Some(v)),
        _ => String::new(),
    };
    let text = trim(&shown);
    let two = |s: &str| s.len() == 2 && s.bytes().all(|b| b.is_ascii_digit());
    if let Some((port, bit)) = text
        .strip_prefix("BSP_IO_PORT_")
        .and_then(|rest| rest.split_once("_PIN_"))
    {
        if two(port) && two(bit) {
            return format!("P{}{bit}", port.parse::<u32>().unwrap_or(0));
        }
    }
    if let Some(digits) = text.strip_prefix(['P', 'p']) {
        if (digits.len() == 3 || digits.len() == 4) && digits.bytes().all(|b| b.is_ascii_digit()) {
            return format!("P{digits}");
        }
    }
    text.to_string()
}
/// Port and bit of a pin: P408 → (4, 8).
pub fn port_bit(pin: Option<&Value>) -> Result<(u32, u32), String> {
    let name = pin_name(pin);
    let digits = name
        .strip_prefix('P')
        .filter(|d| (d.len() == 3 || d.len() == 4) && d.bytes().all(|b| b.is_ascii_digit()));
    match digits {
        Some(d) => Ok((
            d[..d.len() - 2].parse().unwrap_or(0),
            d[d.len() - 2..].parse().unwrap_or(0),
        )),
        None => Err(format!("RA 핀 이름이 올바르지 않습니다: {}", show(pin))),
    }
}

// A pin's symbolic name becomes "#define NAME (BSP_IO_PORT_…)" in bsp_pin_cfg.h and a callback name becomes a
// function the generated code declares, so a name the compiler or the generated code already uses breaks the build
// far from where it was typed (LED "int": every int in the project turns into a pin). Those are refused with the
// reason.
const C_WORDS: &str = "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL size_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t main hal_entry errno printf sprintf snprintf puts putchar malloc free memcpy memset strlen abs";
// The API objects the FSP 6.6 headers declare (extern const <api>_api_t g_<api>_on_<module>); other names of that
// shape (g_button_on_press) are the user's.
const FSP_API_OBJECTS: [&str; 20] = [
    "g_adc_on_adc",
    "g_can_on_can",
    "g_elc_on_elc",
    "g_external_irq_on_icu",
    "g_flash_on_flash_hp",
    "g_i2c_master_on_iic",
    "g_i2c_slave_on_iic",
    "g_ioport_on_ioport",
    "g_lpm_on_lpm",
    "g_rtc_on_rtc",
    "g_spi_on_sci",
    "g_spi_on_spi",
    "g_timer_on_agt",
    "g_timer_on_gpt",
    "g_transfer_on_dmac",
    "g_transfer_on_dtc",
    "g_uart_on_sci",
    "g_usb_on_usb",
    "g_wdt_on_iwdt",
    "g_wdt_on_wdt",
];
js_re!(FSP_PREFIX, r"^(R_|BSP_|FSP_|IOPORT_|ELC_|ICU_|__)");
js_re!(
    INSTANCE,
    r"^g_(ioport|external_irq\d+|uart\d+|timer\d+|agt\d+|adc\d+|i2c_master\d+|i2c_slave\d+|spi\d+|sci_spi\d+|wdt\d+|iwdt\d+|rtc\d+|lpm\d+|flash\d+|transfer\d+|basic\d+|elc|bsp_pin_cfg)(_ctrl|_cfg|_extend|_cfg_extend|_ext_cfg|_channel_cfg|_err_cfg|_info)?$"
);
js_re!(
    CAN_INSTANCE,
    r"^g_can\d+(_ctrl|_cfg|_extended_cfg|_bit_timing_cfg|_mailbox|_mailbox_mask)?$"
);
js_re!(
    ISR,
    r"^((sci_uart|sci_spi|spi|iic_master|iic_slave)_(rxi|txi|tei|eri)|r_icu|adc_scan_end|agt_int|gpt_counter_overflow|rtc_alarm_periodic|rtc_carry|fcu_frdyi|fcu_fiferr|dmac_int)_isr$"
);
js_re!(USB_ISR, r"^usbfs_(interrupt|resume|d0fifo|d1fifo)_handler$");
js_re!(CAN_ISR, r"^can_(error|rx|tx)_isr$");
/// Why a name cannot be a pin symbol or a callback of an FSP project, or "" when it can.
pub fn name_problem(value: Option<&Value>) -> String {
    let name = show(value);
    let name = name.as_str();
    let text = there(value).and_then(Value::as_str);
    if text.is_some_and(|t| C_WORDS.split(' ').any(|w| w == t)) {
        return format!("{name}은(는) C나 생성 코드가 쓰는 이름입니다");
    }
    let b = name.as_bytes();
    if FSP_PREFIX.is_match(name) || (b.len() >= 2 && b[0] == b'_' && b[1].is_ascii_uppercase()) {
        return format!("{name}: R_ · BSP_ · FSP_ · IOPORT_ 로 시작하는 이름과 __ 로 시작하는 이름은 FSP와 컴파일러가 씁니다");
    }
    if INSTANCE.is_match(name) || CAN_INSTANCE.is_match(name) {
        return format!("{name}은(는) 생성 코드의 인스턴스 이름입니다");
    }
    // The interrupt service routines vector_data.h names (FSP drivers define them) and the drivers' API objects.
    if ISR.is_match(name) || USB_ISR.is_match(name) || CAN_ISR.is_match(name) {
        return format!("{name}은(는) FSP 드라이버의 인터럽트 처리 함수(ISR) 이름입니다");
    }
    if text.is_some_and(|t| FSP_API_OBJECTS.contains(&t)) {
        return format!("{name}은(는) FSP 드라이버의 API 객체 이름(g_…_on_…)입니다");
    }
    String::new()
}
fn check_name(place: &str, name: &Value) -> Result<(), String> {
    let problem = name_problem(Some(name));
    if problem.is_empty() {
        Ok(())
    } else {
        Err(format!("{place}: {problem}. 다른 이름을 쓰세요."))
    }
}
/// The argument type of a callback by where it is set: an IRQ pin, or a peripheral (an SCI channel is a UART or, in
/// simple SPI mode, an SPI master; GPT and AGT are both timers).
fn callback_arg_type(place: &str, p: Option<&Value>) -> String {
    let mode = |m: &str| p.and_then(|p| p.get("mode")).and_then(Value::as_str) == Some(m);
    let b = place.as_bytes();
    let name = if place.starts_with("TRANSFER") {
        "dmac_callback_args_t"
    } else if b.len() >= 2 && b[0] == b'P' && b[1].is_ascii_digit() {
        "external_irq_callback_args_t"
    } else if place.starts_with("SCI") {
        if mode("SPI") {
            "spi_callback_args_t"
        } else {
            "uart_callback_args_t"
        }
    } else if place.starts_with("SPI") {
        "spi_callback_args_t"
    } else if place.starts_with("GPT") || place.starts_with("AGT") {
        "timer_callback_args_t"
    } else if place.starts_with("ADC") {
        "adc_callback_args_t"
    } else if place.starts_with("IIC") {
        if mode("SLAVE") {
            "i2c_slave_callback_args_t"
        } else {
            "i2c_master_callback_args_t"
        }
    } else {
        match place {
            "WDT" | "IWDT" => "wdt_callback_args_t",
            "RTC" => "rtc_callback_args_t",
            "FLASH" => "flash_callback_args_t",
            "USB" => "usb_callback_args_t",
            "CAN0" => "can_callback_args_t",
            other => other,
        }
    };
    name.to_string()
}
/// The SCI channels running as UARTs (r_sci_uart), which the serial monitor can reach: not one in simple SPI mode.
pub fn uart_channels(mcu: &Value) -> Vec<String> {
    let Some(per) = mcu.get("peripherals").and_then(Value::as_object) else {
        return Vec::new();
    };
    per.iter()
        .filter(|(id, p)| {
            channel_of(id, "SCI").is_some()
                && p.get("enabled").is_some_and(truthy)
                && p.get("mode") != Some(&json!("SPI"))
        })
        .map(|(id, _)| id.clone())
        .collect()
}

// ---------- rates and counts ----------

fn pow2(n: u32) -> f64 {
    (1u64 << n) as f64
}
/// A clock of an RA MCU configuration in Hz: the family's default clock with the configuration's own values.
fn clock_hz_of(clock: Option<&Value>, key: &str) -> f64 {
    let own = clock.and_then(Value::as_object);
    let field = |name: &str| -> f64 {
        match own.and_then(|o| o.get(name)) {
            Some(v) => to_num(Some(v)),
            None => CLOCK_DEFAULT
                .iter()
                .find(|(k, _)| *k == name)
                .map_or(f64::NAN, |(_, v)| *v),
        }
    };
    field("hocoMHz") * 1e6 / field("pllDiv") * field("pllMul") / field(&format!("{key}Div"))
}
pub fn clock_hz(mcu: &Value, key: Option<&Value>) -> Result<f64, String> {
    family_check(mcu.get("family"))?;
    let key = match there(key) {
        None => "pclkd".to_string(),
        Some(k) => show(Some(k)),
    };
    Ok(clock_hz_of(mcu.get("clock").filter(|c| truthy(c)), &key))
}
/// RSPI bit-rate settings (SPBR, SPCMD0.BRDV) for `rate` from PCLKA, as R_SPI_CalculateBitrate and RASC compute
/// them: the smallest divider PCLKA / (2 x (SPBR + 1) x 2^BRDV) not faster than the rate.
pub fn spi_bitrate(pclka: f64, rate: f64, shown_rate: &str) -> Result<Value, String> {
    let divider = (pclka / rate).ceil();
    if rate.is_nan() || rate <= 0.0 || divider > 4096.0 {
        return Err(format!(
            "SPI {shown_rate} bps: PCLKA {} MHz로 만들 수 없는 속도입니다(최저 {} bps).",
            js_number(pclka / 1e6),
            js_number((pclka / 4096.0).ceil())
        ));
    }
    if divider < 2.0 {
        return Ok(json!({"spbr": 0, "brdv": 0, "actual": out(pclka / 2.0)}));
    }
    let mut brdv = 0u32;
    while brdv < 3 && divider > f64::from(512u32 << brdv) {
        brdv += 1;
    }
    let step = 2.0 * pow2(brdv);
    let spbr = (divider / step).ceil() - 1.0;
    Ok(json!({"spbr": out(spbr), "brdv": brdv, "actual": out(pclka / (step * (spbr + 1.0)))}))
}
/// SCI simple SPI (clock synchronous) bit-rate settings, as R_SCI_SPI_CalculateBitrate computes them without MDDR:
/// PCLKA / (4 x 4^CKS x (BRR + 1)), the largest rate not above `rate`.
pub fn sci_spi_bitrate(pclka: f64, rate: f64, shown_rate: &str) -> Result<Value, String> {
    if rate.is_nan() || rate <= 0.0 || rate < (pclka / 65536.0).ceil() {
        return Err(format!(
            "Simple SPI {shown_rate} bps: PCLKA {} MHz로 만들 수 없는 속도입니다(최저 {} bps).",
            js_number(pclka / 1e6),
            js_number((pclka / 65536.0).ceil())
        ));
    }
    let (mut cks, mut brr) = (0u32, 0.0);
    while cks < 4 {
        brr = (pclka / (pow2(2 * (cks + 1)) * rate)).ceil() - 1.0;
        if brr <= 255.0 {
            break;
        }
        cks += 1;
    }
    Ok(
        json!({"cks": cks, "brr": out(brr), "actual": out(pclka / (pow2(2 * (cks + 1)) * (brr + 1.0)))}),
    )
}
/// (cks, brh, brl, actual, duty) of the RIIC bit rate: 50 % duty with 120 ns rise and fall, as RASC computes them.
fn iic_clock_parts(pclkb: f64, rate: Option<&Value>) -> Result<(u32, f64, f64, f64, f64), String> {
    let table = rate
        .and_then(Value::as_str)
        .and_then(|r| IIC_RATES.iter().find(|(k, _)| *k == r))
        .map(|(_, hz)| *hz);
    let hz = table.unwrap_or_else(|| to_num(rate));
    for cks in 0..8u32 {
        let reference = pclkb / pow2(cks);
        let counts = js_round((1.0 / hz - 240e-9) * reference) - 2.0;
        if (2.0..=62.0).contains(&counts) {
            let brl = (counts / 2.0).ceil();
            let brh = counts - brl;
            return Ok((
                cks,
                brh,
                brl,
                1.0 / ((brh + brl + 2.0) / reference + 240e-9),
                (brh + 1.0) / (brh + brl + 2.0) * 100.0,
            ));
        }
    }
    let shown = match table {
        Some(hz) => js_number(hz),
        None => show(rate),
    };
    Err(format!(
        "I²C {shown} Hz: PCLKB {} MHz로 만들 수 없는 속도입니다.",
        js_number(pclkb / 1e6)
    ))
}
pub fn iic_clock(pclkb: f64, rate: Option<&Value>) -> Result<Value, String> {
    let (cks, brh, brl, actual, duty) = iic_clock_parts(pclkb, rate)?;
    Ok(
        json!({"cks": cks, "brh": out(brh), "brl": out(brl), "actual": out(actual), "duty": out(duty)}),
    )
}
/// r_iic_slave clock settings: the master drives SCL, so the slave uses only the reference clock and the low width —
/// the same CKS and ICBRL as the master at that rate, and no noise filter stages.
pub fn iic_slave_clock(pclkb: f64, rate: Option<&Value>) -> Result<Value, String> {
    let (cks, _, brl, _, _) = iic_clock_parts(pclkb, rate)?;
    Ok(json!({"cks": cks, "brl": out(brl), "filter": 0}))
}
/// Seconds of a period in a unit (`{Hz: 1/period, …}[unit]`); a unit that is not one gives NaN.
fn seconds_of(period: f64, unit: &str) -> f64 {
    match unit {
        "Hz" => 1.0 / period,
        "kHz" => 1.0 / (period * 1e3),
        "s" => period,
        "ms" => period / 1e3,
        "us" => period / 1e6,
        _ => f64::NAN,
    }
}
/// AGT count source, divider and period counts for a period, PCLKB first, then LOCO (as RASC offers them).
pub fn agt_counts(pclkb: f64, channel: &str, period: f64, unit: &str) -> Result<Value, String> {
    let seconds = seconds_of(period, unit);
    let mut options: Vec<(&str, f64, u32)> = vec![
        ("PCLKB", pclkb, 0),
        ("PCLKB", pclkb / 2.0, 1),
        ("PCLKB", pclkb / 8.0, 3),
    ];
    options.extend((0..8u32).map(|d| ("LOCO", LOCO_HZ / pow2(d), d)));
    for (source, hz, div) in options {
        let counts = js_round(seconds * hz);
        if counts.is_finite() && (2.0..=65536.0).contains(&counts) {
            return Ok(
                json!({"source": source, "div": div, "counts": out(counts), "hz": out(hz / counts)}),
            );
        }
    }
    Err(format!("AGT{channel}: 주기는 PCLKB 2카운트 이상, LOCO/128로 65536카운트(약 256초) 이하로 정하세요."))
}
/// GPT period/duty in counts with the smallest clock divider that fits, as RASC computes it.
pub fn gpt_counts(
    pclkd: f64,
    channel: &str,
    wide: bool,
    period: f64,
    unit: &str,
    duty: f64,
) -> Result<Value, String> {
    let raw = pclkd * seconds_of(period, unit);
    let max = if wide { 4_294_967_296.0 } else { 65536.0 };
    if !raw.is_finite() || raw < 2.0 {
        return Err(format!(
            "GPT{channel}: 주기가 너무 짧습니다(PCLKD {} MHz).",
            js_number(pclkd / 1e6)
        ));
    }
    for div in GPT_DIVIDERS {
        let counts = js_round(raw / pow2(div));
        if counts <= max {
            return Ok(
                json!({"div": div, "counts": out(counts), "duty": out(js_round(counts * duty / 100.0)), "hz": out(pclkd / pow2(div) / counts)}),
            );
        }
    }
    Err(format!(
        "GPT{channel}: 주기가 너무 깁니다({}비트, 최대 분주 1024).",
        if wide { 32 } else { 16 }
    ))
}
/// The CAN bit timing (r_can can_bit_timing_cfg_t) that gives `kbps` exactly from `pclkb_hz`: bit rate = PCLKB / (BRP
/// × (1 + TSEG1 + TSEG2)) with 8-25 time quanta, TSEG1 1-16, TSEG2 1-8, TSEG1 > TSEG2 >= SJW; the sample point
/// (1 + TSEG1) / TQ nearest 80 % (on a tie the larger TQ count), SJW = min(4, TSEG2). Null when no setting gives the
/// rate exactly.
pub fn can_timing(pclkb_hz: f64, kbps: f64) -> Value {
    let rate = kbps * 1000.0;
    if !rate.is_finite() || rate.fract() != 0.0 || rate <= 0.0 {
        return Value::Null;
    }
    // (brp, tseg1, tseg2, tq, sample, off)
    let mut best: Option<(f64, u32, u32, u32, f64, f64)> = None;
    for tq in 8..=25u32 {
        let brp = pclkb_hz / (rate * f64::from(tq));
        if !brp.is_finite() || brp.fract() != 0.0 || !(1.0..=1024.0).contains(&brp) {
            continue;
        }
        for tseg2 in 1..=8u32 {
            let Some(tseg1) = (tq - 1)
                .checked_sub(tseg2)
                .filter(|t| (1..=16).contains(t) && *t > tseg2)
            else {
                continue;
            };
            let sample = f64::from(1 + tseg1) / f64::from(tq);
            let off = (sample - 0.8).abs();
            let better = match best {
                None => true,
                Some(b) => off < b.5 - 1e-12 || ((off - b.5).abs() <= 1e-12 && tq > b.3),
            };
            if better {
                best = Some((brp, tseg1, tseg2, tq, sample, off));
            }
        }
    }
    match best {
        None => Value::Null,
        Some((brp, tseg1, tseg2, tq, sample, _)) => {
            json!({"brp": out(brp), "tseg1": tseg1, "tseg2": tseg2, "sjw": tseg2.min(4), "tq": tq, "sample": out(sample)})
        }
    }
}

// ---------- the checked copy of an RA project's MCU settings ----------

type Signals = Vec<(String, String)>;
fn has(signals: &Signals, name: &str) -> bool {
    signals.iter().any(|(s, _)| s == name)
}
fn pin_of<'a>(signals: &'a Signals, name: &str) -> &'a str {
    signals
        .iter()
        .find(|(s, _)| s == name)
        .map_or("undefined", |(_, pin)| pin.as_str())
}
fn enabled_of(p: &Value) -> Option<bool> {
    if truthy(p) {
        p.get("enabled").and_then(Value::as_bool)
    } else {
        None
    }
}
/// A callback that may be left empty.
fn optional_callback(v: &Value) -> bool {
    v.as_str().is_some_and(|s| s.is_empty() || c_name(s))
}
fn required_callback(v: &Value) -> bool {
    v.as_str().is_some_and(c_name)
}
fn priority_error(id: &str) -> String {
    format!("{id}: 인터럽트 우선순위는 0~15입니다.")
}
fn object(entries: Vec<(&str, Value)>) -> Map<String, Value> {
    entries
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect()
}
/// `{enabled, ...defaults, ...the keys of the defaults that p sets}`.
fn with_defaults(enabled: bool, defaults: Value, p: &Value) -> Map<String, Value> {
    let mut q = Map::new();
    q.insert("enabled".into(), json!(enabled));
    for (k, v) in defaults.as_object().into_iter().flatten() {
        q.insert(k.clone(), p.get(k).cloned().unwrap_or_else(|| v.clone()));
    }
    q
}

// ADC0 (r_adc g_adc0): single or continuous scan of the pins set to Analog that have an AN channel.
fn validate_adc(p: &Value, pins: &Map<String, Value>) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p) else {
        return Err("ADC0: 설정을 확인하세요.".into());
    };
    let mut q = object(vec![
        ("enabled", json!(enabled)),
        ("mode", or(p, "mode", json!("SINGLE"))),
        ("resolution", or(p, "resolution", json!(12))),
        ("callback", or(p, "callback", json!(""))),
        ("priority", or(p, "priority", json!(12))),
    ]);
    // Start source (feature 36): software (R_ADC_ScanStart starts a scan) or the ELC link of ELC_PERIPHERAL_ADC0.
    // Projects from before keep their shape: no field is software.
    if let Some(trigger) = p.get("trigger").filter(|t| *t != &json!("SOFTWARE")) {
        if !is_one_of(trigger, &ADC_TRIGGERS) {
            return Err("ADC0: 시작 트리거는 Software 또는 ELC입니다.".into());
        }
        q.insert("trigger".into(), trigger.clone());
        let event = or(p, "elcEvent", json!("GPT1_COUNTER_OVERFLOW"));
        let known = event
            .as_str()
            .is_some_and(|e| adc_elc_events().contains(&e));
        q.insert("elcEvent".into(), event);
        if !known {
            return Err("ADC0: ELC로 스캔을 시작할 이벤트를 고르세요.".into());
        }
        if q["mode"] == "CONTINUOUS" {
            return Err("ADC0: ELC 트리거는 Single Scan에서 씁니다.".into());
        }
    }
    if !is_one_of(&q["mode"], &["SINGLE", "CONTINUOUS"]) {
        return Err("ADC0: 동작 모드는 Single Scan 또는 Continuous Scan입니다.".into());
    }
    if !is_number_of(&q["resolution"], &[12.0, 10.0, 8.0]) {
        return Err("ADC0: 분해능은 12·10·8비트입니다.".into());
    }
    if !optional_callback(&q["callback"]) {
        return Err("ADC0: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).".into());
    }
    if !int_in(&q["priority"], 0.0, 15.0) {
        return Err(priority_error("ADC0"));
    }
    if enabled
        && !pins.iter().any(|(pin, x)| {
            x["function"] == "Analog" && ADC_CHANNELS.iter().any(|(p, _)| *p == pin.as_str())
        })
    {
        return Err(
            "ADC0: 아날로그 입력 핀(AN000~AN008, AN012, AN013)을 Analog로 정하세요.".into(),
        );
    }
    Ok(q)
}
// One IIC channel is an I2C master (r_iic_master, the default: its settings keep their shape) or an I2C slave
// (r_iic_slave, mode 'SLAVE'). `slave` is the address the master talks to, or in slave mode this board's own 7-bit
// address (0x08-0x77, outside the reserved ones).
fn validate_iic(
    id: &str,
    ch: u32,
    p: &Value,
    clock: Option<&Value>,
    signals: &Signals,
) -> Result<Map<String, Value>, String> {
    let enabled = enabled_of(p).filter(|_| IIC_CHANNELS.contains(&ch));
    let Some(enabled) = enabled else {
        return Err(format!("{id}: 지원하지 않는 주변장치입니다."));
    };
    if p.get("mode")
        .is_some_and(|m| !is_one_of(m, &["MASTER", "SLAVE"]))
    {
        return Err(format!(
            "{id}: 동작 모드는 Master(r_iic_master) 또는 Slave(r_iic_slave)입니다."
        ));
    }
    let slave_mode = p.get("mode") == Some(&json!("SLAVE"));
    let mut q = Map::new();
    q.insert("enabled".into(), json!(enabled));
    if slave_mode {
        q.insert("mode".into(), json!("SLAVE"));
    }
    q.insert("rate".into(), or(p, "rate", json!("STANDARD")));
    q.insert(
        "slave".into(),
        or(
            p,
            "slave",
            json!(if slave_mode { IIC_SLAVE_ADDRESS } else { 0x50 }),
        ),
    );
    q.insert(
        "callback".into(),
        or(
            p,
            "callback",
            json!(format!(
                "i2c_{}{ch}_callback",
                if slave_mode { "slave" } else { "master" }
            )),
        ),
    );
    q.insert("priority".into(), or(p, "priority", json!(12)));
    let rate = q["rate"]
        .as_str()
        .filter(|r| IIC_RATES.iter().any(|(k, _)| k == r));
    if rate.is_none() || (rate == Some("FASTPLUS") && ch != 0) {
        return Err(format!(
            "{id}: 속도는 Standard(100 kHz)·Fast(400 kHz){}입니다.",
            if ch == 0 {
                "·Fast-mode Plus(1 MHz)"
            } else {
                ""
            }
        ));
    }
    if slave_mode {
        if !int_in(&q["slave"], 8.0, 119.0) {
            return Err(format!("{id}: 슬레이브 모드의 자기 주소는 7비트 0x08~0x77입니다(0x00~0x07과 0x78~0x7F는 I²C 예약 주소)."));
        }
    } else if !int_in(&q["slave"], 0.0, 127.0) {
        return Err(format!("{id}: 슬레이브 주소는 7비트(0x00~0x7F)입니다."));
    }
    if !required_callback(&q["callback"]) {
        return Err(format!(
            "{id}: 콜백 이름은 C 식별자로 쓰세요({}).",
            if slave_mode {
                "r_iic_slave는 콜백에서 R_IIC_SLAVE_Read · R_IIC_SLAVE_Write를 부릅니다"
            } else {
                "r_iic_master는 콜백으로 완료를 알립니다"
            }
        ));
    }
    if !int_in(&q["priority"], 0.0, 15.0) {
        return Err(priority_error(id));
    }
    iic_clock_parts(clock_hz_of(clock, "pclkb"), q.get("rate"))?;
    if enabled && (!has(signals, &format!("{id}_SCL")) || !has(signals, &format!("{id}_SDA"))) {
        return Err(format!("{id}: SCL과 SDA 핀을 모두 정하세요."));
    }
    Ok(q)
}
// SPI master settings shared by r_spi and r_sci_spi (spi_cfg_t): bit rate, clock polarity/phase, bit order, the
// callback (both drivers assert p_callback) and one interrupt priority for RXI/TXI/TEI/ERI. The data width is not a
// setting: FSP takes it per call.
fn spi_common(
    id: &str,
    enabled: bool,
    p: &Value,
    mode: Option<&str>,
    ssl: Option<&str>,
    callback: String,
    module: &str,
) -> Result<Map<String, Value>, String> {
    let mut q = Map::new();
    q.insert("enabled".into(), json!(enabled));
    if let Some(mode) = mode {
        q.insert("mode".into(), json!(mode));
    }
    q.insert("bitrate".into(), or(p, "bitrate", json!(1_000_000)));
    q.insert("cpol".into(), or(p, "cpol", json!(0)));
    q.insert("cpha".into(), or(p, "cpha", json!(0)));
    q.insert("bitOrder".into(), or(p, "bitOrder", json!("MSB")));
    if let Some(ssl) = ssl {
        q.insert("ssl".into(), or(p, "ssl", json!(ssl)));
    }
    q.insert("callback".into(), or(p, "callback", json!(callback)));
    q.insert("priority".into(), or(p, "priority", json!(12)));
    if int(&q["bitrate"]).is_none() {
        return Err(format!("{id}: 비트레이트(bps)는 정수로 쓰세요."));
    }
    if !is_number_of(&q["cpol"], &[0.0, 1.0]) || !is_number_of(&q["cpha"], &[0.0, 1.0]) {
        return Err(format!("{id}: Clock Polarity·Clock Phase를 확인하세요."));
    }
    if !is_one_of(&q["bitOrder"], &["MSB", "LSB"]) {
        return Err(format!("{id}: Bit Order는 MSB First 또는 LSB First입니다."));
    }
    if !required_callback(&q["callback"]) {
        return Err(format!(
            "{id}: 콜백 이름은 C 식별자로 쓰세요({module}는 콜백으로 전송 완료를 알립니다)."
        ));
    }
    if !int_in(&q["priority"], 0.0, 15.0) {
        return Err(priority_error(id));
    }
    Ok(q)
}
fn validate_spi(
    id: &str,
    ch: u32,
    p: &Value,
    clock: Option<&Value>,
    signals: &Signals,
) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p).filter(|_| SPI_CHANNELS.contains(&ch)) else {
        return Err(format!(
            "{id}: 지원하지 않는 주변장치입니다{}.",
            if ch == 0 {
                " (SPI0의 핀은 아직 확인하지 못해 SPI1만 씁니다)"
            } else {
                ""
            }
        ));
    };
    let ssl0 = has(signals, &format!("{id}_SSL0"));
    let q = spi_common(
        id,
        enabled,
        p,
        None,
        Some(if ssl0 { "SSL0" } else { "NONE" }),
        format!("spi{ch}_callback"),
        "r_spi",
    )?;
    if !is_one_of(&q["ssl"], &["SSL0", "NONE"]) {
        return Err(format!(
            "{id}: Slave Select는 SSL0(하드웨어) 또는 사용 안 함(GPIO로 CS)입니다."
        ));
    }
    let pclka = clock_hz_of(clock, "pclka");
    let bitrate = q["bitrate"].as_f64().unwrap_or(f64::NAN);
    if bitrate < 1000.0 || bitrate > pclka / 2.0 {
        return Err(format!(
            "{id}: 비트레이트는 1000 bps~PCLKA/2({} bps)입니다.",
            js_number(pclka / 2.0)
        ));
    }
    spi_bitrate(pclka, bitrate, &js_number(bitrate))?;
    if enabled {
        if !has(signals, &format!("{id}_RSPCK"))
            || (!has(signals, &format!("{id}_MOSI")) && !has(signals, &format!("{id}_MISO")))
        {
            return Err(format!("{id}: RSPCK 핀과 MOSI 또는 MISO 핀을 정하세요."));
        }
        if q["ssl"] == "SSL0" && !ssl0 {
            return Err(format!("{id}: Slave Select가 SSL0이면 SSL0 핀(P103 또는 P413)을 정하세요. GPIO로 CS를 직접 내리려면 Slave Select를 사용 안 함으로 바꾸세요."));
        }
        if q["ssl"] == "NONE" && ssl0 {
            return Err(format!(
                "{}: SSL0 핀을 쓰려면 {id}의 Slave Select를 SSL0으로 정하세요.",
                pin_of(signals, &format!("{id}_SSL0"))
            ));
        }
    }
    Ok(q)
}
fn validate_sci_spi(
    id: &str,
    ch: u32,
    p: &Value,
    clock: Option<&Value>,
    signals: &Signals,
) -> Result<Map<String, Value>, String> {
    let Some(enabled) = p
        .get("enabled")
        .and_then(Value::as_bool)
        .filter(|_| SCI_SPI_CHANNELS.contains(&ch))
    else {
        return Err(format!(
            "{id}: Simple SPI(r_sci_spi)는 SCK 핀이 있는 SCI{}에서 씁니다.",
            SCI_SPI_CHANNELS.map(|c| c.to_string()).join("·SCI")
        ));
    };
    let q = spi_common(
        id,
        enabled,
        p,
        Some("SPI"),
        None,
        format!("sci_spi{ch}_callback"),
        "r_sci_spi",
    )?;
    let pclka = clock_hz_of(clock, "pclka");
    let bitrate = q["bitrate"].as_f64().unwrap_or(f64::NAN);
    if bitrate < (pclka / 65536.0).ceil() || bitrate > pclka / 4.0 {
        return Err(format!(
            "{id}: 비트레이트는 {}~{} bps(PCLKA/4)입니다.",
            js_number((pclka / 65536.0).ceil()),
            js_number(pclka / 4.0)
        ));
    }
    if enabled
        && (!has(signals, &format!("{id}_SCK"))
            || (!has(signals, &format!("{id}_TXD")) && !has(signals, &format!("{id}_RXD"))))
    {
        return Err(format!(
            "{id}: Simple SPI는 SCK 핀과 TXD(MOSI) 또는 RXD(MISO) 핀을 정하세요."
        ));
    }
    Ok(q)
}
/// `typeof period !== 'number' || !(period > 0) || the unit is not one`.
fn period_and_unit(q: &Map<String, Value>) -> Option<(f64, &str)> {
    let period = num(&q["period"]).filter(|p| *p > 0.0)?;
    let unit = q["unit"].as_str().filter(|u| TIMER_UNITS.contains(u))?;
    Some((period, unit))
}
fn validate_agt(
    id: &str,
    ch: u32,
    p: &Value,
    clock: Option<&Value>,
) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p).filter(|_| AGT_CHANNELS.contains(&ch)) else {
        return Err(format!("{id}: 지원하지 않는 주변장치입니다."));
    };
    let q = object(vec![
        ("enabled", json!(enabled)),
        ("period", or(p, "period", json!(100))),
        ("unit", or(p, "unit", json!("ms"))),
        (
            "callback",
            or(p, "callback", json!(format!("agt{ch}_callback"))),
        ),
        ("priority", or(p, "priority", json!(12))),
    ]);
    let Some((period, unit)) = period_and_unit(&q) else {
        return Err(format!("{id}: 주기와 단위를 확인하세요."));
    };
    if !optional_callback(&q["callback"]) {
        return Err(format!(
            "{id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다)."
        ));
    }
    if !int_in(&q["priority"], 0.0, 15.0) {
        return Err(priority_error(id));
    }
    agt_counts(clock_hz_of(clock, "pclkb"), &ch.to_string(), period, unit)?;
    Ok(q)
}
fn validate_gpt(
    id: &str,
    ch: u32,
    p: &Value,
    clock: Option<&Value>,
    signals: &Signals,
) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p).filter(|_| GPT_CHANNELS.contains(&ch)) else {
        return Err(format!("{id}: 지원하지 않는 주변장치입니다."));
    };
    let q = object(vec![
        ("enabled", json!(enabled)),
        ("mode", or(p, "mode", json!("PWM"))),
        ("period", or(p, "period", json!(1))),
        ("unit", or(p, "unit", json!("kHz"))),
        ("duty", or(p, "duty", json!(50))),
        ("callback", or(p, "callback", json!(""))),
        ("priority", or(p, "priority", json!(12))),
    ]);
    if !is_one_of(&q["mode"], &["PWM", "PERIODIC"]) {
        return Err(format!("{id}: 동작 모드는 PWM 또는 Periodic입니다."));
    }
    let Some((period, unit)) = period_and_unit(&q) else {
        return Err(format!("{id}: 주기와 단위를 확인하세요."));
    };
    let Some(duty) = num(&q["duty"]).filter(|d| !(*d < 0.0 || *d > 100.0)) else {
        return Err(format!("{id}: 듀티는 0~100 %입니다."));
    };
    if !optional_callback(&q["callback"]) {
        return Err(format!(
            "{id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다)."
        ));
    }
    if !int_in(&q["priority"], 0.0, 15.0) {
        return Err(priority_error(id));
    }
    gpt_counts(
        clock_hz_of(clock, "pclkd"),
        &ch.to_string(),
        GPT_32BIT.contains(&ch),
        period,
        unit,
        duty,
    )?;
    if enabled
        && q["mode"] == "PWM"
        && !has(signals, &format!("{id}_GTIOCA"))
        && !has(signals, &format!("{id}_GTIOCB"))
    {
        return Err(format!(
            "{id}: PWM 출력 핀(GTIOC{ch}A 또는 GTIOC{ch}B)을 정하세요."
        ));
    }
    Ok(q)
}
// Watchdogs (r_wdt g_wdt0, r_iwdt g_iwdt0), pin-less stacks. The IWDT runs from OFS0 only; the WDT starts from its
// registers at the first R_WDT_Refresh, or from OFS0 at reset (Start Mode: Auto).
fn validate_wdt(id: &str, p: &Value) -> Result<Map<String, Value>, String> {
    let (timeouts, dividers, timeout, divider) = wdt_info(id).unwrap();
    let Some(enabled) = enabled_of(p) else {
        return Err(format!("{id}: 설정을 확인하세요."));
    };
    let mut q = object(vec![
        ("enabled", json!(enabled)),
        (
            "startMode",
            if id == "IWDT" {
                json!("AUTO")
            } else {
                or(p, "startMode", json!("REGISTER"))
            },
        ),
        ("timeout", or(p, "timeout", number(timeout))),
        ("clockDiv", or(p, "clockDiv", number(divider))),
        ("windowStart", or(p, "windowStart", json!(100))),
        ("windowEnd", or(p, "windowEnd", json!(0))),
        ("reset", or(p, "reset", json!("RESET"))),
        (
            "stopInSleep",
            json!(p.get("stopInSleep").is_some_and(truthy)),
        ),
        ("callback", or(p, "callback", json!(""))),
    ]);
    if id == "IWDT" && p.get("startMode").is_some_and(|m| m != "AUTO") {
        return Err(
            "IWDT: RA6E1의 IWDT는 OFS0으로 리셋 때 시작합니다(Register start mode 없음).".into(),
        );
    }
    if !is_one_of(&q["startMode"], &["REGISTER", "AUTO"]) {
        return Err(format!("{id}: 시작 방식은 Register 또는 Auto입니다."));
    }
    if !is_number_of(&q["timeout"], &timeouts) {
        return Err(format!(
            "{id}: Timeout은 {} 클록입니다.",
            timeouts.map(js_number).join(" · ")
        ));
    }
    if !is_number_of(&q["clockDiv"], &dividers) {
        return Err(format!(
            "{id}: 클록 분주는 {}입니다.",
            dividers.map(|d| format!("/{}", js_number(d))).join(" · ")
        ));
    }
    if !is_number_of(&q["windowStart"], &WDT_WINDOW_START)
        || !is_number_of(&q["windowEnd"], &WDT_WINDOW_END)
    {
        return Err(format!(
            "{id}: 새로 고침 창 시작은 100·75·50·25 %, 끝은 0·25·50·75 %입니다."
        ));
    }
    if q["windowEnd"].as_f64() >= q["windowStart"].as_f64() {
        return Err(format!(
            "{id}: 창 끝({} %)은 창 시작({} %)보다 작아야 합니다.",
            show(q.get("windowEnd")),
            show(q.get("windowStart"))
        ));
    }
    if !is_one_of(&q["reset"], &["RESET", "NMI"]) {
        return Err(format!("{id}: 시간 초과 동작은 Reset 또는 NMI입니다."));
    }
    if !optional_callback(&q["callback"]) {
        return Err(format!(
            "{id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다)."
        ));
    }
    // r_wdt.c / r_iwdt.c parameter checking: p_callback must be NULL unless the NMI is the output, so with Reset
    // output there is no callback: a name left from an NMI setting is dropped.
    if q["reset"] == "RESET" {
        q.insert("callback".into(), json!(""));
    }
    if q["reset"] == "NMI" && q["callback"] == "" {
        return Err(format!("{id}: NMI로 알리려면 콜백 이름을 쓰세요."));
    }
    Ok(q)
}
// RTC (r_rtc g_rtc0), a pin-less stack. Interrupt priorities as RASC (null: Disabled); the carry interrupt is
// required (R_RTC_CalendarTimeGet uses it).
fn validate_rtc(p: &Value) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p) else {
        return Err("RTC: 설정을 확인하세요.".into());
    };
    let q = with_defaults(enabled, rtc_defaults(), p);
    if !is_one_of(&q["clockSource"], &["LOCO", "SUBCLOCK"]) {
        return Err("RTC: 클록 소스는 LOCO 또는 Sub-Clock입니다.".into());
    }
    if !is_one_of(&q["start"], &["SIMULATION", "HOST_TIME"]) {
        return Err("RTC: 시작 시각은 시뮬레이션(2000-01-01) 또는 PC 시각입니다.".into());
    }
    if !int_in(&q["freqCompare"], 8.0, 510.0) {
        return Err("RTC: 주파수 비교값(RFRL)은 8~510입니다(LOCO 32.768 kHz에서 255).".into());
    }
    if !optional_callback(&q["callback"]) {
        return Err("RTC: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).".into());
    }
    for (k, label, optional) in [
        ("alarmPriority", "Alarm", true),
        ("periodicPriority", "Period", true),
        ("carryPriority", "Carry", false),
    ] {
        if !(optional && q[k].is_null()) && !int_in(&q[k], 0.0, 15.0) {
            return Err(format!(
                "RTC: {label} 인터럽트 우선순위는 0~15{}입니다.",
                if optional { "(또는 Disabled)" } else { "" }
            ));
        }
    }
    Ok(q)
}
// Data flash (r_flash_hp g_flash0), a pin-less stack. Without BGO a call returns when the operation is done and
// r_flash_hp uses no interrupt, so the callback goes with BGO.
fn validate_flash(p: &Value) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p) else {
        return Err("FLASH: 설정을 확인하세요.".into());
    };
    let mut q = with_defaults(enabled, flash_defaults(), p);
    if !q["bgo"].is_boolean() {
        return Err("FLASH: Data Flash Background Operation은 Enabled 또는 Disabled입니다.".into());
    }
    if !optional_callback(&q["callback"]) {
        return Err("FLASH: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).".into());
    }
    for (k, label) in [
        ("readyPriority", "Flash Ready"),
        ("errorPriority", "Flash Error"),
    ] {
        if !int_in(&q[k], 0.0, 15.0) {
            return Err(format!("FLASH: {label} 인터럽트 우선순위는 0~15입니다."));
        }
    }
    if q["bgo"] == false {
        q.insert("callback".into(), json!(""));
    }
    Ok(q)
}
// USB PCDC (r_usb_basic g_basic0 with r_usb_pcdc, feature 41), a pin-less stack. One message for every setting (the
// user's decision of 2026-11-24).
fn validate_usb(p: &Value) -> Result<Map<String, Value>, String> {
    let bad = || "USB: 설정을 확인하세요.".to_string();
    let Some(enabled) = enabled_of(p) else {
        return Err(bad());
    };
    let q = with_defaults(enabled, usb_defaults(), p);
    if !optional_callback(&q["callback"])
        || !int_in(&q["priority"], 0.0, 15.0)
        || !int_in(&q["resumePriority"], 0.0, 15.0)
    {
        return Err(bad());
    }
    Ok(q)
}
// CAN (r_can g_can0 on R_CAN0, feature 40), a pin-less stack: four mailboxes in normal mailbox mode, one acceptance
// mask for the four, the bit rate from PCLKB, the interrupt priority and the callback.
fn validate_can(p: &Value, clock: Option<&Value>) -> Result<Map<String, Value>, String> {
    let bad = || "CAN: 설정을 확인하세요.".to_string();
    let Some(enabled) = enabled_of(p) else {
        return Err(bad());
    };
    let mut q = with_defaults(enabled, can_defaults(), p);
    if !is_number_of(&q["bitrate"], &CAN_BITRATES)
        || !is_one_of(&q["idMode"], &["STANDARD", "EXTENDED"])
    {
        return Err(bad());
    }
    let max = if q["idMode"] == "EXTENDED" {
        536_870_911.0
    } else {
        2047.0
    };
    let Some(boxes) = q["mailboxes"].as_array().filter(|b| b.len() == 4) else {
        return Err(bad());
    };
    let mut mailboxes = Vec::new();
    for m in boxes {
        let (kind, id) = (m.get("type"), m.get("id"));
        if !kind.is_some_and(|k| is_one_of(k, &["TRANSMIT", "RECEIVE"]))
            || !id.is_some_and(|v| int_in(v, 0.0, max))
        {
            return Err(bad());
        }
        mailboxes.push(json!({"type": kind, "id": id}));
    }
    q.insert("mailboxes".into(), Value::Array(mailboxes));
    if !int_in(&q["mask"], 0.0, max)
        || !int_in(&q["priority"], 0.0, 15.0)
        || !required_callback(&q["callback"])
    {
        return Err(bad());
    }
    if can_timing(
        clock_hz_of(clock, "pclkb"),
        q["bitrate"].as_f64().unwrap_or(f64::NAN),
    )
    .is_null()
    {
        return Err(bad());
    }
    Ok(q)
}
// Low power modes (r_lpm g_lpm0), a pin-less stack: the mode R_LPM_LowPowerModeEnter enters, the sources that end it
// and the Deep Software Standby options. R_LPM_Open returns FSP_ERR_INVALID_MODE for a source outside the RA6E1's
// masks, so the settings offer what is inside them and the simulator models.
fn lpm_list(v: Option<&Value>, all: &[String], label: &str) -> Result<Value, String> {
    let empty = json!([]);
    let v = v.filter(|x| !x.is_null()).unwrap_or(&empty);
    let Some(names) = v.as_array().filter(|a| a.iter().all(Value::is_string)) else {
        return Err(format!("LPM: {label}를 확인하세요."));
    };
    let names: Vec<&str> = names.iter().filter_map(Value::as_str).collect();
    if let Some(bad) = names.iter().find(|x| !all.iter().any(|a| a == *x)) {
        let others: Vec<&str> = all
            .iter()
            .map(String::as_str)
            .filter(|x| !x.starts_with("IRQ"))
            .collect();
        return Err(format!(
            "LPM: {label} {bad}은(는) 고를 수 없습니다({} · IRQn 중에서 고르세요).",
            others.join(" · ")
        ));
    }
    Ok(json!(all
        .iter()
        .filter(|x| names.contains(&x.as_str()))
        .collect::<Vec<_>>()))
}
fn validate_lpm_on(p: &Value) -> Result<Map<String, Value>, String> {
    let mut q = object(vec![
        ("enabled", json!(true)),
        ("mode", or(p, "mode", json!("SLEEP"))),
        (
            "wake",
            lpm_list(p.get("wake"), &LPM_WAKE, "Software Standby를 깨우는 소스")?,
        ),
        ("ioKeep", or(p, "ioKeep", json!(true))),
        ("power", or(p, "power", json!("DEEPCUT0"))),
        (
            "cancel",
            lpm_list(
                p.get("cancel"),
                &LPM_CANCEL,
                "Deep Software Standby 해제 소스",
            )?,
        ),
        ("cancelRising", json!([])),
    ]);
    if !is_one_of(&q["mode"], &LPM_MODES) {
        return Err(
            "LPM: 저전력 모드는 Sleep · Software Standby · Deep Software Standby입니다.".into(),
        );
    }
    if !q["ioKeep"].is_boolean() {
        return Err("LPM: I/O 포트 상태 유지(IOKEEP)는 켜거나 끕니다.".into());
    }
    if !q["power"]
        .as_str()
        .is_some_and(|p| LPM_POWER.iter().any(|(k, _)| *k == p))
    {
        return Err("LPM: 전원 공급은 DEEPCUT0 · DEEPCUT1 · DEEPCUT3입니다.".into());
    }
    // r_lpm.c: an edge without its source is FSP_ERR_INVALID_MODE; only the IRQn-DS pins have an edge here.
    let irqs: Vec<String> = LPM_CANCEL
        .iter()
        .filter(|x| x.starts_with("IRQ"))
        .cloned()
        .collect();
    let rising = lpm_list(p.get("cancelRising"), &irqs, "상승 엣지로 해제할 IRQn-DS")?;
    let cancel = q["cancel"].as_array().cloned().unwrap_or_default();
    if let Some(lone) = rising
        .as_array()
        .into_iter()
        .flatten()
        .find(|x| !cancel.contains(x))
        .and_then(Value::as_str)
    {
        return Err(format!(
            "LPM: {lone}-DS의 엣지를 정하려면 해제 소스에도 {lone}을(를) 넣으세요."
        ));
    }
    q.insert("cancelRising".into(), rising);
    Ok(q)
}
fn validate_lpm(p: &Value) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p) else {
        return Err("LPM: 설정을 확인하세요.".into());
    };
    if enabled {
        return validate_lpm_on(p);
    }
    // A stack that is turned off is not generated: what it holds is not a reason to refuse the project (the defaults
    // stand in).
    let mut q = validate_lpm_on(p).unwrap_or_else(|_| {
        let mut q = Map::new();
        q.insert("enabled".into(), json!(false));
        q.extend(lpm_defaults().as_object().cloned().unwrap_or_default());
        q
    });
    q.insert("enabled".into(), json!(false));
    Ok(q)
}
// A transfer instance g_transferN (TRANSFERn): r_dtc or r_dmac with the transfer_info_t RASC's Properties set. A
// UART's transmit or receive transfer is one of these too (SCIn transferTx / transferRx names it).
fn validate_transfer(id: &str, p: &Value) -> Result<Map<String, Value>, String> {
    let Some(enabled) = enabled_of(p) else {
        return Err(format!("{id}: 설정을 확인하세요."));
    };
    let mut q = with_defaults(enabled, transfer_defaults(), p);
    if !is_one_of(&q["driver"], &["DTC", "DMAC"]) {
        return Err(format!(
            "{id}: 전송 모듈은 DTC(r_dtc) 또는 DMAC(r_dmac)입니다."
        ));
    }
    let dtc = q["driver"] == "DTC";
    if !dtc && !int_in(&q["channel"], 0.0, 7.0) {
        return Err(format!("{id}: DMAC 채널은 0~7입니다."));
    }
    let activation = q["activation"].as_str();
    if !activation.is_some_and(|a| {
        (a == "SOFTWARE" || elc_event(a).is_some())
            && a != "DTC_COMPLETE"
            && !(dtc && a.starts_with("ELC_SOFTWARE_EVENT"))
    }) {
        return Err(format!("{id}: 활성화 소스(Activation Source)를 고르세요."));
    }
    if activation == Some("SOFTWARE") && dtc {
        return Err(format!("{id}: DTC는 인터럽트 이벤트로만 움직입니다(R_DTC_SoftwareStart는 FSP_ERR_UNSUPPORTED). 소프트웨어 시작은 DMAC를 쓰세요."));
    }
    if !is_one_of(&q["mode"], &TRANSFER_MODES) {
        return Err(format!("{id}: 전송 모드는 Normal · Repeat · Block입니다(Repeat-Block은 시뮬레이터가 지원하지 않습니다)."));
    }
    if !is_number_of(&q["size"], &[1.0, 2.0, 4.0]) {
        return Err(format!("{id}: 전송 단위는 1 · 2 · 4바이트입니다."));
    }
    for k in ["srcMode", "destMode"] {
        if !is_one_of(&q[k], &TRANSFER_ADDR_MODES) {
            return Err(format!(
                "{id}: 주소 모드는 Fixed · Incremented · Decremented입니다."
            ));
        }
    }
    if !is_one_of(&q["repeatArea"], &["SOURCE", "DESTINATION"]) {
        return Err(format!(
            "{id}: Repeat Area는 Source 또는 Destination입니다."
        ));
    }
    if !is_one_of(&q["irq"], &["END", "EACH"]) {
        return Err(format!(
            "{id}: 인터럽트 시점은 전송 끝(End) 또는 매번(Each)입니다."
        ));
    }
    let max = if q["mode"] == "NORMAL" {
        65535.0
    } else if dtc {
        256.0
    } else {
        1024.0
    };
    if !int_in(&q["length"], 0.0, max) {
        return Err(format!(
            "{id}: Number of Transfers는 0~{}입니다.",
            js_number(max)
        ));
    }
    if !int_in(&q["blocks"], 0.0, 65535.0) {
        return Err(format!("{id}: Number of Blocks는 0~65535입니다."));
    }
    if dtc {
        q.insert("callback".into(), json!(""));
        q.shift_remove("channel");
    } else {
        if !optional_callback(&q["callback"]) {
            return Err(format!(
                "{id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다)."
            ));
        }
        if !int_in(&q["priority"], 0.0, 15.0) {
            return Err(priority_error(id));
        }
    }
    Ok(q)
}
/// Whether the configuration allocates a vector (an IELSR slot) for an event, as raVectors does: a DTC activates on
/// one.
pub fn event_has_vector(mcu: &Value, event: &str) -> Result<bool, String> {
    if mcu.is_null() {
        return Err(BROKEN.into());
    }
    let empty = Map::new();
    let per = mcu
        .get("peripherals")
        .filter(|p| truthy(p))
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let on = |id: &str| {
        per.get(id)
            .and_then(|p| p.get("enabled"))
            .is_some_and(truthy)
    };
    let with_callback = |id: &str| on(id) && per[id].get("callback").is_some_and(truthy);
    let b = event.as_bytes();
    if event.starts_with("SCI") && b.len() >= 5 && b[3].is_ascii_digit() && b[4] == b'_' {
        return Ok(on(&event[..4]));
    }
    if let Some(digits) = digits_after(event, "ICU_IRQ") {
        let ch: f64 = digits.parse().unwrap_or(f64::NAN);
        for (pin, p) in mcu
            .get("pins")
            .filter(|p| truthy(p))
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
        {
            if p.is_null() {
                return Err(BROKEN.into());
            }
            if p.get("function") == Some(&json!("IRQ"))
                && irq_of(pin).is_some_and(|n| f64::from(n) == ch)
            {
                return Ok(true);
            }
        }
        return Ok(false);
    }
    if event == "ADC0_SCAN_END" {
        return Ok(with_callback("ADC0"));
    }
    if (event.starts_with("GPT") || event.starts_with("AGT"))
        && b.len() >= 5
        && b[3].is_ascii_digit()
        && b[4] == b'_'
    {
        return Ok(with_callback(&event[..4]));
    }
    if let Some(ch) = event
        .strip_prefix("DMAC")
        .and_then(|rest| rest.strip_suffix("_INT"))
        .filter(|d| d.len() == 1)
        .and_then(|d| d.parse::<f64>().ok())
    {
        return Ok(per.values().any(|t| {
            t.get("enabled").is_some_and(truthy)
                && t.get("driver") == Some(&json!("DMAC"))
                && t.get("channel").and_then(Value::as_f64) == Some(ch)
                && t.get("callback").is_some_and(truthy)
        }));
    }
    Ok(false)
}
// The checks across stacks: an ADC started by the ELC needs the g_elc stack, a UART's transfer is a DTC transfer of
// its own channel's event that nothing else uses, a DTC needs a vector on its event, one DMAC channel per transfer.
fn check_transfers(config: &mut Value) -> Result<(), String> {
    let flag = |per: &Map<String, Value>, id: &str, key: &str| {
        per.get(id).and_then(|p| p.get(key)).is_some_and(truthy)
    };
    let mut owner: Vec<(String, String)> = Vec::new();
    {
        let per = config["peripherals"].as_object_mut().unwrap();
        if flag(per, "ADC0", "enabled")
            && per["ADC0"].get("trigger") == Some(&json!("ELC"))
            && !flag(per, "ELC", "enabled")
        {
            return Err("ADC0: ELC로 시작하려면 New Stack → System의 Event Link Controller(g_elc)를 추가하세요.".into());
        }
        let uarts: Vec<String> = per
            .iter()
            .filter(|(id, u)| {
                channel_of(id, "SCI").is_some()
                    && truthy(&u["enabled"])
                    && u.get("mode") != Some(&json!("SPI"))
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in uarts {
            for (key, tail, way, short) in [
                ("transferTx", "TXI", "송신", "TX"),
                ("transferRx", "RXI", "수신", "RX"),
            ] {
                let Some(t) = per[&id]
                    .get(key)
                    .filter(|t| truthy(t))
                    .and_then(Value::as_str)
                    .map(String::from)
                else {
                    continue;
                };
                if digits_after(&t, "TRANSFER").is_none() || !flag(per, &t, "enabled") {
                    return Err(format!("{id}: {way} 전송 {t}이(가) Stacks에 없습니다."));
                }
                if per[&t].get("driver") != Some(&json!("DTC")) {
                    return Err(format!("{id}: UART의 전송은 DTC(r_dtc)로 정하세요. UART + DMAC는 시뮬레이터가 확인하지 못해 지원하지 않습니다."));
                }
                if let Some((_, by)) = owner.iter().find(|(name, _)| *name == t) {
                    return Err(format!("{t}은(는) 이미 {by}의 전송입니다."));
                }
                owner.push((t.clone(), format!("{id} {short}")));
                let transfer = per.get_mut(&t).and_then(Value::as_object_mut).unwrap();
                transfer.insert("activation".into(), json!(format!("{id}_{tail}")));
                transfer.insert("owner".into(), json!(format!("{id}_{short}")));
            }
        }
    }
    let per = config["peripherals"].as_object().unwrap();
    let mut dtc_events: Vec<(String, &str)> = Vec::new();
    let mut channels: Vec<(String, &str)> = Vec::new();
    for (id, t) in per {
        if digits_after(id, "TRANSFER").is_none() || !truthy(&t["enabled"]) {
            continue;
        }
        let activation = show(t.get("activation"));
        if !t.get("owner").is_some_and(truthy) && activation.starts_with("SCI") {
            return Err(format!(
                "{id}: SCI 이벤트({activation})로 움직이는 전송은 그 UART(g_uart{})의 송신·수신 전송으로 정하세요.",
                activation.chars().nth(3).map_or(String::new(), String::from)
            ));
        }
        if t.get("driver") == Some(&json!("DTC")) {
            if let Some((_, other)) = dtc_events.iter().find(|(e, _)| *e == activation) {
                return Err(format!("{id}: {activation}에는 이미 {other}이(가) 있습니다(이벤트 하나에 DTC 전송 하나: R_DTC_Open이 FSP_ERR_IN_USE)."));
            }
            dtc_events.push((activation.clone(), id.as_str()));
            if !event_has_vector(config, &activation)? {
                return Err(format!("{id}: DTC는 인터럽트 벡터가 있는 이벤트로만 움직입니다. {activation}의 스택에서 콜백(인터럽트)을 켜세요."));
            }
        } else {
            let channel = show(t.get("channel"));
            if let Some((_, other)) = channels.iter().find(|(c, _)| *c == channel) {
                return Err(format!(
                    "{id}: DMAC 채널 {channel}은(는) 이미 {other}에서 씁니다."
                ));
            }
            channels.push((channel, id.as_str()));
        }
    }
    Ok(())
}

/// A checked copy of an RA project's MCU settings (pins, clock); the error says what is wrong.
pub fn validate_ra_mcu(given: &Value) -> Result<Value, String> {
    let bad_pins = || "RA 핀 설정을 확인하세요.".to_string();
    if !given.is_object() || marker(given).is_some() {
        return Err(bad_pins());
    }
    // A property that is `undefined` is one that is not there, but a pin or a stack that is `undefined` is still
    // listed (and refused), and the clock is merged over the defaults as it was given.
    let raw_clock = there(given.get("clock"));
    let mut plain = Map::new();
    for (key, v) in given
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(_, v)| marker(v) != Some("undefined"))
    {
        let listed =
            (key == "pins" || key == "peripherals") && v.is_object() && marker(v).is_none();
        let value = if listed {
            Value::Object(
                v.as_object()
                    .into_iter()
                    .flatten()
                    .map(|(k, x)| {
                        (
                            k.clone(),
                            if marker(x) == Some("undefined") {
                                Value::Null
                            } else {
                                without_undefined(x)
                            },
                        )
                    })
                    .collect(),
            )
        } else {
            without_undefined(v)
        };
        plain.insert(key.clone(), value);
    }
    let mcu = &Value::Object(plain);
    family_check(mcu.get("family"))?;
    let Some(pins) = mcu.get("pins").and_then(Value::as_object) else {
        return Err(bad_pins());
    };
    let mut out_pins = Map::new();
    let mut labels: Vec<String> = Vec::new();
    let mut channels: Vec<(u32, String)> = Vec::new();
    let mut signals: Signals = Vec::new();
    let mut callbacks: Vec<(String, Value)> = Vec::new();
    for (pin, p) in pins {
        if !PORTS.contains(&pin.as_str()) {
            return Err(format!("{pin}: {PART}에 없는 핀입니다."));
        }
        if let Some((_, role)) = RESERVED
            .iter()
            .find(|(r, _)| *r == pin.as_str())
            .filter(|_| !["P212", "P213", "P200"].contains(&pin.as_str()))
        {
            return Err(format!("{pin}: {role} 핀이라 바꿀 수 없습니다."));
        }
        let Some(function) = p
            .get("function")
            .and_then(Value::as_str)
            .filter(|f| PIN_FUNCTIONS.contains(f))
        else {
            return Err(format!("{pin}: 지원하지 않는 핀 기능입니다."));
        };
        let mut q = Map::new();
        q.insert("function".into(), json!(function));
        if let Some(label) = p.get("label").filter(|l| *l != &json!("")) {
            let name = label
                .as_str()
                .filter(|l| c_name(l) && !labels.iter().any(|x| x.as_str() == *l));
            let Some(name) = name else {
                return Err(format!(
                    "{pin}: 핀 이름(심볼)은 겹치지 않는 C 식별자로 쓰세요."
                ));
            };
            check_name(pin, label)?;
            labels.push(name.to_string());
            q.insert("label".into(), label.clone());
        }
        if function == "GPIO_Output" {
            q.insert(
                "initial".into(),
                json!(u8::from(p.get("initial").is_some_and(truthy))),
            );
            let drive = or(p, "drive", json!("LOW"));
            let known = is_one_of(&drive, &["LOW", "MID", "HIGH"]);
            q.insert("drive".into(), drive);
            if !known {
                return Err(format!("{pin}: 출력 세기를 확인하세요."));
            }
            if let Some(kind) = p.get("outputType") {
                if !is_one_of(kind, &["CMOS", "NMOS"]) {
                    return Err(format!("{pin}: 출력 형식을 확인하세요."));
                }
                if kind == "NMOS" {
                    q.insert("outputType".into(), json!("NMOS"));
                }
            }
        }
        if function == "GPIO_Input" || function == "IRQ" {
            let pull = or(p, "pull", json!("NONE"));
            if !is_one_of(&pull, &["NONE", "PULLUP"]) {
                return Err(format!("{pin}: 풀업 설정을 확인하세요."));
            }
            q.insert("pull".into(), pull);
        }
        if function == "Peripheral" {
            let signal = p.get("signal").and_then(Value::as_str).filter(|s| {
                PERIPHERAL_PINS
                    .iter()
                    .any(|(k, list)| k == s && list.contains(&pin.as_str()))
            });
            let Some(signal) = signal else {
                let shown = match p.get("signal") {
                    Some(s) if !s.is_null() => show(Some(s)),
                    _ => "주변장치 신호".to_string(),
                };
                return Err(format!("{pin}: {shown}를 이 핀에 둘 수 없습니다."));
            };
            if has(&signals, signal) {
                return Err(format!(
                    "{signal}은 이미 {}에서 씁니다.",
                    pin_of(&signals, signal)
                ));
            }
            signals.push((signal.to_string(), pin.clone()));
            q.insert("signal".into(), json!(signal));
        }
        if function == "IRQ" {
            let Some(ch) = irq_of(pin) else {
                return Err(format!("{pin}: 외부 인터럽트(IRQ) 핀이 아닙니다."));
            };
            if let Some((_, other)) = channels.iter().find(|(c, _)| *c == ch) {
                return Err(format!("{pin}: IRQ{ch}는 이미 {other}({})에서 씁니다. {}와 같은 채널이라 함께 쓸 수 없습니다.", irq_name(other), irq_name(pin)));
            }
            channels.push((ch, pin.clone()));
            let edge = or(p, "edge", json!("FALLING"));
            if !is_one_of(&edge, &["FALLING", "RISING", "BOTH", "LOW"]) {
                return Err(format!("{pin}: 인터럽트 조건을 확인하세요."));
            }
            q.insert("edge".into(), edge);
            let priority = or(p, "priority", json!(12));
            if !int_in(&priority, 0.0, 15.0) {
                return Err(format!("{pin}: 인터럽트 우선순위는 0~15입니다."));
            }
            q.insert("priority".into(), priority);
            let callback = or(p, "callback", json!(format!("external_irq{ch}_callback")));
            if !required_callback(&callback) {
                return Err(format!("{pin}: 콜백 이름은 C 식별자로 쓰세요."));
            }
            check_name(pin, &callback)?;
            callbacks.push((pin.clone(), callback.clone()));
            q.insert("callback".into(), callback);
            if p.get("filter").is_some_and(truthy) {
                q.insert("filter".into(), json!(true));
            }
        }
        out_pins.insert(pin.clone(), Value::Object(q));
    }
    let mut config = json!({"family": FAMILY_ID, "pins": out_pins});
    let clock = raw_clock.filter(|c| truthy(c));
    // Peripherals (RASC Stacks).
    if let Some(peripherals) = mcu.get("peripherals") {
        let Some(peripherals) = peripherals
            .as_object()
            .filter(|_| marker(peripherals).is_none())
        else {
            return Err("RA 주변장치 설정을 확인하세요.".into());
        };
        let mut per = Map::new();
        for (id, p) in peripherals {
            let q = if let Some(ch) = channel_of(id, "GPT") {
                validate_gpt(id, ch, p, clock, &signals)?
            } else if id == "ADC0" {
                validate_adc(p, config["pins"].as_object().unwrap())?
            } else if let Some(ch) = channel_of(id, "IIC") {
                validate_iic(id, ch, p, clock, &signals)?
            } else if let Some(ch) = channel_of(id, "AGT") {
                validate_agt(id, ch, p, clock)?
            } else if let Some(ch) = channel_of(id, "SPI") {
                validate_spi(id, ch, p, clock, &signals)?
            } else if id == "WDT" || id == "IWDT" {
                validate_wdt(id, p)?
            } else if id == "RTC" {
                validate_rtc(p)?
            } else if id == "FLASH" {
                validate_flash(p)?
            } else if id == "LPM" {
                validate_lpm(p)?
            } else if id == "ELC" {
                let Some(enabled) = enabled_of(p) else {
                    return Err("ELC: 설정을 확인하세요.".into());
                };
                object(vec![("enabled", json!(enabled))])
            } else if id == "USB" {
                validate_usb(p)?
            } else if id == "CAN0" {
                validate_can(p, clock)?
            } else if digits_after(id, "TRANSFER")
                .is_some_and(|d| d.parse::<f64>().is_ok_and(|n| n <= 31.0))
            {
                validate_transfer(id, p)?
            } else {
                let sci = channel_of(id, "SCI").filter(|ch| SCI_CHANNELS.contains(ch));
                let (Some(ch), Some(enabled)) = (sci, enabled_of(p)) else {
                    return Err(format!("{id}: 지원하지 않는 주변장치입니다."));
                };
                // One SCI channel is either a UART (r_sci_uart, the default) or a simple SPI master (r_sci_spi); the
                // UART settings keep their shape so earlier projects stay unchanged.
                if p.get("mode")
                    .is_some_and(|m| !is_one_of(m, &["UART", "SPI"]))
                {
                    return Err(format!("{id}: 동작 모드는 UART 또는 Simple SPI입니다."));
                }
                if p.get("mode") == Some(&json!("SPI")) {
                    validate_sci_spi(id, ch, p, clock, &signals)?
                } else {
                    if has(&signals, &format!("{id}_SCK")) {
                        return Err(format!("{}: {id}_SCK는 Simple SPI(r_sci_spi) 모드에서 씁니다. {id}의 모드를 Simple SPI로 바꾸세요.", pin_of(&signals, &format!("{id}_SCK"))));
                    }
                    let mut q = object(vec![
                        ("enabled", json!(enabled)),
                        ("baud", or(p, "baud", json!(115_200))),
                        (
                            "callback",
                            or(p, "callback", json!(format!("user_uart{ch}_callback"))),
                        ),
                        ("priority", or(p, "priority", json!(12))),
                    ]);
                    if !int_in(&q["baud"], 300.0, 2_000_000.0) {
                        return Err(format!("{id}: 통신 속도는 300~2000000 bps입니다."));
                    }
                    if !required_callback(&q["callback"]) {
                        return Err(format!("{id}: 콜백 이름은 C 식별자로 쓰세요."));
                    }
                    if !int_in(&q["priority"], 0.0, 15.0) {
                        return Err(priority_error(id));
                    }
                    if enabled
                        && !has(&signals, &format!("{id}_TXD"))
                        && !has(&signals, &format!("{id}_RXD"))
                    {
                        return Err(format!("{id}: TXD 또는 RXD 핀을 정하세요."));
                    }
                    // The UART's transfer instances (p_transfer_tx / p_transfer_rx): a TRANSFERn stack name, or none.
                    for k in ["transferTx", "transferRx"] {
                        if let Some(t) = p.get(k).filter(|t| truthy(t)) {
                            if !t
                                .as_str()
                                .is_some_and(|s| digits_after(s, "TRANSFER").is_some())
                            {
                                return Err(format!("{id}: 전송 인스턴스 이름을 확인하세요."));
                            }
                            q.insert(k.into(), t.clone());
                        }
                    }
                    q
                }
            };
            per.insert(id.clone(), Value::Object(q));
        }
        config["peripherals"] = Value::Object(per);
        check_transfers(&mut config)?;
    }
    let empty = Map::new();
    let per = config
        .get("peripherals")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    for (id, q) in per {
        if let Some(callback) = q.get("callback").filter(|c| truthy(c)) {
            check_name(id, callback)?;
            callbacks.push((id.clone(), callback.clone()));
        }
    }
    // A callback is a function: it cannot have the name of a pin symbol (a macro).
    for (place, name) in &callbacks {
        if name.as_str().is_some_and(|n| labels.iter().any(|l| l == n)) {
            return Err(format!(
                "{place}: 콜백 이름 {}은(는) 핀 이름(심볼)과 같습니다. 다른 이름을 쓰세요.",
                show(Some(name))
            ));
        }
    }
    // hal_data.h declares each callback with its module's argument type: one function can serve stacks of the same
    // kind, but a name shared by modules whose arguments differ is two conflicting declarations. A disabled stack is
    // not generated, so only enabled ones count.
    let mut seen: Vec<(&Value, &str, String)> = Vec::new();
    for (place, name) in &callbacks {
        let stack = per.get(place).filter(|p| truthy(p));
        if stack.is_some_and(|p| !p.get("enabled").is_some_and(truthy)) {
            continue;
        }
        let kind = callback_arg_type(place, stack);
        match seen.iter().find(|(n, _, _)| *n == name) {
            Some((_, other, other_kind)) if *other_kind != kind => {
                return Err(format!(
                    "{place}: 콜백 이름 {}은(는) {other}의 콜백과 같지만 인자 형식이 다릅니다({kind} / {other_kind}). hal_data.h에 서로 다른 선언이 둘 생기니 다른 이름을 쓰세요.",
                    show(Some(name))
                ));
            }
            Some(_) => {}
            None => seen.push((name, place.as_str(), kind)),
        }
    }
    for (signal, pin) in &signals {
        let id = signal.split('_').next().unwrap_or("");
        if !per
            .get(id)
            .and_then(|p| p.get("enabled"))
            .is_some_and(truthy)
        {
            return Err(format!("{pin}: {id}를 켜야 {signal}로 쓸 수 있습니다."));
        }
    }
    let mut clock_out = None;
    if let Some(c) = raw_clock {
        if !truthy(c) || !(c.is_object() || c.is_array()) || marker(c).is_some() {
            return Err("RA 클록 설정을 확인하세요.".into());
        }
        let own = c.as_object();
        let field = |name: &str| -> Value {
            match own.and_then(|o| o.get(name)) {
                Some(v) => v.clone(),
                None => CLOCK_DEFAULT
                    .iter()
                    .find(|(k, _)| *k == name)
                    .map_or(Value::Null, |(_, v)| number(*v)),
            }
        };
        let (hoco, div, mul) = (field("hocoMHz"), field("pllDiv"), field("pllMul"));
        if !is_number_of(&hoco, &[16.0, 18.0, 20.0])
            || !is_number_of(&div, &[1.0, 2.0, 3.0])
            || !int_in(&mul, 10.0, 30.0)
        {
            return Err("RA 클록(HOCO·PLL) 설정을 확인하세요.".into());
        }
        let (hoco, div, mul) = (
            hoco.as_f64().unwrap(),
            div.as_f64().unwrap(),
            mul.as_f64().unwrap(),
        );
        let (pll, input) = (hoco / div * mul, hoco / div);
        if !(8.0..=24.0).contains(&input) || !(120.0..=200.0).contains(&pll) {
            return Err(format!(
                "PLL {} MHz: PLL 입력 8~24 MHz, 출력 120~200 MHz로 설정하세요.",
                js_number(pll)
            ));
        }
        let mut mhz: Vec<f64> = Vec::new();
        for k in [
            "iclkDiv", "pclkaDiv", "pclkbDiv", "pclkcDiv", "pclkdDiv", "fclkDiv",
        ] {
            if !is_number_of(&field(k), &[1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0]) {
                return Err("RA 클록 분주를 확인하세요.".into());
            }
        }
        // RA6E1 operating limits (User's Manual 8.1) and the ratios the clock dividers must keep.
        for (k, _) in CLOCK_LIMITS {
            mhz.push(pll / field(&format!("{k}Div")).as_f64().unwrap());
        }
        for (i, (k, max)) in CLOCK_LIMITS.iter().enumerate() {
            if mhz[i] > max + 1e-9 {
                return Err(format!(
                    "{} {} MHz: 최대 {} MHz입니다.",
                    k.to_uppercase(),
                    fixed3(mhz[i]),
                    js_number(*max)
                ));
            }
        }
        let (iclk, pclka, pclkb, pclkd, fclk) = (mhz[0], mhz[1], mhz[2], mhz[4], mhz[5]);
        if fclk < 4.0 {
            return Err(format!(
                "FCLK {} MHz: 플래시 동작에 4 MHz 이상이 필요합니다.",
                fixed3(fclk)
            ));
        }
        if !(iclk >= pclka && pclka >= pclkb && pclkd >= pclka && iclk >= fclk) {
            return Err(
                "클록 비율: ICLK ≥ PCLKA ≥ PCLKB, PCLKD ≥ PCLKA, ICLK ≥ FCLK로 정하세요.".into(),
            );
        }
        let kept: Map<String, Value> = own
            .into_iter()
            .flatten()
            .filter(|(k, _)| CLOCK_DEFAULT.iter().any(|(d, _)| *d == k.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        clock_out = Some(Value::Object(kept));
    }
    // BSP tab: main stack and heap sizes (bsp_cfg.h BSP_CFG_STACK_MAIN_BYTES / BSP_CFG_HEAP_BYTES).
    let mut bsp_out = None;
    if let Some(b) = mcu.get("bsp") {
        if !b.is_object() || marker(b).is_some() {
            return Err("RA BSP 설정을 확인하세요.".into());
        }
        let (stack, heap) = (
            or(b, "stackBytes", json!(0x400)),
            or(b, "heapBytes", json!(0x400)),
        );
        if !int_in(&stack, 256.0, 131_072.0) || stack.as_f64().unwrap() % 8.0 != 0.0 {
            return Err("Main stack size: 0x100~0x20000 바이트, 8의 배수로 정하세요.".into());
        }
        if !int_in(&heap, 0.0, 131_072.0) || heap.as_f64().unwrap() % 8.0 != 0.0 {
            return Err("Heap size: 0~0x20000 바이트, 8의 배수로 정하세요.".into());
        }
        bsp_out = Some(json!({"stackBytes": stack, "heapBytes": heap}));
    }
    if let Some(clock) = clock_out {
        config["clock"] = clock;
    }
    if let Some(bsp) = bsp_out {
        config["bsp"] = bsp;
    }
    Ok(config)
}

// ---------- what the generator and the emulator ask ----------

/// The FPB-RA6E1's pin configuration as a new project starts (RASC board template: LEDs out low, S1 on IRQ1).
pub fn default_mcu(family: Option<&Value>) -> Result<Value, String> {
    let family = there(family);
    if family.is_some() {
        family_check(family)?;
    }
    Ok(json!({"family": FAMILY_ID, "pins": {
        "P408": {"function": "GPIO_Output", "initial": 0, "drive": "HIGH", "label": "LED1"},
        "P407": {"function": "GPIO_Output", "initial": 0, "drive": "HIGH", "label": "LED2"},
        "P205": {"function": "IRQ", "edge": "FALLING", "pull": "PULLUP", "priority": 12, "label": "SW1", "callback": "external_irq1_callback"},
    }}))
}
/// A 64-bit source mask as [low 32 bits, high bits] from source names and their bit table.
pub fn lpm_mask(names: Option<&Value>, bits: &Value) -> Value {
    let (mut lo, mut hi) = (0u32, 0u32);
    for n in names.and_then(Value::as_array).into_iter().flatten() {
        let Some(b) = there(bits.get(show(Some(n)))).filter(|b| !b.is_null()) else {
            continue;
        };
        let b = to_num(Some(b));
        // `1 << b`: the count is taken modulo 32.
        let shift = |by: f64| {
            if by.is_finite() {
                1u32.wrapping_shl((by.trunc() as i64) as u32)
            } else {
                1
            }
        };
        if b < 32.0 {
            lo |= shift(b);
        } else {
            hi |= shift(b - 32.0);
        }
    }
    json!([lo, hi])
}
/// A watchdog's count clock, timeout clocks and timeout in ms for a configuration ("WDT": PCLKB / divider; "IWDT":
/// 15 kHz / divider).
pub fn wdt_timing(mcu: &Value, id: &str) -> Result<Value, String> {
    let Some((_, _, timeout, divider)) = wdt_info(id) else {
        return Err(BROKEN.into());
    };
    let own = mcu
        .get("peripherals")
        .and_then(|p| p.get(id))
        .filter(|p| truthy(p))
        .and_then(Value::as_object);
    let field = |name: &str, default: f64| {
        own.and_then(|o| o.get(name))
            .cloned()
            .unwrap_or_else(|| number(default))
    };
    let (timeout, divider) = (field("timeout", timeout), field("clockDiv", divider));
    let source = if id == "IWDT" {
        IWDT_HZ
    } else {
        clock_hz(mcu, Some(&json!("pclkb")))?
    };
    let hz = source / to_num(Some(&divider));
    Ok(json!({"hz": out(hz), "clocks": timeout, "ms": out(to_num(Some(&timeout)) / hz * 1000.0)}))
}
/// OFS0 (BSP_CFG_OPTION_SETTING_OFS0) for a configuration: erased (0xFFFFFFFF) but for an auto-started watchdog. Bit
/// positions: r_iwdt.c IWDT_PRV_OFS0_* (IWDTSTRT b1, TOPS b3:2, CKS b7:4, RSTIRQS b12) and r_wdt.c WDT_PRV_OFSX_* (the
/// WDT fields from b16); the IWDT window and stop bits (RPES b9:8, RPSS b11:10, STPCTL b14) mirror them.
pub fn ofs0(mcu: &Value) -> u32 {
    let mut ofs: i32 = -1;
    for (id, base) in [("IWDT", 0u32), ("WDT", 16)] {
        // The same defaults the check fills in, so an unvalidated configuration gives the same OFS0.
        let Some(raw) = mcu.get("peripherals").and_then(|p| p.get(id)) else {
            continue;
        };
        if !raw.get("enabled").is_some_and(truthy)
            || (id == "WDT" && raw.get("startMode") != Some(&json!("AUTO")))
        {
            continue;
        }
        let (timeouts, _, timeout, divider) = wdt_info(id).unwrap();
        let field = |name: &str, default: Value| raw.get(name).cloned().unwrap_or(default);
        let code = |table: &[(&str, i32)], v: &Value| {
            table
                .iter()
                .find(|(k, _)| *k == show(Some(v)))
                .map_or(0, |(_, c)| *c)
        };
        let tops = field("timeout", number(timeout))
            .as_f64()
            .and_then(|t| timeouts.iter().position(|x| *x == t))
            .map_or(-1, |i| i as i32);
        let reset = i32::from(field("reset", json!("RESET")) == "RESET");
        let stop = i32::from(raw.get("stopInSleep").is_some_and(truthy));
        let value = tops.wrapping_shl(2)
            | code(&WDT_DIVISION_CODE, &field("clockDiv", number(divider))).wrapping_shl(4)
            | code(&WDT_END_CODE, &field("windowEnd", json!(0))).wrapping_shl(8)
            | code(&WDT_START_CODE, &field("windowStart", json!(100))).wrapping_shl(10)
            | (reset << 12)
            | (stop << 14);
        // Bits 0, 13 and 15 of each half are reserved (stay 1).
        ofs = (ofs & !(0x5ffe << base)) | value.wrapping_shl(base);
    }
    ofs as u32
}
/// PSEL of a peripheral signal ("SCI9_TXD" → 5).
pub fn psel(signal: &str) -> Result<u32, String> {
    js_re!(GPT, r"^GPT\d_GTIOC[AB]$");
    js_re!(IIC, r"^IIC\d_(SCL|SDA)$");
    js_re!(SPI, r"^SPI\d_(RSPCK|MOSI|MISO|SSL\d)$");
    let b = signal.as_bytes();
    if signal.starts_with("SCI") && b.len() >= 5 && b[3].is_ascii_digit() && b[4] == b'_' {
        return Ok(if matches!(b[3], b'0' | b'2' | b'4') {
            4
        } else {
            5
        });
    }
    if GPT.is_match(signal) {
        return Ok(3);
    }
    if IIC.is_match(signal) {
        return Ok(7);
    }
    if SPI.is_match(signal) {
        return Ok(6);
    }
    Err(format!("{signal}: 지원하지 않는 주변장치 신호입니다."))
}
/// Events a transfer may start on: a DTC on an interrupt that has a vector, a DMAC on any of them or by software.
/// An SCI event belongs to the UART's own transfer, so a stand-alone transfer does not offer it; DTC_COMPLETE is not
/// offered (neither engine raises it), and a DTC cannot take a software event (it has no vector).
pub fn transfer_events(driver: Option<&str>) -> Vec<&'static str> {
    let (dmac, dtc) = (driver == Some("DMAC"), driver == Some("DTC"));
    let mut events: Vec<&'static str> = if dmac { vec!["SOFTWARE"] } else { Vec::new() };
    events.extend(ELC_EVENTS.iter().map(|(k, _)| k.as_str()).filter(|k| {
        !k.starts_with("SCI")
            && *k != "DTC_COMPLETE"
            && !(dtc
                && (k.starts_with("DMAC") || k.starts_with("DTC") || k.starts_with("ELC_SOFT")))
    }));
    events
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| {
        args.get(i)
            .filter(|x| marker(x) != Some("undefined"))
            .unwrap_or(&null)
    };
    let a = |i: usize| there(args.get(i));
    let text = |i: usize| show(a(i));
    Some(match name {
        "ra_tables" => Ok(tables()),
        "ra_irq_name" => Ok(json!(irq_name(&text(0)))),
        "ra_pin_name" => Ok(json!(pin_name(a(0)))),
        "ra_port_bit" => port_bit(a(0)).map(|(port, bit)| json!({"port": port, "bit": bit})),
        "ra_default_mcu" => default_mcu(a(0)),
        "ra_name_problem" => Ok(json!(name_problem(a(0)))),
        "ra_uart_channels" => Ok(json!(uart_channels(v(0)))),
        "validate_ra_mcu" => validate_ra_mcu(v(0)),
        "ra_spi_bitrate" => spi_bitrate(to_num(a(0)), to_num(a(1)), &text(1)),
        "ra_sci_spi_bitrate" => sci_spi_bitrate(to_num(a(0)), to_num(a(1)), &text(1)),
        "ra_iic_clock" => iic_clock(to_num(a(0)), a(1)),
        "ra_iic_slave_clock" => iic_slave_clock(to_num(a(0)), a(1)),
        "ra_agt_counts" => agt_counts(to_num(a(0)), &text(1), to_num(a(2)), &text(3)),
        "ra_gpt_counts" => gpt_counts(
            to_num(a(0)),
            &text(1),
            a(1).and_then(Value::as_f64)
                .is_some_and(|c| c == 1.0 || c == 2.0),
            to_num(a(2)),
            &text(3),
            a(4).map_or(50.0, |d| to_num(Some(d))),
        ),
        "ra_clock_hz" => {
            if a(0).is_none() || v(0).is_null() {
                family_check(None).map(|()| Value::Null)
            } else {
                clock_hz(v(0), a(1)).map(out)
            }
        }
        "ra_can_timing" => Ok(can_timing(to_num(a(0)), to_num(a(1)))),
        "ra_ds_pin" => Ok(a(0)
            .and_then(Value::as_f64)
            .and_then(|ch| {
                IRQ_DS
                    .iter()
                    .find(|pin| irq_of(pin).is_some_and(|n| f64::from(n) == ch))
            })
            .map_or(Value::Null, |pin| json!(pin))),
        "ra_elc_event_name" => Ok(a(0)
            .and_then(Value::as_f64)
            .and_then(|n| ELC_EVENTS.iter().find(|(_, e)| f64::from(*e) == n))
            .map_or(Value::Null, |(k, _)| json!(k))),
        "ra_transfer_events" => Ok(json!(transfer_events(a(0).and_then(Value::as_str)))),
        "ra_event_has_vector" => event_has_vector(v(0), &text(1)).map(|b| json!(b)),
        "ra_lpm_mask" => Ok(lpm_mask(a(0), v(1))),
        "ra_wdt_timing" => wdt_timing(v(0), &text(1)),
        "ra_ofs0" => Ok(json!(ofs0(v(0)))),
        "ra_psel" => psel(&text(0)).map(|n| json!(n)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_numbers() {
        assert_eq!(pin_name(Some(&json!(" p408 "))), "P408");
        assert_eq!(pin_name(Some(&json!("BSP_IO_PORT_04_PIN_08"))), "P408");
        assert_eq!(port_bit(Some(&json!("P1008"))).unwrap(), (10, 8));
        assert!(port_bit(Some(&json!("PA5")))
            .unwrap_err()
            .ends_with(": PA5"));
        assert_eq!(irq_name("P205"), "IRQ1-DS");
        assert_eq!(irq_name("P104"), "IRQ1");
        assert_eq!(irq_name("P003"), "");
        assert_eq!(text_number(" 0x10 "), 16.0);
        assert!(text_number("1e").is_nan());
        assert_eq!(fixed3(3.9375), "3.938");
        assert_eq!(fixed3(0.0625), "0.063");
        assert_eq!(fixed3(133.333_333_333_333_34), "133.333");
        assert_eq!(
            name_problem(Some(&json!("int"))),
            "int은(는) C나 생성 코드가 쓰는 이름입니다"
        );
        assert_eq!(name_problem(Some(&json!("g_button_on_press"))), "");
        assert!(name_problem(Some(&json!("g_uart0_ctrl"))).ends_with("인스턴스 이름입니다"));
        assert_eq!(psel("SCI9_TXD").unwrap(), 5);
        assert_eq!(psel("GPT1_GTIOCA").unwrap(), 3);
    }

    #[test]
    fn rates() {
        assert_eq!(
            spi_bitrate(100e6, 1e6, "1000000").unwrap(),
            json!({"spbr": 49, "brdv": 0, "actual": 1_000_000})
        );
        assert_eq!(
            gpt_counts(100e6, "1", true, 1.0, "kHz", 50.0).unwrap(),
            json!({"div": 0, "counts": 100_000, "duty": 50_000, "hz": 1000})
        );
        assert_eq!(can_timing(50e6, 500.0)["brp"], 5);
        assert_eq!(iic_clock(50e6, Some(&json!("STANDARD"))).unwrap()["cks"], 3);
    }

    #[test]
    fn a_new_project_is_valid() {
        let mcu = default_mcu(None).unwrap();
        let checked = validate_ra_mcu(&mcu).unwrap();
        assert_eq!(
            checked["pins"]["P205"],
            json!({"function": "IRQ", "label": "SW1", "pull": "PULLUP", "edge": "FALLING", "priority": 12, "callback": "external_irq1_callback"})
        );
        let mut two = mcu.clone();
        two["pins"]["P104"] = json!({"function": "IRQ"});
        assert_eq!(
            validate_ra_mcu(&two).unwrap_err(),
            "P104: IRQ1는 이미 P205(IRQ1-DS)에서 씁니다. IRQ1와 같은 채널이라 함께 쓸 수 없습니다."
        );
        assert_eq!(ofs0(&json!({})), 0xffff_ffff);
    }
}
