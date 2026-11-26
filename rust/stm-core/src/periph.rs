//! Names and pin routes of the STM32 peripherals the Pinout screen sets up: timers, UART/USART, I2C/SPI instances and
//! the GPIO table. Moved here from `src/timer-config.js`, `serial-config.js`, `bus-config.js`, `gpio-config.js` and
//! `mcu-defaults.js` (feature 62); those files now only call these functions.
//!
//! A Pinout configuration is the JSON object a project stores as `mcu` (`pins`, `peripherals`, `nvic`, …): the
//! functions that change one take and return JSON, and keep the order of its keys.

use serde_json::{json, Map, Value};

// ---------- timers (timer-config.js) ----------

/// STM32F446RE, DS10693 alternate-function table. TIM2-TIM7 use APB1; the advanced timers TIM1 / TIM8 use APB2 and
/// add complementary outputs (CHxN), a repetition counter and dead time (RM0390 section 16). TIM6/TIM7 are the basic
/// timers (RM0390 section 17): an up counter with no channels or pins, an update interrupt and a TRGO output.
pub fn timer_routes() -> Value {
    json!({
        "TIM1": {"CH1": ["PA8"], "CH2": ["PA9"], "CH3": ["PA10"], "CH4": ["PA11"], "CH1N": ["PA7", "PB13"], "CH2N": ["PB0", "PB14"], "CH3N": ["PB1", "PB15"]},
        "TIM2": {"CH1": ["PA0", "PA5", "PA15"], "CH2": ["PA1", "PB3"], "CH3": ["PA2", "PB10"], "CH4": ["PA3"]},
        "TIM3": {"CH1": ["PA6", "PB4", "PC6"], "CH2": ["PA7", "PB5", "PC7"], "CH3": ["PB0", "PC8"], "CH4": ["PB1", "PC9"]},
        "TIM4": {"CH1": ["PB6"], "CH2": ["PB7"], "CH3": ["PB8"], "CH4": ["PB9"]},
        "TIM5": {"CH1": ["PA0"], "CH2": ["PA1"], "CH3": ["PA2"], "CH4": ["PA3"]},
        "TIM6": {},
        "TIM7": {},
        "TIM8": {"CH1": ["PC6"], "CH2": ["PC7"], "CH3": ["PC8"], "CH4": ["PC9"], "CH1N": ["PA5", "PA7"], "CH2N": ["PB0", "PB14"], "CH3N": ["PB1", "PB15"]},
    })
}
pub const TIMER_IDS: [&str; 8] = [
    "TIM1", "TIM2", "TIM3", "TIM4", "TIM5", "TIM6", "TIM7", "TIM8",
];
pub const BASIC_TIMERS: [&str; 2] = ["TIM6", "TIM7"];
/// The NVIC line of a timer: TIM6 shares its vector with the DAC underrun interrupt. The advanced timers have
/// separate vectors: update (F4 TIM1_UP_TIM10 / TIM8_UP_TIM13, F1 TIM1_UP) and capture/compare.
pub const ADVANCED_TIMERS: [&str; 2] = ["TIM1", "TIM8"];

