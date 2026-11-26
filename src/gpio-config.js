// GPIO settings as CubeMX's GPIO table shows them: GPIO mode (push-pull / open-drain output), pull and maximum
// output speed. The code is in Rust (rust/stm-core/src/periph.rs; feature 62): this file is what the JavaScript
// callers import.
import {rustPure,rustTable} from './rust-core.js';

const T=rustTable('gpio_tables');
export const GPIO_SPEEDS=T.speeds;
const F1_SPEEDS=Object.freeze(GPIO_SPEEDS.slice(0,3));
export const speedsOf=f1=>f1?F1_SPEEDS:GPIO_SPEEDS;
export const SPEED_NAMES=T.speedNames;
const name=v=>typeof v==='string'?v:String(v);
const speedOf=rustPure('default_speed'),modeOf=rustPure('gpio_mode'),hasSpeedOf=rustPure('has_speed'),signalOf=rustPure('signal_name'),commOf=rustPure('is_comm_signal');
export const defaultSpeed=(fn,f1)=>speedOf(name(fn),!!f1);
export const pinSpeed=(p,f1)=>p.speed??defaultSpeed(p.function,f1);
// HAL GPIO_MODE_x of a configured pin (without the GPIO_MODE_ prefix).
export const gpioMode=(p,config,f1)=>modeOf(name(p.function),p.outputType??'',`${p.edge}`,f1&&/^TIM\d_CH\d$/.test(p.function)?config.peripherals[p.function.split('_')[0]]?.mode??'':'',!!f1);
// CubeMX writes Speed only for outputs and alternate functions.
export const hasSpeed=mode=>hasSpeedOf(name(mode));
// CubeMX signal names for the pin click menu and the pin tiles.
export const signalName=(fn,pin)=>signalOf(name(fn),name(pin));
export const isCommSignal=fn=>commOf(name(fn));
