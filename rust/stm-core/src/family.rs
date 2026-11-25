//! GPIO pins of an MCU family: what the chip on its NUCLEO board brings out, whichever board is on the screen.
//!
//! Feature 53: the JavaScript profile of the STM32F446RE shared the array of the board being edited
//! (`pins.js` `GPIO_PINS`, rewritten in place by `setActiveBoard`). With an FPB-RA6E1 project open that array held
//! the RA board's ports, so making a default STM32 project (the board picker compares the project with one) failed
//! with "PA2: STM32F446RE에서 지원하지 않는 핀 기능입니다." and the board could not be changed. The lists are fixed
//! data of the family and live here.

/// NUCLEO-F446RE (MB1136, UM1724): the MCU pins on CN5-CN10, including PA2/PA3 behind SB62/SB63 and PH0/PH1.
const F446RE: [&str; 50] = [
    "PA0", "PA1", "PA10", "PA11", "PA12", "PA13", "PA14", "PA15", "PA2", "PA3", "PA4", "PA5",
    "PA6", "PA7", "PA8", "PA9", "PB0", "PB1", "PB10", "PB12", "PB13", "PB14", "PB15", "PB2", "PB3",
    "PB4", "PB5", "PB6", "PB7", "PB8", "PB9", "PC0", "PC1", "PC10", "PC11", "PC12", "PC13", "PC14",
    "PC15", "PC2", "PC3", "PC4", "PC5", "PC6", "PC7", "PC8", "PC9", "PD2", "PH0", "PH1",
];

/// Families the app knows.
pub const FAMILIES: [&str; 2] = ["STM32F446RE", "STM32F103RB"];

/// The GPIO pins of `family`, sorted as the app lists them (by code unit: PA0, PA1, PA10 …), or `None` for a family
/// this table does not know.
pub fn gpio_pins(family: &str) -> Option<Vec<&'static str>> {
    match family {
        "STM32F446RE" => Some(F446RE.to_vec()),
        // The same MB1136 board: CN7-29/31 carry PD0/PD1 (no port H on the F103) and CN10-18 is PB11.
        "STM32F103RB" => {
            let mut pins: Vec<&'static str> = F446RE
                .iter()
                .copied()
                .filter(|p| !p.starts_with("PH"))
                .collect();
            pins.extend(["PB11", "PD0", "PD1"]);
            pins.sort_unstable();
            Some(pins)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f446re_has_its_fifty_pins_in_the_apps_order() {
        let pins = gpio_pins("STM32F446RE").unwrap();
        assert_eq!(pins.len(), 50);
        assert_eq!(&pins[..4], ["PA0", "PA1", "PA10", "PA11"]);
        assert!(pins.contains(&"PA2") && pins.contains(&"PH0") && pins.contains(&"PH1"));
        assert!(!pins.contains(&"PB11") && !pins.contains(&"PD0"));
        let mut sorted = pins.clone();
        sorted.sort_unstable();
        assert_eq!(pins, sorted);
    }

    #[test]
    fn f103rb_differs_by_port_h_and_three_pins() {
        let pins = gpio_pins("STM32F103RB").unwrap();
        assert_eq!(pins.len(), 51);
        assert!(
            pins.contains(&"PB11")
                && pins.contains(&"PD0")
                && pins.contains(&"PD1")
                && pins.contains(&"PA2")
        );
        assert!(pins.iter().all(|p| !p.starts_with("PH")));
        let mut sorted = pins.clone();
        sorted.sort_unstable();
        assert_eq!(pins, sorted);
    }

    #[test]
    fn the_lists_are_the_same_on_every_call_and_unknown_families_have_none() {
        assert_eq!(gpio_pins("STM32F446RE"), gpio_pins("STM32F446RE"));
        assert_eq!(gpio_pins("R7FA6E10F"), None);
        assert_eq!(gpio_pins(""), None);
        for family in FAMILIES {
            assert!(gpio_pins(family).is_some());
        }
    }
}
