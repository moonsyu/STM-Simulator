//! Sizes and transforms of what the workspace draws. Everything is drawn at real size: the 2.54 mm pin and hole
//! pitch is 14 units (1 mm = 14/2.54 units).
//!
//! Moved here from `src/geometry.js` (feature 62). These are asked for every part and hole each time the circuit is
//! drawn, so they are exports of numbers (`src/rust-core.js` `rustNumber`): a function that has more than one number
//! to give answers the first and keeps the others for `stm_geom_1` … `stm_geom_3`, asked right after it.

use crate::jsmath::{atan, atan2, cos, hypot, sin, tan};
use crate::raconfig::{num, out, there};
use serde_json::{json, Value};
use std::cell::Cell;
use std::f64::consts::PI;

pub const MIN_SCALE: f64 = 0.001;
pub const MAX_SCALE: f64 = 1000.0;

/// BOARD (NUCLEO-64 MB1136: 70 × 82.5 mm, UM1724 Figure 5), BB (400-point half-size board, BusBoard BB400 class:
/// 54.3 × 84 mm, 30 rows) and FULL_BB (830-point board, BusBoard BB830: 165.1 × 54.6 mm, in its own local frame: 63
/// columns, two 5-row blocks, rails top and bottom).
pub fn tables() -> Value {
    json!({
        "BOARD": {"x": 45, "y": 48, "w": 385.83, "h": 454.72},
        "BB": {"x": 644.5, "y": 99.5, "w": 301, "h": 463, "startY": 128, "step": 14},
        "FULL_BB": {"x": 0, "y": 0, "w": 910, "h": 301, "left": 21, "step": 14, "columns": 63, "rows": {"a": 76.5, "f": 174.5}, "rails": {"T": [22.5, 36.5], "B": [264.5, 278.5]}},
        "MIN_SCALE": MIN_SCALE,
        "MAX_SCALE": MAX_SCALE,
    })
}
/// A 2 × 2 matrix `[a c; b d]`.
pub type Matrix = (f64, f64, f64, f64);

// Quarter turns are exact (cos 90° is 6e-17 in floating point): a board turned four times is where it started.
fn exact(v: f64) -> f64 {
    if v.abs() < 1e-12 {
        0.0
    } else if (v.abs() - 1.0).abs() < 1e-12 {
        // `Math.sign`
        if v > 0.0 {
            1.0
        } else {
            -1.0
        }
    } else {
        v
    }
}
/// The matrix of a turn (degrees), a scale on each axis and a skew of x (degrees).
pub fn matrix_of(rotation: f64, scale_x: f64, scale_y: f64, skew_x: f64) -> Matrix {
    let r = rotation * PI / 180.0;
    let (c, s, k) = (exact(cos(r)), exact(sin(r)), tan(skew_x * PI / 180.0));
    (
        c * scale_x,
        s * scale_x,
        (c * k - s) * scale_y,
        (s * k + c) * scale_y,
    )
}
pub fn vector(m: Matrix, x: f64, y: f64) -> (f64, f64) {
    (m.0 * x + m.2 * y, m.1 * x + m.3 * y)
}
pub fn inverse(m: Matrix) -> Matrix {
    let det = m.0 * m.3 - m.1 * m.2;
    (m.3 / det, -m.1 / det, -m.2 / det, m.0 / det)
}
pub fn multiply(m: Matrix, n: Matrix) -> Matrix {
    (
        m.0 * n.0 + m.2 * n.1,
        m.1 * n.0 + m.3 * n.1,
        m.0 * n.2 + m.2 * n.3,
        m.1 * n.2 + m.3 * n.3,
    )
}
/// A point of a surface (the main board or the built-in breadboard) in the workspace. The surface is drawn from its
/// origin (the corner that is top left before turning): turned (`turned`: the surface has a rotation), then scaled.
#[allow(clippy::too_many_arguments)]
pub fn surface_point(
    x: f64,
    y: f64,
    base_x: f64,
    base_y: f64,
    origin_x: f64,
    origin_y: f64,
    turned: bool,
    rotation: f64,
    scale_x: f64,
    scale_y: f64,
    skew_x: f64,
) -> (f64, f64) {
    if !turned {
        return (
            origin_x + (x - base_x) * scale_x,
            origin_y + (y - base_y) * scale_y,
        );
    }
    let q = vector(
        matrix_of(rotation, scale_x, scale_y, skew_x),
        x - base_x,
        y - base_y,
    );
    (origin_x + q.0, origin_y + q.1)
}
/// `Math.min` / `Math.max` of a list: NaN when any is.
pub(crate) fn least(values: [f64; 4]) -> f64 {
    values.into_iter().fold(f64::INFINITY, |a, b| {
        if a.is_nan() || b.is_nan() {
            f64::NAN
        } else {
            a.min(b)
        }
    })
}
pub(crate) fn most(values: [f64; 4]) -> f64 {
    values.into_iter().fold(f64::NEG_INFINITY, |a, b| {
        if a.is_nan() || b.is_nan() {
            f64::NAN
        } else {
            a.max(b)
        }
    })
}

