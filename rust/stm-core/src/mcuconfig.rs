//! A project's Pinout settings as a whole (`mcu`): the check that makes a clean copy of them (`validate_mcu`) and the
//! problems CubeMX would mark (`config_problems`), with the tables they use.
//! Moved here from `src/mcu-config.js` (feature 62); that file now only calls these functions.

use crate::clock;
use crate::halgen::{adc_sampling, dma_owner};
use crate::js_re;
use crate::mcu::{self, js_display, js_number, F1};
use crate::periph::{
    self, is_advanced_timer, is_basic_timer, is_i2c, is_serial, is_spi, is_timer, js_truthy,
    serial_function, timer_of_irq,
};
use serde_json::{json, Map, Value};

pub const MODES: [&str; 6] = [
    "Reset",
    "GPIO_Input",
    "GPIO_Output",
    "GPIO_EXTI",
    "Analog",
    "Reserved",
];
pub const DMA_MODES: [&str; 2] = ["normal", "circular"];
pub const DMA_PRIORITIES: [&str; 4] = ["low", "medium", "high", "very_high"];
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
const TIM_TRGO: [&str; 3] = ["RESET", "ENABLE", "UPDATE"];

/// UART Parameter Settings (CubeMX Asynchronous mode): the first value of each list is CubeMX's default.
fn uart_params() -> Value {
    json!({"wordLength": [8, 9], "parity": ["NONE", "EVEN", "ODD"], "stopBits": [1, 2], "direction": ["TX_RX", "TX", "RX"], "overSampling": [16, 8]})
}
/// SPI Parameter Settings (CubeMX Full-Duplex Master). direction TX_ONLY: CubeMX's "Transmit Only Master".
fn spi_params() -> Value {
    json!({"direction": ["FULL", "TX_ONLY"], "cpol": ["LOW", "HIGH"], "cpha": ["1EDGE", "2EDGE"], "dataSize": [8, 16], "firstBit": ["MSB", "LSB"]})
}
/// PWM channel settings: CH Polarity and PWM mode (output compare: its own modes).
fn tim_channel_params(mode: &str) -> Value {
    if mode == "oc" {
        json!({"polarity": ["HIGH", "LOW"], "ocMode": TIM_OC_MODES})
    } else {
        json!({"polarity": ["HIGH", "LOW"], "ocMode": ["PWM1", "PWM2"]})
    }
}
/// DMA requests of the STM32F446RE (RM0390 table 28/29): `{request: [[stream, channel]]}`.
pub fn f4_dma_requests() -> Value {
    let mut out = json!({
        "USART1_RX": [["DMA2_Stream2", 4], ["DMA2_Stream5", 4]], "USART1_TX": [["DMA2_Stream7", 4]], "USART2_RX": [["DMA1_Stream5", 4]], "USART2_TX": [["DMA1_Stream6", 4]],
        "USART3_RX": [["DMA1_Stream1", 4]], "USART3_TX": [["DMA1_Stream3", 4], ["DMA1_Stream4", 7]], "UART4_RX": [["DMA1_Stream2", 4]], "UART4_TX": [["DMA1_Stream4", 4]],
        "UART5_RX": [["DMA1_Stream0", 4]], "UART5_TX": [["DMA1_Stream7", 4]], "USART6_RX": [["DMA2_Stream1", 5], ["DMA2_Stream2", 5]], "USART6_TX": [["DMA2_Stream6", 5], ["DMA2_Stream7", 5]],
        "ADC1": [["DMA2_Stream0", 0], ["DMA2_Stream4", 0]], "SPI1_RX": [["DMA2_Stream0", 3], ["DMA2_Stream2", 3]], "SPI1_TX": [["DMA2_Stream3", 3], ["DMA2_Stream5", 3]],
        "I2C1_RX": [["DMA1_Stream0", 1], ["DMA1_Stream5", 1]], "I2C1_TX": [["DMA1_Stream6", 1], ["DMA1_Stream7", 1]],
        "TIM2_CH1": [["DMA1_Stream5", 3]], "TIM2_CH2": [["DMA1_Stream6", 3]], "TIM2_CH3": [["DMA1_Stream1", 3]], "TIM2_CH4": [["DMA1_Stream6", 3], ["DMA1_Stream7", 3]],
        "TIM3_CH1": [["DMA1_Stream4", 5]], "TIM3_CH2": [["DMA1_Stream5", 5]], "TIM3_CH3": [["DMA1_Stream7", 5]], "TIM3_CH4": [["DMA1_Stream2", 5]],
        "TIM4_CH1": [["DMA1_Stream0", 2]], "TIM4_CH2": [["DMA1_Stream3", 2]], "TIM4_CH3": [["DMA1_Stream7", 2]],
        "TIM5_CH1": [["DMA1_Stream2", 6]], "TIM5_CH2": [["DMA1_Stream4", 6]], "TIM5_CH3": [["DMA1_Stream0", 6]], "TIM5_CH4": [["DMA1_Stream1", 6], ["DMA1_Stream3", 6]],
        "DCMI": [["DMA2_Stream1", 1], ["DMA2_Stream7", 1]], "SDIO_RX": [["DMA2_Stream3", 4], ["DMA2_Stream6", 4]], "SDIO_TX": [["DMA2_Stream3", 4], ["DMA2_Stream6", 4]], "DAC1": [["DMA1_Stream5", 7]], "DAC2": [["DMA1_Stream6", 7]],
    });
    out["MEMTOMEM"] = Value::Array(
        (0..8)
            .map(|i| json!([format!("DMA2_Stream{i}"), null]))
            .collect(),
    );
    out
}
/// The DMA requests of a family: its own table (F1 channels), else the F446's.
pub fn dma_requests_of(profile: &Value) -> Value {
    match profile.get("dmaRequests") {
        Some(table) if !table.is_null() => table.clone(),
        _ => f4_dma_requests(),
    }
}
pub fn dma_direction(request: &str) -> &'static str {
    if request == "MEMTOMEM" {
        "M2M"
    } else if request.ends_with("_RX") || request == "ADC1" || request == "DCMI" {
        "P2M"
    } else {
        "M2P"
    }
}
/// The EXTI line of a pin: `EXTI0_IRQn` … `EXTI4_IRQn`, `EXTI9_5_IRQn`, `EXTI15_10_IRQn`.
pub fn irq_for_pin(pin: &str) -> String {
    let text = pin.get(2..).unwrap_or("").trim();
    let n: f64 = if text.is_empty() {
        0.0
    } else {
        text.parse().unwrap_or(f64::NAN)
    };
    if n < 5.0 {
        format!("EXTI{}_IRQn", js_number(n))
    } else if n < 10.0 {
        "EXTI9_5_IRQn".into()
    } else {
        "EXTI15_10_IRQn".into()
    }
}
/// Every function a pin can have: the GPIO modes, the signals routed to it and the USART clocks.
pub fn pin_functions(pin: &str, profile: &Value) -> Vec<String> {
    let mut out: Vec<String> = MODES.iter().map(|m| m.to_string()).collect();
    let has = |pins: &Value| {
        pins.as_array()
            .is_some_and(|list| list.iter().any(|p| p == pin))
    };
    let routes = mcu::routes_of(profile);
    for (id, signals) in routes.as_object().into_iter().flatten() {
        for (signal, pins) in signals.as_object().into_iter().flatten() {
            if has(pins) {
                out.push(format!("{id}_{signal}"));
            }
        }
    }
    for (id, pins) in profile["usartCk"].as_object().into_iter().flatten() {
        if has(pins) {
            out.push(format!("{id}_CK"));
        }
    }
    out
}
pub fn default_mcu(family: &str) -> Result<Value, String> {
    let profile = mcu::profile(family)?;
    Ok(
        json!({"family": profile["id"], "pins": {}, "peripherals": {}, "nvic": {}, "timerClockHz": profile["clock"]["defaultHz"]}),
    )
}
/// What mcu-config.js exports as data.
pub fn tables() -> Value {
    json!({
        "dmaModes": DMA_MODES, "dmaPriorities": DMA_PRIORITIES, "modes": MODES,
        "adcSampling": {mcu::F4: adc_sampling(mcu::F4), F1: adc_sampling(F1)},
        "spiParams": spi_params(), "timChannelParams": tim_channel_params("pwm"), "timOcModes": TIM_OC_MODES,
        "timCounterModes": TIM_COUNTER_MODES, "uartParams": uart_params(), "dmaRequests": f4_dma_requests(),
    })
}

