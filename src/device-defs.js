// Module pinouts are part of the simulator's public circuit format.
// The tables and the sensor formulas are in Rust (rust/stm-core/src/devdefs.rs, data/device_defs.json; feature 62);
// this file is the JavaScript side.
import {rustTable,rustNumber} from './rust-core.js';
export const {DEVICE_DEFS,I2C_DEVICES,SPI_DEVICES,MODULE_DEVICES,DEVICE_RANGES,DEVICE_ADDRESSES}=rustTable('device_tables');
/** Whether an I2C part answers `address`: its own, or a second chip on the same module (ZS-042 EEPROM). */
export const answersI2c=(p,address)=>p.address===address||p.eepromAddress===address;
/** Resistance of the photoresistor at `lux`, and of the 10 kΩ NTC at `t` °C (asked while the circuit is solved). */
export const ldrResistance=rustNumber('ldr_resistance');
export const ntcResistance=rustNumber('ntc_resistance');
