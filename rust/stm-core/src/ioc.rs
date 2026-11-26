//! Reading a CubeMX .ioc into a project's Pinout settings, and the UART console a new project starts with.
//! Moved here from `src/mcu-config.js` (importIoc, evalIocNumber, userPins, consoleUart; feature 62).
//!
//! What the model cannot take over is left out with a note (`warnings`), in the order the JavaScript noted it.

use crate::clock;
use crate::halgen::adc_sampling;
use crate::js_re;
use crate::mcu::{self, js_number, F1, F4};
use crate::mcuconfig::{
    config_problems, default_mcu, dma_requests_of, pin_functions, validate_mcu,
};
use crate::periph::{self, is_advanced_timer, is_basic_timer, is_i2c, is_spi, js_truthy};
use serde_json::{json, Map, Value};

/// CubeMX keeps parameter expressions as typed ("84-1", "1000*2"): + - * / and parentheses on integers only.
/// → the whole number it comes to, or `None`.
pub fn eval_ioc_number(raw: &str) -> Option<f64> {
    let text: Vec<char> = crate::jsre::trim(raw).chars().collect();
    let allowed = |c: &char| {
        c.is_ascii_hexdigit()
            || matches!(c, 'x' | 'X' | '+' | '-' | '*' | '/' | '(' | ')')
            || crate::jsre::is_space(*c)
    };
    if text.is_empty() || !text.iter().all(allowed) {
        return None;
    }
    struct Parser<'a> {
        text: &'a [char],
        i: usize,
    }
    impl Parser<'_> {
        fn peek(&self) -> Option<char> {
            self.text.get(self.i).copied()
        }
        fn skip(&mut self) {
            while self.peek() == Some(' ') {
                self.i += 1;
            }
        }
        fn atom(&mut self) -> Option<f64> {
            self.skip();
            match self.peek() {
                Some('(') => {
                    self.i += 1;
                    let v = self.sum()?;
                    self.skip();
                    let close = self.peek();
                    self.i += 1;
                    (close == Some(')')).then_some(v)
                }
                Some('-') => {
                    self.i += 1;
                    self.atom().map(|v| -v)
                }
                _ => {
                    let rest = &self.text[self.i..];
                    let hex = rest.len() > 2
                        && rest[0] == '0'
                        && matches!(rest[1], 'x' | 'X')
                        && rest[2].is_ascii_hexdigit();
                    if hex {
                        let digits: String = rest[2..]
                            .iter()
                            .take_while(|c| c.is_ascii_hexdigit())
                            .collect();
                        self.i += 2 + digits.chars().count();
                        Some(digits.chars().fold(0.0, |acc, c| {
                            acc * 16.0 + f64::from(c.to_digit(16).unwrap())
                        }))
                    } else {
                        let digits: String =
                            rest.iter().take_while(|c| c.is_ascii_digit()).collect();
                        if digits.is_empty() {
                            return None;
                        }
                        self.i += digits.len();
                        digits.parse().ok()
                    }
                }
            }
        }
        fn product(&mut self) -> Option<f64> {
            let mut v = self.atom()?;
            self.skip();
            while let Some(op @ ('*' | '/')) = self.peek() {
                self.i += 1;
                let r = self.atom()?;
                v = if op == '*' { v * r } else { v / r };
                self.skip();
            }
            Some(v)
        }
        fn sum(&mut self) -> Option<f64> {
            let mut v = self.product()?;
            self.skip();
            while let Some(op @ ('+' | '-')) = self.peek() {
                self.i += 1;
                let r = self.product()?;
                v = if op == '+' { v + r } else { v - r };
                self.skip();
            }
            Some(v)
        }
    }
    let mut parser = Parser { text: &text, i: 0 };
    let v = parser.sum()?;
    parser.skip();
    (parser.i == text.len() && v.is_finite() && v.fract() == 0.0).then_some(v)
}

js_re!(PIN_SIGNAL, r"^(P[A-H]\d+)(?:-[^.]+)?\.Signal$");
js_re!(SHARED_TIMER, r"^S_TIM\d+_");
js_re!(TIMER_CHANNEL, r"^TIM\d+_CH\dN?$");
js_re!(COMP_DAC, r"^COMP_DAC([12])_group$");
js_re!(SHARED_CHANNEL, r"^S_TIM\d+_CH\dN?$");
js_re!(ADC_INPUT, r"^ADC(?:x|\d+)_IN\d+$");
js_re!(SYSTEM_SIGNAL, r"^(SYS_|RCC_)");
js_re!(LABEL_BREAK, r"[\s\[]");
js_re!(NOT_NAME_CHAR, r"[^A-Za-z0-9_]");
js_re!(C_NAME, r"^[A-Za-z_]\w{0,39}$");
js_re!(SIGNAL_NAME, r"^[A-Za-z][\w-]{0,39}$");
js_re!(SPEED, r"^GPIO_SPEED_FREQ_(LOW|MEDIUM|HIGH|VERY_HIGH)$");
js_re!(
    HAL_NAME,
    r"(?i)^(GPIO|HAL|RCC|NVIC|EXTI|SYSCFG|AFIO|PWR|FLASH|IS|USE|STM32\w*)$"
);
js_re!(HAL_PREFIX, r"(?i)^(__|HAL_|GPIO_|RCC_|LL_|IS_)");
js_re!(MCU_IP, r"^Mcu.IP\d+$");
js_re!(F103_NAME, r"^STM32F103R(?:[8B]|\([^)]*B[^)]*\))");
js_re!(
    SAMPLING_KEY,
    r"^ADC1\.SamplingTime-0\\?#ChannelRegularConversion$"
);
js_re!(SAMPLING, r"ADC_SAMPLETIME_(\d+)CYCLES?(_5)?");
js_re!(BIT_RATE, r"(?i)^([\d.]+)\s*([KM]?)Bits/s");
js_re!(OUTPUT_COMPARE, r"Output Compare\d CH\d");
js_re!(COUNTER_MODE, r"TIM_COUNTERMODE_(\w+)");
js_re!(TRGO, r"^TIM_TRGO_(RESET|ENABLE|UPDATE)$");
js_re!(OC_MODE, r"TIM_OCMODE_(\w+)");
js_re!(DMA_REQUEST, r"^Dma\.Request\d+$");
js_re!(TRAILING_DIGITS, r"\d+$");
js_re!(PRIORITY_GROUP, r"^NVIC_PRIORITYGROUP_([0-4])$");
js_re!(
    ORPHAN_IRQ,
    r"^(\w+_IRQn): .*(?:주변장치를 활성화하거나|를 활성화하거나) 인터럽트를 끄세요"
);
js_re!(ORPHAN_DMA, r"^(\S+) DMA: \w+ 주변장치를 활성화하세요");
js_re!(PIN_PLACE, r"^Mcu\.Pin(\d+)$");
js_re!(PORT_PIN, r"^P[A-H]\d+");
const TIM_COUNTER_MODES: [&str; 5] = [
    "UP",
    "DOWN",
    "CENTERALIGNED1",
    "CENTERALIGNED2",
    "CENTERALIGNED3",
];
const TIM_OC_MODES: [&str; 6] = [
    "TIMING",
    "ACTIVE",
    "INACTIVE",
    "TOGGLE",
    "FORCED_ACTIVE",
    "FORCED_INACTIVE",
];