js_re!(LABEL, r"^[A-Za-z_]\w{0,39}$");
js_re!(SIGNAL, r"^[A-Za-z][\w-]{0,39}$");
js_re!(CHANNEL_KEY, r"^CH[1-4]$");
js_re!(
    HAL_NAME,
    r"(?i)^(GPIO|HAL|RCC|NVIC|EXTI|SYSCFG|AFIO|PWR|FLASH|IS|USE|STM32\w*)$"
);
js_re!(HAL_PREFIX, r"(?i)^(__|HAL_|GPIO_|RCC_|LL_|IS_)");
js_re!(USART_CK, r"^(USART\d)_CK$");

fn present(value: Option<&Value>) -> Option<&Value> {
    value.filter(|v| !v.is_null())
}
fn integer(value: &Value) -> Option<f64> {
    value.as_f64().filter(|v| v.is_finite() && v.fract() == 0.0)
}
fn text_of(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}
fn list_text(values: &[Value]) -> String {
    values
        .iter()
        .map(|v| js_display(Some(v)))
        .collect::<Vec<_>>()
        .join(" / ")
}
/// The entries of a JSON object (`Object.entries`); nothing for anything else.
fn entries(value: Option<&Value>) -> Vec<(&String, &Value)> {
    value
        .and_then(Value::as_object)
        .map(|map| map.iter().collect())
        .unwrap_or_default()
}
/// `value ?? default` with the value kept as it is.
fn or_value(value: Option<&Value>, default: Value) -> Value {
    present(value).cloned().unwrap_or(default)
}
/// JavaScript's `Math.round`.
fn js_round(v: f64) -> f64 {
    (v + 0.5).floor()
}

