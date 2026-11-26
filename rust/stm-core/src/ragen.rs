//! FSP project files for a Renesas RA board, as the RA Smart Configurator (RASC) / e² studio FSP Configurator writes
//! them: ra_cfg/fsp_cfg (BSP and module configuration headers), ra_gen (clock, pins, instances, vectors, main.c,
//! linker init tables) and script (linker scripts). The user's code is src/hal_entry.c; the app builds these with the
//! FSP sources (BSP + r_* drivers) and ARM GCC, then runs the ELF on the RA6E1 emulator. Formats follow RASC output
//! for FSP 5.x/6.x (only what the FPB-RA6E1 configurations here need).
//!
//! Moved here from `src/ra-generator.js` (feature 62). The texts are in `ragen_text.rs`.

use crate::mcu::js_number;
use crate::raconfig::{self as rc, js_round, or, out, show, there, to_num, truthy};
use crate::ragen_text::*;
use serde_json::{json, Map, Value};

const BROKEN: &str = "Cannot read properties of undefined";

/// The text with its holes filled: `⟦#0⟧` and `⟦name⟧` from `holes`, `⟦t.name⟧` from the value named `t`.
fn fill(template: &str, values: &[(&str, &Value)], holes: &[(&str, String)]) -> String {
    let mut text = String::with_capacity(template.len() + 256);
    let mut rest = template;
    while let Some(at) = rest.find('\u{27e6}') {
        text.push_str(&rest[..at]);
        let after = &rest[at + 3..];
        let end = after.find('\u{27e7}').unwrap_or(after.len());
        let label = &after[..end];
        if let Some((_, value)) = holes.iter().find(|(k, _)| *k == label) {
            text.push_str(value);
        } else {
            let mut keys = label.split('.');
            let root = keys.next().unwrap_or("");
            let mut value = values.iter().find(|(k, _)| *k == root).map(|(_, v)| *v);
            for key in keys {
                value = value.and_then(|v| v.get(key));
            }
            text.push_str(&show(value));
        }
        rest = after.get(end + 3..).unwrap_or("");
    }
    text.push_str(rest);
    text
}
fn hole(label: &'static str, value: impl Into<String>) -> (&'static str, String) {
    (label, value.into())
}
fn header(kind: &str) -> String {
    fill(T_HEADER, &[], &[hole("kind", kind)])
}
/// `n >>> 0`.
fn to_u32(v: f64) -> u32 {
    if v.is_finite() {
        (v.trunc() as i128).rem_euclid(1 << 32) as u32
    } else {
        0
    }
}
/// `'0x' + (n >>> 0).toString(16).toUpperCase().padStart(w, '0')`.
fn hex(v: f64, width: usize) -> String {
    format!("0x{:0width$X}", to_u32(v))
}
/// `n.toString(16)` of a whole number.
fn base16(v: Option<&Value>) -> Result<String, String> {
    if let Some(text) = v.and_then(Value::as_str) {
        return Ok(text.to_string());
    }
    if let Some(flag) = v.and_then(Value::as_bool) {
        return Ok(flag.to_string());
    }
    let Some(n) = there(v).and_then(rc::num) else {
        return Err(BROKEN.into());
    };
    Ok(if n.is_finite() && n.fract() == 0.0 {
        format!("{}{:x}", if n < 0.0 { "-" } else { "" }, n.abs() as u128)
    } else {
        js_number(n)
    })
}
fn pad_start2(text: String) -> String {
    format!("{text:0>2}")
}
/// `p[key] || default`.
fn or_else(p: &Value, key: &str, default: Value) -> Value {
    match p.get(key) {
        Some(v) if truthy(v) => v.clone(),
        _ => default,
    }
}
fn object(entries: Vec<(&str, Value)>) -> Value {
    Value::Object(
        entries
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect(),
    )
}
/// `{...base, ...over}`.
fn spread(base: &Value, over: &Value) -> Map<String, Value> {
    let mut merged = base.as_object().cloned().unwrap_or_default();
    for (k, v) in over.as_object().into_iter().flatten() {
        merged.insert(k.clone(), v.clone());
    }
    merged
}
fn enabled(p: Option<&Value>) -> bool {
    p.and_then(|p| p.get("enabled")).is_some_and(truthy)
}
fn peripheral<'a>(mcu: &'a Value, id: &str) -> Option<&'a Value> {
    mcu.get("peripherals").and_then(|p| p.get(id))
}
fn pins(mcu: &Value) -> impl Iterator<Item = (&String, &Value)> {
    mcu.get("pins")
        .filter(|p| truthy(p))
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
}
fn text_of(v: &Value, key: &str) -> String {
    show(v.get(key))
}
fn lower(text: &str) -> String {
    text.to_lowercase()
}

/// "P408" → "BSP_IO_PORT_04_PIN_08".
pub fn io_name(pin: Option<&Value>) -> Result<String, String> {
    let (port, bit) = rc::port_bit(pin)?;
    Ok(format!("BSP_IO_PORT_{port:02}_PIN_{bit:02}"))
}
/// The pin configuration word for ioport_pin_cfg_t (r_ioport.h ioport_cfg_options_t).
pub fn pin_cfg_word(pin: Option<&Value>) -> Result<String, String> {
    let empty = json!({});
    let p = pin.filter(|p| truthy(p)).unwrap_or(&empty);
    let is = |key: &str, value: &str| p.get(key).and_then(Value::as_str) == Some(value);
    let mut parts: Vec<&str> = Vec::new();
    if is("function", "GPIO_Output") {
        parts.push("IOPORT_CFG_PORT_DIRECTION_OUTPUT");
        parts.push(if p.get("initial").is_some_and(truthy) {
            "IOPORT_CFG_PORT_OUTPUT_HIGH"
        } else {
            "IOPORT_CFG_PORT_OUTPUT_LOW"
        });
        if is("drive", "MID") {
            parts.push("IOPORT_CFG_DRIVE_MID");
        } else if is("drive", "HIGH") {
            parts.push("IOPORT_CFG_DRIVE_HIGH");
        }
        if is("outputType", "NMOS") {
            parts.push("IOPORT_CFG_NMOS_ENABLE");
        }
    } else if is("function", "GPIO_Input") {
        parts.push("IOPORT_CFG_PORT_DIRECTION_INPUT");
        if is("pull", "PULLUP") {
            parts.push("IOPORT_CFG_PULLUP_ENABLE");
        }
    } else if is("function", "IRQ") {
        parts.push("IOPORT_CFG_IRQ_ENABLE");
        parts.push("IOPORT_CFG_PORT_DIRECTION_INPUT");
        if is("pull", "PULLUP") {
            parts.push("IOPORT_CFG_PULLUP_ENABLE");
        }
    } else if is("function", "Analog") {
        parts.push("IOPORT_CFG_ANALOG_ENABLE");
    } else if is("function", "Peripheral") {
        let signal = text_of(p, "signal");
        parts.push(if signal.starts_with("IIC") {
            "IOPORT_CFG_DRIVE_MID"
        } else {
            "IOPORT_CFG_DRIVE_HIGH"
        });
        parts.push("IOPORT_CFG_PERIPHERAL_PIN");
        parts.push(match rc::psel(&signal)? {
            3 => "IOPORT_PERIPHERAL_GPT1",
            4 => "IOPORT_PERIPHERAL_SCI0_2_4_6_8",
            5 => "IOPORT_PERIPHERAL_SCI1_3_5_7_9",
            6 => "IOPORT_PERIPHERAL_SPI",
            _ => "IOPORT_PERIPHERAL_IIC",
        });
        if is("pull", "PULLUP") {
            parts.push("IOPORT_CFG_PULLUP_ENABLE");
        }
        if is("outputType", "NMOS") {
            parts.push("IOPORT_CFG_NMOS_ENABLE");
        }
        if is("drive", "MID") {
            parts.push("IOPORT_CFG_DRIVE_MID");
        }
    } else {
        let name = p
            .get("name")
            .filter(|n| truthy(n))
            .map_or("핀".to_string(), |n| show(Some(n)));
        return Err(format!("{name}: 지원하지 않는 핀 기능입니다."));
    }
    Ok(format!(
        "((uint32_t) {})",
        parts
            .iter()
            .map(|x| format!("(uint32_t) {x}"))
            .collect::<Vec<_>>()
            .join(" | ")
    ))
}

// ---------- the instances hal_data.c defines ----------

