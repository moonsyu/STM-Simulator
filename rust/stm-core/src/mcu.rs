//! The MCU families (STM32F446RE, STM32F103RB) and the Pinout settings that depend on them: the family profiles,
//! NVIC, the ADC regular group, DAC, watchdogs and RTC. Moved here from `src/mcu-family.js`, `nvic-config.js`,
//! `adc-config.js`, `dac-config.js`, `wdg-config.js` and `rtc-config.js` (feature 62); those files now only call
//! these functions.
//!
//! Settings are the JSON a project stores (`mcu.peripherals.RTC` …). A key a project leaves out is JavaScript's
//! `undefined`; a key that is there with `null` is not.

use crate::clock;
use crate::periph::{
    self, bus_irqs, f1_bus_routes, f4_bus_routes, js_truthy, serial_routes, timer_cc_irq,
    timer_irq, timer_routes,
};
use serde_json::{json, Map, Value};

pub const F4: &str = "STM32F446RE";
pub const F1: &str = "STM32F103RB";
pub const DEFAULT_FAMILY: &str = F4;

// ---------- JavaScript's way of printing and reading values ----------

/// A JSON value as a JavaScript template prints it (`${value}`); a missing one prints `undefined`.
pub fn js_display(value: Option<&Value>) -> String {
    match value {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => js_number(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| {
                if item.is_null() {
                    String::new()
                } else {
                    js_display(Some(item))
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}
/// A number as JavaScript prints it.
pub fn js_number(v: f64) -> String {
    if v.is_nan() {
        "NaN".into()
    } else if v.is_infinite() {
        if v > 0.0 { "Infinity" } else { "-Infinity" }.into()
    } else if v.fract() == 0.0 && v.abs() < 1e21 {
        format!("{}", v as i128)
    } else {
        format!("{v}")
    }
}
/// A JSON number that is a whole one (`Number.isInteger`).
fn integer(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite() && v.fract() == 0.0)
}
/// A number as JSON: a whole one without a fraction; NaN and the infinities become null.
pub fn number(v: f64) -> Value {
    if v.is_finite() && v.fract() == 0.0 && v.abs() < 9e15 {
        json!(v as i64)
    } else {
        json!(v)
    }
}
/// `value ?? default`: the value unless it is missing or null.
fn or<'a>(value: Option<&'a Value>, default: &'a Value) -> &'a Value {
    match value {
        Some(v) if !v.is_null() => v,
        _ => default,
    }
}
fn present(value: Option<&Value>) -> Option<&Value> {
    value.filter(|v| !v.is_null())
}
fn object<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    value.and_then(|v| v.get(key))
}
fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}
fn function_of(pin: &Value) -> &str {
    pin.get("function").and_then(Value::as_str).unwrap_or("")
}
fn pins_of(config: &Value) -> impl Iterator<Item = (&String, &Value)> {
    config
        .get("pins")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
}
/// `{key: [raw, fallback]}` under this key stands for a number the caller reads from a .ioc value with its own
/// reader (which notes unreadable values): `src/rust-core.js` `withNumbers` puts the number in its place.
pub const NUMBER: &str = "\u{1}number";
fn ioc_number(values: &Value, key: &str, fallback: i64) -> Value {
    json!({ NUMBER: [values.get(key).cloned().unwrap_or(Value::Null), fallback] })
}
fn ioc_text<'a>(values: &'a Value, key: &str) -> &'a str {
    values.get(key).and_then(Value::as_str).unwrap_or("")
}

// ---------- family profiles (mcu-family.js) ----------

const ADC_PINS: [&str; 16] = [
    "PA0", "PA1", "PA2", "PA3", "PA4", "PA5", "PA6", "PA7", "PB0", "PB1", "PC0", "PC1", "PC2",
    "PC3", "PC4", "PC5",
];
const EXTI_IRQS: [&str; 7] = [
    "EXTI0_IRQn",
    "EXTI1_IRQn",
    "EXTI2_IRQn",
    "EXTI3_IRQn",
    "EXTI4_IRQn",
    "EXTI9_5_IRQn",
    "EXTI15_10_IRQn",
];
fn adc_routes() -> Value {
    Value::Object(
        ADC_PINS
            .iter()
            .enumerate()
            .map(|(i, pin)| (format!("IN{i}"), json!([pin])))
            .collect(),
    )
}
fn merged(parts: &[Value]) -> Value {
    let mut out = Map::new();
    for part in parts {
        for (key, value) in part.as_object().into_iter().flatten() {
            out.insert(key.clone(), value.clone());
        }
    }
    Value::Object(out)
}
fn keys(value: &Value) -> Vec<String> {
    value
        .as_object()
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default()
}
/// F1: each peripheral uses its default pins or one AFIO remap that moves its signals together. A configuration is
/// valid only when every signal of a peripheral matches one remap option.
fn f1_remaps() -> Value {
    json!({
        "USART1": [{"pins": {"TX": "PA9", "RX": "PA10"}}, {"macro": "__HAL_AFIO_REMAP_USART1_ENABLE", "pins": {"TX": "PB6", "RX": "PB7"}}],
        "USART3": [{"pins": {"TX": "PB10", "RX": "PB11", "CK": "PB12"}}, {"macro": "__HAL_AFIO_REMAP_USART3_PARTIAL", "pins": {"TX": "PC10", "RX": "PC11", "CK": "PC12"}}],
        "I2C1": [{"pins": {"SCL": "PB6", "SDA": "PB7"}}, {"macro": "__HAL_AFIO_REMAP_I2C1_ENABLE", "pins": {"SCL": "PB8", "SDA": "PB9"}}],
        "SPI1": [{"pins": {"SCK": "PA5", "MISO": "PA6", "MOSI": "PA7"}}, {"macro": "__HAL_AFIO_REMAP_SPI1_ENABLE", "pins": {"SCK": "PB3", "MISO": "PB4", "MOSI": "PB5"}}],
        // TIM1 (RM0008 9.3.7): the partial remap moves only the complementary outputs.
        "TIM1": [{"pins": {"CH1": "PA8", "CH2": "PA9", "CH3": "PA10", "CH4": "PA11", "CH1N": "PB13", "CH2N": "PB14", "CH3N": "PB15"}}, {"macro": "__HAL_AFIO_REMAP_TIM1_PARTIAL", "pins": {"CH1": "PA8", "CH2": "PA9", "CH3": "PA10", "CH4": "PA11", "CH1N": "PA7", "CH2N": "PB0", "CH3N": "PB1"}}],
        "TIM2": [{"pins": {"CH1": "PA0", "CH2": "PA1", "CH3": "PA2", "CH4": "PA3"}}, {"macro": "__HAL_AFIO_REMAP_TIM2_PARTIAL_1", "pins": {"CH1": "PA15", "CH2": "PB3", "CH3": "PA2", "CH4": "PA3"}},
            {"macro": "__HAL_AFIO_REMAP_TIM2_PARTIAL_2", "pins": {"CH1": "PA0", "CH2": "PA1", "CH3": "PB10", "CH4": "PB11"}}, {"macro": "__HAL_AFIO_REMAP_TIM2_ENABLE", "pins": {"CH1": "PA15", "CH2": "PB3", "CH3": "PB10", "CH4": "PB11"}}],
        "TIM3": [{"pins": {"CH1": "PA6", "CH2": "PA7", "CH3": "PB0", "CH4": "PB1"}}, {"macro": "__HAL_AFIO_REMAP_TIM3_PARTIAL", "pins": {"CH1": "PB4", "CH2": "PB5", "CH3": "PB0", "CH4": "PB1"}},
            {"macro": "__HAL_AFIO_REMAP_TIM3_ENABLE", "pins": {"CH1": "PC6", "CH2": "PC7", "CH3": "PC8", "CH4": "PC9"}}],
        "TIM4": [{"pins": {"CH1": "PB6", "CH2": "PB7", "CH3": "PB8", "CH4": "PB9"}}],
        "USART2": [{"pins": {"TX": "PA2", "RX": "PA3", "CK": "PA4"}}],
    })
}
/// The pins each signal of a peripheral can be on, over its remap options (CK is not a route of the Pinout).
fn routes_from_remaps(remaps: &Value, id: &str) -> Value {
    let mut out: Map<String, Value> = Map::new();
    for option in remaps[id].as_array().into_iter().flatten() {
        for (signal, pin) in option["pins"].as_object().into_iter().flatten() {
            if signal == "CK" {
                continue;
            }
            let list = out
                .entry(signal.clone())
                .or_insert_with(|| json!([]))
                .as_array_mut()
                .unwrap();
            if !list.contains(pin) {
                list.push(pin.clone());
            }
        }
    }
    Value::Object(out)
}
fn with_suffix(items: &[String], suffix: &str) -> Vec<String> {
    items.iter().map(|item| format!("{item}{suffix}")).collect()
}

