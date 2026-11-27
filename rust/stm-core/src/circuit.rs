//! The nets of a circuit and its DC solution: which pins, holes and part terminals are one net, and the voltage of
//! each net and the current through each part for the pins a program drives.
//!
//! Moved here from `src/engine.js`, `src/circuit-topology.js`, `src/catalog-topology.js`,
//! `src/catalog-electrical.js` and the functions of `src/l298n.js` (feature 62). The nets of a circuit change only
//! when the circuit does, and a run solves the same circuit many times a step, so the nets stay here between solves
//! (`nets` answers a handle); a solve then sends only what changes while a program runs — the pins, the pressed
//! buttons, the settings of the parts.

use crate::devdefs::{ldr_resistance, ntc_resistance};
use crate::mcu::js_number;
use crate::raconfig::{num, out, show, there, to_num, truthy, NF};
use serde_json::{json, Map, Value};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

type R<T> = Result<T, String>;
const BROKEN: &str = "Cannot read properties of undefined";

fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    there(v.get(key))
}
/// `v[key]` where it is there and not null (`??`).
fn set<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    get(v, key).filter(|x| !x.is_null())
}
fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn n(v: &Value, key: &str) -> f64 {
    to_num(get(v, key))
}
fn on(v: &Value, key: &str) -> bool {
    get(v, key).is_some_and(truthy)
}
fn undefined() -> Value {
    json!({NF: "undefined"})
}
/// `Math.max` of two numbers: NaN when either is.
fn most(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.max(b)
    }
}
/// `v.toFixed(1)` of a number that is not negative.
fn fixed1(v: f64) -> String {
    if !v.is_finite() {
        return js_number(v);
    }
    // A double is exactly half-way between two tenths only when it is an odd number of twentieths.
    let twentieths = v * 20.0;
    if twentieths.fract() == 0.0 && twentieths % 2.0 == 1.0 && v * 10.0 == (v * 10.0).floor() + 0.5
    {
        format!("{:.1}", ((v * 10.0).floor() + 1.0) / 10.0)
    } else {
        format!("{v:.1}")
    }
}

// ---------- nets ----------

/// Sets of ids that are one net. The representative of a set and the order the ids were first seen in are as the
/// JavaScript's (`UnionFind` of engine.js), so the same ids answer the same roots.
#[derive(Clone, Default)]
pub struct Nets {
    ids: Vec<String>,
    index: HashMap<String, usize>,
    parent: Vec<usize>,
}
impl Nets {
    fn at(&mut self, id: &str) -> usize {
        if let Some(i) = self.index.get(id) {
            return *i;
        }
        let i = self.ids.len();
        self.ids.push(id.to_string());
        self.index.insert(id.to_string(), i);
        self.parent.push(i);
        i
    }
    fn root(&mut self, mut i: usize) -> usize {
        let mut top = i;
        while self.parent[top] != top {
            top = self.parent[top];
        }
        while self.parent[i] != top {
            let next = self.parent[i];
            self.parent[i] = top;
            i = next;
        }
        top
    }
    /// The root of an id (an id not seen before is its own).
    pub fn find(&mut self, id: &str) -> usize {
        let i = self.at(id);
        self.root(i)
    }
    pub fn join(&mut self, a: &str, b: &str) {
        let (x, y) = (self.find(a), self.find(b));
        self.parent[x] = y;
    }
    pub fn name(&self, root: usize) -> &str {
        &self.ids[root]
    }
    /// The ids in the order they were first seen and, for each, where its parent is in that list: what the
    /// JavaScript side makes its own `UnionFind` of.
    fn listed(&self) -> Value {
        json!({"ids": self.ids, "parent": self.parent})
    }
}

static PINS: LazyLock<Value> = LazyLock::new(crate::pins::tables);
/// The header pins of a board (`boardPins` of pins.js).
fn board_pins(board: Option<&Value>) -> &'static [Value] {
    let id = board.and_then(Value::as_str).unwrap_or("");
    let list = if id == "fpb-ra6e1" {
        &PINS["FPB_PINS"]
    } else {
        PINS["BOARD_PINS"].get(id).unwrap_or(&PINS["NUCLEO_PINS"])
    };
    list.as_array().map_or(&[], Vec::as_slice)
}
/// (id, bus) of the holes of a breadboard: the 400-point board, or the 830-point one.
static HOLES: LazyLock<[Vec<(String, String)>; 2]> = LazyLock::new(|| {
    [crate::pins::half_holes(), crate::pins::full_holes()].map(|list| {
        list.iter()
            .map(|h| (text(h, "id").to_string(), text(h, "bus").to_string()))
            .collect()
    })
});
/// (key, signal) of the pins of a board part's model, by the model's id.
static BOARD_PARTS: LazyLock<HashMap<String, Vec<(String, String)>>> = LazyLock::new(|| {
    crate::boards::catalog()
        .as_array()
        .into_iter()
        .flatten()
        .filter(|b| b.get("vendor").and_then(Value::as_str) != Some("renesas"))
        .filter_map(|b| b["id"].as_str())
        .map(|id| {
            let pins = crate::devboards::model_pins(id, 0.0, 0.0)
                .iter()
                .map(|p| (text(p, "key").to_string(), text(p, "signal").to_string()))
                .collect();
            (id.to_string(), pins)
        })
        .collect()
});
fn board_part(p: &Value) -> Option<&'static Vec<(String, String)>> {
    BOARD_PARTS.get(&show(get(p, "model")))
}
static TWO_PIN: LazyLock<HashSet<String>> = LazyLock::new(|| {
    crate::parts::tables()["TWO_PIN_TYPES"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|k| k.as_str().map(String::from))
        .collect()
});
fn catalog_two_pin(kind: &str) -> bool {
    crate::catalog::all()["CATALOG_TWO_PIN"]
        .as_array()
        .is_some_and(|t| t.iter().any(|x| x == kind))
}
/// What a terminal of a part is attached to (`attachments(p)[key]` of components.js), when it is.
fn attached<'a>(p: &'a Value, key: &str) -> Option<&'a Value> {
    let kind = text(p, "type");
    if TWO_PIN.contains(kind) {
        let keys = if catalog_two_pin(kind) {
            ["p1", "p2"]
        } else {
            ["a", "b"]
        };
        let field = if key == keys[0] {
            "attachA"
        } else if key == keys[1] {
            "attachB"
        } else {
            return None;
        };
        return get(p, field).filter(|a| truthy(a));
    }
    get(p, "attachments")
        .filter(|a| truthy(a))
        .and_then(|a| get(a, key))
        .filter(|a| truthy(a))
}
fn components(project: &Value) -> R<&[Value]> {
    project
        .get("components")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| BROKEN.to_string())
}
fn part_id(p: &Value) -> String {
    show(get(p, "id"))
}
fn hidden(project: &Value, surface: &str) -> bool {
    get(project, "surfaces")
        .and_then(|s| get(s, surface))
        .is_some_and(|s| on(s, "hidden"))
}
/// The holes of the circuit joined to their strips: the built-in breadboard's (unless it is hidden) and each
/// breadboard part's.
fn join_holes(nets: &mut Nets, project: &Value) -> R<()> {
    if !hidden(project, "breadboard") {
        for (id, bus) in &HOLES[0] {
            nets.join(id, bus);
        }
    }
    for p in components(project)? {
        if p.is_null() {
            return Err(BROKEN.into());
        }
        if text(p, "type") != "breadboard" {
            continue;
        }
        let prefix = format!("breadboard:{}:", part_id(p));
        let full = p.get("variant") == Some(&json!("full"));
        for (id, bus) in &HOLES[usize::from(full)] {
            nets.join(&format!("{prefix}{id}"), &format!("{prefix}{bus}"));
        }
    }
    Ok(())
}
/// The pairs of pins a catalog part ties inside (`catalogTies` of catalog-topology.js).
pub fn catalog_ties(p: &Value) -> Vec<(String, String)> {
    let Some(v) = crate::catalog::entry(text(p, "type")) else {
        return Vec::new();
    };
    let variant = text(v, "id");
    let mut pairs: Vec<(usize, usize)> = match variant {
        "button-4" => vec![(1, 3), (2, 4)],
        "matrix-10" => vec![(1, 6), (2, 7), (4, 9), (5, 10)],
        "l298p-bare-20" => vec![(1, 10), (1, 11), (1, 20)],
        "sevenseg-common-cathode-10" | "sevenseg-common-anode-10" => vec![(3, 8)],
        "stepper-driver-11" => vec![(5, 7)],
        _ => Vec::new(),
    };
    if variant == "motor-driver-hat" {
        pairs = vec![(3, 11)];
        let labels: Vec<&str> = v["pins"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|l| l.as_str().unwrap_or(""))
            .collect();
        for (i, label) in labels.iter().enumerate().skip(11) {
            let signal = label.split(':').nth(1);
            if let Some(at) = signal.and_then(|s| labels.iter().position(|l| *l == s)) {
                pairs.push((at + 1, i + 1));
            }
        }
    }
    let id = part_id(p);
    pairs
        .into_iter()
        .map(|(a, b)| (format!("part:{id}:p{a}"), format!("part:{id}:p{b}")))
        .collect()
}
/// The nets of a circuit as it is wired, without what a switch or a pressed button closes (`wiringTopology`).
pub fn wiring_topology(project: &Value) -> R<Nets> {
    let mut nets = Nets::default();
    if !hidden(project, "board") {
        for p in board_pins(get(project, "boardId")) {
            let signal = text(p, "signal");
            if signal != "NC" {
                let net = if signal == "AGND" { "GND" } else { signal };
                nets.join(text(p, "id"), &format!("signal:{net}"));
            }
        }
    }
    join_holes(&mut nets, project)?;
    let parts = components(project)?;
    for p in parts {
        let id = part_id(p);
        for key in crate::parts::terminal_keys(p) {
            let terminal = format!("part:{id}:{key}");
            nets.find(&terminal);
            if let Some(anchor) = attached(p, &key) {
                nets.join(&terminal, &show(Some(anchor)));
            }
        }
        match text(p, "type") {
            "button" => {
                nets.join(&format!("part:{id}:a"), &format!("part:{id}:c"));
                nets.join(&format!("part:{id}:b"), &format!("part:{id}:d"));
            }
            "sevenseg" => nets.join(&format!("part:{id}:p3"), &format!("part:{id}:p8")),
            _ => {}
        }
    }
    join_wires(&mut nets, project)?;
    for p in parts {
        for (a, b) in catalog_ties(p) {
            nets.join(&a, &b);
        }
    }
    Ok(nets)
}
fn join_wires(nets: &mut Nets, project: &Value) -> R<()> {
    let wires = project
        .get("wires")
        .and_then(Value::as_array)
        .ok_or(BROKEN)?;
    for w in wires {
        if w.is_null() {
            return Err(BROKEN.into());
        }
        nets.join(&show(get(w, "from")), &show(get(w, "to")));
    }
    Ok(())
}
/// The nets of a circuit (a project whose catalog parts are already their models), with the switches where they
/// stand and the buttons that are pressed (`topology` of engine.js).
pub fn topology(project: &Value, pressed: &Value) -> R<Nets> {
    let mut nets = Nets::default();
    if !hidden(project, "board") {
        for p in board_pins(get(project, "boardId")) {
            let (id, signal) = (text(p, "id"), text(p, "signal"));
            nets.find(id);
            if signal != "NC" {
                let net = if signal == "AGND" { "GND" } else { signal };
                nets.join(id, &format!("signal:{net}"));
            }
        }
    }
    join_holes(&mut nets, project)?;
    let parts = components(project)?;
    // Other STM32 boards: each pin is its own net, power pins join the common rails.
    for p in parts {
        if text(p, "type") != "devboard" {
            continue;
        }
        let (id, model) = (part_id(p), board_part(p));
        for (key, signal) in model.into_iter().flatten() {
            let pin = format!("devboard:{id}:{key}");
            nets.find(&pin);
            if let Some(net) = crate::devboards::net(true, &id, signal) {
                nets.join(&pin, &net);
            }
            let hole = get(p, "attachments")
                .filter(|a| !a.is_null())
                .and_then(|a| get(a, key))
                .filter(|h| truthy(h));
            if let Some(hole) = hole {
                nets.join(&pin, &show(Some(hole)));
            }
        }
    }
    for p in parts {
        let id = part_id(p);
        let t = |key: &str| format!("part:{id}:{key}");
        for key in crate::parts::terminal_keys(p) {
            let terminal = t(&key);
            nets.find(&terminal);
            if let Some(anchor) = attached(p, &key) {
                nets.join(&terminal, &show(Some(anchor)));
            }
        }
        let position = get(p, "position");
        let stands = position.is_some_and(truthy);
        match text(p, "type") {
            "button" => {
                nets.join(&t("a"), &t("c"));
                nets.join(&t("b"), &t("d"));
                if get(pressed, &id).is_some_and(truthy) {
                    nets.join(&t("a"), &t("b"));
                }
            }
            "catalog_switch" => {
                let variant = get(p, "catalogVariant")
                    .and_then(Value::as_str)
                    .ok_or(BROKEN)?;
                if variant.contains("dp3t") {
                    let at = position
                        .filter(|v| !v.is_null())
                        .map_or(0.0, |v| to_num(Some(v)));
                    nets.join(&t("p4"), &t(&format!("p{}", js_number(1.0 + at))));
                    nets.join(&t("p8"), &t(&format!("p{}", js_number(5.0 + at))));
                } else {
                    nets.join(&t("p2"), &t(if stands { "p3" } else { "p1" }));
                    nets.join(&t("p5"), &t(if stands { "p6" } else { "p4" }));
                }
            }
            "slide" => nets.join(&t("p2"), &t(if stands { "p3" } else { "p1" })),
            "sevenseg" => nets.join(&t("p3"), &t("p8")),
            _ => {}
        }
    }
    join_wires(&mut nets, project)?;
    if let Some(ties) = get(project, "catalogTies").filter(|t| truthy(t)) {
        for pair in ties.as_array().ok_or(BROKEN)? {
            nets.join(&show(there(pair.get(0))), &show(there(pair.get(1))));
        }
    }
    Ok(nets)
}