thread_local! {
    static KEPT: Cell<[f64; 3]> = const { Cell::new([0.0; 3]) };
}
fn keep(first: f64, rest: [f64; 3]) -> f64 {
    KEPT.with(|k| k.set(rest));
    first
}
#[no_mangle]
pub extern "C" fn stm_geom_1() -> f64 {
    KEPT.with(|k| k.get()[0])
}
#[no_mangle]
pub extern "C" fn stm_geom_2() -> f64 {
    KEPT.with(|k| k.get()[1])
}
#[no_mangle]
pub extern "C" fn stm_geom_3() -> f64 {
    KEPT.with(|k| k.get()[2])
}
fn keep_matrix(m: Matrix) -> f64 {
    keep(m.0, [m.1, m.2, m.3])
}
/// a; then b, c, d.
#[no_mangle]
pub extern "C" fn stm_geom_matrix(rotation: f64, scale_x: f64, scale_y: f64, skew_x: f64) -> f64 {
    keep_matrix(matrix_of(rotation, scale_x, scale_y, skew_x))
}
/// x; then y.
#[no_mangle]
pub extern "C" fn stm_geom_vector(a: f64, b: f64, c: f64, d: f64, x: f64, y: f64) -> f64 {
    let v = vector((a, b, c, d), x, y);
    keep(v.0, [v.1, 0.0, 0.0])
}
/// The vector (x, y) of a part's own frame in the workspace: x; then y.
#[no_mangle]
pub extern "C" fn stm_geom_part_vector(
    rotation: f64,
    scale_x: f64,
    scale_y: f64,
    skew_x: f64,
    x: f64,
    y: f64,
) -> f64 {
    let v = vector(matrix_of(rotation, scale_x, scale_y, skew_x), x, y);
    keep(v.0, [v.1, 0.0, 0.0])
}
#[no_mangle]
pub extern "C" fn stm_geom_inverse(a: f64, b: f64, c: f64, d: f64) -> f64 {
    keep_matrix(inverse((a, b, c, d)))
}
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn stm_geom_multiply(
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    e: f64,
    f: f64,
    g: f64,
    h: f64,
) -> f64 {
    keep_matrix(multiply((a, b, c, d), (e, f, g, h)))
}
/// x; then y. `turned` is 0 for a surface without a rotation.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn stm_geom_surface_point(
    x: f64,
    y: f64,
    base_x: f64,
    base_y: f64,
    origin_x: f64,
    origin_y: f64,
    turned: f64,
    rotation: f64,
    scale_x: f64,
    scale_y: f64,
    skew_x: f64,
) -> f64 {
    let p = surface_point(
        x,
        y,
        base_x,
        base_y,
        origin_x,
        origin_y,
        turned != 0.0,
        rotation,
        scale_x,
        scale_y,
        skew_x,
    );
    keep(p.0, [p.1, 0.0, 0.0])
}
/// What is seen of a surface `w` × `h`: left; then right, top, bottom.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn stm_geom_surface_bounds(
    base_x: f64,
    base_y: f64,
    w: f64,
    h: f64,
    origin_x: f64,
    origin_y: f64,
    turned: f64,
    rotation: f64,
    scale_x: f64,
    scale_y: f64,
    skew_x: f64,
) -> f64 {
    let corner = |dx: f64, dy: f64| {
        surface_point(
            base_x + dx,
            base_y + dy,
            base_x,
            base_y,
            origin_x,
            origin_y,
            turned != 0.0,
            rotation,
            scale_x,
            scale_y,
            skew_x,
        )
    };
    let points = [
        corner(0.0, 0.0),
        corner(w, 0.0),
        corner(0.0, h),
        corner(w, h),
    ];
    let (xs, ys) = (points.map(|p| p.0), points.map(|p| p.1));
    keep(least(xs), [most(xs), least(ys), most(ys)])
}