/// The profile of the STM32F446RE (DS10693 / RM0390). `timerMax` and `clock.valid` are functions on the JavaScript
/// side: here they are null, in their places.
fn f4_profile() -> Value {
    let streams: Vec<String> = ["DMA1", "DMA2"]
        .iter()
        .flat_map(|unit| (0..8).map(move |i| format!("{unit}_Stream{i}")))
        .collect();
    let buses = f4_bus_routes();
    let mut irq_extra: Vec<String> = [
        "ADC_IRQn",
        "SPI1_IRQn",
        "I2C1_EV_IRQn",
        "I2C1_ER_IRQn",
        "DCMI_IRQn",
        "SDIO_IRQn",
        "RTC_Alarm_IRQn",
        "RTC_WKUP_IRQn",
        "WWDG_IRQn",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    irq_extra.extend(bus_irqs(&keys(&buses)));
    irq_extra.extend(with_suffix(&streams, "_IRQn"));
    json!({
        "id": F4, "series": "STM32F4", "core": "Cortex-M4", "fpu": true, "flashKB": 512, "ramKB": 128,
        "serial": serial_routes(),
        "usartCk": {"USART1": ["PA8"], "USART2": ["PA4"], "USART3": ["PB12", "PC12"], "USART6": ["PC8"]},
        "timers": timer_routes(),
        "extra": merged(&[json!({
            "I2C1": {"SCL": ["PB6", "PB8"], "SDA": ["PB7", "PB9"]},
            "SDIO": {"D0": ["PC8"], "D1": ["PC9"], "D2": ["PC10"], "D3": ["PC11"], "CK": ["PC12"], "CMD": ["PD2"]},
            "DCMI": {},
            "SPI1": {"SCK": ["PA5", "PB3"], "MISO": ["PA6", "PB4"], "MOSI": ["PA7", "PB5"]},
            "ADC1": adc_routes(), "RTC": {}, "DAC": {"OUT1": ["PA4"], "OUT2": ["PA5"]}, "IWDG": {}, "WWDG": {},
        }), buses]),
        // Alternate functions are selected per pin with GPIO_InitStruct.Alternate.
        "pinMux": "af",
        "timerMax": null,
        "dmaUnits": streams,
        "irqExtra": irq_extra,
        // The chip's own pins (family.rs): not the array of the board on the screen (feature 53).
        "gpioPins": crate::family::gpio_pins(F4),
        "ports": ["A", "B", "C", "D", "H"],
        // HSI 16 MHz directly, or an HSI PLL value the generator can build: APB1 timer clock = HCLK <= 90 MHz (APB1 <=
        // 45 MHz), VCO = 16/16 MHz x N (100..432) divided by 2/4/6/8.
        "clock": {"defaultHz": 16000000, "exampleHz": 84000000, "minHz": 12500000, "maxHz": 90000000, "label": "16 MHz 또는 12.5~90 MHz(HSI PLL)", "valid": null},
        "hal": {"prefix": "stm32f4xx", "define": "STM32F446xx"},
    })
}
/// The profile of the STM32F103RB (DS5319 / RM0008).
fn f1_profile() -> Value {
    let remaps = f1_remaps();
    let channels: Vec<String> = (1..=7).map(|i| format!("DMA1_Channel{i}")).collect();
    // RM0008 table 78: each request is wired to one DMA1 channel; memory-to-memory may use any channel.
    let requests: [(&str, u32); 21] = [
        ("ADC1", 1),
        ("TIM2_CH3", 1),
        ("TIM4_CH1", 1),
        ("SPI1_RX", 2),
        ("USART3_TX", 2),
        ("TIM3_CH3", 2),
        ("SPI1_TX", 3),
        ("USART3_RX", 3),
        ("TIM3_CH4", 3),
        ("USART1_TX", 4),
        ("TIM4_CH2", 4),
        ("USART1_RX", 5),
        ("TIM2_CH1", 5),
        ("TIM4_CH3", 5),
        ("USART2_RX", 6),
        ("I2C1_TX", 6),
        ("TIM3_CH1", 6),
        ("USART2_TX", 7),
        ("I2C1_RX", 7),
        ("TIM2_CH2", 7),
        ("TIM2_CH4", 7),
    ];
    let mut dma_requests = Map::new();
    for (request, channel) in requests {
        dma_requests.insert(
            request.into(),
            json!([[format!("DMA1_Channel{channel}"), null]]),
        );
    }
    dma_requests.insert(
        "MEMTOMEM".into(),
        Value::Array(channels.iter().map(|c| json!([c, null])).collect()),
    );
    // F103 vector table (RM0008 table 63) for the peripherals the simulator models.
    let mut irq_numbers = Map::new();
    for (name, n) in [
        ("WWDG_IRQn", 0),
        ("PVD_IRQn", 1),
        ("TAMPER_IRQn", 2),
        ("RTC_IRQn", 3),
        ("FLASH_IRQn", 4),
        ("RCC_IRQn", 5),
        ("EXTI0_IRQn", 6),
        ("EXTI1_IRQn", 7),
        ("EXTI2_IRQn", 8),
        ("EXTI3_IRQn", 9),
        ("EXTI4_IRQn", 10),
    ] {
        irq_numbers.insert(name.into(), json!(n));
    }
    for (i, channel) in channels.iter().enumerate() {
        irq_numbers.insert(format!("{channel}_IRQn"), json!(11 + i));
    }
    for (name, n) in [
        ("ADC1_2_IRQn", 18),
        ("USB_HP_CAN1_TX_IRQn", 19),
        ("USB_LP_CAN1_RX0_IRQn", 20),
        ("CAN1_RX1_IRQn", 21),
        ("CAN1_SCE_IRQn", 22),
        ("EXTI9_5_IRQn", 23),
        ("TIM1_BRK_IRQn", 24),
        ("TIM1_UP_IRQn", 25),
        ("TIM1_TRG_COM_IRQn", 26),
        ("TIM1_CC_IRQn", 27),
        ("TIM2_IRQn", 28),
        ("TIM3_IRQn", 29),
        ("TIM4_IRQn", 30),
        ("I2C1_EV_IRQn", 31),
        ("I2C1_ER_IRQn", 32),
        ("I2C2_EV_IRQn", 33),
        ("I2C2_ER_IRQn", 34),
        ("SPI1_IRQn", 35),
        ("SPI2_IRQn", 36),
        ("USART1_IRQn", 37),
        ("USART2_IRQn", 38),
        ("USART3_IRQn", 39),
        ("EXTI15_10_IRQn", 40),
        ("RTC_Alarm_IRQn", 41),
        ("USBWakeUp_IRQn", 42),
    ] {
        irq_numbers.insert(name.into(), json!(n));
    }
    let buses = f1_bus_routes();
    let mut irq_extra: Vec<String> = [
        "ADC1_2_IRQn",
        "SPI1_IRQn",
        "I2C1_EV_IRQn",
        "I2C1_ER_IRQn",
        "RTC_IRQn",
        "RTC_Alarm_IRQn",
        "WWDG_IRQn",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    irq_extra.extend(bus_irqs(&keys(&buses)));
    irq_extra.extend(with_suffix(&channels, "_IRQn"));
    let routes = |id: &str| routes_from_remaps(&remaps, id);
    json!({
        "id": F1, "series": "STM32F1", "core": "Cortex-M3", "fpu": false, "flashKB": 128, "ramKB": 20,
        "serial": {"USART1": routes("USART1"), "USART2": routes("USART2"), "USART3": routes("USART3")},
        "usartCk": {"USART1": ["PA8"], "USART2": ["PA4"], "USART3": ["PB12", "PC12"]},
        "timers": {"TIM1": routes("TIM1"), "TIM2": routes("TIM2"), "TIM3": routes("TIM3"), "TIM4": routes("TIM4")},
        "extra": merged(&[json!({"I2C1": routes("I2C1"), "SPI1": routes("SPI1"), "ADC1": adc_routes(), "RTC": {}, "IWDG": {}, "WWDG": {}}), buses]),
        "pinMux": "remap",
        "remaps": remaps,
        // PA15/PB3/PB4 are JTAG pins after reset; using them needs __HAL_AFIO_REMAP_SWJ_NOJTAG() (SWD stays on).
        "jtagPins": ["PA15", "PB3", "PB4"],
        "timerMax": null,
        "dmaUnits": channels,
        "dmaRequests": dma_requests,
        "irqExtra": irq_extra,
        "irqNumbers": irq_numbers,
        // Same MB1136 board: CN7-29/31 carry PD0/PD1 (no port H) and CN10-18 is PB11.
        "gpioPins": crate::family::gpio_pins(F1),
        "ports": ["A", "B", "C", "D"],
        // HSI 8 MHz without PLL; with the PLL, SYSCLK = HSI/2 × PLLMUL (2..16) = 8..64 MHz in 4 MHz steps. APB1 is
        // limited to 36 MHz, so above that it runs at SYSCLK/2 and the timers get ×2: timer clock = SYSCLK.
        "clock": {"defaultHz": 8000000, "exampleHz": 64000000, "minHz": 8000000, "maxHz": 64000000, "label": "8~64 MHz (4 MHz 단위)", "valid": null},
        "hal": {"prefix": "stm32f1xx", "define": "STM32F103xB"},
    })
}
pub fn profile(family: &str) -> Result<Value, String> {
    match family {
        F4 => Ok(f4_profile()),
        F1 => Ok(f1_profile()),
        _ => Err(format!("지원하지 않는 MCU입니다: {family}")),
    }
}
/// Whether `hz` is an APB1 timer clock the single clock setting can have.
pub fn clock_valid(family: &str, hz: f64) -> bool {
    if !(hz.is_finite() && hz.fract() == 0.0) {
        return false;
    }
    if family == F1 {
        return (8e6..=64e6).contains(&hz) && hz % 4e6 == 0.0;
    }
    hz == 16e6
        || (hz <= 90e6
            && [4.0, 2.0, 6.0, 8.0].iter().any(|d| {
                let n = hz * d / 1e6;
                n.fract() == 0.0 && (100.0..=432.0).contains(&n)
            }))
}
pub fn family_timer_max(family: &str, id: &str) -> u32 {
    if family == F1 {
        65_535
    } else {
        periph::timer_max(id)
    }
}
/// Pin routes of every peripheral of a family, as {PERIPHERAL: {SIGNAL: [pins]}}.
pub fn routes_of(profile: &Value) -> Value {
    merged(&[
        profile["serial"].clone(),
        profile["extra"].clone(),
        profile["timers"].clone(),
    ])
}
pub fn irq_names_of(profile: &Value) -> Vec<String> {
    let f1 = profile["pinMux"] == "remap";
    let mut out: Vec<String> = EXTI_IRQS.iter().map(|s| s.to_string()).collect();
    out.extend(with_suffix(&keys(&profile["serial"]), "_IRQn"));
    let mut timers: Vec<String> = Vec::new();
    for id in keys(&profile["timers"]) {
        for irq in [timer_irq(&id, f1), timer_cc_irq(&id, false)] {
            if !timers.contains(&irq) {
                timers.push(irq);
            }
        }
    }
    out.extend(timers);
    out.extend(
        profile["irqExtra"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(String::from),
    );
    out
}
pub fn irq_names(family: &str) -> Result<Vec<String>, String> {
    profile(family).map(|p| irq_names_of(&p))
}
/// F1: the index of the remap option a peripheral's assigned signals select, or `None` when the pins mix options
/// (other families and peripherals without remaps: the first option when there is one).
pub fn remap_for(
    family: &str,
    peripheral: &str,
    assigned: &Value,
) -> Result<Option<usize>, String> {
    let profile = profile(family)?;
    let options = profile
        .get("remaps")
        .and_then(|remaps| remaps.get(peripheral))
        .and_then(Value::as_array);
    let Some(options) = options.filter(|_| profile["pinMux"] == "remap") else {
        return Ok(options.filter(|list| !list.is_empty()).map(|_| 0));
    };
    // A signal the option does not list (USART1_CK on PA8) is not moved by that remap.
    Ok(options.iter().position(|option| {
        assigned
            .as_object()
            .into_iter()
            .flatten()
            .all(|(signal, pin)| match option["pins"].get(signal) {
                None => true,
                Some(own) => own == pin,
            })
    }))
}
/// What mcu-family.js exports as data: `{default, profiles: {family: profile}, routes, irqNames, serialIds, timerIds}`.
pub fn family_tables() -> Value {
    let mut profiles = Map::new();
    let mut routes = Map::new();
    let mut irqs = Map::new();
    let mut serial = Map::new();
    let mut timers = Map::new();
    for family in [F4, F1] {
        let p = profile(family).unwrap();
        routes.insert(family.into(), routes_of(&p));
        irqs.insert(family.into(), json!(irq_names_of(&p)));
        serial.insert(family.into(), json!(keys(&p["serial"])));
        timers.insert(family.into(), json!(keys(&p["timers"])));
        profiles.insert(family.into(), p);
    }
    json!({"default": DEFAULT_FAMILY, "profiles": profiles, "routes": routes, "irqNames": irqs, "serialIds": serial, "timerIds": timers})
}

// ---------- NVIC (nvic-config.js) ----------

pub const NVIC_GROUP_DEFAULT: i64 = 4;
pub const TICK_PRIORITY_DEFAULT: i64 = 15;
pub fn nvic_tables() -> Value {
    json!({
        "group": NVIC_GROUP_DEFAULT,
        "tick": TICK_PRIORITY_DEFAULT,
        // Cortex-M3/M4 system exceptions in CubeMX order; only the time base is edited here (TICK_INT_PRIORITY).
        "system": [
            ["NonMaskableInt_IRQn", "Non maskable interrupt"], ["HardFault_IRQn", "Hard fault interrupt"],
            ["MemoryManagement_IRQn", "Memory management fault"], ["BusFault_IRQn", "Pre-fetch fault, memory access fault"],
            ["UsageFault_IRQn", "Undefined instruction or illegal state"], ["SVCall_IRQn", "System service call via SWI instruction"],
            ["DebugMonitor_IRQn", "Debug monitor"], ["PendSV_IRQn", "Pendable request for system service"],
            ["SysTick_IRQn", "Time base: System tick timer"],
        ],
    })
}
/// NVIC_PRIORITYGROUP_n: n preemption bits and 4-n sub priority bits (STM32: 4 priority bits).
pub fn priority_limits(group: f64) -> (i64, i64) {
    // JavaScript's `1 << n`: the shift count is the low five bits of the 32-bit value.
    let shift = |n: f64| {
        let count = if n.is_finite() {
            (n.trunc() as i64 as i32 as u32) & 31
        } else {
            0
        };
        (1i32.wrapping_shl(count) as i64) - 1
    };
    (shift(group), shift(4.0 - group))
}
/// Splits `PREFIX<digit>REST` when `text` starts with the prefix and one digit.
fn after_digit<'a>(text: &'a str, prefix: &str) -> Option<(char, &'a str)> {
    let rest = text.strip_prefix(prefix)?;
    let digit = rest.chars().next().filter(char::is_ascii_digit)?;
    Some((digit, &rest[1..]))
}
/// `DMA<d>_(Stream|Channel)<d>_IRQn` → (unit digit, "Stream" | "Channel", index digit).
fn dma_irq(irq: &str) -> Option<(char, &'static str, char)> {
    let (unit, rest) = after_digit(irq, "DMA")?;
    let rest = rest.strip_prefix('_')?;
    for kind in ["Stream", "Channel"] {
        if let Some((index, tail)) = after_digit(rest, kind) {
            if tail == "_IRQn" {
                return Some((unit, kind, index));
            }
        }
    }
    None
}
pub fn irq_label(irq: &str) -> String {
    if let Some((line, "_IRQn")) = after_digit(irq, "EXTI") {
        return format!("EXTI line{line} interrupt");
    }
    match irq {
        "EXTI9_5_IRQn" => return "EXTI line[9:5] interrupts".into(),
        "EXTI15_10_IRQn" => return "EXTI line[15:10] interrupts".into(),
        _ => {}
    }
    if let Some((unit, rest)) = after_digit(irq, "I2C") {
        if rest == "_EV_IRQn" {
            return format!("I2C{unit} event interrupt");
        }
        if rest == "_ER_IRQn" {
            return format!("I2C{unit} error interrupt");
        }
    }
    match irq {
        "RTC_Alarm_IRQn" => return "RTC alarms A and B interrupt through EXTI line 17".into(),
        "RTC_WKUP_IRQn" => return "RTC wake-up interrupt through the EXTI line 22".into(),
        "RTC_IRQn" => return "RTC global interrupt".into(),
        "TIM6_DAC_IRQn" => {
            return "TIM6 global interrupt, DAC1 and DAC2 underrun error interrupts".into()
        }
        "ADC_IRQn" => return "ADC1, ADC2 and ADC3 global interrupts".into(),
        "ADC1_2_IRQn" => return "ADC1 and ADC2 global interrupts".into(),
        _ => {}
    }
    if let Some((unit, kind, index)) = dma_irq(irq) {
        return format!("DMA{unit} {}{index} global interrupt", kind.to_lowercase());
    }
    format!(
        "{} global interrupt",
        irq.strip_suffix("_IRQn").unwrap_or(irq)
    )
}
/// The interrupts a Pinout peripheral owns (its NVIC Settings tab).
pub fn peripheral_irqs(family: &str, id: &str) -> Result<Vec<String>, String> {
    Ok(irq_names(family)?
        .into_iter()
        .filter(|irq| {
            *irq == format!("{id}_IRQn")
                || (id == "DAC" && irq == "TIM6_DAC_IRQn")
                || (irq.starts_with(&format!("{id}_")) && !irq.starts_with("DMA"))
                || (id == "ADC1" && (irq == "ADC_IRQn" || irq == "ADC1_2_IRQn"))
        })
        .collect())
}
fn exti_lines(irq: &str) -> Option<Vec<f64>> {
    match irq {
        "EXTI9_5_IRQn" => Some(vec![5.0, 6.0, 7.0, 8.0, 9.0]),
        "EXTI15_10_IRQn" => Some(vec![10.0, 11.0, 12.0, 13.0, 14.0, 15.0]),
        _ => match after_digit(irq, "EXTI") {
            Some((line, "_IRQn")) => Some(vec![line.to_digit(10).unwrap() as f64]),
            _ => None,
        },
    }
}
fn dma_uses(config: &Value, irq: &str) -> bool {
    config
        .get("dma")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .any(|(_, d)| format!("{}_IRQn", js_display(d.get("stream"))) == irq)
}
/// `Number(text)` for the digits after a pin's port (`PA13` → 13).
fn js_number_of(text: &str) -> f64 {
    let text = text.trim();
    if text.is_empty() {
        0.0
    } else {
        text.parse().unwrap_or(f64::NAN)
    }
}
/// CubeMX "available interrupts": enabled ones, and those of configured EXTI pins, enabled peripherals and used DMA
/// streams.
pub fn irq_available(config: &Value, irq: &str) -> Result<bool, String> {
    if object(config.get("nvic"), irq)
        .and_then(|line| line.get("enabled"))
        .is_some_and(js_truthy)
    {
        return Ok(true);
    }
    if let Some(lines) = exti_lines(irq) {
        return Ok(pins_of(config).any(|(pin, p)| {
            function_of(p) == "GPIO_EXTI"
                && lines.contains(&js_number_of(pin.get(2..).unwrap_or("")))
        }));
    }
    if dma_irq(irq).is_some() {
        return Ok(dma_uses(config, irq));
    }
    let family = text(config, "family");
    for (id, p) in config
        .get("peripherals")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if p.get("enabled").is_some_and(js_truthy)
            && peripheral_irqs(&family, id)?.iter().any(|own| own == irq)
        {
            return Ok(true);
        }
    }
    Ok(false)
}
/// DMA stream interrupts are always enabled for the streams in use (CubeMX "Force DMA channels Interrupts").
pub fn dma_forced(config: &Value, irq: &str) -> bool {
    dma_irq(irq).is_some() && dma_uses(config, irq)
}
fn setting(config: &Value, key: &str, default: i64) -> f64 {
    present(config.get(key))
        .map(|v| v.as_f64().unwrap_or(f64::NAN))
        .unwrap_or(default as f64)
}
pub fn nvic_problems(config: &Value) -> Vec<String> {
    let group = setting(config, "nvicGroup", NVIC_GROUP_DEFAULT);
    let (preempt, sub) = priority_limits(group);
    let group_text = js_display(Some(or(
        config.get("nvicGroup"),
        &json!(NVIC_GROUP_DEFAULT),
    )));
    let mut errors = Vec::new();
    let over = |value: Option<&Value>, limit: i64| {
        present(value)
            .and_then(Value::as_f64)
            .is_some_and(|v| v > limit as f64)
    };
    for (irq, line) in config
        .get("nvic")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if !(line.get("enabled").is_some_and(js_truthy) || dma_forced(config, irq)) {
            continue;
        }
        if over(line.get("priority"), preempt) {
            errors.push(format!(
                "{irq}: NVIC_PRIORITYGROUP_{group_text}에서 선점 우선순위(Preemption)는 0~{preempt}입니다."
            ));
        }
        if over(line.get("sub"), sub) {
            errors.push(format!(
                "{irq}: NVIC_PRIORITYGROUP_{group_text}에서 서브 우선순위(Sub)는 0~{sub}입니다."
            ));
        }
    }
    if setting(config, "tickPriority", TICK_PRIORITY_DEFAULT) > preempt as f64 {
        errors.push(format!(
            "SysTick_IRQn(Time base): NVIC_PRIORITYGROUP_{group_text}에서 선점 우선순위는 0~{preempt}입니다."
        ));
    }
    errors
}