pub fn is_timer(id: &str) -> bool {
    TIMER_IDS.contains(&id)
}
pub fn is_basic_timer(id: &str) -> bool {
    BASIC_TIMERS.contains(&id)
}
pub fn is_advanced_timer(id: &str) -> bool {
    ADVANCED_TIMERS.contains(&id)
}
/// The NVIC line of a timer's update interrupt (`f1`: STM32F1 names).
pub fn timer_irq(id: &str, f1: bool) -> String {
    match id {
        "TIM6" => "TIM6_DAC_IRQn".into(),
        "TIM1" if f1 => "TIM1_UP_IRQn".into(),
        "TIM1" => "TIM1_UP_TIM10_IRQn".into(),
        "TIM8" => "TIM8_UP_TIM13_IRQn".into(),
        _ => format!("{id}_IRQn"),
    }
}
/// The NVIC line of a timer's capture / compare interrupts.
pub fn timer_cc_irq(id: &str, f1: bool) -> String {
    if is_advanced_timer(id) {
        format!("{id}_CC_IRQn")
    } else {
        timer_irq(id, f1)
    }
}
/// The timer an NVIC line belongs to ('TIM6_DAC_IRQn' → 'TIM6', 'TIM1_CC_IRQn' → 'TIM1').
pub fn timer_of_irq(irq: &str) -> Option<&'static str> {
    TIMER_IDS.iter().copied().find(|id| {
        timer_irq(id, false) == irq || timer_irq(id, true) == irq || timer_cc_irq(id, false) == irq
    })
}
pub fn timer_af(id: &str) -> u32 {
    match id {
        "TIM1" | "TIM2" => 1,
        "TIM8" => 3,
        _ => 2,
    }
}
pub fn timer_max(id: &str) -> u32 {
    if id == "TIM2" || id == "TIM5" {
        4_294_967_295
    } else {
        65_535
    }
}
/// What the timer modules export as data: `{routes, ids, basic, channelIds, advanced, modes, trgo}`.
pub fn timer_tables() -> Value {
    json!({
        "routes": timer_routes(),
        "ids": TIMER_IDS,
        "basic": BASIC_TIMERS,
        "channelIds": TIMER_IDS.iter().filter(|id| !is_basic_timer(id)).collect::<Vec<_>>(),
        "advanced": ADVANCED_TIMERS,
        "modes": {"base": "내부 클록 / 주기", "pwm": "PWM 출력", "oc": "출력 비교 (Output Compare)", "capture": "입력 캡처", "encoder": "엔코더 A/B"},
        // TRGO Parameters › Trigger Event Selection (TIMx_CR2 MMS): Reset (UG bit), Enable (CNT_EN), Update Event.
        "trgo": {"RESET": "Reset (UG bit from TIMx_EGR)", "ENABLE": "Enable (CNT_EN)", "UPDATE": "Update Event"},
    })
}

// ---------- defaults (mcu-defaults.js) ----------

/// CubeMX peripheral activation defaults, not register reset values (docs/MCU-DEFAULTS.md).
pub const DEFAULT_TIMER_CLOCK_HZ: u32 = 16_000_000;
pub const EXAMPLE_TIMER_CLOCK_HZ: u32 = 84_000_000;
/// A fresh timer uses the full ARR width (`family`: every STM32F103RB timer is 16 bits wide).
pub fn timer_defaults(id: &str, family: Option<&str>) -> Result<Value, String> {
    let period = match family {
        None | Some("") | Some("STM32F446RE") => timer_max(id),
        Some("STM32F103RB") => 65_535,
        Some(other) => return Err(format!("지원하지 않는 MCU입니다: {other}")),
    };
    Ok(json!({"enabled": false, "prescaler": 0, "period": period, "pulse": 0, "mode": "base"}))
}

// ---------- UART / USART (serial-config.js) ----------

/// STM32F446RE LQFP64, DS10693 tables 10/11 (not larger-package routes).
pub fn serial_routes() -> Value {
    json!({
        "USART1": {"TX": ["PA9", "PB6"], "RX": ["PA10", "PB7"]},
        "USART2": {"TX": ["PA2"], "RX": ["PA3"]},
        "USART3": {"TX": ["PB10", "PC10"], "RX": ["PC5", "PC11"]},
        "UART4": {"TX": ["PA0", "PC10"], "RX": ["PA1", "PC11"]},
        "UART5": {"TX": ["PC12"], "RX": ["PD2"]},
        "USART6": {"TX": ["PC6"], "RX": ["PC7"]},
    })
}
pub const SERIAL_IDS: [&str; 6] = ["USART1", "USART2", "USART3", "UART4", "UART5", "USART6"];
pub fn is_serial(id: &str) -> bool {
    SERIAL_IDS.contains(&id)
}
/// `huart2` for USART2: "huart" and the digits of the name.
pub fn serial_handle(id: &str) -> String {
    format!(
        "huart{}",
        id.chars().filter(char::is_ascii_digit).collect::<String>()
    )
}
pub fn serial_af(id: &str) -> u32 {
    if matches!(id, "USART1" | "USART2" | "USART3") {
        7
    } else {
        8
    }
}
/// The UART a pin function belongs to (`USART2_TX` → `USART2`).
pub fn serial_function(function: &str) -> Option<&'static str> {
    SERIAL_IDS.iter().copied().find(|id| {
        function
            .strip_prefix(id)
            .is_some_and(|rest| rest == "_TX" || rest == "_RX")
    })
}

