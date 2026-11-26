//! The transcendental functions of JavaScript's `Math`, with JavaScript's own results.
//!
//! Rust's `powf` and the engine's `Math.pow` are both within a unit in the last place of the true value, but not
//! always the same one (about 3 in 100 results differ in the last digit). Code moved from JavaScript must give the
//! same numbers as before (feature 63), so in the WebAssembly build these functions are the host's `Math` functions,
//! imported under the module name `math` (`src/rust-core.js` passes them). In a native build (cargo test) they are
//! Rust's own.

#[cfg(target_arch = "wasm32")]
mod host {
    #[link(wasm_import_module = "math")]
    extern "C" {
        pub fn pow(x: f64, y: f64) -> f64;
        pub fn exp(x: f64) -> f64;
        pub fn sin(x: f64) -> f64;
        pub fn cos(x: f64) -> f64;
        pub fn tan(x: f64) -> f64;
        pub fn atan(x: f64) -> f64;
        pub fn atan2(y: f64, x: f64) -> f64;
        pub fn hypot(x: f64, y: f64) -> f64;
    }
}

/// `Math.pow(x, y)`.
pub fn pow(x: f64, y: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: a host function of two numbers that answers a number; it reads and writes no memory of this module.
    unsafe {
        host::pow(x, y)
    }
    #[cfg(not(target_arch = "wasm32"))]
    x.powf(y)
}
/// `Math.exp(x)`.
pub fn exp(x: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: as for `pow`.
    unsafe {
        host::exp(x)
    }
    #[cfg(not(target_arch = "wasm32"))]
    x.exp()
}
/// `Math.sin(x)`.
pub fn sin(x: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: as for `pow`.
    unsafe {
        host::sin(x)
    }
    #[cfg(not(target_arch = "wasm32"))]
    x.sin()
}
/// `Math.cos(x)`.
pub fn cos(x: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: as for `pow`.
    unsafe {
        host::cos(x)
    }
    #[cfg(not(target_arch = "wasm32"))]
    x.cos()
}
/// `Math.tan(x)`.
pub fn tan(x: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: as for `pow`.
    unsafe {
        host::tan(x)
    }
    #[cfg(not(target_arch = "wasm32"))]
    x.tan()
}
/// `Math.atan(x)`.
pub fn atan(x: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: as for `pow`.
    unsafe {
        host::atan(x)
    }
    #[cfg(not(target_arch = "wasm32"))]
    x.atan()
}
/// `Math.atan2(y, x)`.
pub fn atan2(y: f64, x: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: as for `pow`.
    unsafe {
        host::atan2(y, x)
    }
    #[cfg(not(target_arch = "wasm32"))]
    y.atan2(x)
}
/// `Math.hypot(x, y)`.
pub fn hypot(x: f64, y: f64) -> f64 {
    #[cfg(target_arch = "wasm32")]
    // SAFETY: as for `pow`.
    unsafe {
        host::hypot(x, y)
    }
    #[cfg(not(target_arch = "wasm32"))]
    x.hypot(y)
}
/// `Math.hypot(x, y)` without the call to the host, for loops that ask it very often: the engine's own method (the
/// larger magnitude taken out, the squares summed with Kahan's compensation). `tests/unit/js-math.test.js` holds it
/// against `Math.hypot`.
pub fn hypot_fast(x: f64, y: f64) -> f64 {
    let (a, b) = (x.abs(), y.abs());
    if a.is_infinite() || b.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    let max = a.max(b);
    if max == 0.0 {
        return 0.0;
    }
    let (mut sum, mut compensation) = (0.0f64, 0.0f64);
    for v in [a, b] {
        let n = v / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}
#[no_mangle]
pub extern "C" fn stm_hypot_fast(x: f64, y: f64) -> f64 {
    hypot_fast(x, y)
}