// ---------- ADC1 regular group (adc-config.js) ----------

/// F446RE triggers: TIM2 / TIM3 / TIM8 TRGO (rising edge); F103RB: TIM3 TRGO.
pub fn adc_triggers(family: &str) -> Option<&'static [&'static str]> {
    match family {
        F4 => Some(&["SOFTWARE", "T2_TRGO", "T3_TRGO", "T8_TRGO"]),
        F1 => Some(&["SOFTWARE", "T3_TRGO"]),
        _ => None,
    }
}
pub fn adc_tables() -> Value {
    json!({
        "triggers": {F4: adc_triggers(F4), F1: adc_triggers(F1)},
        "labels": {"SOFTWARE": "Regular Conversion launched by software", "T2_TRGO": "Timer 2 Trigger Out event", "T3_TRGO": "Timer 3 Trigger Out event", "T8_TRGO": "Timer 8 Trigger Out event"},
    })
}
/// `T<digit>_TRGO` → the digit.
fn trgo_digit(trigger: &str) -> Option<char> {
    match after_digit(trigger, "T") {
        Some((digit, "_TRGO")) => Some(digit),
        _ => None,
    }
}
/// The timer of a trigger ('T3_TRGO' → 'TIM3'), or `None` for software.
pub fn adc_trigger_timer(trigger: &str) -> Option<String> {
    trgo_digit(trigger).map(|digit| format!("TIM{digit}"))
}
/// `ADC1_IN<digits>` → the channel.
fn adc_channel(function: &str) -> Option<f64> {
    let digits = function.strip_prefix("ADC1_IN")?;
    (!digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()))
        .then(|| digits.parse().unwrap_or(f64::NAN))
}
/// ADC1 channels that have a pin (ADC1_INn), ascending.
pub fn adc_pin_channels(config: &Value) -> Vec<f64> {
    let mut out: Vec<f64> = pins_of(config)
        .filter_map(|(_, p)| adc_channel(function_of(p)))
        .collect();
    out.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    out
}
fn adc1(config: &Value) -> Option<&Value> {
    present(object(config.get("peripherals"), "ADC1"))
}
/// Channel of each rank: the configured one, else the pins' channels in ascending order (the last one repeats).
pub fn adc_ranks(config: &Value) -> Vec<Value> {
    let p = adc1(config);
    let pins = adc_pin_channels(config);
    let n = match present(p.and_then(|p| p.get("conversions"))) {
        None => 1.0,
        Some(v) => v.as_f64().unwrap_or(0.0),
    };
    let n = if n.is_finite() && n > 0.0 {
        n.trunc() as usize
    } else {
        0
    };
    let ranks = p.and_then(|p| p.get("ranks")).and_then(Value::as_array);
    (0..n.min(1 << 16))
        .map(|i| {
            if let Some(rank) = present(ranks.and_then(|list| list.get(i))) {
                return rank.clone();
            }
            match pins.len() {
                0 => json!(0),
                len => number(pins[i.min(len - 1)]),
            }
        })
        .collect()
}
/// What a checked ADC group adds to the settings: `{conversions?, ranks?, trigger?}`. `already`: the Number Of
/// Conversion the settings have so far.
pub fn validate_adc_group(
    p: &Value,
    already: Option<&Value>,
    family: &str,
) -> Result<Value, String> {
    let mut out = Map::new();
    adc_group_into(p, already, family, &mut out).map(|()| Value::Object(out))
}
/// The same, field by field into `out`: what was checked before a bad field stays in `out` (the caller's settings
/// keep it, as they did when this was JavaScript).
pub fn adc_group_into(
    p: &Value,
    already: Option<&Value>,
    family: &str,
    out: &mut Map<String, Value>,
) -> Result<(), String> {
    let max_channel = if family == F1 { 17.0 } else { 18.0 };
    let mut conversions = present(already).cloned();
    if let Some(value) = p.get("conversions") {
        let n = integer(Some(value))
            .filter(|n| (1.0..=16.0).contains(n))
            .ok_or("ADC1 Number Of Conversion: 1~16 범위의 정수를 입력하세요.")?;
        if n > 1.0 {
            out.insert("conversions".into(), number(n));
            conversions = Some(number(n));
        }
    }
    if let Some(value) = p.get("ranks") {
        let good = value.as_array().filter(|list| {
            list.len() <= 16
                && list.iter().all(|c| {
                    c.is_null()
                        || integer(Some(c)).is_some_and(|c| (0.0..=max_channel).contains(&c))
                })
        });
        let Some(list) = good else {
            return Err(format!(
                "ADC1 Rank: 채널 0~{}을 Rank마다 하나씩 고르세요.",
                js_number(max_channel)
            ));
        };
        let keep = conversions.as_ref().and_then(Value::as_f64).unwrap_or(1.0);
        let keep = if keep.is_finite() && keep > 0.0 {
            keep.trunc() as usize
        } else {
            0
        };
        let mut ranks: Vec<Value> = list.iter().take(keep).cloned().collect();
        while ranks.last().is_some_and(Value::is_null) {
            ranks.pop();
        }
        if ranks.iter().any(|c| !c.is_null()) {
            out.insert("ranks".into(), Value::Array(ranks));
        }
    }
    if let Some(value) = p.get("trigger") {
        let list =
            adc_triggers(family).ok_or_else(|| format!("지원하지 않는 MCU입니다: {family}"))?;
        let trigger = value.as_str().filter(|t| list.contains(t)).ok_or_else(|| {
            format!(
                "ADC1 External Trigger: {} 중에서 고르세요.",
                list.join(" / ")
            )
        })?;
        if trigger != "SOFTWARE" {
            out.insert("trigger".into(), json!(trigger));
        }
    }
    Ok(())
}
pub fn adc_group_problems(config: &Value) -> Vec<String> {
    let mut errors = Vec::new();
    let Some(p) = adc1(config).filter(|p| p.get("enabled").is_some_and(js_truthy)) else {
        return errors;
    };
    let pins = adc_pin_channels(config);
    for (i, rank) in adc_ranks(config).iter().enumerate() {
        let Some(ch) = rank.as_f64() else { continue };
        if ch < 16.0 && !pins.contains(&ch) {
            let ch = js_number(ch);
            errors.push(format!(
                "ADC1 Rank {}: IN{ch} 핀을 ADC1_IN{ch}로 활성화하세요.",
                i + 1
            ));
        }
    }
    let trigger = p.get("trigger").and_then(Value::as_str).unwrap_or("");
    if let Some(timer) = adc_trigger_timer(trigger) {
        let t = object(config.get("peripherals"), &timer);
        let ready = t.is_some_and(|t| {
            t.get("enabled").is_some_and(js_truthy) && t.get("trgo") == Some(&json!("UPDATE"))
        });
        if !ready {
            errors.push(format!("ADC1 External Trigger {trigger}: {timer}를 켜고 Trigger Event Selection(TRGO)을 Update Event로 두어야 변환이 시작됩니다."));
        }
    }
    errors
}
/// .ioc: ADC1.NbrOfConversion, ADC1.Channel-N\#ChannelRegularConversion=ADC_CHANNEL_n, ADC1.ExternalTrigConv.
/// → `{ops: [["set", key, value] | ["delete", key]], internal: [name]}`: what to do to the ADC1 settings, in order.
/// A rank on an internal channel (temperature sensor, VREFINT, VBAT) has no pin and no model here: it is left out, the
/// ranks after it move up, and the names are returned for the import's note.
pub fn adc_group_from_ioc(
    values: &Value,
    family: &str,
    already: Option<&Value>,
) -> Result<Value, String> {
    let mut ops: Vec<Value> = Vec::new();
    let mut conversions: Option<f64> = present(already).and_then(Value::as_f64);
    let n = clock_number(
        ioc_text(values, "ADC1.NbrOfConversion"),
        values.get("ADC1.NbrOfConversion"),
    );
    if n.fract() == 0.0 && n > 1.0 && n <= 16.0 {
        ops.push(json!(["set", "conversions", number(n)]));
        conversions = Some(n);
    }
    #[derive(Clone, PartialEq)]
    enum Rank {
        Hole,
        Channel(f64),
        Internal,
    }
    let mut ranks: Vec<Rank> = Vec::new();
    let mut internal: Vec<String> = Vec::new();
    for (key, value) in values.as_object().into_iter().flatten() {
        let Some(index) = key
            .strip_prefix("ADC1.Channel-")
            .and_then(|rest| {
                rest.strip_suffix("\\#ChannelRegularConversion")
                    .or_else(|| rest.strip_suffix("#ChannelRegularConversion"))
            })
            .filter(|digits| !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()))
            .and_then(|digits| digits.parse::<f64>().ok())
        else {
            continue;
        };
        if index >= conversions.unwrap_or(1.0) {
            continue;
        }
        let index = index as usize;
        let text = value.as_str().unwrap_or("");
        let entry = if let Some(ch) = text
            .strip_prefix("ADC_CHANNEL_")
            .filter(|digits| !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()))
        {
            Rank::Channel(ch.parse().unwrap_or(f64::NAN))
        } else if ["TEMPSENSOR", "VREFINT", "VBAT"]
            .iter()
            .any(|name| text.starts_with(&format!("ADC_CHANNEL_{name}")))
        {
            internal.push(text.replacen("ADC_CHANNEL_", "", 1));
            Rank::Internal
        } else {
            continue;
        };
        if ranks.len() <= index {
            ranks.resize(index + 1, Rank::Hole);
        }
        ranks[index] = entry;
    }
    if !internal.is_empty() {
        ranks.retain(|rank| *rank != Rank::Internal);
        let left = conversions.unwrap_or(1.0) - internal.len() as f64;
        if left > 1.0 {
            ops.push(json!(["set", "conversions", number(left)]));
        } else {
            ops.push(json!(["delete", "conversions"]));
        }
    }
    if ranks.is_empty() {
        ops.push(json!(["delete", "ranks"]));
    } else {
        let list: Vec<Value> = ranks
            .iter()
            .map(|rank| match rank {
                Rank::Channel(ch) => number(*ch),
                _ => Value::Null,
            })
            .collect();
        ops.push(json!(["set", "ranks", list]));
    }
    if let Some(trigger) = ioc_text(values, "ADC1.ExternalTrigConv")
        .strip_prefix("ADC_EXTERNALTRIGCONV_")
        .filter(|t| trgo_digit(t).is_some())
    {
        let list =
            adc_triggers(family).ok_or_else(|| format!("지원하지 않는 MCU입니다: {family}"))?;
        if list.contains(&trigger) {
            ops.push(json!(["set", "trigger", trigger]));
        }
    }
    Ok(json!({"ops": ops, "internal": internal}))
}
/// JavaScript's `Number(value)` of a .ioc value: NaN when the key is missing or the text is not a number.
fn clock_number(text: &str, value: Option<&Value>) -> f64 {
    if value.is_none() {
        return f64::NAN;
    }
    js_number_of(text)
}