fn object<'a>(value: &'a Value, key: &str) -> Option<&'a Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}
fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}
fn function_of(pin: &Value) -> &str {
    text(pin, "function")
}
fn list(value: Option<&Value>) -> Vec<&str> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default()
}
/// `{...pin, function: "Reset", label: ""}`.
fn released(pin: &Value) -> Value {
    let mut out = pin.as_object().cloned().unwrap_or_default();
    out.insert("function".into(), json!("Reset"));
    out.insert("label".into(), json!(""));
    Value::Object(out)
}
fn section<'a>(config: &'a mut Value, key: &str) -> &'a mut Map<String, Value> {
    let root = config.as_object_mut().expect("a configuration object");
    let entry = root.entry(key).or_insert_with(|| json!({}));
    if !entry.is_object() {
        *entry = json!({});
    }
    entry.as_object_mut().unwrap()
}

/// Gives `pin` to the TX or RX of a UART, releasing the pin that had that signal, and turns the UART on.
/// `routes`: `{id: {TX: [pin], RX: [pin]}}` of the MCU.
pub fn assign_serial_pin(
    config: &mut Value,
    id: &str,
    role: &str,
    pin: &str,
    routes: &Value,
) -> Result<(), String> {
    let allowed = routes.get(id).is_some_and(|r| r.is_object())
        && (role == "TX" || role == "RX")
        && list(routes.get(id).and_then(|r| r.get(role))).contains(&pin);
    if !allowed {
        return Err(format!("{id} {role}: 이 MCU에서 사용할 수 없는 핀입니다."));
    }
    let function = format!("{id}_{role}");
    let previous = object(config, "pins")
        .and_then(|pins| pins.get(pin))
        .cloned();
    if let Some(previous) = &previous {
        let used = function_of(previous);
        if used != "Reset" && used != function {
            return Err(format!(
                "{pin}: {used}에서 사용 중입니다. 먼저 해제하거나 다른 핀을 선택하세요."
            ));
        }
    }
    let pins = section(config, "pins");
    for (name, p) in pins.iter_mut() {
        if name != pin && function_of(p) == function {
            *p = released(p);
        }
    }
    let keep = |key: &str, default: Value| {
        previous
            .as_ref()
            .and_then(|p| p.get(key))
            .filter(|v| !v.is_null())
            .cloned()
            .unwrap_or(default)
    };
    pins.insert(
        pin.to_string(),
        json!({"function": function, "pull": keep("pull", json!("NOPULL")), "edge": "FALLING", "initial": 0, "label": keep("label", json!(""))}),
    );
    // As in CubeMX, the global interrupt stays off until NVIC Settings turns it on.
    let peripherals = section(config, "peripherals");
    let mut peripheral = peripherals
        .get(id)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let baud = peripheral
        .get("baud")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or(json!(115200));
    peripheral.insert("enabled".into(), json!(true));
    peripheral.insert("baud".into(), baud);
    peripherals.insert(id.to_string(), Value::Object(peripheral));
    Ok(())
}

