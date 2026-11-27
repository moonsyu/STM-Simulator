//! Resizing, moving and turning what stands in the workspace — the main board, the built-in breadboard, a
//! breadboard part, another board — with the parts mounted on it and the bends of the wires that run on it, and
//! taking a surface out of the circuit.
//!
//! Moved here from `src/resize.js`, `src/surface-move.js` and `src/surfaces.js` (feature 62). The JavaScript side
//! sends what these need of a project (each part's kind, place and attachments, the surfaces, the wires' ends and
//! bends) and applies the answer to the project's own objects. An answer with `error` is applied as far as it goes
//! and then thrown: the JavaScript changed the project in the same order and stopped at the same place.

use crate::geom::{
    inverse, matrix_fields, matrix_of, multiply, scale_fields, surface_point, vector, Matrix,
    MAX_SCALE, MIN_SCALE,
};
use crate::place::{attachments, frame_of, kind};
use crate::raconfig::{js_round, num, out, show, there, to_num, truthy, without_undefined};
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

type R<T> = Result<T, String>;
const BROKEN: &str = "Cannot read properties of undefined";
const BB: (f64, f64, f64, f64) = (644.5, 99.5, 301.0, 463.0);
static EMPTY: LazyLock<Value> = LazyLock::new(|| json!({}));

fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.get(key).filter(|x| !x.is_null())
}
fn text(v: Option<&Value>) -> Option<&str> {
    v.and_then(Value::as_str)
}
fn finite(v: &Value) -> bool {
    num(v).is_some_and(f64::is_finite)
}
fn list<'a>(v: &'a Value, key: &str) -> R<&'a [Value]> {
    v.get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| BROKEN.to_string())
}
/// `a === b` of two ids.
fn same(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(x), Some(y)) => !x.is_object() && !x.is_array() && x == y,
        _ => false,
    }
}
/// The outline of a surface as it is drawn before it is moved: (x, y, w, h). The main board's follows the board
/// being edited, so the JavaScript side sends it.
fn base_of(name: &str, board: &Value) -> (f64, f64, f64, f64) {
    if name == "board" {
        let n = |key: &str| to_num(board.get(key));
        (n("x"), n("y"), n("w"), n("h"))
    } else {
        BB
    }
}
/// `surfaces?.[name]`.
fn surface_of<'a>(view: &'a Value, name: &str) -> Option<&'a Value> {
    get(view, "surfaces").and_then(|s| get(s, name))
}
/// `surfaceOrigin`: where the surface's own corner is, as the project has it or where it is drawn by default.
fn origin_of(view: &Value, name: &str, board: &Value) -> (Value, Value) {
    let (s, base) = (surface_of(view, name), base_of(name, board));
    let at = |key: &str, default: f64| {
        s.and_then(|s| get(s, key))
            .cloned()
            .unwrap_or_else(|| out(default))
    };
    (at("x", base.0), at("y", base.1))
}
fn matrix(frame: (f64, f64, f64, f64)) -> Matrix {
    matrix_of(frame.0, frame.1, frame.2, frame.3)
}
/// `a + b` of two settings as JavaScript adds them: a text on either side joins them as texts (the sum is then
/// read as a number).
fn sum(a: &Value, b: &Value) -> f64 {
    if a.is_string() || b.is_string() {
        to_num(Some(&json!(format!("{}{}", show(Some(a)), show(Some(b))))))
    } else {
        to_num(Some(a)) + to_num(Some(b))
    }
}
fn quarter(v: f64) -> f64 {
    ((js_round(v / 90.0) * 90.0) % 360.0 + 360.0) % 360.0
}
fn point(x: f64, y: f64) -> Value {
    json!({"x": out(x), "y": out(y)})
}
fn part_checked(p: &Value) -> R<&Value> {
    if p.is_null() {
        Err(BROKEN.into())
    } else {
        Ok(p)
    }
}
/// Whether every anchor of a part that has any is one `owns`.
fn stands_on(p: &Value, owns: &dyn Fn(&Value) -> R<bool>) -> R<bool> {
    let anchors = attachments(part_checked(p)?);
    if anchors.is_empty() {
        return Ok(false);
    }
    for (_, anchor) in &anchors {
        if !owns(anchor)? {
            return Ok(false);
        }
    }
    Ok(true)
}
fn starts(anchor: &Value, prefixes: &[&str]) -> R<bool> {
    anchor
        .as_str()
        .map(|a| prefixes.iter().any(|p| a.starts_with(p)))
        .ok_or_else(|| BROKEN.to_string())
}
/// What a surface owns of the anchors: the main board its header pins, the built-in breadboard its holes.
fn surface_owns(name: &str) -> impl Fn(&Value) -> R<bool> + '_ {
    move |anchor| {
        if name == "board" {
            starts(anchor, &["board:"])
        } else {
            starts(anchor, &["bb:", "rail:"])
        }
    }
}

