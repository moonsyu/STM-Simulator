//! CubeMX Clock Configuration for the two NUCLEO boards: the clock sources, PLL and bus dividers of a project
//! (`mcu.clock`), the frequencies they give, CubeMX's limits, and the values a .ioc stores. Limits are from the CubeMX
//! 6.18 database (db/mcu/IP/RCC-STM32F446-rcc_v1_0_Modes.xml, RCC-STM32F102_rcc_v1_0_Modes.xml for the F103).
//! HSE is the NUCLEO's ST-LINK MCO, 8 MHz in BYPASS mode (no crystal is fitted on X3 by default).
//! A project without `mcu.clock` keeps the older single setting (APB1 timer clock, HSI only): see `tree_from_timer_hz`.
//!
//! Moved here from `src/clock-tree.js` (feature 62, the move of the app's logic to Rust); that file now only calls
//! these functions. A tree is a JSON object as the project stores it: a stored value can be anything, so the fields
//! are read as JSON values and checked by `validate`.

use serde_json::{json, Map, Value};

pub const HSE_HZ: f64 = 8e6;
pub const AHB_DIVIDERS: [f64; 9] = [1.0, 2.0, 4.0, 8.0, 16.0, 64.0, 128.0, 256.0, 512.0];
pub const APB_DIVIDERS: [f64; 5] = [1.0, 2.0, 4.0, 8.0, 16.0];
pub const ADC_PRESCALERS: [f64; 4] = [2.0, 4.0, 6.0, 8.0];
pub const PLLP_VALUES: [f64; 4] = [2.0, 4.0, 6.0, 8.0];
const F4: &str = "STM32F446RE";
const F1: &str = "STM32F103RB";

/// CubeMX's limits of a family (Hz; `[low, high]` ranges).
pub struct Limits {
    pub pll_m: [f64; 2],
    pub pll_n: [f64; 2],
    pub pll_q: [f64; 2],
    pub pll_mul: [f64; 2],
    pub vco_in: [f64; 2],
    pub vco: [f64; 2],
    pub pll: [f64; 2],
    pub sysclk: f64,
    pub hclk: f64,
    pub pclk1: f64,
    pub pclk2: f64,
    pub adc: f64,
}
const LIMITS_F4: Limits = Limits {
    pll_m: [2.0, 63.0],
    pll_n: [50.0, 432.0],
    pll_q: [2.0, 15.0],
    pll_mul: [0.0, 0.0],
    vco_in: [0.95e6, 2.1e6],
    vco: [100e6, 432e6],
    pll: [24e6, 180e6],
    sysclk: 180e6,
    hclk: 180e6,
    pclk1: 45e6,
    pclk2: 90e6,
    adc: 36e6,
};
const LIMITS_F1: Limits = Limits {
    pll_m: [0.0, 0.0],
    pll_n: [0.0, 0.0],
    pll_q: [0.0, 0.0],
    pll_mul: [2.0, 16.0],
    vco_in: [0.0, 0.0],
    vco: [0.0, 0.0],
    pll: [0.0, 72e6],
    sysclk: 72e6,
    hclk: 72e6,
    pclk1: 36e6,
    pclk2: 72e6,
    adc: 14e6,
};

pub fn is_f1(family: &str) -> bool {
    family == F1
}
pub fn limits(family: &str) -> Result<&'static Limits, String> {
    match family {
        F4 => Ok(&LIMITS_F4),
        F1 => Ok(&LIMITS_F1),
        _ => Err(format!("지원하지 않는 MCU입니다: {family}")),
    }
}
/// The internal oscillator; a family the table does not have counts as 16 MHz (as the F446).
pub fn hsi_hz(family: &str) -> f64 {
    if is_f1(family) {
        8e6
    } else {
        16e6
    }
}

