// ADC1 regular group (CubeMX ADC_Regular_ConversionMode): Number Of Conversion (more than one turns Scan Conversion
// Mode on), the channel of each Rank and the External Trigger Conversion Source (a timer's TRGO instead of software).
// F446RE triggers: TIM2 / TIM3 / TIM8 TRGO (rising edge); F103RB: TIM3 TRGO.
export const ADC_TRIGGERS=Object.freeze({STM32F446RE:['SOFTWARE','T2_TRGO','T3_TRGO','T8_TRGO'],STM32F103RB:['SOFTWARE','T3_TRGO']});
export const ADC_TRIGGER_LABELS=Object.freeze({SOFTWARE:'Regular Conversion launched by software',T2_TRGO:'Timer 2 Trigger Out event',T3_TRGO:'Timer 3 Trigger Out event',T8_TRGO:'Timer 8 Trigger Out event'});
/** The timer of a trigger ('T3_TRGO' → 'TIM3'), or null for software. */
export const adcTriggerTimer=trigger=>/^T(\d)_TRGO$/.exec(trigger||'')?.[1]?'TIM'+/^T(\d)_TRGO$/.exec(trigger)[1]:null;
/** ADC1 channels that have a pin (ADC1_INn), ascending. */
export const adcPinChannels=config=>Object.values(config.pins||{}).filter(p=>/^ADC1_IN\d+$/.test(p.function)).map(p=>Number(p.function.slice(7))).sort((a,b)=>a-b);
export const adcConversions=config=>config.peripherals?.ADC1?.conversions??1;
/** Channel of each rank: the configured one, else the pins' channels in ascending order (the last one repeats). */
export function adcRanks(config){
 const p=config.peripherals?.ADC1??{},pins=adcPinChannels(config),n=adcConversions(config);
 return Array.from({length:n},(_,i)=>p.ranks?.[i]??pins[Math.min(i,pins.length-1)]??0);
}
export function validateAdcGroup(p,q,family){
 const f1=family==='STM32F103RB',maxChannel=f1?17:18;
 if(p.conversions!==undefined){if(!Number.isInteger(p.conversions)||p.conversions<1||p.conversions>16)throw new Error('ADC1 Number Of Conversion: 1~16 범위의 정수를 입력하세요.');if(p.conversions>1)q.conversions=p.conversions;}
 if(p.ranks!==undefined){
  if(!Array.isArray(p.ranks)||p.ranks.length>16||p.ranks.some(c=>c!==null&&(!Number.isInteger(c)||c<0||c>maxChannel)))throw new Error(`ADC1 Rank: 채널 0~${maxChannel}을 Rank마다 하나씩 고르세요.`);
  const ranks=p.ranks.slice(0,q.conversions??1);while(ranks.length&&ranks.at(-1)===null)ranks.pop();if(ranks.some(c=>c!==null))q.ranks=ranks;
 }
 if(p.trigger!==undefined){if(!ADC_TRIGGERS[family].includes(p.trigger))throw new Error(`ADC1 External Trigger: ${ADC_TRIGGERS[family].join(' / ')} 중에서 고르세요.`);if(p.trigger!=='SOFTWARE')q.trigger=p.trigger;}
}
export function adcGroupProblems(config){
 const p=config.peripherals?.ADC1,errors=[];if(!p?.enabled)return errors;const pins=adcPinChannels(config);
 adcRanks(config).forEach((ch,i)=>{if(ch<16&&!pins.includes(ch))errors.push(`ADC1 Rank ${i+1}: IN${ch} 핀을 ADC1_IN${ch}로 활성화하세요.`);});
 const timer=adcTriggerTimer(p.trigger);
 if(timer){const t=config.peripherals[timer];if(!t?.enabled||t.trgo!=='UPDATE')errors.push(`ADC1 External Trigger ${p.trigger}: ${timer}를 켜고 Trigger Event Selection(TRGO)을 Update Event로 두어야 변환이 시작됩니다.`);}
 return errors;
}
/** .ioc: ADC1.NbrOfConversion, ADC1.Channel-N\#ChannelRegularConversion=ADC_CHANNEL_n, ADC1.ExternalTrigConv. */
export function adcGroupFromIoc(values,family,target){
 const n=Number(values['ADC1.NbrOfConversion']);if(Number.isInteger(n)&&n>1&&n<=16)target.conversions=n;
 const ranks=[];for(const [k,v]of Object.entries(values)){const m=/^ADC1\.Channel-(\d+)\\?#ChannelRegularConversion$/.exec(k),ch=/^ADC_CHANNEL_(\d+)$/.exec(v);if(m&&ch&&Number(m[1])<(target.conversions??1))ranks[Number(m[1])]=Number(ch[1]);}
 if(ranks.length)target.ranks=Array.from(ranks,c=>c??null);
 const t=/^ADC_EXTERNALTRIGCONV_(T\d_TRGO)$/.exec(values['ADC1.ExternalTrigConv']||'')?.[1];if(t&&ADC_TRIGGERS[family].includes(t))target.trigger=t;
}
