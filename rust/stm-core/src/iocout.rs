//! Pinout settings as a CubeMX .ioc (the inverse of `ioc::import_ioc`): MCU, pins and their GPIO properties,
//! peripheral parameters, DMA, NVIC and the clock tree, with the key names CubeMX writes. Importing the export gives
//! the same settings back (tests/unit/ioc-export.test.js runs that over many configurations).
//! What is not written: CubeMX's own pin names with alternate labels (PA0-WKUP, PC13-TAMPER-RTC: plain PA0 / PC13 are
//! used), the Project Manager section and the computed RCC *Freq_Value numbers beyond the timer clock. Opening the
//! file in CubeMX itself has not been checked (no CubeMX on the build PCs).
//!
//! Moved here from `src/ioc-export.js` (feature 62).

use crate::halgen::adc_sampling;
use crate::js_re;
use crate::mcu::{self, js_display, js_number, F1};
use crate::mcuconfig::validate_mcu;
use crate::periph::{
    is_advanced_timer, is_basic_timer, is_i2c, is_serial, is_spi, is_timer, js_truthy,
};
use serde_json::{json, Value};

js_re!(TIMER_CHANNEL, r"^TIM\d+_CH\dN?$");
js_re!(ADC_INPUT, r"^ADC1_IN\d+$");
js_re!(GPIO_KIND, r"^GPIO_|^Analog$");
const WEEKDAYS: [&str; 7] = mcu::RTC_WEEKDAYS;
const MONTHS: [&str; 12] = mcu::RTC_MONTHS;

/// The debug and oscillator pins CubeMX lists with their system signal (an imported .ioc keeps them as Reserved).
fn system_signal(pin: &str, f1: bool) -> Option<&'static str> {
    Some(match (pin, f1) {
        ("PA13", _) => "SYS_JTMS-SWDIO",
        ("PA14", _) => "SYS_JTCK-SWCLK",
        ("PB3", true) => "SYS_JTDO-TRACESWO",
        ("PB3", false) => "SYS_JTDO-SWO",
        ("PC14", _) => "RCC_OSC32_IN",
        ("PC15", _) => "RCC_OSC32_OUT",
        ("PD0", true) | ("PH0", false) => "RCC_OSC_IN",
        ("PD1", true) | ("PH1", false) => "RCC_OSC_OUT",
        _ => return None,
    })
}
fn signal_of(function: &str, pin: &str) -> String {
    if function == "Analog" {
        "GPIO_Analog".into()
    } else if function == "GPIO_EXTI" {
        format!(
            "GPXTI{}",
            crate::periph::js_number_text(pin.get(2..).unwrap_or(""))
        )
    } else if TIMER_CHANNEL.is_match(function) {
        format!("S_{function}")
    } else if ADC_INPUT.is_match(function) {
        format!("ADCx_{}", &function[5..])
    } else if function == "DAC_OUT1" || function == "DAC_OUT2" {
        format!("COMP_DAC{}_group", &function[7..])
    } else {
        function.to_string()
    }
}
fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}
fn on(v: &Value, key: &str) -> bool {
    v.get(key).is_some_and(js_truthy)
}
/// `value ?? default` as a template prints it.
fn or(v: Option<&Value>, default: &str) -> String {
    match v {
        Some(x) if !x.is_null() => js_display(Some(x)),
        _ => default.to_string(),
    }
}
fn num(v: Option<&Value>) -> f64 {
    v.and_then(Value::as_f64).unwrap_or(f64::NAN)
}

/// Pins the export leaves out: a Reserved pin whose CubeMX signal is not known (set by an example, not read from an
/// .ioc). The caller shows them, so the loss is not silent.
pub fn unexported_pins(config: &Value) -> Result<Vec<String>, String> {
    let m = validate_mcu(config)?;
    let f1 = m["family"] == F1;
    Ok(m["pins"]
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(pin, p)| {
            p["function"] == "Reserved" && !on(p, "signal") && system_signal(pin, f1).is_none()
        })
        .map(|(pin, _)| pin.clone())
        .collect())
}