// ---------- the L298N module (l298n.js) ----------

struct Channel {
    name: String,
    en: usize,
    inputs: [usize; 2],
    outputs: [usize; 2],
}
static L298: LazyLock<Vec<Channel>> = LazyLock::new(|| {
    let pin = |v: &Value| v.as_u64().unwrap_or(0) as usize;
    crate::catalog::all()["L298_CHANNELS"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|c| Channel {
            name: text(c, "name").to_string(),
            en: pin(&c["en"]),
            inputs: [pin(&c["inputs"][0]), pin(&c["inputs"][1])],
            outputs: [pin(&c["outputs"][0]), pin(&c["outputs"][1])],
        })
        .collect()
});
/// What an L298N does with the voltages on its pins: (powered, per channel (enabled, the levels of its inputs,
/// mode)).
type L298State = (bool, Vec<(bool, [Option<u8>; 2], &'static str)>);
/// `absent`: what a pin without a voltage counts as in the comparisons — not a number while the circuit is being
/// solved (the JavaScript read `undefined` there), 0 for the solved circuit (it read `null`).
fn l298_state(v: &dyn Fn(usize) -> Option<f64>, grounded: bool, absent: f64) -> L298State {
    let (g, vm, logic) = (v(2), v(1), v(3));
    let powered = match (g, vm, logic) {
        (Some(g), Some(vm), Some(logic)) => {
            grounded
                && g.abs() < 0.1
                && vm - g >= 6.0
                && vm - g <= 24.0
                && logic - g >= 4.5
                && logic - g <= 5.5
        }
        _ => false,
    };
    let g0 = g.unwrap_or(absent);
    let top = logic.unwrap_or(absent) - g0;
    let level = |pin: usize| -> Option<u8> {
        let x = v(pin)?;
        let d = x - g0;
        if d >= 2.3 && d <= top + 0.01 {
            Some(1)
        } else if (-0.3..=1.5).contains(&d) {
            Some(0)
        } else {
            None
        }
    };
    let channels = L298
        .iter()
        .map(|c| {
            let (en, inputs) = (level(c.en), [level(c.inputs[0]), level(c.inputs[1])]);
            let valid = en.is_some() && (en == Some(0) || inputs.iter().all(Option::is_some));
            let enabled = powered && en == Some(1) && valid;
            let mode = if !powered {
                "unpowered"
            } else if !valid {
                "invalid"
            } else if !enabled {
                "coast"
            } else if inputs[0] == inputs[1] {
                "brake"
            } else if inputs[0] == Some(1) {
                "forward"
            } else {
                "reverse"
            };
            (enabled, inputs, mode)
        })
        .collect();
    (powered, channels)
}

// ---------- the solution ----------

#[derive(Clone, Default)]
struct Branch {
    a: usize,
    b: usize,
    r: f64,
    id: Option<String>,
    emf: Option<f64>,
    vf: f64,
    diode: bool,
    led: bool,
    buzzer: bool,
    pot: bool,
    channel: Option<String>,
    gpio: Option<String>,
    /// (supply, ground, least, most): on only while the supply is in range.
    sensor: Option<(usize, usize, f64, f64)>,
    /// (supply, ground, input, normally open).
    relay: Option<(usize, usize, usize, bool)>,
    contact: Option<(Value, Value)>,
    supply: Option<Value>,
    /// (the roots of the module's pins 1 – 13, grounded, channel, input, high) and the part that drives.
    l298: Option<(usize, usize, usize, bool)>,
    driver: Option<String>,
}
/// The pins of an L298N as the roots they are on, and whether its ground pin is on the circuit's ground.
struct Driver {
    pins: [usize; 14],
    grounded: bool,
}
struct Builder<'a> {
    nets: &'a mut Nets,
    known: Vec<(usize, f64)>,
    roots: Vec<usize>,
    seen: HashSet<usize>,
    branches: Vec<Branch>,
    drivers: Vec<Driver>,
    warnings: Vec<String>,
}
impl Builder<'_> {
    fn note(&mut self, root: usize) {
        if self.seen.insert(root) {
            self.roots.push(root);
        }
    }
    fn value(&self, root: usize) -> Option<f64> {
        self.known.iter().find(|k| k.0 == root).map(|k| k.1)
    }
    fn fixed(&mut self, id: &str, v: f64) {
        let r = self.nets.find(id);
        match self.value(r) {
            Some(had) if (had - v).abs() > 0.01 => self
                .warnings
                .push("전원 단락: 서로 다른 전압의 전원 또는 GND가 직접 연결되었습니다.".into()),
            Some(_) => {
                if let Some(k) = self.known.iter_mut().find(|k| k.0 == r) {
                    k.1 = v;
                }
            }
            None => self.known.push((r, v)),
        }
        self.note(r);
    }
    fn branch(&mut self, a: &str, b: &str, r: f64, mut extra: Branch) {
        let (aa, bb) = (self.nets.find(a), self.nets.find(b));
        self.note(aa);
        self.note(bb);
        extra.a = aa;
        extra.b = bb;
        extra.r = r;
        self.branches.push(extra);
    }
    fn plain(&mut self, a: &str, b: &str, r: f64) {
        self.branch(a, b, r, Branch::default());
    }
    fn sensor(
        &mut self,
        supply: &str,
        ground: &str,
        least: f64,
        most: f64,
    ) -> Option<(usize, usize, f64, f64)> {
        Some((self.nets.find(supply), self.nets.find(ground), least, most))
    }
}
fn of(id: &str) -> Branch {
    Branch {
        id: Some(id.to_string()),
        ..Branch::default()
    }
}
static MODULES: LazyLock<(Vec<String>, Vec<String>)> = LazyLock::new(|| {
    let list = |key: &str| {
        crate::devdefs::tables()[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|k| k.as_str().map(String::from))
            .collect()
    };
    (list("MODULE_DEVICES"), list("I2C_DEVICES"))
});
static SEGMENTS: LazyLock<Vec<String>> = LazyLock::new(|| {
    crate::parts::tables()["PART_DEFS"]["sevenseg"]["labels"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|l| l.as_str().map(String::from))
        .collect()
});
static GPIO: LazyLock<Vec<String>> = LazyLock::new(|| {
    PINS["ALL_GPIO_PINS"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|l| l.as_str().map(String::from))
        .collect()
});
/// Where each GPIO name is in the pin table.
static GPIO_AT: LazyLock<HashMap<String, usize>> = LazyLock::new(|| {
    GPIO.iter()
        .enumerate()
        .map(|(i, pin)| (pin.clone(), i))
        .collect()
});