/// The configuration with a UART turned on (its TX/RX on free pins) or off (its pins released).
/// `remaps` (F1 AFIO): TX/RX move together, so a whole free remap option is chosen instead of the first free pin per
/// role.
pub fn set_serial_enabled(
    config: &Value,
    id: &str,
    enabled: bool,
    routes: &Value,
    remaps: Option<&Vec<Value>>,
) -> Result<Value, String> {
    if !routes.get(id).is_some_and(|r| r.is_object()) {
        return Err("지원하지 않는 UART/USART입니다.".into());
    }
    let mut next = config.clone();
    const ROLES: [&str; 2] = ["TX", "RX"];
    if enabled {
        let function_at = |next: &Value, pin: &str| -> Option<String> {
            object(next, "pins")
                .and_then(|pins| pins.get(pin))
                .map(|p| function_of(p).to_string())
        };
        let usable = |next: &Value, pin: &str, role: &str| match function_at(next, pin) {
            None => true,
            Some(used) => used == "Reset" || used == format!("{id}_{role}"),
        };
        // Keep the group of pins already assigned (a TX or RX the user picked; refused when its partner is busy), else
        // the first fully free group.
        let current = |next: &Value, role: &str| -> Option<String> {
            let function = format!("{id}_{role}");
            object(next, "pins").and_then(|pins| {
                pins.iter()
                    .find(|(_, p)| function_of(p) == function)
                    .map(|(name, _)| name.clone())
            })
        };
        let option_pin = |option: &Value, role: &str| -> Option<String> {
            option
                .get("pins")
                .and_then(|pins| pins.get(role))
                .and_then(Value::as_str)
                .filter(|pin| !pin.is_empty())
                .map(str::to_string)
        };
        let fits = |next: &Value, option: &Value| {
            ROLES
                .iter()
                .all(|role| option_pin(option, role).is_some_and(|pin| usable(next, &pin, role)))
        };
        if let Some(remaps) = remaps {
            let picked = remaps.iter().find(|option| {
                ROLES.iter().any(|role| {
                    current(&next, role)
                        .is_some_and(|pin| option_pin(option, role).as_deref() == Some(&pin))
                })
            });
            let both = |option: &Value| {
                format!(
                    "{}/{}",
                    option_pin(option, "TX").unwrap_or_else(|| "undefined".into()),
                    option_pin(option, "RX").unwrap_or_else(|| "undefined".into())
                )
            };
            if let Some(picked) = picked {
                if !fits(&next, picked) {
                    let busy = ROLES
                        .iter()
                        .find_map(|role| {
                            let pin = option_pin(picked, role)?;
                            (!usable(&next, &pin, role)).then_some(pin)
                        })
                        .unwrap_or_default();
                    return Err(format!(
                        "{busy}: {}에서 사용 중이라 {id} TX/RX 묶음({})을 쓸 수 없습니다. 먼저 해제하거나 다른 묶음을 고르세요.",
                        function_at(&next, &busy).unwrap_or_default(),
                        both(picked)
                    ));
                }
            }
            let group = picked.or_else(|| remaps.iter().find(|option| fits(&next, option)));
            let Some(group) = group else {
                return Err(format!(
                    "{id}: 함께 옮겨지는 TX/RX 핀 묶음 중 비어 있는 것이 없습니다 ({}).",
                    remaps.iter().map(both).collect::<Vec<_>>().join(", ")
                ));
            };
            for role in ROLES {
                let pin = option_pin(group, role).unwrap_or_default();
                assign_serial_pin(&mut next, id, role, &pin, routes)?;
            }
            return Ok(next);
        }
        for role in ROLES {
            let function = format!("{id}_{role}");
            let route = list(routes.get(id).and_then(|r| r.get(role)));
            let assigned = object(&next, "pins").and_then(|pins| {
                pins.iter()
                    .find(|(name, p)| function_of(p) == function && route.contains(&name.as_str()))
                    .map(|(name, _)| name.clone())
            });
            let available = assigned.or_else(|| {
                route
                    .iter()
                    .find(|pin| match function_at(&next, pin) {
                        None => true,
                        Some(used) => used == "Reset",
                    })
                    .map(|pin| pin.to_string())
            });
            let Some(available) = available else {
                return Err(format!(
                    "{id} {role}: 사용 가능한 핀이 없습니다 ({}).",
                    route.join(", ")
                ));
            };
            assign_serial_pin(&mut next, id, role, &available, routes)?;
        }
    } else {
        let peripherals = section(&mut next, "peripherals");
        let mut peripheral = peripherals
            .get(id)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        peripheral.insert("enabled".into(), json!(false));
        peripherals.insert(id.to_string(), Value::Object(peripheral));
        for (_, p) in section(&mut next, "pins").iter_mut() {
            if serial_function(function_of(p)).is_some_and(|owner| owner == id) {
                *p = released(p);
            }
        }
        let irq = format!("{id}_IRQn");
        if let Some(line) = next
            .get_mut("nvic")
            .and_then(|nvic| nvic.get_mut(&irq))
            .filter(|line| js_truthy(line))
            .and_then(Value::as_object_mut)
        {
            line.insert("enabled".into(), json!(false));
        }
    }
    Ok(next)
}
/// JavaScript's truthiness of a JSON value.
pub fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|v| v != 0.0 && !v.is_nan()),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

