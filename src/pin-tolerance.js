// Input voltage limits of the STM32 pins on the NUCLEO headers, by I/O structure in the datasheet pin tables:
// FT pins are 5 V tolerant (VIN up to 5.5 V), except in analog mode (ADC input), where they take VDDA + 0.3 V like the
// TT/TTa pins (3.3 V only). STM32F446RE (DS10693, LQFP64): every port pin is FT but PA4/PA5 (TTa, DAC outputs).
// STM32F103RB (DS5319, LQFP64): PA0-PA7, PB0, PB1, PB5, PC0-PC5 and PC13-PC15 are not FT.
// A pin below VSS - 0.3 V is over its rating on either part. (Written from the datasheet tables; see docs/WORKLOG.md.)
import {isRaFamily} from './ra-config.js';
import {ALIASES} from './pins.js';

export const VDD=3.3,TT_MAX=3.6,FT_MAX=5.5,VIN_MIN=-0.3;
const F446_TTA=new Set(['PA4','PA5']);
const F103_NOT_FT=new Set(['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7','PB0','PB1','PB5','PC0','PC1','PC2','PC3','PC4','PC5','PC13','PC14','PC15']);

/** I/O structure of a port pin: 'FT' (5 V tolerant), 'TTa' (3.3 V, analog) or 'TT' (3.3 V); null for a non-STM32 part. */
export function pinStructure(family,pin){
 if(!/^P[A-H]\d+$/.test(pin)||isRaFamily(family))return null;
 if(family==='STM32F103RB')return F103_NOT_FT.has(pin)?'TT':'FT';
 return F446_TTA.has(pin)?'TTa':'FT';
}

// The Arduino header name of a port pin (PA0 → A0, PA5 → D13) for the message.
const arduino=pin=>Object.entries(ALIASES).filter(([,v])=>v===pin).map(([k])=>k).join('/');
const analog=fn=>/^ADC\d?_IN|^GPIO_Analog$|^DAC/.test(fn||'');

/** The highest input voltage the pin takes as configured, with the reason for the message. */
export function pinLimit(mcu,pin){
 const kind=pinStructure(mcu?.family,pin);if(!kind)return null;
 if(kind==='FT'&&!analog(mcu?.pins?.[pin]?.function))return {kind,max:FT_MAX,why:'5 V 허용(FT) 핀도 5.5 V까지'};
 if(kind==='FT')return {kind,max:TT_MAX,why:'아날로그(ADC) 모드에서는 5 V 허용(FT) 핀도 VDDA + 0.3 V = 3.6 V까지'};
 return {kind,max:TT_MAX,why:`5 V 비허용(${kind}) 핀이라 VDD + 0.3 V = 3.6 V까지`};
}

/** [{pin, label, endpoint, voltage, max, message}]: header pins whose solved voltage is outside the pin's rating. */
export function overVoltagePins(project,pins,voltageOf){
 if(!project?.mcu||isRaFamily(project.mcu.family))return [];
 const out=[],seen=new Set();
 for(const p of pins){
  const pin=p.signal;if(seen.has(pin))continue;const limit=pinLimit(project.mcu,pin);if(!limit)continue;seen.add(pin);
  const v=voltageOf(`signal:${pin}`);if(v==null)continue;
  const alias=arduino(pin),name=alias?`${pin}(${alias})`:pin;
  if(v>limit.max+1e-3)out.push({pin,label:name,endpoint:p.id,voltage:v,max:limit.max,message:`${name}: ${v.toFixed(2)} V가 걸려 있습니다. ${limit.why} 허용되어 핀이 손상될 수 있습니다. 분압 저항이나 레벨 변환기로 낮추세요.`});
  else if(v<VIN_MIN-1e-3)out.push({pin,label:name,endpoint:p.id,voltage:v,max:limit.max,message:`${name}: ${v.toFixed(2)} V가 걸려 있습니다. 핀 전압은 VSS - 0.3 V(−0.3 V)보다 낮으면 안 됩니다. GND 기준과 전원 극성을 확인하세요.`});
 }
 return out;
}