// External IRQ instances (r_icu): one per pin set to IRQ, named g_external_irqN like RASC.
fn irqs_of(mcu: &Value) -> Result<Vec<Value>, String> {
    let mut list = Vec::new();
    for (pin, p) in pins(mcu) {
        if p.is_null() {
            return Err(BROKEN.into());
        }
        if p.get("function") != Some(&json!("IRQ")) {
            continue;
        }
        let Some(channel) = rc::irq_of(pin) else {
            return Err(format!("{pin}: IRQ 핀이 아닙니다."));
        };
        list.push(object(vec![
            ("pin", json!(pin)),
            ("channel", json!(channel)),
            (
                "name",
                or_else(p, "instance", json!(format!("g_external_irq{channel}"))),
            ),
            (
                "callback",
                or_else(
                    p,
                    "callback",
                    json!(format!("external_irq{channel}_callback")),
                ),
            ),
            ("trigger", or_else(p, "edge", json!("FALLING"))),
            ("priority", or(p, "priority", json!(12))),
            ("filter", json!(p.get("filter").is_some_and(truthy))),
        ]));
    }
    Ok(list)
}
fn is_spi_mode(p: &Value) -> bool {
    p.get("mode") == Some(&json!("SPI"))
}
// SCI UART instances (r_sci_uart), g_uartN on each enabled SCI channel.
fn uarts_of(mcu: &Value) -> Vec<Value> {
    let mut list = Vec::new();
    for ch in rc::SCI_CHANNELS {
        let Some(p) =
            peripheral(mcu, &format!("SCI{ch}")).filter(|p| enabled(Some(p)) && !is_spi_mode(p))
        else {
            continue;
        };
        list.push(object(vec![
            ("channel", json!(ch)),
            ("name", json!(format!("g_uart{ch}"))),
            ("baud", or(p, "baud", json!(115_200))),
            (
                "callback",
                or_else(p, "callback", json!(format!("user_uart{ch}_callback"))),
            ),
            ("priority", or(p, "priority", json!(12))),
            ("transferTx", or_else(p, "transferTx", json!(""))),
            ("transferRx", or_else(p, "transferRx", json!(""))),
        ]));
    }
    list
}
fn clock(mcu: &Value, key: &str) -> Result<f64, String> {
    rc::clock_hz(mcu, Some(&json!(key)))
}
// GPT timer instances (r_gpt), g_timerN on each enabled GPT channel: saw-wave PWM on the GTIOC pins set to it, or a
// periodic timer; the cycle-end (overflow) interrupt only when a callback is named, as RASC leaves it disabled
// otherwise.
fn gpts_of(mcu: &Value) -> Result<Vec<Value>, String> {
    let mut list = Vec::new();
    for ch in rc::GPT_CHANNELS {
        let Some(p) = peripheral(mcu, &format!("GPT{ch}")).filter(|p| enabled(Some(p))) else {
            continue;
        };
        let mut used: Vec<&Value> = Vec::new();
        for (_, q) in pins(mcu) {
            if q.is_null() {
                return Err(BROKEN.into());
            }
            if q.get("function") == Some(&json!("Peripheral")) {
                used.extend(q.get("signal"));
            }
        }
        let has = |signal: String| used.contains(&&json!(signal));
        let (period, unit, duty) = (
            or(p, "period", json!(1)),
            or_else(p, "unit", json!("kHz")),
            or(p, "duty", json!(50)),
        );
        let counts = rc::gpt_counts(
            clock(mcu, "pclkd")?,
            &ch.to_string(),
            rc::GPT_32BIT.contains(&ch),
            to_num(Some(&period)),
            &show(Some(&unit)),
            to_num(Some(&duty)),
        )?;
        list.push(object(vec![
            ("channel", json!(ch)),
            ("name", json!(format!("g_timer{ch}"))),
            ("mode", or_else(p, "mode", json!("PWM"))),
            ("period", period),
            ("unit", unit),
            ("duty", duty),
            ("callback", or_else(p, "callback", json!(""))),
            ("priority", or(p, "priority", json!(12))),
            ("a", json!(has(format!("GPT{ch}_GTIOCA")))),
            ("b", json!(has(format!("GPT{ch}_GTIOCB")))),
            ("counts", counts),
        ]));
    }
    Ok(list)
}
// ADC instance (r_adc), g_adc0 with g_adc0_channel_cfg scanning the Analog pins' channels.
fn adc_of(mcu: &Value) -> Result<Option<Value>, String> {
    let Some(p) = peripheral(mcu, "ADC0").filter(|p| enabled(Some(p))) else {
        return Ok(None);
    };
    let mut a = p.as_object().cloned().unwrap_or_default();
    a.insert("mode".into(), or_else(p, "mode", json!("SINGLE")));
    a.insert("resolution".into(), or(p, "resolution", json!(12)));
    a.insert("callback".into(), or_else(p, "callback", json!("")));
    a.insert("priority".into(), or(p, "priority", json!(12)));
    let mut channels: Vec<u32> = Vec::new();
    for (pin, q) in pins(mcu) {
        if q.is_null() {
            return Err(BROKEN.into());
        }
        if q.get("function") == Some(&json!("Analog")) {
            channels.extend(
                rc::ADC_CHANNELS
                    .iter()
                    .find(|(p, _)| *p == pin.as_str())
                    .map(|(_, c)| *c),
            );
        }
    }
    channels.sort_unstable();
    a.insert("channels".into(), json!(channels));
    Ok(Some(Value::Object(a)))
}
// AGT timer instances (r_agt), g_agtN periodic timers; the AGTn_INT (underflow) interrupt when a callback is named.
fn agts_of(mcu: &Value) -> Result<Vec<Value>, String> {
    let mut list = Vec::new();
    for ch in rc::AGT_CHANNELS {
        let Some(p) = peripheral(mcu, &format!("AGT{ch}")).filter(|p| enabled(Some(p))) else {
            continue;
        };
        let (period, unit) = (or(p, "period", json!(100)), or_else(p, "unit", json!("ms")));
        let counts = rc::agt_counts(
            clock(mcu, "pclkb")?,
            &ch.to_string(),
            to_num(Some(&period)),
            &show(Some(&unit)),
        )?;
        list.push(object(vec![
            ("channel", json!(ch)),
            ("name", json!(format!("g_agt{ch}"))),
            ("period", period),
            ("unit", unit),
            (
                "callback",
                or(p, "callback", json!(format!("agt{ch}_callback"))),
            ),
            ("priority", or(p, "priority", json!(12))),
            ("counts", counts),
        ]));
    }
    Ok(list)
}
// I2C instances: masters (r_iic_master, g_i2c_masterN) and slaves (r_iic_slave, g_i2c_slaveN) — an IIC channel in
// slave mode. One priority for RXI/TXI/TEI and for ERI.
fn iics_of(mcu: &Value, slave: bool) -> Result<Vec<Value>, String> {
    let mut list = Vec::new();
    for ch in rc::IIC_CHANNELS {
        let Some(p) = peripheral(mcu, &format!("IIC{ch}"))
            .filter(|p| enabled(Some(p)) && (p.get("mode") == Some(&json!("SLAVE"))) == slave)
        else {
            continue;
        };
        let kind = if slave { "slave" } else { "master" };
        let rate = or_else(p, "rate", json!("STANDARD"));
        let pclkb = clock(mcu, "pclkb")?;
        let timing = if slave {
            rc::iic_slave_clock(pclkb, Some(&rate))?
        } else {
            rc::iic_clock(pclkb, Some(&rate))?
        };
        list.push(object(vec![
            ("channel", json!(ch)),
            ("name", json!(format!("g_i2c_{kind}{ch}"))),
            ("rate", rate),
            (
                "slave",
                or(
                    p,
                    "slave",
                    json!(if slave { rc::IIC_SLAVE_ADDRESS } else { 0x50 }),
                ),
            ),
            (
                "callback",
                or_else(p, "callback", json!(format!("i2c_{kind}{ch}_callback"))),
            ),
            ("priority", or(p, "priority", json!(12))),
            ("clock", timing),
        ]));
    }
    Ok(list)
}
// Watchdog instances (r_wdt g_wdt0, r_iwdt g_iwdt0). No vector: an NMI goes through the BSP's NMI_Handler, which
// calls the driver's group-IRQ callback and so the user's.
fn wdts_of(mcu: &Value) -> Vec<Value> {
    let mut list = Vec::new();
    for id in ["WDT", "IWDT"] {
        let Some(given) = peripheral(mcu, id).filter(|p| enabled(Some(p))) else {
            continue;
        };
        let (_, _, timeout, divider) = rc::wdt_info(id).unwrap();
        let p = Value::Object(spread(
            &json!({"timeout": timeout, "clockDiv": divider}),
            given,
        ));
        let kind = lower(id);
        list.push(object(vec![
            ("id", json!(id)),
            ("kind", json!(kind)),
            ("name", json!(format!("g_{kind}0"))),
            ("ctrl", json!(format!("{kind}_instance_ctrl_t"))),
            ("api", json!(format!("g_wdt_on_{kind}"))),
            (
                "startMode",
                if id == "IWDT" {
                    json!("AUTO")
                } else {
                    or_else(&p, "startMode", json!("REGISTER"))
                },
            ),
            ("timeout", p["timeout"].clone()),
            ("clockDiv", p["clockDiv"].clone()),
            ("windowStart", or(&p, "windowStart", json!(100))),
            ("windowEnd", or(&p, "windowEnd", json!(0))),
            ("reset", or_else(&p, "reset", json!("RESET"))),
            (
                "stopInSleep",
                json!(p.get("stopInSleep").is_some_and(truthy)),
            ),
            ("callback", or_else(&p, "callback", json!(""))),
        ]));
    }
    list
}
/// `{...defaults, ...the stack's settings, name}` of a stack that is on.
fn stack_of(mcu: &Value, id: &str, defaults: Value, name: &str) -> Option<Map<String, Value>> {
    let p = peripheral(mcu, id).filter(|p| enabled(Some(p)))?;
    let mut q = spread(&defaults, p);
    q.insert("name".into(), json!(name));
    Some(q)
}
fn rtc_of(mcu: &Value) -> Option<Value> {
    stack_of(mcu, "RTC", rc::rtc_defaults(), "g_rtc0").map(Value::Object)
}
// Flash instance (r_flash_hp g_flash0) for the data flash. With Data Flash Background Operation the flash-ready and
// flash-error interrupts and the callback are generated; without it neither.
fn flash_of(mcu: &Value) -> Option<Value> {
    let mut q = stack_of(mcu, "FLASH", rc::flash_defaults(), "g_flash0")?;
    if !q.get("bgo").is_some_and(truthy) {
        q.insert("callback".into(), json!(""));
    }
    Some(Value::Object(q))
}
fn lpm_of(mcu: &Value) -> Option<Value> {
    stack_of(mcu, "LPM", rc::lpm_defaults(), "g_lpm0").map(Value::Object)
}
fn usb_of(mcu: &Value) -> Option<Value> {
    stack_of(mcu, "USB", rc::usb_defaults(), "g_basic0").map(Value::Object)
}
fn elc_of(mcu: &Value) -> Option<Value> {
    enabled(peripheral(mcu, "ELC")).then(|| json!({"name": "g_elc"}))
}
/// The event an ADC started by the ELC listens to.
fn elc_links(mcu: &Value) -> Value {
    match peripheral(mcu, "ADC0")
        .filter(|a| enabled(Some(a)) && a.get("trigger") == Some(&json!("ELC")))
    {
        Some(adc) => json!({"ADC0": or_else(adc, "elcEvent", json!("GPT1_COUNTER_OVERFLOW"))}),
        None => json!({}),
    }
}
// Transfer instances (r_dtc / r_dmac, g_transferN). A UART's transfer is set up again by r_sci_uart (R_SCI_UART_Open
// writes its mode, size and register address), as with RASC.
fn transfers_of(mcu: &Value) -> Vec<Value> {
    let Some(per) = mcu
        .get("peripherals")
        .filter(|p| truthy(p))
        .and_then(Value::as_object)
    else {
        return Vec::new();
    };
    let digits = |id: &str| {
        id.strip_prefix("TRANSFER")
            .filter(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()))
            .map(String::from)
    };
    let mut list: Vec<(f64, Value)> = Vec::new();
    for (id, p) in per {
        let Some(number) = digits(id).filter(|_| enabled(Some(p))) else {
            continue;
        };
        let mut q = spread(&rc::transfer_defaults(), p);
        let owner = per.iter().find(|(k, u)| {
            k.len() == 4
                && k.starts_with("SCI")
                && k.as_bytes()[3].is_ascii_digit()
                && enabled(Some(u))
                && !is_spi_mode(u)
                && (u.get("transferTx") == Some(&json!(id))
                    || u.get("transferRx") == Some(&json!(id)))
        });
        let own = owner.map(|(k, u)| (k.clone(), u.get("transferTx") == Some(&json!(id))));
        let dmac = q.get("driver") == Some(&json!("DMAC"));
        let callback = if dmac {
            q.get("callback")
                .filter(|c| truthy(c))
                .cloned()
                .unwrap_or(json!(""))
        } else {
            json!("")
        };
        let n: f64 = number.parse().unwrap_or(f64::NAN);
        q.insert("id".into(), json!(id));
        q.insert("n".into(), out(n));
        q.insert("name".into(), json!(format!("g_transfer{number}")));
        q.insert("callback".into(), callback);
        if let Some((uart, tx)) = &own {
            q.insert(
                "activation".into(),
                json!(format!("{uart}_{}", if *tx { "TXI" } else { "RXI" })),
            );
        } else if !q.contains_key("activation") {
            q.insert("activation".into(), Value::Null);
        }
        q.insert(
            "own".into(),
            own.map_or(Value::Null, |(uart, tx)| json!({"uart": uart, "tx": tx})),
        );
        list.push((n, Value::Object(q)));
    }
    list.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    list.into_iter().map(|(_, t)| t).collect()
}
// CAN (r_can g_can0 on R_CAN0, feature 40): normal mailbox mode (no FIFO), the clock PCLKB, four mailboxes and one
// mask.
fn can_of(mcu: &Value) -> Result<Option<Value>, String> {
    let Some(mut q) = stack_of(mcu, "CAN0", rc::can_defaults(), "g_can0") else {
        return Ok(None);
    };
    let timing = rc::can_timing(clock(mcu, "pclkb")?, to_num(q.get("bitrate")));
    q.insert("timing".into(), timing);
    Ok(Some(Value::Object(q)))
}
// SPI masters: r_spi on RSPI (g_spiN) and r_sci_spi on an SCI channel in simple SPI mode (g_sci_spiN). Both use
// spi_cfg_t with their own extended configuration; transfers end in the callback.
fn spis_of(mcu: &Value, sci: bool) -> Result<Vec<Value>, String> {
    let mut list = Vec::new();
    let channels: &[u32] = if sci {
        &rc::SCI_SPI_CHANNELS
    } else {
        &rc::SPI_CHANNELS
    };
    for ch in channels {
        let id = format!("{}{ch}", if sci { "SCI" } else { "SPI" });
        let Some(p) = peripheral(mcu, &id).filter(|p| enabled(Some(p)) && (!sci || is_spi_mode(p)))
        else {
            continue;
        };
        let name = if sci {
            format!("g_sci_spi{ch}")
        } else {
            format!("g_spi{ch}")
        };
        let bitrate = or(p, "bitrate", json!(1_000_000));
        let mut t = vec![
            ("channel", json!(ch)),
            ("name", json!(name)),
            ("bitrate", bitrate.clone()),
            ("cpol", or(p, "cpol", json!(0))),
            ("cpha", or(p, "cpha", json!(0))),
            ("bitOrder", or_else(p, "bitOrder", json!("MSB"))),
            ("priority", or(p, "priority", json!(12))),
            (
                "callback",
                or_else(
                    p,
                    "callback",
                    json!(format!(
                        "{}{ch}_callback",
                        if sci { "sci_spi" } else { "spi" }
                    )),
                ),
            ),
        ];
        let (pclka, rate, shown) = (
            clock(mcu, "pclka")?,
            to_num(Some(&bitrate)),
            show(Some(&bitrate)),
        );
        if sci {
            t.push(("div", rc::sci_spi_bitrate(pclka, rate, &shown)?));
        } else {
            t.push(("ssl", or_else(p, "ssl", json!("SSL0"))));
            t.push(("div", rc::spi_bitrate(pclka, rate, &shown)?));
        }
        list.push(object(t));
    }
    Ok(list)
}
/// The FSP instances hal_data.c defines for an RA configuration, as the built-in interpreter declares them.
pub fn instances(mcu: &Value) -> Result<Value, String> {
    if mcu.is_null() {
        return Err(BROKEN.into());
    }
    let list = |v: Vec<Value>| Value::Array(v);
    let one = |v: Option<Value>| v.unwrap_or(Value::Null);
    Ok(object(vec![
        ("irqs", list(irqs_of(mcu)?)),
        ("uarts", list(uarts_of(mcu))),
        ("gpts", list(gpts_of(mcu)?)),
        ("adc", one(adc_of(mcu)?)),
        ("agts", list(agts_of(mcu)?)),
        ("iics", list(iics_of(mcu, false)?)),
        ("spis", list(spis_of(mcu, false)?)),
        ("sciSpis", list(spis_of(mcu, true)?)),
        ("wdts", list(wdts_of(mcu))),
        ("rtc", one(rtc_of(mcu))),
        ("iicSlaves", list(iics_of(mcu, true)?)),
        ("lpm", one(lpm_of(mcu))),
        ("flash", one(flash_of(mcu))),
        ("elc", one(elc_of(mcu))),
        ("elcLinks", elc_links(mcu)),
        ("transfers", list(transfers_of(mcu))),
        ("usb", one(usb_of(mcu))),
        ("can", one(can_of(mcu)?)),
    ]))
}

