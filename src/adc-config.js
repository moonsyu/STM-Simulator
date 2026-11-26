// ADC1 regular group (CubeMX ADC_Regular_ConversionMode): Number Of Conversion (more than one turns Scan Conversion
// Mode on), the channel of each Rank and the External Trigger Conversion Source (a timer's TRGO instead of software).
// The code is in Rust (rust/stm-core/src/mcu.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure,rustTable,iocPart} from './rust-core.js';

const T=rustTable('adc_tables');
export const ADC_TRIGGERS=T.triggers;
export const ADC_TRIGGER_LABELS=T.labels;
const timerOf=rustPure('adc_trigger_timer');
/** The timer of a trigger ('T3_TRGO' → 'TIM3'), or null for software. */
export const adcTriggerTimer=trigger=>timerOf(String(trigger||''));
const part=config=>({pins:config.pins,peripherals:config.peripherals});
/** ADC1 channels that have a pin (ADC1_INn), ascending. */
export const adcPinChannels=config=>rustFn('adc_pin_channels',{pins:config.pins});
export const adcConversions=config=>config.peripherals?.ADC1?.conversions??1;
/** Channel of each rank: the configured one, else the pins' channels in ascending order (the last one repeats). */
export const adcRanks=config=>rustFn('adc_ranks',{pins:config.pins,peripherals:{ADC1:config.peripherals?.ADC1}});
// A rank that is undefined is a bad rank, not an empty one (JSON would turn it into null).
const sentRanks=ranks=>Array.isArray(ranks)?ranks.map(c=>c===undefined?'<undefined>':c):ranks;
/** Checks the group settings of `p` and puts what differs from the defaults into `q`. */
export function validateAdcGroup(p,q,family){
 // What was checked before a bad field stays in `q`, as it always did.
 const {add,error}=rustFn('validate_adc_group',{conversions:p.conversions,ranks:sentRanks(p.ranks),trigger:p.trigger},q.conversions,family);
 Object.assign(q,add);if(error)throw new Error(error);
}
export const adcGroupProblems=config=>rustFn('adc_group_problems',part(config));
/** .ioc: ADC1.NbrOfConversion, ADC1.Channel-N\#ChannelRegularConversion=ADC_CHANNEL_n, ADC1.ExternalTrigConv.
 *  Changes `target`; → the internal channels (temperature sensor, VREFINT, VBAT) that were left out. */
export function adcGroupFromIoc(values,family,target){
 const {ops,internal}=rustFn('adc_group_from_ioc',iocPart(values,'ADC1.'),family,target.conversions);
 for(const [op,key,value]of ops){if(op==='set')target[key]=value;else delete target[key];}
 return internal;
}
