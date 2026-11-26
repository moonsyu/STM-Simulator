//! The STM32 HAL `main.c` a Pinout configuration generates, as CubeMX would write it into one file: handles, `main`,
//! `SystemClock_Config`, `MX_*_Init` of every enabled peripheral, interrupt handlers and callbacks.
//! Moved here from `src/hal-generator.js` (feature 62); that file now only calls these functions.
//!
//! The configuration is the JSON a project stores as `mcu`, checked by `validateMcu` before it comes here. Values are
//! written into the text as JavaScript's templates wrote them (`mcu::js_display`): a setting that is missing prints
//! `undefined`, as it did.

use crate::clock;
use crate::csedit::{dma_handle, handler_text, irq_handlers};
use crate::mcu::{self, js_display, js_number};
use crate::periph::{
    self, bus_af, bus_handle, default_speed, gpio_mode, has_speed, is_advanced_timer,
    is_basic_timer, is_i2c, is_serial, is_spi, is_timer, js_truthy, serial_af, serial_function,
    serial_handle, timer_af, timer_cc_irq, timer_irq,
};
use serde_json::{json, Map, Value};

const DEFAULT_TIMER_CLOCK_HZ: f64 = 16_000_000.0;

fn get<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter().try_fold(value, |at, key| at.get(key))
}
fn truthy(value: Option<&Value>) -> bool {
    value.is_some_and(js_truthy)
}
fn text(value: Option<&Value>) -> &str {
    value.and_then(Value::as_str).unwrap_or("")
}
fn num(value: Option<&Value>) -> f64 {
    value.and_then(Value::as_f64).unwrap_or(f64::NAN)
}
/// `value ?? default`, as the text a template prints.
fn or(value: Option<&Value>, default: &str) -> String {
    match value {
        Some(v) if !v.is_null() => js_display(Some(v)),
        _ => default.to_string(),
    }
}
fn entries(value: Option<&Value>) -> Vec<(&String, &Value)> {
    value
        .and_then(Value::as_object)
        .map(|map| map.iter().collect())
        .unwrap_or_default()
}
/// `ID_CH<1-4>` (`n`: `ID_CH<1-3>N`) → the channel digit.
fn channel_of(function: &str, id: &str, n: bool) -> Option<char> {
    let rest = function.strip_prefix(id)?.strip_prefix("_CH")?;
    let mut chars = rest.chars();
    let digit = chars.next()?;
    let ok = if n {
        ('1'..='3').contains(&digit) && chars.next() == Some('N') && chars.next().is_none()
    } else {
        ('1'..='4').contains(&digit) && chars.next().is_none()
    };
    ok.then_some(digit)
}

/// printf / scanf go to USART2 when it is enabled as an asynchronous UART that can transmit.
pub fn stdio_uart(config: &Value) -> bool {
    let Some(u) = get(config, &["peripherals", "USART2"]).filter(|u| js_truthy(u)) else {
        return false;
    };
    truthy(u.get("enabled"))
        && u.get("mode") != Some(&json!("synchronous"))
        && or(u.get("direction"), "TX_RX") != "RX"
}
/// The HSI plan of the older single clock setting on the F446: `{source, apb1, n?, divider?, latency}`.
pub fn clock_plan(hz: f64) -> Result<Value, String> {
    if hz == DEFAULT_TIMER_CLOCK_HZ {
        return Ok(json!({"source": "HSI", "apb1": 1, "latency": 0}));
    }
    // HSI removes any dependency on the Nucleo ST-LINK MCO / HSE jumper. APB1=/2, TIMx=HCLK, APB2=/1; F446 APB1 is
    // limited to 45 MHz.
    for divider in [4.0, 2.0, 6.0, 8.0] {
        let n = hz * divider / 1e6;
        if hz <= 90e6 && n.is_finite() && n.fract() == 0.0 && (100.0..=432.0).contains(&n) {
            return Ok(
                json!({"source": "PLLCLK", "apb1": 2, "n": mcu::number(n), "divider": mcu::number(divider), "latency": mcu::number((hz / 30e6).ceil() - 1.0)}),
            );
        }
    }
    Err("main.c 생성: HSI 기본 16 MHz 또는 HSI PLL로 만들 수 있는 APB1 타이머 클록(12.5~90 MHz)을 사용하세요.".into())
}
/// STM32F103: SYSCLK = HSI 8 MHz, or HSI/2 × PLLMUL (2..16). APB1 ≤ 36 MHz, so above that it runs at /2 and the timer
/// clocks double back to SYSCLK. Flash: 0 WS ≤ 24 MHz, 1 WS ≤ 48 MHz, 2 WS above.
pub fn clock_plan_f1(hz: f64) -> Result<Value, String> {
    let latency = if hz <= 24e6 {
        0
    } else if hz <= 48e6 {
        1
    } else {
        2
    };
    if hz == 8e6 {
        return Ok(json!({"source": "HSI", "apb1": 1, "latency": 0}));
    }
    let mul = hz / 4e6;
    if mul.is_finite() && mul.fract() == 0.0 && (2.0..=16.0).contains(&mul) {
        return Ok(
            json!({"source": "PLLCLK", "apb1": if hz > 36e6 { 2 } else { 1 }, "mul": mcu::number(mul), "latency": latency}),
        );
    }
    Err("main.c 생성: STM32F103은 HSI 8 MHz 또는 HSI/2 PLL로 만들 수 있는 8~64 MHz(4 MHz 단위) 타이머 클록을 사용하세요.".into())
}

/// ADC sampling times in cycles, shortest first (the last one is the default).
pub fn adc_sampling(family: &str) -> Option<&'static [f64]> {
    match family {
        mcu::F4 => Some(&[3.0, 15.0, 28.0, 56.0, 84.0, 112.0, 144.0, 480.0]),
        mcu::F1 => Some(&[1.5, 7.5, 13.5, 28.5, 41.5, 55.5, 71.5, 239.5]),
        _ => None,
    }
}
/// `ADC_SAMPLETIME_480CYCLES` / `ADC_SAMPLETIME_239CYCLES_5`.
pub fn adc_sampling_macro(cycles: Option<&Value>) -> String {
    // A whole number is one only when the setting is a number; otherwise JavaScript's conversion (null is 0).
    let c = match cycles {
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => f64::from(u8::from(*b)),
        Some(Value::String(s)) if s.trim().is_empty() => 0.0,
        Some(Value::String(s)) => s.trim().parse().unwrap_or(f64::NAN),
        other => num(other),
    };
    if cycles.is_some_and(Value::is_number) && c.is_finite() && c.fract() == 0.0 {
        format!("ADC_SAMPLETIME_{}CYCLES", js_number(c))
    } else {
        format!(
            "ADC_SAMPLETIME_{}CYCLE{}_5",
            js_number(c.floor()),
            if c < 2.0 { "" } else { "S" }
        )
    }
}
/// The sampling time of the project's ADC1: its own, or the family's longest.
fn adc_sampling_of(config: &Value) -> Option<Value> {
    match get(config, &["peripherals", "ADC1", "samplingTime"]) {
        Some(v) if !v.is_null() => Some(v.clone()),
        _ => adc_sampling(text(config.get("family")))
            .and_then(|list| list.last())
            .map(|c| mcu::number(*c)),
    }
}

