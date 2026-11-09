// DAC (CubeMX Pinout & Configuration › Analog › DAC) of the NUCLEO-F446RE (RM0390 14): OUT1 on PA4, OUT2 on PA5. The
// STM32F103RB (medium density) has no DAC. Channels are switched on by their pins (DAC_OUT1 / DAC_OUT2); per channel the
// project keeps the trigger, the output buffer and the wave generation (`mcu.peripherals.DAC.channels.OUT1`).
export const DAC_CHANNELS=['OUT1','OUT2'];
// DAC_Trigger values in CubeMX's list order; TSEL (CR bits 5:3) of each in the comment of the emulator (dac.js).
export const DAC_TRIGGERS={NONE:'None',T6_TRGO:'Timer 6 Trigger Out event',T8_TRGO:'Timer 8 Trigger Out event',T7_TRGO:'Timer 7 Trigger Out event',T5_TRGO:'Timer 5 Trigger Out event',
  T2_TRGO:'Timer 2 Trigger Out event',T4_TRGO:'Timer 4 Trigger Out event',EXT_IT9:'External line 9',SOFTWARE:'Software trigger'};
export const DAC_WAVES={NONE:'Disabled',NOISE:'Noise wave generation',TRIANGLE:'Triangle wave generation'};
// MAMP 0..11: triangle amplitude 2^(n+1)-1 (DAC_TRIANGLEAMPLITUDE_1 .. _4095), noise LFSR bits 0..n unmasked.
export const dacAmplitudeName=(wave,n)=>wave==='TRIANGLE'?`DAC_TRIANGLEAMPLITUDE_${2**(n+1)-1}`:n===0?'DAC_LFSRUNMASK_BIT0':`DAC_LFSRUNMASK_BITS${n}_0`;
export const dacChannelOf=fn=>/^DAC_(OUT[12])$/.exec(fn||'')?.[1]??null;
const pinChannels=config=>DAC_CHANNELS.filter(ch=>Object.values(config.pins||{}).some(p=>p.function==='DAC_'+ch));

/** Checked DAC settings: only what differs from CubeMX's defaults (trigger None, buffer on, no wave) is kept. */
export function validateDac(p){
  const q={enabled:p.enabled};
  if(p.channels===undefined)return q;
  if(!p.channels||typeof p.channels!=='object'||Array.isArray(p.channels))throw new Error('DAC: 채널 설정을 확인하세요.');
  const channels={};
  for(const [ch,c]of Object.entries(p.channels)){
    if(!DAC_CHANNELS.includes(ch)||!c||typeof c!=='object')throw new Error(`DAC ${ch}: OUT1 또는 OUT2 채널입니다.`);
    const out={};
    if(c.trigger!==undefined){if(!Object.hasOwn(DAC_TRIGGERS,c.trigger))throw new Error(`DAC ${ch} Trigger: ${Object.keys(DAC_TRIGGERS).join(' / ')} 중에서 고르세요.`);if(c.trigger!=='NONE')out.trigger=c.trigger;}
    if(c.buffer!==undefined){if(typeof c.buffer!=='boolean')throw new Error(`DAC ${ch} Output Buffer: true 또는 false입니다.`);if(!c.buffer)out.buffer=false;}
    if(c.wave!==undefined&&c.wave!=='NONE'){
      if(!Object.hasOwn(DAC_WAVES,c.wave))throw new Error(`DAC ${ch} Wave generation: NONE / NOISE / TRIANGLE 중에서 고르세요.`);
      if(!out.trigger)throw new Error(`DAC ${ch}: 파형 생성(Noise/Triangle)은 트리거가 있을 때만 씁니다. Trigger를 고르세요.`);
      const n=c.amplitude??0;if(!Number.isInteger(n)||n<0||n>11)throw new Error(`DAC ${ch} 진폭(MAMP): 0~11입니다.`);
      out.wave=c.wave;out.amplitude=n;
    }
    if(Object.keys(out).length)channels[ch]=out;
  }
  if(Object.keys(channels).length)q.channels=channels;
  return q;
}
export function dacProblems(config){
  const d=config.peripherals?.DAC;if(!d?.enabled)return [];
  const on=pinChannels(config);
  if(!on.length)return ['DAC: 출력 핀(PA4 DAC_OUT1 또는 PA5 DAC_OUT2)을 활성화하세요.'];
  return Object.keys(d.channels||{}).filter(ch=>!on.includes(ch)).map(ch=>`DAC ${ch}: 설정이 있지만 ${ch==='OUT1'?'PA4':'PA5'} 핀이 DAC_${ch}가 아닙니다.`);
}

/** MX_DAC_Init body after `hdac.Instance = DAC;` (CubeMX order: HAL_DAC_Init, then each channel and its wave). */
export function dacInitLines(config){
  const d=config.peripherals.DAC,lines=['  DAC_ChannelConfTypeDef sConfig = {0};','  if (HAL_DAC_Init(&hdac) != HAL_OK) Error_Handler();'];
  for(const ch of pinChannels(config)){
    const c=d.channels?.[ch]??{},n=ch.slice(3);
    lines.push(`  sConfig.DAC_Trigger = DAC_TRIGGER_${c.trigger??'NONE'};`,`  sConfig.DAC_OutputBuffer = DAC_OUTPUTBUFFER_${c.buffer===false?'DISABLE':'ENABLE'};`,`  if (HAL_DAC_ConfigChannel(&hdac, &sConfig, DAC_CHANNEL_${n}) != HAL_OK) Error_Handler();`);
    if(c.wave)lines.push(`  if (HAL_DACEx_${c.wave==='TRIANGLE'?'Triangle':'Noise'}WaveGenerate(&hdac, DAC_CHANNEL_${n}, ${dacAmplitudeName(c.wave,c.amplitude)}) != HAL_OK) Error_Handler();`);
  }
  return lines;
}

/** DAC settings from CubeMX .ioc keys: DAC.DAC_Trigger (OUT1), DAC.DAC_Trigger2 (OUT2), output buffer and wave keys. */
export function dacFromIoc(values){
  const q={enabled:true},channels={};
  for(const [ch,suffix]of [['OUT1',''],['OUT2','2']]){
    const c={},own=Object.entries(values).filter(([k])=>new RegExp(`^DAC\\.\\w*?${suffix?'2':'(?<!2)'}$`).test(k)).map(([,v])=>v).join(' ');
    const trigger=/DAC_TRIGGER_(\w+)/.exec(values['DAC.DAC_Trigger'+suffix]||'')?.[1];if(trigger&&Object.hasOwn(DAC_TRIGGERS,trigger)&&trigger!=='NONE')c.trigger=trigger;
    if(/DAC_OUTPUTBUFFER_DISABLE/.test(own))c.buffer=false;
    const tri=/DAC_TRIANGLEAMPLITUDE_(\d+)/.exec(own),noise=/DAC_LFSRUNMASK_BIT(?:S(\d+)_0|0)/.exec(own);
    if(c.trigger&&tri)Object.assign(c,{wave:'TRIANGLE',amplitude:Math.max(0,Math.round(Math.log2(Number(tri[1])+1))-1)});
    else if(c.trigger&&(noise||/NOISE/.test(own)))Object.assign(c,{wave:'NOISE',amplitude:noise?.[1]?Number(noise[1]):0});
    if(Object.keys(c).length)channels[ch]=c;
  }
  if(Object.keys(channels).length)q.channels=channels;
  return q;
}