/// Additional catalog device branches use the same net solver as legacy parts (`catalogBranches`).
fn catalog_branches(b: &mut Builder, p: &Value) -> R<()> {
    let id = part_id(p);
    let pin = |n: usize| format!("part:{id}:p{n}");
    let (kind, variant) = (text(p, "type"), text(p, "catalogVariant"));
    let state = |key: &str| -> R<Option<&Value>> {
        let s = get(p, "catalogState")
            .filter(|s| !s.is_null())
            .ok_or(BROKEN)?;
        Ok(get(s, key))
    };
    if ["catalog_can", "catalog_i2s", "wireless"].contains(&kind) {
        b.branch(&pin(1), &pin(2), 10000.0, of(&id));
    }
    // HC-05 STATE: low before pairing, high once paired.
    if variant == "hc05-bluetooth-6" {
        let sensor = b.sensor(&pin(1), &pin(2), 3.3, 6.0);
        let emf = Some(if on(p, "linked") { 3.3 } else { 0.0 });
        b.branch(
            &pin(6),
            &pin(2),
            100.0,
            Branch {
                sensor,
                emf,
                ..Branch::default()
            },
        );
    }
    match kind {
        "catalog_i2s" => {
            b.plain(&pin(7), &pin(1), 1_000_000.0);
            b.plain(&pin(7), &pin(2), 100_000.0);
        }
        "catalog_singlewire" => {
            b.branch(&pin(1), &pin(2), 10000.0, of(&id));
            if variant == "urm09-trig-3" {
                b.plain(&pin(3), &pin(2), 100_000.0);
            }
            if state("low")?.is_some_and(truthy) {
                b.plain(&pin(3), &pin(2), 30.0);
            }
            if state("high")?.is_some_and(truthy) {
                b.branch(
                    &pin(3),
                    &pin(2),
                    40.0,
                    Branch {
                        emf: Some(3.3),
                        ..Branch::default()
                    },
                );
            }
        }
        "catalog_tm1637" => {
            b.branch(&pin(1), &pin(2), 10000.0, of(&id));
            for n in [3, 4] {
                b.plain(&pin(n), &pin(1), 10000.0);
            }
            if state("ack")?.is_some_and(truthy) {
                b.plain(&pin(4), &pin(2), 20.0);
            }
        }
        "catalog_encoder" => {
            let quad = state("quad")?.filter(|q| truthy(q));
            for (i, n) in [1, 3].into_iter().enumerate() {
                let level = match quad {
                    Some(q) => there(q.get(i)).is_some_and(truthy),
                    None => true,
                };
                if !level {
                    b.plain(&pin(n), &pin(2), 1.0);
                }
            }
            if on(p, "switch") {
                b.plain(&pin(4), &pin(5), 1.0);
            }
        }
        "catalog_stepper" => {
            if variant.contains("bipolar") {
                b.branch(&pin(1), &pin(2), 68.0, of(&id));
                b.plain(&pin(3), &pin(4), 68.0);
            } else {
                for n in 2..=5 {
                    b.branch(&pin(1), &pin(n), 50.0, of(&id));
                }
            }
        }
        "catalog_uln" => {
            b.branch(&pin(5), &pin(6), 10000.0, of(&id));
            for i in 0..4 {
                b.plain(&pin(i + 1), &pin(6), 10000.0);
                let sensor = b.sensor(&pin(i + 1), &pin(6), 2.0, 5.5);
                b.branch(
                    &pin(i + 8),
                    &pin(6),
                    4.0,
                    Branch {
                        sensor,
                        ..Branch::default()
                    },
                );
            }
        }
        "catalog_digits" => {
            for d in 0..4 {
                for (seg, letter) in "abcdefg.".chars().enumerate() {
                    b.branch(
                        &pin(seg + 1),
                        &pin(d + 9),
                        12.0,
                        Branch {
                            diode: true,
                            led: true,
                            vf: 1.8,
                            channel: Some(format!("{d}:{letter}")),
                            ..of(&id)
                        },
                    );
                }
            }
        }
        _ => {}
    }
    if variant == "servo-feedback-4" {
        let sensor = b.sensor(&pin(1), &pin(2), 4.5, 5.5);
        let angle = state("angle")?
            .filter(|a| !a.is_null())
            .map_or(90.0, |a| to_num(Some(a)));
        b.branch(
            &pin(4),
            &pin(2),
            100.0,
            Branch {
                sensor,
                emf: Some(angle / 180.0 * 3.3),
                ..Branch::default()
            },
        );
    }
    if variant == "motor-driver-hat" {
        let outputs = state("outputs")?.filter(|o| !o.is_null());
        for n in [6, 7, 8, 9] {
            let sensor = b.sensor(&pin(5), &pin(2), 6.0, 12.0);
            let emf = outputs
                .and_then(|o| there(o.get(n - 6)))
                .filter(|v| !v.is_null())
                .map_or(0.0, |v| to_num(Some(v)));
            b.branch(
                &pin(n),
                &pin(2),
                0.5,
                Branch {
                    sensor,
                    emf: Some(emf),
                    ..Branch::default()
                },
            );
        }
    }
    Ok(())
}
/// The branches of one part (the body of the loop over the parts in `solveOnce`).
fn part_branches(b: &mut Builder, p: &Value, transient: &Value) -> R<()> {
    if p.is_null() {
        return Err(BROKEN.into());
    }
    let id = part_id(p);
    let (a, bb) = (format!("part:{id}:a"), format!("part:{id}:b"));
    let pin = |n: usize| format!("part:{id}:p{n}");
    let (kind, variant) = (text(p, "type"), text(p, "catalogVariant"));
    catalog_branches(b, p)?;
    if kind == "catalog_analog" {
        b.plain(&pin(1), &pin(2), 10000.0);
        let variant = get(p, "catalogVariant")
            .and_then(Value::as_str)
            .ok_or(BROKEN)?;
        let resistance = if variant.starts_with("ntc") {
            ntc_resistance(n(p, "temperature"))
        } else {
            ldr_resistance(n(p, "lux"))
        };
        b.plain(&pin(3), &pin(1), resistance);
        b.plain(&pin(3), &pin(2), 10000.0);
        if variant == "ldr-comparator-4" {
            let sensor = b.sensor(&pin(1), &pin(2), 2.7, 5.5);
            let lux = set(p, "lux").map_or(100.0, |v| to_num(Some(v)));
            b.branch(
                &pin(4),
                &pin(2),
                100.0,
                Branch {
                    sensor,
                    emf: Some(if lux > 100.0 { 3.3 } else { 0.0 }),
                    ..Branch::default()
                },
            );
        }
    }
    if variant == "mcp4725-6" {
        let state = get(p, "catalogState")
            .filter(|s| !s.is_null())
            .ok_or(BROKEN)?;
        let emf = set(state, "voltage").map_or(0.0, |v| to_num(Some(v)));
        b.branch(
            &pin(5),
            &pin(2),
            1.0,
            Branch {
                emf: Some(emf),
                ..Branch::default()
            },
        );
    }
    if kind == "l298n" {
        b.plain(&pin(1), &pin(2), 10000.0);
        b.branch(&pin(3), &pin(2), 1000.0, of(&id));
        for k in [4, 5, 6, 7, 8, 9] {
            b.plain(&pin(k), &pin(2), 1_000_000.0);
        }
        let driver = b.drivers.len();
        b.drivers.push(Driver {
            pins: [0; 14],
            grounded: false,
        });
        for (c, channel) in L298.iter().enumerate() {
            for (i, output) in channel.outputs.iter().enumerate() {
                for high in [false, true] {
                    b.branch(
                        &pin(*output),
                        &pin(if high { 1 } else { 2 }),
                        0.5,
                        Branch {
                            emf: Some(if high { -1.0 } else { 1.0 }),
                            l298: Some((driver, c, i, high)),
                            driver: Some(id.clone()),
                            ..Branch::default()
                        },
                    );
                }
            }
        }
    }
    match kind {
        "dc_supply" => b.branch(
            &a,
            &bb,
            0.1,
            Branch {
                emf: Some(n(p, "voltage")),
                supply: Some(crate::project::raw(get(p, "name"))),
                ..of(&id)
            },
        ),
        "dc_motor" => b.branch(&a, &bb, 24.0, of(&id)),
        "resistor" => b.branch(&a, &bb, n(p, "value"), of(&id)),
        "ldr" => b.branch(&a, &bb, ldr_resistance(n(p, "lux")), of(&id)),
        "ntc" => b.branch(&a, &bb, ntc_resistance(n(p, "temperature")), of(&id)),
        _ => {}
    }
    if MODULES.0.iter().any(|m| m == kind) {
        b.branch(&pin(1), &pin(2), 10000.0, of(&id));
        if MODULES.1.iter().any(|m| m == kind) {
            for k in [3, 4] {
                b.plain(&pin(k), &pin(1), 10000.0);
            }
        }
        if kind == "joystick" {
            for (k, pos) in [(3, n(p, "axisX")), (4, n(p, "axisY"))] {
                b.plain(&pin(k), &pin(2), most(0.01, 10000.0 * pos / 100.0));
                b.plain(&pin(k), &pin(1), most(0.01, 10000.0 * (1.0 - pos / 100.0)));
            }
        }
        if kind == "joystick" || kind == "encoder" {
            b.plain(&pin(5), &pin(1), 10000.0);
            if on(p, "switch") {
                b.plain(&pin(5), &pin(2), 1.0);
            }
        }
        if kind == "encoder" {
            let signals = get(transient, "deviceSignals")
                .filter(|s| !s.is_null())
                .and_then(|s| set(s, &id));
            for k in [3, 4] {
                b.plain(&pin(k), &pin(1), 10000.0);
                let low = match signals {
                    Some(s) => there(s.get(k - 3)).and_then(num) == Some(0.0),
                    None => false,
                };
                if low {
                    b.plain(&pin(k), &pin(2), 1.0);
                }
            }
        }
        if kind == "pir" {
            let sensor = b.sensor(&pin(1), &pin(2), 4.5, 5.5);
            b.branch(
                &pin(3),
                &pin(2),
                100.0,
                Branch {
                    sensor,
                    emf: Some(if on(p, "motion") { 3.3 } else { 0.0 }),
                    ..Branch::default()
                },
            );
        }
        if kind == "relay" {
            for (k, normally_open) in [(5, true), (6, false)] {
                let relay = Some((
                    b.nets.find(&pin(1)),
                    b.nets.find(&pin(2)),
                    b.nets.find(&pin(3)),
                    normally_open,
                ));
                let contact = Some((
                    crate::project::raw(get(p, "name")),
                    crate::project::raw(get(p, "id")),
                ));
                b.branch(
                    &pin(4),
                    &pin(k),
                    0.1,
                    Branch {
                        relay,
                        contact,
                        ..Branch::default()
                    },
                );
            }
        }
        let inputs: &[usize] = match kind {
            "servo" | "relay" => &[3],
            "motor" | "matrix" => &[3, 4, 5],
            "stepper" => &[3, 4, 5, 6],
            "tft" => &[3, 4, 5, 6, 7],
            _ => &[],
        };
        for k in inputs {
            if *k == 3 && (kind == "tft" || kind == "matrix") {
                b.plain(&pin(*k), &pin(1), 100_000.0);
            } else {
                b.plain(&pin(*k), &pin(2), 1_000_000.0);
            }
        }
    }
    match kind {
        "led" => {
            let vf = match text(p, "color") {
                "green" => 2.1,
                "blue" => 2.8,
                "yellow" => 2.0,
                _ => 1.8,
            };
            b.branch(
                &a,
                &bb,
                12.0,
                Branch {
                    diode: true,
                    led: true,
                    vf,
                    ..of(&id)
                },
            );
        }
        "diode" => b.branch(
            &a,
            &bb,
            1.0,
            Branch {
                diode: true,
                vf: 0.7,
                ..of(&id)
            },
        ),
        "buzzer" => b.branch(
            &a,
            &bb,
            1000.0,
            Branch {
                buzzer: true,
                ..of(&id)
            },
        ),
        "passive_buzzer" => b.branch(&a, &bb, 1e6, of(&id)),
        _ => {}
    }
    if kind == "capacitor" && n(transient, "dt") > 0.0 {
        let charge = get(transient, "capacitors")
            .filter(|c| !c.is_null())
            .and_then(|c| set(c, &id))
            .map_or(0.0, |v| to_num(Some(v)));
        b.branch(
            &a,
            &bb,
            n(transient, "dt") / (n(p, "value") * 1e-6),
            Branch {
                emf: Some(charge),
                ..of(&id)
            },
        );
    }
    if kind == "potentiometer" {
        let (value, position) = (n(p, "value"), n(p, "position"));
        b.branch(
            &pin(1),
            &pin(2),
            most(0.01, value * position / 100.0),
            Branch {
                channel: Some("1–2".into()),
                pot: true,
                ..of(&id)
            },
        );
        b.branch(
            &pin(2),
            &pin(3),
            most(0.01, value * (1.0 - position / 100.0)),
            Branch {
                channel: Some("2–3".into()),
                pot: true,
                ..of(&id)
            },
        );
    }
    let anode = on(p, "commonAnode");
    if kind == "rgb" {
        for (k, channel, vf) in [(1, "r", 1.8), (3, "g", 2.1), (4, "b", 2.8)] {
            let (from, to) = if anode { (2, k) } else { (k, 2) };
            b.branch(
                &pin(from),
                &pin(to),
                12.0,
                Branch {
                    diode: true,
                    led: true,
                    vf,
                    channel: Some(channel.into()),
                    ..of(&id)
                },
            );
        }
    }
    if kind == "sevenseg" {
        for (i, label) in SEGMENTS.iter().enumerate() {
            if !label.starts_with('K') {
                let (from, to) = if anode { (3, i + 1) } else { (i + 1, 3) };
                b.branch(
                    &pin(from),
                    &pin(to),
                    12.0,
                    Branch {
                        diode: true,
                        led: true,
                        vf: 1.8,
                        channel: Some(label.clone()),
                        ..of(&id)
                    },
                );
            }
        }
    }
    if kind == "lcd" {
        b.branch(&pin(2), &pin(1), 4200.0, of(&id));
        b.branch(
            &pin(15),
            &pin(16),
            220.0,
            Branch {
                diode: true,
                vf: 2.1,
                ..Branch::default()
            },
        );
    }
    if ["uart", "i2c", "spi"].contains(&kind) {
        b.branch(&pin(1), &pin(2), 10000.0, of(&id));
    }
    if kind == "i2c" {
        b.plain(&pin(3), &pin(1), 10000.0);
        b.plain(&pin(4), &pin(1), 10000.0);
    }
    if kind == "temperature" || kind == "ultrasonic" {
        let temp = kind == "temperature";
        let (gnd, output) = (pin(if temp { 3 } else { 4 }), pin(if temp { 2 } else { 3 }));
        b.plain(&pin(1), &gnd, if temp { 200_000.0 } else { 2500.0 });
        let sensor = b.sensor(&pin(1), &gnd, if temp { 2.7 } else { 4.5 }, 5.5);
        let echo = get(transient, "echoHigh")
            .filter(|e| !e.is_null())
            .and_then(|e| get(e, &id))
            .is_some_and(truthy);
        let emf = if temp {
            0.5 + 0.01 * n(p, "temperature")
        } else if echo {
            5.0
        } else {
            0.0
        };
        b.branch(
            &output,
            &gnd,
            100.0,
            Branch {
                sensor,
                emf: Some(emf),
                ..of(&id)
            },
        );
    }
    Ok(())
}
fn gaussian(a: &mut [Vec<f64>], b: &mut [f64]) -> R<Vec<f64>> {
    let size = b.len();
    for k in 0..size {
        let mut p = k;
        for i in k + 1..size {
            if a[i][k].abs() > a[p][k].abs() {
                p = i;
            }
        }
        if a[p][k].abs() < 1e-18 {
            return Err("회로 해석이 수렴하지 않습니다.".into());
        }
        a.swap(p, k);
        b.swap(p, k);
        for i in k + 1..size {
            let f = a[i][k] / a[k][k];
            if f == 0.0 || f.is_nan() {
                continue;
            }
            let (upper, lower) = a.split_at_mut(i);
            let (pivot, row) = (&upper[k], &mut lower[0]);
            for j in k + 1..size {
                row[j] -= f * pivot[j];
            }
            b[i] -= f * b[k];
        }
    }
    let mut x = vec![0.0; size];
    for i in (0..size).rev() {
        let mut s = b[i];
        for j in i + 1..size {
            s -= a[i][j] * x[j];
        }
        x[i] = s / a[i][i];
    }
    Ok(x)
}
/// One solution of a circuit.
struct Solved {
    fault: bool,
    /// The early answer of a short between supplies: only `fault`, `warnings` and no parts.
    shorted: bool,
    warnings: Vec<String>,
    diagnostics: Vec<Value>,
    parts: Map<String, Value>,
    current: f64,
    capacitors: Map<String, Value>,
    has_led: bool,
    /// The voltage of each root that is tied to the circuit's ground (`voltage(id)`).
    volts: Vec<(usize, f64)>,
}
/// Whether something is wired to an NRST header pin of the main board (CN6-3 RESET, CN7-14).
fn nrst_wired(project: &Value) -> R<bool> {
    if get(project, "boardId").and_then(Value::as_str) == Some("fpb-ra6e1") {
        return Ok(false);
    }
    let nrst: Vec<&str> = board_pins(get(project, "boardId"))
        .iter()
        .filter(|p| p["signal"] == "NRST")
        .map(|p| text(p, "id"))
        .collect();
    let wires = project
        .get("wires")
        .and_then(Value::as_array)
        .ok_or(BROKEN)?;
    if nrst.is_empty() {
        return Ok(false);
    }
    for w in wires {
        if w.is_null() {
            return Err(BROKEN.into());
        }
        let at = |end: &str| {
            get(w, end)
                .and_then(Value::as_str)
                .is_some_and(|e| nrst.contains(&e))
        };
        if at("from") || at("to") {
            return Ok(true);
        }
    }
    Ok(false)
}
struct Run<'a> {
    project: &'a Value,
    /// Whether an NRST header pin of the main board is wired (its pull-up is then part of the circuit).
    nrst: bool,
    /// The header pins of the board being edited (`boardPin` reads them, for the target of a GPIO warning).
    active: &'a [Value],
}
impl Run<'_> {
    fn part(&self, id: &str) -> Option<&Value> {
        components(self.project)
            .ok()?
            .iter()
            .find(|p| get(p, "id").and_then(Value::as_str) == Some(id))
    }
    /// `<board id>.<GPIO>` pins of other boards: the board name and its header pin for messages and issue links.
    fn gpio_name(&self, pin: &str) -> String {
        let mut split = pin.split('.');
        let (id, gpio) = (
            split.next().unwrap_or(""),
            split.next().filter(|g| !g.is_empty()),
        );
        match gpio {
            None => pin.to_string(),
            Some(gpio) => {
                let name = self
                    .part(id)
                    .and_then(|p| set(p, "name"))
                    .map_or_else(|| id.to_string(), |n| show(Some(n)));
                format!("{name} {gpio}")
            }
        }
    }
    fn gpio_endpoint(&self, pin: &str) -> Value {
        let mut split = pin.split('.');
        let (id, gpio) = (
            split.next().unwrap_or(""),
            split.next().filter(|g| !g.is_empty()),
        );
        let found = match gpio {
            None => {
                let wired = self.active.iter().find(|p| {
                    p["label"] == pin
                        && p["signal"] != "NC"
                        && ["CN5", "CN6", "CN8", "CN9"].contains(&text(p, "header"))
                });
                let signal = PINS["ALIASES"]
                    .get(pin)
                    .and_then(Value::as_str)
                    .filter(|a| !a.is_empty())
                    .unwrap_or(pin);
                wired
                    .or_else(|| self.active.iter().find(|p| p["signal"] == signal))
                    .map(|p| text(p, "id").to_string())
            }
            Some(gpio) => self.part(id).and_then(|part| {
                board_part(part)?
                    .iter()
                    .find(|(_, signal)| signal == gpio)
                    .map(|(key, _)| format!("devboard:{id}:{key}"))
            }),
        };
        found.map_or_else(undefined, |id| json!(id))
    }
}
fn solve_once(
    run: &Run,
    nets: &mut Nets,
    gpio: &Value,
    pressed: &Value,
    transient: &Value,
) -> R<Solved> {
    let project = run.project;
    let mut b = Builder {
        nets,
        known: Vec::new(),
        roots: Vec::new(),
        seen: HashSet::new(),
        branches: Vec::new(),
        drivers: Vec::new(),
        warnings: Vec::new(),
    };
    let mut diagnostics: Vec<Value> = Vec::new();
    b.fixed("signal:GND", 0.0);
    for p in ["3V3", "VDD", "AVDD", "IOREF"] {
        b.fixed(&format!("signal:{p}"), 3.3);
    }
    for p in ["5V", "U5V"] {
        b.fixed(&format!("signal:{p}"), 5.0);
    }
    if !b.warnings.is_empty() {
        return Ok(Solved {
            fault: true,
            shorted: true,
            warnings: unique(&b.warnings),
            diagnostics,
            parts: Map::new(),
            current: 0.0,
            capacitors: Map::new(),
            has_led: false,
            volts: Vec::new(),
        });
    }
    // A pin the program has not set is an input and adds nothing: only the pins that are set are gone through, in
    // the order of the pin table, then the pins of the other STM32 boards (keyed `<board id>.<pin>`) in their own.
    let set_pins = || gpio.as_object().into_iter().flat_map(|g| g.keys());
    let mut own: Vec<(usize, &String)> = set_pins()
        .filter_map(|k| GPIO_AT.get(k.as_str()).map(|at| (*at, k)))
        .collect();
    own.sort();
    let others = set_pins().filter(|k| k.contains('.'));
    for pin in own.into_iter().map(|(_, k)| k).chain(others) {
        let Some(g) = get(gpio, pin).filter(|g| truthy(g)) else {
            continue;
        };
        let (mode, signal) = (text(g, "mode"), format!("signal:{pin}"));
        if mode == "OUTPUT" && !(on(g, "openDrain") && n(g, "value") > 0.0) {
            let drive = format!("drive:{pin}");
            b.fixed(&drive, set(g, "value").map_or(0.0, |v| to_num(Some(v))));
            b.branch(
                &signal,
                &drive,
                40.0,
                Branch {
                    gpio: Some(pin.clone()),
                    ..Branch::default()
                },
            );
        } else if mode == "INPUT_PULLUP" {
            b.plain(&signal, "signal:3V3", 40000.0);
        } else if mode == "INPUT_PULLDOWN" {
            b.plain(&signal, "signal:GND", 40000.0);
        }
        if mode == "OUTPUT" && on(g, "pull") {
            let up = get(g, "pull").and_then(num) == Some(1.0);
            b.plain(
                &signal,
                if up { "signal:3V3" } else { "signal:GND" },
                40000.0,
            );
        }
    }
    // The on-board parts of the NUCLEO-64 (MB1136 C-04 sheets 3 and 5): B1 USER pulls PC13 LOW through R29 100 Ω
    // against R30 4.7 kΩ (C15 is not modeled), and the green LD2 loads PA5 through R31 510 Ω (SB21 closed).
    let onboard = |b: &mut Builder, prefix: &str, user: bool| {
        b.plain(&format!("{prefix}PC13"), "signal:3V3", 4700.0);
        if user {
            b.plain(&format!("{prefix}PC13"), "signal:GND", 100.0);
        }
        b.branch(
            &format!("{prefix}PA5"),
            "signal:GND",
            510.0,
            Branch {
                diode: true,
                vf: 2.1,
                ..Branch::default()
            },
        );
    };
    let parts = components(project)?;
    // FPB-RA6E1, from the board's schematic (Design Package D018122_04 Issue 2.0, BOM 2021-06-18): S1 shorts P205 to
    // GND and R17 10 kΩ pulls P205 up to 3.3 V; green LED1/LED2 on P408/P407 through R5/R11 10 kΩ to GND; the I2C
    // pull-ups R1/R2 2.2 kΩ on P400/P401 (E7/E8 closed); and P014 — the Arduino header's RESET pin (J2-3), not the
    // MCU's RES# — pulled up by R4 10 kΩ.
    if get(project, "boardId").and_then(Value::as_str) == Some("fpb-ra6e1") {
        if on(pressed, "SW1") {
            b.plain("signal:P205", "signal:GND", 100.0);
        }
        b.plain("signal:P205", "signal:3V3", 10000.0);
        for pin in ["P408", "P407"] {
            b.branch(
                &format!("signal:{pin}"),
                "signal:GND",
                10000.0,
                Branch {
                    diode: true,
                    vf: 2.1,
                    ..Branch::default()
                },
            );
        }
        for pin in ["P400", "P401"] {
            b.plain(&format!("signal:{pin}"), "signal:3V3", 2200.0);
        }
        b.plain("signal:P014", "signal:3V3", 10000.0);
    } else {
        onboard(&mut b, "signal:", on(pressed, "USER"));
        // NRST header pins (CN6-3 RESET, CN7-14): the MCU's internal pull-up (about 40 kΩ) once something is wired
        // to them, so a button to GND pulls the line LOW and the sessions reset the MCU.
        if run.nrst {
            b.plain("signal:NRST", "signal:3V3", 40000.0);
        }
    }
    // Other STM32 boards have the same B1 and LD2 (`<id>.USER` while pressed).
    for p in parts {
        if p.is_null() {
            return Err(BROKEN.into());
        }
        if text(p, "type") == "devboard" && board_part(p).is_some() {
            let id = part_id(p);
            onboard(
                &mut b,
                &format!("signal:{id}."),
                on(pressed, &format!("{id}.USER")),
            );
        }
    }
    for p in parts {
        part_branches(&mut b, p, transient)?;
    }
    // The pins of each L298N as roots (its state is read from the voltages while the circuit is solved).
    let mut at = 0;
    for p in parts {
        if text(p, "type") == "l298n" {
            let id = part_id(p);
            let mut pins = [0; 14];
            for (k, slot) in pins.iter_mut().enumerate().skip(1) {
                *slot = b.nets.find(&format!("part:{id}:p{k}"));
            }
            let grounded = pins[2] == b.nets.find("signal:GND");
            b.drivers[at] = Driver { pins, grounded };
            at += 1;
        }
    }
    let Builder {
        nets,
        known,
        roots,
        branches,
        drivers,
        mut warnings,
        ..
    } = b;
    let fixed: HashMap<usize, f64> = known.iter().copied().collect();
    let unknown: Vec<usize> = roots
        .iter()
        .copied()
        .filter(|r| !fixed.contains_key(r))
        .collect();
    let index: HashMap<usize, usize> = unknown.iter().enumerate().map(|(i, r)| (*r, i)).collect();
    let mut volt: HashMap<usize, f64> = fixed.clone();
    for r in &unknown {
        volt.insert(*r, 0.0);
    }
    // A voltage that is not there reads as JavaScript reads `undefined` in arithmetic: not a number.
    let at_root = |volt: &HashMap<usize, f64>, r: usize| volt.get(&r).copied().unwrap_or(f64::NAN);
    let or_zero = |volt: &HashMap<usize, f64>, r: usize| volt.get(&r).copied().unwrap_or(0.0);
    let l298_on = |volt: &HashMap<usize, f64>, br: &Branch| -> bool {
        let Some((driver, channel, input, high)) = br.l298 else {
            return true;
        };
        let d = &drivers[driver];
        let state = l298_state(&|k| volt.get(&d.pins[k]).copied(), d.grounded, f64::NAN);
        let c = &state.1[channel];
        c.0 && c.1[input] == Some(u8::from(high))
    };
    let relay_on = |volt: &HashMap<usize, f64>, br: &Branch| -> bool {
        let Some((supply, ground, input, normally_open)) = br.relay else {
            return true;
        };
        let (s, g, i) = (
            at_root(volt, supply),
            at_root(volt, ground),
            at_root(volt, input),
        );
        (s - g >= 4.5 && s - g <= 5.5 && i - g >= 2.0) == normally_open
    };
    let supplied = |volt: &HashMap<usize, f64>, br: &Branch| -> bool {
        match br.sensor {
            None => true,
            Some((supply, ground, least, most)) => {
                let v = or_zero(volt, supply) - or_zero(volt, ground);
                v >= least && v <= most
            }
        }
    };
    let size = unknown.len();
    let mut converged = false;
    for _ in 0..80 {
        let mut a = vec![vec![0.0; size]; size];
        let mut z = vec![0.0; size];
        for (i, row) in a.iter_mut().enumerate() {
            row[i] = 1e-10; // Numerical shunt, 10 GΩ.
        }
        for br in &branches {
            let conducting = l298_on(&volt, br)
                && relay_on(&volt, br)
                && (!br.diode || at_root(&volt, br.a) - at_root(&volt, br.b) > br.vf)
                && supplied(&volt, br);
            let g = if conducting { 1.0 / br.r } else { 1e-10 };
            let offset = if !conducting {
                0.0
            } else if br.diode {
                br.vf
            } else {
                br.emf.unwrap_or(0.0)
            };
            let (i, j) = (index.get(&br.a).copied(), index.get(&br.b).copied());
            if let Some(i) = i {
                a[i][i] += g;
                match j {
                    Some(j) => a[i][j] -= g,
                    None => z[i] += g * fixed[&br.b],
                }
                z[i] += g * offset;
            }
            if let Some(j) = j {
                a[j][j] += g;
                match i {
                    Some(i) => a[j][i] -= g,
                    None => z[j] += g * fixed[&br.a],
                }
                z[j] -= g * offset;
            }
        }
        let x = gaussian(&mut a, &mut z)?;
        let mut diff = 0.0;
        for (i, r) in unknown.iter().enumerate() {
            diff = most(diff, (volt[r] - x[i]).abs());
            volt.insert(*r, x[i]);
        }
        if diff < 1e-7 {
            converged = true;
            break;
        }
    }
    if !converged {
        warnings.push("회로가 수렴하지 않았습니다. LED 방향과 연결을 확인하세요.".into());
    }
    let mut warn = |warnings: &mut Vec<String>, message: String, target: Value| {
        diagnostics.push(json!({"message": message, "target": target}));
        warnings.push(message);
    };
    let mut reads: Map<String, Value> = Map::new();
    let mut max_current = 0.0;
    for br in &branches {
        let powered = supplied(&volt, br);
        let dv = at_root(&volt, br.a) - at_root(&volt, br.b);
        let i = if !l298_on(&volt, br) || !powered || !relay_on(&volt, br) {
            0.0
        } else if br.diode {
            most(0.0, (dv - br.vf) / br.r)
        } else {
            (dv - br.emf.unwrap_or(0.0)) / br.r
        };
        let lit = if br.buzzer {
            json!(dv >= 2.0)
        } else if br.led {
            json!(i > 0.00008)
        } else {
            undefined()
        };
        let mut read = Map::new();
        read.insert("voltage".into(), out(dv));
        read.insert("current".into(), out(i));
        read.insert("on".into(), lit.clone());
        read.insert("power".into(), out((dv * i).abs()));
        if br.sensor.is_some() {
            read.insert("powered".into(), json!(powered));
        }
        if br.led {
            read.insert("led".into(), json!(true));
        }
        if let Some(id) = &br.id {
            match &br.channel {
                Some(channel) => {
                    let total = reads.entry(id.clone()).or_insert_with(
                        || json!({"voltage": 0, "current": 0, "power": 0, "on": false, "channels": {}}),
                    );
                    let channels = total
                        .get_mut("channels")
                        .and_then(Value::as_object_mut)
                        .ok_or(BROKEN)?;
                    channels.insert(channel.clone(), Value::Object(read));
                    let (v, c, w) = (n(total, "voltage"), n(total, "current"), n(total, "power"));
                    total["voltage"] = out(most(v, dv));
                    total["current"] = out(if br.pot { most(c, i.abs()) } else { c + i });
                    total["power"] = out(w + (dv * i).abs());
                    if !get(total, "on").is_some_and(truthy) {
                        total["on"] = lit;
                    }
                }
                None => {
                    reads.insert(id.clone(), Value::Object(read));
                }
            }
        }
        if let Some(driver) = &br.driver {
            if i.abs() > 2.0 {
                let part = run.part(driver).ok_or(BROKEN)?;
                warn(
                    &mut warnings,
                    format!(
                        "{}: L298N 출력 전류 2 A 초과. 단락·부하를 확인하세요.",
                        show(get(part, "name"))
                    ),
                    json!({"type": "part", "id": driver}),
                );
            }
        }
        if let Some(name) = br.supply.as_ref().filter(|s| truthy(s)) {
            if i.abs() > 2.0 {
                warn(
                    &mut warnings,
                    format!(
                        "{}: 외부 전원 전류 2 A 초과. 단락·부하를 확인하세요.",
                        show(Some(name))
                    ),
                    json!({"type": "part", "id": br.id}),
                );
            }
        }
        if let Some((name, id)) = br.contact.as_ref().filter(|c| truthy(&c.0)) {
            if i.abs() > 1.0 {
                warn(
                    &mut warnings,
                    format!(
                        "{}: 접점 전류 1 A 초과. 부하와 전원 배선을 확인하세요.",
                        show(Some(name))
                    ),
                    json!({"type": "part", "id": id}),
                );
            }
        }
        if let Some(pin) = &br.gpio {
            if i.abs() > 0.02 {
                warn(
                    &mut warnings,
                    format!(
                        "{}: GPIO 전류 {} mA. 저항과 배선을 확인하세요.",
                        run.gpio_name(pin),
                        fixed1(i.abs() * 1000.0)
                    ),
                    json!({"type": "endpoint", "id": run.gpio_endpoint(pin)}),
                );
            }
        }
        if br.led && i > 0.02 {
            let id = br.id.clone().unwrap_or_default();
            let name = match br.id.as_deref().and_then(|id| run.part(id)) {
                Some(p) => show(get(p, "name")),
                None => "undefined".into(),
            };
            let channel = br
                .channel
                .as_ref()
                .map_or(String::new(), |c| format!(" {c}"));
            warn(
                &mut warnings,
                format!(
                    "{name}{channel}: LED 전류 {} mA. 직렬 저항을 늘리세요.",
                    fixed1(i * 1000.0)
                ),
                json!({"type": "part", "id": if br.id.is_some() { json!(id) } else { undefined() }}),
            );
        }
        if br.id.is_some() {
            max_current = most(max_current, i.abs());
        }
    }
    for p in parts {
        if text(p, "type") == "resistor" {
            let id = part_id(p);
            if reads.get(&id).is_some_and(|r| n(r, "power") > 0.25) {
                warn(
                    &mut warnings,
                    format!(
                        "{}: 저항 소비 전력이 0.25 W를 넘습니다.",
                        show(get(p, "name"))
                    ),
                    json!({"type": "part", "id": get(p, "id")}),
                );
            }
        }
    }
    // Only expose ground-referenced voltages. An isolated circuit must not read as ground.
    let mut anchored: HashSet<usize> = known.iter().map(|k| k.0).collect();
    let mut changed = true;
    while changed {
        changed = false;
        for br in &branches {
            if !l298_on(&volt, br) {
                continue;
            }
            if anchored.contains(&br.a) && !anchored.contains(&br.b) {
                anchored.insert(br.b);
                changed = true;
            }
            if anchored.contains(&br.b) && !anchored.contains(&br.a) {
                anchored.insert(br.a);
                changed = true;
            }
        }
    }
    let voltage = |nets: &mut Nets, id: &str| -> Option<f64> {
        let r = nets.find(id);
        if anchored.contains(&r) {
            volt.get(&r).copied()
        } else {
            None
        }
    };
    let mut capacitors = Map::new();
    let mut driver = 0;
    for p in parts {
        let id = part_id(p);
        match text(p, "type") {
            "l298n" => {
                let d = &drivers[driver];
                driver += 1;
                let pins: Vec<Option<f64>> = (0..14)
                    .map(|k| {
                        if k == 0 {
                            None
                        } else {
                            voltage(nets, &format!("part:{id}:p{k}"))
                        }
                    })
                    .collect();
                let state = l298_state(&|k| pins[k], d.grounded, 0.0);
                let read = reads
                    .get_mut(&id)
                    .and_then(Value::as_object_mut)
                    .ok_or(BROKEN)?;
                read.insert("powered".into(), json!(state.0));
                let channels: Map<String, Value> = L298
                    .iter()
                    .zip(&state.1)
                    .map(|(c, s)| {
                        let inputs: Vec<Value> =
                            s.1.iter()
                                .map(|l| l.map_or(Value::Null, |l| json!(l)))
                                .collect();
                        (
                            c.name.clone(),
                            json!({"enabled": s.0, "inputs": inputs, "mode": s.2}),
                        )
                    })
                    .collect();
                read.insert("channels".into(), Value::Object(channels));
                read.insert("on".into(), json!(state.0));
            }
            "capacitor" => {
                let (va, vb) = (
                    voltage(nets, &format!("part:{id}:a")),
                    voltage(nets, &format!("part:{id}:b")),
                );
                let charge = match (va, vb) {
                    (Some(va), Some(vb)) => out(va - vb),
                    _ => get(transient, "capacitors")
                        .filter(|c| !c.is_null())
                        .and_then(|c| set(c, &id))
                        .cloned()
                        .unwrap_or(json!(0)),
                };
                if !reads.get(&id).is_some_and(truthy) {
                    reads.insert(
                        id.clone(),
                        json!({"voltage": charge, "current": 0, "power": 0, "on": false}),
                    );
                }
                capacitors.insert(id, charge);
            }
            "potentiometer" => {
                let across = voltage(nets, &format!("part:{id}:p3")).unwrap_or(0.0)
                    - voltage(nets, &format!("part:{id}:p1")).unwrap_or(0.0);
                let read = reads.get_mut(&id).filter(|r| r.is_object()).ok_or(BROKEN)?;
                read["voltage"] = out(across);
            }
            _ => {}
        }
    }
    let volts = anchored
        .iter()
        .filter_map(|r| volt.get(r).map(|v| (*r, *v)))
        .collect();
    Ok(Solved {
        fault: !converged,
        shorted: false,
        warnings: unique(&warnings),
        diagnostics,
        parts: reads,
        current: max_current,
        capacitors,
        has_led: branches.iter().any(|br| br.led),
        volts,
    })
}
/// `[...new Set(list)]`.
fn unique(list: &[String]) -> Vec<String> {
    let mut seen = Vec::new();
    for item in list {
        if !seen.contains(item) {
            seen.push(item.clone());
        }
    }
    seen
}
/// The current through a part (or one of its channels) of a solution, 0 when it has none.
fn current_of(s: &Solved, id: &str, channel: Option<&str>) -> f64 {
    if s.fault {
        return 0.0;
    }
    let part = s.parts.get(id);
    let read = match channel {
        Some(ch) => part
            .and_then(|p| get(p, "channels"))
            .and_then(|c| get(c, ch)),
        None => part,
    };
    read.and_then(|r| set(r, "current"))
        .map_or(0.0, |c| to_num(Some(c)))
}
/// The solution of a circuit for the pins a program drives. PWM outputs (`pwm: {duty}`) are solved at their
/// average voltage, which suits motors, filters and ADC reads. An LED only conducts above its forward voltage, so
/// its current is the average of the PWM high and low phases instead: for each PWM pin the circuit is also solved
/// with that pin high and low, and the LED current follows that pin's duty.
fn solve_circuit(
    run: &Run,
    nets: &mut Nets,
    gpio: &Value,
    pressed: &Value,
    transient: &Value,
) -> R<Solved> {
    let mut result = solve_once(run, nets, gpio, pressed, transient)?;
    if result.fault || !result.has_led || on(transient, "pwmPhase") {
        return Ok(result);
    }
    let pwm: Vec<(&String, &Value, f64)> = gpio
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(_, g)| text(g, "mode") == "OUTPUT" && on(g, "pwm"))
        .map(|(pin, g)| (pin, g, n(&g["pwm"], "duty")))
        .filter(|(_, _, duty)| *duty > 0.0 && *duty < 1.0)
        .collect();
    if pwm.is_empty() {
        return Ok(result);
    }
    let mut phase = transient.as_object().cloned().unwrap_or_default();
    phase.insert("pwmPhase".into(), json!(true));
    let phase = Value::Object(phase);
    // (part id, channel) of every LED read, in the order of the parts and their channels.
    let mut leds: Vec<(String, Option<String>)> = Vec::new();
    for (id, read) in &result.parts {
        if on(read, "led") {
            leds.push((id.clone(), None));
        }
        for (ch, c) in get(read, "channels")
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
        {
            if on(c, "led") {
                leds.push((id.clone(), Some(ch.clone())));
            }
        }
    }
    let now = |s: &Solved, led: &(String, Option<String>)| -> f64 {
        let part = s.parts.get(&led.0);
        let read = match &led.1 {
            Some(ch) => part
                .and_then(|p| get(p, "channels"))
                .and_then(|c| get(c, ch)),
            None => part,
        };
        read.map_or(f64::NAN, |r| n(r, "current"))
    };
    let mut change = vec![0.0; leds.len()];
    for (pin, g, duty) in &pwm {
        let with = |value: Value| -> Value {
            let mut driven = g.as_object().cloned().unwrap_or_default();
            driven.insert("value".into(), value);
            driven.shift_remove("pwm");
            let mut all = gpio.as_object().cloned().unwrap_or_default();
            all.insert((*pin).clone(), Value::Object(driven));
            Value::Object(all)
        };
        let high = solve_once(run, nets, &with(out(n(g, "value") / duty)), pressed, &phase)?;
        let low = solve_once(run, nets, &with(json!(0)), pressed, &phase)?;
        for (i, led) in leds.iter().enumerate() {
            let (hi, lo) = (
                current_of(&high, &led.0, led.1.as_deref()),
                current_of(&low, &led.0, led.1.as_deref()),
            );
            change[i] += lo + duty * (hi - lo) - now(&result, led);
        }
    }
    for (i, led) in leds.iter().enumerate() {
        let current = most(0.0, now(&result, led) + change[i]);
        let part = result.parts.get_mut(&led.0).ok_or(BROKEN)?;
        let read = match &led.1 {
            Some(ch) => part
                .get_mut("channels")
                .and_then(|c| c.get_mut(ch))
                .ok_or(BROKEN)?,
            None => part,
        };
        read["current"] = out(current);
        read["on"] = json!(current > 0.00008);
    }
    for read in result.parts.values_mut() {
        if !get(read, "channels").is_some_and(truthy) || on(read, "led") {
            continue;
        }
        let channels: Vec<Value> = read["channels"]
            .as_object()
            .map(|c| c.values().cloned().collect())
            .unwrap_or_default();
        read["on"] = json!(channels.iter().any(|c| on(c, "on")));
        if channels.iter().all(|c| on(c, "led")) {
            read["current"] = out(channels.iter().fold(0.0, |a, c| a + n(c, "current")));
        }
    }
    Ok(result)
}

