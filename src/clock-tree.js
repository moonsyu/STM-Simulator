// CubeMX Clock Configuration for the two NUCLEO boards: the clock sources, PLL and bus dividers of a project
// (`mcu.clock`), the frequencies they give, CubeMX's limits, and the values a .ioc stores. Limits are from the CubeMX
// 6.18 database (db/mcu/IP/RCC-STM32F446-rcc_v1_0_Modes.xml, RCC-STM32F102_rcc_v1_0_Modes.xml for the F103).
// HSE is the NUCLEO's ST-LINK MCO, 8 MHz in BYPASS mode (no crystal is fitted on X3 by default).
// A project without `mcu.clock` keeps the older single setting (APB1 timer clock, HSI only): see clockTreeOf.
export const HSI_HZ={STM32F446RE:16e6,STM32F103RB:8e6},HSE_HZ=8e6;
export const AHB_DIVIDERS=[1,2,4,8,16,64,128,256,512],APB_DIVIDERS=[1,2,4,8,16],ADC_PRESCALERS=[2,4,6,8];
export const PLLP_VALUES=[2,4,6,8];
export const LIMITS={
 STM32F446RE:{pllM:[2,63],pllN:[50,432],pllQ:[2,15],vcoIn:[0.95e6,2.1e6],vco:[100e6,432e6],pll:[24e6,180e6],sysclk:180e6,hclk:180e6,pclk1:45e6,pclk2:90e6,adc:36e6},
 STM32F103RB:{pllMul:[2,16],pll:[0,72e6],sysclk:72e6,hclk:72e6,pclk1:36e6,pclk2:72e6,adc:14e6}
};
const f1=family=>family==='STM32F103RB';
export const isF1Clock=f1;

/** CubeMX's values for a new project: HSI straight to SYSCLK, every divider 1. */
export function defaultClockTree(family){
 return f1(family)?{sysclkSource:'HSI',pllSource:'HSI',hsePrediv:1,pllMul:2,ahb:1,apb1:1,apb2:1,adcPrescaler:2}
  :{sysclkSource:'HSI',pllSource:'HSI',pllM:16,pllN:192,pllP:2,pllQ:2,ahb:1,apb1:1,apb2:1,adcPrescaler:4};
}

/** The tree the older single setting stands for (the generator's HSI plans for an APB1 timer clock). */
export function treeFromTimerHz(family,hz){
 const base=defaultClockTree(family);
 if(f1(family)){
  const adc=pclk2=>ADC_PRESCALERS.find(n=>pclk2/n<=14e6)??8;
  if(hz===8e6)return {...base,adcPrescaler:adc(hz)};
  return {...base,sysclkSource:'PLLCLK',pllSource:'HSI',pllMul:hz/4e6,apb1:hz>36e6?2:1,adcPrescaler:adc(hz)};
 }
 if(hz===16e6)return base;
 for(const p of [4,2,6,8]){const n=hz*p/1e6;if(Number.isInteger(n)&&n>=100&&n<=432)return {...base,sysclkSource:'PLLCLK',pllSource:'HSI',pllM:16,pllN:n,pllP:p,pllQ:7,apb1:2};}
 return base;
}

const timerClock=(pclk,div)=>div===1?pclk:pclk*2;
/** Frequencies in Hz: the PLL stages, SYSCLK, HCLK, PCLK1/2, the APB1/APB2 timer clocks and the ADC clock. */
export function clockFrequencies(family,t){
 const hsi=HSI_HZ[family]??16e6;let vcoIn=null,vco=null,pll;
 if(f1(family))pll=(t.pllSource==='HSE'?HSE_HZ/(t.hsePrediv||1):hsi/2)*t.pllMul;
 else{vcoIn=(t.pllSource==='HSE'?HSE_HZ:hsi)/t.pllM;vco=vcoIn*t.pllN;pll=vco/t.pllP;}
 const sysclk=t.sysclkSource==='HSE'?HSE_HZ:t.sysclkSource==='PLLCLK'?pll:hsi,hclk=sysclk/t.ahb,pclk1=hclk/t.apb1,pclk2=hclk/t.apb2;
 return {hsi,hse:HSE_HZ,vcoIn,vco,pll,pllQ:f1(family)?null:vco/t.pllQ,sysclk,hclk,pclk1,pclk2,tim1:timerClock(pclk1,t.apb1),tim2:timerClock(pclk2,t.apb2),adc:pclk2/t.adcPrescaler};
}
/** Flash wait states for HCLK (F446 at 2.7-3.6 V: one per 30 MHz; F103: 0 to 24 MHz, 1 to 48 MHz, 2 above). */
export const flashLatency=(family,hclk)=>f1(family)?(hclk<=24e6?0:hclk<=48e6?1:2):Math.min(5,Math.max(0,Math.ceil(hclk/30e6)-1));
/** F446 above 168 MHz needs the regulator's over-drive mode. */
export const needsOverDrive=(family,hclk)=>!f1(family)&&hclk>168e6;