// ---------- DAC (dac-config.js) ----------

pub const DAC_CHANNELS: [&str; 2] = ["OUT1", "OUT2"];
/// DAC_Trigger values in CubeMX's list order.
const DAC_TRIGGERS: [(&str, &str); 9] = [
    ("NONE", "None"),
    ("T6_TRGO", "Timer 6 Trigger Out event"),
    ("T8_TRGO", "Timer 8 Trigger Out event"),
    ("T7_TRGO", "Timer 7 Trigger Out event"),
    ("T5_TRGO", "Timer 5 Trigger Out event"),
    ("T2_TRGO", "Timer 2 Trigger Out event"),
    ("T4_TRGO", "Timer 4 Trigger Out event"),
    ("EXT_IT9", "External line 9"),
    ("SOFTWARE", "Software trigger"),
];
const DAC_WAVES: [(&str, &str); 3] = [
    ("NONE", "Disabled"),
    ("NOISE", "Noise wave generation"),
    ("TRIANGLE", "Triangle wave generation"),
];
fn pairs(list: &[(&str, &str)]) -> Value {
    Value::Object(
        list.iter()
            .map(|(k, v)| (k.to_string(), json!(v)))
            .collect(),
    )
}
pub fn dac_tables() -> Value {
    json!({"channels": DAC_CHANNELS, "triggers": pairs(&DAC_TRIGGERS), "waves": pairs(&DAC_WAVES)})
}
fn is_dac_trigger(name: &str) -> bool {
    DAC_TRIGGERS.iter().any(|(key, _)| *key == name)
}
/// MAMP 0..11: triangle amplitude 2^(n+1)-1 (DAC_TRIANGLEAMPLITUDE_1 .. _4095), noise LFSR bits 0..n unmasked.
pub fn dac_amplitude_name(wave: &str, n: Option<&Value>) -> String {
    let value = match n {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(v) => v.as_f64().unwrap_or(f64::NAN),
    };
    if wave == "TRIANGLE" {
        format!(
            "DAC_TRIANGLEAMPLITUDE_{}",
            js_number(2f64.powf(value + 1.0) - 1.0)
        )
    } else if n.and_then(Value::as_f64) == Some(0.0) {
        "DAC_LFSRUNMASK_BIT0".into()
    } else {
        format!("DAC_LFSRUNMASK_BITS{}_0", js_display(n))
    }
}
pub fn dac_channel_of(function: &str) -> Option<&'static str> {
    DAC_CHANNELS
        .iter()
        .copied()
        .find(|ch| function.strip_prefix("DAC_") == Some(*ch))
}
fn dac_pin_channels(config: &Value) -> Vec<&'static str> {
    DAC_CHANNELS
        .iter()
        .copied()
        .filter(|ch| pins_of(config).any(|(_, p)| function_of(p) == format!("DAC_{ch}")))
        .collect()
}
/// Checked DAC channels: only what differs from CubeMX's defaults (trigger None, buffer on, no wave) is kept.
/// → the `channels` object, or `None` when nothing is kept.
pub fn validate_dac(p: &Value) -> Result<Option<Value>, String> {
    let Some(channels) = p.get("channels") else {
        return Ok(None);
    };
    let Some(entries) = channels.as_object() else {
        return Err("DAC: 채널 설정을 확인하세요.".into());
    };
    let mut out_channels = Map::new();
    for (ch, c) in entries {
        if !DAC_CHANNELS.contains(&ch.as_str()) || !(c.is_object() || c.is_array()) {
            return Err(format!("DAC {ch}: OUT1 또는 OUT2 채널입니다."));
        }
        let mut out = Map::new();
        if let Some(trigger) = c.get("trigger") {
            let name = trigger
                .as_str()
                .filter(|name| is_dac_trigger(name))
                .ok_or_else(|| {
                    format!(
                        "DAC {ch} Trigger: {} 중에서 고르세요.",
                        DAC_TRIGGERS
                            .iter()
                            .map(|(k, _)| *k)
                            .collect::<Vec<_>>()
                            .join(" / ")
                    )
                })?;
            if name != "NONE" {
                out.insert("trigger".into(), json!(name));
            }
        }
        if let Some(buffer) = c.get("buffer") {
            let on = buffer
                .as_bool()
                .ok_or_else(|| format!("DAC {ch} Output Buffer: true 또는 false입니다."))?;
            if !on {
                out.insert("buffer".into(), json!(false));
            }
        }
        if let Some(wave) = c.get("wave").filter(|wave| *wave != &json!("NONE")) {
            let name = wave
                .as_str()
                .filter(|name| DAC_WAVES.iter().any(|(key, _)| key == name))
                .ok_or_else(|| {
                    format!("DAC {ch} Wave generation: NONE / NOISE / TRIANGLE 중에서 고르세요.")
                })?;
            if !out.contains_key("trigger") {
                return Err(format!(
                    "DAC {ch}: 파형 생성(Noise/Triangle)은 트리거가 있을 때만 씁니다. Trigger를 고르세요."
                ));
            }
            let n = integer(Some(or(c.get("amplitude"), &json!(0))))
                .filter(|n| (0.0..=11.0).contains(n))
                .ok_or_else(|| format!("DAC {ch} 진폭(MAMP): 0~11입니다."))?;
            out.insert("wave".into(), json!(name));
            out.insert("amplitude".into(), number(n));
        }
        if !out.is_empty() {
            out_channels.insert(ch.clone(), Value::Object(out));
        }
    }
    Ok((!out_channels.is_empty()).then_some(Value::Object(out_channels)))
}
pub fn dac_problems(config: &Value) -> Vec<String> {
    let Some(d) = present(object(config.get("peripherals"), "DAC"))
        .filter(|d| d.get("enabled").is_some_and(js_truthy))
    else {
        return Vec::new();
    };
    let on = dac_pin_channels(config);
    if on.is_empty() {
        return vec!["DAC: 출력 핀(PA4 DAC_OUT1 또는 PA5 DAC_OUT2)을 활성화하세요.".into()];
    }
    d.get("channels")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter(|(ch, _)| !on.contains(&ch.as_str()))
        .map(|(ch, _)| {
            format!(
                "DAC {ch}: 설정이 있지만 {} 핀이 DAC_{ch}가 아닙니다.",
                if ch == "OUT1" { "PA4" } else { "PA5" }
            )
        })
        .collect()
}
/// MX_DAC_Init body after `hdac.Instance = DAC;` (CubeMX order: HAL_DAC_Init, then each channel and its wave).
pub fn dac_init_lines(config: &Value) -> Vec<String> {
    let d = object(config.get("peripherals"), "DAC");
    let mut lines = vec![
        "  DAC_ChannelConfTypeDef sConfig = {0};".to_string(),
        "  if (HAL_DAC_Init(&hdac) != HAL_OK) Error_Handler();".to_string(),
    ];
    let empty = json!({});
    for ch in dac_pin_channels(config) {
        let c = or(object(object(d, "channels"), ch), &empty);
        let n = &ch[3..];
        lines.push(format!(
            "  sConfig.DAC_Trigger = DAC_TRIGGER_{};",
            js_display(Some(or(c.get("trigger"), &json!("NONE"))))
        ));
        lines.push(format!(
            "  sConfig.DAC_OutputBuffer = DAC_OUTPUTBUFFER_{};",
            if c.get("buffer") == Some(&json!(false)) {
                "DISABLE"
            } else {
                "ENABLE"
            }
        ));
        lines.push(format!(
            "  if (HAL_DAC_ConfigChannel(&hdac, &sConfig, DAC_CHANNEL_{n}) != HAL_OK) Error_Handler();"
        ));
        if c.get("wave").is_some_and(js_truthy) {
            let wave = js_display(c.get("wave"));
            lines.push(format!(
                "  if (HAL_DACEx_{}WaveGenerate(&hdac, DAC_CHANNEL_{n}, {}) != HAL_OK) Error_Handler();",
                if wave == "TRIANGLE" { "Triangle" } else { "Noise" },
                dac_amplitude_name(&wave, c.get("amplitude"))
            ));
        }
    }
    lines
}
/// The run of word characters (`\w+`) at the start of `text`.
fn word(text: &str) -> &str {
    let end = text
        .char_indices()
        .find(|(_, c)| !(c.is_ascii_alphanumeric() || *c == '_'))
        .map_or(text.len(), |(i, _)| i);
    &text[..end]
}
fn digits(text: &str) -> &str {
    let end = text
        .char_indices()
        .find(|(_, c)| !c.is_ascii_digit())
        .map_or(text.len(), |(i, _)| i);
    &text[..end]
}
/// DAC settings from CubeMX .ioc keys: DAC.DAC_Trigger (OUT1), DAC.DAC_Trigger2 (OUT2), output buffer and wave keys.
/// → the `channels` object, or `None`.
pub fn dac_from_ioc(values: &Value) -> Option<Value> {
    let mut channels = Map::new();
    for (ch, suffix) in [("OUT1", ""), ("OUT2", "2")] {
        // The channel's own keys: `DAC.<word>` ending with 2 for OUT2, not ending with 2 for OUT1.
        let own: Vec<&str> = values
            .as_object()
            .into_iter()
            .flatten()
            .filter(|(key, _)| {
                key.strip_prefix("DAC.").is_some_and(|rest| {
                    word(rest).len() == rest.len() && rest.ends_with('2') == (suffix == "2")
                })
            })
            .map(|(_, value)| value.as_str().unwrap_or(""))
            .collect();
        let own = own.join(" ");
        let mut c = Map::new();
        let trigger = ioc_text(values, &format!("DAC.DAC_Trigger{suffix}"))
            .find("DAC_TRIGGER_")
            .map(|at| {
                word(
                    &ioc_text(values, &format!("DAC.DAC_Trigger{suffix}"))
                        [at + "DAC_TRIGGER_".len()..],
                )
            })
            .filter(|name| !name.is_empty() && is_dac_trigger(name) && *name != "NONE");
        if let Some(name) = trigger {
            c.insert("trigger".into(), json!(name));
        }
        if own.contains("DAC_OUTPUTBUFFER_DISABLE") {
            c.insert("buffer".into(), json!(false));
        }
        let triangle = own
            .match_indices("DAC_TRIANGLEAMPLITUDE_")
            .map(|(at, key)| digits(&own[at + key.len()..]))
            .find(|found| !found.is_empty());
        // DAC_LFSRUNMASK_BITS<n>_0 or DAC_LFSRUNMASK_BIT0: the first place either is.
        let noise: Option<Option<&str>> =
            own.match_indices("DAC_LFSRUNMASK_BIT")
                .find_map(|(at, key)| {
                    let rest = &own[at + key.len()..];
                    if let Some(bits) = rest.strip_prefix('S') {
                        let found = digits(bits);
                        if !found.is_empty() && bits[found.len()..].starts_with("_0") {
                            return Some(Some(found));
                        }
                    }
                    rest.starts_with('0').then_some(None)
                });
        if trigger.is_some() {
            if let Some(found) = triangle {
                let amplitude = (found.parse::<f64>().unwrap_or(f64::NAN) + 1.0).log2();
                let amplitude = ((amplitude + 0.5).floor() - 1.0).max(0.0);
                c.insert("wave".into(), json!("TRIANGLE"));
                c.insert("amplitude".into(), number(amplitude));
            } else if noise.is_some() || own.contains("NOISE") {
                let amplitude = noise
                    .flatten()
                    .map_or(0.0, |found| found.parse::<f64>().unwrap_or(f64::NAN));
                c.insert("wave".into(), json!("NOISE"));
                c.insert("amplitude".into(), number(amplitude));
            }
        }
        if !c.is_empty() {
            channels.insert(ch.into(), Value::Object(c));
        }
    }
    (!channels.is_empty()).then_some(Value::Object(channels))
}