const BAD_SCALE: &str = "장치 크기가 너무 작거나 작업 범위를 초과합니다.";
/// A scale a part may have, or the reason it may not.
pub fn valid_scale(value: Option<&Value>) -> Result<f64, String> {
    there(value)
        .and_then(num)
        .filter(|v| v.is_finite() && *v >= MIN_SCALE && *v <= MAX_SCALE)
        .ok_or_else(|| BAD_SCALE.to_string())
}
/// `{scale}` for the same scale on both axes, else `{scaleX, scaleY}`.
pub fn scale_fields(x: Option<&Value>, y: Option<&Value>) -> Result<Value, String> {
    let (sx, sy) = (valid_scale(x)?, valid_scale(y)?);
    Ok(if (sx - sy).abs() < 1e-10 {
        json!({"scale": out(sx)})
    } else {
        json!({"scaleX": out(sx), "scaleY": out(sy)})
    })
}
/// The scale, turn and skew a matrix stands for.
pub fn matrix_fields(m: Matrix) -> Result<Value, String> {
    let x = hypot(m.0, m.1);
    let y = (m.0 * m.3 - m.1 * m.2) / x;
    let mut fields = scale_fields(Some(&out(x)), Some(&out(y)))?;
    fields["rotation"] = out((atan2(m.1, m.0) * 180.0 / PI + 360.0) % 360.0);
    fields["skewX"] = out(atan((m.0 * m.2 + m.1 * m.3) / (x * y)) * 180.0 / PI);
    Ok(fields)
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let a = |i: usize| there(args.get(i));
    Some(match name {
        "geometry_tables" => Ok(tables()),
        "valid_scale" => valid_scale(a(0)).map(out),
        "scale_fields" => scale_fields(a(0), a(1)),
        "matrix_fields" => {
            let field = |key: &str| crate::raconfig::to_num(a(0).and_then(|m| m.get(key)));
            match a(0) {
                Some(m) if !m.is_null() => {
                    matrix_fields((field("a"), field("b"), field("c"), field("d")))
                }
                _ => Err("Cannot read properties of undefined".into()),
            }
        }
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quarter_turns_are_exact() {
        assert_eq!(matrix_of(90.0, 1.0, 1.0, 0.0), (0.0, 1.0, -1.0, 0.0));
        assert_eq!(matrix_of(180.0, 2.0, 2.0, 0.0), (-2.0, 0.0, -0.0, -2.0));
        assert_eq!(
            vector(matrix_of(90.0, 1.0, 1.0, 0.0), 14.0, 0.0),
            (0.0, 14.0)
        );
        assert_eq!(inverse((2.0, 0.0, 0.0, 4.0)), (0.5, -0.0, -0.0, 0.25));
        assert_eq!(
            surface_point(55.0, 58.0, 45.0, 48.0, 100.0, 100.0, false, 0.0, 2.0, 2.0, 0.0),
            (120.0, 120.0)
        );
        assert!(valid_scale(Some(&json!(0.0001))).is_err());
        assert_eq!(
            scale_fields(Some(&json!(2)), Some(&json!(2))).unwrap(),
            json!({"scale": 2})
        );
    }

    #[test]
    fn numbers_print_as_javascript_prints_them() {
        use crate::mcu::js_number;
        for (v, text) in [
            (0.0, "0"),
            (-0.0, "0"),
            (1.5, "1.5"),
            (-0.1, "-0.1"),
            (100.0, "100"),
            (1e21, "1e+21"),
            (1e20, "100000000000000000000"),
            (123456789012345680000.0, "123456789012345680000"),
            (1e-6, "0.000001"),
            (1e-7, "1e-7"),
            (1.25e-7, "1.25e-7"),
            (2.842170943040401e-14, "2.842170943040401e-14"),
            (5e-324, "5e-324"),
            (1.7976931348623157e308, "1.7976931348623157e+308"),
            (0.1 + 0.2, "0.30000000000000004"),
            (385.83, "385.83"),
            (-1234.5678, "-1234.5678"),
            (1.5e300, "1.5e+300"),
        ] {
            assert_eq!(js_number(v), text);
        }
    }
}
