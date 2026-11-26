// DAC (CubeMX Pinout & Configuration › Analog › DAC) of the NUCLEO-F446RE (RM0390 14): OUT1 on PA4, OUT2 on PA5. The
// STM32F103RB (medium density) has no DAC. Channels are switched on by their pins (DAC_OUT1 / DAC_OUT2); per channel the
// project keeps the trigger, the output buffer and the wave generation (`mcu.peripherals.DAC.channels.OUT1`).
// The code is in Rust (rust/stm-core/src/mcu.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure,rustTable,iocPart} from './rust-core.js';

const T=rustTable('dac_tables');
export const DAC_CHANNELS=T.channels;
// DAC_Trigger values in CubeMX's list order.
export const DAC_TRIGGERS=T.triggers;
export const DAC_WAVES=T.waves;
const amplitudeOf=rustPure('dac_amplitude_name'),channelOf=rustPure('dac_channel_of');
// MAMP 0..11: triangle amplitude 2^(n+1)-1 (DAC_TRIANGLEAMPLITUDE_1 .. _4095), noise LFSR bits 0..n unmasked.
export const dacAmplitudeName=(wave,n)=>n===undefined?amplitudeOf(String(wave)):amplitudeOf(String(wave),n);
export const dacChannelOf=fn=>channelOf(String(fn||''));
const part=config=>({pins:config.pins,peripherals:{DAC:config.peripherals?.DAC}});

/** Checked DAC settings: only what differs from CubeMX's defaults (trigger None, buffer on, no wave) is kept. */
export function validateDac(p){
 const q={enabled:p.enabled};
 if(p.channels===undefined)return q;
 const channels=rustFn('validate_dac',{channels:p.channels});
 if(channels)q.channels=channels;
 return q;
}
export const dacProblems=config=>rustFn('dac_problems',part(config));
/** MX_DAC_Init body after `hdac.Instance = DAC;` (CubeMX order: HAL_DAC_Init, then each channel and its wave). */
export const dacInitLines=config=>rustFn('dac_init_lines',part(config));
/** DAC settings from CubeMX .ioc keys: DAC.DAC_Trigger (OUT1), DAC.DAC_Trigger2 (OUT2), output buffer and wave keys. */
export function dacFromIoc(values){
 const q={enabled:true},channels=rustFn('dac_from_ioc',iocPart(values,'DAC.'));
 if(channels)q.channels=channels;
 return q;
}
