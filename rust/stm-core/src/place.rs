//! Putting parts into breadboard holes and moving the breadboards they stand on.
//!
//! Moved here from `src/placement.js` and `src/breadboards.js` (feature 62). The JavaScript side sends what these
//! need of a project — each part's kind, place and attachments, the surfaces, the wires' ends — and applies the
//! answer to the project's own objects.

use crate::geom::{least, matrix_of, most, surface_point, vector};
use crate::jsmath::hypot_fast;
use crate::mcu::js_display;
use crate::parts::{part_shape, rotate_point};
use crate::raconfig::{out, to_num, truthy, without_undefined};
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

pub const MAX_BREADBOARDS: usize = 8;
const BB: (f64, f64, f64, f64) = (644.5, 99.5, 301.0, 463.0);
const FULL: (f64, f64, f64, f64) = (0.0, 0.0, 910.0, 301.0);
const BROKEN: &str = "Cannot read properties of undefined";

struct Hole {
    id: String,
    label: String,
    x: f64,
    y: f64,
    bus: String,
}
fn table(list: Vec<Value>) -> Vec<Hole> {
    let text = |h: &Value, k: &str| h[k].as_str().unwrap_or("").to_string();
    list.iter()
        .map(|h| Hole {
            id: text(h, "id"),
            label: text(h, "label"),
            x: h["x"].as_f64().unwrap_or(f64::NAN),
            y: h["y"].as_f64().unwrap_or(f64::NAN),
            bus: text(h, "bus"),
        })
        .collect()
}
static HALF: LazyLock<Vec<Hole>> = LazyLock::new(|| table(crate::pins::half_holes()));
static WHOLE: LazyLock<Vec<Hole>> = LazyLock::new(|| table(crate::pins::full_holes()));

pub(crate) fn kind(p: &Value) -> &str {
    p.get("type").and_then(Value::as_str).unwrap_or("")
}
fn is_full(p: &Value) -> bool {
    p.get("variant") == Some(&json!("full"))
}
/// `p[key] ?? default` as a number.
fn field(p: &Value, key: &str, default: f64) -> f64 {
    match p.get(key).filter(|v| !v.is_null()) {
        Some(v) => to_num(Some(v)),
        None => default,
    }
}
/// (rotation, scaleX, scaleY, skewX) of a part or a surface.
pub(crate) fn frame_of(p: &Value) -> (f64, f64, f64, f64) {
    let both = field(p, "scale", 1.0);
    (
        field(p, "rotation", 0.0),
        field(p, "scaleX", both),
        field(p, "scaleY", both),
        field(p, "skewX", 0.0),
    )
}
/// A hole in the workspace: one of a hole table, of the built-in breadboard (`owner` none) or of a breadboard part
/// (its index among the `Boards`). Its id and label are made only when it is chosen.
struct Spot {
    owner: Option<usize>,
    hole: &'static Hole,
    x: f64,
    y: f64,
}
/// The breadboard parts of a circuit: (prefix of their hole ids, name).
struct Boards {
    list: Vec<(String, String)>,
}
impl Boards {
    fn id(&self, s: &Spot) -> String {
        s.owner.map_or_else(
            || s.hole.id.clone(),
            |k| format!("{}{}", self.list[k].0, s.hole.id),
        )
    }
    fn label(&self, s: &Spot) -> String {
        s.owner.map_or_else(
            || s.hole.label.clone(),
            |k| format!("{} · {}", self.list[k].1, s.hole.label),
        )
    }
    fn bus(&self, s: &Spot) -> String {
        s.owner.map_or_else(
            || s.hole.bus.clone(),
            |k| format!("{}{}", self.list[k].0, s.hole.bus),
        )
    }
}
fn built_in_hidden(surfaces: &Value) -> bool {
    surfaces
        .get("breadboard")
        .and_then(|b| b.get("hidden"))
        .is_some_and(truthy)
}
/// Every hole of the circuit: the built-in breadboard's (unless it is hidden) and each breadboard part's.
fn circuit_holes(components: &[Value], surfaces: &Value) -> (Vec<Spot>, Boards) {
    let mut spots = Vec::new();
    if !built_in_hidden(surfaces) {
        let null = Value::Null;
        let s = surfaces.get("breadboard").unwrap_or(&null);
        let (rotation, sx, sy, skew) = frame_of(s);
        let turned = s.get("rotation").is_some_and(truthy);
        let (ox, oy) = (field(s, "x", BB.0), field(s, "y", BB.1));
        spots.extend(HALF.iter().map(|hole| {
            let (x, y) = surface_point(
                hole.x, hole.y, BB.0, BB.1, ox, oy, turned, rotation, sx, sy, skew,
            );
            Spot {
                owner: None,
                hole,
                x,
                y,
            }
        }));
    }
    let mut boards = Boards { list: Vec::new() };
    for part in components.iter().filter(|p| kind(p) == "breadboard") {
        let (local, frame) = if is_full(part) {
            (&*WHOLE, FULL)
        } else {
            (&*HALF, BB)
        };
        let (rotation, sx, sy, skew) = frame_of(part);
        let m = matrix_of(rotation, sx, sy, skew);
        let (px, py) = (to_num(part.get("x")), to_num(part.get("y")));
        let owner = Some(boards.list.len());
        boards.list.push((
            format!("breadboard:{}:", js_display(part.get("id"))),
            js_display(part.get("name")),
        ));
        spots.extend(local.iter().map(|hole| {
            let q = vector(
                m,
                hole.x - (frame.0 + frame.2 / 2.0),
                hole.y - (frame.1 + frame.3 / 2.0),
            );
            Spot {
                owner,
                hole,
                x: px + q.0,
                y: py + q.1,
            }
        }));
    }
    (spots, boards)
}
static HALF_IDS: LazyLock<std::collections::HashSet<&'static str>> =
    LazyLock::new(|| HALF.iter().map(|h| h.id.as_str()).collect());