/// The tables the screens show: `{hsi, hse, ahb, apb, adc, pllP, limits}`.
pub fn tables() -> Value {
    let range = |r: [f64; 2]| json!([r[0], r[1]]);
    let f4 = &LIMITS_F4;
    let f1 = &LIMITS_F1;
    json!({
        "hsi": { F4: hsi_hz(F4), F1: hsi_hz(F1) },
        "hse": HSE_HZ,
        "ahb": AHB_DIVIDERS,
        "apb": APB_DIVIDERS,
        "adc": ADC_PRESCALERS,
        "pllP": PLLP_VALUES,
        "limits": {
            F4: { "pllM": range(f4.pll_m), "pllN": range(f4.pll_n), "pllQ": range(f4.pll_q), "vcoIn": range(f4.vco_in),
                  "vco": range(f4.vco), "pll": range(f4.pll), "sysclk": f4.sysclk, "hclk": f4.hclk, "pclk1": f4.pclk1,
                  "pclk2": f4.pclk2, "adc": f4.adc },
            F1: { "pllMul": range(f1.pll_mul), "pll": range(f1.pll), "sysclk": f1.sysclk, "hclk": f1.hclk,
                  "pclk1": f1.pclk1, "pclk2": f1.pclk2, "adc": f1.adc },
        },
    })
}

fn tree(pairs: &[(&str, Value)]) -> Map<String, Value> {
    pairs
        .iter()
        .map(|(key, value)| (key.to_string(), value.clone()))
        .collect()
}

/// CubeMX's values for a new project: HSI straight to SYSCLK, every divider 1.
pub fn default_tree(family: &str) -> Map<String, Value> {
    if is_f1(family) {
        tree(&[
            ("sysclkSource", json!("HSI")),
            ("pllSource", json!("HSI")),
            ("hsePrediv", json!(1)),
            ("pllMul", json!(2)),
            ("ahb", json!(1)),
            ("apb1", json!(1)),
            ("apb2", json!(1)),
            ("adcPrescaler", json!(2)),
        ])
    } else {
        tree(&[
            ("sysclkSource", json!("HSI")),
            ("pllSource", json!("HSI")),
            ("pllM", json!(16)),
            ("pllN", json!(192)),
            ("pllP", json!(2)),
            ("pllQ", json!(2)),
            ("ahb", json!(1)),
            ("apb1", json!(1)),
            ("apb2", json!(1)),
            ("adcPrescaler", json!(4)),
        ])
    }
}

/// A number as JSON: a whole one without a fraction (`72` rather than `72.0`), as the project files have them.
fn number(v: f64) -> Value {
    if v.is_finite() && v.fract() == 0.0 && v.abs() < 9e15 {
        json!(v as i64)
    } else {
        json!(v)
    }
}

/// The tree the older single setting stands for (the generator's HSI plans for an APB1 timer clock).
pub fn tree_from_timer_hz(family: &str, hz: f64) -> Map<String, Value> {
    let mut t = default_tree(family);
    if is_f1(family) {
        let adc = ADC_PRESCALERS
            .iter()
            .copied()
            .find(|n| hz / n <= 14e6)
            .unwrap_or(8.0);
        t.insert("adcPrescaler".into(), number(adc));
        if hz != 8e6 {
            t.insert("sysclkSource".into(), json!("PLLCLK"));
            t.insert("pllSource".into(), json!("HSI"));
            t.insert("pllMul".into(), number(hz / 4e6));
            t.insert("apb1".into(), json!(if hz > 36e6 { 2 } else { 1 }));
        }
        return t;
    }
    if hz == 16e6 {
        return t;
    }
    for p in [4.0, 2.0, 6.0, 8.0] {
        let n = hz * p / 1e6;
        if n.is_finite() && n.fract() == 0.0 && (100.0..=432.0).contains(&n) {
            t.insert("sysclkSource".into(), json!("PLLCLK"));
            t.insert("pllSource".into(), json!("HSI"));
            t.insert("pllM".into(), json!(16));
            t.insert("pllN".into(), number(n));
            t.insert("pllP".into(), number(p));
            t.insert("pllQ".into(), json!(7));
            t.insert("apb1".into(), json!(2));
            return t;
        }
    }
    t
}

