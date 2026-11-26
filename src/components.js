// The parts a circuit can hold and where their terminals are: geometry shared by rendering, hit testing, mounting and
// project validation. The tables and the geometry are in Rust (rust/stm-core/src/parts.rs, feature 62); this file is
// the JavaScript side: it asks once for each state of a part and keeps the answer, as these are called for every part
// each time the circuit is drawn.
import {rustTable,rustPure,rustExact,rustNumber} from './rust-core.js';
import {CATALOG_TWO_PIN,CATALOG_BY_TYPE} from './catalog-defs.js';

export const {TWO_PIN_TYPES,MULTI_PIN_TYPES,PART_DEFS,LCD_LABELS,WIRE_COLORS}=rustTable('part_tables');
const leadSpan=rustPure('part_lead_span'),labelOf=rustPure('part_terminal_label'),pinsOf=rustPure('part_physical_pins');
/** The lead spacing a small two-lead part always has (legs bent close to the body as on a real breadboard), or null. */
export const fixedLeadSpan=p=>leadSpan(String(p?.type));
export const normalizeAngle=rustNumber('normalize_angle');

// What the Rust side says of a part's terminals, kept until what it depends on changes.
const shapes=new WeakMap();
function shape(p){
 const key=[p.type,p.x,p.y,p.rotation,p.scale,p.scaleX,p.scaleY,p.skewX,p.span,p.electricalPins?.join(',')].join('|'),had=typeof p==='object'?shapes.get(p):null;
 if(had?.key===key)return had.shape;
 const answer=rustExact('part_shape',{type:p.type,x:p.x,y:p.y,rotation:p.rotation,scale:p.scale,scaleX:p.scaleX,scaleY:p.scaleY,skewX:p.skewX,span:p.span,electricalPins:p.electricalPins});
 // The places come as x, y pairs in the order of `at` (the keys they belong to).
 const points=flat=>answer.at.map((key,i)=>({key,x:flat[2*i],y:flat[2*i+1]}));
 answer.local=points(answer.local);answer.nominal=points(answer.nominal);
 if(typeof p==='object')shapes.set(p,{key,shape:answer});return answer;
}
export function terminalKeys(p){if(p.electricalPins)return p.electricalPins;return [...shape(p).keys];}
export function attachments(p){return TWO_PIN_TYPES.includes(p.type)?{...(p.attachA?{[CATALOG_TWO_PIN.includes(p.type)?'p1':'a']:p.attachA}:{}),...(p.attachB?{[CATALOG_TWO_PIN.includes(p.type)?'p2':'b']:p.attachB}:{})}:p.attachments||{};}
export function terminalLabel(p,key){return labelOf(p.type,String(key))??undefined;}
/** Terminal keys of a part's contacts that are wired directly (screw terminals, connectors), never put into a breadboard hole. */
export function wiredKeys(p){return CATALOG_BY_TYPE[p?.type]?[...shape(p).wired]:[];}
/** Terminal keys that plug into breadboard holes. */
export const pluggedKeys=p=>[...shape(p).plugged];
/** Pin positions of a basic multi-pin part taken from the real part it is drawn as, when the pins it uses stand in one
 * row (null otherwise: a basic part on two pin rows of a DIP keeps its own row). */
export const physicalPins=type=>pinsOf(type);
// One call turns the point and answers x; the y of that same call is read right after it.
const rotate=rustNumber('rotate'),rotatedY=rustNumber('rotate_y');
export function rotatePoint(x,y,angle){const turned=rotate(x,y,angle);return {x:turned,y:rotatedY()};}
export function localTerminals(p){return shape(p).local.map(t=>({...t}));}
export function nominalTerminals(p){return shape(p).nominal.map(t=>({...t}));}
export function detachPart(p){delete p.attachA;delete p.attachB;delete p.attachments;}
export function assignAttachments(p,map){detachPart(p);if(TWO_PIN_TYPES.includes(p.type)){const keys=CATALOG_TWO_PIN.includes(p.type)?['p1','p2']:['a','b'];if(map[keys[0]])p.attachA=map[keys[0]];if(map[keys[1]])p.attachB=map[keys[1]];}else if(Object.keys(map).length)p.attachments={...map};}
/** What the Rust side reads of a part: its kind, place, size and what it is attached to (only what the part has). */
const VIEWED=['id','type','name','variant','x','y','rotation','scale','scaleX','scaleY','skewX','span','electricalPins','attachA','attachB','attachments'];
export const partView=p=>{const view={};for(const key of VIEWED)if(p[key]!==undefined)view[key]=p[key];return view;};