// ---------- the nets kept between solves ----------

/// A circuit whose nets are kept: what a solve needs of it that does not change while the nets stand.
struct Kept {
    handle: u64,
    nets: Nets,
    board: Value,
    /// Each part's id, kind and what else its kind of part is told by (the settings come with each solve).
    parts: Vec<Value>,
    nrst: bool,
}
thread_local! {
    /// The circuits being solved, by handle (the newest 24 are kept).
    static KEPT: RefCell<(u64, Vec<Kept>)> = const { RefCell::new((0, Vec::new())) };
}
const GONE: &str = "circuit nets: gone";
fn keep(nets: Nets, project: &Value) -> R<u64> {
    let parts = components(project)?
        .iter()
        .map(|p| {
            let mut fixed = Map::new();
            for key in ["id", "type", "model", "catalogVariant"] {
                if let Some(v) = get(p, key) {
                    fixed.insert(key.into(), v.clone());
                }
            }
            Value::Object(fixed)
        })
        .collect();
    let nrst = nrst_wired(project)?;
    let board = get(project, "boardId").cloned().unwrap_or(Value::Null);
    Ok(KEPT.with(|kept| {
        let mut kept = kept.borrow_mut();
        kept.0 += 1;
        let handle = kept.0;
        if kept.1.len() >= 24 {
            kept.1.remove(0);
        }
        kept.1.push(Kept {
            handle,
            nets,
            board,
            parts,
            nrst,
        });
        handle
    }))
}
/// Whether a value holds a number JSON cannot carry or an `undefined` (they travel as markers).
fn marked(v: &Value) -> bool {
    match v {
        Value::Object(o) => o.contains_key(NF) || o.values().any(marked),
        Value::Array(items) => items.iter().any(marked),
        _ => false,
    }
}
/// A read's `on` that is `undefined` (a part that is neither an LED nor a buzzer) goes as null: it is never null
/// otherwise, and the JavaScript side puts `undefined` back.
fn plain_on(read: &mut Value) {
    if read.get("on").is_some_and(|on| there(Some(on)).is_none()) {
        read["on"] = Value::Null;
    }
    if let Some(channels) = read.get_mut("channels").and_then(Value::as_object_mut) {
        for channel in channels.values_mut() {
            if channel
                .get("on")
                .is_some_and(|on| there(Some(on)).is_none())
            {
                channel["on"] = Value::Null;
            }
        }
    }
}
/// The answer of a solve for the JavaScript side: the reads, and the voltage of every grounded root as
/// `[index of the root's id, volts, …]` (null for a voltage that is not a number).
fn answer(s: Solved, nets: &Nets, seen: usize) -> Value {
    let mut parts = s.parts;
    for read in parts.values_mut() {
        plain_on(read);
    }
    let mut out_map = Map::new();
    out_map.insert("fault".into(), json!(s.fault));
    out_map.insert("warnings".into(), json!(s.warnings));
    out_map.insert("parts".into(), Value::Object(parts));
    out_map.insert("current".into(), out(s.current));
    if !s.shorted {
        out_map.insert("diagnostics".into(), Value::Array(s.diagnostics));
        out_map.insert("capacitors".into(), Value::Object(s.capacitors));
        out_map.insert("hasLed".into(), json!(s.has_led));
    }
    if out_map.values().any(marked) {
        out_map.insert("inexact".into(), json!(true));
    }
    let mut volts = Vec::with_capacity(s.volts.len() * 2);
    for (root, v) in &s.volts {
        volts.push(json!(root));
        volts.push(if v.is_finite() {
            json!(v)
        } else {
            json!(js_number(*v))
        });
    }
    out_map.insert("volts".into(), Value::Array(volts));
    // Ids the solve met for the first time: the JavaScript side's nets learn them in the same order.
    if nets.ids.len() > seen {
        out_map.insert("met".into(), json!(nets.ids[seen..]));
    }
    Value::Object(out_map)
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let none = json!({});
    let v = |i: usize| there(args.get(i)).unwrap_or(&null);
    let object = |i: usize| there(args.get(i)).filter(|x| !x.is_null()).unwrap_or(&none);
    Some(match name {
        // [project] → {ids, parent}
        "wiring_topology" => wiring_topology(v(0)).map(|nets| nets.listed()),
        // [model project, pressed] → {ids, parent}
        "circuit_topology" => topology(v(0), object(1)).map(|nets| nets.listed()),
        // [model project, pressed] → {handle, ids, parent}: the nets, kept for the solves that follow
        "circuit_nets" => topology(v(0), object(1)).and_then(|nets| {
            let mut listed = nets.listed();
            listed["handle"] = json!(keep(nets, v(0))?);
            Ok(listed)
        }),
        // [handle, the settings of each part, gpio, pressed, transient, active board id] → the solution
        "circuit_solve" => {
            let handle = v(0).as_u64().unwrap_or(0);
            let taken = KEPT.with(|kept| {
                let mut kept = kept.borrow_mut();
                kept.1
                    .iter()
                    .position(|k| k.handle == handle)
                    .map(|at| kept.1.remove(at))
            });
            let Some(mut kept) = taken else {
                return Some(Err(GONE.into()));
            };
            let seen = kept.nets.ids.len();
            let live = v(1).as_array().map_or(&[][..], Vec::as_slice);
            let parts: Vec<Value> = kept
                .parts
                .iter()
                .enumerate()
                .map(|(i, fixed)| {
                    let mut p = fixed.as_object().cloned().unwrap_or_default();
                    for (key, value) in live.get(i).and_then(Value::as_object).into_iter().flatten()
                    {
                        p.insert(key.clone(), value.clone());
                    }
                    Value::Object(p)
                })
                .collect();
            let project = json!({"boardId": kept.board, "components": parts});
            let run = Run {
                project: &project,
                active: board_pins(there(args.get(5))),
                nrst: kept.nrst,
            };
            let solved = solve_circuit(&run, &mut kept.nets, object(2), object(3), object(4));
            let result = solved.map(|s| answer(s, &kept.nets, seen));
            KEPT.with(|all| all.borrow_mut().1.push(kept));
            result
        }
        // [catalog part] → [[a, b]]
        "catalog_ties" => Ok(catalog_ties(v(0))
            .into_iter()
            .map(|(a, b)| json!([a, b]))
            .collect()),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn circuit() -> Value {
        json!({
            "boardId": "nucleo-f446re",
            "surfaces": {"board": {"hidden": false}, "breadboard": {"hidden": false}},
            "components": [
                {"id": "r1", "type": "resistor", "name": "R1", "value": 330},
                {"id": "led", "type": "led", "name": "LED", "color": "red"},
                {"id": "sw", "type": "button", "name": "SW"},
            ],
            "wires": [
                {"from": "board:CN10:11", "to": "part:r1:a"},
                {"from": "part:r1:b", "to": "part:led:a"},
                {"from": "part:led:b", "to": "board:CN7:8"},
            ],
        })
    }

    #[test]
    fn nets_follow_the_wires_and_the_pressed_button() {
        let project = circuit();
        let mut nets = topology(&project, &json!({})).unwrap();
        assert_eq!(nets.find("part:r1:b"), nets.find("part:led:a"));
        assert_eq!(nets.find("board:CN10:11"), nets.find("signal:PA5"));
        assert_ne!(nets.find("part:sw:a"), nets.find("part:sw:b"));
        let mut pressed = topology(&project, &json!({"sw": true})).unwrap();
        assert_eq!(pressed.find("part:sw:a"), pressed.find("part:sw:b"));
        assert_eq!(nets.find("bb:a:1"), nets.find("bb:e:1"));
    }

    #[test]
    fn a_driven_pin_lights_the_led() {
        let project = circuit();
        let mut nets = topology(&project, &json!({})).unwrap();
        let run = Run {
            project: &project,
            active: board_pins(None),
            nrst: false,
        };
        let gpio = json!({"PA5": {"mode": "OUTPUT", "value": 3.3}});
        let s = solve_circuit(&run, &mut nets, &gpio, &json!({}), &json!({"dt": 0.001})).unwrap();
        assert!(!s.fault);
        assert_eq!(s.parts["led"]["on"], true);
        let i = s.parts["led"]["current"].as_f64().unwrap();
        assert!(i > 0.003 && i < 0.005, "{i}");
        let off = solve_circuit(
            &run,
            &mut nets,
            &json!({}),
            &json!({}),
            &json!({"dt": 0.001}),
        )
        .unwrap();
        assert_eq!(off.parts["led"]["on"], false);
        assert_eq!(fixed1(2.25), "2.3");
        assert_eq!(fixed1(20.04), "20.0");
    }
}
