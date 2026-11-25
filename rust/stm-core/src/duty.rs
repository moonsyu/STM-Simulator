//! A GPIO output the program switches faster than the screen is drawn (feature 57).
//!
//! On a real board an LED on such a pin looks dimmer, not blinking: the eye sees the share of the time the pin is
//! HIGH. The simulators only knew that for timer PWM pins; a pin toggled by code was shown with the level it had at
//! the instant a frame was drawn, so the LED flickered at random. A tracker follows one pin through a frame — the
//! time between two draws — and says whether the pin switched fast and what its duty was. A slow blink (HAL_Delay of
//! 500 ms) is not fast: it stays a blink.
//!
//! The functions are called for every pin write of a running program, so they are plain numeric exports of the
//! module (`stm_duty_*`), not requests in JSON.

use std::cell::RefCell;

/// A pin that completes at least this many periods a second is averaged; slower switching is shown as it happens.
pub const FAST_HZ: f64 = 30.0;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Tracker {
    level: bool,
    /// Time of the last change or of the frame's start, in microseconds.
    last: f64,
    start: f64,
    /// Microseconds the pin was HIGH in this frame, up to `last`.
    high: f64,
    edges: u32,
    /// Switching frequency of the last finished frame in Hz, 0 when it was not fast.
    frequency: f64,
}

impl Tracker {
    pub fn new(now: f64) -> Self {
        Tracker {
            last: now,
            start: now,
            ..Tracker::default()
        }
    }

    /// The pin is written at `now`.
    pub fn level(&mut self, now: f64, high: bool) {
        if high == self.level {
            return;
        }
        if self.level {
            self.high += (now - self.last).max(0.0);
        }
        self.last = now.max(self.last);
        self.level = high;
        self.edges += 1;
    }

    /// Ends the frame at `now` and starts the next one. The duty (0..1) of a pin that switched fast in the frame —
    /// at least one whole pulse and `FAST_HZ` — or -1 for a pin that did not.
    pub fn frame(&mut self, now: f64) -> f64 {
        if self.level {
            self.high += (now - self.last).max(0.0);
        }
        let span = now - self.start;
        let hz = if span > 0.0 {
            f64::from(self.edges) / 2.0 / (span / 1e6)
        } else {
            0.0
        };
        let fast = self.edges >= 2 && hz >= FAST_HZ;
        let duty = if fast {
            (self.high / span).clamp(0.0, 1.0)
        } else {
            -1.0
        };
        self.frequency = if fast { hz } else { 0.0 };
        self.start = now;
        self.last = now;
        self.high = 0.0;
        self.edges = 0;
        duty
    }

    pub fn frequency(&self) -> f64 {
        self.frequency
    }
}

thread_local! {
    static TRACKERS: RefCell<Vec<Tracker>> = const { RefCell::new(Vec::new()) };
}

/// A new tracker for a pin, starting at `now` (µs); the result names it in the other calls.
#[no_mangle]
pub extern "C" fn stm_duty_slot(now: f64) -> u32 {
    TRACKERS.with(|t| {
        let mut list = t.borrow_mut();
        list.push(Tracker::new(now));
        (list.len() - 1) as u32
    })
}

#[no_mangle]
pub extern "C" fn stm_duty_level(slot: u32, now: f64, high: u32) {
    TRACKERS.with(|t| {
        if let Some(tracker) = t.borrow_mut().get_mut(slot as usize) {
            tracker.level(now, high != 0);
        }
    });
}

#[no_mangle]
pub extern "C" fn stm_duty_frame(slot: u32, now: f64) -> f64 {
    TRACKERS.with(|t| {
        t.borrow_mut()
            .get_mut(slot as usize)
            .map_or(-1.0, |tracker| tracker.frame(now))
    })
}

#[no_mangle]
pub extern "C" fn stm_duty_frequency(slot: u32) -> f64 {
    TRACKERS.with(|t| {
        t.borrow()
            .get(slot as usize)
            .map_or(0.0, Tracker::frequency)
    })
}