/// Frequencies in Hz: the PLL stages, SYSCLK, HCLK, PCLK1/2, the APB1/APB2 timer clocks and the ADC clock.
/// (`vco_in`, `vco` and `pll_q` are for the F446 only.)
pub struct Frequencies {
    pub hsi: f64,
    pub vco_in: Option<f64>,
    pub vco: Option<f64>,
    pub pll: f64,
    pub pll_q: Option<f64>,
    pub sysclk: f64,
    pub hclk: f64,
    pub pclk1: f64,
    pub pclk2: f64,
    pub tim1: f64,
    pub tim2: f64,
    pub adc: f64,
}
fn num(t: &Map<String, Value>, key: &str) -> f64 {
    t.get(key).and_then(Value::as_f64).unwrap_or(f64::NAN)
}
fn word<'a>(t: &'a Map<String, Value>, key: &str) -> &'a str {
    t.get(key).and_then(Value::as_str).unwrap_or("")
}
pub fn frequencies(family: &str, t: &Map<String, Value>) -> Frequencies {
    let hsi = hsi_hz(family);
    let hse_pll = word(t, "pllSource") == "HSE";
    let (mut vco_in, mut vco) = (None, None);
    let pll;
    if is_f1(family) {
        let prediv = num(t, "hsePrediv");
        let prediv = if prediv.is_nan() || prediv == 0.0 {
            1.0
        } else {
            prediv
        };
        pll = (if hse_pll { HSE_HZ / prediv } else { hsi / 2.0 }) * num(t, "pllMul");
    } else {
        let input = (if hse_pll { HSE_HZ } else { hsi }) / num(t, "pllM");
        let out = input * num(t, "pllN");
        pll = out / num(t, "pllP");
        vco_in = Some(input);
        vco = Some(out);
    }
    let sysclk = match word(t, "sysclkSource") {
        "HSE" => HSE_HZ,
        "PLLCLK" => pll,
        _ => hsi,
    };
    let (ahb, apb1, apb2) = (num(t, "ahb"), num(t, "apb1"), num(t, "apb2"));
    let hclk = sysclk / ahb;
    let (pclk1, pclk2) = (hclk / apb1, hclk / apb2);
    let timer = |pclk: f64, div: f64| if div == 1.0 { pclk } else { pclk * 2.0 };
    Frequencies {
        hsi,
        vco_in,
        vco,
        pll,
        pll_q: vco.map(|v| v / num(t, "pllQ")),
        sysclk,
        hclk,
        pclk1,
        pclk2,
        tim1: timer(pclk1, apb1),
        tim2: timer(pclk2, apb2),
        adc: pclk2 / num(t, "adcPrescaler"),
    }
}
pub fn frequencies_json(q: &Frequencies) -> Value {
    json!({
        "hsi": q.hsi, "hse": HSE_HZ, "vcoIn": q.vco_in, "vco": q.vco, "pll": q.pll, "pllQ": q.pll_q,
        "sysclk": q.sysclk, "hclk": q.hclk, "pclk1": q.pclk1, "pclk2": q.pclk2, "tim1": q.tim1, "tim2": q.tim2,
        "adc": q.adc,
    })
}

/// Flash wait states for HCLK (F446 at 2.7-3.6 V: one per 30 MHz; F103: 0 to 24 MHz, 1 to 48 MHz, 2 above).
pub fn flash_latency(family: &str, hclk: f64) -> u32 {
    if is_f1(family) {
        if hclk <= 24e6 {
            0
        } else if hclk <= 48e6 {
            1
        } else {
            2
        }
    } else {
        ((hclk / 30e6).ceil() - 1.0).clamp(0.0, 5.0) as u32
    }
}
/// F446 above 168 MHz needs the regulator's over-drive mode.
pub fn needs_over_drive(family: &str, hclk: f64) -> bool {
    !is_f1(family) && hclk > 168e6
}

/// A number as the messages show it: at most three decimals, no trailing zeros (`2.1`, `180`).
fn plain(v: f64) -> String {
    if !v.is_finite() {
        return if v.is_nan() {
            "NaN".into()
        } else if v > 0.0 {
            "Infinity".into()
        } else {
            "-Infinity".into()
        };
    }
    let thousandths = (v * 1000.0).round();
    let text = format!("{:.3}", thousandths / 1000.0);
    let text = text.trim_end_matches('0').trim_end_matches('.');
    if text == "-0" {
        "0".into()
    } else {
        text.to_string()
    }
}
/// A frequency for a message: `180 MHz`, `22.5 MHz`.
pub fn mhz(hz: f64) -> String {
    format!("{} MHz", plain(hz / 1e6))
}