/// SystemClock_Config from the project's Clock Configuration, as CubeMX writes it (HSE = ST-LINK MCO in BYPASS mode).
fn tree_clock_lines(config: &Value, f1: bool) -> Vec<String> {
    let family = text(config.get("family"));
    let empty = Map::new();
    let t = config
        .get("clock")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let q = clock::frequencies(family, t);
    let word = |key: &str| t.get(key).and_then(Value::as_str).unwrap_or("");
    let d = |key: &str| js_display(t.get(key));
    let pll = word("sysclkSource") == "PLLCLK";
    let hse = word("sysclkSource") == "HSE" || (pll && word("pllSource") == "HSE");
    let hsi = word("sysclkSource") == "HSI" || (pll && word("pllSource") == "HSI");
    let mut types: Vec<&str> = Vec::new();
    if hsi {
        types.push("RCC_OSCILLATORTYPE_HSI");
    }
    if hse {
        types.push("RCC_OSCILLATORTYPE_HSE");
    }
    let mut lines: Vec<String> = vec![
        "void SystemClock_Config(void) {".into(),
        "  RCC_OscInitTypeDef osc = {0};".into(),
        "  RCC_ClkInitTypeDef clk = {0};".into(),
    ];
    if !f1 {
        lines.push("  __HAL_RCC_PWR_CLK_ENABLE();".into());
        lines.push("  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);".into());
    }
    lines.push(format!("  osc.OscillatorType = {};", types.join(" | ")));
    if hse {
        lines.push("  osc.HSEState = RCC_HSE_BYPASS;".into());
        if f1 {
            lines.push(format!(
                "  osc.HSEPredivValue = RCC_HSE_PREDIV_DIV{};",
                d("hsePrediv")
            ));
        }
    }
    if hsi {
        lines.push("  osc.HSIState = RCC_HSI_ON;".into());
        lines.push("  osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;".into());
    }
    if !pll {
        lines.push("  osc.PLL.PLLState = RCC_PLL_OFF;".into());
    } else if f1 {
        lines.push("  osc.PLL.PLLState = RCC_PLL_ON;".into());
        lines.push(format!(
            "  osc.PLL.PLLSource = {};",
            if word("pllSource") == "HSE" {
                "RCC_PLLSOURCE_HSE"
            } else {
                "RCC_PLLSOURCE_HSI_DIV2"
            }
        ));
        lines.push(format!("  osc.PLL.PLLMUL = RCC_PLL_MUL{};", d("pllMul")));
    } else {
        lines.push("  osc.PLL.PLLState = RCC_PLL_ON;".into());
        lines.push(format!(
            "  osc.PLL.PLLSource = RCC_PLLSOURCE_{};",
            d("pllSource")
        ));
        lines.push(format!("  osc.PLL.PLLM = {};", d("pllM")));
        lines.push(format!("  osc.PLL.PLLN = {};", d("pllN")));
        lines.push(format!("  osc.PLL.PLLP = RCC_PLLP_DIV{};", d("pllP")));
        lines.push(format!("  osc.PLL.PLLQ = {};", d("pllQ")));
        lines.push("  osc.PLL.PLLR = 2;".into());
    }
    lines.push("  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();".into());
    if clock::needs_over_drive(family, q.hclk) {
        lines.push("  /* HCLK above 168 MHz: the regulator runs in over-drive mode. */".into());
        lines.push("  if (HAL_PWREx_EnableOverDrive() != HAL_OK) Error_Handler();".into());
    }
    lines.push("  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;".into());
    lines.push(format!(
        "  clk.SYSCLKSource = RCC_SYSCLKSOURCE_{};",
        d("sysclkSource")
    ));
    lines.push(format!("  clk.AHBCLKDivider = RCC_SYSCLK_DIV{};", d("ahb")));
    lines.push(format!("  clk.APB1CLKDivider = RCC_HCLK_DIV{};", d("apb1")));
    lines.push(format!("  clk.APB2CLKDivider = RCC_HCLK_DIV{};", d("apb2")));
    lines.push(format!(
        "  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_{}) != HAL_OK) Error_Handler();",
        clock::flash_latency(family, q.hclk)
    ));
    if f1 && truthy(get(config, &["peripherals", "ADC1", "enabled"])) {
        lines.push("  RCC_PeriphCLKInitTypeDef periph = {0};".into());
        lines.push("  periph.PeriphClockSelection = RCC_PERIPHCLK_ADC;".into());
        lines.push(format!(
            "  periph.AdcClockSelection = RCC_ADCPCLK2_DIV{};",
            d("adcPrescaler")
        ));
        lines.push("  if (HAL_RCCEx_PeriphCLKConfig(&periph) != HAL_OK) Error_Handler();".into());
    }
    lines.push("}".into());
    lines
}

// DMA handle names / link fields / data widths per request (CubeMX naming).
fn dac_request(request: &str) -> Option<char> {
    let digit = request.strip_prefix("DAC")?;
    (digit == "1" || digit == "2").then(|| digit.chars().next().unwrap())
}
/// `…_CH<digit>` at the end of a request → the digit.
fn request_channel(request: &str) -> Option<char> {
    let at = request.rfind("_CH")?;
    let mut rest = request[at + 3..].chars();
    let digit = rest.next().filter(char::is_ascii_digit)?;
    rest.next().is_none().then_some(digit)
}
fn dma_link(request: &str) -> String {
    if let Some(n) = dac_request(request) {
        format!("DMA_Handle{n}")
    } else if request == "ADC1" || request == "DCMI" {
        "DMA_Handle".into()
    } else if let Some(n) = request_channel(request) {
        format!("hdma[TIM_DMA_ID_CC{n}]")
    } else if request.ends_with("_RX") {
        "hdmarx".into()
    } else {
        "hdmatx".into()
    }
}
fn dma_width(request: &str) -> (&'static str, &'static str) {
    // `TIM<digit>_CH…`
    let timer_request = request
        .strip_prefix("TIM")
        .and_then(|rest| rest.strip_prefix(|c: char| c.is_ascii_digit()))
        .is_some_and(|rest| rest.starts_with("_CH"));
    if request == "ADC1" || dac_request(request).is_some() {
        ("HALFWORD", "HALFWORD")
    } else if timer_request {
        ("WORD", "HALFWORD")
    } else if request == "DCMI" || request.starts_with("SDIO") {
        ("WORD", "WORD")
    } else {
        ("BYTE", "BYTE")
    }
}
fn dma_dir(request: &str) -> &'static str {
    if request == "MEMTOMEM" {
        "DMA_MEMORY_TO_MEMORY"
    } else if request.ends_with("_RX") || request == "ADC1" || request == "DCMI" {
        "DMA_PERIPH_TO_MEMORY"
    } else {
        "DMA_MEMORY_TO_PERIPH"
    }
}
/// The peripheral a DMA request belongs to (`None` for memory to memory).
pub fn dma_owner(request: &str) -> Option<String> {
    if request == "MEMTOMEM" {
        None
    } else if dac_request(request).is_some() {
        Some("DAC".into())
    } else if request == "ADC1" || request == "DCMI" {
        Some(request.into())
    } else if request.starts_with("SDIO") {
        Some("SDIO".into())
    } else {
        // Without its `_RX`, `_TX` or `_CH<digit>` (the first one there is).
        for (at, _) in request.match_indices('_') {
            let rest = &request[at + 1..];
            let ends = rest == "RX"
                || rest == "TX"
                || (rest.len() == 3
                    && rest.starts_with("CH")
                    && rest.as_bytes()[2].is_ascii_digit());
            if ends {
                return Some(request[..at].into());
            }
        }
        Some(request.into())
    }
}
fn dma_lines(name: &str, request: &str, d: &Value, f1: bool) -> Vec<String> {
    let (p, m) = dma_width(request);
    let set = |key: &str, value: &str| format!("  {name}.Init.{key} = {value};");
    let mut lines = vec![format!(
        "  {name}.Instance = {};",
        js_display(d.get("stream"))
    )];
    if !f1 {
        lines.push(set(
            "Channel",
            &format!("DMA_CHANNEL_{}", js_display(d.get("channel"))),
        ));
    }
    lines.push(set("Direction", dma_dir(request)));
    lines.push(set(
        "PeriphInc",
        if request == "MEMTOMEM" {
            "DMA_PINC_ENABLE"
        } else {
            "DMA_PINC_DISABLE"
        },
    ));
    lines.push(set("MemInc", "DMA_MINC_ENABLE"));
    lines.push(set("PeriphDataAlignment", &format!("DMA_PDATAALIGN_{p}")));
    lines.push(set("MemDataAlignment", &format!("DMA_MDATAALIGN_{m}")));
    lines.push(set(
        "Mode",
        if d.get("mode") == Some(&json!("circular")) {
            "DMA_CIRCULAR"
        } else {
            "DMA_NORMAL"
        },
    ));
    lines.push(set(
        "Priority",
        &format!("DMA_PRIORITY_{}", text(d.get("priority")).to_uppercase()),
    ));
    if !f1 {
        lines.push(set(
            "FIFOMode",
            if request.starts_with("SDIO") {
                "DMA_FIFOMODE_ENABLE"
            } else {
                "DMA_FIFOMODE_DISABLE"
            },
        ));
    }
    lines.push(format!(
        "  if (HAL_DMA_Init(&{name}) != HAL_OK) Error_Handler();"
    ));
    lines
}

