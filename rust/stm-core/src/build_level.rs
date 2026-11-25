//! The optimisation level of a build (feature 54): STM32CubeIDE's Project › Properties › C/C++ Build › Settings ›
//! MCU GCC Compiler › Optimization › "Optimization level", chosen for the Debug and the Release configuration of a
//! project. Both start at None (-O0), the user's decision of 2026-11-25; a project stores only what differs.

use serde_json::{Map, Value};

/// (GCC flag, the name CubeIDE shows), in CubeIDE's order.
pub const LEVELS: [(&str, &str); 7] = [
    ("-O0", "None (-O0)"),
    ("-Og", "Optimize for Debug (-Og)"),
    ("-O1", "Optimize (-O1)"),
    ("-O2", "Optimize more (-O2)"),
    ("-O3", "Optimize most (-O3)"),
    ("-Os", "Optimize for size (-Os)"),
    ("-Ofast", "Optimize for speed (-Ofast)"),
];
pub const DEFAULT: &str = "-O0";
pub const CONFIGURATIONS: [&str; 2] = ["Debug", "Release"];
const INVALID: &str = "빌드 수준 설정을 확인하세요.";

fn known(flag: &str) -> Option<&'static str> {
    LEVELS.iter().map(|(f, _)| *f).find(|f| *f == flag)
}

/// The settings a project stores: `{"Debug": flag, "Release": flag}` with the default level left out (so `{}` when
/// both are -O0). Nothing (`null`) is `{}`; anything else that is not such an object is an error.
pub fn settings(value: &Value) -> Result<Map<String, Value>, String> {
    let mut out = Map::new();
    let map = match value {
        Value::Null => return Ok(out),
        Value::Object(map) => map,
        _ => return Err(INVALID.into()),
    };
    if map.keys().any(|k| !CONFIGURATIONS.contains(&k.as_str())) {
        return Err(INVALID.into());
    }
    for configuration in CONFIGURATIONS {
        if let Some(v) = map.get(configuration) {
            let flag = v.as_str().and_then(known).ok_or(INVALID)?;
            if flag != DEFAULT {
                out.insert(configuration.to_string(), Value::String(flag.to_string()));
            }
        }
    }
    Ok(out)
}

/// The flag a build of `configuration` uses: the stored level, else -O0 (also for settings that are not valid).
pub fn flag(stored: &Value, configuration: &str) -> &'static str {
    stored
        .get(configuration)
        .and_then(Value::as_str)
        .and_then(known)
        .unwrap_or(DEFAULT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn both_configurations_start_without_optimisation() {
        assert_eq!(LEVELS[0], ("-O0", "None (-O0)"));
        for configuration in CONFIGURATIONS {
            assert_eq!(flag(&Value::Null, configuration), "-O0");
            assert_eq!(flag(&json!({}), configuration), "-O0");
        }
        assert_eq!(settings(&Value::Null).unwrap(), Map::new());
        assert_eq!(
            settings(&json!({"Debug": "-O0", "Release": "-O0"})).unwrap(),
            Map::new()
        );
    }

    #[test]
    fn a_level_is_kept_per_configuration() {
        let stored = Value::Object(settings(&json!({"Release": "-Os", "Debug": "-Og"})).unwrap());
        assert_eq!(stored, json!({"Debug": "-Og", "Release": "-Os"}));
        assert_eq!(flag(&stored, "Debug"), "-Og");
        assert_eq!(flag(&stored, "Release"), "-Os");
        let one = Value::Object(settings(&json!({"Release": "-O2", "Debug": "-O0"})).unwrap());
        assert_eq!(one, json!({"Release": "-O2"}));
        assert_eq!(flag(&one, "Debug"), "-O0");
        for (level, _) in LEVELS {
            assert_eq!(flag(&json!({ "Debug": level }), "Debug"), level);
        }
    }

    #[test]
    fn what_is_not_a_level_is_refused() {
        for bad in [
            json!({"Release": "-O9"}),
            json!({"Release": "-O2 -DX"}),
            json!({"Release": 2}),
            json!({"Other": "-O2"}),
            json!("-O2"),
            json!(["-O2"]),
        ] {
            assert_eq!(settings(&bad), Err(INVALID.to_string()), "{bad}");
        }
        // A build never passes an unknown flag to the compiler.
        assert_eq!(flag(&json!({"Release": "-O2 -DX"}), "Release"), "-O0");
        assert_eq!(flag(&json!({"Release": "-O2"}), "Other"), "-O0");
    }
}