// ---------- watchdogs (wdg-config.js) ----------

pub const IWDG_PRESCALERS: [f64; 7] = [4.0, 8.0, 16.0, 32.0, 64.0, 128.0, 256.0];
pub const WWDG_PRESCALERS: [f64; 4] = [1.0, 2.0, 4.0, 8.0];
pub fn lsi_hz(family: &str) -> f64 {
    if family == F1 {
        40_000.0
    } else {
        32_000.0
    }
}
/// APB1 clock: from the Clock tab, otherwise from the single APB1 timer clock (APB1 is divided above 45 / 36 MHz).
/// `None`: the project has neither.
pub fn pclk1_hz(config: &Value) -> Option<f64> {
    let family = text(config, "family");
    if let Some(tree) = config.get("clock").filter(|tree| js_truthy(tree)) {
        let tree = tree.as_object().cloned().unwrap_or_default();
        return Some(clock::frequencies(&family, &tree).pclk1);
    }
    let hz = config.get("timerClockHz").and_then(Value::as_f64)?;
    let max = if family == F1 { 36e6 } else { 45e6 };
    Some(if hz > max { hz / 2.0 } else { hz })
}
fn ranged(value: &Value, min: f64, max: f64, label: &str) -> Result<Value, String> {
    integer(Some(value))
        .filter(|v| (min..=max).contains(v))
        .map(number)
        .ok_or_else(|| {
            format!(
                "{label}: {}~{} 범위의 정수를 입력하세요.",
                js_number(min),
                js_number(max)
            )
        })
}
fn one_of(value: &Value, list: &[f64], label: &str) -> Result<Value, String> {
    if value.as_f64().is_some_and(|v| list.contains(&v)) {
        Ok(value.clone())
    } else {
        Err(format!(
            "{label}: {} 중에서 고르세요.",
            list.iter()
                .map(|v| js_number(*v))
                .collect::<Vec<_>>()
                .join(" / ")
        ))
    }
}
/// → `{prescaler, reload}` (the caller keeps `enabled`).
pub fn validate_iwdg(p: &Value) -> Result<Value, String> {
    let prescaler = one_of(
        or(p.get("prescaler"), &json!(4)),
        &IWDG_PRESCALERS,
        "IWDG Prescaler",
    )?;
    let reload = or(p.get("reload"), &json!(4095)).clone();
    ranged(&reload, 0.0, 4095.0, "IWDG Down-counter reload value")?;
    Ok(json!({"prescaler": prescaler, "reload": reload}))
}
/// → `{prescaler, window, counter, ewi?}`.
pub fn validate_wwdg(p: &Value) -> Result<Value, String> {
    let prescaler = one_of(
        or(p.get("prescaler"), &json!(1)),
        &WWDG_PRESCALERS,
        "WWDG Prescaler",
    )?;
    let window = or(p.get("window"), &json!(64)).clone();
    let counter = or(p.get("counter"), &json!(64)).clone();
    ranged(&window, 64.0, 127.0, "WWDG Window value")?;
    ranged(&counter, 64.0, 127.0, "WWDG Free-running downcounter value")?;
    let mut out = json!({"prescaler": prescaler, "window": window, "counter": counter});
    if let Some(ewi) = p.get("ewi") {
        let on = ewi
            .as_bool()
            .ok_or("WWDG Early wakeup interrupt: true 또는 false입니다.")?;
        if on {
            out["ewi"] = json!(true);
        }
    }
    Ok(out)
}
/// JavaScript's `Number(value)`: 0 for null and an empty text, NaN for a missing value or a text that is not a number.
fn js_to_number(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => f64::from(u8::from(*b)),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => js_number_of(s),
        Some(_) => f64::NAN,
    }
}
fn num(value: &Value, key: &str) -> f64 {
    js_to_number(value.get(key))
}
/// IWDG timeout in ms: (Reload + 1) × Prescaler / LSI.
pub fn iwdg_timeout_ms(p: &Value, family: &str) -> f64 {
    // `reload + 1` of a text joins the two (the settings are numbers once they are checked).
    let reload_plus_one = match p.get("reload") {
        Some(Value::String(s)) => js_number_of(&format!("{s}1")),
        other => js_to_number(other) + 1.0,
    };
    reload_plus_one * num(p, "prescaler") / lsi_hz(family) * 1000.0
}
/// WWDG timing in ms: one count, the earliest allowed refresh after a refresh, and the reset.
pub fn wwdg_timing(p: &Value, config: &Value) -> Value {
    let tick = 4096.0 * num(p, "prescaler") / pclk1_hz(config).unwrap_or(f64::NAN) * 1000.0;
    let open = (num(p, "counter") - num(p, "window")).max(0.0) * tick;
    // Math.max(0, NaN) is NaN.
    let open = if (num(p, "counter") - num(p, "window")).is_nan() {
        f64::NAN
    } else {
        open
    };
    json!({"tickMs": tick, "openMs": open, "resetMs": (num(p, "counter") - 63.0) * tick})
}
pub fn iwdg_init_lines(p: &Value) -> Vec<String> {
    vec![
        "  hiwdg.Instance = IWDG;".into(),
        format!(
            "  hiwdg.Init.Prescaler = IWDG_PRESCALER_{};",
            js_display(p.get("prescaler"))
        ),
        format!("  hiwdg.Init.Reload = {};", js_display(p.get("reload"))),
        "  if (HAL_IWDG_Init(&hiwdg) != HAL_OK) Error_Handler();".into(),
    ]
}
pub fn wwdg_init_lines(p: &Value) -> Vec<String> {
    vec![
        format!(
            "  hwwdg.Init.Prescaler = WWDG_PRESCALER_{};",
            js_display(p.get("prescaler"))
        ),
        format!("  hwwdg.Init.Window = {};", js_display(p.get("window"))),
        format!("  hwwdg.Init.Counter = {};", js_display(p.get("counter"))),
        format!(
            "  hwwdg.Init.EWIMode = WWDG_EWI_{};",
            if p.get("ewi").is_some_and(js_truthy) {
                "ENABLE"
            } else {
                "DISABLE"
            }
        ),
        "  if (HAL_WWDG_Init(&hwwdg) != HAL_OK) Error_Handler();".into(),
    ]
}
/// The digits after `key` in a .ioc value (`IWDG_PRESCALER_32` → 32), or the default when the key is not there.
fn named_number(text: &str, key: &str, default: f64) -> f64 {
    text.match_indices(key)
        .map(|(at, _)| digits(&text[at + key.len()..]))
        .find(|found| !found.is_empty())
        .map_or(default, |found| found.parse().unwrap_or(f64::NAN))
}
/// CubeMX .ioc keys: IWDG.Prescaler=IWDG_PRESCALER_32, IWDG.Reload=…
pub fn iwdg_from_ioc(values: &Value) -> Value {
    let prescaler = named_number(ioc_text(values, "IWDG.Prescaler"), "IWDG_PRESCALER_", 4.0);
    json!({
        "enabled": true,
        "prescaler": number(if IWDG_PRESCALERS.contains(&prescaler) { prescaler } else { 4.0 }),
        "reload": ioc_number(values, "IWDG.Reload", 4095),
    })
}
/// WWDG.Prescaler, WWDG.Window, WWDG.Counter, WWDG.EWIMode.
pub fn wwdg_from_ioc(values: &Value) -> Value {
    let prescaler = named_number(ioc_text(values, "WWDG.Prescaler"), "WWDG_PRESCALER_", 1.0);
    let mut out = json!({
        "enabled": true,
        "prescaler": number(if WWDG_PRESCALERS.contains(&prescaler) { prescaler } else { 1.0 }),
        "window": ioc_number(values, "WWDG.Window", 64),
        "counter": ioc_number(values, "WWDG.Counter", 64),
    });
    if ioc_text(values, "WWDG.EWIMode").contains("ENABLE") {
        out["ewi"] = json!(true);
    }
    out
}

