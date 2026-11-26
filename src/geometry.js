// Everything is drawn at real size: the 2.54 mm pin and hole pitch is 14 units (1 mm = 14/2.54 units).
// The sizes and the transforms are in Rust (rust/stm-core/src/geom.rs, feature 62); this file is the JavaScript side.
// The transforms are asked for every part and hole each time the circuit is drawn, so they are calls of numbers: a
// function with more than one number to give answers the first, and `more1` … `more3` read the others right after it.
import {rustTable,rustNumber,rustExact} from './rust-core.js';

const tables=rustTable('geometry_tables');
// NUCLEO-64 (MB1136): 70 × 82.5 mm (UM1724 Figure 5). pins.js sets the active board's outline here (setActiveBoard).
export const BOARD={...tables.BOARD};
// 400-point half-size board (BusBoard BB400 class): 54.3 × 84 mm, 30 rows.
export const BB={...tables.BB};
// Full-size 830-point board (BusBoard BB830: 165.1 × 54.6 mm) in its own local frame: 63 columns, two 5-row blocks,
// rails top and bottom.
export const FULL_BB={...tables.FULL_BB,rows:{...tables.FULL_BB.rows},rails:{T:[...tables.FULL_BB.rails.T],B:[...tables.FULL_BB.rails.B]}};
export const {MIN_SCALE,MAX_SCALE}=tables;
export const scaleOf=value=>value?.scale??1;
export const scaleXOf=value=>value?.scaleX??scaleOf(value);
export const scaleYOf=value=>value?.scaleY??scaleOf(value);
export function validScale(value){rustExact('valid_scale',value);return value;}
const more1=rustNumber('geom_1'),more2=rustNumber('geom_2'),more3=rustNumber('geom_3');
const matrix=rustNumber('geom_matrix'),turn=rustNumber('geom_vector'),partTurn=rustNumber('geom_part_vector'),invert=rustNumber('geom_inverse'),product=rustNumber('geom_multiply');
const place=rustNumber('geom_surface_point'),bounds=rustNumber('geom_surface_bounds');
// Quarter turns are exact (cos 90° is 6e-17 in floating point): a board turned four times is where it started.
export function matrixOf(value){const a=matrix(value?.rotation??0,scaleXOf(value),scaleYOf(value),value?.skewX??0);return {a,b:more1(),c:more2(),d:more3()};}
export const vector=(m,p)=>{const x=turn(m.a,m.b,m.c,m.d,p.x,p.y);return {x,y:more1()};};
export const partVector=(p,x,y)=>{const vx=partTurn(p?.rotation??0,scaleXOf(p),scaleYOf(p),p?.skewX??0,x,y);return {x:vx,y:more1()};};
export function inverse(m){const a=invert(m.a,m.b,m.c,m.d);return {a,b:more1(),c:more2(),d:more3()};}
export function multiply(m,n){const a=product(m.a,m.b,m.c,m.d,n.a,n.b,n.c,n.d);return {a,b:more1(),c:more2(),d:more3()};}
export const scaleFields=(x,y)=>rustExact('scale_fields',x,y);
export const matrixFields=m=>rustExact('matrix_fields',m);
export function assignScale(object,fields){delete object.scale;delete object.scaleX;delete object.scaleY;Object.assign(object,fields);}
// The texts of SVG transform attributes (what the screen code writes into the page).
export function scaleTransform(value){const x=scaleXOf(value),y=scaleYOf(value);return `scale(${x===y?x:`${x} ${y}`})`;}
export const partTransform=p=>`translate(${p.x} ${p.y}) rotate(${p.rotation}) skewX(${p.skewX??0}) ${scaleTransform(p)}`;
export function surfaceOrigin(name,surfaces){const base=name==='board'?BOARD:BB,s=surfaces?.[name];return {x:s?.x??base.x,y:s?.y??base.y};}
// A surface is drawn from its origin (the corner that is top left before turning): turned by `rotation` (the main
// board, in quarter turns), then scaled. The origin of a turned board is therefore not the top left of what is seen —
// use surfaceBounds / surfaceCentre for that.
const placed=(x,y,base,origin,s)=>place(x,y,base.x,base.y,origin.x,origin.y,s?.rotation?1:0,s?.rotation??0,scaleXOf(s),scaleYOf(s),s?.skewX??0);
export function surfacePoint(point,name,surfaces){const base=name==='board'?BOARD:BB,x=placed(point.x,point.y,base,surfaceOrigin(name,surfaces),surfaces?.[name]);return {...point,x,y:more1()};}
export function surfaceTransform(name,surfaces){const base=name==='board'?BOARD:BB,origin=surfaceOrigin(name,surfaces),r=surfaces?.[name]?.rotation;return `translate(${origin.x} ${origin.y}) ${r?`rotate(${r}) `:''}${scaleTransform(surfaces?.[name])} translate(${-base.x} ${-base.y})`;}
export function surfaceBounds(name,surfaces){const base=name==='board'?BOARD:BB,origin=surfaceOrigin(name,surfaces),s=surfaces?.[name],left=bounds(base.x,base.y,base.w,base.h,origin.x,origin.y,s?.rotation?1:0,s?.rotation??0,scaleXOf(s),scaleYOf(s),s?.skewX??0);return {left,right:more1(),top:more2(),bottom:more3()};}
export function surfaceCentre(name,surfaces){const base=name==='board'?BOARD:BB,x=placed(base.x+base.w/2,base.y+base.h/2,base,surfaceOrigin(name,surfaces),surfaces?.[name]);return {x,y:more1()};}