// ---------- resize.js ----------

/// What is resized: a surface (by its name) or a part (by its index).
struct Object<'a> {
    surface: Option<&'a str>,
    index: Option<usize>,
    object: &'a Value,
    origin: (Value, Value),
}
fn object_of<'a>(view: &'a Value, target: &'a Value, board: &Value) -> R<Object<'a>> {
    if target.is_null() {
        return Err(BROKEN.into());
    }
    let (id, of) = (target.get("id"), text(target.get("type")));
    let surface =
        text(id).filter(|n| of == Some("surface") && (*n == "board" || *n == "breadboard"));
    if let Some(name) = surface {
        return Ok(Object {
            surface,
            index: None,
            object: surface_of(view, name).unwrap_or(&EMPTY),
            origin: origin_of(view, name, board),
        });
    }
    if of == Some("part") {
        for (index, p) in list(view, "components")?.iter().enumerate() {
            if same(part_checked(p)?.get("id"), id) {
                let at = |key: &str| p.get(key).cloned().unwrap_or(Value::Null);
                return Ok(Object {
                    surface: None,
                    index: Some(index),
                    object: p,
                    origin: (at("x"), at("y")),
                });
            }
        }
    }
    Err("크기를 바꿀 장치를 선택하세요.".into())
}
/// `scaleXOf` / `scaleYOf` of an object, as the project has them.
fn scale_of(object: &Value, key: &str) -> Value {
    get(object, key)
        .or_else(|| get(object, "scale"))
        .cloned()
        .unwrap_or(json!(1))
}
/// What resizing (and, for a surface, moving or turning) changes: the object's own scale fields and place, and for
/// each part mounted on it (by index) its place and the scale, turn and skew the same transform gives it.
fn resize(view: &Value, o: &Object, size: &Value, raw_size: Option<&Value>) -> R<Value> {
    let number = raw_size.is_some_and(|s| num(s).is_some());
    let of = |key: &str| size.get(key).filter(|v| !v.is_null() && !number);
    let fields = if number {
        scale_fields(raw_size, raw_size)?
    } else {
        if size.is_null() {
            return Err(BROKEN.into());
        }
        let x = of("scaleX")
            .cloned()
            .unwrap_or_else(|| scale_of(o.object, "scaleX"));
        let y = of("scaleY")
            .cloned()
            .unwrap_or_else(|| scale_of(o.object, "scaleY"));
        scale_fields(there(Some(&x)), there(Some(&y)))?
    };
    let destination = (
        of("x").cloned().unwrap_or_else(|| o.origin.0.clone()),
        of("y").cloned().unwrap_or_else(|| o.origin.1.clone()),
    );
    if !finite(&destination.0) || !finite(&destination.1) {
        return Err("장치가 작업 공간을 벗어납니다.".into());
    }
    let before = frame_of(o.object);
    let scale = |key: &str| to_num(fields.get(key).or_else(|| fields.get("scale")));
    // A surface can also be turned (size.rotation): mounted parts follow through the same transform.
    let turned = raw_size
        .filter(|_| o.surface.is_some() && !number)
        .and_then(|s| there(s.get("rotation")));
    let rotation = match turned {
        Some(Value::Null) => 0.0,
        Some(r) => to_num(Some(r)),
        None => before.0,
    };
    let transform = multiply(
        matrix((rotation, scale("scaleX"), scale("scaleY"), before.3)),
        inverse(matrix(before)),
    );
    let prefix = format!("breadboard:{}:", show(o.object.get("id")));
    let name = o.surface.unwrap_or("");
    let on_surface = surface_owns(name);
    let on_part = |anchor: &Value| starts(anchor, &[prefix.as_str()]);
    let owns: &dyn Fn(&Value) -> R<bool> = if o.surface.is_some() {
        &on_surface
    } else {
        &on_part
    };
    let (ox, oy) = (to_num(Some(&o.origin.0)), to_num(Some(&o.origin.1)));
    let (dx, dy) = (to_num(Some(&destination.0)), to_num(Some(&destination.1)));
    // Propagate the full affine transform so rotated mounted pins remain aligned. Everything is checked before
    // anything is changed.
    let mut children = Vec::new();
    if o.surface.is_some() || kind(o.object) == "breadboard" {
        for (index, p) in list(view, "components")?.iter().enumerate() {
            if Some(index) == o.index || !stands_on(p, owns)? {
                continue;
            }
            let q = vector(transform, to_num(p.get("x")) - ox, to_num(p.get("y")) - oy);
            let fields = matrix_fields(multiply(transform, matrix(frame_of(p))))?;
            children.push((index, dx + q.0, dy + q.1, fields));
        }
    }
    if children
        .iter()
        .any(|c| !c.1.is_finite() || !c.2.is_finite())
    {
        return Err("크기를 바꾸면 장착 부품이 작업 공간을 벗어납니다.".into());
    }
    let mut change = Map::new();
    change.insert(
        "children".into(),
        children
            .into_iter()
            .map(|(index, x, y, fields)| json!({"index": index, "fields": fields, "x": out(x), "y": out(y)}))
            .collect(),
    );
    change.insert("fields".into(), fields);
    change.insert("x".into(), destination.0);
    change.insert("y".into(), destination.1);
    if let Some(r) = turned {
        change.insert("rotation".into(), r.clone());
    }
    Ok(Value::Object(change))
}
/// The frame the resize handles of an object are drawn in: its matrix and where its own zero point is.
fn frame(o: &Object, board: &Value) -> (Matrix, (f64, f64)) {
    let m = matrix(frame_of(o.object));
    let base = o.surface.map_or((0.0, 0.0), |name| {
        let b = base_of(name, board);
        (b.0, b.1)
    });
    let offset = vector(m, base.0, base.1);
    (
        m,
        (
            to_num(Some(&o.origin.0)) - offset.0,
            to_num(Some(&o.origin.1)) - offset.1,
        ),
    )
}
/// `Math.max` / `Math.min` of two numbers: NaN when either is.
fn most(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.max(b)
    }
}
fn least(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.min(b)
    }
}
/// What dragging a resize handle from `start` to `end` changes (as `resize` answers it).
#[allow(clippy::too_many_arguments)]
fn resize_from_handle(
    view: &Value,
    target: &Value,
    bounds: &Value,
    handle: Option<&Value>,
    start: &Value,
    end: &Value,
    lock: bool,
    board: &Value,
) -> R<Value> {
    let handle = show(handle);
    if !["n", "s", "e", "w", "ne", "nw", "se", "sw"].contains(&handle.as_str()) {
        return Err("크기 조절점을 확인하세요.".into());
    }
    let o = object_of(view, target, board)?;
    let (m, translation) = frame(&o, board);
    if start.is_null() || end.is_null() || bounds.is_null() {
        return Err(BROKEN.into());
    }
    let n = |v: &Value, key: &str| to_num(v.get(key));
    let delta = vector(
        inverse(m),
        n(end, "x") - n(start, "x"),
        n(end, "y") - n(start, "y"),
    );
    let has = |c: char| handle.contains(c);
    let (horizontal, vertical) = (has('e') || has('w'), has('n') || has('s'));
    let (width, height) = (n(bounds, "width"), n(bounds, "height"));
    let mut fx = if horizontal {
        1.0 + delta.0 * (if has('e') { 1.0 } else { -1.0 }) / width
    } else {
        1.0
    };
    let mut fy = if vertical {
        1.0 + delta.1 * (if has('s') { 1.0 } else { -1.0 }) / height
    } else {
        1.0
    };
    if lock {
        let f = if !horizontal {
            fy
        } else if !vertical || (fx - 1.0).abs() >= (fy - 1.0).abs() {
            fx
        } else {
            fy
        };
        fx = f;
        fy = f;
    }
    let (sx, sy) = (
        to_num(Some(&scale_of(o.object, "scaleX"))),
        to_num(Some(&scale_of(o.object, "scaleY"))),
    );
    if lock {
        fx = most(
            MIN_SCALE / least(sx, sy),
            least(MAX_SCALE / most(sx, sy), fx),
        );
        fy = fx;
    } else {
        fx = most(MIN_SCALE / sx, least(MAX_SCALE / sx, fx));
        fy = most(MIN_SCALE / sy, least(MAX_SCALE / sy, fy));
    }
    let anchor = (
        n(bounds, "x")
            + if has('w') {
                width
            } else if has('e') {
                0.0
            } else {
                width / 2.0
            },
        n(bounds, "y")
            + if has('n') {
                height
            } else if has('s') {
                0.0
            } else {
                height / 2.0
            },
    );
    let shift = vector(m, anchor.0 * (1.0 - fx), anchor.1 * (1.0 - fy));
    let base = o.surface.map_or((0.0, 0.0), |name| {
        let b = base_of(name, board);
        (b.0, b.1)
    });
    let base_offset = vector(m, base.0 * fx, base.1 * fy);
    let size = json!({
        "scaleX": out(sx * fx), "scaleY": out(sy * fy),
        "x": out(translation.0 + shift.0 + base_offset.0), "y": out(translation.1 + shift.1 + base_offset.1),
    });
    resize(view, &o, &size, Some(&size))
}