/// CubeMX's red marks, in words: every frequency over its limit and every PLL stage out of its range.
pub fn problems(family: &str, t: &Map<String, Value>) -> Result<Vec<String>, String> {
    let limit = limits(family)?;
    let q = frequencies(family, t);
    let uses_pll = word(t, "sysclkSource") == "PLLCLK";
    let mut out = Vec::new();
    if !is_f1(family) && uses_pll {
        let (vco_in, vco) = (q.vco_in.unwrap_or(f64::NAN), q.vco.unwrap_or(f64::NAN));
        if vco_in < limit.vco_in[0] || vco_in > limit.vco_in[1] {
            out.push(format!(
                "PLL 입력(VCO input) {}: {}~{}이어야 합니다(PLLM을 바꾸세요).",
                mhz(vco_in),
                mhz(limit.vco_in[0]),
                mhz(limit.vco_in[1])
            ));
        }
        if vco < limit.vco[0] || vco > limit.vco[1] {
            out.push(format!(
                "VCO 출력 {}: {}~{}이어야 합니다(PLLN을 바꾸세요).",
                mhz(vco),
                mhz(limit.vco[0]),
                mhz(limit.vco[1])
            ));
        }
        if q.pll < limit.pll[0] || q.pll > limit.pll[1] {
            out.push(format!(
                "PLLCLK {}: {}~{}이어야 합니다.",
                mhz(q.pll),
                mhz(limit.pll[0]),
                mhz(limit.pll[1])
            ));
        }
    }
    if is_f1(family) && uses_pll && q.pll > limit.pll[1] {
        out.push(format!(
            "PLLCLK {}: 72 MHz 이하여야 합니다(PLLMul을 줄이세요).",
            mhz(q.pll)
        ));
    }
    for (value, max, name) in [
        (q.sysclk, limit.sysclk, "SYSCLK"),
        (q.hclk, limit.hclk, "HCLK"),
        (q.pclk1, limit.pclk1, "APB1(PCLK1)"),
        (q.pclk2, limit.pclk2, "APB2(PCLK2)"),
    ] {
        if value > max {
            out.push(format!("{name} {}: 최대 {}입니다.", mhz(value), mhz(max)));
        }
    }
    Ok(out)
}
/// The ADC clock limit only matters when ADC1 is on (CubeMX shows it red then).
pub fn adc_problem(family: &str, t: &Map<String, Value>) -> Result<Option<String>, String> {
    let max = limits(family)?.adc;
    let adc = frequencies(family, t).adc;
    Ok((adc > max).then(|| {
        format!(
            "ADC 클록 {}: 최대 {}입니다(ADC Prescaler를 키우세요).",
            mhz(adc),
            mhz(max)
        )
    }))
}

fn whole(value: Option<&Value>, range: [f64; 2], name: &str) -> Result<Value, String> {
    match value.and_then(Value::as_f64) {
        Some(v) if v.fract() == 0.0 && v >= range[0] && v <= range[1] => Ok(number(v)),
        _ => Err(format!(
            "클록 설정 {name}: {}~{} 정수로 설정하세요.",
            plain(range[0]),
            plain(range[1])
        )),
    }
}
fn one_of(value: Option<&Value>, list: &[f64], name: &str) -> Result<Value, String> {
    match value.and_then(Value::as_f64) {
        Some(v) if list.contains(&v) => Ok(number(v)),
        _ => Err(format!(
            "클록 설정 {name}: {} 중에서 고르세요.",
            list.iter().map(|v| plain(*v)).collect::<Vec<_>>().join("/")
        )),
    }
}
fn word_of(value: Option<&Value>, list: &[&str], name: &str) -> Result<Value, String> {
    match value.and_then(Value::as_str) {
        Some(v) if list.contains(&v) => Ok(json!(v)),
        _ => Err(format!(
            "클록 설정 {name}: {} 중에서 고르세요.",
            list.join("/")
        )),
    }
}