// ---------- RTC (rtc-config.js) ----------

pub const RTC_WEEKDAYS: [&str; 7] = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
];
pub const RTC_MONTHS: [&str; 12] = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
];
/// RTCEx wakeup clock (F4): RTCCLK/16, /8, /4, /2 or ck_spre (1 Hz) with a 16-bit counter.
const RTC_WAKEUP_CLOCKS: [(&str, f64); 5] = [
    ("RTCCLK_DIV16", 16.0),
    ("RTCCLK_DIV8", 8.0),
    ("RTCCLK_DIV4", 4.0),
    ("RTCCLK_DIV2", 2.0),
    ("CK_SPRE_16BITS", 0.0),
];
const DAYS_IN: [f64; 12] = [
    31.0, 29.0, 31.0, 30.0, 31.0, 30.0, 31.0, 31.0, 30.0, 31.0, 30.0, 31.0,
];
pub fn rtc_tables() -> Value {
    json!({
        "clocks": {"LSE": "LSE 32.768 kHz 크리스털 (NUCLEO X2)", "LSI": "LSI 내부 RC (F446 32 kHz · F103 40 kHz)"},
        "lsi": {F4: 32000, F1: 40000},
        "weekdays": RTC_WEEKDAYS,
        "months": RTC_MONTHS,
        "wakeupClocks": Value::Object(RTC_WAKEUP_CLOCKS.iter().map(|(k, v)| (k.to_string(), number(*v))).collect()),
    })
}
pub fn rtc_defaults() -> Value {
    json!({"enabled": false, "clockSource": "LSE", "time": {"hours": 0, "minutes": 0, "seconds": 0}, "date": {"weekDay": 1, "month": 1, "date": 1, "year": 0}})
}
/// Asynchronous / synchronous prescalers for a 1 Hz calendar (F4: (A+1)(S+1) = RTC clock).
pub fn rtc_prescalers(family: &str, source: &str) -> Value {
    if source == "LSI" && family != F1 {
        json!({"asynch": 127, "synch": 249})
    } else {
        json!({"asynch": 127, "synch": 255})
    }
}
pub fn rtc_clock_hz(family: &str, source: &str) -> f64 {
    if source != "LSI" {
        32_768.0
    } else if family == F1 {
        40_000.0
    } else {
        32_000.0
    }
}
/// A checked copy of the project's RTC settings without `enabled` (the caller keeps it), or the reason it is refused.
pub fn validate_rtc(p: &Value, family: &str) -> Result<Value, String> {
    let f1 = family == F1;
    let int = |value: &Value, min: f64, max: f64, label: &str| -> Result<Value, String> {
        integer(Some(value))
            .filter(|v| (min..=max).contains(v))
            .map(number)
            .ok_or_else(|| {
                format!(
                    "RTC {label}: {}~{} 범위의 정수를 입력하세요.",
                    js_number(min),
                    js_number(max)
                )
            })
    };
    let mut q = Map::new();
    let source = or(p.get("clockSource"), &json!("LSE")).clone();
    if !matches!(source.as_str(), Some("LSE") | Some("LSI")) {
        return Err("RTC 클록 원본은 LSE 또는 LSI입니다.".into());
    }
    q.insert("clockSource".into(), source);
    let twelve = p.get("hourFormat") == Some(&json!(12));
    if let Some(format) = p.get("hourFormat") {
        if !matches!(format.as_f64(), Some(v) if v == 12.0 || v == 24.0) {
            return Err("RTC Hour Format은 24 또는 12입니다.".into());
        }
    }
    if twelve {
        if f1 {
            return Err("RTC: STM32F103의 RTC는 초 카운터라 12시간 형식이 없습니다.".into());
        }
        q.insert("hourFormat".into(), json!(12));
    }
    let zero = json!(0);
    let clock_of = |t: Option<&Value>, label: &str| -> Result<Map<String, Value>, String> {
        let t = t.filter(|t| !t.is_null());
        let field = |key: &str| or(t.and_then(|t| t.get(key)), &zero).clone();
        let mut out = Map::new();
        out.insert(
            "hours".into(),
            int(
                &field("hours"),
                if twelve { 1.0 } else { 0.0 },
                if twelve { 12.0 } else { 23.0 },
                &format!("{label} Hours"),
            )?,
        );
        out.insert(
            "minutes".into(),
            int(&field("minutes"), 0.0, 59.0, &format!("{label} Minutes"))?,
        );
        out.insert(
            "seconds".into(),
            int(&field("seconds"), 0.0, 59.0, &format!("{label} Seconds"))?,
        );
        if twelve && t.and_then(|t| t.get("hours")).is_none() {
            out.insert("hours".into(), json!(12));
        }
        if twelve && t.and_then(|t| t.get("pm")).is_some_and(js_truthy) {
            out.insert("pm".into(), json!(true));
        }
        Ok(out)
    };
    q.insert(
        "time".into(),
        Value::Object(clock_of(p.get("time"), "Time")?),
    );
    let empty = json!({});
    let dt = or(p.get("date"), &empty);
    let part = |key: &str, default: i64| or(dt.get(key), &json!(default)).clone();
    let week_day = int(&part("weekDay", 1), 1.0, 7.0, "Week Day")?;
    let month = int(&part("month", 1), 1.0, 12.0, "Month")?;
    let date = int(&part("date", 1), 1.0, 31.0, "Date")?;
    let year = int(&part("year", 0), 0.0, 99.0, "Year")?;
    let (m, d, y) = (
        month.as_f64().unwrap(),
        date.as_f64().unwrap(),
        year.as_f64().unwrap(),
    );
    if d > DAYS_IN[m as usize - 1] || (m == 2.0 && d == 29.0 && y % 4.0 != 0.0) {
        return Err(format!(
            "RTC Date: 20{:02}년 {}월에는 {}일이 없습니다.",
            y as i64, m as i64, d as i64
        ));
    }
    q.insert(
        "date".into(),
        json!({"weekDay": week_day, "month": month, "date": date, "year": year}),
    );
    const MASKS: [&str; 4] = ["maskDateWeekDay", "maskHours", "maskMinutes", "maskSeconds"];
    if let Some(a) = p
        .get("alarm")
        .filter(|a| a.get("enabled").is_some_and(js_truthy))
    {
        let mut out = Map::new();
        out.insert("enabled".into(), json!(true));
        for (key, value) in clock_of(Some(a), "Alarm A")? {
            out.insert(key, value);
        }
        if !f1 {
            for key in MASKS {
                if let Some(mask) = a.get(key).filter(|mask| js_truthy(mask)) {
                    if mask != &json!(true) {
                        return Err(format!("RTC Alarm A {key}: true 또는 false입니다."));
                    }
                    out.insert(key.into(), json!(true));
                }
            }
            out.insert(
                "date".into(),
                int(or(a.get("date"), &json!(1)), 1.0, 31.0, "Alarm A Date")?,
            );
        } else if MASKS.iter().chain(["date"].iter()).any(|key| {
            a.get(key).is_some_and(|value| {
                value != &json!(false) && !(*key == "date" && value.as_f64() == Some(1.0))
            })
        }) {
            return Err(
                "RTC: STM32F103의 알람은 시·분·초가 같을 때 한 번 울립니다(마스크·날짜 없음)."
                    .into(),
            );
        }
        q.insert("alarm".into(), Value::Object(out));
    }
    if let Some(w) = p
        .get("wakeUp")
        .filter(|w| w.get("enabled").is_some_and(js_truthy))
    {
        if f1 {
            return Err("RTC: STM32F103에는 WakeUp 타이머가 없습니다(초 인터럽트 HAL_RTCEx_SetSecond_IT를 쓰세요).".into());
        }
        let clock_name = or(w.get("clock"), &json!("CK_SPRE_16BITS")).clone();
        if !clock_name
            .as_str()
            .is_some_and(|name| RTC_WAKEUP_CLOCKS.iter().any(|(key, _)| *key == name))
        {
            return Err(format!(
                "RTC WakeUp Clock: {} 중에서 고르세요.",
                RTC_WAKEUP_CLOCKS
                    .iter()
                    .map(|(k, _)| *k)
                    .collect::<Vec<_>>()
                    .join(" / ")
            ));
        }
        let counter = int(or(w.get("counter"), &zero), 0.0, 65535.0, "WakeUp Counter")?;
        q.insert(
            "wakeUp".into(),
            json!({"enabled": true, "clock": clock_name, "counter": counter}),
        );
    }
    Ok(Value::Object(q))
}
/// Wakeup period in seconds: (counter + 1) ticks of RTCCLK/n or of the 1 Hz ck_spre. `None` without a wakeup timer.
pub fn rtc_wakeup_seconds(rtc: &Value, family: &str) -> Option<f64> {
    let w = rtc.get("wakeUp").filter(|w| js_truthy(w))?;
    let div = RTC_WAKEUP_CLOCKS
        .iter()
        .find(|(key, _)| w.get("clock").and_then(Value::as_str) == Some(*key))
        .map(|(_, div)| *div);
    let source = rtc.get("clockSource").and_then(Value::as_str).unwrap_or("");
    let scale = match div {
        Some(div) if div != 0.0 => div / rtc_clock_hz(family, source),
        _ => 1.0,
    };
    Some((num(w, "counter") + 1.0) * scale)
}
/// A value as CubeMX's BCD literal (`0x23` for 23).
fn bcd(value: Option<&Value>) -> String {
    let n = value.and_then(Value::as_f64).unwrap_or(f64::NAN);
    let int32 = |v: f64| {
        if v.is_finite() {
            v.trunc() as i64 as i32
        } else {
            0
        }
    };
    let packed = (int32((n / 10.0).floor()) << 4) | int32(n % 10.0);
    if packed < 0 {
        format!("0x-{:X}", -(packed as i64))
    } else {
        format!("0x{packed:X}")
    }
}
/// MX_RTC_Init body lines (CubeMX order, with the clock part CubeMX puts in HAL_RTC_MspInit / SystemClock_Config).
pub fn rtc_init_lines(config: &Value) -> Vec<String> {
    let empty = json!({});
    let rtc = or(object(config.get("peripherals"), "RTC"), &empty);
    let family = text(config, "family");
    let f1 = family == F1;
    let twelve = rtc.get("hourFormat") == Some(&json!(12));
    let src = js_display(rtc.get("clockSource"));
    let nvic_on = |irq: &str| {
        object(config.get("nvic"), irq)
            .and_then(|line| line.get("enabled"))
            .is_some_and(js_truthy)
    };
    let time = or(rtc.get("time"), &empty);
    let date = or(rtc.get("date"), &empty);
    let alarm = rtc.get("alarm").filter(|a| js_truthy(a));
    let format_of = |t: &Value| {
        if t.get("pm").is_some_and(js_truthy) {
            "PM"
        } else {
            "AM"
        }
    };
    let mut lines: Vec<String> = vec![
        format!(
            "  /* RTC clock: {} */",
            if src == "LSE" {
                "LSE 32.768 kHz crystal (X2 on the NUCLEO)".to_string()
            } else {
                format!(
                    "LSI {} kHz RC",
                    js_number(rtc_clock_hz(&family, "LSI") / 1000.0)
                )
            }
        ),
        "  RCC_OscInitTypeDef osc = {0};".into(),
        format!("  osc.OscillatorType = RCC_OSCILLATORTYPE_{src};"),
        format!("  osc.{src}State = RCC_{src}_ON;"),
        "  osc.PLL.PLLState = RCC_PLL_NONE;".into(),
        "  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();".into(),
        "  RCC_PeriphCLKInitTypeDef periph = {0};".into(),
        "  periph.PeriphClockSelection = RCC_PERIPHCLK_RTC;".into(),
        format!("  periph.RTCClockSelection = RCC_RTCCLKSOURCE_{src};"),
        "  if (HAL_RCCEx_PeriphCLKConfig(&periph) != HAL_OK) Error_Handler();".into(),
    ];
    if f1 {
        lines.extend([
            "  __HAL_RCC_PWR_CLK_ENABLE();".to_string(),
            "  HAL_PWR_EnableBkUpAccess();".into(),
            "  __HAL_RCC_BKP_CLK_ENABLE();".into(),
        ]);
    }
    let date_name = if f1 { "DateToUpdate" } else { "sDate" };
    lines.push("  __HAL_RCC_RTC_ENABLE();".into());
    lines.push("  RTC_TimeTypeDef sTime = {0};".into());
    lines.push(format!("  RTC_DateTypeDef {date_name} = {{0}};"));
    if alarm.is_some() {
        lines.push("  RTC_AlarmTypeDef sAlarm = {0};".into());
    }
    lines.push("  hrtc.Instance = RTC;".into());
    if f1 {
        lines.push("  hrtc.Init.AsynchPrediv = RTC_AUTO_1_SECOND;".into());
        lines.push("  hrtc.Init.OutPut = RTC_OUTPUTSOURCE_NONE;".into());
    } else {
        let prescalers = rtc_prescalers(&family, &src);
        lines.push(format!(
            "  hrtc.Init.HourFormat = RTC_HOURFORMAT_{};",
            if twelve { 12 } else { 24 }
        ));
        lines.push(format!(
            "  hrtc.Init.AsynchPrediv = {};",
            prescalers["asynch"]
        ));
        lines.push(format!(
            "  hrtc.Init.SynchPrediv = {};",
            prescalers["synch"]
        ));
        lines.push("  hrtc.Init.OutPut = RTC_OUTPUT_DISABLE;".into());
        lines.push("  hrtc.Init.OutPutPolarity = RTC_OUTPUT_POLARITY_HIGH;".into());
        lines.push("  hrtc.Init.OutPutType = RTC_OUTPUT_TYPE_OPENDRAIN;".into());
    }
    lines.push("  if (HAL_RTC_Init(&hrtc) != HAL_OK) Error_Handler();".into());
    lines.push(format!("  sTime.Hours = {};", bcd(time.get("hours"))));
    lines.push(format!("  sTime.Minutes = {};", bcd(time.get("minutes"))));
    lines.push(format!("  sTime.Seconds = {};", bcd(time.get("seconds"))));
    if !f1 {
        if twelve {
            lines.push(format!(
                "  sTime.TimeFormat = RTC_HOURFORMAT12_{};",
                format_of(time)
            ));
        }
        lines.push("  sTime.DayLightSaving = RTC_DAYLIGHTSAVING_NONE;".into());
        lines.push("  sTime.StoreOperation = RTC_STOREOPERATION_RESET;".into());
    }
    lines.push(
        "  if (HAL_RTC_SetTime(&hrtc, &sTime, RTC_FORMAT_BCD) != HAL_OK) Error_Handler();".into(),
    );
    let named = |list: &[&str], value: Option<&Value>| -> String {
        value
            .and_then(Value::as_f64)
            .filter(|v| v.fract() == 0.0 && *v >= 1.0 && *v <= list.len() as f64)
            .map_or("undefined".into(), |v| list[v as usize - 1].to_string())
    };
    lines.push(format!(
        "  {date_name}.WeekDay = RTC_WEEKDAY_{};",
        named(&RTC_WEEKDAYS, date.get("weekDay"))
    ));
    lines.push(format!(
        "  {date_name}.Month = RTC_MONTH_{};",
        named(&RTC_MONTHS, date.get("month"))
    ));
    lines.push(format!("  {date_name}.Date = {};", bcd(date.get("date"))));
    lines.push(format!("  {date_name}.Year = {};", bcd(date.get("year"))));
    lines.push(format!(
        "  if (HAL_RTC_SetDate(&hrtc, &{date_name}, RTC_FORMAT_BCD) != HAL_OK) Error_Handler();"
    ));
    if let Some(a) = alarm {
        lines.push(format!(
            "  sAlarm.AlarmTime.Hours = {};",
            bcd(a.get("hours"))
        ));
        lines.push(format!(
            "  sAlarm.AlarmTime.Minutes = {};",
            bcd(a.get("minutes"))
        ));
        lines.push(format!(
            "  sAlarm.AlarmTime.Seconds = {};",
            bcd(a.get("seconds"))
        ));
        if !f1 {
            let masks: Vec<String> = [
                ("maskDateWeekDay", "DATEWEEKDAY"),
                ("maskHours", "HOURS"),
                ("maskMinutes", "MINUTES"),
                ("maskSeconds", "SECONDS"),
            ]
            .iter()
            .filter(|(key, _)| a.get(*key).is_some_and(js_truthy))
            .map(|(_, name)| format!("RTC_ALARMMASK_{name}"))
            .collect();
            if twelve {
                lines.push(format!(
                    "  sAlarm.AlarmTime.TimeFormat = RTC_HOURFORMAT12_{};",
                    format_of(a)
                ));
            }
            lines.push("  sAlarm.AlarmTime.SubSeconds = 0;".into());
            lines.push("  sAlarm.AlarmTime.DayLightSaving = RTC_DAYLIGHTSAVING_NONE;".into());
            lines.push("  sAlarm.AlarmTime.StoreOperation = RTC_STOREOPERATION_RESET;".into());
            lines.push(format!(
                "  sAlarm.AlarmMask = {};",
                if masks.is_empty() {
                    "RTC_ALARMMASK_NONE".to_string()
                } else {
                    masks.join(" | ")
                }
            ));
            lines.push("  sAlarm.AlarmSubSecondMask = RTC_ALARMSUBSECONDMASK_ALL;".into());
            lines.push("  sAlarm.AlarmDateWeekDaySel = RTC_ALARMDATEWEEKDAYSEL_DATE;".into());
            lines.push(format!(
                "  sAlarm.AlarmDateWeekDay = {};",
                bcd(a.get("date"))
            ));
        }
        lines.push("  sAlarm.Alarm = RTC_ALARM_A;".into());
        lines.push(format!(
            "  if (HAL_RTC_SetAlarm{}(&hrtc, &sAlarm, RTC_FORMAT_BCD) != HAL_OK) Error_Handler();",
            if nvic_on("RTC_Alarm_IRQn") { "_IT" } else { "" }
        ));
    }
    if let Some(w) = rtc.get("wakeUp").filter(|w| js_truthy(w)) {
        lines.push(format!(
            "  if (HAL_RTCEx_SetWakeUpTimer{}(&hrtc, {}, RTC_WAKEUPCLOCK_{}) != HAL_OK) Error_Handler();",
            if nvic_on("RTC_WKUP_IRQn") { "_IT" } else { "" },
            js_display(w.get("counter")),
            js_display(w.get("clock"))
        ));
    }
    lines
}
/// RTC settings from CubeMX .ioc keys (RTC.Hours, RTC.WeekDay, RTC.Hours_A, RTC.WakeUpCounter,
/// RCC.RTCClockSelection, VP_RTC_*). Numbers are left for the caller's reader (`NUMBER`).
pub fn rtc_from_ioc(values: &Value, family: &str) -> Value {
    let f1 = family == F1;
    let lse = ioc_text(values, "RCC.RTCClockSelection").contains("LSE")
        || values.get("RCC.RTCFreq_Value") == Some(&json!("32768"));
    let mut q = Map::new();
    q.insert("enabled".into(), json!(true));
    q.insert("clockSource".into(), json!(if lse { "LSE" } else { "LSI" }));
    let twelve = values.get("RTC.HourFormat") == Some(&json!("RTC_HOURFORMAT_12")) && !f1;
    if twelve {
        q.insert("hourFormat".into(), json!(12));
    }
    let time = |suffix: &str| -> Map<String, Value> {
        let mut t = Map::new();
        t.insert(
            "hours".into(),
            ioc_number(
                values,
                &format!("RTC.Hours{suffix}"),
                if twelve { 12 } else { 0 },
            ),
        );
        t.insert(
            "minutes".into(),
            ioc_number(values, &format!("RTC.Minutes{suffix}"), 0),
        );
        t.insert(
            "seconds".into(),
            ioc_number(values, &format!("RTC.Seconds{suffix}"), 0),
        );
        if twelve && ioc_text(values, &format!("RTC.TimeFormat{suffix}")).contains("PM") {
            t.insert("pm".into(), json!(true));
        }
        t
    };
    q.insert("time".into(), Value::Object(time("")));
    // `_NAME` at the end of the value, in capitals: its place in the list, from 1.
    let named = |key: &str, list: &[&str]| -> usize {
        let text = ioc_text(values, key);
        let capitals = text
            .chars()
            .rev()
            .take_while(char::is_ascii_uppercase)
            .count();
        let name = &text[text.len() - capitals..];
        if capitals == 0 || !text[..text.len() - capitals].ends_with('_') {
            return 1;
        }
        list.iter()
            .position(|item| *item == name)
            .map_or(1, |i| i + 1)
    };
    q.insert(
        "date".into(),
        json!({
            "weekDay": named("RTC.WeekDay", &RTC_WEEKDAYS),
            "month": named("RTC.Month", &RTC_MONTHS),
            "date": ioc_number(values, "RTC.Date", 1),
            "year": ioc_number(values, "RTC.Year", 0),
        }),
    );
    let set = |key: &str| values.get(key).is_some_and(js_truthy);
    if set("VP_RTC_VS_RTC_Alarm_A_Intern.Mode")
        || values.get("RTC.Alarm") == Some(&json!("RTC_ALARM_A"))
    {
        let mut alarm = Map::new();
        alarm.insert("enabled".into(), json!(true));
        for (key, value) in time("_A") {
            alarm.insert(key, value);
        }
        if !f1 {
            // RTC.AlarmMaskDateWeekDay=RTC_ALARMMASK_DATEWEEKDAY, …: every RTC.AlarmMask* value names its mask.
            let masks: Vec<&str> = values
                .as_object()
                .into_iter()
                .flatten()
                .filter(|(key, _)| key.starts_with("RTC.AlarmMask"))
                .map(|(_, value)| value.as_str().unwrap_or(""))
                .collect();
            let masks = masks.join(" ");
            for (key, name) in [
                ("maskDateWeekDay", "DATEWEEKDAY"),
                ("maskHours", "HOURS"),
                ("maskMinutes", "MINUTES"),
                ("maskSeconds", "SECONDS"),
            ] {
                if masks.contains(&format!("RTC_ALARMMASK_{name}"))
                    || masks.contains("RTC_ALARMMASK_ALL")
                {
                    alarm.insert(key.into(), json!(true));
                }
            }
            let key = if present(values.get("RTC.AlarmDateWeekDay")).is_some() {
                "RTC.AlarmDateWeekDay"
            } else {
                "RTC.Date_A"
            };
            alarm.insert("date".into(), ioc_number(values, key, 1));
        }
        q.insert("alarm".into(), Value::Object(alarm));
    }
    if set("VP_RTC_VS_RTC_WakeUp_intern.Mode") && !f1 {
        let text = ioc_text(values, "RTC.WakeUpClock");
        let name = text
            .find("RTC_WAKEUPCLOCK_")
            .map(|at| word(&text[at + "RTC_WAKEUPCLOCK_".len()..]))
            .filter(|name| RTC_WAKEUP_CLOCKS.iter().any(|(key, _)| key == name))
            .unwrap_or("RTCCLK_DIV16");
        q.insert(
            "wakeUp".into(),
            json!({"enabled": true, "clock": name, "counter": ioc_number(values, "RTC.WakeUpCounter", 0)}),
        );
    }
    Value::Object(q)
}