const mhz=hz=>`${Number((hz/1e6).toFixed(3))} MHz`;
/** CubeMX's red marks, in words: every frequency over its limit and every PLL stage out of its range. */
export function clockTreeProblems(family,t){
 const L=LIMITS[family],q=clockFrequencies(family,t),out=[],usesPll=t.sysclkSource==='PLLCLK';
 if(!f1(family)&&usesPll){
  if(q.vcoIn<L.vcoIn[0]||q.vcoIn>L.vcoIn[1])out.push(`PLL 입력(VCO input) ${mhz(q.vcoIn)}: ${mhz(L.vcoIn[0])}~${mhz(L.vcoIn[1])}이어야 합니다(PLLM을 바꾸세요).`);
  if(q.vco<L.vco[0]||q.vco>L.vco[1])out.push(`VCO 출력 ${mhz(q.vco)}: ${mhz(L.vco[0])}~${mhz(L.vco[1])}이어야 합니다(PLLN을 바꾸세요).`);
  if(q.pll<L.pll[0]||q.pll>L.pll[1])out.push(`PLLCLK ${mhz(q.pll)}: ${mhz(L.pll[0])}~${mhz(L.pll[1])}이어야 합니다.`);
 }
 if(f1(family)&&usesPll&&q.pll>L.pll[1])out.push(`PLLCLK ${mhz(q.pll)}: 72 MHz 이하여야 합니다(PLLMul을 줄이세요).`);
 for(const [k,name]of [['sysclk','SYSCLK'],['hclk','HCLK'],['pclk1','APB1(PCLK1)'],['pclk2','APB2(PCLK2)']])if(q[k]>L[k])out.push(`${name} ${mhz(q[k])}: 최대 ${mhz(L[k])}입니다.`);
 return out;
}
/** The ADC clock limit only matters when ADC1 is on (CubeMX shows it red then). */
export const adcClockProblem=(family,t)=>{const q=clockFrequencies(family,t),max=LIMITS[family].adc;return q.adc>max?`ADC 클록 ${mhz(q.adc)}: 최대 ${mhz(max)}입니다(ADC Prescaler를 키우세요).`:null;};

const int=(v,[lo,hi],name)=>{if(!Number.isInteger(v)||v<lo||v>hi)throw new Error(`클록 설정 ${name}: ${lo}~${hi} 정수로 설정하세요.`);return v;};
const pick=(v,list,name)=>{if(!list.includes(v))throw new Error(`클록 설정 ${name}: ${list.join('/')} 중에서 고르세요.`);return v;};
/** A stored tree checked field by field (missing fields take the CubeMX defaults). */
export function validateClockTree(family,raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('클록 설정이 올바르지 않습니다.');
 const t={...defaultClockTree(family),...raw},L=LIMITS[family],out={sysclkSource:pick(t.sysclkSource,['HSI','HSE','PLLCLK'],'System Clock Mux'),pllSource:pick(t.pllSource,['HSI','HSE'],'PLL Source Mux')};
 if(f1(family))Object.assign(out,{hsePrediv:pick(t.hsePrediv,[1,2],'HSE Prediv'),pllMul:int(t.pllMul,L.pllMul,'PLLMul')});
 else Object.assign(out,{pllM:int(t.pllM,L.pllM,'PLLM'),pllN:int(t.pllN,L.pllN,'PLLN'),pllP:pick(t.pllP,PLLP_VALUES,'PLLP'),pllQ:int(t.pllQ,L.pllQ,'PLLQ')});
 return {...out,ahb:pick(t.ahb,AHB_DIVIDERS,'AHB Prescaler'),apb1:pick(t.apb1,APB_DIVIDERS,'APB1 Prescaler'),apb2:pick(t.apb2,APB_DIVIDERS,'APB2 Prescaler'),adcPrescaler:pick(t.adcPrescaler,ADC_PRESCALERS,'ADC Prescaler')};
}