/// A stored tree checked field by field (missing fields take the CubeMX defaults).
pub fn validate(family: &str, raw: &Value) -> Result<Map<String, Value>, String> {
    let Value::Object(raw) = raw else {
        return Err("클록 설정이 올바르지 않습니다.".into());
    };
    let limit = limits(family)?;
    let mut t = default_tree(family);
    for (key, value) in raw {
        t.insert(key.clone(), value.clone());
    }
    let mut out = Map::new();
    out.insert(
        "sysclkSource".into(),
        word_of(
            t.get("sysclkSource"),
            &["HSI", "HSE", "PLLCLK"],
            "System Clock Mux",
        )?,
    );
    out.insert(
        "pllSource".into(),
        word_of(t.get("pllSource"), &["HSI", "HSE"], "PLL Source Mux")?,
    );
    if is_f1(family) {
        out.insert(
            "hsePrediv".into(),
            one_of(t.get("hsePrediv"), &[1.0, 2.0], "HSE Prediv")?,
        );
        out.insert(
            "pllMul".into(),
            whole(t.get("pllMul"), limit.pll_mul, "PLLMul")?,
        );
    } else {
        out.insert("pllM".into(), whole(t.get("pllM"), limit.pll_m, "PLLM")?);
        out.insert("pllN".into(), whole(t.get("pllN"), limit.pll_n, "PLLN")?);
        out.insert("pllP".into(), one_of(t.get("pllP"), &PLLP_VALUES, "PLLP")?);
        out.insert("pllQ".into(), whole(t.get("pllQ"), limit.pll_q, "PLLQ")?);
    }
    out.insert(
        "ahb".into(),
        one_of(t.get("ahb"), &AHB_DIVIDERS, "AHB Prescaler")?,
    );
    out.insert(
        "apb1".into(),
        one_of(t.get("apb1"), &APB_DIVIDERS, "APB1 Prescaler")?,
    );
    out.insert(
        "apb2".into(),
        one_of(t.get("apb2"), &APB_DIVIDERS, "APB2 Prescaler")?,
    );
    out.insert(
        "adcPrescaler".into(),
        one_of(t.get("adcPrescaler"), &ADC_PRESCALERS, "ADC Prescaler")?,
    );
    Ok(out)
}

/// The RCC keys of a .ioc that are settings (the computed *Freq_Value numbers alone do not make a tree).
const IOC_SETTINGS: [&str; 11] = [
    "RCC.SYSCLKSource",
    "RCC.PLLSourceVirtual",
    "RCC.PLLM",
    "RCC.PLLN",
    "RCC.PLLP",
    "RCC.PLLQ",
    "RCC.PLLMUL",
    "RCC.HSEDivPLL",
    "RCC.AHBCLKDivider",
    "RCC.APB1CLKDivider",
    "RCC.APB2CLKDivider",
];
/// The number a .ioc value ends with (`RCC_PLL_MUL9` → 9).
fn trailing_number(text: &str) -> Option<f64> {
    let digits = text.chars().rev().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    text[text.len() - digits..].parse().ok()
}
/// A .ioc value as a number, as JavaScript's `Number()` reads it: 0 when it is not one.
fn as_number(text: &str) -> f64 {
    let text = text.trim();
    if text.is_empty() {
        return 0.0;
    }
    match text.parse::<f64>() {
        Ok(v) if !v.is_nan() => v,
        _ => 0.0,
    }
}