/// A clean copy of a project's Pinout settings, or the first thing that is wrong with them.
pub fn validate_mcu(value: &Value) -> Result<Value, String> {
    let family_id = value
        .get("family")
        .and_then(Value::as_str)
        .filter(|f| *f == mcu::F4 || *f == F1);
    let whole = |key: &str| value.get(key).is_some_and(js_truthy);
    let Some(family_id) =
        family_id.filter(|_| whole("pins") && whole("peripherals") && whole("nvic"))
    else {
        return Err(format!("MCU 핀 설정이 필요합니다 ({} / {}).", mcu::F4, F1));
    };
    let f = mcu::profile(family_id)?;
    let f1 = f["pinMux"] == "remap";
    let routes = mcu::routes_of(&f);
    let timer_max = |id: &str| f64::from(mcu::family_timer_max(family_id, id));
    let mut out = Map::new();
    out.insert("family".into(), json!(family_id));
    out.insert("pins".into(), json!({}));
    out.insert("peripherals".into(), json!({}));
    out.insert("nvic".into(), json!({}));
    let timer_clock = or_value(value.get("timerClockHz"), f["clock"]["defaultHz"].clone());
    out.insert("timerClockHz".into(), timer_clock.clone());
    // CubeMX Clock Configuration (`clock`): the APB1 timer clock follows the tree, so the interpreter and examples keep
    // reading timerClockHz. Without a tree the project keeps the older single HSI setting.
    if let Some(tree) = value.get("clock") {
        let tree = clock::validate(family_id, tree)?;
        let tim1 = clock::frequencies(family_id, &tree).tim1;
        out.insert("clock".into(), Value::Object(tree));
        out.insert("timerClockHz".into(), mcu::number(js_round(tim1)));
    } else if !timer_clock
        .as_f64()
        .is_some_and(|hz| mcu::clock_valid(family_id, hz))
    {
        return Err(format!(
            "APB1 타이머 클록 범위: {}",
            text_of(f["clock"].get("label"))
        ));
    }
    let gpio_pins: Vec<&str> = f["gpioPins"]
        .as_array()
        .map(|list| list.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let speeds: &[&str] = if f1 {
        &periph::GPIO_SPEEDS[..3]
    } else {
        &periph::GPIO_SPEEDS
    };
    // A section that is a text or a list has entries too (the JavaScript read its first one, "0").
    let listed = |key: &str| {
        value
            .get(key)
            .is_some_and(|v| v.is_string() || v.as_array().is_some_and(|list| !list.is_empty()))
    };
    if listed("pins") {
        return Err(format!("0: {family_id}에서 지원하지 않는 핀 기능입니다."));
    }
    let mut pins = Map::new();
    for (pin, p) in entries(value.get("pins")) {
        let function = p.get("function").and_then(Value::as_str);
        let known = gpio_pins.contains(&pin.as_str())
            && js_truthy(p)
            && function.is_some_and(|fun| pin_functions(pin, &f).iter().any(|x| x == fun));
        if !known {
            return Err(format!(
                "{pin}: {family_id}에서 지원하지 않는 핀 기능입니다."
            ));
        }
        let label = p.get("label").and_then(Value::as_str);
        let bad_label = match label {
            None => true,
            Some(label) => {
                (!label.is_empty() && !LABEL.is_match(label))
                    || matches!(label, "__proto__" | "constructor" | "prototype")
            }
        };
        if bad_label {
            return Err(format!(
                "{pin}: 라벨은 영문자나 _로 시작하는 C 이름(영문·숫자·_ 40자 이내)으로 쓰세요."
            ));
        }
        let one_of = |key: &str, list: &[&str]| {
            p.get(key)
                .and_then(Value::as_str)
                .is_some_and(|v| list.contains(&v))
        };
        let initial = p
            .get("initial")
            .and_then(Value::as_f64)
            .is_some_and(|v| v == 0.0 || v == 1.0);
        if !one_of("pull", &["NOPULL", "PULLUP", "PULLDOWN"])
            || !one_of("edge", &["RISING", "FALLING", "CHANGE"])
            || !initial
        {
            return Err(format!("{pin}: GPIO 설정이 올바르지 않습니다."));
        }
        let mut q = Map::new();
        for key in ["function", "pull", "edge", "label", "initial"] {
            q.insert(key.into(), p[key].clone());
        }
        // A Reserved pin may keep the CubeMX signal it stands for (CAN1_RX, I2S2_SD, DCMI_D0 …: read from an .ioc, the
        // model does not run it), so the .ioc export writes the pin back instead of dropping it.
        if let Some(signal) = p.get("signal") {
            if function != Some("Reserved") || !signal.as_str().is_some_and(|s| SIGNAL.is_match(s))
            {
                return Err(format!("{pin}: 신호 이름을 확인하세요."));
            }
            q.insert("signal".into(), signal.clone());
        }
        // Optional CubeMX GPIO fields: maximum output speed and push-pull / open-drain output.
        if let Some(speed) = p.get("speed") {
            if !speed.as_str().is_some_and(|s| speeds.contains(&s)) {
                let names: Vec<&str> = speeds
                    .iter()
                    .map(|s| match *s {
                        "LOW" => "Low",
                        "MEDIUM" => "Medium",
                        "HIGH" => "High",
                        _ => "Very High",
                    })
                    .collect();
                return Err(format!(
                    "{pin}: 최대 출력 속도는 {} 중에서 고르세요.",
                    names.join(" / ")
                ));
            }
            q.insert("speed".into(), speed.clone());
        }
        if let Some(kind) = p.get("outputType") {
            if !matches!(kind.as_str(), Some("PP") | Some("OD")) {
                return Err(format!(
                    "{pin}: GPIO 출력 방식은 Push Pull 또는 Open Drain입니다."
                ));
            }
            q.insert("outputType".into(), kind.clone());
        }
        pins.insert(pin.clone(), Value::Object(q));
    }
    out.insert("pins".into(), Value::Object(pins));
    if listed("peripherals") {
        return Err(format!("0: {family_id}에서 지원하지 않는 주변장치입니다."));
    }
    let mut peripherals = Map::new();
    for (id, p) in entries(value.get("peripherals")) {
        let id = id.as_str();
        let enabled = p.get("enabled").filter(|e| e.is_boolean());
        let Some(enabled) = enabled.filter(|_| routes.get(id).is_some() && js_truthy(p)) else {
            return Err(format!(
                "{id}: {family_id}에서 지원하지 않는 주변장치입니다."
            ));
        };
        let with_enabled = |rest: Value| {
            let mut q = Map::new();
            q.insert("enabled".into(), enabled.clone());
            for (key, v) in rest.as_object().into_iter().flatten() {
                q.insert(key.clone(), v.clone());
            }
            Value::Object(q)
        };
        match id {
            "RTC" => {
                peripherals.insert(id.into(), with_enabled(mcu::validate_rtc(p, family_id)?));
                continue;
            }
            "DAC" => {
                let mut q = json!({"enabled": enabled});
                if let Some(channels) = mcu::validate_dac(p)? {
                    q["channels"] = channels;
                }
                peripherals.insert(id.into(), q);
                continue;
            }
            "IWDG" => {
                peripherals.insert(id.into(), with_enabled(mcu::validate_iwdg(p)?));
                continue;
            }
            "WWDG" => {
                peripherals.insert(id.into(), with_enabled(mcu::validate_wwdg(p)?));
                continue;
            }
            _ => {}
        }
        let mut q = Map::new();
        q.insert("enabled".into(), enabled.clone());
        let timer = is_timer(id);
        let fields: Vec<(&str, f64, f64, f64)> = if is_serial(id) {
            vec![("baud", 115_200.0, 300.0, 2_000_000.0)]
        } else if is_i2c(id) {
            vec![("clock", 100_000.0, 1000.0, 1_000_000.0)]
        } else if is_spi(id) {
            vec![("clock", 1_000_000.0, 1000.0, 20_000_000.0)]
        } else if timer {
            vec![
                ("prescaler", 0.0, 0.0, 65_535.0),
                ("period", timer_max(id), 0.0, timer_max(id)),
                ("pulse", 0.0, 0.0, timer_max(id)),
            ]
        } else {
            vec![]
        };
        for (key, default, min, max) in fields {
            let v = or_value(p.get(key), mcu::number(default));
            if !integer(&v).is_some_and(|n| n >= min && n <= max) {
                return Err(format!("{id}.{key}: 범위를 확인하세요."));
            }
            q.insert(key.into(), v);
        }
        if timer {
            let mode = or_value(p.get("mode"), json!("base"));
            if !matches!(
                mode.as_str(),
                Some("base" | "pwm" | "oc" | "capture" | "encoder")
            ) {
                return Err(format!("{id}: 타이머 모드를 확인하세요."));
            }
            q.insert("mode".into(), mode);
        }
        let mode = text_of(q.get("mode")).to_string();
        // Basic timers (TIM6/TIM7): an up counter without channels; TRGO Trigger Event Selection is kept when not Reset.
        if is_basic_timer(id) {
            if mode != "base" {
                return Err(format!(
                    "{id}: 기본 타이머는 채널이 없어 내부 클록 / 주기 모드만 씁니다."
                ));
            }
            if p.get("counterMode").is_some_and(|m| m != "UP") {
                return Err(format!("{id}: 기본 타이머는 Up 카운터만 있습니다."));
            }
            if p.get("channels").is_some() {
                return Err(format!("{id}: 기본 타이머에는 채널이 없습니다."));
            }
        }
        if let Some(trgo) = p.get("trgo") {
            if !trgo.as_str().is_some_and(|t| TIM_TRGO.contains(&t)) {
                return Err(format!(
                    "{id}.trgo: {} 중에서 고르세요.",
                    TIM_TRGO.join(" / ")
                ));
            }
            if trgo != "RESET" {
                q.insert("trgo".into(), trgo.clone());
            }
        }
        // Advanced timers (TIM1 / TIM8): Repetition Counter (RCR) and Dead Time (the raw DTG value), kept when not 0.
        for (key, label) in [
            ("repetition", "Repetition Counter"),
            ("deadTime", "Dead Time"),
        ] {
            if let Some(v) = p.get(key) {
                if !is_advanced_timer(id) {
                    return Err(format!(
                        "{id}: {label}는 고급 타이머 TIM1/TIM8에만 있습니다."
                    ));
                }
                if !integer(v).is_some_and(|n| (0.0..=255.0).contains(&n)) {
                    return Err(format!("{id} {label}: 0~255 범위의 정수를 입력하세요."));
                }
                if js_truthy(v) {
                    q.insert(key.into(), v.clone());
                }
            }
        }
        // One Pulse Mode (CubeMX's checkbox): the counter stops at the next update event.
        if timer {
            if let Some(v) = p.get("onePulse") {
                let Some(on) = v.as_bool() else {
                    return Err(format!("{id}.onePulse: true 또는 false입니다."));
                };
                if on {
                    if mode == "encoder" {
                        return Err(format!(
                            "{id}: 엔코더 모드에서는 One Pulse Mode를 쓰지 않습니다."
                        ));
                    }
                    q.insert("onePulse".into(), json!(true));
                }
            }
            // Counter Mode: only a non-Up value is kept; the encoder sets the direction itself.
            if let Some(v) = p.get("counterMode") {
                if !v.as_str().is_some_and(|m| TIM_COUNTER_MODES.contains(&m)) {
                    return Err(format!(
                        "{id}.counterMode: {} 중에서 고르세요.",
                        TIM_COUNTER_MODES.join(" / ")
                    ));
                }
                if v != "UP" {
                    if mode == "encoder" {
                        return Err(format!(
                            "{id}: 엔코더 모드에서는 Counter Mode를 Up으로 두세요."
                        ));
                    }
                    q.insert("counterMode".into(), v.clone());
                }
            }
            // PWM Generation CHn (CubeMX): each channel's Pulse, CH Polarity and PWM mode; only what differs from the
            // timer's Pulse / High / PWM1 is kept.
            if let Some(channels) = p.get("channels") {
                let Some(list) = channels.as_object() else {
                    return Err(format!("{id}: 채널 설정을 확인하세요."));
                };
                let params = tim_channel_params(&mode);
                let mut kept = Map::new();
                for (ch, c) in list {
                    if !CHANNEL_KEY.is_match(ch) || !(c.is_object() || c.is_array()) {
                        return Err(format!("{id}.{ch}: 채널 설정을 확인하세요."));
                    }
                    let mut own = Map::new();
                    if let Some(pulse) = c.get("pulse") {
                        if !integer(pulse).is_some_and(|n| n >= 0.0 && n <= timer_max(id)) {
                            return Err(format!("{id}.{ch}.pulse: 범위를 확인하세요."));
                        }
                        if Some(pulse) != q.get("pulse") {
                            own.insert("pulse".into(), pulse.clone());
                        }
                    }
                    for (key, values) in params.as_object().unwrap() {
                        let Some(v) = c.get(key) else { continue };
                        let values = values.as_array().unwrap();
                        if !values.contains(v) {
                            return Err(format!(
                                "{id}.{ch}.{key}: {} 중에서 고르세요.",
                                list_text(values)
                            ));
                        }
                        if v != &values[0] {
                            own.insert(key.clone(), v.clone());
                        }
                    }
                    if !own.is_empty() {
                        kept.insert(ch.clone(), Value::Object(own));
                    }
                }
                if !kept.is_empty() {
                    q.insert("channels".into(), Value::Object(kept));
                }
            }
        }
        if id == "ADC1" {
            // Rank 1 Sampling Time: only one that is not the default (the longest) is kept.
            let list: Vec<Value> = adc_sampling(family_id)
                .unwrap_or(&[])
                .iter()
                .map(|c| mcu::number(*c))
                .collect();
            if let Some(v) = p.get("samplingTime") {
                if !list.contains(v) {
                    return Err(format!(
                        "ADC1 Sampling Time: {} Cycles 중에서 고르세요.",
                        list_text(&list)
                    ));
                }
                if Some(v) != list.last() {
                    q.insert("samplingTime".into(), v.clone());
                }
            }
            let already = q.get("conversions").cloned();
            mcu::adc_group_into(p, already.as_ref(), family_id, &mut q)?;
            // CubeMX ADC Settings › Continuous Conversion Mode (off = single conversion per HAL_ADC_Start).
            if let Some(v) = p.get("continuous") {
                let Some(on) = v.as_bool() else {
                    return Err("ADC1: Continuous Conversion Mode를 확인하세요.".into());
                };
                if on {
                    q.insert("continuous".into(), json!(true));
                }
            }
        }
        let choose = |q: &mut Map<String, Value>, params: Value| -> Result<(), String> {
            for (key, values) in params.as_object().unwrap() {
                let Some(v) = p.get(key) else { continue };
                let values = values.as_array().unwrap();
                if !values.contains(v) {
                    return Err(format!(
                        "{id}.{key}: {} 중에서 고르세요.",
                        list_text(values)
                    ));
                }
                if v != &values[0] {
                    q.insert(key.clone(), v.clone());
                }
            }
            Ok(())
        };
        // CubeMX Parameter Settings of an asynchronous UART (only the values that differ from 8N1 / TX_RX / 16 are kept).
        if is_serial(id) {
            choose(&mut q, uart_params())?;
            if q.get("overSampling") == Some(&json!(8)) && family_id == F1 {
                return Err(format!(
                    "{id}: STM32F103RB의 USART는 Over Sampling 16만 지원합니다."
                ));
            }
        }
        // I2C Parameter Settings: Primary slave address (7-bit), Fast Mode Duty Cycle (only above 100 kHz), Clock No
        // Stretch Mode.
        if is_i2c(id) {
            if let Some(v) = p.get("ownAddress") {
                if !integer(v).is_some_and(|n| (0.0..=127.0).contains(&n)) {
                    return Err(format!("{id}.ownAddress: 7비트 주소(0x00~0x7F)입니다."));
                }
                if js_truthy(v) {
                    q.insert("ownAddress".into(), v.clone());
                }
            }
            if let Some(v) = p.get("dutyCycle") {
                if !matches!(v.as_str(), Some("2") | Some("16_9")) {
                    return Err(format!("{id}.dutyCycle: 2 / 16_9 중에서 고르세요."));
                }
                if v == "16_9" {
                    if q.get("clock")
                        .and_then(Value::as_f64)
                        .is_some_and(|c| c <= 100_000.0)
                    {
                        return Err(format!(
                            "{id}: Fast Mode Duty Cycle 16/9는 100 kHz보다 빠를 때만 씁니다."
                        ));
                    }
                    q.insert("dutyCycle".into(), json!("16_9"));
                }
            }
            if let Some(v) = p.get("noStretch") {
                let Some(on) = v.as_bool() else {
                    return Err(format!("{id}.noStretch: true 또는 false입니다."));
                };
                if on {
                    q.insert("noStretch".into(), json!(true));
                }
            }
        }
        if is_spi(id) {
            choose(&mut q, spi_params())?;
        }
        if is_serial(id) && p.get("mode").is_some_and(|m| m != "asynchronous") {
            let clocks = keys(&f["usartCk"]);
            if p.get("mode") != Some(&json!("synchronous"))
                || !f["usartCk"].get(id).is_some_and(js_truthy)
            {
                return Err(format!(
                    "{id}: 동기 모드는 USART{}에서만 지원합니다.",
                    clocks
                        .iter()
                        .map(|u| u.replacen("USART", "", 1))
                        .collect::<Vec<_>>()
                        .join("/")
                ));
            }
            q.insert("mode".into(), json!("synchronous"));
            for key in ["cpol", "cpha", "lastBit"] {
                let v = or_value(p.get(key), json!(0));
                if !v.as_f64().is_some_and(|n| n == 0.0 || n == 1.0) {
                    return Err(format!("{id}.{key}: 0 또는 1입니다."));
                }
                q.insert(key.into(), v);
            }
        }
        peripherals.insert(id.into(), Value::Object(q));
    }
    out.insert("peripherals".into(), Value::Object(peripherals));
    if let Some(dma) = value.get("dma") {
        let Some(list) = dma.as_object() else {
            return Err("DMA 설정을 확인하세요.".into());
        };
        let table = dma_requests_of(&f);
        let mut kept = Map::new();
        let mut streams: Vec<(String, String)> = Vec::new();
        for (request, d) in list {
            let options = table
                .get(request)
                .and_then(Value::as_array)
                .filter(|_| js_truthy(d));
            let Some(options) = options else {
                return Err(format!(
                    "{request}: {family_id}에서 지원하지 않는 DMA 요청입니다."
                ));
            };
            let stream = or_value(d.get("stream"), options[0][0].clone());
            let channel = or_value(d.get("channel"), or_value(options[0].get(1), json!(0)));
            let mode = or_value(d.get("mode"), json!("normal"));
            let priority = or_value(d.get("priority"), json!("low"));
            if !options
                .iter()
                .any(|o| o[0] == stream && (o[1].is_null() || o[1] == channel))
            {
                return Err(format!(
                    "{request}: {} 채널 {} 조합은 사용할 수 없습니다.",
                    js_display(Some(&stream)),
                    js_display(Some(&channel))
                ));
            }
            let good = mode.as_str().is_some_and(|m| DMA_MODES.contains(&m))
                && priority
                    .as_str()
                    .is_some_and(|p| DMA_PRIORITIES.contains(&p))
                && !(request == "MEMTOMEM" && mode == "circular");
            if !good {
                return Err(format!("{request}: DMA 모드/우선순위를 확인하세요."));
            }
            let name = js_display(Some(&stream));
            if let Some((_, other)) = streams.iter().find(|(s, _)| *s == name) {
                return Err(format!(
                    "{name}: {other}와 {request}가 같은 {}을 사용합니다.",
                    if f1 { "채널" } else { "스트림" }
                ));
            }
            streams.push((name, request.clone()));
            kept.insert(
                request.clone(),
                json!({"stream": stream, "channel": channel, "mode": mode, "priority": priority}),
            );
        }
        out.insert("dma".into(), Value::Object(kept));
    }
    let irqs = mcu::irq_names_of(&f);
    let priority = |v: Option<&Value>| {
        v.and_then(integer)
            .is_some_and(|n| (0.0..=15.0).contains(&n))
    };
    if listed("nvic") {
        return Err(format!("0: {family_id}에 없는 인터럽트입니다."));
    }
    let mut nvic = Map::new();
    for (irq, p) in entries(value.get("nvic")) {
        if !irqs.contains(irq) {
            return Err(format!("{irq}: {family_id}에 없는 인터럽트입니다."));
        }
        let good = js_truthy(p)
            && p.get("enabled").is_some_and(Value::is_boolean)
            && priority(p.get("priority"))
            && (p.get("sub").is_none() || priority(p.get("sub")));
        if !good {
            return Err(format!("{irq}: NVIC 우선순위는 0~15 정수로 설정하세요."));
        }
        let mut q = json!({"enabled": p["enabled"], "priority": p["priority"]});
        if p.get("sub").is_some_and(js_truthy) {
            q["sub"] = p["sub"].clone();
        }
        nvic.insert(irq.clone(), q);
    }
    out.insert("nvic".into(), Value::Object(nvic));
    // CubeMX NVIC Priority Group (NVIC_PRIORITYGROUP_0..4, HAL default 4) and the time base priority.
    if let Some(group) = value.get("nvicGroup") {
        if !integer(group).is_some_and(|n| (0.0..=4.0).contains(&n)) {
            return Err("NVIC Priority Group은 0~4입니다.".into());
        }
        if group.as_f64() != Some(mcu::NVIC_GROUP_DEFAULT as f64) {
            out.insert("nvicGroup".into(), group.clone());
        }
    }
    // CubeMX Project Manager › Code Generator: peripheral initialisation as a pair of .c/.h files per peripheral.
    if let Some(couple) = value.get("coupleFiles") {
        let Some(on) = couple.as_bool() else {
            return Err("주변장치별 파일 생성 설정을 확인하세요.".into());
        };
        if on {
            out.insert("coupleFiles".into(), json!(true));
        }
    }
    if let Some(tick) = value.get("tickPriority") {
        if !priority(Some(tick)) {
            return Err("SysTick(Time base) 우선순위는 0~15 정수로 설정하세요.".into());
        }
        if tick.as_f64() != Some(mcu::TICK_PRIORITY_DEFAULT as f64) {
            out.insert("tickPriority".into(), tick.clone());
        }
    }
    // The order JavaScript gave the keys: pins, peripherals and nvic were there from the start.
    let mut ordered = Map::new();
    for key in [
        "family",
        "pins",
        "peripherals",
        "nvic",
        "timerClockHz",
        "clock",
        "dma",
        "nvicGroup",
        "coupleFiles",
        "tickPriority",
    ] {
        if let Some(v) = out.remove(key) {
            ordered.insert(key.into(), v);
        }
    }
    Ok(Value::Object(ordered))
}
fn keys(value: &Value) -> Vec<String> {
    value
        .as_object()
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default()
}

/// What CubeMX would mark in these settings: pins without their peripheral, missing pins, clashes, limits.
pub fn config_problems(config: &Value) -> Result<Vec<String>, String> {
    let mut errors: Vec<String> = Vec::new();
    // Signals in the order they first came (a Map in the JavaScript), EXTI lines and labels.
    let mut signals: Vec<(String, String)> = Vec::new();
    let mut exti: Vec<(String, String)> = Vec::new();
    let mut labels: Vec<String> = Vec::new();
    let peripherals = config.get("peripherals");
    let periph_of = |id: &str| peripherals.and_then(|p| p.get(id));
    let enabled = |id: &str| {
        periph_of(id)
            .and_then(|p| p.get("enabled"))
            .is_some_and(js_truthy)
    };
    let family_id = match config.get("family") {
        Some(f) if !f.is_null() => js_display(Some(f)),
        _ => mcu::DEFAULT_FAMILY.to_string(),
    };
    // Settings that were not checked (validateMcu) can lack what this reads: the JavaScript tripped over them, and so
    // does this.
    let section = |key: &str| config.get(key).filter(|v| !v.is_null());
    let broken = config.get("pins").is_some_and(Value::is_string)
        || section("pins").is_none()
        || section("peripherals").is_none()
        || entries(config.get("pins"))
            .iter()
            .any(|(_, p)| p.is_null() || !p.get("function").is_some_and(Value::is_string))
        || entries(config.get("peripherals"))
            .iter()
            .any(|(_, p)| p.is_null())
        || entries(config.get("nvic")).iter().any(|(_, n)| n.is_null());
    if broken {
        return Err("핀 설정이 올바르지 않습니다(검사되지 않은 설정).".into());
    }
    let family_missing = config.get("family").is_some_and(Value::is_null);
    let family = mcu::profile(&family_id)?;
    let routes = mcu::routes_of(&family);
    for (pin, p) in entries(config.get("pins")) {
        let function = text_of(p.get("function"));
        let label = text_of(p.get("label"));
        let gpio = MODES.contains(&function);
        // PA13/PA14 carry SWD: reconfiguring them cuts the ST-LINK off the running board.
        if (pin == "PA13" || pin == "PA14") && !matches!(function, "Reset" | "Reserved") {
            errors.push(format!(
                "{pin}: SWD 디버그 핀({})이라 다른 기능으로 쓸 수 없습니다. 보드 쓰기와 디버깅이 끊깁니다.",
                if pin == "PA13" { "SWDIO" } else { "SWCLK" }
            ));
        }
        // LABEL_Pin / LABEL_GPIO_Port become macros: a HAL name or HAL/CMSIS prefix would break the headers.
        if !label.is_empty() && (HAL_NAME.is_match(label) || HAL_PREFIX.is_match(label)) {
            errors.push(format!("{pin}: 라벨 {label}은 HAL 이름과 겹칩니다 ({label}_Pin 매크로). 다른 이름을 쓰세요."));
        }
        if !label.is_empty() {
            if labels.iter().any(|l| l == label) {
                errors.push(format!("사용자 라벨 중복: {label}"));
            } else {
                labels.push(label.to_string());
            }
        }
        if function == "GPIO_EXTI" {
            let n = pin.get(2..).unwrap_or("").to_string();
            match exti.iter_mut().find(|(line, _)| *line == n) {
                Some((_, other)) => {
                    errors.push(format!("EXTI{n}: {other}와 {pin} 충돌"));
                    *other = pin.clone();
                }
                None => exti.push((n, pin.clone())),
            }
        }
        if !gpio {
            match signals.iter_mut().find(|(signal, _)| signal == function) {
                Some((_, other)) => {
                    errors.push(format!("{function}: 핀을 하나만 지정하세요."));
                    *other = pin.clone();
                }
                None => signals.push((function.to_string(), pin.clone())),
            }
        }
        let serial = serial_function(function)
            .map(String::from)
            .or_else(|| USART_CK.captures(function).map(|m| m[1].to_string()));
        if let Some(serial) = &serial {
            if !enabled(serial) {
                errors.push(format!("{pin}: {serial} 주변장치를 활성화하세요."));
            }
        }
        let owner = function.split('_').next().unwrap_or("");
        if serial.is_none() && !gpio && family_missing {
            return Err("지원하지 않는 MCU입니다: null".into());
        }
        if serial.is_none() && !gpio && routes.get(owner).is_some() && !enabled(owner) {
            errors.push(format!("{pin}: {owner} 주변장치를 활성화하세요."));
        }
        if let Some(serial) = &serial {
            if function.ends_with("_CK")
                && periph_of(serial).and_then(|p| p.get("mode")) != Some(&json!("synchronous"))
            {
                errors.push(format!(
                    "{pin}: {serial} 동기(Synchronous) 모드에서만 CK 핀을 사용합니다."
                ));
            }
        }
    }
    let has = |signal: &str| signals.iter().any(|(s, _)| s == signal);
    for (id, p) in entries(peripherals) {
        if !p.get("enabled").is_some_and(js_truthy) {
            continue;
        }
        let id = id.as_str();
        let mode = text_of(p.get("mode"));
        let required: Vec<&str> = if is_serial(id) {
            if mode == "synchronous" {
                vec!["TX", "RX", "CK"]
            } else {
                vec!["TX", "RX"]
            }
        } else if is_i2c(id) {
            vec!["SCL", "SDA"]
        } else if is_spi(id) {
            if p.get("direction") == Some(&json!("TX_ONLY")) {
                vec!["SCK", "MOSI"]
            } else {
                vec!["SCK", "MISO", "MOSI"]
            }
        } else if id == "SDIO" {
            vec!["D0", "CK", "CMD"]
        } else {
            vec![]
        };
        for role in required {
            if !has(&format!("{id}_{role}")) {
                errors.push(format!("{id}: {role} 핀을 활성화하세요."));
            }
        }
        // F446/F103 I2C1 (not FMPI2C) runs standard or fast mode only.
        if is_i2c(id)
            && p.get("clock")
                .and_then(Value::as_f64)
                .is_some_and(|c| c > 400_000.0)
        {
            errors.push(format!(
                "{id}: 클록은 400 kHz(Fast mode) 이하로 설정하세요."
            ));
        }
        let timer = is_timer(id);
        if timer && mode == "encoder" {
            for ch in ["CH1", "CH2"] {
                if !has(&format!("{id}_{ch}")) {
                    errors.push(format!("{id}: 엔코더 {ch} 핀을 활성화하세요."));
                }
            }
            // The encoder model counts every edge (TIM_ENCODERMODE_TI1/TI2/TI12 with Prescaler 0), as the interpreter does.
            if p.get("prescaler").is_some_and(js_truthy) {
                errors.push(format!("{id}: 엔코더 모드는 Prescaler 0을 사용하세요."));
            }
        }
        let channel_prefix = format!("{id}_CH");
        if timer
            && matches!(mode, "pwm" | "oc" | "capture")
            && !signals.iter().any(|(s, _)| s.starts_with(&channel_prefix))
        {
            errors.push(format!("{id}: 채널 핀을 활성화하세요."));
        }
        // Complementary outputs (TIMx_CHnN) exist only for PWM / output compare channels.
        let complementary = |signal: &str| {
            signal.strip_prefix(&channel_prefix).is_some_and(|rest| {
                rest.len() == 2 && rest.as_bytes()[0].is_ascii_digit() && rest.ends_with('N')
            })
        };
        if is_advanced_timer(id)
            && !matches!(mode, "pwm" | "oc")
            && signals.iter().any(|(s, _)| complementary(s))
        {
            errors.push(format!(
                "{id}: 상보 출력(CHxN)은 PWM 또는 출력 비교 모드에서 씁니다."
            ));
        }
        if id == "ADC1" && !signals.iter().any(|(s, _)| s.starts_with("ADC1_IN")) {
            errors.push("ADC1: 입력 채널을 활성화하세요.".into());
        }
    }
    // F1: every signal of a peripheral must sit on one AFIO remap option (default or remapped pins together).
    if family["pinMux"] == "remap" {
        for (id, options) in entries(family.get("remaps")) {
            let prefix = format!("{id}_");
            let mut assigned = Map::new();
            for (pin, p) in entries(config.get("pins")) {
                if let Some(signal) = text_of(p.get("function")).strip_prefix(&prefix) {
                    assigned.insert(signal.to_string(), json!(pin));
                }
            }
            if assigned.is_empty()
                || mcu::remap_for(&family_id, id, &Value::Object(assigned.clone()))?.is_some()
            {
                continue;
            }
            let pairs = |map: &Map<String, Value>, between: &str, join: &str| {
                map.iter()
                    .map(|(s, pin)| format!("{s}{between}{}", js_display(Some(pin))))
                    .collect::<Vec<_>>()
                    .join(join)
            };
            let groups: Vec<String> = options
                .as_array()
                .into_iter()
                .flatten()
                .map(|o| pairs(o["pins"].as_object().unwrap_or(&Map::new()), " ", "/"))
                .collect();
            errors.push(format!(
                "{id}: {} 조합은 {family_id}에서 쓸 수 없습니다. 함께 옮겨지는 핀 묶음: {}",
                pairs(&assigned, "=", ", "),
                groups.join(" 또는 ")
            ));
        }
    }
    let nvic = config.get("nvic").filter(|n| js_truthy(n));
    for (irq, n) in entries(nvic) {
        if irq == "TIM6_DAC_IRQn" && enabled("DAC") {
            continue;
        }
        let id = timer_of_irq(irq)
            .map(String::from)
            .unwrap_or_else(|| irq.strip_suffix("_IRQn").unwrap_or(irq).to_string());
        if n.get("enabled").is_some_and(js_truthy)
            && (is_serial(&id) || is_timer(&id))
            && !enabled(&id)
        {
            errors.push(format!(
                "{irq}: {id} 주변장치를 활성화하거나 인터럽트를 끄세요."
            ));
        }
    }
    // The requests of the DMA section; of a text or a list (settings that were not checked) the places "0", "1", ….
    let requests: Vec<String> = match config.get("dma") {
        Some(Value::Object(map)) => map.keys().cloned().collect(),
        Some(Value::String(text)) => (0..text.encode_utf16().count())
            .map(|i| i.to_string())
            .collect(),
        Some(Value::Array(list)) => (0..list.len()).map(|i| i.to_string()).collect(),
        _ => Vec::new(),
    };
    for request in &requests {
        let Some(id) = dma_owner(request) else {
            continue;
        };
        if !enabled(&id) {
            errors.push(format!("{request} DMA: {id} 주변장치를 활성화하세요."));
        }
        if is_timer(&id) {
            // The JavaScript read the timer's mode here, and tripped when the timer was not in the settings at all.
            let Some(timer) = periph_of(&id).filter(|t| !t.is_null()) else {
                return Err(format!("{request} DMA: {id} 설정이 없습니다."));
            };
            if timer.get("mode") != Some(&json!("pwm")) {
                errors.push(format!("{request} DMA: {id}를 PWM 모드로 설정하세요."));
            }
        }
    }
    let nvic_on = |irq: &str| {
        nvic.and_then(|n| n.get(irq))
            .and_then(|line| line.get("enabled"))
            .is_some_and(js_truthy)
    };
    if nvic_on("WWDG_IRQn") && !enabled("WWDG") {
        errors.push("WWDG_IRQn: WWDG를 활성화하거나 인터럽트를 끄세요.".into());
    }
    errors.extend(mcu::dac_problems(config));
    errors.extend(mcu::adc_group_problems(config));
    errors.extend(mcu::nvic_problems(config));
    if let Some(tree) = config.get("clock").filter(|c| js_truthy(c)) {
        let tree = tree.as_object().cloned().unwrap_or_default();
        errors.extend(clock::problems(&family_id, &tree)?);
        if enabled("ADC1") {
            if let Some(adc) = clock::adc_problem(&family_id, &tree)? {
                errors.push(adc);
            }
        }
    }
    Ok(errors)
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    Some(match name {
        "mcu_tables" => Ok(tables()),
        "dma_peripheral" => Ok(json!(dma_owner(s(0)))),
        "dma_direction" => Ok(json!(dma_direction(s(0)))),
        "irq_for_pin" => Ok(json!(irq_for_pin(s(0)))),
        "pin_functions" => mcu::profile(s(1)).map(|profile| json!(pin_functions(s(0), &profile))),
        "default_mcu" => default_mcu(s(0)),
        "tim_channel_params" => Ok(tim_channel_params(s(0))),
        "validate_mcu" => validate_mcu(v(0)),
        "config_problems" => config_problems(v(0)).map(|list| json!(list)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_clean_copy() {
        let raw = json!({
            "family": "STM32F446RE", "extra": 1,
            "pins": {"PA5": {"function": "GPIO_Output", "pull": "NOPULL", "edge": "RISING", "label": "LD2", "initial": 0, "speed": "LOW", "junk": 1}},
            "peripherals": {"USART2": {"enabled": false, "wordLength": 8, "parity": "EVEN"}, "TIM2": {"enabled": true, "mode": "pwm", "channels": {"CH1": {"pulse": 5, "polarity": "HIGH"}}}},
            "nvic": {"USART2_IRQn": {"enabled": true, "priority": 3, "sub": 0}},
            "nvicGroup": 4, "tickPriority": 7,
        });
        assert_eq!(
            validate_mcu(&raw).unwrap(),
            json!({
                "family": "STM32F446RE",
                "pins": {"PA5": {"function": "GPIO_Output", "pull": "NOPULL", "edge": "RISING", "label": "LD2", "initial": 0, "speed": "LOW"}},
                "peripherals": {"USART2": {"enabled": false, "baud": 115200, "parity": "EVEN"}, "TIM2": {"enabled": true, "prescaler": 0, "period": 4294967295u32, "pulse": 0, "mode": "pwm", "channels": {"CH1": {"pulse": 5}}}},
                "nvic": {"USART2_IRQn": {"enabled": true, "priority": 3}},
                "timerClockHz": 16000000, "tickPriority": 7,
            })
        );
        assert_eq!(
            validate_mcu(&json!({"family": "X"})).unwrap_err(),
            "MCU 핀 설정이 필요합니다 (STM32F446RE / STM32F103RB)."
        );
        let bad = |change: Value| {
            let mut c = default_mcu("STM32F103RB").unwrap();
            for (k, v) in change.as_object().unwrap() {
                c[k] = v.clone();
            }
            validate_mcu(&c).unwrap_err()
        };
        assert_eq!(
            bad(json!({"timerClockHz": 9000000})),
            "APB1 타이머 클록 범위: 8~64 MHz (4 MHz 단위)"
        );
        assert_eq!(
            bad(json!({"pins": {"PH0": {"function": "GPIO_Input"}}})),
            "PH0: STM32F103RB에서 지원하지 않는 핀 기능입니다."
        );
        assert_eq!(
            bad(json!({"peripherals": {"TIM5": {"enabled": true}}})),
            "TIM5: STM32F103RB에서 지원하지 않는 주변장치입니다."
        );
        assert_eq!(
            bad(json!({"dma": {"ADC1": {"stream": "DMA1_Channel2"}}})),
            "ADC1: DMA1_Channel2 채널 0 조합은 사용할 수 없습니다."
        );
        assert_eq!(
            bad(json!({"nvic": {"TIM5_IRQn": {"enabled": true, "priority": 0}}})),
            "TIM5_IRQn: STM32F103RB에 없는 인터럽트입니다."
        );
    }

    #[test]
    fn problems() {
        let config = json!({
            "family": "STM32F446RE",
            "pins": {"PA13": {"function": "GPIO_Output", "label": "HAL_x"}, "PA2": {"function": "USART2_TX", "label": "a"}, "PC13": {"function": "GPIO_EXTI", "label": "a"}, "PB13": {"function": "GPIO_EXTI", "label": ""}},
            "peripherals": {"I2C1": {"enabled": true, "clock": 500000}, "TIM2": {"enabled": true, "mode": "pwm"}},
            "nvic": {"USART2_IRQn": {"enabled": true}},
        });
        assert_eq!(
            config_problems(&config).unwrap(),
            [
                "PA13: SWD 디버그 핀(SWDIO)이라 다른 기능으로 쓸 수 없습니다. 보드 쓰기와 디버깅이 끊깁니다.",
                "PA13: 라벨 HAL_x은 HAL 이름과 겹칩니다 (HAL_x_Pin 매크로). 다른 이름을 쓰세요.",
                "PA2: USART2 주변장치를 활성화하세요.",
                "사용자 라벨 중복: a",
                "EXTI13: PC13와 PB13 충돌",
                "I2C1: SCL 핀을 활성화하세요.",
                "I2C1: SDA 핀을 활성화하세요.",
                "I2C1: 클록은 400 kHz(Fast mode) 이하로 설정하세요.",
                "TIM2: 채널 핀을 활성화하세요.",
                "USART2_IRQn: USART2 주변장치를 활성화하거나 인터럽트를 끄세요."
            ]
        );
        assert_eq!(irq_for_pin("PC13"), "EXTI15_10_IRQn");
        assert_eq!(irq_for_pin("PA3"), "EXTI3_IRQn");
        assert_eq!(dma_direction("USART2_RX"), "P2M");
        let f4 = mcu::profile("STM32F446RE").unwrap();
        assert!(pin_functions("PA2", &f4).contains(&"USART2_TX".to_string()));
        assert!(pin_functions("PA4", &f4).contains(&"USART2_CK".to_string()));
    }
}
