// I2C and SPI instances beyond the first (CubeMX Connectivity › I2C1-3, SPI1-3): ids, pin routes, alternate functions.
// The code is in Rust (rust/stm-core/src/periph.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure,rustTable} from './rust-core.js';

const T=rustTable('bus_tables');
export const I2C_IDS=T.i2c,SPI_IDS=T.spi;
export const F4_BUS_ROUTES=T.f4;
export const F1_BUS_ROUTES=T.f1;
const name=id=>typeof id==='string'?id:String(id);
const isI2cOf=rustPure('is_i2c'),isSpiOf=rustPure('is_spi'),i2cOfFn=rustPure('i2c_of'),spiOfFn=rustPure('spi_of'),handleOf=rustPure('bus_handle'),afOf=rustPure('bus_af');
export const isI2c=id=>isI2cOf(name(id)),isSpi=id=>isSpiOf(name(id));
/** The I2C / SPI instance a pin function belongs to (I2C2_SDA → I2C2), or null. */
export const i2cOf=fn=>i2cOfFn(name(fn));
export const spiOf=fn=>spiOfFn(name(fn));
/** CubeMX handle names: hi2c2, hspi3. */
export const busHandle=id=>handleOf(name(id));
/** F446 AF number of an I2C / SPI signal on a pin, or null for another function. */
export const busAf=(fn,pin)=>afOf(name(fn),name(pin));
/** IRQ names of the buses of a family beyond I2C1 / SPI1. */
export const busIrqs=routes=>rustFn('bus_irqs',Object.keys(routes));