/// The settings of channel `n` among a timer's channels, made when they are first written to.
fn channel_settings(channels: &mut Map<String, Value>, n: char) -> &mut Map<String, Value> {
    channels
        .entry(format!("CH{n}"))
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .unwrap()
}
/// JavaScript's `Number(text)` of a .ioc value.
fn js_num(text: &str) -> f64 {
    let t = crate::jsre::trim(text);
    if t.is_empty() {
        return 0.0;
    }
    if let Some(hex) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        return i64::from_str_radix(hex, 16).map_or(f64::NAN, |v| v as f64);
    }
    t.parse().unwrap_or(f64::NAN)
}
fn js_round(v: f64) -> f64 {
    (v + 0.5).floor()
}

/// The settings a CubeMX .ioc describes: `{config, warnings}`.
pub fn import_ioc(text: &str) -> Result<Value, String> {
    if text.encode_utf16().count() > 500_000 {
        return Err(".ioc 파일은 500 KB 이하로 선택하세요.".into());
    }
    // CubeMX writes keys as Java properties: spaces and # are escaped ("TIM2.Pulse-PWM\ Generation1\ CH1").
    let mut values: Map<String, Value> = Map::new();
    for line in crate::jsre::lines(text) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some(at) = line.find('=') else { continue };
        let mut key = String::new();
        let mut chars = line[..at].chars().peekable();
        while let Some(c) = chars.next() {
            // A backslash gives the character after it (not a line break).
            if c == '\\'
                && chars
                    .peek()
                    .is_some_and(|n| !matches!(n, '\n' | '\r' | '\u{2028}' | '\u{2029}'))
            {
                key.push(chars.next().unwrap());
            } else {
                key.push(c);
            }
        }
        values.insert(key, json!(line[at + 1..].replace("\\:", ":")));
    }
    let value = |key: &str| values.get(key).and_then(Value::as_str);
    let text_of = |key: &str| value(key).unwrap_or("");
    // CubeMX writes package ranges in Mcu.Name (STM32F103R(8-B)Tx); Mcu.CPN/UserName hold the exact part.
    let family_of = |name: &str| {
        if name.starts_with("STM32F446R") {
            Some(F4)
        } else if F103_NAME.is_match(name) {
            Some(F1)
        } else {
            None
        }
    };
    let family = ["Mcu.Name", "Mcu.CPN", "Mcu.UserName"]
        .iter()
        .find_map(|key| family_of(text_of(key)))
        .ok_or("STM32F446RE 또는 STM32F103RB 설정만 지원합니다.")?;
    let f = mcu::profile(family)?;
    let f1 = f["pinMux"] == "remap";
    let routes = mcu::routes_of(&f);
    let route_ids: Vec<String> = routes
        .as_object()
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    let section_keys = |key: &str| -> Vec<String> {
        f[key]
            .as_object()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default()
    };
    let default_hz = f["clock"]["defaultHz"].as_f64().unwrap_or(0.0);
    let mut warnings: Vec<String> = Vec::new();
    // A number of the .ioc, or the fallback with a note when it cannot be read.
    fn number(raw: Option<&str>, fallback: f64, warnings: &mut Vec<String>) -> f64 {
        let Some(raw) = raw else { return fallback };
        match eval_ioc_number(raw) {
            Some(n) => n,
            None => {
                warnings.push(format!(
                    "{raw}: 숫자로 읽을 수 없어 기본값 {}을 사용합니다.",
                    js_number(fallback)
                ));
                fallback
            }
        }
    }
    // The places a reader left for numbers (mcu::NUMBER), filled in the order of the keys.
    fn filled(v: &Value, warnings: &mut Vec<String>) -> Value {
        match v {
            Value::Object(map) => {
                if let Some(place) = map.get(mcu::NUMBER).and_then(Value::as_array) {
                    let fallback = place.get(1).and_then(Value::as_f64).unwrap_or(f64::NAN);
                    return mcu::number(number(
                        place.first().and_then(Value::as_str),
                        fallback,
                        warnings,
                    ));
                }
                Value::Object(
                    map.iter()
                        .map(|(k, x)| (k.clone(), filled(x, warnings)))
                        .collect(),
                )
            }
            Value::Array(list) => Value::Array(list.iter().map(|x| filled(x, warnings)).collect()),
            other => other.clone(),
        }
    }
    let gpio_pins: Vec<&str> = f["gpioPins"]
        .as_array()
        .map(|l| l.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let speeds: &[&str] = if f1 {
        &periph::GPIO_SPEEDS[..3]
    } else {
        &periph::GPIO_SPEEDS
    };
    let reserved_name = |label: &str| matches!(label, "__proto__" | "constructor" | "prototype");
    let mut pins: Map<String, Value> = Map::new();
    for (key, signal) in &values {
        let Some(m) = PIN_SIGNAL.captures(key) else {
            continue;
        };
        let pin = m[1].to_string();
        let base = &key[..key.len() - 7];
        if !gpio_pins.contains(&pin.as_str()) {
            warnings.push(format!("{pin}: 보드에서 접근할 수 없는 핀"));
            continue;
        }
        let mut signal = signal.as_str().unwrap_or("").to_string();
        // A shared signal (S_TIM2_CH1_ETR: the pin's timer channel or its external trigger) is the one its SH line
        // picks: SH.S_TIM2_CH1_ETR.0=TIM2_CH1,PWM Generation1 CH1.
        let picked = text_of(&format!("SH.{signal}.0"))
            .split(',')
            .next()
            .unwrap_or("")
            .to_string();
        if SHARED_TIMER.is_match(&signal) && TIMER_CHANNEL.is_match(&picked) {
            signal = format!("S_{picked}");
        }
        // ADCx_INn: a channel shared by ADC1/2/3; the model uses ADC1.
        let mut function = if let Some(m) = COMP_DAC.captures(&signal) {
            format!("DAC_OUT{}", &m[1])
        } else if signal == "GPIO_Analog" {
            "Analog".into()
        } else if signal.starts_with("GPXTI") {
            "GPIO_EXTI".into()
        } else if SHARED_CHANNEL.is_match(&signal) {
            signal[2..].to_string()
        } else if ADC_INPUT.is_match(&signal) {
            format!("ADC1_{}", signal.split('_').nth(1).unwrap_or(""))
        } else {
            signal.clone()
        };
        let system = SYSTEM_SIGNAL.is_match(&signal);
        if !pin_functions(&pin, &f).contains(&function) {
            function = "Reserved".into();
            if !system {
                warnings.push(format!("{pin}: {signal} 실행 모델 미지원"));
            }
        }
        let or_default = |key: String, default: &str| -> String {
            match value(&key) {
                Some(v) if !v.is_empty() => v.to_string(),
                _ => default.to_string(),
            }
        };
        let pull = or_default(format!("{base}.GPIO_PuPd"), "GPIO_NOPULL").replacen("GPIO_", "", 1);
        // CubeMX omits GPIO_ModeDefaultEXTI for its default, rising edge.
        let exti_mode = or_default(
            format!("{base}.GPIO_ModeDefaultEXTI"),
            if function == "GPIO_EXTI" {
                "GPIO_MODE_IT_RISING"
            } else {
                ""
            },
        );
        let edge = if exti_mode.contains("RISING_FALLING") {
            "CHANGE"
        } else if exti_mode.contains("RISING") {
            "RISING"
        } else {
            "FALLING"
        };
        // Board templates label pins like "B1 [Blue PushButton]"; the C name is the first word. A character a C name
        // cannot hold becomes _, as in the macro CubeMX generates (LCD-D4 → LCD_D4_Pin, HV+ → HV_).
        let raw_label = or_default(format!("{base}.GPIO_Label"), "");
        let first_word = LABEL_BREAK.split(&raw_label).next().unwrap_or("");
        let mut label = NOT_NAME_CHAR.replace_all(first_word, "_").into_owned();
        if label.starts_with(|c: char| c.is_ascii_digit()) {
            label.insert(0, '_');
        }
        let good = C_NAME.is_match(&label) && !reserved_name(&label);
        if !label.is_empty() && !good {
            warnings.push(format!(
                "{pin}: 라벨 \"{raw_label}\"은 C 이름으로 쓸 수 없어 비웠습니다."
            ));
        }
        let mut p = Map::new();
        p.insert("function".into(), json!(function));
        p.insert("pull".into(), json!(pull));
        p.insert("edge".into(), json!(edge));
        p.insert(
            "label".into(),
            json!(if good { label.as_str() } else { "" }),
        );
        p.insert(
            "initial".into(),
            json!(
                if value(&format!("{base}.PinState")) == Some("GPIO_PIN_SET") {
                    1
                } else {
                    0
                }
            ),
        );
        if function == "Reserved" && SIGNAL_NAME.is_match(&signal) && !system {
            p.insert("signal".into(), json!(signal));
        }
        // GPIO_Speed (absent = CubeMX default) and an open-drain output (GPIO_ModeDefaultOutputPP).
        if let Some(m) = SPEED.captures(text_of(&format!("{base}.GPIO_Speed"))) {
            if speeds.contains(&&m[1]) && function != "Reserved" {
                p.insert("speed".into(), json!(&m[1]));
            }
        }
        if function == "GPIO_Output"
            && value(&format!("{base}.GPIO_ModeDefaultOutputPP")) == Some("GPIO_MODE_OUTPUT_OD")
        {
            p.insert("outputType".into(), json!("OD"));
        }
        pins.insert(pin, Value::Object(p));
    }
    // Labels the Pinout does not take are left out here with a note, instead of coming in as errors to clear by hand:
    // the same label on a second pin (real files have them), and a label that reads as a HAL name (GPIO_…, HAL_…).
    {
        let mut seen: Vec<String> = Vec::new();
        for (pin, p) in pins.iter_mut() {
            let label = p["label"].as_str().unwrap_or("").to_string();
            if label.is_empty() {
                continue;
            }
            if HAL_NAME.is_match(&label) || HAL_PREFIX.is_match(&label) {
                warnings.push(format!("{pin}: 라벨 {label}은 HAL 이름과 겹쳐 비웠습니다."));
                p["label"] = json!("");
            } else if seen.contains(&label) {
                warnings.push(format!(
                    "{pin}: 라벨 {label}은 다른 핀에도 있어 이 핀의 라벨은 비웠습니다."
                ));
                p["label"] = json!("");
            } else {
                seen.push(label);
            }
        }
    }
    let function_of = |p: &Value| p["function"].as_str().unwrap_or("").to_string();
    let any_pin = |pins: &Map<String, Value>, test: &dyn Fn(&str) -> bool| {
        pins.values().any(|p| test(&function_of(p)))
    };
    let mut peripherals: Map<String, Value> = Map::new();
    for id in &route_ids {
        let prefix = format!("{id}_");
        let enabled = any_pin(&pins, &|fun| fun.starts_with(&prefix))
            || values
                .iter()
                .any(|(k, v)| MCU_IP.is_match(k) && v.as_str() == Some(id.as_str()));
        if enabled {
            peripherals.insert(id.clone(), json!({"enabled": true}));
        }
    }
    for id in section_keys("serial") {
        if !peripherals.contains_key(&id) {
            continue;
        }
        let baud = number(value(&format!("{id}.BaudRate")), 115_200.0, &mut warnings);
        let has = |key: &str, needle: &str| text_of(&format!("{id}.{key}")).contains(needle);
        let clock_pin = any_pin(&pins, &|fun| fun == format!("{id}_CK"));
        let p = peripherals[&id].as_object_mut().unwrap();
        p.insert("baud".into(), mcu::number(baud));
        if has("WordLength", "9B") {
            p.insert("wordLength".into(), json!(9));
        }
        if has("Parity", "EVEN") {
            p.insert("parity".into(), json!("EVEN"));
        } else if has("Parity", "ODD") {
            p.insert("parity".into(), json!("ODD"));
        }
        if has("StopBits", "STOPBITS_2") {
            p.insert("stopBits".into(), json!(2));
        }
        let mode = text_of(&format!("{id}.Mode"));
        if mode.ends_with("MODE_TX") {
            p.insert("direction".into(), json!("TX"));
        } else if mode.ends_with("MODE_RX") {
            p.insert("direction".into(), json!("RX"));
        }
        if has("OverSampling", "OVERSAMPLING_8") && family != F1 {
            p.insert("overSampling".into(), json!(8));
        }
        // A pin carrying USARTx_CK means CubeMX's synchronous mode.
        if clock_pin {
            let is = |key: &str, text: &str| i32::from(value(&format!("{id}.{key}")) == Some(text));
            p.insert("mode".into(), json!("synchronous"));
            p.insert(
                "cpol".into(),
                json!(is("CLKPolarity", "USART_POLARITY_HIGH")),
            );
            p.insert("cpha".into(), json!(is("CLKPhase", "USART_PHASE_2EDGE")));
            p.insert(
                "lastBit".into(),
                json!(is("CLKLastBit", "USART_LASTBIT_ENABLE")),
            );
        }
    }
    for id in route_ids.iter().filter(|id| is_i2c(id)) {
        if !peripherals.contains_key(id) {
            continue;
        }
        let clock_hz = number(value(&format!("{id}.ClockSpeed")), 100_000.0, &mut warnings);
        let c = peripherals[id].as_object_mut().unwrap();
        c.insert("clock".into(), mcu::number(clock_hz));
        // The value CubeMX writes to OwnAddress1 (address << 1).
        let own = value(&format!("{id}.OwnAddress")).map_or(f64::NAN, js_num);
        if own.is_finite() && own.fract() == 0.0 && own > 0.0 {
            c.insert(
                "ownAddress".into(),
                json!(((own as i64 as i32) >> 1) & 0x7f),
            );
        }
        if text_of(&format!("{id}.DutyCycle")).contains("16_9") && clock_hz > 100_000.0 {
            c.insert("dutyCycle".into(), json!("16_9"));
        }
        if text_of(&format!("{id}.NoStretchMode")).contains("NOSTRETCH_ENABLE") {
            c.insert("noStretch".into(), json!(true));
        }
    }
    let part = |prefixes: &[&str]| -> Value {
        Value::Object(
            values
                .iter()
                .filter(|(k, _)| prefixes.iter().any(|p| k.starts_with(p)))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
        )
    };
    if peripherals.contains_key("DAC") {
        let mut q = json!({"enabled": true});
        if let Some(channels) = mcu::dac_from_ioc(&part(&["DAC."])) {
            q["channels"] = channels;
        }
        peripherals.insert("DAC".into(), q);
    }
    // Watchdogs (System Core › IWDG / WWDG): Mcu.IP or the VP_xWDG_VS_xWDG activation; a value out of range keeps
    // CubeMX's default.
    for id in ["IWDG", "WWDG"] {
        if !(peripherals.contains_key(id)
            || value(&format!("VP_{id}_VS_{id}.Mode")).is_some_and(|v| !v.is_empty()))
        {
            continue;
        }
        let read = if id == "IWDG" {
            mcu::iwdg_from_ioc(&part(&["IWDG."]))
        } else {
            mcu::wwdg_from_ioc(&part(&["WWDG."]))
        };
        let q = filled(&read, &mut warnings);
        let checked = if id == "IWDG" {
            mcu::validate_iwdg(&q)
        } else {
            mcu::validate_wwdg(&q)
        };
        match checked {
            Ok(_) => peripherals.insert(id.into(), q),
            Err(message) => {
                warnings.push(format!("{message} 기본값을 씁니다."));
                peripherals.insert(id.into(), json!({"enabled": true}))
            }
        };
    }
    // RTC: calendar time/date, alarm A and wakeup; enabled through Mcu.IP or VP_RTC_VS_RTC_Activate.
    if peripherals.contains_key("RTC")
        || value("VP_RTC_VS_RTC_Activate.Mode").is_some_and(|v| !v.is_empty())
    {
        let read = mcu::rtc_from_ioc(&part(&["RTC.", "RCC.RTC", "VP_RTC_"]), family);
        peripherals.insert("RTC".into(), filled(&read, &mut warnings));
    }
    if peripherals.contains_key("ADC1") && value("ADC1.ContinuousConvMode") == Some("ENABLE") {
        peripherals["ADC1"]["continuous"] = json!(true);
    }
    if peripherals.contains_key("ADC1") {
        let already = peripherals["ADC1"].get("conversions").cloned();
        let read = mcu::adc_group_from_ioc(&part(&["ADC1."]), family, already.as_ref())?;
        let adc = peripherals["ADC1"].as_object_mut().unwrap();
        for op in read["ops"].as_array().into_iter().flatten() {
            let key = op[1].as_str().unwrap_or("");
            if op[0] == "set" {
                adc.insert(key.into(), op[2].clone());
            } else {
                adc.shift_remove(key);
            }
        }
        let internal: Vec<&str> = read["internal"]
            .as_array()
            .map(|l| l.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        if !internal.is_empty() {
            let pinned = any_pin(&pins, &|fun| fun.starts_with("ADC1_"));
            let mut unique: Vec<&str> = Vec::new();
            for name in internal {
                if !unique.contains(&name) {
                    unique.push(name);
                }
            }
            warnings.push(format!(
                "ADC1: 내부 채널({})은 실행 모델에 없어 가져오지 않았습니다{}.",
                unique.join(", "),
                if pinned {
                    ""
                } else {
                    " — 남은 입력 핀이 없어 ADC1을 껐습니다"
                }
            ));
            if !pinned {
                peripherals.shift_remove("ADC1");
            }
        }
    }
    if peripherals.contains_key("ADC1") {
        // CubeMX always writes the channel of each rank: ranks in the default order (the pins' channels ascending) are
        // not kept.
        if peripherals["ADC1"].get("ranks").is_some_and(js_truthy) {
            let with = json!({"pins": pins, "peripherals": {"ADC1": peripherals["ADC1"]}});
            let mut plain_adc = peripherals["ADC1"].clone();
            plain_adc.as_object_mut().unwrap().shift_remove("ranks");
            let plain = json!({"pins": pins, "peripherals": {"ADC1": plain_adc}});
            let (wanted, default) = (mcu::adc_ranks(&with), mcu::adc_ranks(&plain));
            if wanted
                .iter()
                .enumerate()
                .all(|(i, ch)| default.get(i) == Some(ch))
            {
                peripherals["ADC1"]
                    .as_object_mut()
                    .unwrap()
                    .shift_remove("ranks");
            }
        }
        // Rank 1 Sampling Time; a .ioc without it has CubeMX's default, the shortest.
        let list = adc_sampling(family).unwrap_or(&[]);
        let key = values.keys().find(|k| SAMPLING_KEY.is_match(k));
        let cycles = key
            .and_then(|k| SAMPLING.captures(text_of(k)))
            .map(|m| {
                m[1].parse::<f64>().unwrap_or(f64::NAN) + if m.get(2).is_some() { 0.5 } else { 0.0 }
            })
            .or(list.first().copied())
            .unwrap_or(f64::NAN);
        if list.contains(&cycles) && list.last() != Some(&cycles) {
            peripherals["ADC1"]["samplingTime"] = mcu::number(cycles);
        }
    }
    // SPI speed: CubeMX stores the computed rate ("5.25 MBits/s") next to the prescaler.
    for id in route_ids.iter().filter(|id| is_spi(id)) {
        if !peripherals.contains_key(id) {
            continue;
        }
        let has_pin = |signal: &str| any_pin(&pins, &|fun| fun == format!("{id}_{signal}"));
        let has = |key: &str, needle: &str| text_of(&format!("{id}.{key}")).contains(needle);
        let transmit_only = has_pin("SCK") && has_pin("MOSI") && !has_pin("MISO");
        let s = peripherals[id].as_object_mut().unwrap();
        // No MISO pin: Transmit Only Master (2 lines, MISO unused) or a half-duplex mode (1 line, read as transmit only).
        if transmit_only {
            s.insert("direction".into(), json!("TX_ONLY"));
            if has("Direction", "1LINE") {
                warnings.push(format!("{id}: 반이중(1선) 모드는 송신 전용으로 가져왔습니다. 같은 선으로 받는 동작은 실행 모델에 없습니다."));
            }
        }
        if has("CLKPolarity", "HIGH") {
            s.insert("cpol".into(), json!("HIGH"));
        }
        if has("CLKPhase", "2EDGE") {
            s.insert("cpha".into(), json!("2EDGE"));
        }
        if has("DataSize", "16BIT") {
            s.insert("dataSize".into(), json!(16));
        }
        if has("FirstBit", "LSB") {
            s.insert("firstBit".into(), json!("LSB"));
        }
        if let Some(m) = BIT_RATE.captures(text_of(&format!("{id}.CalculateBaudRate"))) {
            let scale = match m[2].to_uppercase().as_str() {
                "K" => 1e3,
                "M" => 1e6,
                _ => 1.0,
            };
            let rate = js_round(js_num(&m[1]) * scale);
            let clock_hz = if rate.is_nan() {
                f64::NAN
            } else {
                rate.clamp(1000.0, 20_000_000.0)
            };
            s.insert("clock".into(), mcu::number(clock_hz));
        }
    }
    let timer_ids = section_keys("timers");
    for id in &timer_ids {
        if !peripherals.contains_key(id) {
            continue;
        }
        let period_default = f64::from(mcu::family_timer_max(family, id));
        let prescaler = number(value(&format!("{id}.Prescaler")), 0.0, &mut warnings);
        let period = number(
            value(&format!("{id}.Period")),
            period_default,
            &mut warnings,
        );
        let pulse_key = values
            .keys()
            .find(|k| k.starts_with(&format!("{id}.Pulse")))
            .cloned();
        let pulse = pulse_key.map(|k| number(value(&k), 0.0, &mut warnings));
        let prefix = format!("{id}.");
        let settings = values
            .iter()
            .filter(|(k, _)| k.starts_with(&prefix))
            .map(|(k, v)| format!("{k} {}", v.as_str().unwrap_or("")))
            .collect::<Vec<_>>()
            .join(" ");
        let mut mode = if settings.contains("Encoder") || settings.contains("ENCODER") {
            "encoder"
        } else if settings.contains("PWM") {
            "pwm"
        } else if OUTPUT_COMPARE.is_match(&settings) {
            "oc"
        } else if settings.contains("INPUTCAPTURE")
            || settings.contains("Input_Capture")
            || settings.contains("IC_CHANNEL")
        {
            "capture"
        } else {
            "base"
        };
        let counter = COUNTER_MODE
            .captures(text_of(&format!("{id}.CounterMode")))
            .map(|m| m[1].to_string());
        let (rep, dead) = if is_advanced_timer(id) {
            (
                number(
                    value(&format!("{id}.RepetitionCounter")),
                    0.0,
                    &mut warnings,
                ),
                number(value(&format!("{id}.DeadTime")), 0.0, &mut warnings),
            )
        } else {
            (0.0, 0.0)
        };
        let p = peripherals[id].as_object_mut().unwrap();
        p.insert("prescaler".into(), mcu::number(prescaler));
        p.insert("period".into(), mcu::number(period));
        if let Some(pulse) = pulse {
            p.insert("pulse".into(), mcu::number(pulse));
        }
        p.insert("mode".into(), json!(mode));
        if let Some(counter) = counter {
            if counter != "UP"
                && TIM_COUNTER_MODES.contains(&counter.as_str())
                && mode != "encoder"
                && !is_basic_timer(id)
            {
                p.insert("counterMode".into(), json!(counter));
            }
        }
        if is_advanced_timer(id) {
            if rep > 0.0 && rep <= 255.0 {
                p.insert("repetition".into(), mcu::number(rep));
            }
            if dead > 0.0 && dead <= 255.0 {
                p.insert("deadTime".into(), mcu::number(dead));
            }
        }
        // TIM6/TIM7: the basic timers have only the time base.
        if is_basic_timer(id) {
            mode = "base";
            p.insert("mode".into(), json!(mode));
        }
        if value(&format!("VP_{id}_VS_OPM.Mode")).is_some_and(|v| !v.is_empty())
            && mode != "encoder"
        {
            p.insert("onePulse".into(), json!(true));
        }
        if let Some(m) = TRGO.captures(text_of(&format!("{id}.TIM_MasterOutputTrigger"))) {
            if &m[1] != "RESET" {
                p.insert("trgo".into(), json!(&m[1]));
            }
        }
    }
    // Per-channel settings: PWM "TIM2.Pulse-PWM Generation1 CH1", "TIM2.OCPolarity_1", "TIM2.OCMode_PWM-PWM Generation1
    // CH1"; Output Compare "TIM2.Pulse-Output Compare1 CH1", "TIM2.OCMode_1" (TIM_OCMODE_TIMING when missing).
    for id in &timer_ids {
        let mode = peripherals
            .get(id)
            .and_then(|p| p.get("mode"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if mode != "pwm" && mode != "oc" {
            continue;
        }
        let oc = mode == "oc";
        let name = if oc {
            "Output Compare"
        } else {
            "PWM Generation"
        };
        let timer_pulse = peripherals[id].get("pulse").cloned();
        let pulse_default = timer_pulse
            .as_ref()
            .and_then(Value::as_f64)
            .unwrap_or(f64::NAN);
        let mut ch: Map<String, Value> = Map::new();
        // `<digit> CH<digit>` and optionally ` CH<digit>N`, to the end.
        let channel_tail = |rest: &str| -> Option<char> {
            let b: Vec<char> = rest.chars().collect();
            let ok = b.len() >= 5
                && b[0].is_ascii_digit()
                && b[1] == ' '
                && b[2] == 'C'
                && b[3] == 'H'
                && b[4].is_ascii_digit();
            let tail: String = b.iter().skip(5).collect();
            let tail_ok = tail.is_empty() || {
                let t: Vec<char> = tail.chars().collect();
                t.len() == 5
                    && t[0] == ' '
                    && t[1] == 'C'
                    && t[2] == 'H'
                    && t[3].is_ascii_digit()
                    && t[4] == 'N'
            };
            (ok && tail_ok).then(|| b[0])
        };
        // `<digit>` and optionally `-…`, to the end.
        let indexed = |rest: &str| -> Option<char> {
            let mut chars = rest.chars();
            let digit = chars.next().filter(char::is_ascii_digit)?;
            let tail: String = chars.collect();
            (tail.is_empty() || (tail.starts_with('-') && !tail.contains(['\n', '\r'])))
                .then_some(digit)
        };
        for (k, v) in &values {
            let v = v.as_str().unwrap_or("");
            let Some(rest) = k.strip_prefix(&format!("{id}.")) else {
                continue;
            };
            if let Some(n) = rest
                .strip_prefix(&format!("Pulse-{name}"))
                .and_then(channel_tail)
            {
                let pulse = number(Some(v), pulse_default, &mut warnings);
                channel_settings(&mut ch, n).insert(
                    "pulse".into(),
                    if pulse.is_nan() {
                        timer_pulse.clone().unwrap_or(Value::Null)
                    } else {
                        mcu::number(pulse)
                    },
                );
                continue;
            }
            if let Some(n) = rest.strip_prefix("OCPolarity_").and_then(indexed) {
                if v.contains("LOW") {
                    channel_settings(&mut ch, n).insert("polarity".into(), json!("LOW"));
                    continue;
                }
            }
            if let Some(n) = rest
                .strip_prefix("OCMode_PWM-PWM Generation")
                .and_then(channel_tail)
            {
                if !oc && v.contains("PWM2") {
                    channel_settings(&mut ch, n).insert("ocMode".into(), json!("PWM2"));
                    continue;
                }
            }
            if let Some(n) = rest.strip_prefix("OCMode_").and_then(indexed) {
                if let Some(m) = OC_MODE.captures(v) {
                    if oc && &m[1] != "TIMING" && TIM_OC_MODES.contains(&&m[1]) {
                        channel_settings(&mut ch, n).insert("ocMode".into(), json!(&m[1]));
                    }
                }
            }
        }
        for c in ch.values_mut() {
            if c.get("pulse").is_some() && c.get("pulse") == timer_pulse.as_ref() {
                c.as_object_mut().unwrap().shift_remove("pulse");
            }
        }
        ch.retain(|_, c| c.as_object().is_some_and(|m| !m.is_empty()));
        if !ch.is_empty() {
            peripherals[id]["channels"] = Value::Object(ch);
        }
    }
    let mut config = default_mcu(family)?;
    let mut timer_clock = number(value("RCC.APB1TimFreq_Value"), default_hz, &mut warnings);
    // The .ioc clock tree: kept as the project's Clock Configuration unless the single APB1 timer clock gives the same
    // clocks.
    let rcc: Map<String, Value> = values
        .iter()
        .filter(|(k, v)| (k.starts_with("RCC.") || *k == "ADC1.ClockPrescaler") && v.is_string())
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let tree = clock::tree_from_ioc(family, &rcc)?;
    let hse = match value("RCC.HSE_VALUE") {
        Some(v) if !v.is_empty() => js_num(v),
        _ => 8_000_000.0,
    };
    let valid = |hz: f64| mcu::clock_valid(family, hz);
    let mut kept_tree: Option<Map<String, Value>> = None;
    if let Some(tree) = tree {
        let uses_hse = tree.get("sysclkSource") == Some(&json!("HSE"))
            || tree.get("pllSource") == Some(&json!("HSE"));
        // The NUCLEO boards feed HSE with 8 MHz from the ST-LINK. A tree made for another crystal would give other
        // clocks here, so it is not taken over.
        if uses_hse && hse != 8_000_000.0 {
            warnings.push(format!("클록 설정: 이 .ioc는 HSE {} MHz인 보드용입니다. NUCLEO 보드의 HSE는 8 MHz(ST-LINK MCO)라 클록 트리는 가져오지 않고 보드 기본 클록을 씁니다. Clock 탭에서 다시 맞추세요.", js_number(hse / 1e6)));
            timer_clock = default_hz;
        } else {
            let q = clock::frequencies(family, &tree);
            let hz = js_round(q.tim1);
            let same = valid(hz) && {
                let old = clock::frequencies(family, &clock::tree_from_timer_hz(family, hz));
                [
                    (old.sysclk, q.sysclk),
                    (old.hclk, q.hclk),
                    (old.pclk1, q.pclk1),
                    (old.pclk2, q.pclk2),
                    (old.adc, q.adc),
                ]
                .iter()
                .all(|(a, b)| (a - b).abs() < 1.0)
            };
            timer_clock = hz;
            if !same {
                for p in clock::problems(family, &tree)? {
                    warnings.push(format!("클록 설정: {p}"));
                }
                kept_tree = Some(tree);
            }
        }
    }
    // HSE/other PLL setups (F103 at 72 MHz) cannot be rebuilt from HSI: keep the nearest clock the generator can make.
    if kept_tree.is_none() && !valid(timer_clock) {
        let wanted = timer_clock;
        let max_hz = f["clock"]["maxHz"].as_f64().unwrap_or(0.0);
        let near = (js_round(wanted / 4e6) * 4e6).min(max_hz);
        let hz = if valid(near) {
            near
        } else {
            f["clock"]["exampleHz"].as_f64().unwrap_or(0.0)
        };
        warnings.push(format!(
            "APB1 타이머 클록 {} MHz는 HSI로 만들 수 없어 {} MHz로 바꿨습니다 ({}). 타이머 Prescaler/Period를 확인하세요.",
            js_number(wanted / 1e6),
            js_number(hz / 1e6),
            f["clock"]["label"].as_str().unwrap_or("")
        ));
        timer_clock = hz;
    }
    // DMA: Dma.<request>.<n>.Instance/Channel/Mode/Priority; a request this model cannot route is reported, not
    // dropped silently.
    let requests = dma_requests_of(&f);
    let mut dma: Map<String, Value> = Map::new();
    for (key, request) in &values {
        if !DMA_REQUEST.is_match(key) {
            continue;
        }
        let request = request.as_str().unwrap_or("");
        let prefix = format!("Dma.{request}.");
        let base = values.keys().find_map(|k| {
            let n = k.strip_prefix(&prefix)?.strip_suffix(".Instance")?;
            (!n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
                .then(|| k[..k.len() - 9].to_string())
        });
        let q = base.map(|base| {
            let stream = text_of(&format!("{base}.Instance")).to_string();
            // CubeMX leaves Channel out when the stream serves the request on one channel only.
            let channel = match TRAILING_DIGITS.find(text_of(&format!("{base}.Channel"))) {
                Some(m) => m.as_str().parse().unwrap_or(f64::NAN),
                None => requests
                    .get(request)
                    .and_then(Value::as_array)
                    .and_then(|options| options.iter().find(|o| o[0] == stream.as_str()))
                    .and_then(|o| o[1].as_f64())
                    .unwrap_or(0.0),
            };
            let priority = match value(&format!("{base}.Priority")) {
                Some(v) if !v.is_empty() => v,
                _ => "DMA_PRIORITY_LOW",
            };
            json!({
                "stream": if values.contains_key(&format!("{base}.Instance")) { json!(stream) } else { Value::Null },
                "channel": mcu::number(channel),
                "mode": if value(&format!("{base}.Mode")) == Some("DMA_CIRCULAR") { "circular" } else { "normal" },
                "priority": priority.replacen("DMA_PRIORITY_", "", 1).to_lowercase(),
            })
        });
        let taken = q
            .filter(|_| requests.get(request).is_some_and(js_truthy))
            .filter(|q| {
                let mut trial = default_mcu(family).unwrap();
                let mut all = dma.clone();
                all.insert(request.to_string(), q.clone());
                trial["dma"] = Value::Object(all);
                validate_mcu(&trial).is_ok()
            });
        match taken {
            Some(q) => {
                dma.insert(request.to_string(), q);
            }
            None => warnings.push(format!(
                "{request} DMA: 실행 모델에서 같은 설정을 쓸 수 없어 가져오지 않았습니다."
            )),
        }
    }
    // NVIC.<irq>=enabled:preemption:sub:…; NVIC.PriorityGroup; the time base priority is TICK_INT_PRIORITY.
    let mut nvic: Map<String, Value> = Map::new();
    for irq in mcu::irq_names_of(&f) {
        let Some(raw) = value(&format!("NVIC.{irq}")).filter(|v| !v.is_empty()) else {
            continue;
        };
        let mut parts = raw.split(':');
        let enabled = parts.next() == Some("true");
        let priority = parts.next().map_or(f64::NAN, js_num);
        let sub = parts.next().map_or(f64::NAN, js_num);
        let mut line = json!({"enabled": enabled, "priority": mcu::number(priority)});
        if sub != 0.0 && !sub.is_nan() {
            line["sub"] = mcu::number(sub);
        }
        nvic.insert(irq, line);
    }
    let supported = [
        "GPIO",
        "RCC",
        "NVIC",
        "SYS",
        "DMA",
        "NUCLEO-F446RE",
        "NUCLEO-F103RB",
    ];
    {
        let c = config.as_object_mut().unwrap();
        c.insert("pins".into(), Value::Object(pins));
        c.insert("peripherals".into(), Value::Object(peripherals));
        c.insert("nvic".into(), Value::Object(nvic));
        c.insert("timerClockHz".into(), mcu::number(timer_clock));
        if let Some(tree) = kept_tree {
            c.insert("clock".into(), Value::Object(tree));
        }
        if !dma.is_empty() {
            c.insert("dma".into(), Value::Object(dma));
        }
        if value("ProjectManager.CoupleFile") == Some("true") {
            c.insert("coupleFiles".into(), json!(true));
        }
        if let Some(m) = PRIORITY_GROUP.captures(text_of("NVIC.PriorityGroup")) {
            c.insert("nvicGroup".into(), json!(m[1].parse::<i64>().unwrap_or(0)));
        }
        if let Some(tick) = value("NVIC.SysTick_IRQn") {
            let priority = tick.split(':').nth(1).map_or(f64::NAN, js_num);
            if priority.is_finite() && priority.fract() == 0.0 {
                c.insert("tickPriority".into(), mcu::number(priority));
            }
        }
    }
    for (key, v) in &values {
        let v = v.as_str().unwrap_or("");
        if MCU_IP.is_match(key) && routes.get(v).is_none() && !supported.contains(&v) {
            warnings.push(format!("{v}: 실행 모델 미지원"));
        }
    }
    // An interrupt line whose peripheral was not imported (a timer used as the HAL time base, a part the model does not
    // have) is left out with a note: kept, it would be an error the user has to clear by hand before generating code.
    let mut clean = validate_mcu(&config)?;
    for _ in 0..40 {
        let problems = config_problems(&clean)?;
        let has = |section: &str, key: &str| {
            config
                .get(section)
                .and_then(|s| s.get(key))
                .is_some_and(js_truthy)
        };
        let orphan = problems.iter().find_map(|p| {
            ORPHAN_IRQ
                .captures(p)
                .map(|m| m[1].to_string())
                .filter(|irq| has("nvic", irq))
        });
        let request = problems.iter().find_map(|p| {
            ORPHAN_DMA
                .captures(p)
                .map(|m| m[1].to_string())
                .filter(|r| has("dma", r))
        });
        if let Some(irq) = orphan {
            config["nvic"].as_object_mut().unwrap().shift_remove(&irq);
            warnings.push(format!(
                "{irq}: 이 인터럽트를 쓰는 주변장치를 가져오지 않아 NVIC 설정에서 뺐습니다."
            ));
        } else if let Some(request) = request {
            config["dma"]
                .as_object_mut()
                .unwrap()
                .shift_remove(&request);
            warnings.push(format!(
                "{request} DMA: 이 요청을 쓰는 주변장치를 가져오지 않아 DMA 설정에서 뺐습니다."
            ));
        } else {
            break;
        }
        clean = validate_mcu(&config)?;
    }
    // Pins in the order of Mcu.Pin0, Mcu.Pin1, … — the file's own keys are sorted as text (PA10 before PA5). The order
    // is part of the settings: generated code lists the pins in it, and a new main loop toggles the first output pin.
    {
        let mut order: Vec<(String, f64)> = Vec::new();
        for (key, v) in &values {
            let (Some(n), Some(pin)) = (
                PIN_PLACE.captures(key),
                PORT_PIN.find(v.as_str().unwrap_or("")),
            ) else {
                continue;
            };
            if !order.iter().any(|(p, _)| p == pin.as_str()) {
                order.push((pin.as_str().to_string(), n[1].parse().unwrap_or(f64::NAN)));
            }
        }
        if !order.is_empty() {
            if let Some(map) = clean.get("pins").and_then(Value::as_object) {
                let mut entries: Vec<(f64, String, Value)> = map
                    .iter()
                    .enumerate()
                    .map(|(i, (pin, p))| {
                        (
                            order
                                .iter()
                                .find(|(o, _)| o == pin)
                                .map_or(1e6 + i as f64, |(_, n)| *n),
                            pin.clone(),
                            p.clone(),
                        )
                    })
                    .collect();
                entries.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
                clean["pins"] =
                    Value::Object(entries.into_iter().map(|(_, pin, p)| (pin, p)).collect());
            }
        }
    }
    let mut all: Vec<String> = Vec::new();
    for w in warnings.into_iter().chain(config_problems(&clean)?) {
        if !all.contains(&w) {
            all.push(w);
        }
    }
    Ok(json!({"config": clean, "warnings": all}))
}

/// The pins a user set up, without the UART console a new project starts with (USART2 on PA2 / PA3 at 115200):
/// their names, in order.
pub fn user_pins(mcu_settings: &Value) -> Vec<String> {
    let u = mcu_settings
        .get("peripherals")
        .and_then(|p| p.get("USART2"));
    let function = |pin: &str| {
        mcu_settings
            .get("pins")
            .and_then(|p| p.get(pin))
            .and_then(|p| p.get("function"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    let console = u.is_some_and(|u| {
        u.get("enabled").is_some_and(js_truthy)
            && u.get("baud").and_then(Value::as_f64) == Some(115_200.0)
    }) && function("PA2") == "USART2_TX"
        && function("PA3") == "USART2_RX";
    mcu_settings
        .get("pins")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|pins| pins.keys())
        .filter(|pin| !(console && (*pin == "PA2" || *pin == "PA3")))
        .cloned()
        .collect()
}
/// An example's console: USART2 on PA2 / PA3 (the ST-LINK virtual COM port, 115200 8N1) unless the example already
/// uses USART2 or one of the two pins. → `{pins: {PA2, PA3}, usart: {…}, order: [peripheral]}` to add, or `None`.
pub fn console_uart(mcu_settings: &Value) -> Result<Option<Value>, String> {
    let taken = |section: &str, key: &str| {
        mcu_settings
            .get(section)
            .and_then(|s| s.get(key))
            .is_some_and(js_truthy)
    };
    if taken("peripherals", "USART2") || taken("pins", "PA2") || taken("pins", "PA3") {
        return Ok(None);
    }
    let family = match mcu_settings.get("family") {
        Some(Value::String(f)) => f.clone(),
        Some(other) if !other.is_null() => mcu::js_display(Some(other)),
        _ => mcu::DEFAULT_FAMILY.to_string(),
    };
    let profile = mcu::profile(&family)?;
    let pin = |function: &str| json!({"function": function, "pull": "NOPULL", "edge": "FALLING", "label": "", "initial": 0});
    // In the order an .ioc import gives (the serial ports first, in the family's order), so export and import agree.
    let serials: Vec<String> = profile["serial"]
        .as_object()
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    let rank = |id: &str| {
        serials
            .iter()
            .position(|s| s == id)
            .unwrap_or(serials.len())
    };
    let mut order: Vec<String> = mcu_settings
        .get("peripherals")
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    let at = order
        .iter()
        .position(|id| rank(id) > rank("USART2"))
        .unwrap_or(order.len());
    order.insert(at, "USART2".into());
    Ok(Some(
        json!({"pins": {"PA2": pin("USART2_TX"), "PA3": pin("USART2_RX")}, "usart": {"enabled": true, "baud": 115200}, "order": order}),
    ))
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    Some(match name {
        "eval_ioc_number" => Ok(v(0)
            .as_str()
            .and_then(eval_ioc_number)
            .map_or(Value::Null, mcu::number)),
        "import_ioc" => match v(0).as_str() {
            Some(text) => import_ioc(text),
            None => Err(".ioc 파일은 500 KB 이하로 선택하세요.".into()),
        },
        "user_pins" => Ok(json!(user_pins(v(0)))),
        "console_uart" => console_uart(v(0)).map(|add| add.unwrap_or(Value::Null)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_as_typed() {
        assert_eq!(eval_ioc_number("84-1"), Some(83.0));
        assert_eq!(eval_ioc_number(" (3+4)*2 "), Some(14.0));
        assert_eq!(eval_ioc_number("0x10"), Some(16.0));
        assert_eq!(eval_ioc_number("10/4"), None);
        assert_eq!(eval_ioc_number("8/2"), Some(4.0));
        assert_eq!(eval_ioc_number("-5"), Some(-5.0));
        assert_eq!(eval_ioc_number("abc"), None);
        assert_eq!(eval_ioc_number("2**3"), None);
        assert_eq!(eval_ioc_number(""), None);
    }

    #[test]
    fn a_small_ioc() {
        let text = "#MicroXplorer\nMcu.Name=STM32F103R(8-B)Tx\nMcu.IP0=NVIC\nMcu.IP1=USART2\nMcu.IP2=CAN\nMcu.Pin0=PC13-TAMPER-RTC\nMcu.Pin1=PA5\nPA5.Signal=GPIO_Output\nPA5.GPIO_Label=LD2 [Green Led]\nPA2.Signal=USART2_TX\nPA3.Signal=USART2_RX\nPC13-TAMPER-RTC.Signal=GPXTI13\nPC13-TAMPER-RTC.GPIO_Label=B1 [Blue PushButton]\nUSART2.BaudRate=9600\nNVIC.EXTI15_10_IRQn=true\\:2\\:0\\:false\nNVIC.TIM2_IRQn=true\\:0\\:0\nRCC.APB1TimFreq_Value=72000000\n";
        let out = import_ioc(text).unwrap();
        let c = &out["config"];
        assert_eq!(c["family"], json!("STM32F103RB"));
        assert_eq!(
            c["pins"].as_object().unwrap().keys().collect::<Vec<_>>(),
            ["PC13", "PA5", "PA2", "PA3"]
        );
        assert_eq!(
            c["pins"]["PA5"],
            json!({"function": "GPIO_Output", "pull": "NOPULL", "edge": "FALLING", "label": "LD2", "initial": 0})
        );
        assert_eq!(c["pins"]["PC13"]["function"], json!("GPIO_EXTI"));
        assert_eq!(c["pins"]["PC13"]["edge"], json!("RISING"));
        assert_eq!(
            c["peripherals"]["USART2"],
            json!({"enabled": true, "baud": 9600})
        );
        assert_eq!(
            c["nvic"],
            json!({"EXTI15_10_IRQn": {"enabled": true, "priority": 2}})
        );
        assert_eq!(c["timerClockHz"], json!(64000000));
        let warnings: Vec<&str> = out["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(Value::as_str)
            .collect();
        assert!(warnings.contains(&"CAN: 실행 모델 미지원"));
        assert!(warnings.contains(
            &"TIM2_IRQn: 이 인터럽트를 쓰는 주변장치를 가져오지 않아 NVIC 설정에서 뺐습니다."
        ));
        assert!(warnings
            .iter()
            .any(|w| w
                .starts_with("APB1 타이머 클록 72 MHz는 HSI로 만들 수 없어 64 MHz로 바꿨습니다")));
        assert_eq!(
            import_ioc("Mcu.Name=STM32H7").unwrap_err(),
            "STM32F446RE 또는 STM32F103RB 설정만 지원합니다."
        );
    }

    #[test]
    fn the_console_of_a_new_project() {
        let mcu_settings = json!({"family": "STM32F446RE", "pins": {"PA5": {"function": "GPIO_Output"}}, "peripherals": {"USART1": {"enabled": true}, "TIM2": {"enabled": true}}});
        let add = console_uart(&mcu_settings).unwrap().unwrap();
        assert_eq!(add["order"], json!(["USART1", "USART2", "TIM2"]));
        assert_eq!(
            console_uart(&json!({"pins": {"PA2": {"function": "GPIO_Input"}}, "peripherals": {}}))
                .unwrap(),
            None
        );
        let with = json!({"pins": {"PA2": {"function": "USART2_TX"}, "PA5": {}, "PA3": {"function": "USART2_RX"}}, "peripherals": {"USART2": {"enabled": true, "baud": 115200}}});
        assert_eq!(user_pins(&with), ["PA5"]);
        assert_eq!(
            user_pins(
                &json!({"pins": {"PA2": {"function": "USART2_TX"}}, "peripherals": {"USART2": {"enabled": true, "baud": 9600}}})
            ),
            ["PA2"]
        );
    }
}
