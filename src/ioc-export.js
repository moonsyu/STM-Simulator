// Pinout settings as a CubeMX .ioc (the inverse of importIoc in mcu-config.js): MCU, pins and their GPIO properties,
// peripheral parameters, DMA, NVIC and the clock tree, with the key names CubeMX writes. importIoc(exportIoc(mcu)) gives
// the same settings back (tests/unit/ioc-export.test.js runs that over many configurations).
// What is not written: CubeMX's own pin names with alternate labels (PA0-WKUP, PC13-TAMPER-RTC: plain PA0 / PC13 are
// used), the Project Manager section and the computed RCC *Freq_Value numbers beyond the timer clock. Opening the file
// in CubeMX itself has not been checked here (no CubeMX on the build PCs).
import {isSerial} from './serial-config.js';
import {isTimer,isBasicTimer,isAdvancedTimer} from './timer-config.js';
import {isI2c,isSpi} from './bus-config.js';
import {validateMcu,adcSamplingOf,adcSamplingDefault} from './mcu-config.js';
import {familyProfile} from './mcu-family.js';
import {RTC_WEEKDAYS,RTC_MONTHS} from './rtc-config.js';
import {dacAmplitudeName} from './dac-config.js';
import {adcRanks,adcConversions} from './adc-config.js';
import {NVIC_GROUP_DEFAULT,TICK_PRIORITY_DEFAULT} from './nvic-config.js';