// ---------- surface-move.js ----------

/// The ids of the parts that stand wholly on what `owns`.
fn mounted_on<'a>(components: &'a [Value], owns: &dyn Fn(&Value) -> R<bool>) -> R<Vec<&'a Value>> {
    let mut ids = Vec::new();
    for p in components {
        if stands_on(p, owns)? {
            ids.push(p.get("id").unwrap_or(&Value::Null));
        }
    }
    Ok(ids)
}
/// The bends of the wires that run between anchors of the moved thing (its own, or of parts mounted on it), moved
/// by `to`: `[{index, points}]`, and what stopped it if a wire could not be read.
fn moved_bends(
    view: &Value,
    owns: &dyn Fn(&Value) -> R<bool>,
    mounted: &[&Value],
    to: &dyn Fn(f64, f64) -> (f64, f64),
) -> (Vec<Value>, Option<String>) {
    let mut wires = Vec::new();
    let attached = |anchor: Option<&Value>| -> R<bool> {
        let anchor = anchor.ok_or(BROKEN)?;
        if owns(anchor)? {
            return Ok(true);
        }
        let a = anchor.as_str().unwrap_or("");
        Ok(a.starts_with("part:")
            && a.split(':')
                .nth(1)
                .is_some_and(|id| mounted.iter().any(|m| m.as_str() == Some(id))))
    };
    let Some(list) = view.get("wires").and_then(Value::as_array) else {
        return (wires, Some("project.wires is not iterable".into()));
    };
    for (index, wire) in list.iter().enumerate() {
        let bends = || -> R<Option<Vec<Value>>> {
            if wire.is_null() {
                return Err(BROKEN.into());
            }
            let Some(points) = wire.get("points").filter(|p| truthy(p)) else {
                return Ok(None);
            };
            if !attached(wire.get("from"))? || !attached(wire.get("to"))? {
                return Ok(None);
            }
            let points = points
                .as_array()
                .ok_or("wire.points.map is not a function")?;
            let mut moved = Vec::with_capacity(points.len());
            for p in points {
                if p.is_null() {
                    return Err(BROKEN.into());
                }
                let q = to(to_num(p.get("x")), to_num(p.get("y")));
                moved.push(point(q.0, q.1));
            }
            Ok(Some(moved))
        };
        match bends() {
            Ok(Some(points)) => wires.push(json!({"index": index, "points": points})),
            Ok(None) => {}
            Err(reason) => return (wires, Some(reason)),
        }
    }
    (wires, None)
}
fn answer(mut change: Map<String, Value>, wires: Vec<Value>, error: Option<String>) -> Value {
    change.insert("wires".into(), Value::Array(wires));
    if let Some(reason) = error {
        change.insert("error".into(), json!(reason));
    }
    Value::Object(change)
}
/// Turning the main board by `delta` degrees (quarter turns) about its centre. Parts mounted on its headers and
/// the bend points of wires that run between its own pins turn with it; wire ends follow the pins.
/// → `{wires, resize}` (the bends first, then the board as `resize` answers it) or `{wires, error}`.
fn rotate_board(view: &Value, delta: Option<&Value>, board: &Value) -> R<Value> {
    let surface = surface_of(view, "board");
    if surface.and_then(|s| get(s, "hidden")).is_some_and(truthy) {
        return Err("주 보드가 회로에 없습니다.".into());
    }
    let surface = surface.unwrap_or(&EMPTY);
    let base = base_of("board", board);
    let origin = origin_of(view, "board", board);
    let (ox, oy) = (to_num(Some(&origin.0)), to_num(Some(&origin.1)));
    let before = frame_of(surface);
    let centre = surface_point(
        base.0 + base.2 / 2.0,
        base.1 + base.3 / 2.0,
        base.0,
        base.1,
        ox,
        oy,
        surface.get("rotation").is_some_and(truthy),
        before.0,
        before.1,
        before.2,
        before.3,
    );
    let ninety = json!(90);
    let rotation = quarter(sum(
        get(surface, "rotation").unwrap_or(&json!(0)),
        delta.unwrap_or(&ninety),
    ));
    let after = matrix((rotation, before.1, before.2, before.3));
    let half = vector(after, base.2 / 2.0, base.3 / 2.0);
    let destination = (centre.0 - half.0, centre.1 - half.1);
    let turn = multiply(after, inverse(matrix(before)));
    let owns = surface_owns("board");
    let mounted = mounted_on(list(view, "components")?, &owns)?;
    let (wires, error) = moved_bends(view, &owns, &mounted, &|x, y| {
        let q = vector(turn, x - ox, y - oy);
        (destination.0 + q.0, destination.1 + q.1)
    });
    let mut change = Map::new();
    if error.is_none() {
        let target = json!({"type": "surface", "id": "board"});
        let size =
            json!({"x": out(destination.0), "y": out(destination.1), "rotation": out(rotation)});
        let o = object_of(view, &target, board)?;
        match resize(view, &o, &size, Some(&size)) {
            Ok(resized) => {
                change.insert("resize".into(), resized);
            }
            Err(reason) => return Ok(answer(change, wires, Some(reason))),
        }
    }
    Ok(answer(change, wires, error))
}
/// Turning a board component (another STM32 board) by `delta` degrees about its centre, with the parts mounted
/// only on its pins and the bend points of wires between its own pins.
/// → `{parts: [{index, x, y, fields}], wires, rotation}` or the same as far as it went with `error`.
fn rotate_devboard(view: &Value, id: Option<&Value>, delta: Option<&Value>) -> R<Value> {
    let components = list(view, "components")?;
    let mut found = None;
    for p in components {
        if same(part_checked(p)?.get("id"), id) && kind(p) == "devboard" {
            found = Some(p);
            break;
        }
    }
    let part = found.ok_or("회전할 보드를 확인하세요.")?;
    let (ninety, none) = (json!(90), json!({"\u{1}nf": "undefined"}));
    let now = to_num(part.get("rotation"));
    let rotation = quarter(sum(
        part.get("rotation").unwrap_or(&none),
        delta.unwrap_or(&ninety),
    ));
    let turn = multiply(
        matrix_of(rotation, 1.0, 1.0, 0.0),
        inverse(matrix_of(quarter(now), 1.0, 1.0, 0.0)),
    );
    let prefix = format!("devboard:{}:", show(id));
    let owns = |anchor: &Value| starts(anchor, &[prefix.as_str()]);
    let mounted = mounted_on(components, &owns)?;
    let (px, py) = (to_num(part.get("x")), to_num(part.get("y")));
    let about = |x: f64, y: f64| {
        let q = vector(turn, x - px, y - py);
        (px + q.0, py + q.1)
    };
    let mut change = Map::new();
    let mut parts = Vec::new();
    let mut error = None;
    for (index, p) in components.iter().enumerate() {
        if !mounted
            .iter()
            .any(|m| same(Some(*m), p.get("id").or(Some(&Value::Null))))
        {
            continue;
        }
        match matrix_fields(multiply(turn, matrix(frame_of(p)))) {
            Ok(fields) => {
                let at = about(to_num(p.get("x")), to_num(p.get("y")));
                parts.push(
                    json!({"index": index, "x": out(at.0), "y": out(at.1), "fields": fields}),
                );
            }
            Err(reason) => {
                error = Some(reason);
                break;
            }
        }
    }
    change.insert("parts".into(), Value::Array(parts));
    change.insert("rotation".into(), out(rotation));
    if error.is_some() {
        return Ok(answer(change, Vec::new(), error));
    }
    let (wires, error) = moved_bends(view, &owns, &mounted, &about);
    Ok(answer(change, wires, error))
}
/// Moving a surface to a place, with the bends of the wires that run on it.
/// → `{resize, wires}` (the surface first, then the bends) or the same as far as it went with `error`.
fn move_surface(view: &Value, id: Option<&Value>, position: &Value, board: &Value) -> R<Value> {
    let Some(name) = text(id).filter(|n| *n == "board" || *n == "breadboard") else {
        return Err("이동할 보드를 확인하세요.".into());
    };
    let origin = origin_of(view, name, board);
    if position.is_null() {
        return Err(BROKEN.into());
    }
    let (dx, dy) = (
        to_num(position.get("x")) - to_num(Some(&origin.0)),
        to_num(position.get("y")) - to_num(Some(&origin.1)),
    );
    let owns = surface_owns(name);
    let mounted = mounted_on(list(view, "components")?, &owns)?;
    let target = json!({"type": "surface", "id": name});
    let o = object_of(view, &target, board)?;
    let mut change = Map::new();
    change.insert("resize".into(), resize(view, &o, position, Some(position))?);
    let (wires, error) = moved_bends(view, &owns, &mounted, &|x, y| (x + dx, y + dy));
    Ok(answer(change, wires, error))
}