/// The tree a CubeMX .ioc describes; keys it leaves out are CubeMX defaults. `None` when the .ioc sets no RCC values.
pub fn tree_from_ioc(
    family: &str,
    values: &Map<String, Value>,
) -> Result<Option<Map<String, Value>>, String> {
    if !IOC_SETTINGS.iter().any(|key| values.contains_key(*key)) {
        return Ok(None);
    }
    let value = |key: &str| values.get(key).and_then(Value::as_str).unwrap_or("");
    let numbered = |key: &str, default: f64| number(trailing_number(value(key)).unwrap_or(default));
    let mut t = default_tree(family);
    let source = value("RCC.SYSCLKSource");
    if let Some(at) = source.find("RCC_SYSCLKSOURCE_") {
        let rest = &source[at + "RCC_SYSCLKSOURCE_".len()..];
        for name in ["HSI", "HSE", "PLLCLK"] {
            if rest.starts_with(name) {
                t.insert("sysclkSource".into(), json!(name));
                break;
            }
        }
    }
    if value("RCC.PLLSourceVirtual").contains("HSE") {
        t.insert("pllSource".into(), json!("HSE"));
    }
    t.insert("ahb".into(), numbered("RCC.AHBCLKDivider", 1.0));
    t.insert("apb1".into(), numbered("RCC.APB1CLKDivider", 1.0));
    t.insert("apb2".into(), numbered("RCC.APB2CLKDivider", 1.0));
    if is_f1(family) {
        t.insert("pllMul".into(), numbered("RCC.PLLMUL", 2.0));
        t.insert(
            "hsePrediv".into(),
            json!(if value("RCC.HSEDivPLL").contains("DIV2") {
                2
            } else {
                1
            }),
        );
        t.insert("adcPrescaler".into(), numbered("RCC.ADCPresc", 2.0));
    } else {
        t.insert("pllM".into(), numbered("RCC.PLLM", 16.0));
        t.insert("pllN".into(), numbered("RCC.PLLN", 192.0));
        t.insert("pllP".into(), numbered("RCC.PLLP", 2.0));
        t.insert("pllQ".into(), numbered("RCC.PLLQ", 2.0));
        t.insert("adcPrescaler".into(), numbered("ADC1.ClockPrescaler", 4.0));
    }
    // CubeMX leaves out a setting that has its default value, and which value is the default depends on its version and
    // on the oscillator pins (real files have a PLL fed by HSE with no RCC.PLLSourceVirtual line). The frequency CubeMX
    // computed is in the file, so when the tree read so far does not give that SYSCLK and the other PLL source does, the
    // other source is the one meant.
    let want = as_number(value("RCC.SYSCLKFreq_VALUE"));
    if want != 0.0
        && word(&t, "sysclkSource") == "PLLCLK"
        && value("RCC.PLLSourceVirtual").is_empty()
    {
        let sysclk = |x: &Map<String, Value>| {
            validate(family, &Value::Object(x.clone()))
                .map(|valid| frequencies(family, &valid).sysclk)
                .unwrap_or(0.0)
        };
        let other_source = if word(&t, "pllSource") == "HSE" {
            "HSI"
        } else {
            "HSE"
        };
        let mut other = t.clone();
        other.insert("pllSource".into(), json!(other_source));
        // The same with the crystal of another board (RCC.HSE_VALUE): the tree is an HSE one, and the import says so.
        let hse = as_number(value("RCC.HSE_VALUE"));
        let crystal = if hse == 0.0 {
            0.0
        } else if is_f1(family) {
            let prediv = num(&t, "hsePrediv");
            hse / (if prediv.is_nan() || prediv == 0.0 {
                1.0
            } else {
                prediv
            }) * num(&t, "pllMul")
        } else {
            hse / num(&t, "pllM") * num(&t, "pllN") / num(&t, "pllP")
        };
        let other_fits = (sysclk(&other) - want).abs() <= 1.0;
        if (sysclk(&t) - want).abs() > 1.0 && (other_fits || (crystal - want).abs() <= 1.0) {
            t.insert(
                "pllSource".into(),
                json!(if other_fits { other_source } else { "HSE" }),
            );
        }
    }
    validate(family, &Value::Object(t)).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn object(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap()
    }

    #[test]
    fn f446_hse_pll_180_mhz() {
        let t = object(
            json!({"sysclkSource":"PLLCLK","pllSource":"HSE","pllM":4,"pllN":180,"pllP":2,"pllQ":8,"ahb":1,"apb1":4,"apb2":2,"adcPrescaler":4}),
        );
        let q = frequencies(F4, &t);
        assert_eq!(
            (q.vco_in, q.vco, q.sysclk, q.pclk1, q.tim1, q.pclk2, q.tim2, q.adc),
            (
                Some(2e6),
                Some(360e6),
                180e6,
                45e6,
                90e6,
                90e6,
                180e6,
                22.5e6
            )
        );
        assert_eq!(flash_latency(F4, q.hclk), 5);
        assert!(needs_over_drive(F4, q.hclk));
        assert!(problems(F4, &t).unwrap().is_empty());
    }

    #[test]
    fn f103_trees_and_the_older_single_setting() {
        let t = tree_from_timer_hz(F1, 64e6);
        let q = frequencies(F1, &t);
        assert_eq!((q.sysclk, q.pclk1, q.tim1), (64e6, 32e6, 64e6));
        assert!(q.adc <= 14e6);
        assert_eq!(tree_from_timer_hz(F4, 16e6), default_tree(F4));
        let t = tree_from_timer_hz(F4, 84e6);
        assert_eq!(frequencies(F4, &t).tim1, 84e6);
        // No family and no clock (a project without an MCU): the F446 defaults.
        assert_eq!(tree_from_timer_hz("", f64::NAN), default_tree(""));
    }

    #[test]
    fn red_marks_in_words() {
        let t = object(
            json!({"sysclkSource":"PLLCLK","pllSource":"HSE","pllM":2,"pllN":180,"pllP":2,"pllQ":8,"ahb":1,"apb1":4,"apb2":2,"adcPrescaler":4}),
        );
        let text = problems(F4, &t).unwrap().join("\n");
        assert!(
            text.contains("PLL 입력(VCO input) 4 MHz: 0.95 MHz~2.1 MHz이어야 합니다"),
            "{text}"
        );
        let f1 = object(
            json!({"sysclkSource":"PLLCLK","pllSource":"HSE","hsePrediv":1,"pllMul":9,"ahb":1,"apb1":2,"apb2":1,"adcPrescaler":2}),
        );
        assert_eq!(
            adc_problem(F1, &f1).unwrap().unwrap(),
            "ADC 클록 36 MHz: 최대 14 MHz입니다(ADC Prescaler를 키우세요)."
        );
        assert!(problems("STM32", &t).is_err());
    }

    #[test]
    fn validate_fills_defaults_and_refuses_bad_fields() {
        let v = validate(F4, &json!({"pllN": 100})).unwrap();
        assert_eq!(v["pllN"], json!(100));
        assert_eq!(v["pllM"], json!(16));
        assert_eq!(v.keys().map(String::as_str).collect::<Vec<_>>().len(), 10);
        assert_eq!(
            validate(F4, &json!({"pllP": 3})).unwrap_err(),
            "클록 설정 PLLP: 2/4/6/8 중에서 고르세요."
        );
        assert_eq!(
            validate(F1, &json!({"pllMul": 17})).unwrap_err(),
            "클록 설정 PLLMul: 2~16 정수로 설정하세요."
        );
        assert_eq!(
            validate(F1, &json!({"pllMul": null})).unwrap_err(),
            "클록 설정 PLLMul: 2~16 정수로 설정하세요."
        );
        assert_eq!(
            validate(F4, &json!("fast")).unwrap_err(),
            "클록 설정이 올바르지 않습니다."
        );
        assert_eq!(
            validate(F4, &json!({"sysclkSource": "LSE"})).unwrap_err(),
            "클록 설정 System Clock Mux: HSI/HSE/PLLCLK 중에서 고르세요."
        );
    }

    #[test]
    fn ioc_values() {
        assert_eq!(
            tree_from_ioc(F4, &object(json!({"RCC.SYSCLKFreq_VALUE": "16000000"}))).unwrap(),
            None
        );
        let t = tree_from_ioc(
            F1,
            &object(json!({"RCC.SYSCLKSource":"RCC_SYSCLKSOURCE_PLLCLK","RCC.PLLMUL":"RCC_PLL_MUL9","RCC.APB1CLKDivider":"RCC_HCLK_DIV2","RCC.SYSCLKFreq_VALUE":"72000000"})),
        )
        .unwrap()
        .unwrap();
        // 72 MHz needs HSE × 9: the missing PLL source line is read as HSE.
        assert_eq!(t["pllSource"], json!("HSE"));
        assert_eq!(
            (t["pllMul"].clone(), t["apb1"].clone()),
            (json!(9), json!(2))
        );
        assert_eq!(trailing_number("RCC_PLL_MUL16"), Some(16.0));
        assert_eq!(as_number("abc"), 0.0);
    }
}