static WHOLE_IDS: LazyLock<std::collections::HashSet<&'static str>> =
    LazyLock::new(|| WHOLE.iter().map(|h| h.id.as_str()).collect());
/// Whether an id names a hole (of the built-in breadboard, or of a breadboard part of the circuit).
fn is_hole(id: &str, components: &[Value]) -> bool {
    hole_exists(id, components, false)
}
/// Where a hole is in the workspace with the built-in breadboard at its own place, or none for an id that is not a
/// hole (`holeInfo(id, components)` of pins.js).
pub(crate) fn hole_place(id: &str, components: &[Value]) -> Option<(f64, f64)> {
    let (spots, boards) = circuit_holes(components, &Value::Null);
    spots
        .iter()
        .find(|s| boards.id(s) == id)
        .map(|s| (s.x, s.y))
}
/// `is_hole` for a circuit whose built-in breadboard may be hidden (its holes are then not there).
pub(crate) fn hole_exists(id: &str, components: &[Value], built_in_hidden: bool) -> bool {
    if HALF_IDS.contains(id) && !built_in_hidden {
        return true;
    }
    let Some(rest) = id.strip_prefix("breadboard:") else {
        return false;
    };
    let Some((owner, local)) = rest.split_once(':').filter(|(o, _)| !o.is_empty()) else {
        return false;
    };
    components
        .iter()
        .find(|p| kind(p) == "breadboard" && p.get("id").and_then(Value::as_str) == Some(owner))
        .is_some_and(|part| {
            if is_full(part) {
                WHOLE_IDS.contains(local)
            } else {
                HALF_IDS.contains(local)
            }
        })
}
/// `p.id !== exceptId`: with no id to leave out, a part without an id is left out too.
fn other_than(part: &Value, except: Option<&Value>) -> bool {
    match except {
        None => part.get("id").is_some(),
        Some(id) => part.get("id") != Some(id),
    }
}
fn catalog_two_pin(kind: &str) -> bool {
    crate::catalog::all()["CATALOG_TWO_PIN"]
        .as_array()
        .is_some_and(|t| t.iter().any(|x| x == kind))
}
static TWO_PIN: LazyLock<Vec<String>> = LazyLock::new(|| {
    crate::parts::tables()["TWO_PIN_TYPES"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(String::from)
        .collect()
});
/// (terminal key, anchor) of what a part is attached to.
pub(crate) fn attachments(p: &Value) -> Vec<(String, Value)> {
    let k = kind(p);
    if TWO_PIN.iter().any(|t| t == k) {
        let keys = if catalog_two_pin(k) {
            ["p1", "p2"]
        } else {
            ["a", "b"]
        };
        return [("attachA", keys[0]), ("attachB", keys[1])]
            .iter()
            .filter_map(|(field, key)| {
                p.get(*field)
                    .filter(|a| truthy(a))
                    .map(|a| ((*key).to_string(), a.clone()))
            })
            .collect();
    }
    p.get("attachments")
        .filter(|a| truthy(a))
        .and_then(Value::as_object)
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default()
}
fn map_json(list: &[(String, Value)]) -> Value {
    Value::Object(list.iter().cloned().collect::<Map<String, Value>>())
}
fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

// Find one complete, collision-free footprint. Never connect only some new legs. Small lead bends are allowed; all
// electrical and visible contact points use exact holes.
pub fn find_mount(
    p: &Value,
    components: &[Value],
    radius: f64,
    surfaces: &Value,
    wires: &[Value],
) -> Value {
    if kind(p) == "breadboard" {
        return Value::Null;
    }
    // Contacts wired directly (screw terminals, connectors) never go into holes; a module with only those stays off
    // the board.
    let shape = part_shape(p);
    let wired: Vec<&str> = shape["wired"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let flat = shape["nominal"].as_array().map_or(&[][..], Vec::as_slice);
    let terms: Vec<(String, f64, f64)> = shape["at"]
        .as_array()
        .into_iter()
        .flatten()
        .enumerate()
        .map(|(i, key)| {
            (
                key.as_str().unwrap_or("").to_string(),
                to_num(flat.get(2 * i)),
                to_num(flat.get(2 * i + 1)),
            )
        })
        .filter(|(key, _, _)| !wired.contains(&key.as_str()))
        .collect();
    let Some(first) = terms.first() else {
        return Value::Null;
    };
    let own = p.get("id");
    let mut occupied: Vec<String> = Vec::new();
    for other in components.iter().filter(|c| other_than(c, own)) {
        for (_, anchor) in attachments(other) {
            let id = js_display(Some(&anchor));
            if is_hole(&id, components) {
                occupied.push(id);
            }
        }
    }
    // Holes holding a jumper wire end: a part lead cannot go into the same hole.
    for w in wires {
        occupied.extend(
            [w.get("from"), w.get("to")]
                .into_iter()
                .flatten()
                .map(|e| js_display(Some(e))),
        );
    }
    let (spots, boards) = circuit_holes(components, surfaces);
    // What is taken, by board: the built-in one by its hole ids, a breadboard part by what follows its prefix.
    let taken_here: std::collections::HashSet<&str> = occupied.iter().map(String::as_str).collect();
    let taken_on: Vec<std::collections::HashSet<&str>> = boards
        .list
        .iter()
        .map(|(prefix, _)| {
            occupied
                .iter()
                .filter_map(|id| id.strip_prefix(prefix.as_str()))
                .collect()
        })
        .collect();
    let available: Vec<&Spot> = spots
        .iter()
        .filter(|s| match s.owner {
            None => !taken_here.contains(s.hole.id.as_str()),
            Some(k) => !taken_on[k].contains(s.hole.id.as_str()),
        })
        .collect();
    let mut candidates: Vec<(usize, f64)> = available
        .iter()
        .enumerate()
        .map(|(i, h)| (i, hypot_fast(h.x - first.1, h.y - first.2)))
        .filter(|(_, d)| *d <= radius)
        .collect();
    candidates.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    candidates.truncate(8);
    let (px, py) = (to_num(p.get("x")), to_num(p.get("y")));
    // (score, x, y, the chosen hole of each terminal)
    let mut best: Option<(f64, f64, f64, Vec<usize>)> = None;
    let mut used = vec![false; available.len()];
    for (start, _) in candidates {
        let (dx, dy) = (available[start].x - first.1, available[start].y - first.2);
        used.fill(false);
        let (mut chosen, mut error, mut valid) = (Vec::with_capacity(terms.len()), 0.0, true);
        for (_, tx, ty) in &terms {
            let (target_x, target_y) = (tx + dx, ty + dy);
            let (mut near, mut min) = (None, 8.1);
            for (i, hole) in available.iter().enumerate() {
                if used[i] {
                    continue;
                }
                // A hole as far as `min` on one axis alone cannot be nearer than `min`.
                let (ax, ay) = (hole.x - target_x, hole.y - target_y);
                if ax.abs() >= min || ay.abs() >= min {
                    continue;
                }
                let d = hypot_fast(ax, ay);
                if d < min {
                    near = Some(i);
                    min = d;
                }
            }
            let Some(i) = near else {
                valid = false;
                break;
            };
            used[i] = true;
            chosen.push(i);
            error += min * min;
        }
        let score = dx * dx + dy * dy + error * 4.0;
        if valid && best.as_ref().is_none_or(|b| score < b.0) {
            best = Some((score, px + dx, py + dy, chosen));
        }
    }
    let Some((score, x, y, chosen)) = best else {
        return Value::Null;
    };
    let (mut map, mut points) = (Map::new(), Vec::new());
    for ((key, _, _), i) in terms.iter().zip(chosen) {
        let h = available[i];
        let id = boards.id(h);
        points.push(json!({"id": id, "label": boards.label(h), "x": out(h.x), "y": out(h.y), "bus": boards.bus(h), "key": key}));
        map.insert(key.clone(), json!(id));
    }
    json!({"x": out(x), "y": out(y), "attachments": map, "points": points, "score": out(score)})
}
/// Axis-aligned bounds of a breadboard component in circuit coordinates: (left, right, top, bottom).
pub fn breadboard_bounds(part: &Value) -> (f64, f64, f64, f64) {
    let frame = if is_full(part) { FULL } else { BB };
    let (rotation, sx, sy, skew) = frame_of(part);
    let m = matrix_of(rotation, sx, sy, skew);
    let (px, py) = (to_num(part.get("x")), to_num(part.get("y")));
    let corners = [(-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)].map(|(a, b)| {
        let v = vector(m, a * frame.2 / 2.0, b * frame.3 / 2.0);
        (px + v.0, py + v.1)
    });
    let (xs, ys) = (corners.map(|c| c.0), corners.map(|c| c.1));
    (least(xs), most(xs), least(ys), most(ys))
}
/// Fields for a new breadboard component of the given library type, placed clear of the existing boards.
pub fn new_breadboard_fields(project: &Value, library_type: &str) -> Result<Value, String> {
    let full = library_type == "breadboard_full";
    let boards: Vec<&Value> = list(project, "components")
        .iter()
        .filter(|p| kind(p) == "breadboard")
        .collect();
    if boards.len() >= MAX_BREADBOARDS {
        return Err("추가 빵판은 8개까지 사용할 수 있습니다.".into());
    }
    let (w, h) = if full { (FULL.2, FULL.3) } else { (BB.2, BB.3) };
    let hidden = project.get("surfaces").is_some_and(built_in_hidden);
    let mut taken: Vec<(f64, f64, f64, f64)> =
        boards.iter().map(|b| breadboard_bounds(b)).collect();
    if !hidden {
        taken.push((BB.0, BB.0 + BB.2, BB.1, BB.1 + BB.3));
    }
    let start_x = BB.0 + if hidden { 0.0 } else { BB.2 + 48.0 };
    let fields = |x: f64, y: f64| {
        let mut f = Map::new();
        f.insert("type".into(), json!("breadboard"));
        f.insert("x".into(), out(x));
        f.insert("y".into(), out(y));
        f.insert("rotation".into(), json!(0));
        if full {
            f.insert("variant".into(), json!("full"));
        }
        Value::Object(f)
    };
    for i in 0..64u32 {
        let x = start_x + w / 2.0 + (w + 48.0) * f64::from(i % 4);
        let y = BB.1 + h / 2.0 + (h + 60.0) * f64::from(i / 4);
        let (left, right, top, bottom) = (x - w / 2.0, x + w / 2.0, y - h / 2.0, y + h / 2.0);
        if !taken.iter().any(|b| {
            b.0 < right + 24.0 && b.1 > left - 24.0 && b.2 < bottom + 24.0 && b.3 > top - 24.0
        }) {
            return Ok(fields(x, y));
        }
    }
    Ok(fields(start_x + w / 2.0, BB.1 + h / 2.0))
}
fn angle(n: f64) -> f64 {
    ((n % 360.0) + 360.0) % 360.0
}
fn owned(anchor: &Value, prefix: &str) -> Result<bool, String> {
    anchor
        .as_str()
        .map(|a| a.starts_with(prefix))
        .ok_or_else(|| BROKEN.to_string())
}
/// What moving a breadboard part changes: the board's place, and for each part by its index either its new place
/// (a part standing wholly on the board goes with it) or its attachments without the board's holes. Wire endpoints
/// retain their own board identity when boards move or overlap. Null when there is no such board.
pub fn move_breadboard(project: &Value, id: &Value, position: &Value) -> Result<Value, String> {
    let components = list(project, "components");
    let Some(board) = components
        .iter()
        .find(|p| p.get("id") == Some(id) && kind(p) == "breadboard")
    else {
        return Ok(Value::Null);
    };
    let prefix = format!("breadboard:{}:", js_display(Some(id)));
    let turn = angle(match position.get("rotation").filter(|r| !r.is_null()) {
        Some(r) => to_num(Some(r)),
        None => to_num(board.get("rotation")),
    });
    let delta = turn - to_num(board.get("rotation"));
    let (bx, by, nx, ny) = (
        to_num(board.get("x")),
        to_num(board.get("y")),
        to_num(position.get("x")),
        to_num(position.get("y")),
    );
    let mut parts = Vec::new();
    for (index, part) in components.iter().enumerate() {
        if std::ptr::eq(part, board) {
            continue;
        }
        let map = attachments(part);
        let mut kept = Vec::new();
        for (key, anchor) in &map {
            if !owned(anchor, &prefix)? {
                kept.push((key.clone(), anchor.clone()));
            }
        }
        if kept.len() == map.len() {
            continue;
        }
        if kept.is_empty() {
            let q = rotate_point(
                to_num(part.get("x")) - bx,
                to_num(part.get("y")) - by,
                delta,
            );
            parts.push(json!({"index": index, "x": out(nx + q.0), "y": out(ny + q.1), "rotation": out(angle(to_num(part.get("rotation")) + delta))}));
        } else {
            parts.push(json!({"index": index, "attachments": map_json(&kept)}));
        }
    }
    Ok(
        json!({"board": {"x": position.get("x"), "y": position.get("y"), "rotation": out(turn)}, "parts": parts}),
    )
}
/// What taking a breadboard part out changes: the attachments of the parts that stood on it (by index) and which
/// wires stay (those with no end in its holes).
pub fn remove_breadboard(project: &Value, id: &Value) -> Result<Value, String> {
    let prefix = format!("breadboard:{}:", js_display(Some(id)));
    let mut parts = Vec::new();
    for (index, part) in list(project, "components").iter().enumerate() {
        let map = attachments(part);
        let mut kept = Vec::new();
        for (key, anchor) in &map {
            if !owned(anchor, &prefix)? {
                kept.push((key.clone(), anchor.clone()));
            }
        }
        if kept.len() != map.len() {
            parts.push(json!({"index": index, "attachments": map_json(&kept)}));
        }
    }
    let mut wires = Vec::new();
    for w in list(project, "wires") {
        let end = |key: &str| {
            w.get(key)
                .and_then(Value::as_str)
                .map(|e| e.starts_with(&prefix))
                .ok_or_else(|| BROKEN.to_string())
        };
        wires.push(json!(!(end("from")? || end("to")?)));
    }
    Ok(json!({"parts": parts, "wires": wires}))
}

fn has_undefined(v: &Value) -> bool {
    match v {
        Value::Object(o) => {
            o.get(crate::raconfig::NF).is_some_and(|m| m == "undefined")
                || o.values().any(has_undefined)
        }
        Value::Array(items) => items.iter().any(has_undefined),
        _ => false,
    }
}
/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, given: &[Value]) -> Option<Result<Value, String>> {
    if !matches!(
        name,
        "find_mount"
            | "breadboard_bounds"
            | "new_breadboard_fields"
            | "move_breadboard"
            | "remove_breadboard"
            | "occupied_holes"
    ) {
        return None;
    }
    // A setting that is `undefined` is one the part does not have. The JavaScript side leaves such settings out, so
    // the copy without them is made only when one came all the same.
    let cleaned: Vec<Value>;
    let args: &[Value] = if given.iter().any(has_undefined) {
        cleaned = given.iter().map(without_undefined).collect();
        &cleaned
    } else {
        given
    };
    let null = Value::Null;
    let v = |i: usize| {
        args.get(i)
            .filter(|x| x.get(crate::raconfig::NF) != Some(&json!("undefined")))
            .unwrap_or(&null)
    };
    let items = |i: usize| v(i).as_array().map_or(&[][..], Vec::as_slice);
    Some(match name {
        "find_mount" => Ok(find_mount(
            v(0),
            items(1),
            if v(2).is_null() {
                15.0
            } else {
                to_num(Some(v(2)))
            },
            v(3),
            items(4),
        )),
        "breadboard_bounds" => {
            let b = breadboard_bounds(v(0));
            Ok(json!({"left": out(b.0), "right": out(b.1), "top": out(b.2), "bottom": out(b.3)}))
        }
        "new_breadboard_fields" => {
            new_breadboard_fields(v(0), v(1).as_str().unwrap_or("breadboard"))
        }
        "move_breadboard" => move_breadboard(v(0), v(1), v(2)),
        "remove_breadboard" => remove_breadboard(v(0), v(1)),
        // The holes other parts stand in: [components, the id of the part left out].
        _ => {
            let mut used: Vec<Value> = Vec::new();
            let except = args
                .get(1)
                .filter(|x| x.get(crate::raconfig::NF) != Some(&json!("undefined")));
            for other in items(0).iter().filter(|c| other_than(c, except)) {
                for (_, anchor) in attachments(other) {
                    if is_hole(&js_display(Some(&anchor)), items(0)) && !used.contains(&anchor) {
                        used.push(anchor);
                    }
                }
            }
            Ok(Value::Array(used))
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_resistor_finds_two_free_holes() {
        let p = json!({"id": "r1", "type": "resistor", "x": 739.0, "y": 129.0, "rotation": 0, "span": 42});
        let mount = find_mount(&p, std::slice::from_ref(&p), 15.0, &Value::Null, &[]);
        assert_eq!(mount["attachments"], json!({"a": "bb:a:1", "b": "bb:d:1"}));
        assert_eq!(
            (mount["x"].as_f64(), mount["y"].as_f64()),
            (Some(739.0), Some(128.0))
        );
        let taken = find_mount(
            &p,
            std::slice::from_ref(&p),
            15.0,
            &Value::Null,
            &[json!({"from": "bb:a:1", "to": "board:CN7:1"})],
        );
        assert_ne!(taken["attachments"]["a"], "bb:a:1");
        assert!(find_mount(
            &json!({"id": "b", "type": "breadboard"}),
            &[],
            15.0,
            &Value::Null,
            &[]
        )
        .is_null());
        assert_eq!(
            new_breadboard_fields(&json!({"components": []}), "breadboard").unwrap()["x"],
            644.5 + 301.0 + 48.0 + 150.5
        );
    }
}