// ---------- surfaces.js ----------

/// Taking the main board or the built-in breadboard out of a circuit: for every part what stays of its attachments
/// (in the order of the parts), and which wires stay. → `{parts: [map], wires: [bool]}` or `{parts, error}`.
fn remove_surface(view: &Value, key: Option<&Value>) -> R<Value> {
    let board = text(key) == Some("board");
    let owns = |id: &Value| -> R<bool> {
        if board {
            starts(id, &["board:"])
        } else {
            let shown = show(Some(id));
            Ok(shown.starts_with("bb:") || shown.starts_with("rail:"))
        }
    };
    let mut change = Map::new();
    let mut parts = Vec::new();
    let mut error = None;
    'parts: for p in list(view, "components")? {
        if p.is_null() {
            error = Some(BROKEN.to_string());
            break;
        }
        let mut kept = Map::new();
        for (terminal, anchor) in attachments(p) {
            match owns(&anchor) {
                Ok(true) => {}
                Ok(false) => {
                    kept.insert(terminal, anchor);
                }
                Err(reason) => {
                    error = Some(reason);
                    break 'parts;
                }
            }
        }
        parts.push(Value::Object(kept));
    }
    change.insert("parts".into(), Value::Array(parts));
    if error.is_none() {
        let mut wires = Vec::new();
        for w in list(view, "wires")? {
            let stays = |end: &str| -> R<bool> {
                if w.is_null() {
                    return Err(BROKEN.into());
                }
                Ok(!owns(w.get(end).unwrap_or(&Value::Null))?)
            };
            match stays("from").and_then(|from| Ok(from && stays("to")?)) {
                Ok(keep) => wires.push(json!(keep)),
                Err(reason) => {
                    error = Some(reason);
                    break;
                }
            }
        }
        if error.is_none() {
            change.insert("wires".into(), Value::Array(wires));
        }
    }
    if let Some(reason) = error {
        change.insert("error".into(), json!(reason));
    }
    Ok(Value::Object(change))
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, given: &[Value]) -> Option<Result<Value, String>> {
    if !matches!(
        name,
        "resize_object"
            | "resize_frame"
            | "resize_from_handle"
            | "rotate_board"
            | "rotate_devboard"
            | "move_surface"
            | "remove_surface"
    ) {
        return None;
    }
    // A setting that is `undefined` is one the object does not have.
    let args: Vec<Value> = given.iter().map(without_undefined).collect();
    let null = Value::Null;
    let a = |i: usize| there(given.get(i)).and(args.get(i));
    let v = |i: usize| a(i).unwrap_or(&null);
    Some(match name {
        // [view, target, size, BOARD]
        "resize_object" => object_of(v(0), v(1), v(3)).and_then(|o| resize(v(0), &o, v(2), a(2))),
        // [view, target, BOARD] → {matrix: {a, b, c, d}, translation: {x, y}}
        "resize_frame" => object_of(v(0), v(1), v(2)).map(|o| {
            let (m, t) = frame(&o, v(2));
            json!({"matrix": {"a": out(m.0), "b": out(m.1), "c": out(m.2), "d": out(m.3)}, "translation": point(t.0, t.1)})
        }),
        // [view, target, bounds, handle, start, end, lockAspect, BOARD]
        "resize_from_handle" => {
            resize_from_handle(v(0), v(1), v(2), a(3), v(4), v(5), truthy(v(6)), v(7))
        }
        // [view, delta, BOARD]
        "rotate_board" => rotate_board(v(0), a(1), v(2)),
        // [view, id, delta]
        "rotate_devboard" => rotate_devboard(v(0), a(1), a(2)),
        // [view, id, position, BOARD]
        "move_surface" => move_surface(v(0), a(1), v(2), v(3)),
        // [view, key]
        "remove_surface" => remove_surface(v(0), a(1)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board() -> Value {
        json!({"x": 45, "y": 48, "w": 385.83, "h": 454.72})
    }
    fn view() -> Value {
        json!({
            "components": [
                {"id": "r", "type": "resistor", "x": 700, "y": 200, "rotation": 0, "span": 42, "attachA": "bb:a:1", "attachB": "bb:d:1"},
                {"id": "l", "type": "led", "x": 100, "y": 100, "rotation": 0, "attachA": "board:CN7:1", "attachB": "board:CN7:3"},
                {"id": "free", "type": "led", "x": 5, "y": 5, "rotation": 0},
            ],
            "surfaces": {"board": {"hidden": false}, "breadboard": {"hidden": false}},
            "wires": [
                {"from": "board:CN7:1", "to": "part:l:a", "points": [{"x": 50, "y": 60}]},
                {"from": "bb:a:2", "to": "board:CN7:5", "points": [{"x": 1, "y": 2}]},
            ],
        })
    }

    #[test]
    fn a_surface_takes_its_parts_and_bends_along() {
        let moved = move_surface(
            &view(),
            Some(&json!("breadboard")),
            &json!({"x": 654.5, "y": 119.5}),
            &board(),
        )
        .unwrap();
        assert_eq!(moved["resize"]["children"][0]["index"], 0);
        assert_eq!(moved["resize"]["children"][0]["x"], 710.0);
        assert_eq!(moved["resize"]["children"][0]["y"], 220.0);
        assert_eq!(moved["wires"], json!([]));
        let turned = rotate_board(&view(), None, &board()).unwrap();
        assert_eq!(turned["resize"]["rotation"], 90);
        assert_eq!(turned["resize"]["children"][0]["index"], 1);
        assert_eq!(turned["wires"][0]["index"], 0);
        assert_eq!(turned["wires"].as_array().unwrap().len(), 1);
        let gone = remove_surface(&view(), Some(&json!("board"))).unwrap();
        assert_eq!(gone["parts"][1], json!({}));
        assert_eq!(gone["parts"][0], json!({"a": "bb:a:1", "b": "bb:d:1"}));
        assert_eq!(gone["wires"], json!([false, false]));
    }

    #[test]
    fn resizing_checks_before_it_changes() {
        let (circuit, target) = (view(), json!({"type": "part", "id": "free"}));
        let o = object_of(&circuit, &target, &board()).unwrap();
        let doubled = resize(&circuit, &o, &json!(2), Some(&json!(2))).unwrap();
        assert_eq!(doubled["fields"], json!({"scale": 2}));
        assert_eq!(doubled["x"], 5);
        assert!(resize(&circuit, &o, &json!(0), Some(&json!(0))).is_err());
        assert_eq!(
            object_of(&view(), &json!({"type": "part", "id": "nothing"}), &board())
                .err()
                .unwrap(),
            "크기를 바꿀 장치를 선택하세요."
        );
        assert_eq!(quarter(-90.0), 270.0);
        assert_eq!(quarter(405.0), 90.0);
    }
}