// ---------- I2C / SPI instances (bus-config.js) ----------

pub const I2C_IDS: [&str; 3] = ["I2C1", "I2C2", "I2C3"];
pub const SPI_IDS: [&str; 3] = ["SPI1", "SPI2", "SPI3"];
pub fn is_i2c(id: &str) -> bool {
    I2C_IDS.contains(&id)
}
pub fn is_spi(id: &str) -> bool {
    SPI_IDS.contains(&id)
}
fn instance_of(function: &str, ids: &[&'static str], signals: &[&str]) -> Option<&'static str> {
    let (id, signal) = function.split_once('_')?;
    let id = ids.iter().copied().find(|known| *known == id)?;
    signals.contains(&signal).then_some(id)
}
/// The I2C instance a pin function belongs to (I2C2_SDA → I2C2).
pub fn i2c_of(function: &str) -> Option<&'static str> {
    instance_of(function, &I2C_IDS, &["SCL", "SDA"])
}
/// The SPI instance a pin function belongs to (SPI3_MOSI → SPI3).
pub fn spi_of(function: &str) -> Option<&'static str> {
    instance_of(function, &SPI_IDS, &["SCK", "MISO", "MOSI"])
}
/// CubeMX handle names: hi2c2, hspi3.
pub fn bus_handle(id: &str) -> String {
    format!("h{}", id.to_lowercase())
}
/// I2C and SPI instances beyond the first, limited to the pins the NUCLEO headers carry (ST's open pin data,
/// STM32F446R(C-E)Tx). The F103RB has I2C1-2 and SPI1-2 (I2C2 / SPI2 have no AFIO remap).
pub fn f4_bus_routes() -> Value {
    json!({
        "I2C2": {"SCL": ["PB10"], "SDA": ["PB3", "PC12"]},
        "I2C3": {"SCL": ["PA8"], "SDA": ["PC9", "PB4"]},
        "SPI2": {"SCK": ["PB13", "PB10", "PC7", "PA9"], "MISO": ["PB14", "PC2"], "MOSI": ["PB15", "PC3", "PC1"]},
        "SPI3": {"SCK": ["PC10", "PB3"], "MISO": ["PC11", "PB4"], "MOSI": ["PC12", "PB5", "PB0", "PB2", "PC1"]},
    })
}
pub fn f1_bus_routes() -> Value {
    json!({
        "I2C2": {"SCL": ["PB10"], "SDA": ["PB11"]},
        "SPI2": {"SCK": ["PB13"], "MISO": ["PB14"], "MOSI": ["PB15"]},
    })
}
/// F446 AF number of an I2C / SPI signal on a pin: I2C AF4; SPI1 AF5; SPI2 AF5 (PC1 AF7); SPI3 AF6 (PB0 / PB2 AF7,
/// PC1 AF5). `None` for another function.
pub fn bus_af(function: &str, pin: &str) -> Option<u32> {
    if i2c_of(function).is_some() {
        return Some(4);
    }
    let spi = spi_of(function)?;
    Some(match (function, pin) {
        ("SPI2_MOSI", "PC1") | ("SPI3_MOSI", "PB0") | ("SPI3_MOSI", "PB2") => 7,
        ("SPI3_MOSI", "PC1") => 5,
        _ if spi == "SPI3" => 6,
        _ => 5,
    })
}
/// IRQ names of the buses of a family beyond I2C1 / SPI1 (`ids`: the keys of its routes).
pub fn bus_irqs(ids: &[String]) -> Vec<String> {
    ids.iter()
        .flat_map(|id| {
            if is_i2c(id) {
                vec![format!("{id}_EV_IRQn"), format!("{id}_ER_IRQn")]
            } else {
                vec![format!("{id}_IRQn")]
            }
        })
        .collect()
}

// ---------- GPIO table (gpio-config.js) ----------