// ---------- the text of each instance ----------

fn callback_or_null(t: &Value) -> String {
    t.get("callback")
        .filter(|c| truthy(c))
        .map_or("NULL".to_string(), |c| show(Some(c)))
}
fn has_callback(t: &Value) -> bool {
    t.get("callback").is_some_and(truthy)
}
/// `(priority)` when the stack has a callback, else the interrupt is off.
fn ipl(t: &Value) -> String {
    if has_callback(t) {
        format!("({})", text_of(t, "priority"))
    } else {
        "(BSP_IRQ_DISABLED)".into()
    }
}
/// The declaration with the callback's prototype when one is named.
fn decl(
    template: &str,
    prototype: &str,
    name: &str,
    t: &Value,
    more: &[(&'static str, String)],
) -> String {
    let callback = if has_callback(t) {
        fill(prototype, &[(name, t)], &[])
    } else {
        String::new()
    };
    let mut holes = vec![hole("#0", callback)];
    holes.extend(more.iter().cloned());
    fill(template, &[(name, t)], &holes)
}
fn unit_text(t: &Value) -> String {
    match t.get("unit").and_then(Value::as_str) {
        Some("Hz") => "Hz".into(),
        Some("kHz") => "kHz".into(),
        Some("s") => "seconds".into(),
        Some("ms") => "milliseconds".into(),
        Some("us") => "microseconds".into(),
        _ => "undefined".into(),
    }
}
fn four_irqs(template: &str, values: &[(&str, &Value)], more: &[(&'static str, String)]) -> String {
    ["RXI", "TXI", "TEI", "ERI"]
        .iter()
        .map(|k| {
            let mut holes = vec![hole("k", *k), hole("#0", lower(k)), hole("#1", lower(k))];
            holes.extend(more.iter().cloned());
            fill(template, values, &holes)
        })
        .collect::<Vec<_>>()
        .join("\n")
}
fn adc_instance(a: &Value) -> String {
    let v = |k: &str, name: &str| fill(T_ADC_INSTANCE_V, &[], &[hole("k", k), hole("name", name)]);
    let is = |key: &str, value: &str| a.get(key).and_then(Value::as_str) == Some(value);
    let channels: Vec<String> = a["channels"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|c| format!("ADC_MASK_CHANNEL_{}", show(Some(c))))
        .collect();
    fill(
        T_ADC_INSTANCE,
        &[("a", a)],
        &[
            hole(
                "#0",
                if is("trigger", "ELC") {
                    "ADC_START_SOURCE_ELC_AD0"
                } else {
                    "ADC_START_SOURCE_DISABLED"
                },
            ),
            hole("#1", v("WINDOW_A", "window_a_irq")),
            hole("#2", v("WINDOW_B", "window_b_irq")),
            hole(
                "#3",
                if is("mode", "CONTINUOUS") {
                    "ADC_MODE_CONTINUOUS_SCAN"
                } else {
                    "ADC_MODE_SINGLE_SCAN"
                },
            ),
            hole("#4", callback_or_null(a)),
            hole(
                "#5",
                if has_callback(a) {
                    v("SCAN_END", "scan_end_irq")
                } else {
                    "    .scan_end_irq        = FSP_INVALID_VECTOR,".into()
                },
            ),
            hole("#6", ipl(a)),
            hole("#7", channels.join(" | ")),
        ],
    )
}
fn agt_instance(t: &Value) -> Result<String, String> {
    let counts = t["counts"].get("counts");
    let half = there(counts)
        .and_then(rc::num)
        .map(|n| out((n / 2.0).floor()));
    Ok(fill(
        T_AGT_INSTANCE,
        &[("t", t)],
        &[
            hole("#0", unit_text(t)),
            hole("#1", format!("0x{}", base16(counts)?)),
            hole("#2", format!("0x{}", base16(half.as_ref())?)),
            hole("#3", callback_or_null(t)),
            hole("#4", ipl(t)),
        ],
    ))
}
fn rounded(v: Option<&Value>) -> String {
    js_number(js_round(to_num(v)))
}
fn iic_instance(t: &Value, slave: bool) -> Result<String, String> {
    let c = &t["clock"];
    let address = pad_start2(base16(t.get("slave"))?);
    let (template, each) = if slave {
        (T_IIC_SLAVE_INSTANCE, T_IIC_SLAVE_INSTANCE_V)
    } else {
        (T_IIC_INSTANCE, T_IIC_INSTANCE_V)
    };
    let irqs = four_irqs(each, &[("t", t)], &[]);
    let holes = if slave {
        vec![hole("#0", address), hole("#1", irqs)]
    } else {
        vec![
            hole("#0", rounded(c.get("actual"))),
            hole("#1", rounded(c.get("duty"))),
            hole("#2", address),
            hole("#3", irqs),
        ]
    };
    Ok(fill(template, &[("t", t), ("c", c)], &holes))
}
fn wdt_instance(w: &Value) -> String {
    fill(
        T_WDT_INSTANCE,
        &[("w", w)],
        &[
            hole(
                "#0",
                if w["stopInSleep"] == true {
                    "ENABLE"
                } else {
                    "DISABLE"
                },
            ),
            hole("#1", callback_or_null(w)),
        ],
    )
}
// RTC instance (r_rtc g_rtc0): calendar with the alarm, periodic and carry interrupts (rtc_alarm_periodic_isr serves
// the first two, rtc_carry_isr the carry, which R_RTC_CalendarTimeGet needs).
fn rtc_instance(t: &Value) -> String {
    let off = |key: &str| t.get(key).is_none_or(Value::is_null);
    let v = |k: &str, field: &str, key: &str| {
        let name = format!("{field:<24}");
        if off(key) {
            format!("    .{name}= FSP_INVALID_VECTOR,")
        } else {
            fill(T_RTC_INSTANCE_V, &[], &[hole("k", k), hole("name", name)])
        }
    };
    let level = |key: &str| {
        if off(key) {
            "(BSP_IRQ_DISABLED)".to_string()
        } else {
            format!("({})", text_of(t, key))
        }
    };
    fill(
        T_RTC_INSTANCE,
        &[("t", t)],
        &[
            hole(
                "#0",
                if t.get("clockSource") == Some(&json!("SUBCLOCK")) {
                    "RTC_CLOCK_SOURCE_SUBCLK"
                } else {
                    "RTC_CLOCK_SOURCE_LOCO"
                },
            ),
            hole("#1", callback_or_null(t)),
            hole("#2", level("alarmPriority")),
            hole("#3", level("periodicPriority")),
            hole("#4", level("carryPriority")),
            hole("#5", v("ALARM", "alarm_irq", "alarmPriority")),
            hole("#6", v("PERIOD", "periodic_irq", "periodicPriority")),
            hole("#7", v("CARRY", "carry_irq", "carryPriority")),
        ],
    )
}
fn flash_instance(t: &Value) -> String {
    let bgo = t.get("bgo").is_some_and(truthy);
    let v = |k: &str, field: &str| {
        let name = format!("{field:<20}");
        if bgo {
            fill(T_FLASH_INSTANCE_V, &[], &[hole("k", k), hole("name", name)])
        } else {
            format!("    .{name}= FSP_INVALID_VECTOR,")
        }
    };
    let level = |key: &str| {
        if bgo {
            format!("({})", text_of(t, key))
        } else {
            "(BSP_IRQ_DISABLED)".to_string()
        }
    };
    fill(
        T_FLASH_INSTANCE,
        &[("t", t)],
        &[
            hole("#0", if bgo { "true" } else { "false" }),
            hole("#1", callback_or_null(t)),
            hole("#2", v("FRDYI", "irq")),
            hole("#3", v("FIFERR", "err_irq")),
            hole("#4", level("errorPriority")),
            hole("#5", level("readyPriority")),
        ],
    )
}
// Low power modes instance (r_lpm g_lpm0), as RASC writes it for the RA6E1: the mode, the Software Standby wake
// sources (WUPEN), and the Deep Software Standby options (IOKEEP, DEEPCUT, the cancel sources and the edges of the
// pin sources). Snooze is not offered: its fields get the values RASC writes for "no snooze".
fn lpm_instance(t: &Value) -> Result<String, String> {
    let names = |key: &str| -> Result<Vec<String>, String> {
        t.get(key)
            .and_then(Value::as_array)
            .map(|a| a.iter().map(|x| show(Some(x))).collect())
            .ok_or_else(|| BROKEN.to_string())
    };
    let any = |mut items: Vec<String>, kind: &str| {
        items.push(format!("({kind}) 0"));
        items.join(" | ")
    };
    let (wake, cancel) = (names("wake")?, names("cancel")?);
    // `cancelRising.includes(name)`: of a list, or of a text (then a part of it counts).
    let rising_text = t.get("cancelRising").and_then(Value::as_str);
    // It is asked only for a pin source, so what it holds does not matter without one.
    let needed = rising_text.is_none() && cancel.iter().any(|s| s.starts_with("IRQ"));
    let rising = if needed {
        names("cancelRising")?
    } else {
        Vec::new()
    };
    let is_rising = |s: &String| {
        rising_text.map_or_else(|| rising.contains(s), |text| text.contains(s.as_str()))
    };
    let edges: Vec<String> = cancel
        .iter()
        .filter(|s| s.starts_with("IRQ"))
        .map(|s| {
            format!(
                "LPM_DEEP_STANDBY_CANCEL_SOURCE_{s}_{}",
                if is_rising(s) { "RISING" } else { "FALLING" }
            )
        })
        .collect();
    Ok(fill(
        T_LPM_INSTANCE,
        &[("t", t)],
        &[
            hole(
                "#0",
                any(
                    wake.iter()
                        .map(|s| format!("LPM_STANDBY_WAKE_SOURCE_{s}"))
                        .collect(),
                    "lpm_standby_wake_source_t",
                ),
            ),
            hole(
                "#1",
                if t.get("ioKeep").is_some_and(truthy) {
                    "LPM_IO_PORT_NO_CHANGE"
                } else {
                    "LPM_IO_PORT_RESET"
                },
            ),
            hole(
                "#2",
                any(
                    cancel
                        .iter()
                        .map(|s| format!("LPM_DEEP_STANDBY_CANCEL_SOURCE_{s}"))
                        .collect(),
                    "lpm_deep_standby_cancel_source_t",
                ),
            ),
            hole("#3", any(edges, "lpm_deep_standby_cancel_edge_t")),
        ],
    ))
}
// Event Link Controller (r_elc g_elc, feature 36): its link table g_elc_cfg in ra_gen/elc_data.c as RASC writes it
// (one entry per ELC_PERIPHERAL_*: the event an ADC started by the ELC listens to, else none).
fn elc_data(mcu: &Value) -> String {
    let links = elc_links(mcu);
    let lines: Vec<String> = rc::ELC_PERIPHERALS
        .iter()
        .map(|(k, _)| match links.get(*k).filter(|l| truthy(l)) {
            Some(event) => {
                let event = show(Some(event));
                format!(
                    "    .link[ELC_PERIPHERAL_{k}] = ELC_EVENT_{event}, /* {} */",
                    event.replace('_', " ")
                )
            }
            None => format!("    .link[ELC_PERIPHERAL_{k}] = ELC_EVENT_NONE, /* No allocation */"),
        })
        .collect();
    header("ELC source file") + &fill(T_ELC_DATA, &[], &[hole("#0", lines.join("\n"))])
}
fn is_dtc(t: &Value) -> bool {
    t.get("driver") == Some(&json!("DTC"))
}
fn transfer_info(t: &Value) -> String {
    // r_sci_uart overwrites a UART transfer's settings word and register address in R_SCI_UART_Open.
    let own = t.get("own").filter(|o| truthy(o));
    let of_uart = own.map(|o| {
        let tx = o.get("tx").is_some_and(truthy);
        json!({"mode": "NORMAL", "size": 1, "srcMode": if tx { "INCREMENTED" } else { "FIXED" }, "destMode": if tx { "FIXED" } else { "INCREMENTED" }, "repeatArea": "SOURCE", "irq": "END"})
    });
    let m = of_uart.as_ref().unwrap_or(t);
    let size = match show(m.get("size")).as_str() {
        "1" => "TRANSFER_SIZE_1_BYTE",
        "2" => "TRANSFER_SIZE_2_BYTE",
        "4" => "TRANSFER_SIZE_4_BYTE",
        _ => "undefined",
    };
    let count = |key: &str| {
        if own.is_some() {
            "0".to_string()
        } else {
            text_of(t, key)
        }
    };
    fill(
        T_TRANSFER_INFO,
        &[("t", t), ("m", m)],
        &[
            hole(
                "#0",
                if is_dtc(t) {
                    " DTC_TRANSFER_INFO_ALIGNMENT"
                } else {
                    ""
                },
            ),
            hole("#1", size),
            hole("#2", count("blocks")),
            hole("#3", count("length")),
        ],
    )
}
fn transfer_decl(t: &Value) -> String {
    let callback = if has_callback(t) {
        fill(T_TRANSFER_DECL_2, &[("t", t)], &[])
    } else {
        String::new()
    };
    fill(
        T_TRANSFER_DECL,
        &[("t", t)],
        &[
            hole("#0", if is_dtc(t) { "dtc" } else { "dmac" }),
            hole("#1", callback),
        ],
    )
}
fn transfer_instance(t: &Value) -> String {
    let ext = if is_dtc(t) {
        fill(T_TRANSFER_INSTANCE_EXT, &[("t", t)], &[])
    } else {
        let activation = text_of(t, "activation");
        fill(
            T_TRANSFER_INSTANCE_EXT_2,
            &[("t", t)],
            &[
                hole("#0", ipl(t)),
                hole("#1", callback_or_null(t)),
                hole(
                    "#2",
                    if activation == "SOFTWARE" {
                        "ELC_EVENT_NONE".to_string()
                    } else {
                        format!("ELC_EVENT_{activation}")
                    },
                ),
            ],
        )
    };
    fill(
        T_TRANSFER_INSTANCE,
        &[("t", t)],
        &[
            hole("ext", ext),
            hole("#0", if is_dtc(t) { "dtc" } else { "dmac" }),
            hole("#1", transfer_info(t)),
            hole("#2", if is_dtc(t) { "cfg_extend" } else { "extend" }),
            hole("#3", lower(&text_of(t, "driver"))),
        ],
    )
}
fn padded_irq(template: &str, k: &str, field: &str, width: usize) -> String {
    let name = format!("{field:<width$}");
    fill(
        template,
        &[],
        &[hole("k", k), hole("#0", name.clone()), hole("#1", name)],
    )
}
fn usb_instance(t: &Value) -> String {
    fill(
        T_USB_INSTANCE,
        &[("t", t)],
        &[
            hole("#0", padded_irq(T_USB_INSTANCE_V, "INT", "irq", 19)),
            hole("#1", padded_irq(T_USB_INSTANCE_V, "RESUME", "irq_r", 19)),
            hole("#2", callback_or_null(t)),
        ],
    )
}
/// PLL2 and UCLK settings that give the USB clock 48 MHz from the HOCO (`hoco_mhz` 16, 18 or 20): PLL2 input 8-24 MHz
/// and output 120-240 MHz, the UCLK dividers of bsp_clocks.h. PLL2 divider /2 first (the BSP default), then /1 and
/// /3; the largest multiplier.
pub fn usb_clock(hoco_mhz: f64) -> Option<(u32, u32, f64, f64)> {
    for div in [2u32, 1, 3] {
        for mul in (10..=30u32).rev() {
            let input = hoco_mhz / f64::from(div);
            let pll = input * f64::from(mul);
            let usb_div = pll / 48.0;
            if (8.0..=24.0).contains(&input)
                && (120.0..=240.0).contains(&pll)
                && [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 16.0].contains(&usb_div)
            {
                return Some((div, mul, pll, usb_div));
            }
        }
    }
    None
}
// r_can.c's Open reads mailbox_type of all 32 can_mailbox_t entries, so 32 are generated: entries 4-31 are transmit
// mailboxes with ID 0, which Open leaves cleared. It reads one mask a group of four mailboxes: entries 1-7 hold
// 0x1FFFFFFF (CAN_DEFAULT_MASK, "no mask"), never read.
fn can_instance(t: &Value) -> Result<String, String> {
    let extended = t.get("idMode") == Some(&json!("EXTENDED"));
    let id_mode = if extended {
        "CAN_ID_MODE_EXTENDED"
    } else {
        "CAN_ID_MODE_STANDARD"
    };
    let mailbox = |id: f64, receive: bool, i: usize| {
        fill(
            T_CAN_INSTANCE_MB,
            &[],
            &[
                hole("idMode", id_mode),
                hole("i", i.to_string()),
                hole("#0", hex(id, if extended { 8 } else { 3 })),
                hole(
                    "#1",
                    if receive {
                        "CAN_MAILBOX_RECEIVE"
                    } else {
                        "CAN_MAILBOX_TRANSMIT"
                    },
                ),
            ],
        )
    };
    let Some(boxes) = t.get("mailboxes").and_then(Value::as_array) else {
        return Err(BROKEN.into());
    };
    let mut lines: Vec<String> = Vec::new();
    for (i, m) in boxes.iter().enumerate() {
        if m.is_null() {
            return Err(BROKEN.into());
        }
        lines.push(mailbox(
            to_num(m.get("id")),
            m.get("type") == Some(&json!("RECEIVE")),
            i,
        ));
    }
    lines.extend((0..28).map(|i| mailbox(0.0, false, i + 4)));
    if t["timing"].is_null() {
        return Err(BROKEN.into());
    }
    Ok(fill(
        T_CAN_INSTANCE,
        &[("t", t)],
        &[
            hole("#0", hex(to_num(t.get("mask")), 8)),
            hole("#1", lines.join("\n")),
            hole(
                "#2",
                if extended {
                    "CAN_GLOBAL_ID_MODE_EXTENDED"
                } else {
                    "CAN_GLOBAL_ID_MODE_STANDARD"
                },
            ),
            hole("#3", padded_irq(T_CAN_INSTANCE_V, "ERROR", "error_irq", 12)),
            hole(
                "#4",
                padded_irq(T_CAN_INSTANCE_V, "MAILBOX_RX", "rx_irq", 12),
            ),
            hole(
                "#5",
                padded_irq(T_CAN_INSTANCE_V, "MAILBOX_TX", "tx_irq", 12),
            ),
        ],
    ))
}
/// OFS0 as bsp_mcu_ofs_cfg.h gives it to the BSP (bsp_linker.c places it at 0x0100A100).
fn ofs_cfg(mcu: &Value) -> String {
    let iwdt = enabled(peripheral(mcu, "IWDT"));
    let wdt = peripheral(mcu, "WDT")
        .is_some_and(|w| enabled(Some(w)) && w.get("startMode") == Some(&json!("AUTO")));
    header("configuration header file")
        + &fill(
            T_OFS_CFG,
            &[],
            &[
                hole(
                    "#0",
                    if iwdt {
                        "auto-start (IWDTSTRT = 0)"
                    } else {
                        "stopped"
                    },
                ),
                hole(
                    "#1",
                    if wdt {
                        "auto-start (WDTSTRT = 0)"
                    } else {
                        "register-start"
                    },
                ),
                hole("#2", hex(f64::from(rc::ofs0(mcu)), 8)),
            ],
        )
}
fn spi_cfg(t: &Value, event: &str, ext: String) -> String {
    let on = |key: &str| t.get(key).is_some_and(truthy);
    fill(
        T_SPI_CFG,
        &[("t", t)],
        &[
            hole("ext", ext),
            hole(
                "#0",
                four_irqs(T_SPI_CFG_V, &[("t", t)], &[hole("event", event)]),
            ),
            hole(
                "#1",
                if on("cpha") {
                    "SPI_CLK_PHASE_EDGE_EVEN"
                } else {
                    "SPI_CLK_PHASE_EDGE_ODD"
                },
            ),
            hole(
                "#2",
                if on("cpol") {
                    "SPI_CLK_POLARITY_HIGH"
                } else {
                    "SPI_CLK_POLARITY_LOW"
                },
            ),
            hole(
                "#3",
                if t.get("bitOrder") == Some(&json!("LSB")) {
                    "SPI_BIT_ORDER_LSB_FIRST"
                } else {
                    "SPI_BIT_ORDER_MSB_FIRST"
                },
            ),
            hole("#4", if event == "SPI" { "spi" } else { "sci" }),
        ],
    )
}
// RSPI: 4-wire SPI with SSL0 asserted by the peripheral, or clock synchronous (3-wire) when the program drives CS
// itself.
fn spi_instance(t: &Value, sci: bool) -> String {
    let name = text_of(t, "name");
    let actual = rounded(t["div"].get("actual"));
    if sci {
        fill(
            T_SCI_SPI_INSTANCE,
            &[("t", t)],
            &[
                hole("#0", actual),
                hole("#1", spi_cfg(t, "SCI", format!("{name}_cfg_extend"))),
            ],
        )
    } else {
        fill(
            T_SPI_INSTANCE,
            &[("t", t)],
            &[
                hole(
                    "#0",
                    if t.get("ssl") == Some(&json!("SSL0")) {
                        "SPI_SSL_MODE_SPI"
                    } else {
                        "SPI_SSL_MODE_CLK_SYN"
                    },
                ),
                hole("#1", actual),
                hole("#2", spi_cfg(t, "SPI", format!("{name}_ext_cfg"))),
            ],
        )
    }
}
fn gpt_decl(t: &Value) -> String {
    let text = decl(T_GPT_DECL, T_GPT_DECL_2, "t", t, &[]);
    text.strip_suffix('\n').map_or(text.clone(), String::from)
}
fn gpt_instance(t: &Value) -> Result<String, String> {
    let v = |k: &str, name: &str| {
        fill(
            T_GPT_INSTANCE_V,
            &[("t", t)],
            &[hole("k", k), hole("name", name)],
        )
    };
    let pwm = t.get("mode") == Some(&json!("PWM"));
    // `t.a && t.mode === 'PWM'` printed: the first one that is false, or the second.
    let output = |key: &str| {
        if t[key] == true {
            pwm.to_string()
        } else {
            show(t.get(key))
        }
    };
    let compares = [
        ("CAPTURE_COMPARE_A", "capture_a_irq"),
        ("CAPTURE_COMPARE_B", "capture_b_irq"),
        ("COMPARE_C", "compare_match_c_irq"),
        ("COMPARE_D", "compare_match_d_irq"),
        ("COMPARE_E", "compare_match_e_irq"),
        ("COMPARE_F", "compare_match_f_irq"),
    ];
    Ok(fill(
        T_GPT_INSTANCE,
        &[("t", t)],
        &[
            hole("#0", output("a")),
            hole("#1", output("b")),
            hole(
                "#2",
                compares
                    .iter()
                    .map(|(k, n)| v(k, n))
                    .collect::<Vec<_>>()
                    .join("\n"),
            ),
            hole(
                "#3",
                if pwm {
                    "TIMER_MODE_PWM"
                } else {
                    "TIMER_MODE_PERIODIC"
                },
            ),
            hole("#4", unit_text(t)),
            hole("#5", format!("0x{}", base16(t["counts"].get("counts"))?)),
            hole("#6", format!("0x{}", base16(t["counts"].get("duty"))?)),
            hole("#7", callback_or_null(t)),
            hole("#8", ipl(t)),
            hole("#9", v("COUNTER_OVERFLOW", "cycle_end_irq")),
        ],
    ))
}
/// PCLKA of an RA MCU configuration in Hz (the SCI clock).
pub fn pclka(mcu: &Value) -> Result<f64, String> {
    if mcu.is_null() {
        return Err(BROKEN.into());
    }
    clock(mcu, "pclka")
}
/// SCI asynchronous baud register settings closest to `baud` (CKS, BRR, ABCS, BGDM; no modulation), as RASC computes
/// them: (abcs, bgdm, cks, brr, error, actual).
pub fn sci_baud(
    pclk: f64,
    baud: f64,
    shown: &str,
) -> Result<(u32, u32, u32, f64, f64, f64), String> {
    let mut best: Option<(u32, u32, u32, f64, f64, f64)> = None;
    for (abcs, bgdm) in [(0u32, 1u32), (1, 1), (0, 0), (1, 0)] {
        for n in 0..4u32 {
            let c = f64::from(64u32 >> (abcs + bgdm));
            let scale = 2f64.powi(2 * n as i32 - 1);
            let count = js_round(pclk / (c * scale * baud)) - 1.0;
            if !(0.0..=255.0).contains(&count) && !count.is_nan() {
                continue;
            }
            let actual = pclk / (c * scale * (count + 1.0));
            let error = (actual - baud).abs() / baud * 100.0;
            if best.is_none_or(|b| error < b.4 - 1e-9) {
                best = Some((abcs, bgdm, n, count, error, actual));
            }
        }
    }
    best.ok_or_else(|| format!("{shown} bps: SCI로 만들 수 없는 통신 속도입니다."))
}
/// The interrupt slots the vector table allocates, in RASC order (first-come numbering from 0).
pub fn vectors(mcu: &Value) -> Result<Vec<Value>, String> {
    if mcu.is_null() {
        return Err(BROKEN.into());
    }
    let mut list: Vec<(String, String, String)> = Vec::new();
    let four = |list: &mut Vec<(String, String, String)>,
                isr: &str,
                unit: &str,
                t: &Value,
                labels: [&str; 4]| {
        for (kind, label) in ["RXI", "TXI", "TEI", "ERI"].iter().zip(labels) {
            let event = format!("{unit}{}_{kind}", text_of(t, "channel"));
            list.push((
                format!("{isr}_{}_isr", lower(kind)),
                event.clone(),
                format!("{unit}{} {kind} ({label})", text_of(t, "channel")),
            ));
        }
    };
    const SCI: [&str; 4] = [
        "Receive data full",
        "Transmit data empty",
        "Transmit end",
        "Receive error",
    ];
    const IIC: [&str; 4] = [
        "Receive data full",
        "Transmit data empty",
        "Transmit end",
        "Transfer error",
    ];
    for u in uarts_of(mcu) {
        four(&mut list, "sci_uart", "SCI", &u, SCI);
    }
    for irq in irqs_of(mcu)? {
        let ch = text_of(&irq, "channel");
        list.push((
            "r_icu_isr".into(),
            format!("ICU_IRQ{ch}"),
            format!("ICU IRQ{ch} (External pin interrupt {ch})"),
        ));
    }
    if adc_of(mcu)?.is_some_and(|a| has_callback(&a)) {
        list.push((
            "adc_scan_end_isr".into(),
            "ADC0_SCAN_END".into(),
            "ADC0 SCAN END (End of A/D scanning operation)".into(),
        ));
    }
    for t in iics_of(mcu, false)? {
        four(&mut list, "iic_master", "IIC", &t, IIC);
    }
    for t in agts_of(mcu)?.iter().filter(|t| has_callback(t)) {
        let ch = text_of(t, "channel");
        list.push((
            "agt_int_isr".into(),
            format!("AGT{ch}_INT"),
            format!("AGT{ch} INT (AGT interrupt)"),
        ));
    }
    for t in gpts_of(mcu)?.iter().filter(|t| has_callback(t)) {
        let ch = text_of(t, "channel");
        list.push((
            "gpt_counter_overflow_isr".into(),
            format!("GPT{ch}_COUNTER_OVERFLOW"),
            format!("GPT{ch} COUNTER OVERFLOW (Overflow)"),
        ));
    }
    // Modules added after the first set go last, so the slots of existing projects keep their numbers.
    for t in spis_of(mcu, false)? {
        four(
            &mut list,
            "spi",
            "SPI",
            &t,
            [
                "Receive buffer full",
                "Transmit buffer empty",
                "Transmission complete event",
                "Error",
            ],
        );
    }
    for t in spis_of(mcu, true)? {
        four(&mut list, "sci_spi", "SCI", &t, SCI);
    }
    if let Some(rtc) = rtc_of(mcu) {
        for (k, isr, label, key) in [
            (
                "ALARM",
                "rtc_alarm_periodic_isr",
                "Alarm interrupt",
                "alarmPriority",
            ),
            (
                "PERIOD",
                "rtc_alarm_periodic_isr",
                "Periodic interrupt",
                "periodicPriority",
            ),
            ("CARRY", "rtc_carry_isr", "Carry interrupt", "carryPriority"),
        ] {
            if rtc.get(key).is_some_and(|p| !p.is_null()) {
                list.push((isr.into(), format!("RTC_{k}"), format!("RTC {k} ({label})")));
            }
        }
    }
    // I2C slave (r_iic_slave): the channel's four IIC events with the slave driver's ISRs (no wakeup vector).
    for t in iics_of(mcu, true)? {
        four(&mut list, "iic_slave", "IIC", &t, IIC);
    }
    // Flash (r_flash_hp) with background operation: flash ready first, then the access error.
    if flash_of(mcu).is_some_and(|f| f.get("bgo").is_some_and(truthy)) {
        for (k, label) in [
            ("FRDYI", "Flash ready interrupt"),
            ("FIFERR", "Flash access error interrupt"),
        ] {
            list.push((
                format!("fcu_{}_isr", lower(k)),
                format!("FCU_{k}"),
                format!("FCU {k} ({label})"),
            ));
        }
    }
    // DMAC channels with a callback: the transfer end interrupt, in transfer-instance order.
    for t in transfers_of(mcu)
        .iter()
        .filter(|t| !is_dtc(t) && t.get("driver") == Some(&json!("DMAC")) && has_callback(t))
    {
        let ch = text_of(t, "channel");
        list.push((
            "dmac_int_isr".into(),
            format!("DMAC{ch}_INT"),
            format!("DMAC{ch} INT (DMAC{ch} transfer end)"),
        ));
    }
    // USB PCDC (feature 41) and CAN (feature 40), appended so the slots above keep their numbers.
    if usb_of(mcu).is_some() {
        for (k, isr, label) in [
            ("INT", "usbfs_interrupt_handler", "USBFS interrupt"),
            ("RESUME", "usbfs_resume_handler", "USBFS resume interrupt"),
        ] {
            list.push((
                isr.into(),
                format!("USBFS_{k}"),
                format!("USBFS {k} ({label})"),
            ));
        }
    }
    if can_of(mcu)?.is_some() {
        for (k, isr, label) in [
            ("ERROR", "can_error_isr", "Error interrupt"),
            ("MAILBOX_RX", "can_rx_isr", "Reception complete interrupt"),
            (
                "MAILBOX_TX",
                "can_tx_isr",
                "Transmission complete interrupt",
            ),
        ] {
            list.push((
                isr.into(),
                format!("CAN0_{k}"),
                format!("CAN0 {k} ({label})"),
            ));
        }
    }
    Ok(list.into_iter().enumerate().map(|(i, (isr, event, label))| json!({"isr": isr, "event": event, "label": label, "vector": event, "index": i})).collect())
}

// ---------- the files ----------

fn clock_cfg(c: &Value, mcu: &Value) -> String {
    // With the USB stack (feature 41) PLL2 runs from the HOCO and is the USB clock (UCLK 48 MHz); without it the
    // lines are as before.
    let usb = if usb_of(mcu).is_some() {
        usb_clock(to_num(c.get("hocoMHz")))
    } else {
        None
    };
    let hoco = match show(c.get("hocoMHz")).as_str() {
        "16" => "0",
        "18" => "1",
        "20" => "2",
        _ => "undefined",
    };
    let pll2 = match usb {
        Some((div, mul, _, _)) => fill(
            T_CLOCK_CFG_2,
            &[],
            &[
                hole("usb.pllDiv", div.to_string()),
                hole("usb.pllMul", mul.to_string()),
                hole("#0", format!("BSP_CLOCKS_PLL_DIV_{div}")),
            ],
        ),
        None => T_CLOCK_CFG_3.to_string(),
    };
    let usb_div = usb.map_or("5".to_string(), |u| js_number(u.3));
    let sub_clock = peripheral(mcu, "RTC")
        .is_some_and(|r| enabled(Some(r)) && r.get("clockSource") == Some(&json!("SUBCLOCK")));
    header("configuration header file")
        + &fill(
            T_CLOCK_CFG,
            &[("c", c)],
            &[
                hole("#0", hoco),
                hole("#1", pll2),
                hole(
                    "#2",
                    if usb.is_some() {
                        "#define BSP_CFG_UCLK_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_PLL2) /* UCLK Src: PLL2 */"
                    } else {
                        "#define BSP_CFG_UCLK_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* UCLK Disabled */"
                    },
                ),
                hole("#3", usb_div.clone()),
                hole("#4", usb_div),
                hole("#5", if sub_clock { T_CLOCK_CFG_4 } else { "" }),
            ],
        )
}
fn bsp_cfg(mcu: &Value) -> Result<String, String> {
    let size = |key: &str| {
        base16(Some(
            &mcu.get("bsp")
                .and_then(|b| b.get(key))
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or(json!(0x400)),
        ))
    };
    Ok(header("configuration header file")
        + &fill(
            T_BSP_CFG,
            &[],
            &[
                hole(
                    "#0",
                    if enabled(peripheral(mcu, "RTC")) {
                        "1"
                    } else {
                        "0"
                    },
                ),
                hole("#1", size("stackBytes")?),
                hole("#2", size("heapBytes")?),
            ],
        ))
}
fn pin_cfg_h(mcu: &Value) -> Result<String, String> {
    let mut labels: Vec<String> = Vec::new();
    for (pin, p) in pins(mcu) {
        if p.is_null() {
            return Err(BROKEN.into());
        }
        if let Some(label) = p.get("label").filter(|l| truthy(l)) {
            labels.push(format!(
                "#define {} ({})",
                show(Some(label)),
                io_name(Some(&json!(pin)))?
            ));
        }
    }
    Ok(header("configuration header file")
        + &fill(
            T_PIN_CFG_H,
            &[],
            &[
                hole("#0", labels.join("\n")),
                hole("#1", if labels.is_empty() { "" } else { "\n" }),
            ],
        ))
}
fn pin_data(mcu: &Value) -> Result<String, String> {
    let mut list: Vec<(String, &String, &Value)> = pins(mcu)
        .map(|(pin, p)| (rc::pin_name(Some(&json!(pin))), pin, p))
        .collect();
    list.sort_by(|a, b| a.0.cmp(&b.0));
    let mut lines: Vec<String> = Vec::new();
    for (_, pin, p) in list {
        let mut named = p.as_object().cloned().unwrap_or_default();
        named.insert("name".into(), json!(pin));
        lines.push(fill(
            T_PIN_DATA_2,
            &[],
            &[
                hole("#0", io_name(Some(&json!(pin)))?),
                hole("#1", pin_cfg_word(Some(&Value::Object(named)))?),
            ],
        ));
    }
    Ok(header("pin source file") + &fill(T_PIN_DATA, &[], &[hole("#0", lines.join("\n"))]))
}
fn vector_h(list: &[Value]) -> String {
    let mut isrs: Vec<String> = Vec::new();
    for v in list {
        let isr = text_of(v, "isr");
        if !isrs.contains(&isr) {
            isrs.push(isr);
        }
    }
    let entries: Vec<String> = list
        .iter()
        .map(|v| fill(T_VECTOR_H_2, &[("v", v)], &[]))
        .collect();
    header("vector header file")
        + &fill(
            T_VECTOR_H,
            &[],
            &[
                hole("vectors.length", list.len().to_string()),
                hole("#0", list.len().max(1).to_string()),
                hole(
                    "#1",
                    isrs.iter()
                        .map(|f| format!("void {f}(void);"))
                        .collect::<Vec<_>>()
                        .join("\n"),
                ),
                hole("#2", entries.join("\n")),
            ],
        )
}
fn vector_c(list: &[Value]) -> String {
    let table: Vec<String> = list
        .iter()
        .enumerate()
        .map(|(i, v)| {
            format!(
                "    [{i}] = {}, /* {} */",
                text_of(v, "isr"),
                text_of(v, "label")
            )
        })
        .collect();
    let events: Vec<String> = list
        .iter()
        .enumerate()
        .map(|(i, v)| {
            format!(
                "    [{i}] = BSP_PRV_VECT_ENUM(EVENT_{},GROUP{}), /* {} */",
                text_of(v, "event"),
                i % 8,
                text_of(v, "label")
            )
        })
        .collect();
    header("vector source file")
        + &fill(
            T_VECTOR_C,
            &[],
            &[hole("#0", table.join("\n")), hole("#1", events.join("\n"))],
        )
}
fn hal_data_h(mcu: &Value) -> Result<String, String> {
    let (irqs, uarts) = (irqs_of(mcu)?, uarts_of(mcu));
    let (gpts, adc, iics, agts) = (
        gpts_of(mcu)?,
        adc_of(mcu)?,
        iics_of(mcu, false)?,
        agts_of(mcu)?,
    );
    let (spis, sci_spis, wdts, rtc, slaves) = (
        spis_of(mcu, false)?,
        spis_of(mcu, true)?,
        wdts_of(mcu),
        rtc_of(mcu),
        iics_of(mcu, true)?,
    );
    let (lpm, flash, transfers, elc, usb, can) = (
        lpm_of(mcu),
        flash_of(mcu),
        transfers_of(mcu),
        elc_of(mcu),
        usb_of(mcu),
        can_of(mcu)?,
    );
    let mut includes = String::new();
    let mut include = |on: bool, text: &str| {
        if on {
            includes.push_str(text);
        }
    };
    include(
        !irqs.is_empty(),
        "#include \"r_icu.h\"\n#include \"r_external_irq_api.h\"\n",
    );
    include(
        !uarts.is_empty(),
        "#include \"r_sci_uart.h\"\n#include \"r_uart_api.h\"\n",
    );
    include(
        !gpts.is_empty(),
        "#include \"r_gpt.h\"\n#include \"r_timer_api.h\"\n",
    );
    include(
        adc.is_some(),
        "#include \"r_adc.h\"\n#include \"r_adc_api.h\"\n",
    );
    include(
        !iics.is_empty(),
        "#include \"r_iic_master.h\"\n#include \"r_i2c_master_api.h\"\n",
    );
    include(!agts.is_empty(), "#include \"r_agt.h\"\n");
    include(
        !agts.is_empty() && gpts.is_empty(),
        "#include \"r_timer_api.h\"\n",
    );
    include(!spis.is_empty(), "#include \"r_spi.h\"\n");
    include(!sci_spis.is_empty(), "#include \"r_sci_spi.h\"\n");
    include(
        !spis.is_empty() || !sci_spis.is_empty(),
        "#include \"r_spi_api.h\"\n",
    );
    for w in &wdts {
        include(true, &fill(T_HAL_DATA_H_INCLUDES, &[("w", w)], &[]));
    }
    include(!wdts.is_empty(), "#include \"r_wdt_api.h\"\n");
    include(
        rtc.is_some(),
        "#include \"r_rtc.h\"\n#include \"r_rtc_api.h\"\n",
    );
    include(
        !slaves.is_empty(),
        "#include \"r_iic_slave.h\"\n#include \"r_i2c_slave_api.h\"\n",
    );
    include(
        lpm.is_some(),
        "#include \"r_lpm.h\"\n#include \"r_lpm_api.h\"\n",
    );
    include(
        flash.is_some(),
        "#include \"r_flash_hp.h\"\n#include \"r_flash_api.h\"\n",
    );
    include(transfers.iter().any(is_dtc), "#include \"r_dtc.h\"\n");
    include(
        transfers
            .iter()
            .any(|t| t.get("driver") == Some(&json!("DMAC"))),
        "#include \"r_dmac.h\"\n",
    );
    include(!transfers.is_empty(), "#include \"r_transfer_api.h\"\n");
    include(
        elc.is_some(),
        "#include \"r_elc.h\"\n#include \"r_elc_api.h\"\n",
    );
    include(usb.is_some(), "#include \"r_usb_basic.h\"\n#include \"r_usb_basic_api.h\"\n#include \"r_usb_pcdc_api.h\"\n");
    include(
        can.is_some(),
        "#include \"r_can.h\"\n#include \"r_can_api.h\"\n",
    );
    let mut decls: Vec<String> = transfers.iter().map(transfer_decl).collect();
    decls.extend(
        irqs.iter()
            .map(|i| fill(T_HAL_DATA_H_DECLS, &[("i", i)], &[])),
    );
    decls.extend(
        uarts
            .iter()
            .map(|u| fill(T_HAL_DATA_H_DECLS_2, &[("u", u)], &[])),
    );
    decls.extend(gpts.iter().map(gpt_decl));
    decls.extend(
        adc.iter()
            .map(|a| decl(T_ADC_DECL, T_ADC_DECL_2, "a", a, &[])),
    );
    decls.extend(
        agts.iter()
            .map(|t| decl(T_AGT_DECL, T_AGT_DECL_2, "t", t, &[])),
    );
    decls.extend(iics.iter().map(|t| fill(T_IIC_DECL, &[("t", t)], &[])));
    decls.extend(spis.iter().map(|t| {
        fill(
            T_SPI_DECL,
            &[("t", t)],
            &[hole("kind", "SPI"), hole("ctrl", "spi_instance_ctrl_t")],
        )
    }));
    decls.extend(sci_spis.iter().map(|t| {
        fill(
            T_SPI_DECL,
            &[("t", t)],
            &[hole("kind", "SCI"), hole("ctrl", "sci_spi_instance_ctrl_t")],
        )
    }));
    decls.extend(
        wdts.iter()
            .map(|w| decl(T_WDT_DECL, T_WDT_DECL_2, "w", w, &[])),
    );
    decls.extend(
        rtc.iter()
            .map(|t| decl(T_RTC_DECL, T_RTC_DECL_2, "t", t, &[])),
    );
    decls.extend(
        slaves
            .iter()
            .map(|t| fill(T_IIC_SLAVE_DECL, &[("t", t)], &[])),
    );
    decls.extend(lpm.iter().map(|t| fill(T_LPM_DECL, &[("t", t)], &[])));
    decls.extend(
        flash
            .iter()
            .map(|t| decl(T_FLASH_DECL, T_FLASH_DECL_2, "t", t, &[])),
    );
    decls.extend(elc.iter().map(|_| T_ELC_DECL.to_string()));
    decls.extend(
        usb.iter()
            .map(|t| decl(T_USB_DECL, T_USB_DECL_2, "t", t, &[])),
    );
    decls.extend(can.iter().map(|t| fill(T_CAN_DECL, &[("t", t)], &[])));
    let decls = decls.join("\n");
    let gap = if decls.is_empty() { "" } else { "\n" };
    Ok(header("HAL header file")
        + &fill(
            T_HAL_DATA_H,
            &[],
            &[
                hole("includes", includes),
                hole("#0", gap),
                hole("decls", decls),
            ],
        ))
}
fn hal_data_c(mcu: &Value) -> Result<String, String> {
    let irqs = irqs_of(mcu)?;
    let transfers = transfers_of(mcu);
    // `t.driver.toLowerCase()`: a driver that is not a text stopped the JavaScript here.
    if transfers
        .iter()
        .any(|t| !t.get("driver").is_some_and(Value::is_string))
    {
        return Err(BROKEN.into());
    }
    let mut body: Vec<String> = transfers.iter().map(transfer_instance).collect();
    for i in &irqs {
        let trigger = match i.get("trigger").and_then(Value::as_str) {
            Some("RISING") => "EXTERNAL_IRQ_TRIGGER_RISING",
            Some("BOTH") => "EXTERNAL_IRQ_TRIGGER_BOTH_EDGE",
            Some("LOW") => "EXTERNAL_IRQ_TRIGGER_LEVEL_LOW",
            _ => "EXTERNAL_IRQ_TRIGGER_FALLING",
        };
        body.push(fill(
            T_HAL_DATA_C_BODY,
            &[("i", i)],
            &[
                hole("#0", trigger),
                hole("#1", if i["filter"] == true { "true" } else { "false" }),
            ],
        ));
    }
    for u in uarts_of(mcu) {
        let (abcs, bgdm, cks, brr, error, _) =
            sci_baud(pclka(mcu)?, to_num(u.get("baud")), &text_of(&u, "baud"))?;
        let b = json!({"abcs": abcs, "bgdm": bgdm, "cks": cks, "brr": out(brr)});
        // `u.transferTx.slice(8)`: of a text, or of a list (then joined).
        let mut refs = Vec::new();
        for key in ["transferTx", "transferRx"] {
            refs.push(match u.get(key).filter(|t| truthy(t)) {
                Some(Value::String(t)) => {
                    format!("&g_transfer{}", t.chars().skip(8).collect::<String>())
                }
                Some(Value::Array(items)) => format!(
                    "&g_transfer{}",
                    show(Some(&Value::Array(items.iter().skip(8).cloned().collect())))
                ),
                Some(_) => return Err(BROKEN.into()),
                None => "NULL".to_string(),
            });
        }
        body.push(fill(
            T_HAL_DATA_C_BODY_2,
            &[("u", &u), ("b", &b)],
            &[
                hole("#0", rc::to_fixed3(error)),
                hole("#1", refs[0].clone()),
                hole("#2", refs[1].clone()),
                hole("#3", four_irqs(T_HAL_DATA_C_BODY_IRQ, &[("u", &u)], &[])),
            ],
        ));
    }
    for t in gpts_of(mcu)? {
        body.push(gpt_instance(&t)?);
    }
    body.extend(adc_of(mcu)?.iter().map(adc_instance));
    for t in agts_of(mcu)? {
        body.push(agt_instance(&t)?);
    }
    for t in iics_of(mcu, false)? {
        body.push(iic_instance(&t, false)?);
    }
    body.extend(spis_of(mcu, false)?.iter().map(|t| spi_instance(t, false)));
    body.extend(spis_of(mcu, true)?.iter().map(|t| spi_instance(t, true)));
    body.extend(wdts_of(mcu).iter().map(wdt_instance));
    body.extend(rtc_of(mcu).iter().map(rtc_instance));
    for t in iics_of(mcu, true)? {
        body.push(iic_instance(&t, true)?);
    }
    if let Some(t) = lpm_of(mcu) {
        body.push(lpm_instance(&t)?);
    }
    body.extend(flash_of(mcu).iter().map(flash_instance));
    body.extend(elc_of(mcu).iter().map(|_| T_ELC_INSTANCE.to_string()));
    body.extend(usb_of(mcu).iter().map(usb_instance));
    if let Some(t) = can_of(mcu)? {
        body.push(can_instance(&t)?);
    }
    let body = body.join("\n");
    let gap = if body.is_empty() { "" } else { "\n" };
    Ok(
        header("HAL source file")
            + &fill(T_HAL_DATA_C, &[], &[hole("#0", gap), hole("body", body)]),
    )
}
const KB: f64 = 1024.0;
const FLASH_KB: f64 = 1024.0;
const RAM_KB: f64 = 256.0;
const DATA_FLASH_KB: f64 = 8.0;
fn module_cfg(guard: &str, macros: &[String]) -> String {
    header("configuration header file")
        + &fill(
            T_GENERATE_RA_FILES_MODULE_CFG,
            &[],
            &[hole("guard", guard), hole("#0", macros.join("\n"))],
        )
}

/// Every generated file of an RA project, as {path: text} (paths relative to the build folder).
pub fn generate_files(mcu: &Value, fsp_board: bool) -> Result<Value, String> {
    if mcu.is_null() {
        return Err(BROKEN.into());
    }
    rc::family_check(mcu.get("family"))?;
    let slots = vectors(mcu)?;
    let fam = &rc::tables()["RA_FAMILIES"][rc::FAMILY_ID];
    let c = Value::Object(spread(
        &fam["clock"],
        mcu.get("clock")
            .filter(|c| truthy(c))
            .unwrap_or(&Value::Null),
    ));
    let mut files = Map::new();
    let mut cfg = |name: &str, text: String| {
        files.insert(format!("ra_cfg/fsp_cfg/{name}"), json!(text));
    };
    let check = "(BSP_CFG_PARAM_CHECKING_ENABLE)";
    let module = |guard: &str, prefix: &str, more: &[&str]| {
        let mut macros = vec![format!(
            "#define {prefix}_CFG_PARAM_CHECKING_ENABLE {check}"
        )];
        macros.extend(more.iter().map(|m| (*m).to_string()));
        module_cfg(guard, &macros)
    };
    let per = |id: &str| peripheral(mcu, id).filter(|p| enabled(Some(p)));
    cfg("bsp/bsp_cfg.h", bsp_cfg(mcu)?);
    cfg(
        "bsp/bsp_mcu_device_cfg.h",
        header("configuration header file") + &fill(T_GENERATE_RA_FILES, &[("fam", fam)], &[]),
    );
    cfg(
        "bsp/bsp_mcu_device_pn_cfg.h",
        header("configuration header file")
            + &fill(
                T_GENERATE_RA_FILES_2,
                &[("fam", fam)],
                &[
                    hole("#0", js_number(FLASH_KB * KB)),
                    hole("#1", js_number(RAM_KB * KB)),
                    hole("#2", js_number(DATA_FLASH_KB * KB)),
                ],
            ),
    );
    cfg(
        "bsp/bsp_mcu_family_cfg.h",
        header("configuration header file")
            + &fill(
                T_FAMILY_CFG,
                &[("fam", fam)],
                &[hole("#0", js_number(16.0 + to_num(fam.get("ielsr"))))],
            ),
    );
    cfg("bsp/bsp_mcu_ofs_cfg.h", ofs_cfg(mcu));
    cfg("bsp/bsp_pin_cfg.h", pin_cfg_h(mcu)?);
    cfg(
        "bsp/board_cfg.h",
        header("configuration header file")
            + &fill(
                T_GENERATE_RA_FILES_3,
                &[],
                &[hole("#0", if fsp_board { "board.h" } else { "bsp_api.h" })],
            ),
    );
    cfg("r_ioport_cfg.h", module("R_IOPORT_CFG_H_", "IOPORT", &[]));
    cfg("r_icu_cfg.h", module("R_ICU_CFG_H_", "ICU", &[]));
    cfg(
        "r_iic_master_cfg.h",
        module(
            "R_IIC_MASTER_CFG_H_",
            "IIC_MASTER",
            &[
                "#define IIC_MASTER_CFG_DTC_ENABLE (0)",
                "#define IIC_MASTER_CFG_ADDR_MODE_10_BIT_ENABLE (0)",
            ],
        ),
    );
    cfg(
        "r_iic_slave_cfg.h",
        module(
            "R_IIC_SLAVE_CFG_H_",
            "IIC_SLAVE",
            &["#define IIC_SLAVE_CFG_DTC_ENABLE (0)"],
        ),
    );
    cfg(
        "r_agt_cfg.h",
        module(
            "R_AGT_CFG_H_",
            "AGT",
            &[
                "#define AGT_CFG_OUTPUT_SUPPORT_ENABLE (0)",
                "#define AGT_CFG_INPUT_SUPPORT_ENABLE (0)",
            ],
        ),
    );
    cfg("r_adc_cfg.h", module("R_ADC_CFG_H_", "ADC", &[]));
    cfg(
        "r_gpt_cfg.h",
        module(
            "R_GPT_CFG_H_",
            "GPT",
            &[
                "#define GPT_CFG_OUTPUT_SUPPORT_ENABLE (1)",
                "#define GPT_CFG_WRITE_PROTECT_ENABLE (0)",
                "#define GPT_CFG_GPTCLK_BYPASS (0)",
            ],
        ),
    );
    cfg(
        "r_spi_cfg.h",
        module(
            "R_SPI_CFG_H_",
            "SPI",
            &[
                "#define SPI_DMA_SUPPORT_ENABLE (0)",
                "#define SPI_TRANSMIT_FROM_RXI_ISR (0)",
                "/* DEPRECATED: Use SPI_DMA_SUPPORT_ENABLE instead. */",
                "#define SPI_DTC_SUPPORT_ENABLE (SPI_DMA_SUPPORT_ENABLE)",
            ],
        ),
    );
    cfg(
        "r_sci_spi_cfg.h",
        module(
            "R_SCI_SPI_CFG_H_",
            "SCI_SPI",
            &["#define SCI_SPI_DTC_SUPPORT_ENABLE (0)"],
        ),
    );
    // RTC_CFG_OPEN_SET_CLOCK_SOURCE: RASC's "Set Source Clock in Open" — off for the start time "PC 시각" (the
    // default, also when `start` is absent), on for "시뮬레이션" and without the RTC stack.
    let host_time = per("RTC").is_some_and(|r| r.get("start") != Some(&json!("SIMULATION")));
    cfg(
        "r_rtc_cfg.h",
        module(
            "R_RTC_CFG_H_",
            "RTC",
            &[&format!(
                "#define RTC_CFG_OPEN_SET_CLOCK_SOURCE ({})",
                if host_time { 0 } else { 1 }
            )],
        ),
    );
    // r_flash_hp for the data flash only: code flash programming is not in the build.
    cfg(
        "r_flash_hp_cfg.h",
        module(
            "R_FLASH_HP_CFG_H_",
            "FLASH_HP",
            &[
                "#define FLASH_HP_CFG_CODE_FLASH_PROGRAMMING_ENABLE (0)",
                "#define FLASH_HP_CFG_DATA_FLASH_PROGRAMMING_ENABLE (1)",
            ],
        ),
    );
    let wdt_nmi = per("WDT").is_some_and(|w| w.get("reset") == Some(&json!("NMI")));
    cfg(
        "r_wdt_cfg.h",
        module(
            "R_WDT_CFG_H_",
            "WDT",
            &[&format!(
                "#define WDT_CFG_REGISTER_START_NMI_SUPPORTED ({})",
                u8::from(wdt_nmi)
            )],
        ),
    );
    // LPM_CFG_STANDBY_LIMIT 0 (RASC's default): R_LPM_Open leaves SBYCR.SSBY set for a standby mode, so a bare
    // __WFI() enters it too.
    cfg(
        "r_lpm_cfg.h",
        module(
            "R_LPM_CFG_H_",
            "LPM",
            &["#define LPM_CFG_STANDBY_LIMIT (0)"],
        ),
    );
    cfg(
        "r_iwdt_cfg.h",
        module(
            "R_IWDT_CFG_H_",
            "IWDT",
            &["#define IWDT_CFG_REGISTER_START_NMI_SUPPORTED (0)"],
        ),
    );
    let uart_dtc = uarts_of(mcu)
        .iter()
        .any(|u| u["transferTx"] != "" || u["transferRx"] != "");
    cfg(
        "r_sci_uart_cfg.h",
        module(
            "R_SCI_UART_CFG_H_",
            "SCI_UART",
            &[
                "#define SCI_UART_CFG_FIFO_SUPPORT (0)",
                &format!(
                    "#define SCI_UART_CFG_DTC_SUPPORTED ({})",
                    u8::from(uart_dtc)
                ),
                "#define SCI_UART_CFG_FLOW_CONTROL_SUPPORT (0)",
                "#define SCI_UART_CFG_RS485_SUPPORT (0)",
                "#define SCI_UART_CFG_IRDA_SUPPORT (0)",
            ],
        ),
    );
    // Feature 36: the DTC vector table goes in its own 1 KB-aligned RAM section (fsp.ld), as RASC's r_dtc_cfg.h
    // names it.
    cfg(
        "r_dtc_cfg.h",
        module(
            "R_DTC_CFG_H_",
            "DTC",
            &["#define DTC_CFG_VECTOR_TABLE_SECTION_NAME \".fsp_dtc_vector_table\""],
        ),
    );
    cfg("r_dmac_cfg.h", module("R_DMAC_CFG_H_", "DMAC", &[]));
    cfg("r_elc_cfg.h", module("R_ELC_CFG_H_", "ELC", &[]));
    if elc_of(mcu).is_some() {
        // `links[k].replace(...)`: an event that is not a text stopped the JavaScript here.
        if elc_links(mcu).get("ADC0").is_some_and(|e| !e.is_string()) {
            return Err(BROKEN.into());
        }
        files.insert("ra_gen/elc_data.c".into(), json!(elc_data(mcu)));
    }
    let mut cfg = |name: &str, text: String| {
        files.insert(format!("ra_cfg/fsp_cfg/{name}"), json!(text));
    };
    // USB PCDC (feature 41): FSP has no r_usb_basic_cfg.h / r_usb_pcdc_cfg.h; these are the USB_CFG_* values the
    // driver sources read in this build (peripheral mode, class PCDC, bare metal, Full-Speed).
    if usb_of(mcu).is_some() {
        cfg(
            "r_usb_basic_cfg.h",
            module(
                "R_USB_BASIC_CFG_H_",
                "USB",
                &[
                    "#define USB_CFG_MODE (USB_CFG_PERI)",
                    "#define USB_CFG_PCDC_USE",
                    "#define USB_CFG_BC (USB_CFG_DISABLE)",
                    "#define USB_CFG_DCP (USB_CFG_DISABLE)",
                    "#define USB_CFG_REQUEST (USB_CFG_DISABLE)",
                    "#define USB_CFG_DBLB (USB_CFG_DBLBON)",
                    "#define USB_CFG_CNTMD (USB_CFG_CNTMDOFF)",
                    "#define USB_CFG_DMA (USB_CFG_DISABLE)",
                    "#define USB_CFG_DTC (USB_CFG_DISABLE)",
                    "#define USB_CFG_COMPLIANCE (USB_CFG_DISABLE)",
                    "#define USB_CFG_ELECTRICAL (USB_CFG_DISABLE)",
                ],
            ),
        );
        cfg("r_usb_pcdc_cfg.h", module_cfg("R_USB_PCDC_CFG_H_", &["/* r_usb_pcdc assigns its pipes from the configuration descriptor: no setting is read here. */".to_string()]));
    }
    // CAN (feature 40): normal mailbox mode, no FIFO.
    if can_of(mcu)?.is_some() {
        cfg(
            "r_can_cfg.h",
            module("R_CAN_CFG_H_", "CAN", &["#define CAN_CFG_FIFO_SUPPORT (0)"]),
        );
    }
    let mut gen = |name: &str, text: String| {
        files.insert(format!("ra_gen/{name}"), json!(text));
    };
    gen("bsp_clock_cfg.h", clock_cfg(&c, mcu));
    gen(
        "common_data.h",
        header("common header file") + T_GENERATE_RA_FILES_4,
    );
    gen(
        "common_data.c",
        header("common source file") + T_GENERATE_RA_FILES_5,
    );
    gen("hal_data.h", hal_data_h(mcu)?);
    gen("hal_data.c", hal_data_c(mcu)?);
    gen(
        "main.c",
        header("main source file")
            + "#include \"hal_data.h\"\nint main(void) {\n  hal_entry();\n  return 0;\n}\n",
    );
    gen("pin_data.c", pin_data(mcu)?);
    gen("vector_data.h", vector_h(&slots));
    gen("vector_data.c", vector_c(&slots));
    gen("bsp_linker_info.h", T_LINKER_INFO.to_string());
    // Linker regions of a flat project: .data copied from flash, .bss zeroed, the stack and heap in RAM.
    files.insert(
        "script/memory_regions.ld".into(),
        json!(fill(
            T_MEMORY_REGIONS,
            &[],
            &[
                hole("#0", hex(RAM_KB * KB, 8)),
                hole("#1", hex(FLASH_KB * KB, 8)),
                hole("#2", hex(DATA_FLASH_KB * KB, 8))
            ]
        )),
    );
    files.insert("script/fsp.ld".into(), json!(T_FSP_LD));
    Ok(Value::Object(files))
}
/// A new project's src/hal_entry.c, as e² studio's FSP template writes it (pins opened in R_BSP_WarmStart).
pub fn hal_entry(blink: bool) -> String {
    fill(
        T_RA_HAL_ENTRY,
        &[],
        &[hole("loop", if blink { T_RA_HAL_ENTRY_LOOP } else { "" })],
    )
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let a = |i: usize| there(args.get(i));
    let v = |i: usize| a(i).unwrap_or(&null);
    Some(match name {
        "ra_pin_cfg_word" => pin_cfg_word(a(0)).map(|t| json!(t)),
        "ra_usb_clock" => Ok(match usb_clock(to_num(a(0))) {
            Some((div, mul, pll, usb_div)) => json!({"pllDiv": div, "pllMul": mul, "pllMHz": out(pll), "usbDiv": out(usb_div), "uclkMHz": 48}),
            None => Value::Null,
        }),
        "ra_instances" => instances(v(0)),
        "ra_io_name" => io_name(a(0)).map(|t| json!(t)),
        "ra_pclka" => pclka(v(0)).map(out),
        "ra_sci_baud" => sci_baud(to_num(a(0)), to_num(a(1)), &show(a(1)))
            .map(|(abcs, bgdm, cks, brr, error, actual)| json!({"abcs": abcs, "bgdm": bgdm, "cks": cks, "brr": out(brr), "error": out(error), "actual": out(actual)})),
        "ra_vectors" => vectors(v(0)).map(Value::Array),
        "ra_generate_files" => generate_files(v(0), a(1).is_some_and(truthy)),
        "ra_hal_entry" => Ok(json!(hal_entry(a(0).is_some_and(truthy)))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_hole_of_a_full_project_is_filled() {
        let mcu = json!({
            "family": rc::FAMILY_ID,
            "pins": {"P408": {"function": "GPIO_Output", "initial": 0, "drive": "HIGH", "label": "LED1"}, "P205": {"function": "IRQ", "pull": "PULLUP", "label": "SW1"}, "P000": {"function": "Analog"},
                "P109": {"function": "Peripheral", "signal": "SCI9_TXD"}, "P105": {"function": "Peripheral", "signal": "GPT1_GTIOCA"}, "P400": {"function": "Peripheral", "signal": "IIC0_SCL"},
                "P401": {"function": "Peripheral", "signal": "IIC0_SDA"}, "P102": {"function": "Peripheral", "signal": "SPI1_RSPCK"}, "P101": {"function": "Peripheral", "signal": "SPI1_MOSI"}},
            "peripherals": {"SCI9": {"enabled": true, "transferTx": "TRANSFER0"}, "GPT1": {"enabled": true, "callback": "t1"}, "ADC0": {"enabled": true, "callback": "adc_done"}, "AGT0": {"enabled": true},
                "IIC0": {"enabled": true}, "SPI1": {"enabled": true, "ssl": "NONE"}, "WDT": {"enabled": true}, "IWDT": {"enabled": true}, "RTC": {"enabled": true}, "FLASH": {"enabled": true, "bgo": true, "callback": "f"},
                "LPM": {"enabled": true, "wake": ["IRQ1"], "cancel": ["IRQ1"], "cancelRising": ["IRQ1"]}, "ELC": {"enabled": true}, "USB": {"enabled": true}, "CAN0": {"enabled": true},
                "TRANSFER0": {"enabled": true}, "TRANSFER1": {"enabled": true, "driver": "DMAC", "channel": 1, "activation": "SOFTWARE", "callback": "d"}},
        });
        let files = generate_files(&mcu, false).unwrap();
        for (path, text) in files.as_object().unwrap() {
            let text = text.as_str().unwrap();
            assert!(
                !text.contains('\u{27e6}') && !text.contains("undefined"),
                "{path}"
            );
        }
        assert!(files["ra_gen/hal_data.c"]
            .as_str()
            .unwrap()
            .contains("const uart_instance_t g_uart9"));
        assert_eq!(
            io_name(Some(&json!("P408"))).unwrap(),
            "BSP_IO_PORT_04_PIN_08"
        );
        assert!(hal_entry(true).len() > hal_entry(false).len());
    }
}