/** The tree a CubeMX .ioc describes; keys it leaves out are CubeMX defaults. null when the .ioc sets no RCC values. */
export function clockTreeFromIoc(family,values){
 // Only the settings count: a .ioc with just the computed *Freq_Value numbers keeps the single APB1 timer clock.
 if(!Object.keys(values).some(k=>/^RCC\.(SYSCLKSource|PLLSourceVirtual|PLLM|PLLN|PLLP|PLLQ|PLLMUL|HSEDivPLL|AHBCLKDivider|APB1CLKDivider|APB2CLKDivider)$/.test(k)))return null;
 const t=defaultClockTree(family),num=(k,d)=>{const m=/(\d+)$/.exec(values[k]||'');return m?Number(m[1]):d;};
 const src=/RCC_SYSCLKSOURCE_(HSI|HSE|PLLCLK)/.exec(values['RCC.SYSCLKSource']||'');if(src)t.sysclkSource=src[1];
 if(/HSE/.test(values['RCC.PLLSourceVirtual']||''))t.pllSource='HSE';
 t.ahb=num('RCC.AHBCLKDivider',1);t.apb1=num('RCC.APB1CLKDivider',1);t.apb2=num('RCC.APB2CLKDivider',1);
 if(f1(family)){t.pllMul=num('RCC.PLLMUL',2);t.hsePrediv=/DIV2/.test(values['RCC.HSEDivPLL']||'')?2:1;t.adcPrescaler=num('RCC.ADCPresc',2);}
 else{t.pllM=num('RCC.PLLM',16);t.pllN=num('RCC.PLLN',192);t.pllP=num('RCC.PLLP',2);t.pllQ=num('RCC.PLLQ',2);t.adcPrescaler=num('ADC1.ClockPrescaler',4);}
 // CubeMX leaves out a setting that has its default value, and which value is the default depends on its version and
 // on the oscillator pins (real files have a PLL fed by HSE with no RCC.PLLSourceVirtual line). The frequency CubeMX
 // computed is in the file, so when the tree read so far does not give that SYSCLK and the other PLL source does, the
 // other source is the one meant.
 const want=Number(values['RCC.SYSCLKFreq_VALUE']);
 if(want&&t.sysclkSource==='PLLCLK'&&!values['RCC.PLLSourceVirtual']){
  const sysclk=x=>{try{return clockFrequencies(family,validateClockTree(family,x)).sysclk;}catch{return 0;}},other={...t,pllSource:t.pllSource==='HSE'?'HSI':'HSE'};
  // The same with the crystal of another board (RCC.HSE_VALUE): the tree is an HSE one, and the import says so.
  const hse=Number(values['RCC.HSE_VALUE']),crystal=hse?(f1(family)?hse/(t.hsePrediv||1)*t.pllMul:hse/t.pllM*t.pllN/t.pllP):0;
  if(Math.abs(sysclk(t)-want)>1&&(Math.abs(sysclk(other)-want)<=1||Math.abs(crystal-want)<=1))t.pllSource=Math.abs(sysclk(other)-want)<=1?other.pllSource:'HSE';
 }
 return validateClockTree(family,t);
}

/** The project's tree: its own `mcu.clock`, or the one its APB1 timer clock stands for. */
export const clockTreeOf=mcu=>mcu?.clock?validateClockTree(mcu.family,mcu.clock):treeFromTimerHz(mcu?.family,mcu?.timerClockHz);