/// GPIO settings as CubeMX's GPIO table shows them. Defaults follow CubeMX (db GPIO-STM32F446/F103 modes): outputs
/// and timer channels Low, communication pins (USART/SPI/I2C/SDIO) Very High (F1: High, its top speed).
pub const GPIO_SPEEDS: [&str; 4] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
/// `TIM<digits>_CH<digit>` (`one_digit`: exactly one digit after TIM).
fn timer_channel(function: &str, one_digit: bool) -> bool {
    let Some(rest) = function.strip_prefix("TIM") else {
        return false;
    };
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 || (one_digit && digits != 1) {
        return false;
    }
    let mut tail = rest[digits..].strip_prefix("_CH").unwrap_or("\0").chars();
    matches!((tail.next(), tail.next()), (Some(c), None) if c.is_ascii_digit())
}
pub fn default_speed(function: &str, f1: bool) -> &'static str {
    if function == "GPIO_Output" || timer_channel(function, false) {
        "LOW"
    } else if f1 {
        "HIGH"
    } else {
        "VERY_HIGH"
    }
}
fn numbered(function: &str, prefix: &str) -> bool {
    function
        .strip_prefix(prefix)
        .and_then(|rest| rest.strip_prefix(['1', '2', '3']))
        .is_some_and(|rest| rest.starts_with('_'))
}
/// HAL GPIO_MODE_x of a configured pin (without the GPIO_MODE_ prefix). `timer_mode`: the mode of the timer a
/// TIMx_CHy function belongs to.
pub fn gpio_mode(
    function: &str,
    output_type: &str,
    edge: &str,
    timer_mode: &str,
    f1: bool,
) -> String {
    if function == "GPIO_Output" {
        return if output_type == "OD" {
            "OUTPUT_OD"
        } else {
            "OUTPUT_PP"
        }
        .into();
    }
    if function == "GPIO_EXTI" {
        return format!(
            "IT_{}",
            if edge == "CHANGE" {
                "RISING_FALLING"
            } else {
                edge
            }
        );
    }
    if function == "Analog" || function.starts_with("ADC1_") || function.starts_with("DAC_") {
        return "ANALOG".into();
    }
    // F1 peripheral inputs (UART RX, SPI MISO, timer capture/encoder channels) are plain inputs.
    let spi_miso = numbered(function, "SPI") && function.ends_with("_MISO") && function.len() == 9;
    let af_input = f1
        && (function.ends_with("_RX")
            || spi_miso
            || (timer_channel(function, true)
                && (timer_mode == "capture" || timer_mode == "encoder")));
    if function == "GPIO_Input" || af_input {
        return "INPUT".into();
    }
    if numbered(function, "I2C") {
        "AF_OD"
    } else {
        "AF_PP"
    }
    .into()
}
/// CubeMX writes Speed only for outputs and alternate functions.
pub fn has_speed(mode: &str) -> bool {
    mode.starts_with("OUTPUT") || mode.starts_with("AF_")
}
/// A number as JavaScript prints it (`Number(text)` in a template): whole numbers without a fraction, `NaN` for text
/// that is not a number, 0 for an empty text.
pub fn js_number_text(text: &str) -> String {
    let text = text.trim();
    if text.is_empty() {
        return "0".into();
    }
    match text.parse::<f64>() {
        Ok(v) if v.is_finite() && v.fract() == 0.0 && v.abs() < 1e21 => format!("{}", v as i128),
        Ok(v) if v.is_finite() => format!("{v}"),
        _ => "NaN".into(),
    }
}
/// CubeMX signal names for the pin click menu and the pin tiles.
pub fn signal_name(function: &str, pin: &str) -> String {
    match function {
        "Reset" => "Reset_State".into(),
        "Analog" => "GPIO_Analog".into(),
        "GPIO_EXTI" => format!("GPIO_EXTI{}", js_number_text(pin.get(2..).unwrap_or(""))),
        other => other.into(),
    }
}
pub fn is_comm_signal(function: &str) -> bool {
    serial_function(function).is_some()
        || numbered(function, "I2C")
        || numbered(function, "SPI")
        || function.starts_with("SDIO_")
}
pub fn gpio_tables() -> Value {
    json!({
        "speeds": GPIO_SPEEDS,
        "speedNames": {"LOW": "Low", "MEDIUM": "Medium", "HIGH": "High", "VERY_HIGH": "Very High"},
    })
}