const MCU={STM32F446RE:{name:'STM32F446R(C-E)Tx',cpn:'STM32F446RET6',family:'STM32F4',board:'NUCLEO-F446RE'},STM32F103RB:{name:'STM32F103R(8-B)Tx',cpn:'STM32F103RBT6',family:'STM32F1',board:'NUCLEO-F103RB'}};
// Java-properties escaping of a key: spaces and # (TIM2.Pulse-PWM\ Generation1\ CH1, ADC1.Channel-0\#ChannelRegularConversion).
const key=k=>k.replace(/([ #:])/g,'\\$1');
const signalOf=(fn,pin)=>fn==='Analog'?'GPIO_Analog':fn==='GPIO_EXTI'?'GPXTI'+Number(pin.slice(2)):/^TIM\d+_CH\dN?$/.test(fn)?'S_'+fn:/^ADC1_IN\d+$/.test(fn)?'ADCx_'+fn.slice(5):/^DAC_OUT[12]$/.test(fn)?`COMP_DAC${fn.at(-1)}_group`:fn;

export function exportIoc(config){
  const m=validateMcu(config),f=familyProfile(m.family),f1=f.pinMux==='remap',id=MCU[m.family],out=new Map(),set=(k,v)=>out.set(k,String(v));
  const per=Object.entries(m.peripherals).filter(([,p])=>p.enabled),pins=Object.entries(m.pins).filter(([,p])=>!['Reset','Reserved'].includes(p.function));
  set('File.Version',6);set('KeepUserPlacement',false);set('Mcu.Family',id.family);set('Mcu.Name',id.name);set('Mcu.CPN',id.cpn);set('Mcu.Package','LQFP64');set('Mcu.UserName',id.cpn.slice(0,-2)+'Tx');set('board',id.board);
  const ips=[...new Set([...per.map(([n])=>n),...(m.dma&&Object.keys(m.dma).length?['DMA']:[]),...(pins.some(([,p])=>/^GPIO_|^Analog$/.test(p.function))?['GPIO']:[]),'NVIC','RCC','SYS'])].sort();
  ips.forEach((ip,i)=>set('Mcu.IP'+i,ip));set('Mcu.IPNb',ips.length);
  // ---- pins
  const names=pins.map(([pin])=>pin).sort((a,b)=>a[1].localeCompare(b[1])||Number(a.slice(2))-Number(b.slice(2)));
  names.forEach((pin,i)=>set('Mcu.Pin'+i,pin));set('Mcu.PinsNb',names.length);
  for(const [pin,p]of pins){
    set(pin+'.Signal',signalOf(p.function,pin));set(pin+'.Locked',true);const params=[];
    if(p.label){set(pin+'.GPIO_Label',p.label);params.push('GPIO_Label');}
    if(p.pull!=='NOPULL'){set(pin+'.GPIO_PuPd','GPIO_'+p.pull);params.push('GPIO_PuPd');}
    if(p.function==='GPIO_EXTI'){set(pin+'.GPIO_ModeDefaultEXTI','GPIO_MODE_IT_'+(p.edge==='CHANGE'?'RISING_FALLING':p.edge));params.push('GPIO_ModeDefaultEXTI');}
    if(p.function==='GPIO_Output'&&p.initial){set(pin+'.PinState','GPIO_PIN_SET');params.push('PinState');}
    if(p.speed){set(pin+'.GPIO_Speed','GPIO_SPEED_FREQ_'+p.speed);params.push('GPIO_Speed');}
    if(p.outputType==='OD'){set(pin+'.GPIO_ModeDefaultOutputPP','GPIO_MODE_OUTPUT_OD');params.push('GPIO_ModeDefaultOutputPP');}
    if(params.length)set(pin+'.GPIOParameters',params.join(','));
    if(/^TIM\d+_CH\dN?$/.test(p.function))set(`SH.S_${p.function}.ConfNb`,1);
  }
  // ---- peripherals
  for(const [n,p]of per){
    if(isSerial(n)){
      set(n+'.BaudRate',p.baud);set(n+'.IPParameters','VirtualMode,BaudRate');
      if(p.mode==='synchronous'){set(n+'.VirtualMode','VM_SYNC');set(n+'.CLKPolarity',p.cpol?'USART_POLARITY_HIGH':'USART_POLARITY_LOW');set(n+'.CLKPhase',p.cpha?'USART_PHASE_2EDGE':'USART_PHASE_1EDGE');set(n+'.CLKLastBit',p.lastBit?'USART_LASTBIT_ENABLE':'USART_LASTBIT_DISABLE');}
      else{set(n+'.VirtualMode','VM_ASYNC');if(p.wordLength===9)set(n+'.WordLength','WORDLENGTH_9B');if(p.parity)set(n+'.Parity','PARITY_'+p.parity);if(p.stopBits===2)set(n+'.StopBits','STOPBITS_2');if(p.direction)set(n+'.Mode','MODE_'+p.direction);if(p.overSampling===8)set(n+'.OverSampling','OVERSAMPLING_8');}
    }else if(isI2c(n)){
      set(n+'.ClockSpeed',p.clock);set(n+'.I2C_Mode',p.clock>100000?'I2C_Fast':'I2C_Standard');if(p.ownAddress)set(n+'.OwnAddress',p.ownAddress<<1);if(p.dutyCycle==='16_9')set(n+'.DutyCycle','I2C_DUTYCYCLE_16_9');if(p.noStretch)set(n+'.NoStretchMode','I2C_NOSTRETCH_ENABLE');
    }else if(isSpi(n)){
      set(n+'.Mode','SPI_MODE_MASTER');set(n+'.VirtualType','VM_MASTER');set(n+'.Direction','SPI_DIRECTION_2LINES');
      set(n+'.BaudRatePrescaler','SPI_BAUDRATEPRESCALER_'+Math.min(256,2**Math.max(1,Math.ceil(Math.log2(m.timerClockHz/p.clock)))));
      // The rate the settings ask for, in the form CubeMX shows it ("1.0 MBits/s", "125.0 KBits/s").
      set(n+'.CalculateBaudRate',p.clock>=1e6?`${p.clock/1e6} MBits/s`:p.clock>=1e3?`${p.clock/1e3} KBits/s`:`${p.clock} Bits/s`);
      if(p.cpol==='HIGH')set(n+'.CLKPolarity','SPI_POLARITY_HIGH');if(p.cpha==='2EDGE')set(n+'.CLKPhase','SPI_PHASE_2EDGE');if(p.dataSize===16)set(n+'.DataSize','SPI_DATASIZE_16BIT');if(p.firstBit==='LSB')set(n+'.FirstBit','SPI_FIRSTBIT_LSB');
    }else if(isTimer(n)){
      set(n+'.Prescaler',p.prescaler);set(n+'.Period',p.period);set(`VP_${n}_VS_ClockSourceINT.Mode`,'Internal');set(`VP_${n}_VS_ClockSourceINT.Signal`,`${n}_VS_ClockSourceINT`);
      if(p.counterMode)set(n+'.CounterMode','TIM_COUNTERMODE_'+p.counterMode);
      if(p.trgo)set(n+'.TIM_MasterOutputTrigger','TIM_TRGO_'+p.trgo);
      if(p.onePulse){set(`VP_${n}_VS_OPM.Mode`,'OPM_bit');set(`VP_${n}_VS_OPM.Signal`,`${n}_VS_OPM`);}
      if(isAdvancedTimer(n)){if(p.repetition)set(n+'.RepetitionCounter',p.repetition);if(p.deadTime)set(n+'.DeadTime',p.deadTime);}
      const channels=[...new Set(pins.map(([,q])=>new RegExp('^'+n+'_CH([1-4])N?$').exec(q.function)?.[1]).filter(Boolean))].sort();
      const hasN=c=>pins.some(([,q])=>q.function===`${n}_CH${c}N`);
      if(p.mode==='encoder')set(n+'.EncoderMode','TIM_ENCODERMODE_TI12');
      for(const c of isBasicTimer(n)?[]:channels){
        const own=p.channels?.['CH'+c]||{};
        if(p.mode==='pwm'){const name=`PWM Generation${c} CH${c}${hasN(c)?` CH${c}N`:''}`;set(`${n}.Channel-${name}`,'TIM_CHANNEL_'+c);set(`${n}.Pulse-${name}`,own.pulse??p.pulse);if(own.ocMode==='PWM2')set(`${n}.OCMode_PWM-${name}`,'TIM_OCMODE_PWM2');if(own.polarity==='LOW')set(`${n}.OCPolarity_${c}-${name}`,'TIM_OCPOLARITY_LOW');}
        else if(p.mode==='oc'){const name=`Output Compare${c} CH${c}${hasN(c)?` CH${c}N`:''}`;set(`${n}.Channel-${name}`,'TIM_CHANNEL_'+c);set(`${n}.Pulse-${name}`,own.pulse??p.pulse);if(own.ocMode)set(`${n}.OCMode_${c}`,'TIM_OCMODE_'+own.ocMode);if(own.polarity==='LOW')set(`${n}.OCPolarity_${c}`,'TIM_OCPOLARITY_LOW');}
        else if(p.mode==='capture')set(`${n}.Channel-Input_Capture${c}_from_TI${c}`,'TIM_CHANNEL_'+c);
      }
    }else if(n==='ADC1'){
      if(p.continuous)set('ADC1.ContinuousConvMode','ENABLE');
      const cycles=adcSamplingOf(m);if(cycles!==adcSamplingDefault(m.family)||true)set('ADC1.SamplingTime-0#ChannelRegularConversion',`ADC_SAMPLETIME_${Math.floor(cycles)}CYCLES${Number.isInteger(cycles)?'':'_5'}`);
      const ranks=adcRanks(m);set('ADC1.NbrOfConversion',adcConversions(m));set('ADC1.NbrOfConversionFlag',1);if(ranks.length>1)set('ADC1.ScanConvMode',f1?'ADC_SCAN_ENABLE':'ENABLE');
      ranks.forEach((ch,i)=>{set(`ADC1.Channel-${i}#ChannelRegularConversion`,'ADC_CHANNEL_'+ch);set(`ADC1.Rank-${i}#ChannelRegularConversion`,i+1);});
      if(p.trigger){set('ADC1.ExternalTrigConv','ADC_EXTERNALTRIGCONV_'+p.trigger);if(!f1)set('ADC1.ExternalTrigConvEdge','ADC_EXTERNALTRIGCONVEDGE_RISING');}
      if(!f1&&m.clock)set('ADC1.ClockPrescaler','ADC_CLOCK_SYNC_PCLK_DIV'+m.clock.adcPrescaler);
    }else if(n==='IWDG'){set('IWDG.Prescaler','IWDG_PRESCALER_'+p.prescaler);set('IWDG.Reload',p.reload);set('VP_IWDG_VS_IWDG.Mode','IWDG_Activate');set('VP_IWDG_VS_IWDG.Signal','IWDG_VS_IWDG');}
    else if(n==='WWDG'){set('WWDG.Prescaler','WWDG_PRESCALER_'+p.prescaler);set('WWDG.Window',p.window);set('WWDG.Counter',p.counter);set('WWDG.EWIMode',p.ewi?'WWDG_EWI_ENABLE':'WWDG_EWI_DISABLE');set('VP_WWDG_VS_WWDG.Mode','WWDG_Activate');set('VP_WWDG_VS_WWDG.Signal','WWDG_VS_WWDG');}
    else if(n==='RTC'){
      set('VP_RTC_VS_RTC_Activate.Mode','RTC_Enabled');set('VP_RTC_VS_RTC_Activate.Signal','RTC_VS_RTC_Activate');set('RCC.RTCClockSelection','RCC_RTCCLKSOURCE_'+(p.clockSource??'LSE'));
      const twelve=p.hourFormat===12&&!f1;if(twelve)set('RTC.HourFormat','RTC_HOURFORMAT_12');
      const time=(t,s)=>{set('RTC.Hours'+s,t.hours??(twelve?12:0));set('RTC.Minutes'+s,t.minutes??0);set('RTC.Seconds'+s,t.seconds??0);if(twelve&&t.pm)set('RTC.TimeFormat'+s,'RTC_HOURFORMAT12_PM');};
      time(p.time??{},'');const d=p.date??{};
      set('RTC.WeekDay','RTC_WEEKDAY_'+RTC_WEEKDAYS[(d.weekDay??1)-1]);set('RTC.Month','RTC_MONTH_'+RTC_MONTHS[(d.month??1)-1]);set('RTC.Date',d.date??1);set('RTC.Year',d.year??0);
      if(p.alarm?.enabled){set('VP_RTC_VS_RTC_Alarm_A_Intern.Mode','Alarm A');set('VP_RTC_VS_RTC_Alarm_A_Intern.Signal','RTC_VS_RTC_Alarm_A_Intern');set('RTC.Alarm','RTC_ALARM_A');time(p.alarm,'_A');
        if(!f1){set('RTC.AlarmDateWeekDay',p.alarm.date??1);for(const [k,name]of [['maskDateWeekDay','DateWeekDay'],['maskHours','Hours'],['maskMinutes','Minutes'],['maskSeconds','Seconds']])if(p.alarm[k])set('RTC.AlarmMask'+name,'RTC_ALARMMASK_'+name.toUpperCase());}}
      if(p.wakeUp?.enabled&&!f1){set('VP_RTC_VS_RTC_WakeUp_intern.Mode','WakeUp');set('VP_RTC_VS_RTC_WakeUp_intern.Signal','RTC_VS_RTC_WakeUp_intern');set('RTC.WakeUpClock','RTC_WAKEUPCLOCK_'+(p.wakeUp.clock??'RTCCLK_DIV16'));set('RTC.WakeUpCounter',p.wakeUp.counter??0);}
    }else if(n==='DAC'){
      for(const [ch,s]of [['OUT1',''],['OUT2','2']]){const c=p.channels?.[ch];if(!c)continue;
        if(c.trigger)set('DAC.DAC_Trigger'+s,'DAC_TRIGGER_'+c.trigger);if(c.buffer===false)set('DAC.DAC_OutputBuffer'+s,'DAC_OUTPUTBUFFER_DISABLE');
        if(c.wave&&c.wave!=='NONE'){set('DAC.DAC_WaveGeneration'+s,c.wave==='TRIANGLE'?'DAC_WAVE_TRIANGLE':'DAC_WAVE_NOISE');set('DAC.DAC_LFSRUnmask_TriangleAmplitude'+s,dacAmplitudeName(c.wave,c.amplitude??0));}}
    }
  }
  // ---- DMA
  const dma=Object.entries(m.dma||{});
  dma.forEach(([request,d],i)=>{set('Dma.Request'+i,request);const b=`Dma.${request}.${i}.`;set(b+'Instance',d.stream);if(!f1)set(b+'Channel','DMA_CHANNEL_'+d.channel);set(b+'Mode',d.mode==='circular'?'DMA_CIRCULAR':'DMA_NORMAL');set(b+'Priority','DMA_PRIORITY_'+d.priority.toUpperCase());set(b+'Direction',/_RX$|^ADC1$|^DCMI$/.test(request)?'DMA_PERIPH_TO_MEMORY':request==='MEMTOMEM'?'DMA_MEMORY_TO_MEMORY':'DMA_MEMORY_TO_PERIPH');});
  if(dma.length)set('Dma.RequestsNb',dma.length);
  // ---- NVIC: enabled:preemption:sub:… (the trailing flags are CubeMX's code-generation options)
  // A line that is off keeps its priority too (CubeMX writes only enabled lines; the importer reads both).
  for(const [irq,n]of Object.entries(m.nvic))set('NVIC.'+irq,`${n.enabled}:${n.priority}:${n.sub??0}:false:false:true:true:true:true`);
  set('NVIC.PriorityGroup','NVIC_PRIORITYGROUP_'+(m.nvicGroup??NVIC_GROUP_DEFAULT));
  set('NVIC.SysTick_IRQn',`true:${m.tickPriority??TICK_PRIORITY_DEFAULT}:0:false:false:true:false:true:false`);
  // ---- clock
  set('RCC.APB1TimFreq_Value',m.timerClockHz);
  if(m.clock){const t=m.clock;
    set('RCC.SYSCLKSource','RCC_SYSCLKSOURCE_'+t.sysclkSource);set('RCC.PLLSourceVirtual','RCC_PLLSOURCE_'+t.pllSource);
    set('RCC.AHBCLKDivider','RCC_SYSCLK_DIV'+t.ahb);set('RCC.APB1CLKDivider','RCC_HCLK_DIV'+t.apb1);set('RCC.APB2CLKDivider','RCC_HCLK_DIV'+t.apb2);
    if(f1){set('RCC.PLLMUL','RCC_PLL_MUL'+t.pllMul);set('RCC.HSEDivPLL','RCC_HSE_PREDIV_DIV'+t.hsePrediv);set('RCC.ADCPresc','RCC_ADCPCLK2_DIV'+t.adcPrescaler);}
    else{set('RCC.PLLM',t.pllM);set('RCC.PLLN',t.pllN);set('RCC.PLLP','RCC_PLLP_DIV'+t.pllP);set('RCC.PLLQ',t.pllQ);}
    if(t.sysclkSource==='HSE'||t.pllSource==='HSE')set('RCC.HSE_VALUE',8000000);
  }
  return ['#MicroXplorer Configuration settings - do not modify',...[...out].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${key(k)}=${v.replace(/:/g,'\\:')}`)].join('\n')+'\n';
}