// ---------- the calls the JavaScript files make ----------

/// One of this module's functions by name, with its arguments in order. `None` for a name it does not have.
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
    let f = |i: usize| args.get(i).and_then(Value::as_f64).unwrap_or(f64::NAN);
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let opt = |value: Option<f64>| value.map_or(Value::Null, |x| json!(x));
    Some(Ok(match name {
        "family_tables" => family_tables(),
        "family_clock_valid" => json!(clock_valid(s(0), f(1))),
        "family_timer_max" => json!(family_timer_max(s(0), s(1))),
        "remap_for" => return Some(remap_for(s(0), s(1), v(2)).map(|index| json!(index))),
        "nvic_tables" => nvic_tables(),
        "priority_limits" => {
            let (preempt, sub) = priority_limits(f(0));
            json!({"preempt": preempt, "sub": sub})
        }
        "irq_label" => json!(irq_label(s(0))),
        "peripheral_irqs" => return Some(peripheral_irqs(s(0), s(1)).map(|list| json!(list))),
        "irq_available" => return Some(irq_available(v(0), s(1)).map(|yes| json!(yes))),
        "dma_forced" => json!(dma_forced(v(0), s(1))),
        "nvic_problems" => json!(nvic_problems(v(0))),
        "adc_tables" => adc_tables(),
        "adc_trigger_timer" => json!(adc_trigger_timer(s(0))),
        "adc_pin_channels" => {
            Value::Array(adc_pin_channels(v(0)).into_iter().map(number).collect())
        }
        "adc_ranks" => Value::Array(adc_ranks(v(0))),
        // → {"add": {…}, "error": text | null}: what to put into the settings, and the bad field if there is one
        "validate_adc_group" => {
            let mut add = Map::new();
            let error = adc_group_into(v(0), args.get(1), s(2), &mut add).err();
            json!({"add": add, "error": error})
        }
        "adc_group_problems" => json!(adc_group_problems(v(0))),
        "adc_group_from_ioc" => return Some(adc_group_from_ioc(v(0), s(1), args.get(2))),
        "dac_tables" => dac_tables(),
        "dac_amplitude_name" => json!(dac_amplitude_name(s(0), args.get(1))),
        "dac_channel_of" => json!(dac_channel_of(s(0))),
        "validate_dac" => {
            return Some(validate_dac(v(0)).map(|channels| channels.unwrap_or(Value::Null)))
        }
        "dac_problems" => json!(dac_problems(v(0))),
        "dac_init_lines" => json!(dac_init_lines(v(0))),
        "dac_from_ioc" => dac_from_ioc(v(0)).unwrap_or(Value::Null),
        "wdg_tables" => {
            json!({"iwdg": IWDG_PRESCALERS.map(number), "wwdg": WWDG_PRESCALERS.map(number)})
        }
        "lsi_hz" => number(lsi_hz(s(0))),
        "pclk1_hz" => opt(pclk1_hz(v(0))),
        "validate_iwdg" => return Some(validate_iwdg(v(0))),
        "validate_wwdg" => return Some(validate_wwdg(v(0))),
        "iwdg_timeout_ms" => json!(iwdg_timeout_ms(v(0), s(1))),
        "wwdg_timing" => wwdg_timing(v(0), v(1)),
        "iwdg_init_lines" => json!(iwdg_init_lines(v(0))),
        "wwdg_init_lines" => json!(wwdg_init_lines(v(0))),
        "iwdg_from_ioc" => iwdg_from_ioc(v(0)),
        "wwdg_from_ioc" => wwdg_from_ioc(v(0)),
        "rtc_tables" => rtc_tables(),
        "rtc_defaults" => rtc_defaults(),
        "rtc_prescalers" => rtc_prescalers(s(0), s(1)),
        "rtc_clock_hz" => number(rtc_clock_hz(s(0), s(1))),
        "validate_rtc" => return Some(validate_rtc(v(0), s(1))),
        "rtc_wakeup_seconds" => opt(rtc_wakeup_seconds(v(0), s(1))),
        "rtc_init_lines" => json!(rtc_init_lines(v(0))),
        "rtc_from_ioc" => rtc_from_ioc(v(0), s(1)),
        _ => return None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profiles() {
        let f4 = profile(F4).unwrap();
        assert_eq!(f4["dmaUnits"].as_array().unwrap().len(), 16);
        assert_eq!(f4["extra"]["ADC1"]["IN15"], json!(["PC5"]));
        assert_eq!(keys(&f4["extra"]).last().unwrap(), "SPI3");
        let f1 = profile(F1).unwrap();
        assert_eq!(
            f1["serial"]["USART1"],
            json!({"TX": ["PA9", "PB6"], "RX": ["PA10", "PB7"]})
        );
        assert_eq!(f1["timers"]["TIM2"]["CH1"], json!(["PA0", "PA15"]));
        assert_eq!(f1["irqNumbers"]["DMA1_Channel7_IRQn"], json!(17));
        assert_eq!(f1["dmaRequests"]["MEMTOMEM"].as_array().unwrap().len(), 7);
        assert!(profile("STM32").is_err());
        let names = irq_names(F1).unwrap();
        assert!(
            names.contains(&"TIM1_UP_IRQn".to_string())
                && names.contains(&"TIM1_CC_IRQn".to_string())
        );
        assert_eq!(names.iter().filter(|n| *n == "TIM2_IRQn").count(), 1);
        assert!(
            clock_valid(F4, 84e6)
                && clock_valid(F4, 16e6)
                && !clock_valid(F4, 91e6)
                && !clock_valid(F4, 84_000_001.0)
        );
        assert!(clock_valid(F1, 64e6) && !clock_valid(F1, 66e6));
        assert_eq!(
            remap_for(F1, "USART1", &json!({"TX": "PB6", "RX": "PB7"})).unwrap(),
            Some(1)
        );
        assert_eq!(
            remap_for(F1, "USART1", &json!({"TX": "PB6", "RX": "PA10"})).unwrap(),
            None
        );
        assert_eq!(remap_for(F4, "USART1", &json!({})).unwrap(), None);
    }

    #[test]
    fn nvic() {
        assert_eq!(priority_limits(4.0), (15, 0));
        assert_eq!(priority_limits(2.0), (3, 3));
        assert_eq!(irq_label("EXTI9_5_IRQn"), "EXTI line[9:5] interrupts");
        assert_eq!(
            irq_label("DMA2_Stream3_IRQn"),
            "DMA2 stream3 global interrupt"
        );
        assert_eq!(irq_label("I2C2_ER_IRQn"), "I2C2 error interrupt");
        assert_eq!(irq_label("USART2_IRQn"), "USART2 global interrupt");
        assert_eq!(peripheral_irqs(F4, "ADC1").unwrap(), ["ADC_IRQn"]);
        assert_eq!(peripheral_irqs(F4, "DAC").unwrap(), ["TIM6_DAC_IRQn"]);
        let config = json!({"family": F4, "pins": {"PC13": {"function": "GPIO_EXTI"}}, "peripherals": {"USART2": {"enabled": true}}, "nvic": {"USART2_IRQn": {"enabled": true, "priority": 5}}, "dma": {"a": {"stream": "DMA1_Stream5"}}, "nvicGroup": 2});
        assert!(irq_available(&config, "EXTI15_10_IRQn").unwrap());
        assert!(!irq_available(&config, "EXTI0_IRQn").unwrap());
        assert!(
            dma_forced(&config, "DMA1_Stream5_IRQn") && !dma_forced(&config, "DMA1_Stream6_IRQn")
        );
        assert_eq!(
            nvic_problems(&config),
            [
                "USART2_IRQn: NVIC_PRIORITYGROUP_2에서 선점 우선순위(Preemption)는 0~3입니다.",
                "SysTick_IRQn(Time base): NVIC_PRIORITYGROUP_2에서 선점 우선순위는 0~3입니다."
            ]
        );
    }

    #[test]
    fn analog_and_watchdogs() {
        let config = json!({"pins": {"PA1": {"function": "ADC1_IN1"}, "PA0": {"function": "ADC1_IN0"}}, "peripherals": {"ADC1": {"enabled": true, "conversions": 3, "ranks": [null, 5]}}});
        assert_eq!(adc_ranks(&config), [json!(0), json!(5), json!(1)]);
        assert_eq!(
            adc_group_problems(&config),
            ["ADC1 Rank 2: IN5 핀을 ADC1_IN5로 활성화하세요."]
        );
        assert_eq!(
            validate_adc_group(
                &json!({"conversions": 2, "ranks": [3, 4, 5], "trigger": "T3_TRGO"}),
                None,
                F1
            )
            .unwrap(),
            json!({"conversions": 2, "ranks": [3, 4], "trigger": "T3_TRGO"})
        );
        assert!(validate_adc_group(&json!({"trigger": "T2_TRGO"}), None, F1).is_err());
        assert_eq!(
            dac_amplitude_name("TRIANGLE", Some(&json!(11))),
            "DAC_TRIANGLEAMPLITUDE_4095"
        );
        assert_eq!(
            dac_amplitude_name("NOISE", Some(&json!(0))),
            "DAC_LFSRUNMASK_BIT0"
        );
        assert_eq!(
            dac_amplitude_name("NOISE", Some(&json!(3))),
            "DAC_LFSRUNMASK_BITS3_0"
        );
        assert_eq!(
            validate_dac(&json!({"channels": {"OUT1": {"trigger": "T6_TRGO", "wave": "TRIANGLE", "amplitude": 5, "buffer": true}}})).unwrap(),
            Some(json!({"OUT1": {"trigger": "T6_TRGO", "wave": "TRIANGLE", "amplitude": 5}}))
        );
        assert_eq!(
            dac_from_ioc(
                &json!({"DAC.DAC_Trigger": "DAC_TRIGGER_T6_TRGO", "DAC.DAC_TriangleAmplitude": "DAC_TRIANGLEAMPLITUDE_63", "DAC.DAC_OutputBuffer2": "DAC_OUTPUTBUFFER_DISABLE"})
            ),
            Some(
                json!({"OUT1": {"trigger": "T6_TRGO", "wave": "TRIANGLE", "amplitude": 5}, "OUT2": {"buffer": false}})
            )
        );
        assert_eq!(
            validate_iwdg(&json!({})).unwrap(),
            json!({"prescaler": 4, "reload": 4095})
        );
        assert_eq!(
            validate_wwdg(&json!({"window": 63})).unwrap_err(),
            "WWDG Window value: 64~127 범위의 정수를 입력하세요."
        );
        assert_eq!(
            iwdg_timeout_ms(&json!({"reload": 4095, "prescaler": 4}), F4),
            512.0
        );
        assert_eq!(
            pclk1_hz(&json!({"family": F4, "timerClockHz": 84e6})),
            Some(42e6)
        );
    }

    #[test]
    fn rtc() {
        let q = validate_rtc(
            &json!({"enabled": true, "hourFormat": 12, "time": {"hours": 12, "minutes": 5, "pm": true}}),
            F4,
        )
        .unwrap();
        assert_eq!(
            q["time"],
            json!({"hours": 12, "minutes": 5, "seconds": 0, "pm": true})
        );
        assert_eq!(
            validate_rtc(&json!({"date": {"month": 2, "date": 29, "year": 23}}), F4).unwrap_err(),
            "RTC Date: 2023년 2월에는 29일이 없습니다."
        );
        assert_eq!(bcd(Some(&json!(59))), "0x59");
        assert_eq!(bcd(Some(&json!(7))), "0x7");
        let lines = rtc_init_lines(
            &json!({"family": F1, "peripherals": {"RTC": rtc_defaults()}, "nvic": {}}),
        );
        assert!(lines.contains(&"  DateToUpdate.Month = RTC_MONTH_JANUARY;".to_string()));
        assert_eq!(
            rtc_wakeup_seconds(
                &json!({"clockSource": "LSE", "wakeUp": {"clock": "RTCCLK_DIV16", "counter": 2047}}),
                F4
            ),
            Some(1.0)
        );
        let from = rtc_from_ioc(
            &json!({"RTC.WeekDay": "RTC_WEEKDAY_FRIDAY", "RTC.Hours": "7"}),
            F4,
        );
        assert_eq!(from["date"]["weekDay"], json!(5));
        assert_eq!(from["time"]["hours"], json!({NUMBER: ["7", 0]}));
    }
}
