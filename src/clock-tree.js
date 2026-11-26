// CubeMX Clock Configuration for the two NUCLEO boards: the clock sources, PLL and bus dividers of a project
// (`mcu.clock`), the frequencies they give, CubeMX's limits, and the values a .ioc stores.
// The code is in Rust (rust/stm-core/src/clock.rs; feature 62, the move of the app's logic to Rust): this file is what
// the JavaScript callers import, and only passes the calls on.
import {rustCall} from './rust-core.js';

const TABLES=rustCall('clock_tables');
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
// The Rust side answers with sorted keys: the tables keep the key order they had as JavaScript literals.
const keyed=(value,keys)=>Object.fromEntries(keys.filter(k=>k in value).map(k=>[k,value[k]]));
const FAMILIES=['STM32F446RE','STM32F103RB'],LIMIT_KEYS=['pllM','pllN','pllQ','pllMul','vcoIn','vco','pll','sysclk','hclk','pclk1','pclk2','adc'];
export const HSI_HZ=frozen(keyed(TABLES.hsi,FAMILIES)),HSE_HZ=TABLES.hse;
export const AHB_DIVIDERS=frozen(TABLES.ahb),APB_DIVIDERS=frozen(TABLES.apb),ADC_PRESCALERS=frozen(TABLES.adc);
export const PLLP_VALUES=frozen(TABLES.pllP);
export const LIMITS=frozen(Object.fromEntries(FAMILIES.map(f=>[f,keyed(TABLES.limits[f],LIMIT_KEYS)])));
export const isF1Clock=family=>family==='STM32F103RB';

// A tree's fields in the order the project files have them (the Rust side answers with sorted keys).
const ORDER=['sysclkSource','pllSource','hsePrediv','pllMul','pllM','pllN','pllP','pllQ','ahb','apb1','apb2','adcPrescaler'];
const ordered=tree=>{if(!tree)return tree;const out={};for(const key of ORDER)if(key in tree)out[key]=tree[key];for(const key in tree)if(!(key in out))out[key]=tree[key];return out;};
// A field set to undefined is a bad field, not a missing one (JSON would drop it).
const sent=tree=>tree&&typeof tree==='object'&&!Array.isArray(tree)?Object.fromEntries(Object.entries(tree).map(([k,v])=>[k,v===undefined?null:v])):tree;
const family=name=>name??'';

/** CubeMX's values for a new project: HSI straight to SYSCLK, every divider 1. */
export const defaultClockTree=name=>ordered(rustCall('clock_default_tree',{family:family(name)}));
/** The tree the older single setting stands for (the generator's HSI plans for an APB1 timer clock). */
export const treeFromTimerHz=(name,hz)=>ordered(rustCall('clock_tree_from_timer_hz',{family:family(name),hz:Number.isFinite(hz)?hz:null}));

// The interpreters ask for the same tree's frequencies again and again: the answers are kept by family and tree.
const FREQUENCIES=new Map(),FREQUENCY_KEYS=['hsi','hse','vcoIn','vco','pll','pllQ','sysclk','hclk','pclk1','pclk2','tim1','tim2','adc'];
/** Frequencies in Hz: the PLL stages, SYSCLK, HCLK, PCLK1/2, the APB1/APB2 timer clocks and the ADC clock. */
export function clockFrequencies(name,t){
 const key=family(name)+JSON.stringify(t);let q=FREQUENCIES.get(key);
 if(!q){if(FREQUENCIES.size>256)FREQUENCIES.clear();q=rustCall('clock_frequencies',{family:family(name),tree:t});FREQUENCIES.set(key,q);}
 const out={};for(const k of FREQUENCY_KEYS)out[k]=q[k];return out;
}
/** Flash wait states for HCLK (F446 at 2.7-3.6 V: one per 30 MHz; F103: 0 to 24 MHz, 1 to 48 MHz, 2 above). */
export const flashLatency=(name,hclk)=>rustCall('clock_flash',{family:family(name),hclk}).latency;
/** F446 above 168 MHz needs the regulator's over-drive mode. */
export const needsOverDrive=(name,hclk)=>rustCall('clock_flash',{family:family(name),hclk}).overDrive;

/** CubeMX's red marks, in words: every frequency over its limit and every PLL stage out of its range. */
export const clockTreeProblems=(name,t)=>rustCall('clock_problems',{family:family(name),tree:t}).problems;
/** The ADC clock limit only matters when ADC1 is on (CubeMX shows it red then). */
export const adcClockProblem=(name,t)=>rustCall('clock_problems',{family:family(name),tree:t}).adc;

/** A stored tree checked field by field (missing fields take the CubeMX defaults). */
export const validateClockTree=(name,raw)=>ordered(rustCall('clock_validate',{family:family(name),tree:sent(raw)??null}));

/** The tree a CubeMX .ioc describes; keys it leaves out are CubeMX defaults. null when the .ioc sets no RCC values. */
export function clockTreeFromIoc(name,values){
 const clock={};for(const key in values)if((key.startsWith('RCC.')||key==='ADC1.ClockPrescaler')&&typeof values[key]==='string')clock[key]=values[key];
 return ordered(rustCall('clock_tree_from_ioc',{family:family(name),values:clock}));
}

/** The project's tree: its own `mcu.clock`, or the one its APB1 timer clock stands for. */
export const clockTreeOf=mcu=>mcu?.clock?validateClockTree(mcu.family,mcu.clock):treeFromTimerHz(mcu?.family,mcu?.timerClockHz);