pub fn export_ioc(config: &Value) -> Result<String, String> {
    let m = validate_mcu(config)?;
    let family = text(&m, "family");
    let f1 = family == F1;
    let (name, cpn, series, board) = if f1 {
        (
            "STM32F103R(8-B)Tx",
            "STM32F103RBT6",
            "STM32F1",
            "NUCLEO-F103RB",
        )
    } else {
        (
            "STM32F446R(C-E)Tx",
            "STM32F446RET6",
            "STM32F4",
            "NUCLEO-F446RE",
        )
    };
    // Keys in the order they were first set; a key set again keeps its place (they are sorted at the end).
    let mut out: Vec<(String, String)> = Vec::new();
    let mut set = |k: String, v: String| match out.iter_mut().find(|(key, _)| *key == k) {
        Some(entry) => entry.1 = v,
        None => out.push((k, v)),
    };
    let per: Vec<(&String, &Value)> = m["peripherals"]
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(_, p)| on(p, "enabled"))
        .collect();
    let pins: Vec<(&String, &Value)> = m["pins"]
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(pin, p)| {
            let function = text(p, "function");
            if function == "Reserved" {
                on(p, "signal") || system_signal(pin, f1).is_some()
            } else {
                function != "Reset"
            }
        })
        .collect();
    for (k, v) in [
        ("File.Version", "6"),
        ("KeepUserPlacement", "false"),
        ("Mcu.Family", series),
        ("Mcu.Name", name),
        ("Mcu.CPN", cpn),
        ("Mcu.Package", "LQFP64"),
        ("board", board),
    ] {
        set(k.into(), v.into());
    }
    set(
        "Mcu.UserName".into(),
        format!("{}Tx", &cpn[..cpn.len() - 2]),
    );
    let dma: Vec<(&String, &Value)> = m
        .get("dma")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .collect();
    let mut ips: Vec<String> = Vec::new();
    let mut add_ip = |ip: &str| {
        if !ips.iter().any(|x| x == ip) {
            ips.push(ip.to_string());
        }
    };
    for (n, _) in &per {
        add_ip(n);
    }
    if !dma.is_empty() {
        add_ip("DMA");
    }
    if pins
        .iter()
        .any(|(_, p)| GPIO_KIND.is_match(&text(p, "function")))
    {
        add_ip("GPIO");
    }
    for ip in ["NVIC", "RCC", "SYS"] {
        add_ip(ip);
    }
    ips.sort();
    for (i, ip) in ips.iter().enumerate() {
        set(format!("Mcu.IP{i}"), ip.clone());
    }
    set("Mcu.IPNb".into(), ips.len().to_string());
    // ---- pins. In the order the settings hold them: the importer reads the order back from Mcu.PinN (the keys below
    // are sorted as text).
    for (i, (pin, _)) in pins.iter().enumerate() {
        set(format!("Mcu.Pin{i}"), (*pin).clone());
    }
    set("Mcu.PinsNb".into(), pins.len().to_string());
    for (pin, p) in &pins {
        let function = text(p, "function");
        let reserved = function == "Reserved";
        let signal = if reserved {
            if on(p, "signal") {
                text(p, "signal")
            } else {
                system_signal(pin, f1).unwrap_or("").to_string()
            }
        } else {
            signal_of(&function, pin)
        };
        set(format!("{pin}.Signal"), signal);
        set(format!("{pin}.Locked"), "true".into());
        let mut params: Vec<&str> = Vec::new();
        if reserved && !on(p, "signal") && (*pin == "PA13" || *pin == "PA14") {
            set(format!("{pin}.Mode"), "Serial_Wire".into());
        }
        if on(p, "label") {
            set(format!("{pin}.GPIO_Label"), text(p, "label"));
            params.push("GPIO_Label");
        }
        if p["pull"] != "NOPULL" {
            set(
                format!("{pin}.GPIO_PuPd"),
                format!("GPIO_{}", js_display(p.get("pull"))),
            );
            params.push("GPIO_PuPd");
        }
        if function == "GPIO_EXTI" {
            let edge = text(p, "edge");
            set(
                format!("{pin}.GPIO_ModeDefaultEXTI"),
                format!(
                    "GPIO_MODE_IT_{}",
                    if edge == "CHANGE" {
                        "RISING_FALLING"
                    } else {
                        &edge
                    }
                ),
            );
            params.push("GPIO_ModeDefaultEXTI");
        }
        if function == "GPIO_Output" && on(p, "initial") {
            set(format!("{pin}.PinState"), "GPIO_PIN_SET".into());
            params.push("PinState");
        }
        if on(p, "speed") {
            set(
                format!("{pin}.GPIO_Speed"),
                format!("GPIO_SPEED_FREQ_{}", text(p, "speed")),
            );
            params.push("GPIO_Speed");
        }
        if p.get("outputType") == Some(&json!("OD")) {
            set(
                format!("{pin}.GPIO_ModeDefaultOutputPP"),
                "GPIO_MODE_OUTPUT_OD".into(),
            );
            params.push("GPIO_ModeDefaultOutputPP");
        }
        if !params.is_empty() {
            set(format!("{pin}.GPIOParameters"), params.join(","));
        }
        if TIMER_CHANNEL.is_match(&function) {
            set(format!("SH.S_{function}.ConfNb"), "1".into());
        }
    }
    let has_pin = |function: &str| pins.iter().any(|(_, q)| text(q, "function") == function);
    // ---- peripherals
    for (n, p) in &per {
        let n = n.as_str();
        let g = |key: &str| p.get(key);
        let d = |key: &str| js_display(p.get(key));
        if is_serial(n) {
            set(format!("{n}.BaudRate"), d("baud"));
            set(format!("{n}.IPParameters"), "VirtualMode,BaudRate".into());
            if p.get("mode") == Some(&json!("synchronous")) {
                set(format!("{n}.VirtualMode"), "VM_SYNC".into());
                set(
                    format!("{n}.CLKPolarity"),
                    if on(p, "cpol") {
                        "USART_POLARITY_HIGH"
                    } else {
                        "USART_POLARITY_LOW"
                    }
                    .into(),
                );
                set(
                    format!("{n}.CLKPhase"),
                    if on(p, "cpha") {
                        "USART_PHASE_2EDGE"
                    } else {
                        "USART_PHASE_1EDGE"
                    }
                    .into(),
                );
                set(
                    format!("{n}.CLKLastBit"),
                    if on(p, "lastBit") {
                        "USART_LASTBIT_ENABLE"
                    } else {
                        "USART_LASTBIT_DISABLE"
                    }
                    .into(),
                );
            } else {
                set(format!("{n}.VirtualMode"), "VM_ASYNC".into());
                if num(g("wordLength")) == 9.0 {
                    set(format!("{n}.WordLength"), "WORDLENGTH_9B".into());
                }
                if on(p, "parity") {
                    set(format!("{n}.Parity"), format!("PARITY_{}", d("parity")));
                }
                if num(g("stopBits")) == 2.0 {
                    set(format!("{n}.StopBits"), "STOPBITS_2".into());
                }
                if on(p, "direction") {
                    set(format!("{n}.Mode"), format!("MODE_{}", d("direction")));
                }
                if num(g("overSampling")) == 8.0 {
                    set(format!("{n}.OverSampling"), "OVERSAMPLING_8".into());
                }
            }
        } else if is_i2c(n) {
            set(format!("{n}.ClockSpeed"), d("clock"));
            set(
                format!("{n}.I2C_Mode"),
                if num(g("clock")) > 100_000.0 {
                    "I2C_Fast"
                } else {
                    "I2C_Standard"
                }
                .into(),
            );
            if on(p, "ownAddress") {
                set(
                    format!("{n}.OwnAddress"),
                    ((num(g("ownAddress")) as i64 as i32) << 1).to_string(),
                );
            }
            if p.get("dutyCycle") == Some(&json!("16_9")) {
                set(format!("{n}.DutyCycle"), "I2C_DUTYCYCLE_16_9".into());
            }
            if on(p, "noStretch") {
                set(format!("{n}.NoStretchMode"), "I2C_NOSTRETCH_ENABLE".into());
            }
        } else if is_spi(n) {
            let clock_hz = num(g("clock"));
            set(format!("{n}.Mode"), "SPI_MODE_MASTER".into());
            set(format!("{n}.VirtualType"), "VM_MASTER".into());
            set(format!("{n}.Direction"), "SPI_DIRECTION_2LINES".into());
            let ratio = (num(m.get("timerClockHz")) / clock_hz).log2().ceil();
            let prescaler = if ratio.is_nan() {
                f64::NAN
            } else {
                2f64.powf(ratio.max(1.0)).min(256.0)
            };
            set(
                format!("{n}.BaudRatePrescaler"),
                format!("SPI_BAUDRATEPRESCALER_{}", js_number(prescaler)),
            );
            // The rate the settings ask for, in the form CubeMX shows it ("1 MBits/s", "125 KBits/s").
            let rate = if clock_hz >= 1e6 {
                format!("{} MBits/s", js_number(clock_hz / 1e6))
            } else if clock_hz >= 1e3 {
                format!("{} KBits/s", js_number(clock_hz / 1e3))
            } else {
                format!("{} Bits/s", d("clock"))
            };
            set(format!("{n}.CalculateBaudRate"), rate);
            if p.get("cpol") == Some(&json!("HIGH")) {
                set(format!("{n}.CLKPolarity"), "SPI_POLARITY_HIGH".into());
            }
            if p.get("cpha") == Some(&json!("2EDGE")) {
                set(format!("{n}.CLKPhase"), "SPI_PHASE_2EDGE".into());
            }
            if num(g("dataSize")) == 16.0 {
                set(format!("{n}.DataSize"), "SPI_DATASIZE_16BIT".into());
            }
            if p.get("firstBit") == Some(&json!("LSB")) {
                set(format!("{n}.FirstBit"), "SPI_FIRSTBIT_LSB".into());
            }
        } else if is_timer(n) {
            set(format!("{n}.Prescaler"), d("prescaler"));
            set(format!("{n}.Period"), d("period"));
            set(format!("VP_{n}_VS_ClockSourceINT.Mode"), "Internal".into());
            set(
                format!("VP_{n}_VS_ClockSourceINT.Signal"),
                format!("{n}_VS_ClockSourceINT"),
            );
            if on(p, "counterMode") {
                set(
                    format!("{n}.CounterMode"),
                    format!("TIM_COUNTERMODE_{}", d("counterMode")),
                );
            }
            if on(p, "trgo") {
                set(
                    format!("{n}.TIM_MasterOutputTrigger"),
                    format!("TIM_TRGO_{}", d("trgo")),
                );
            }
            if on(p, "onePulse") {
                set(format!("VP_{n}_VS_OPM.Mode"), "OPM_bit".into());
                set(format!("VP_{n}_VS_OPM.Signal"), format!("{n}_VS_OPM"));
            }
            if is_advanced_timer(n) {
                if on(p, "repetition") {
                    set(format!("{n}.RepetitionCounter"), d("repetition"));
                }
                if on(p, "deadTime") {
                    set(format!("{n}.DeadTime"), d("deadTime"));
                }
            }
            let mode = text(p, "mode");
            if mode == "encoder" {
                set(format!("{n}.EncoderMode"), "TIM_ENCODERMODE_TI12".into());
            }
            let mut channels: Vec<char> = Vec::new();
            for (_, q) in &pins {
                let function = text(q, "function");
                let digit = function
                    .strip_prefix(&format!("{n}_CH"))
                    .map(|rest| rest.strip_suffix('N').unwrap_or(rest))
                    .filter(|rest| rest.len() == 1)
                    .and_then(|rest| rest.chars().next())
                    .filter(|c| ('1'..='4').contains(c));
                if let Some(c) = digit {
                    if !channels.contains(&c) {
                        channels.push(c);
                    }
                }
            }
            channels.sort_unstable();
            if is_basic_timer(n) {
                channels.clear();
            }
            for c in channels {
                let own = p
                    .get("channels")
                    .and_then(|ch| ch.get(format!("CH{c}")))
                    .filter(|o| js_truthy(o));
                let of = |key: &str| own.and_then(|o| o.get(key));
                let tail = if has_pin(&format!("{n}_CH{c}N")) {
                    format!(" CH{c}N")
                } else {
                    String::new()
                };
                let pulse = match of("pulse") {
                    Some(v) if !v.is_null() => js_display(Some(v)),
                    _ => d("pulse"),
                };
                if mode == "pwm" {
                    let name = format!("PWM Generation{c} CH{c}{tail}");
                    set(format!("{n}.Channel-{name}"), format!("TIM_CHANNEL_{c}"));
                    set(format!("{n}.Pulse-{name}"), pulse);
                    if of("ocMode") == Some(&json!("PWM2")) {
                        set(format!("{n}.OCMode_PWM-{name}"), "TIM_OCMODE_PWM2".into());
                    }
                    if of("polarity") == Some(&json!("LOW")) {
                        set(
                            format!("{n}.OCPolarity_{c}-{name}"),
                            "TIM_OCPOLARITY_LOW".into(),
                        );
                    }
                } else if mode == "oc" {
                    let name = format!("Output Compare{c} CH{c}{tail}");
                    set(format!("{n}.Channel-{name}"), format!("TIM_CHANNEL_{c}"));
                    set(format!("{n}.Pulse-{name}"), pulse);
                    if of("ocMode").is_some_and(js_truthy) {
                        set(
                            format!("{n}.OCMode_{c}"),
                            format!("TIM_OCMODE_{}", js_display(of("ocMode"))),
                        );
                    }
                    if of("polarity") == Some(&json!("LOW")) {
                        set(format!("{n}.OCPolarity_{c}"), "TIM_OCPOLARITY_LOW".into());
                    }
                } else if mode == "capture" {
                    set(
                        format!("{n}.Channel-Input_Capture{c}_from_TI{c}"),
                        format!("TIM_CHANNEL_{c}"),
                    );
                }
            }
        } else if n == "ADC1" {
            if on(p, "continuous") {
                set("ADC1.ContinuousConvMode".into(), "ENABLE".into());
            }
            let cycles = match g("samplingTime") {
                Some(v) if !v.is_null() => num(Some(v)),
                _ => adc_sampling(&family)
                    .and_then(|l| l.last().copied())
                    .unwrap_or(f64::NAN),
            };
            set(
                "ADC1.SamplingTime-0#ChannelRegularConversion".into(),
                format!(
                    "ADC_SAMPLETIME_{}CYCLES{}",
                    js_number(cycles.floor()),
                    if cycles.fract() == 0.0 { "" } else { "_5" }
                ),
            );
            let ranks = mcu::adc_ranks(&m);
            set("ADC1.NbrOfConversion".into(), or(g("conversions"), "1"));
            set("ADC1.NbrOfConversionFlag".into(), "1".into());
            if ranks.len() > 1 {
                set(
                    "ADC1.ScanConvMode".into(),
                    if f1 { "ADC_SCAN_ENABLE" } else { "ENABLE" }.into(),
                );
            }
            for (i, ch) in ranks.iter().enumerate() {
                set(
                    format!("ADC1.Channel-{i}#ChannelRegularConversion"),
                    format!("ADC_CHANNEL_{}", js_display(Some(ch))),
                );
                set(
                    format!("ADC1.Rank-{i}#ChannelRegularConversion"),
                    (i + 1).to_string(),
                );
            }
            if on(p, "trigger") {
                set(
                    "ADC1.ExternalTrigConv".into(),
                    format!("ADC_EXTERNALTRIGCONV_{}", d("trigger")),
                );
                if !f1 {
                    set(
                        "ADC1.ExternalTrigConvEdge".into(),
                        "ADC_EXTERNALTRIGCONVEDGE_RISING".into(),
                    );
                }
            }
            if !f1 && on(&m, "clock") {
                set(
                    "ADC1.ClockPrescaler".into(),
                    format!(
                        "ADC_CLOCK_SYNC_PCLK_DIV{}",
                        js_display(m["clock"].get("adcPrescaler"))
                    ),
                );
            }
        } else if n == "IWDG" {
            set(
                "IWDG.Prescaler".into(),
                format!("IWDG_PRESCALER_{}", d("prescaler")),
            );
            set("IWDG.Reload".into(), d("reload"));
            set("VP_IWDG_VS_IWDG.Mode".into(), "IWDG_Activate".into());
            set("VP_IWDG_VS_IWDG.Signal".into(), "IWDG_VS_IWDG".into());
        } else if n == "WWDG" {
            set(
                "WWDG.Prescaler".into(),
                format!("WWDG_PRESCALER_{}", d("prescaler")),
            );
            set("WWDG.Window".into(), d("window"));
            set("WWDG.Counter".into(), d("counter"));
            set(
                "WWDG.EWIMode".into(),
                if on(p, "ewi") {
                    "WWDG_EWI_ENABLE"
                } else {
                    "WWDG_EWI_DISABLE"
                }
                .into(),
            );
            set("VP_WWDG_VS_WWDG.Mode".into(), "WWDG_Activate".into());
            set("VP_WWDG_VS_WWDG.Signal".into(), "WWDG_VS_WWDG".into());
        } else if n == "RTC" {
            set("VP_RTC_VS_RTC_Activate.Mode".into(), "RTC_Enabled".into());
            set(
                "VP_RTC_VS_RTC_Activate.Signal".into(),
                "RTC_VS_RTC_Activate".into(),
            );
            set(
                "RCC.RTCClockSelection".into(),
                format!("RCC_RTCCLKSOURCE_{}", or(g("clockSource"), "LSE")),
            );
            let twelve = num(g("hourFormat")) == 12.0 && !f1;
            if twelve {
                set("RTC.HourFormat".into(), "RTC_HOURFORMAT_12".into());
            }
            let empty = json!({});
            let time = |t: &Value, s: &str, set: &mut dyn FnMut(String, String)| {
                set(
                    format!("RTC.Hours{s}"),
                    or(t.get("hours"), if twelve { "12" } else { "0" }),
                );
                set(format!("RTC.Minutes{s}"), or(t.get("minutes"), "0"));
                set(format!("RTC.Seconds{s}"), or(t.get("seconds"), "0"));
                if twelve && on(t, "pm") {
                    set(format!("RTC.TimeFormat{s}"), "RTC_HOURFORMAT12_PM".into());
                }
            };
            time(
                g("time").filter(|t| !t.is_null()).unwrap_or(&empty),
                "",
                &mut set,
            );
            let date = g("date").filter(|x| !x.is_null()).unwrap_or(&empty);
            let named = |list: &[&str], v: Option<&Value>| -> String {
                let at = match v {
                    Some(x) if !x.is_null() => num(Some(x)),
                    _ => 1.0,
                } - 1.0;
                if at.fract() == 0.0 && at >= 0.0 && (at as usize) < list.len() {
                    list[at as usize].to_string()
                } else {
                    "undefined".into()
                }
            };
            set(
                "RTC.WeekDay".into(),
                format!("RTC_WEEKDAY_{}", named(&WEEKDAYS, date.get("weekDay"))),
            );
            set(
                "RTC.Month".into(),
                format!("RTC_MONTH_{}", named(&MONTHS, date.get("month"))),
            );
            set("RTC.Date".into(), or(date.get("date"), "1"));
            set("RTC.Year".into(), or(date.get("year"), "0"));
            if let Some(alarm) = g("alarm").filter(|a| on(a, "enabled")) {
                set("VP_RTC_VS_RTC_Alarm_A_Intern.Mode".into(), "Alarm A".into());
                set(
                    "VP_RTC_VS_RTC_Alarm_A_Intern.Signal".into(),
                    "RTC_VS_RTC_Alarm_A_Intern".into(),
                );
                set("RTC.Alarm".into(), "RTC_ALARM_A".into());
                time(alarm, "_A", &mut set);
                if !f1 {
                    set("RTC.AlarmDateWeekDay".into(), or(alarm.get("date"), "1"));
                    for (k, label) in [
                        ("maskDateWeekDay", "DateWeekDay"),
                        ("maskHours", "Hours"),
                        ("maskMinutes", "Minutes"),
                        ("maskSeconds", "Seconds"),
                    ] {
                        if on(alarm, k) {
                            set(
                                format!("RTC.AlarmMask{label}"),
                                format!("RTC_ALARMMASK_{}", label.to_uppercase()),
                            );
                        }
                    }
                }
            }
            if let Some(w) = g("wakeUp").filter(|w| on(w, "enabled") && !f1) {
                set("VP_RTC_VS_RTC_WakeUp_intern.Mode".into(), "WakeUp".into());
                set(
                    "VP_RTC_VS_RTC_WakeUp_intern.Signal".into(),
                    "RTC_VS_RTC_WakeUp_intern".into(),
                );
                set(
                    "RTC.WakeUpClock".into(),
                    format!("RTC_WAKEUPCLOCK_{}", or(w.get("clock"), "RTCCLK_DIV16")),
                );
                set("RTC.WakeUpCounter".into(), or(w.get("counter"), "0"));
            }
        } else if n == "DAC" {
            for (ch, s) in [("OUT1", ""), ("OUT2", "2")] {
                let Some(c) = g("channels")
                    .and_then(|x| x.get(ch))
                    .filter(|c| js_truthy(c))
                else {
                    continue;
                };
                if on(c, "trigger") {
                    set(
                        format!("DAC.DAC_Trigger{s}"),
                        format!("DAC_TRIGGER_{}", text(c, "trigger")),
                    );
                }
                if c.get("buffer") == Some(&json!(false)) {
                    set(
                        format!("DAC.DAC_OutputBuffer{s}"),
                        "DAC_OUTPUTBUFFER_DISABLE".into(),
                    );
                }
                let wave = text(c, "wave");
                if on(c, "wave") && wave != "NONE" {
                    set(
                        format!("DAC.DAC_WaveGeneration{s}"),
                        if wave == "TRIANGLE" {
                            "DAC_WAVE_TRIANGLE"
                        } else {
                            "DAC_WAVE_NOISE"
                        }
                        .into(),
                    );
                    let zero = json!(0);
                    let amplitude = c.get("amplitude").filter(|a| !a.is_null()).unwrap_or(&zero);
                    set(
                        format!("DAC.DAC_LFSRUnmask_TriangleAmplitude{s}"),
                        mcu::dac_amplitude_name(&wave, Some(amplitude)),
                    );
                }
            }
        }
    }
    // ---- DMA
    for (i, (request, d)) in dma.iter().enumerate() {
        set(format!("Dma.Request{i}"), (*request).clone());
        let b = format!("Dma.{request}.{i}.");
        set(format!("{b}Instance"), js_display(d.get("stream")));
        if !f1 {
            set(
                format!("{b}Channel"),
                format!("DMA_CHANNEL_{}", js_display(d.get("channel"))),
            );
        }
        set(
            format!("{b}Mode"),
            if d.get("mode") == Some(&json!("circular")) {
                "DMA_CIRCULAR"
            } else {
                "DMA_NORMAL"
            }
            .into(),
        );
        set(
            format!("{b}Priority"),
            format!("DMA_PRIORITY_{}", text(d, "priority").to_uppercase()),
        );
        let direction = if request.ends_with("_RX") || *request == "ADC1" || *request == "DCMI" {
            "DMA_PERIPH_TO_MEMORY"
        } else if *request == "MEMTOMEM" {
            "DMA_MEMORY_TO_MEMORY"
        } else {
            "DMA_MEMORY_TO_PERIPH"
        };
        set(format!("{b}Direction"), direction.into());
    }
    if !dma.is_empty() {
        set("Dma.RequestsNb".into(), dma.len().to_string());
    }
    // ---- NVIC: enabled:preemption:sub:… (the trailing flags are CubeMX's code-generation options). A line that is off
    // keeps its priority too (CubeMX writes only enabled lines; the importer reads both).
    for (irq, n) in m["nvic"].as_object().into_iter().flatten() {
        set(
            format!("NVIC.{irq}"),
            format!(
                "{}:{}:{}:false:false:true:true:true:true",
                js_display(n.get("enabled")),
                js_display(n.get("priority")),
                or(n.get("sub"), "0")
            ),
        );
    }
    if on(&m, "coupleFiles") {
        set("ProjectManager.CoupleFile".into(), "true".into());
    }
    set(
        "NVIC.PriorityGroup".into(),
        format!("NVIC_PRIORITYGROUP_{}", or(m.get("nvicGroup"), "4")),
    );
    set(
        "NVIC.SysTick_IRQn".into(),
        format!(
            "true:{}:0:false:false:true:false:true:false",
            or(m.get("tickPriority"), "15")
        ),
    );
    // ---- clock
    set(
        "RCC.APB1TimFreq_Value".into(),
        js_display(m.get("timerClockHz")),
    );
    if let Some(t) = m.get("clock").filter(|c| js_truthy(c)) {
        let d = |key: &str| js_display(t.get(key));
        set(
            "RCC.SYSCLKSource".into(),
            format!("RCC_SYSCLKSOURCE_{}", d("sysclkSource")),
        );
        set(
            "RCC.PLLSourceVirtual".into(),
            format!("RCC_PLLSOURCE_{}", d("pllSource")),
        );
        set(
            "RCC.AHBCLKDivider".into(),
            format!("RCC_SYSCLK_DIV{}", d("ahb")),
        );
        set(
            "RCC.APB1CLKDivider".into(),
            format!("RCC_HCLK_DIV{}", d("apb1")),
        );
        set(
            "RCC.APB2CLKDivider".into(),
            format!("RCC_HCLK_DIV{}", d("apb2")),
        );
        if f1 {
            set("RCC.PLLMUL".into(), format!("RCC_PLL_MUL{}", d("pllMul")));
            set(
                "RCC.HSEDivPLL".into(),
                format!("RCC_HSE_PREDIV_DIV{}", d("hsePrediv")),
            );
            set(
                "RCC.ADCPresc".into(),
                format!("RCC_ADCPCLK2_DIV{}", d("adcPrescaler")),
            );
        } else {
            set("RCC.PLLM".into(), d("pllM"));
            set("RCC.PLLN".into(), d("pllN"));
            set("RCC.PLLP".into(), format!("RCC_PLLP_DIV{}", d("pllP")));
            set("RCC.PLLQ".into(), d("pllQ"));
        }
        if t.get("sysclkSource") == Some(&json!("HSE")) || t.get("pllSource") == Some(&json!("HSE"))
        {
            set("RCC.HSE_VALUE".into(), "8000000".into());
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    // Java-properties escaping: spaces, # and : in a key, : in a value.
    let key = |k: &str| {
        k.chars().fold(String::new(), |mut s, c| {
            if matches!(c, ' ' | '#' | ':') {
                s.push('\\');
            }
            s.push(c);
            s
        })
    };
    let mut lines = vec!["#MicroXplorer Configuration settings - do not modify".to_string()];
    lines.extend(
        out.iter()
            .map(|(k, v)| format!("{}={}", key(k), v.replace(':', "\\:"))),
    );
    Ok(lines.join("\n") + "\n")
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    Some(match name {
        "unexported_pins" => unexported_pins(v(0)).map(|pins| json!(pins)),
        "export_ioc" => export_ioc(v(0)).map(|text| json!(text)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_small_project_and_back() {
        let config = json!({
            "family": "STM32F446RE",
            "pins": {"PA5": {"function": "GPIO_Output", "pull": "NOPULL", "edge": "FALLING", "label": "LD2", "initial": 1}, "PC13": {"function": "GPIO_EXTI", "pull": "PULLUP", "edge": "CHANGE", "label": "", "initial": 0}, "PA2": {"function": "USART2_TX", "pull": "NOPULL", "edge": "FALLING", "label": "", "initial": 0}, "PA3": {"function": "USART2_RX", "pull": "NOPULL", "edge": "FALLING", "label": "", "initial": 0}, "PB1": {"function": "Reserved", "pull": "NOPULL", "edge": "FALLING", "label": "", "initial": 0}},
            "peripherals": {"USART2": {"enabled": true, "baud": 9600}},
            "nvic": {"EXTI15_10_IRQn": {"enabled": true, "priority": 2}},
            "timerClockHz": 16000000,
        });
        let text = export_ioc(&config).unwrap();
        for line in [
            "#MicroXplorer Configuration settings - do not modify",
            "Mcu.IP0=GPIO",
            "Mcu.IP4=USART2",
            "Mcu.Pin0=PA5",
            "PA5.GPIOParameters=GPIO_Label,PinState",
            "PC13.Signal=GPXTI13",
            "PC13.GPIO_ModeDefaultEXTI=GPIO_MODE_IT_RISING_FALLING",
            "USART2.BaudRate=9600",
            "NVIC.EXTI15_10_IRQn=true\\:2\\:0\\:false\\:false\\:true\\:true\\:true\\:true",
            "RCC.APB1TimFreq_Value=16000000",
        ] {
            assert!(text.lines().any(|l| l == line), "{line}\n{text}");
        }
        assert_eq!(unexported_pins(&config).unwrap(), ["PB1"]);
        let back = crate::ioc::import_ioc(&text).unwrap();
        assert_eq!(back["config"]["pins"]["PA5"], config["pins"]["PA5"]);
        assert_eq!(back["config"]["peripherals"], config["peripherals"]);
        assert_eq!(back["config"]["nvic"], config["nvic"]);
    }
}