/// The generated main.c. `minimal`: no example code in `main`, no callbacks. `legacy_gpio`: the pre-1.16 rule (one
/// fixed speed, also on inputs) that removing old Docs code has to match.
pub fn generate_main(config: &Value, minimal: bool, legacy_gpio: bool) -> Result<String, String> {
    let family_id = match config.get("family") {
        None => mcu::DEFAULT_FAMILY.to_string(),
        Some(f) => js_display(Some(f)),
    };
    let family = mcu::profile(&family_id)?;
    let f1 = family["pinMux"] == "remap";
    let peripherals = config.get("peripherals");
    let nvic = config.get("nvic");
    let periph_of = |id: &str| peripherals.and_then(|p| p.get(id));
    let nvic_on = |irq: &str| {
        truthy(
            nvic.and_then(|n| n.get(irq))
                .and_then(|line| line.get("enabled")),
        )
    };
    let timer_clock = config.get("timerClockHz");
    let tree = config
        .get("clock")
        .filter(|c| js_truthy(c))
        .map(|c| clock::frequencies(&family_id, c.as_object().unwrap_or(&Map::new())));
    let plan = match &tree {
        Some(_) => None,
        None if f1 => Some(clock_plan_f1(num(timer_clock))?),
        None => Some(clock_plan(num(timer_clock))?),
    };
    let all_pins = entries(config.get("pins"));
    let function = |p: &Value| text(p.get("function")).to_string();
    let pins: Vec<(&String, &Value)> = all_pins
        .iter()
        .copied()
        .filter(|(_, p)| !matches!(function(p).as_str(), "Reset" | "Reserved"))
        .collect();
    let irqs: Vec<(&String, &Value)> = entries(nvic)
        .into_iter()
        .filter(|(_, p)| truthy(p.get("enabled")))
        .collect();
    let gpio_init = !minimal || !pins.is_empty() || !irqs.is_empty();
    let mut lines: Vec<String> = vec!["#include \"main.h\"".into()];
    if !minimal {
        lines.push("#include <stdio.h>".into());
    }
    lines.push("/* USER CODE BEGIN Includes */".into());
    lines.push("/* USER CODE END Includes */".into());
    lines.push(String::new());
    lines.push(format!(
        "/* Copy this main.c into a CubeIDE {family_id} project with matching"
    ));
    lines.push(" * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.".into());
    lines.push(match (&tree, &plan) {
        (Some(q), _) => {
            let c = config.get("clock").unwrap();
            let source = if c.get("sysclkSource") == Some(&json!("PLLCLK")) {
                format!("{} PLL", js_display(c.get("pllSource")))
            } else {
                format!("{} direct", js_display(c.get("sysclkSource")))
            };
            format!(
                " * Clock: {source}, SYSCLK {}, HCLK {}, APB1 {} (timers {}), APB2 {} (timers {}).",
                clock::mhz(q.sysclk),
                clock::mhz(q.hclk),
                clock::mhz(q.pclk1),
                clock::mhz(q.tim1),
                clock::mhz(q.pclk2),
                clock::mhz(q.tim2)
            )
        }
        (None, plan) => format!(
            " * Clock: {}, APB1 timer clock = {} Hz.",
            if plan.as_ref().is_some_and(|p| p["source"] == "HSI") {
                "HSI direct (PLL off)"
            } else {
                "HSI PLL"
            },
            js_display(timer_clock)
        ),
    });
    if minimal {
        lines.push(" */".into());
    } else {
        lines.push(
            if stdio_uart(config) {
                " * printf / scanf: USART2 (ST-LINK virtual COM port) through _write / _read below."
            } else {
                " * printf: SWV ITM port 0 (enable SWV in the debugger). Enable USART2 in Pinout to print on the UART."
            }
            .into(),
        );
        lines.push(
            " * With newlib-nano, enable -u _printf_float for floating-point printf. */".into(),
        );
    }
    lines.push(String::new());
    let sync = |id: &str| {
        is_serial(id) && periph_of(id).and_then(|p| p.get("mode")) == Some(&json!("synchronous"))
    };
    let dma = entries(config.get("dma"));
    let has = |section: &str, id: &str| family[section].get(id).is_some();
    // (HAL type, handle name) of a peripheral of this family.
    let handle = |id: &str| -> Result<(String, String), String> {
        let digits = || id.chars().filter(char::is_ascii_digit).collect::<String>();
        Ok(if has("timers", id) {
            ("TIM".into(), format!("htim{}", id.get(3..).unwrap_or("")))
        } else {
            match id {
                "ADC1" => ("ADC".into(), "hadc1".into()),
                "SDIO" => ("SD".into(), "hsd".into()),
                "DCMI" => ("DCMI".into(), "hdcmi".into()),
                "RTC" => ("RTC".into(), "hrtc".into()),
                "DAC" => ("DAC".into(), "hdac".into()),
                "IWDG" => ("IWDG".into(), "hiwdg".into()),
                "WWDG" => ("WWDG".into(), "hwwdg".into()),
                _ if is_spi(id) => ("SPI".into(), bus_handle(id)),
                _ if is_i2c(id) => ("I2C".into(), bus_handle(id)),
                _ if has("serial", id) && sync(id) => {
                    ("USART".into(), format!("husart{}", digits()))
                }
                _ if has("serial", id) => ("UART".into(), serial_handle(id)),
                _ => {
                    return Err(format!(
                        "main.c 생성: {family_id}에 없는 주변장치입니다: {id}"
                    ))
                }
            }
        })
    };
    let active: Vec<(&String, &Value)> = entries(peripherals)
        .into_iter()
        .filter(|(_, p)| truthy(p.get("enabled")))
        .collect();
    let serials: Vec<&(&String, &Value)> = active.iter().filter(|(id, _)| is_serial(id)).collect();
    let timers: Vec<&(&String, &Value)> = active.iter().filter(|(id, _)| is_timer(id)).collect();
    for (id, _) in &active {
        let (kind, name) = handle(id)?;
        lines.push(format!("{kind}_HandleTypeDef {name};"));
    }
    for (request, _) in &dma {
        lines.push(format!("DMA_HandleTypeDef {};", dma_handle(request)));
    }
    let init_name = |id: &str| {
        if id == "SDIO" {
            "MX_SDIO_SD_Init".to_string()
        } else {
            format!(
                "MX_{id}{}_Init",
                if is_serial(id) && !sync(id) {
                    "_UART"
                } else {
                    ""
                }
            )
        }
    };
    lines.extend(
        [
            "/* USER CODE BEGIN PV */",
            "/* USER CODE END PV */",
            "",
            "void SystemClock_Config(void);",
            "void Error_Handler(void);",
        ]
        .map(String::from),
    );
    if gpio_init {
        lines.push("static void MX_GPIO_Init(void);".into());
    }
    if !dma.is_empty() {
        lines.push("static void MX_DMA_Init(void);".into());
    }
    for (id, _) in &active {
        lines.push(format!("static void {}(void);", init_name(id)));
    }
    lines.extend(
        [
            "",
            "/* USER CODE BEGIN 0 */",
            "/* USER CODE END 0 */",
            "",
            "int main(void) {",
            "  HAL_Init();",
        ]
        .map(String::from),
    );
    // CubeMX sets these in HAL_MspInit (priority group) and stm32xxxx_hal_conf.h (TICK_INT_PRIORITY); a single main.c
    // sets them right after HAL_Init(). HAL_InitTick() keeps the priority when SystemClock_Config() reconfigures SysTick.
    let setting = |key: &str, default: i64| match config.get(key) {
        Some(v) if !v.is_null() => v.clone(),
        _ => json!(default),
    };
    let group = setting("nvicGroup", mcu::NVIC_GROUP_DEFAULT);
    if group != json!(mcu::NVIC_GROUP_DEFAULT) {
        lines.push(format!(
            "  HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_{});",
            js_display(Some(&group))
        ));
    }
    let tick = setting("tickPriority", mcu::TICK_PRIORITY_DEFAULT);
    if tick != json!(mcu::TICK_PRIORITY_DEFAULT) {
        lines.push(format!("  HAL_InitTick({});", js_display(Some(&tick))));
    }
    lines.push("  SystemClock_Config();".into());
    if gpio_init {
        lines.push("  MX_GPIO_Init();".into());
    }
    if !dma.is_empty() {
        lines.push("  MX_DMA_Init();".into());
    }
    for (id, _) in &active {
        lines.push(format!("  {}();", init_name(id)));
    }
    lines.push("  /* USER CODE BEGIN 2 */".into());
    if !minimal {
        for (id, p) in timers.iter().map(|t| (t.0, t.1)) {
            let h = handle(id)?.1;
            let mode = text(p.get("mode"));
            if mode == "encoder" {
                lines.push(format!("  HAL_TIM_Encoder_Start(&{h}, TIM_CHANNEL_ALL);"));
            } else if matches!(mode, "pwm" | "oc" | "capture") {
                for (_, value) in &all_pins {
                    let f = function(value);
                    if let Some(ch) = channel_of(&f, id, false) {
                        let start = if mode == "pwm" {
                            "PWM_Start".to_string()
                        } else {
                            format!(
                                "{}_Start{}",
                                if mode == "oc" { "OC" } else { "IC" },
                                if nvic_on(&timer_cc_irq(id, f1)) {
                                    "_IT"
                                } else {
                                    ""
                                }
                            )
                        };
                        lines.push(format!("  HAL_TIM_{start}(&{h}, TIM_CHANNEL_{ch});"));
                    }
                    // Complementary output of an advanced timer (TIMx_CHnN).
                    if let Some(ch) = channel_of(&f, id, true).filter(|_| mode != "capture") {
                        lines.push(format!(
                            "  HAL_TIMEx_{}_Start(&{h}, TIM_CHANNEL_{ch});",
                            if mode == "pwm" { "PWMN" } else { "OCN" }
                        ));
                    }
                }
            } else if nvic_on(&timer_irq(id, f1)) {
                lines.push(format!("  HAL_TIM_Base_Start_IT(&{h});"));
            }
        }
        if truthy(periph_of("DAC").and_then(|p| p.get("enabled"))) {
            for (_, p) in &all_pins {
                if let Some(ch) = mcu::dac_channel_of(&function(p)) {
                    let n = &ch[3..];
                    if !dma.iter().any(|(r, _)| **r == format!("DAC{n}")) {
                        lines.push(format!("  HAL_DAC_Start(&hdac, DAC_CHANNEL_{n});"));
                    }
                }
            }
        }
        if serials.iter().any(|(id, _)| !sync(id)) {
            lines.push("  uint8_t message[] = \"HAL ready\\r\\n\";".into());
            for (id, _) in serials.iter().map(|s| (s.0, s.1)) {
                if !sync(id) {
                    lines.push(format!(
                        "  HAL_UART_Transmit(&{}, message, sizeof(message)-1, 100);",
                        serial_handle(id)
                    ));
                }
            }
        }
    }
    lines.extend(
        [
            "  /* USER CODE END 2 */",
            "  while (1) {",
            "    /* USER CODE BEGIN 3 */",
        ]
        .map(String::from),
    );
    if !minimal {
        if let Some((pin, _)) = all_pins.iter().find(|(_, p)| function(p) == "GPIO_Output") {
            lines.push(format!(
                "    HAL_GPIO_TogglePin(GPIO{}, GPIO_PIN_{});",
                pin.chars()
                    .nth(1)
                    .map_or("undefined".to_string(), String::from),
                pin.get(2..).unwrap_or("")
            ));
        }
    }
    // IWDG: the example loop refreshes it and waits at most half its timeout (CubeMX's default is about 0.4-0.5 s).
    let iwdg = periph_of("IWDG").filter(|p| truthy(p.get("enabled")));
    if !minimal {
        if iwdg.is_some() {
            lines.push("    HAL_IWDG_Refresh(&hiwdg);".into());
        }
        let delay = match iwdg {
            Some(p) => {
                let half = (mcu::iwdg_timeout_ms(p, &family_id) / 2.0).floor();
                if half.is_nan() {
                    f64::NAN
                } else {
                    half.clamp(1.0, 500.0)
                }
            }
            None => 500.0,
        };
        lines.push(format!("    HAL_Delay({});", js_number(delay)));
    }
    lines.extend(["    /* USER CODE END 3 */", "  }", "}", ""].map(String::from));
    if tree.is_some() {
        lines.extend(tree_clock_lines(config, f1));
    } else {
        let plan = plan.as_ref().unwrap();
        lines.extend(
            [
                "void SystemClock_Config(void) {",
                "  RCC_OscInitTypeDef osc = {0};",
                "  RCC_ClkInitTypeDef clk = {0};",
            ]
            .map(String::from),
        );
        if !f1 {
            lines.push("  __HAL_RCC_PWR_CLK_ENABLE();".into());
            lines.push("  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);".into());
        }
        lines.extend(
            [
                "  osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;",
                "  osc.HSIState = RCC_HSI_ON;",
                "  osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;",
            ]
            .map(String::from),
        );
        if plan["source"] == "HSI" {
            lines.push("  osc.PLL.PLLState = RCC_PLL_OFF;".into());
        } else if f1 {
            lines.push("  osc.PLL.PLLState = RCC_PLL_ON;".into());
            lines.push("  osc.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;".into());
            lines.push(format!("  osc.PLL.PLLMUL = RCC_PLL_MUL{};", plan["mul"]));
        } else {
            lines.push("  osc.PLL.PLLState = RCC_PLL_ON;".into());
            lines.push("  osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;".into());
            lines.push("  osc.PLL.PLLM = 16;".into());
            lines.push(format!("  osc.PLL.PLLN = {};", plan["n"]));
            lines.push(format!("  osc.PLL.PLLP = RCC_PLLP_DIV{};", plan["divider"]));
            lines.push("  osc.PLL.PLLQ = 7;".into());
            lines.push("  osc.PLL.PLLR = 2;".into());
        }
        lines.push("  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();".into());
        lines.push("  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;".into());
        lines.push(format!(
            "  clk.SYSCLKSource = RCC_SYSCLKSOURCE_{};",
            text(plan.get("source"))
        ));
        lines.push("  clk.AHBCLKDivider = RCC_SYSCLK_DIV1;".into());
        lines.push(format!(
            "  clk.APB1CLKDivider = RCC_HCLK_DIV{};",
            plan["apb1"]
        ));
        lines.push("  clk.APB2CLKDivider = RCC_HCLK_DIV1;".into());
        lines.push(format!(
            "  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_{}) != HAL_OK) Error_Handler();",
            plan["latency"]
        ));
        // F1 ADC clock (PCLK2 = SYSCLK here) must stay at or below 14 MHz.
        if f1 && truthy(periph_of("ADC1").and_then(|p| p.get("enabled"))) {
            let hz = num(timer_clock);
            let div = [2.0, 4.0, 6.0, 8.0]
                .into_iter()
                .find(|n| hz / n <= 14e6)
                .map_or("undefined".to_string(), js_number);
            lines.push("  RCC_PeriphCLKInitTypeDef periph = {0};".into());
            lines.push("  periph.PeriphClockSelection = RCC_PERIPHCLK_ADC;".into());
            lines.push(format!(
                "  periph.AdcClockSelection = RCC_ADCPCLK2_DIV{div};"
            ));
            lines.push(
                "  if (HAL_RCCEx_PeriphCLKConfig(&periph) != HAL_OK) Error_Handler();".into(),
            );
        }
        lines.push("}".into());
    }
    let port = |pin: &str| {
        pin.chars()
            .nth(1)
            .map_or("undefined".to_string(), String::from)
    };
    let number = |pin: &str| pin.get(2..).unwrap_or("").to_string();
    if gpio_init {
        lines.push(String::new());
        lines.push("static void MX_GPIO_Init(void) {".into());
        if !pins.is_empty() {
            lines.push("  GPIO_InitTypeDef GPIO_InitStruct = {0};".into());
        }
        let mut ports: Vec<String> = Vec::new();
        for (pin, _) in &pins {
            let p = port(pin);
            if !ports.contains(&p) {
                ports.push(p);
            }
        }
        for p in &ports {
            lines.push(format!("  __HAL_RCC_GPIO{p}_CLK_ENABLE();"));
        }
        if f1 {
            // AFIO routes EXTI lines and remaps; PA15/PB3/PB4 are JTAG pins until JTAG is released (SWD stays on).
            let mut remaps: Vec<String> = Vec::new();
            for (id, options) in entries(family.get("remaps")) {
                let prefix = format!("{id}_");
                let mut assigned = Map::new();
                for (pin, p) in &pins {
                    if let Some(signal) = function(p).strip_prefix(&prefix) {
                        assigned.insert(signal.to_string(), json!(pin));
                    }
                }
                let option = mcu::remap_for(&family_id, id, &Value::Object(assigned))?
                    .and_then(|index| options.get(index));
                if let Some(name) = option.and_then(|o| o.get("macro")).filter(|m| js_truthy(m)) {
                    remaps.push(js_display(Some(name)));
                }
            }
            let jtag_pins: Vec<&str> = family["jtagPins"]
                .as_array()
                .map(|list| list.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            let jtag = pins
                .iter()
                .any(|(pin, _)| jtag_pins.contains(&pin.as_str()));
            // PD0/PD1 are OSC_IN/OSC_OUT until PD01 remap (RM0008 9.3.2).
            if pins.iter().any(|(pin, _)| *pin == "PD0" || *pin == "PD1") {
                remaps.push("__HAL_AFIO_REMAP_PD01_ENABLE".into());
            }
            if !remaps.is_empty() || jtag || pins.iter().any(|(_, p)| function(p) == "GPIO_EXTI") {
                lines.push("  __HAL_RCC_AFIO_CLK_ENABLE();".into());
            }
            if jtag {
                lines.push("  __HAL_AFIO_REMAP_SWJ_NOJTAG();".into());
            }
            for name in &remaps {
                lines.push(format!("  {name}();"));
            }
        }
        for (pin, p) in &pins {
            let f = function(p);
            let (gpio, n) = (port(pin), number(pin));
            if f == "GPIO_Output" {
                lines.push(format!(
                    "  HAL_GPIO_WritePin(GPIO{gpio}, GPIO_PIN_{n}, GPIO_PIN_{});",
                    if truthy(p.get("initial")) {
                        "SET"
                    } else {
                        "RESET"
                    }
                ));
            }
            // The mode of the timer a TIMx_CHy function belongs to (F1: capture and encoder channels are inputs).
            let timer_mode = if f1 {
                periph_of(f.split('_').next().unwrap_or(""))
                    .and_then(|t| t.get("mode"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
            } else {
                ""
            };
            let mode = gpio_mode(
                &f,
                text(p.get("outputType")),
                &js_display(p.get("edge")),
                timer_mode,
                f1,
            );
            lines.push(format!("  GPIO_InitStruct.Pin = GPIO_PIN_{n};"));
            lines.push(format!("  GPIO_InitStruct.Mode = GPIO_MODE_{mode};"));
            lines.push(format!(
                "  GPIO_InitStruct.Pull = GPIO_{};",
                js_display(p.get("pull"))
            ));
            let speed = if legacy_gpio {
                !minimal || mode == "OUTPUT_PP" || mode.starts_with("AF_")
            } else {
                has_speed(&mode)
            };
            if speed {
                let value = if legacy_gpio {
                    if f1 { "HIGH" } else { "VERY_HIGH" }.to_string()
                } else {
                    or(p.get("speed"), default_speed(&f, f1))
                };
                lines.push(format!(
                    "  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_{value};"
                ));
            }
            if mode.starts_with("AF_") && !f1 {
                // USART<digit>_CK is a pin of that USART too.
                let clock_pin = f.strip_suffix("_CK").filter(|id| {
                    id.strip_prefix("USART")
                        .is_some_and(|d| d.len() == 1 && d.as_bytes()[0].is_ascii_digit())
                });
                let serial = serial_function(&f).or(clock_pin);
                let first = f.split('_').next().unwrap_or("");
                let af = if let Some(serial) = serial {
                    format!("GPIO_AF{}_{serial}", serial_af(serial))
                } else if let Some(af) = bus_af(&f, pin).filter(|af| *af != 0) {
                    format!("GPIO_AF{af}_{first}")
                } else if f.starts_with("SDIO_") {
                    "GPIO_AF12_SDIO".into()
                } else {
                    format!("GPIO_AF{}_{first}", timer_af(first))
                };
                lines.push(format!("  GPIO_InitStruct.Alternate = {af};"));
            }
            lines.push(format!("  HAL_GPIO_Init(GPIO{gpio}, &GPIO_InitStruct);"));
        }
        for (irq, p) in &irqs {
            if mcu::is_dma_irq(irq) {
                continue;
            }
            lines.push(format!(
                "  HAL_NVIC_SetPriority({irq}, {}, {});",
                js_display(p.get("priority")),
                or(p.get("sub"), "0")
            ));
            lines.push(format!("  HAL_NVIC_EnableIRQ({irq});"));
        }
        lines.push("}".into());
    }
    let stream = |d: &Value| js_display(d.get("stream"));
    if !dma.is_empty() {
        lines.push(String::new());
        lines.push("static void MX_DMA_Init(void) {".into());
        let mut units: Vec<String> = Vec::new();
        for (_, d) in &dma {
            let unit: String = text(d.get("stream")).chars().take(4).collect();
            if !units.contains(&unit) {
                units.push(unit);
            }
        }
        units.sort();
        for unit in &units {
            lines.push(format!("  __HAL_RCC_{unit}_CLK_ENABLE();"));
        }
        for (request, d) in &dma {
            if *request == "MEMTOMEM" {
                lines.extend(dma_lines(&dma_handle(request), request, d, f1));
            }
        }
        for (_, d) in &dma {
            let irq = format!("{}_IRQn", stream(d));
            let line = nvic.and_then(|n| n.get(&irq));
            lines.push(format!(
                "  HAL_NVIC_SetPriority({irq}, {}, {});",
                or(line.and_then(|l| l.get("priority")), "0"),
                or(line.and_then(|l| l.get("sub")), "0")
            ));
            lines.push(format!("  HAL_NVIC_EnableIRQ({irq});"));
        }
        lines.push("}".into());
    }
    let conversions = match get(config, &["peripherals", "ADC1", "conversions"]) {
        Some(v) if !v.is_null() => v.clone(),
        _ => json!(1),
    };
    let scan = num(Some(&conversions)) > 1.0;
    for (id, p) in &active {
        let (kind, name) = handle(id)?;
        let id = id.as_str();
        // RTC: clock source, prescalers, calendar, alarm and wakeup; it has no __HAL_RCC_RTC_CLK_ENABLE.
        if id == "RTC" {
            lines.push(String::new());
            lines.push("static void MX_RTC_Init(void) {".into());
            lines.extend(mcu::rtc_init_lines(config));
            lines.push("}".into());
            continue;
        }
        // IWDG runs on the LSI (HAL_IWDG_Init starts it): no __HAL_RCC_IWDG_CLK_ENABLE.
        if id == "IWDG" {
            lines.push(String::new());
            lines.push("static void MX_IWDG_Init(void) {".into());
            lines.extend(mcu::iwdg_init_lines(p));
            lines.push("}".into());
            continue;
        }
        lines.push(String::new());
        lines.push(format!("static void {}(void) {{", init_name(id)));
        lines.push(format!("  __HAL_RCC_{id}_CLK_ENABLE();"));
        lines.push(format!("  {name}.Instance = {id};"));
        let link_dma = |lines: &mut Vec<String>| {
            for (request, d) in &dma {
                if dma_owner(request).as_deref() == Some(id) {
                    let h = dma_handle(request);
                    lines.extend(dma_lines(&h, request, d, f1));
                    lines.push(format!(
                        "  __HAL_LINKDMA(&{name}, {}, {h});",
                        dma_link(request)
                    ));
                }
            }
        };
        if id == "WWDG" {
            lines.extend(mcu::wwdg_init_lines(p));
            lines.push("}".into());
            continue;
        }
        if id == "DAC" {
            lines.extend(mcu::dac_init_lines(config));
            link_dma(&mut lines);
            lines.push("}".into());
            continue;
        }
        let g = |key: &str| p.get(key);
        let on = |key: &str| truthy(p.get(key));
        let mut set =
            |key: &str, value: String| lines.push(format!("  {name}.Init.{key} = {value};"));
        if is_serial(id) && !sync(id) {
            set("BaudRate", js_display(g("baud")));
            set(
                "WordLength",
                format!("UART_WORDLENGTH_{}B", or(g("wordLength"), "8")),
            );
            set(
                "StopBits",
                format!("UART_STOPBITS_{}", or(g("stopBits"), "1")),
            );
            set("Parity", format!("UART_PARITY_{}", or(g("parity"), "NONE")));
            set("Mode", format!("UART_MODE_{}", or(g("direction"), "TX_RX")));
            set("HwFlowCtl", "UART_HWCONTROL_NONE".into());
            set(
                "OverSampling",
                format!("UART_OVERSAMPLING_{}", or(g("overSampling"), "16")),
            );
        }
        if sync(id) {
            set("BaudRate", js_display(g("baud")));
            set("WordLength", "USART_WORDLENGTH_8B".into());
            set("StopBits", "USART_STOPBITS_1".into());
            set("Parity", "USART_PARITY_NONE".into());
            set("Mode", "USART_MODE_TX_RX".into());
            set(
                "CLKPolarity",
                if on("cpol") {
                    "USART_POLARITY_HIGH"
                } else {
                    "USART_POLARITY_LOW"
                }
                .into(),
            );
            set(
                "CLKPhase",
                if on("cpha") {
                    "USART_PHASE_2EDGE"
                } else {
                    "USART_PHASE_1EDGE"
                }
                .into(),
            );
            set(
                "CLKLastBit",
                if on("lastBit") {
                    "USART_LASTBIT_ENABLE"
                } else {
                    "USART_LASTBIT_DISABLE"
                }
                .into(),
            );
        }
        if id == "SDIO" {
            for (key, value) in [
                ("ClockEdge", "SDIO_CLOCK_EDGE_RISING"),
                ("ClockBypass", "SDIO_CLOCK_BYPASS_DISABLE"),
                ("ClockPowerSave", "SDIO_CLOCK_POWER_SAVE_DISABLE"),
                ("BusWide", "SDIO_BUS_WIDE_1B"),
                ("HardwareFlowControl", "SDIO_HARDWARE_FLOW_CONTROL_DISABLE"),
                ("ClockDiv", "0"),
            ] {
                set(key, value.into());
            }
        }
        if id == "DCMI" {
            for (key, value) in [
                ("SynchroMode", "DCMI_SYNCHRO_HARDWARE"),
                ("PCKPolarity", "DCMI_PCKPOLARITY_RISING"),
                ("VSPolarity", "DCMI_VSPOLARITY_LOW"),
                ("HSPolarity", "DCMI_HSPOLARITY_LOW"),
                ("CaptureRate", "DCMI_CR_ALL_FRAME"),
                ("ExtendedDataMode", "DCMI_EXTEND_DATA_8B"),
                ("JPEGMode", "DCMI_JPEG_DISABLE"),
            ] {
                set(key, value.into());
            }
        }
        if is_i2c(id) {
            set("ClockSpeed", js_display(g("clock")));
            set(
                "DutyCycle",
                format!("I2C_DUTYCYCLE_{}", or(g("dutyCycle"), "2")),
            );
            set(
                "OwnAddress1",
                if on("ownAddress") {
                    // `(ownAddress << 1).toString(16).toUpperCase()`
                    let shifted = (num(g("ownAddress")).trunc() as i64 as i32).wrapping_shl(1);
                    if shifted < 0 {
                        format!("0x-{:X}", -(i64::from(shifted)))
                    } else {
                        format!("0x{shifted:X}")
                    }
                } else {
                    "0".into()
                },
            );
            set("AddressingMode", "I2C_ADDRESSINGMODE_7BIT".into());
            set("DualAddressMode", "I2C_DUALADDRESS_DISABLE".into());
            set("OwnAddress2", "0".into());
            set("GeneralCallMode", "I2C_GENERALCALL_DISABLE".into());
            set(
                "NoStretchMode",
                if on("noStretch") {
                    "I2C_NOSTRETCH_ENABLE"
                } else {
                    "I2C_NOSTRETCH_DISABLE"
                }
                .into(),
            );
        }
        if is_spi(id) {
            // The smallest power of two that brings the bus clock down to the SPI clock, 2 to 256.
            let ratio = (num(timer_clock) / num(g("clock"))).log2().ceil();
            let prescaler = if ratio.is_nan() {
                f64::NAN
            } else {
                2f64.powf(ratio.max(1.0)).min(256.0)
            };
            set("Mode", "SPI_MODE_MASTER".into());
            set("Direction", "SPI_DIRECTION_2LINES".into());
            set(
                "DataSize",
                format!("SPI_DATASIZE_{}BIT", or(g("dataSize"), "8")),
            );
            set(
                "CLKPolarity",
                format!("SPI_POLARITY_{}", or(g("cpol"), "LOW")),
            );
            set("CLKPhase", format!("SPI_PHASE_{}", or(g("cpha"), "1EDGE")));
            set("NSS", "SPI_NSS_SOFT".into());
            set(
                "BaudRatePrescaler",
                format!("SPI_BAUDRATEPRESCALER_{}", js_number(prescaler)),
            );
            set(
                "FirstBit",
                format!("SPI_FIRSTBIT_{}", or(g("firstBit"), "MSB")),
            );
            set("TIMode", "SPI_TIMODE_DISABLE".into());
            set("CRCCalculation", "SPI_CRCCALCULATION_DISABLE".into());
            set("CRCPolynomial", "10".into());
        }
        let enable = |yes: bool| if yes { "ENABLE" } else { "DISABLE" }.to_string();
        let trigger = g("trigger").filter(|t| js_truthy(t));
        let trigger_text = trigger.map_or("ADC_SOFTWARE_START".to_string(), |t| {
            format!("ADC_EXTERNALTRIGCONV_{}", js_display(Some(t)))
        });
        if id == "ADC1" && f1 {
            set(
                "ScanConvMode",
                if scan {
                    "ADC_SCAN_ENABLE"
                } else {
                    "ADC_SCAN_DISABLE"
                }
                .into(),
            );
            set("ContinuousConvMode", enable(on("continuous")));
            set("DiscontinuousConvMode", "DISABLE".into());
            set("ExternalTrigConv", trigger_text.clone());
            set("DataAlign", "ADC_DATAALIGN_RIGHT".into());
            set("NbrOfConversion", js_display(Some(&conversions)));
        }
        if id == "ADC1" && !f1 {
            set(
                "ClockPrescaler",
                format!(
                    "ADC_CLOCK_SYNC_PCLK_DIV{}",
                    or(get(config, &["clock", "adcPrescaler"]), "4")
                ),
            );
            set("Resolution", "ADC_RESOLUTION_12B".into());
            set("ScanConvMode", enable(scan));
            set("ContinuousConvMode", enable(on("continuous")));
            set("DiscontinuousConvMode", "DISABLE".into());
            set(
                "ExternalTrigConvEdge",
                if trigger.is_some() {
                    "ADC_EXTERNALTRIGCONVEDGE_RISING"
                } else {
                    "ADC_EXTERNALTRIGCONVEDGE_NONE"
                }
                .into(),
            );
            set("ExternalTrigConv", trigger_text.clone());
            set("DataAlign", "ADC_DATAALIGN_RIGHT".into());
            set("NbrOfConversion", js_display(Some(&conversions)));
            set("DMAContinuousRequests", "DISABLE".into());
            set("EOCSelection", "ADC_EOC_SINGLE_CONV".into());
        }
        let mode = text(g("mode"));
        if is_timer(id) {
            set("Prescaler", js_display(g("prescaler")));
            set(
                "CounterMode",
                format!("TIM_COUNTERMODE_{}", or(g("counterMode"), "UP")),
            );
            set("Period", js_display(g("period")));
            if !is_basic_timer(id) {
                set("ClockDivision", "TIM_CLOCKDIVISION_DIV1".into());
            }
            if is_advanced_timer(id) {
                set("RepetitionCounter", or(g("repetition"), "0"));
            }
            set("AutoReloadPreload", "TIM_AUTORELOAD_PRELOAD_DISABLE".into());
        }
        if is_timer(id) && mode == "encoder" {
            lines.push("  TIM_Encoder_InitTypeDef encoder = {0};".into());
            lines.push("  encoder.EncoderMode = TIM_ENCODERMODE_TI12;".into());
            for n in [1, 2] {
                lines.push(format!("  encoder.IC{n}Polarity = TIM_ICPOLARITY_RISING;"));
                lines.push(format!(
                    "  encoder.IC{n}Selection = TIM_ICSELECTION_DIRECTTI;"
                ));
                lines.push(format!("  encoder.IC{n}Prescaler = TIM_ICPSC_DIV1;"));
                lines.push(format!("  encoder.IC{n}Filter = 0;"));
            }
            lines.push(format!("  HAL_TIM_Encoder_Init(&{name}, &encoder);"));
        } else if id == "SDIO" {
            lines.push(
                "  /* HAL_SD_Init(&hsd) is called by FatFs BSP_SD_Init() or user code. */".into(),
            );
        } else {
            let suffix = if !is_timer(id) {
                ""
            } else {
                match mode {
                    "pwm" => "_PWM",
                    "oc" => "_OC",
                    "capture" => "_IC",
                    _ => "_Base",
                }
            };
            lines.push(format!("  HAL_{kind}{suffix}_Init(&{name});"));
        }
        // One Pulse Mode: CubeMX calls HAL_TIM_OnePulse_Init after the base / channel init.
        if is_timer(id) && on("onePulse") {
            lines.push(format!(
                "  if (HAL_TIM_OnePulse_Init(&{name}, TIM_OPMODE_SINGLE) != HAL_OK) Error_Handler();"
            ));
        }
        // TRGO Parameters of a basic timer (CubeMX always writes them): the trigger output a DAC or ADC conversion can
        // start on.
        if is_basic_timer(id) || on("trgo") {
            lines.push("  TIM_MasterConfigTypeDef sMasterConfig = {0};".into());
            lines.push(format!(
                "  sMasterConfig.MasterOutputTrigger = TIM_TRGO_{};",
                or(g("trgo"), "RESET")
            ));
            lines.push("  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;".into());
            lines.push(format!(
                "  HAL_TIMEx_MasterConfigSynchronization(&{name}, &sMasterConfig);"
            ));
        }
        // One HAL_ADC_ConfigChannel per rank of the regular group (Number Of Conversion), as CubeMX writes them.
        if id == "ADC1" {
            lines.push("  ADC_ChannelConfTypeDef sConfig = {0};".into());
            let sampling = adc_sampling_macro(adc_sampling_of(config).as_ref());
            for (i, channel) in mcu::adc_ranks(config).iter().enumerate() {
                lines.push(format!(
                    "  sConfig.Channel = ADC_CHANNEL_{};",
                    js_display(Some(channel))
                ));
                lines.push(format!(
                    "  sConfig.Rank = {};",
                    if f1 {
                        format!("ADC_REGULAR_RANK_{}", i + 1)
                    } else {
                        (i + 1).to_string()
                    }
                ));
                lines.push(format!("  sConfig.SamplingTime = {sampling};"));
                lines.push("  HAL_ADC_ConfigChannel(&hadc1, &sConfig);".into());
            }
            if f1 {
                lines.push("  HAL_ADCEx_Calibration_Start(&hadc1);".into());
            }
        }
        if is_timer(id) && matches!(mode, "pwm" | "oc" | "capture") {
            let out = mode != "capture";
            let kind = match mode {
                "pwm" => "PWM",
                "oc" => "OC",
                _ => "IC",
            };
            let oc_default = if mode == "oc" { "TIMING" } else { "PWM1" };
            lines.push(format!(
                "  {} channel = {{0}};",
                if out {
                    "TIM_OC_InitTypeDef"
                } else {
                    "TIM_IC_InitTypeDef"
                }
            ));
            if out {
                lines.push(format!("  channel.OCMode = TIM_OCMODE_{oc_default};"));
                lines.push("  channel.OCPolarity = TIM_OCPOLARITY_HIGH;".into());
                lines.push(format!("  channel.Pulse = {};", js_display(g("pulse"))));
                lines.push("  channel.OCFastMode = TIM_OCFAST_DISABLE;".into());
                if is_advanced_timer(id) {
                    lines.push("  channel.OCNPolarity = TIM_OCNPOLARITY_HIGH;".into());
                    lines.push("  channel.OCIdleState = TIM_OCIDLESTATE_RESET;".into());
                    lines.push("  channel.OCNIdleState = TIM_OCNIDLESTATE_RESET;".into());
                }
            } else {
                lines.extend(
                    [
                        "  channel.ICPolarity = TIM_ICPOLARITY_RISING;",
                        "  channel.ICSelection = TIM_ICSELECTION_DIRECTTI;",
                        "  channel.ICPrescaler = TIM_ICPSC_DIV1;",
                        "  channel.ICFilter = 0;",
                    ]
                    .map(String::from),
                );
            }
            // Channels with their own Pulse / polarity / mode set the shared structure again before their
            // ConfigChannel.
            let channels = g("channels").filter(|c| js_truthy(c));
            let own =
                out && channels.is_some_and(|c| c.as_object().is_some_and(|map| !map.is_empty()));
            let mut numbers: Vec<char> = Vec::new();
            for (_, value) in &all_pins {
                let f = function(value);
                if let Some(n) = channel_of(&f, id, false).or_else(|| channel_of(&f, id, true)) {
                    if !numbers.contains(&n) {
                        numbers.push(n);
                    }
                }
            }
            numbers.sort_unstable();
            for n in numbers {
                if own {
                    let c = channels
                        .and_then(|c| c.get(format!("CH{n}")))
                        .filter(|c| js_truthy(c));
                    let of = |key: &str| c.and_then(|c| c.get(key));
                    lines.push(format!(
                        "  channel.OCMode = TIM_OCMODE_{};",
                        or(of("ocMode"), oc_default)
                    ));
                    lines.push(format!(
                        "  channel.OCPolarity = TIM_OCPOLARITY_{};",
                        or(of("polarity"), "HIGH")
                    ));
                    lines.push(format!(
                        "  channel.Pulse = {};",
                        match of("pulse") {
                            Some(v) if !v.is_null() => js_display(Some(v)),
                            _ => js_display(g("pulse")),
                        }
                    ));
                }
                lines.push(format!(
                    "  HAL_TIM_{kind}_ConfigChannel(&{name}, &channel, TIM_CHANNEL_{n});"
                ));
            }
        }
        // Break and dead time of an advanced timer's outputs (CubeMX writes it for PWM / output compare; break input
        // off).
        if is_advanced_timer(id) && matches!(mode, "pwm" | "oc") {
            lines.push("  TIM_BreakDeadTimeConfigTypeDef sBreakDeadTimeConfig = {0};".into());
            lines.push("  sBreakDeadTimeConfig.OffStateRunMode = TIM_OSSR_DISABLE;".into());
            lines.push("  sBreakDeadTimeConfig.OffStateIDLEMode = TIM_OSSI_DISABLE;".into());
            lines.push("  sBreakDeadTimeConfig.LockLevel = TIM_LOCKLEVEL_OFF;".into());
            lines.push(format!(
                "  sBreakDeadTimeConfig.DeadTime = {};",
                or(g("deadTime"), "0")
            ));
            lines.push("  sBreakDeadTimeConfig.BreakState = TIM_BREAK_DISABLE;".into());
            lines.push("  sBreakDeadTimeConfig.BreakPolarity = TIM_BREAKPOLARITY_HIGH;".into());
            lines.push(
                "  sBreakDeadTimeConfig.AutomaticOutput = TIM_AUTOMATICOUTPUT_DISABLE;".into(),
            );
            lines.push(format!(
                "  HAL_TIMEx_ConfigBreakDeadTime(&{name}, &sBreakDeadTimeConfig);"
            ));
        }
        link_dma(&mut lines);
        lines.push("}".into());
    }
    let mut block = |items: &[&str]| {
        lines.push(String::new());
        lines.extend(items.iter().map(|s| s.to_string()));
    };
    if !minimal {
        // Interrupt handlers (CubeMX writes them into stm32xxxx_it.c): enabling USART2 with its NVIC line gives
        // USART2_IRQHandler here.
        for h in irq_handlers(config) {
            if truthy(h.get("shown")) && truthy(h.get("body")) {
                let text = handler_text(&h);
                block(&text.iter().map(String::as_str).collect::<Vec<_>>());
            }
        }
        if pins.iter().any(|(_, p)| function(p) == "GPIO_EXTI") {
            block(&[
                "void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {",
                "  UNUSED(GPIO_Pin);",
                "  /* USER CODE BEGIN EXTI_Callback */",
                "  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */",
                "  /* USER CODE END EXTI_Callback */",
                "}",
            ]);
        }
        if !serials.is_empty() {
            block(&[
                "void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {",
                "  UNUSED(huart);",
                "  /* USER CODE BEGIN UART_RxCplt */",
                "  /* HAL_UART_Receive_IT() 수신 완료 */",
                "  /* USER CODE END UART_RxCplt */",
                "}",
            ]);
        }
        if !timers.is_empty() {
            block(&[
                "void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {",
                "  UNUSED(htim);",
                "  /* USER CODE BEGIN TIM_PeriodElapsed */",
                "  /* 타이머 주기 인터럽트 */",
                "  /* USER CODE END TIM_PeriodElapsed */",
                "}",
            ]);
        }
        if timers
            .iter()
            .any(|(id, p)| p.get("mode") == Some(&json!("oc")) && nvic_on(&timer_cc_irq(id, f1)))
        {
            block(&[
                "void HAL_TIM_OC_DelayElapsedCallback(TIM_HandleTypeDef *htim) {",
                "  UNUSED(htim);",
                "  /* USER CODE BEGIN TIM_OC_DelayElapsed */",
                "  /* 출력 비교 일치(CCR) 인터럽트 */",
                "  /* USER CODE END TIM_OC_DelayElapsed */",
                "}",
            ]);
        }
        // WWDG early wakeup (counter 0x40): the example refreshes there, one count before the reset.
        let wwdg = periph_of("WWDG");
        if truthy(wwdg.and_then(|w| w.get("enabled")))
            && truthy(wwdg.and_then(|w| w.get("ewi")))
            && nvic_on("WWDG_IRQn")
        {
            block(&["void HAL_WWDG_EarlyWakeupCallback(WWDG_HandleTypeDef *hwwdg) {", "  /* USER CODE BEGIN WWDG_EarlyWakeup */", "  HAL_WWDG_Refresh(hwwdg); /* 카운터 0x40: 지금 갱신하지 않으면 다음 카운트에 리셋 */", "  /* USER CODE END WWDG_EarlyWakeup */", "}"]);
        }
        let rtc = periph_of("RTC").filter(|r| truthy(r.get("enabled")));
        if truthy(rtc.and_then(|r| r.get("alarm"))) && nvic_on("RTC_Alarm_IRQn") {
            block(&[
                "void HAL_RTC_AlarmAEventCallback(RTC_HandleTypeDef *hrtc) {",
                "  UNUSED(hrtc);",
                "  /* USER CODE BEGIN RTC_AlarmA */",
                "  /* 알람 A 시각이 됨 (HAL_RTC_GetTime으로 시각 읽기) */",
                "  /* USER CODE END RTC_AlarmA */",
                "}",
            ]);
        }
        if truthy(rtc.and_then(|r| r.get("wakeUp"))) && nvic_on("RTC_WKUP_IRQn") {
            block(&[
                "void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *hrtc) {",
                "  UNUSED(hrtc);",
                "  /* USER CODE BEGIN RTC_WakeUp */",
                "  /* WakeUp 타이머 주기 인터럽트 */",
                "  /* USER CODE END RTC_WakeUp */",
                "}",
            ]);
        }
        if timers
            .iter()
            .any(|(_, p)| p.get("mode") == Some(&json!("capture")))
        {
            block(&[
                "void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim) {",
                "  UNUSED(htim);",
                "  /* USER CODE BEGIN TIM_IC_Capture */",
                "  /* Read HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1). */",
                "  /* USER CODE END TIM_IC_Capture */",
                "}",
            ]);
        }
        // printf / scanf: with USART2 (the ST-LINK virtual COM port) enabled, newlib's _write / _read use it, as in the
        // lecture code; without it printf goes to SWV ITM port 0.
        if stdio_uart(config) {
            block(&[
                "int _write(int file, char *ptr, int len) {",
                "  UNUSED(file);",
                "  HAL_UART_Transmit(&huart2, (uint8_t *)ptr, len, HAL_MAX_DELAY);",
                "  return len;",
                "}",
            ]);
            if or(
                get(config, &["peripherals", "USART2", "direction"]),
                "TX_RX",
            ) == "TX_RX"
            {
                block(&["int _read(int file, char *ptr, int len) {", "  UNUSED(file);", "  UNUSED(len);", "  /* One character at a time, echoed back so the terminal shows what is typed. */", "  if (HAL_UART_Receive(&huart2, (uint8_t *)ptr, 1, HAL_MAX_DELAY) != HAL_OK) return 0;", "  HAL_UART_Transmit(&huart2, (uint8_t *)ptr, 1, HAL_MAX_DELAY);", "  return 1;", "}"]);
            }
        } else {
            block(&[
                "int __io_putchar(int ch) {",
                "  ITM_SendChar(ch);",
                "  return ch;",
                "}",
            ]);
        }
    }
    block(&[
        "/* USER CODE BEGIN 4 */",
        "/* USER CODE END 4 */",
        "",
        "void Error_Handler(void) {",
        "  __disable_irq();",
        "  while (1) { }",
        "}",
    ]);
    Ok(lines.join("\n") + "\n")
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let f = |i: usize| args.get(i).and_then(Value::as_f64).unwrap_or(f64::NAN);
    Some(match name {
        "stdio_uart" => Ok(json!(stdio_uart(v(0)))),
        "clock_plan" => clock_plan(f(0)),
        "clock_plan_f1" => clock_plan_f1(f(0)),
        // [config, minimal, legacyGpio] → text
        "generate_main" => generate_main(v(0), periph::js_truthy(v(1)), periph::js_truthy(v(2)))
            .map(|text| json!(text)),
        "adc_sampling_macro" => Ok(json!(adc_sampling_macro(args.first()))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plans_and_names() {
        assert_eq!(
            clock_plan(84e6).unwrap(),
            json!({"source": "PLLCLK", "apb1": 2, "n": 336, "divider": 4, "latency": 2})
        );
        assert_eq!(
            clock_plan(16e6).unwrap(),
            json!({"source": "HSI", "apb1": 1, "latency": 0})
        );
        assert!(clock_plan(91e6).is_err());
        assert_eq!(
            clock_plan_f1(64e6).unwrap(),
            json!({"source": "PLLCLK", "apb1": 2, "mul": 16, "latency": 2})
        );
        assert_eq!(
            adc_sampling_macro(Some(&json!(480))),
            "ADC_SAMPLETIME_480CYCLES"
        );
        assert_eq!(
            adc_sampling_macro(Some(&json!(1.5))),
            "ADC_SAMPLETIME_1CYCLE_5"
        );
        assert_eq!(
            adc_sampling_macro(Some(&json!(239.5))),
            "ADC_SAMPLETIME_239CYCLES_5"
        );
        assert_eq!(dma_owner("USART2_RX").as_deref(), Some("USART2"));
        assert_eq!(dma_owner("TIM2_CH1").as_deref(), Some("TIM2"));
        assert_eq!(dma_owner("DAC1").as_deref(), Some("DAC"));
        assert_eq!(dma_owner("MEMTOMEM"), None);
        assert_eq!(dma_link("TIM3_CH4"), "hdma[TIM_DMA_ID_CC4]");
        assert_eq!(channel_of("TIM1_CH2N", "TIM1", true), Some('2'));
        assert_eq!(channel_of("TIM1_CH4N", "TIM1", true), None);
        assert_eq!(channel_of("TIM10_CH1", "TIM1", false), None);
    }

    #[test]
    fn a_blank_project_and_a_blinking_pin() {
        let blank = json!({"family": "STM32F446RE", "pins": {}, "peripherals": {}, "nvic": {}, "timerClockHz": 16000000});
        let text = generate_main(&blank, false, false).unwrap();
        assert!(text.starts_with(
            "#include \"main.h\"\n#include <stdio.h>\n/* USER CODE BEGIN Includes */"
        ));
        assert!(text.contains(" * Clock: HSI direct (PLL off), APB1 timer clock = 16000000 Hz.\n"));
        assert!(text.contains("static void MX_GPIO_Init(void) {\n}\n"));
        assert!(text.contains("    HAL_Delay(500);\n"));
        assert!(
            text.ends_with("void Error_Handler(void) {\n  __disable_irq();\n  while (1) { }\n}\n")
        );
        let minimal = generate_main(&blank, true, false).unwrap();
        assert!(
            !minimal.contains("MX_GPIO_Init")
                && !minimal.contains("stdio.h")
                && !minimal.contains("HAL_Delay")
        );
        let led = json!({"family": "STM32F103RB", "pins": {"PA5": {"function": "GPIO_Output", "pull": "NOPULL", "initial": 1}, "PC13": {"function": "GPIO_EXTI", "pull": "PULLUP", "edge": "FALLING"}}, "peripherals": {"USART2": {"enabled": true, "baud": 115200}}, "nvic": {"EXTI15_10_IRQn": {"enabled": true, "priority": 2}}, "timerClockHz": 64000000});
        let text = generate_main(&led, false, false).unwrap();
        for line in [
            "  __HAL_RCC_AFIO_CLK_ENABLE();",
            "  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);",
            "  GPIO_InitStruct.Mode = GPIO_MODE_IT_FALLING;",
            "  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;",
            "  HAL_NVIC_SetPriority(EXTI15_10_IRQn, 2, 0);",
            "  osc.PLL.PLLMUL = RCC_PLL_MUL16;",
            "  huart2.Init.BaudRate = 115200;",
            "  HAL_UART_Init(&huart2);",
            "void EXTI15_10_IRQHandler(void) {",
            "  HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_13);",
            "int _write(int file, char *ptr, int len) {",
        ] {
            assert!(text.contains(line), "{line}\n{text}");
        }
        assert!(generate_main(&json!({"family": "STM32X"}), false, false).is_err());
    }
}