/// Starts the tracker again at `now` (a run that starts over, a pin that became a timer output).
#[no_mangle]
pub extern "C" fn stm_duty_reset(slot: u32, now: f64) {
    TRACKERS.with(|t| {
        if let Some(tracker) = t.borrow_mut().get_mut(slot as usize) {
            *tracker = Tracker::new(now);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Toggles every `half` µs from `from` to `to`, starting with HIGH.
    fn toggle(t: &mut Tracker, from: f64, to: f64, half: f64) {
        let (mut now, mut high) = (from, true);
        while now < to {
            t.level(now, high);
            high = !high;
            now += half;
        }
    }

    #[test]
    fn a_pin_switched_fast_has_its_duty() {
        let mut t = Tracker::new(0.0);
        // 1 kHz, half the time HIGH, for a frame of 20 ms.
        toggle(&mut t, 0.0, 20_000.0, 500.0);
        let duty = t.frame(20_000.0);
        assert!((duty - 0.5).abs() < 0.03, "{duty}");
        assert!((t.frequency() - 1000.0).abs() < 60.0, "{}", t.frequency());
        // HIGH for a quarter of each period.
        let mut now = 20_000.0;
        while now < 40_000.0 {
            t.level(now, true);
            t.level(now + 250.0, false);
            now += 1000.0;
        }
        let duty = t.frame(40_000.0);
        assert!((duty - 0.25).abs() < 0.02, "{duty}");
    }

    #[test]
    fn a_slow_blink_stays_a_blink() {
        // HAL_Delay(500): one change in a 20 ms frame, or none.
        let mut t = Tracker::new(0.0);
        t.level(5_000.0, true);
        assert_eq!(t.frame(20_000.0), -1.0);
        assert_eq!(t.frame(40_000.0), -1.0);
        assert_eq!(t.frequency(), 0.0);
        // Even when a whole second is one frame (a test that ticks in large steps): 1 Hz is not fast.
        let mut t = Tracker::new(0.0);
        toggle(&mut t, 0.0, 1_000_000.0, 500_000.0);
        assert_eq!(t.frame(1_000_000.0), -1.0);
        // 20 Hz is seen as flicker too.
        let mut t = Tracker::new(0.0);
        toggle(&mut t, 0.0, 1_000_000.0, 25_000.0);
        assert_eq!(t.frame(1_000_000.0), -1.0);
        // 50 Hz is not.
        let mut t = Tracker::new(0.0);
        toggle(&mut t, 0.0, 1_000_000.0, 10_000.0);
        assert!((t.frame(1_000_000.0) - 0.5).abs() < 0.02);
    }

    #[test]
    fn a_frame_starts_from_the_level_the_pin_has() {
        let mut t = Tracker::new(0.0);
        t.level(0.0, true);
        assert_eq!(t.frame(10_000.0), -1.0);
        // Still HIGH: two short LOW pulses in the next frame of 10 ms.
        for at in [12_000.0, 16_000.0] {
            t.level(at, false);
            t.level(at + 1000.0, true);
        }
        let duty = t.frame(20_000.0);
        assert!((duty - 0.8).abs() < 1e-9, "{duty}");
        // The exports use the same tracker.
        let slot = stm_duty_slot(0.0);
        for i in 0..40 {
            stm_duty_level(slot, f64::from(i) * 250.0, u32::from(i % 2 == 0));
        }
        assert!((stm_duty_frame(slot, 10_000.0) - 0.5).abs() < 1e-9);
        assert!(stm_duty_frequency(slot) > 1900.0);
        stm_duty_reset(slot, 10_000.0);
        assert_eq!(stm_duty_frame(slot, 20_000.0), -1.0);
        assert_eq!(stm_duty_frame(9999, 0.0), -1.0);
    }
}
