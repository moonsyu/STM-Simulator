//! The modules a circuit can hold beyond the basic parts: their pinouts, defaults, the ranges of what a sensor can
//! be set to and the I2C addresses a part can take. Module pinouts are part of the simulator's public circuit
//! format. The table itself is `data/device_defs.json` (taken from `src/device-defs.js` as it was).
//!
//! Moved here from `src/device-defs.js` (feature 62).

use crate::jsmath::{exp, pow};
use serde_json::Value;
use std::sync::LazyLock;

static TABLES: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("data/device_defs.json")).expect("device_defs.json")
});
/// DEVICE_DEFS, I2C_DEVICES, SPI_DEVICES, MODULE_DEVICES, DEVICE_RANGES and DEVICE_ADDRESSES.
pub fn tables() -> &'static Value {
    &TABLES
}
/// `Math.min` / `Math.max` of two numbers: NaN when either is.
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.min(b)
    }
}
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.max(b)
    }
}
/// Resistance of the photoresistor at `lux` (10 kΩ at 10 lx, gamma 0.7), kept within 100 Ω – 1 MΩ.
pub fn ldr_resistance(lux: f64) -> f64 {
    js_max(100.0, js_min(1e6, 10000.0 * pow(10.0 / lux, 0.7)))
}
/// Resistance of the 10 kΩ NTC (B 3950) at `t` °C.
pub fn ntc_resistance(t: f64) -> f64 {
    10000.0 * exp(3950.0 * (1.0 / (t + 273.15) - 1.0 / 298.15))
}
// Called while a circuit is solved: numbers in, a number out, no JSON (`src/rust-core.js` `rustNumber`).
#[no_mangle]
pub extern "C" fn stm_ldr_resistance(lux: f64) -> f64 {
    ldr_resistance(lux)
}
#[no_mangle]
pub extern "C" fn stm_ntc_resistance(t: f64) -> f64 {
    ntc_resistance(t)
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, _args: &[Value]) -> Option<Result<Value, String>> {
    Some(match name {
        "device_tables" => Ok(tables().clone()),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tables_and_resistances() {
        assert_eq!(tables()["I2C_DEVICES"][1], "sht31");
        assert!(tables()["DEVICE_DEFS"].as_object().unwrap().len() > 5);
        assert_eq!(ldr_resistance(10.0), 10000.0);
        assert_eq!(ldr_resistance(0.0), 1e6);
        assert_eq!(ldr_resistance(1e12), 100.0);
        assert!(ldr_resistance(f64::NAN).is_nan());
        assert_eq!(ntc_resistance(25.0), 10000.0);
    }
}