// ---------- the calls the JavaScript files make ----------

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`). `None` for a
/// name this module does not have.
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
    let b = |i: usize| args.get(i).is_some_and(js_truthy);
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let some = |value: Option<&str>| value.map_or(Value::Null, |text| json!(text));
    Some(Ok(match name {
        "timer_tables" => timer_tables(),
        "is_timer" => json!(is_timer(s(0))),
        "is_basic_timer" => json!(is_basic_timer(s(0))),
        "is_advanced_timer" => json!(is_advanced_timer(s(0))),
        "timer_irq" => json!(timer_irq(s(0), b(1))),
        "timer_cc_irq" => json!(timer_cc_irq(s(0), b(1))),
        "timer_of_irq" => some(timer_of_irq(s(0))),
        "timer_af" => json!(timer_af(s(0))),
        "timer_max" => json!(timer_max(s(0))),
        "timer_clocks" => {
            json!({"default": DEFAULT_TIMER_CLOCK_HZ, "example": EXAMPLE_TIMER_CLOCK_HZ})
        }
        "timer_defaults" => return Some(timer_defaults(s(0), v(1).as_str())),
        "serial_tables" => json!({"routes": serial_routes(), "ids": SERIAL_IDS}),
        "is_serial" => json!(is_serial(s(0))),
        "serial_handle" => json!(serial_handle(s(0))),
        "serial_af" => json!(serial_af(s(0))),
        "serial_function" => some(serial_function(s(0))),
        // [config, id, role, pin, routes] → config
        "assign_serial_pin" => {
            let mut config = v(0).clone();
            if !config.is_object() {
                return Some(Err("설정이 올바르지 않습니다.".into()));
            }
            return Some(assign_serial_pin(&mut config, s(1), s(2), s(3), v(4)).map(|()| config));
        }
        // [config, id, enabled, routes, remaps | null] → config
        "set_serial_enabled" => {
            if !v(0).is_object() {
                return Some(Err("설정이 올바르지 않습니다.".into()));
            }
            return Some(set_serial_enabled(v(0), s(1), b(2), v(3), v(4).as_array()));
        }
        "bus_tables" => {
            json!({"i2c": I2C_IDS, "spi": SPI_IDS, "f4": f4_bus_routes(), "f1": f1_bus_routes()})
        }
        "is_i2c" => json!(is_i2c(s(0))),
        "is_spi" => json!(is_spi(s(0))),
        "i2c_of" => some(i2c_of(s(0))),
        "spi_of" => some(spi_of(s(0))),
        "bus_handle" => json!(bus_handle(s(0))),
        "bus_af" => json!(bus_af(s(0), s(1))),
        "bus_irqs" => json!(bus_irqs(
            &v(0)
                .as_array()
                .map(|ids| ids
                    .iter()
                    .filter_map(Value::as_str)
                    .map(String::from)
                    .collect::<Vec<_>>())
                .unwrap_or_default()
        )),
        "gpio_tables" => gpio_tables(),
        "default_speed" => json!(default_speed(s(0), b(1))),
        // [function, outputType, edge, timerMode, f1]
        "gpio_mode" => json!(gpio_mode(s(0), s(1), s(2), s(3), b(4))),
        "has_speed" => json!(has_speed(s(0))),
        "signal_name" => json!(signal_name(s(0), s(1))),
        "is_comm_signal" => json!(is_comm_signal(s(0))),
        _ => return None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timer_names() {
        assert_eq!(timer_irq("TIM1", true), "TIM1_UP_IRQn");
        assert_eq!(timer_irq("TIM1", false), "TIM1_UP_TIM10_IRQn");
        assert_eq!(timer_cc_irq("TIM8", false), "TIM8_CC_IRQn");
        assert_eq!(timer_cc_irq("TIM3", false), "TIM3_IRQn");
        assert_eq!(timer_of_irq("TIM6_DAC_IRQn"), Some("TIM6"));
        assert_eq!(timer_of_irq("TIM1_CC_IRQn"), Some("TIM1"));
        assert_eq!(timer_of_irq("USART2_IRQn"), None);
        assert_eq!(
            (timer_af("TIM2"), timer_af("TIM8"), timer_af("TIM3")),
            (1, 3, 2)
        );
        assert_eq!(timer_max("TIM5"), 4_294_967_295);
        assert_eq!(
            timer_defaults("TIM2", Some("STM32F103RB")).unwrap()["period"],
            json!(65535)
        );
        assert!(timer_defaults("TIM2", Some("STM32")).is_err());
        assert_eq!(
            timer_routes()
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            TIMER_IDS.iter().collect::<Vec<_>>()
        );
    }

    #[test]
    fn serial_pins() {
        let routes = serial_routes();
        let mut config = json!({"pins": {"PA2": {"function": "GPIO_Output", "pull": "PULLUP", "label": "x"}}, "peripherals": {}, "nvic": {}});
        assert_eq!(
            assign_serial_pin(&mut config, "USART2", "TX", "PA2", &routes).unwrap_err(),
            "PA2: GPIO_Output에서 사용 중입니다. 먼저 해제하거나 다른 핀을 선택하세요."
        );
        assert_eq!(
            assign_serial_pin(&mut config, "USART2", "TX", "PA9", &routes).unwrap_err(),
            "USART2 TX: 이 MCU에서 사용할 수 없는 핀입니다."
        );
        let on = set_serial_enabled(
            &json!({"pins": {}, "peripherals": {}, "nvic": {"USART1_IRQn": {"enabled": true}}}),
            "USART1",
            true,
            &routes,
            None,
        )
        .unwrap();
        assert_eq!(on["pins"]["PA9"]["function"], json!("USART1_TX"));
        assert_eq!(
            on["pins"]["PA10"],
            json!({"function": "USART1_RX", "pull": "NOPULL", "edge": "FALLING", "initial": 0, "label": ""})
        );
        assert_eq!(
            on["peripherals"]["USART1"],
            json!({"enabled": true, "baud": 115200})
        );
        let off = set_serial_enabled(&on, "USART1", false, &routes, None).unwrap();
        assert_eq!(off["pins"]["PA9"]["function"], json!("Reset"));
        assert_eq!(off["peripherals"]["USART1"]["enabled"], json!(false));
        assert_eq!(off["nvic"]["USART1_IRQn"]["enabled"], json!(false));
        assert_eq!(serial_handle("USART6"), "huart6");
        assert_eq!(serial_function("UART4_RX"), Some("UART4"));
        assert_eq!(serial_function("UART4_CK"), None);
    }

    #[test]
    fn buses_and_gpio() {
        assert_eq!(i2c_of("I2C2_SDA"), Some("I2C2"));
        assert_eq!(i2c_of("I2C4_SDA"), None);
        assert_eq!(spi_of("SPI3_MOSI"), Some("SPI3"));
        assert_eq!(spi_of("SPI3_NSS"), None);
        assert_eq!(
            (
                bus_af("SPI2_MOSI", "PC1"),
                bus_af("SPI3_MOSI", "PC1"),
                bus_af("SPI3_SCK", "PB3"),
                bus_af("I2C3_SCL", "PA8"),
                bus_af("TIM1_CH1", "PA8")
            ),
            (Some(7), Some(5), Some(6), Some(4), None)
        );
        assert_eq!(
            bus_irqs(&["I2C2".into(), "SPI2".into()]),
            ["I2C2_EV_IRQn", "I2C2_ER_IRQn", "SPI2_IRQn"]
        );
        assert_eq!(
            gpio_mode("GPIO_EXTI", "", "CHANGE", "", false),
            "IT_RISING_FALLING"
        );
        assert_eq!(gpio_mode("USART2_RX", "", "", "", true), "INPUT");
        assert_eq!(gpio_mode("USART2_RX", "", "", "", false), "AF_PP");
        assert_eq!(gpio_mode("TIM3_CH1", "", "", "capture", true), "INPUT");
        assert_eq!(gpio_mode("TIM3_CH1N", "", "", "capture", true), "AF_PP");
        assert_eq!(gpio_mode("I2C1_SDA", "", "", "", true), "AF_OD");
        assert_eq!(default_speed("TIM12_CH1", false), "LOW");
        assert_eq!(default_speed("USART2_TX", true), "HIGH");
        assert_eq!(signal_name("GPIO_EXTI", "PC13"), "GPIO_EXTI13");
        assert!(is_comm_signal("SDIO_CK") && !is_comm_signal("TIM1_CH1"));
    }
}
