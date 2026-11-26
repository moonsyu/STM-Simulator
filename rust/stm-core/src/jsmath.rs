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
