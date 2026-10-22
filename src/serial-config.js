// STM32F446RE LQFP64, DS10693 tables 10/11 (not larger-package routes).
export const SERIAL_ROUTES={
  USART1:{TX:['PA9','PB6'],RX:['PA10','PB7']},
  USART2:{TX:['PA2'],RX:['PA3']},
  USART3:{TX:['PB10','PC10'],RX:['PC5','PC11']},
  UART4:{TX:['PA0','PC10'],RX:['PA1','PC11']},
  UART5:{TX:['PC12'],RX:['PD2']},
  USART6:{TX:['PC6'],RX:['PC7']}
};
export const SERIAL_IDS=Object.keys(SERIAL_ROUTES);
export const isSerial=id=>Object.hasOwn(SERIAL_ROUTES,id);
export const serialHandle=id=>'huart'+id.replace(/\D/g,'');
export const serialAf=id=>['USART1','USART2','USART3'].includes(id)?7:8;
export const serialFunction=fn=>SERIAL_IDS.find(id=>fn===id+'_TX'||fn===id+'_RX');
export function assignSerialPin(config,id,role,pin,routes=SERIAL_ROUTES){
  if(!routes[id]||!['TX','RX'].includes(role)||!routes[id][role].includes(pin))throw new Error(`${id} ${role}: 이 MCU에서 사용할 수 없는 핀입니다.`);
  const fn=id+'_'+role,previous=config.pins[pin];
  if(previous&&previous.function!=='Reset'&&previous.function!==fn)throw new Error(`${pin}: ${previous.function}에서 사용 중입니다. 먼저 해제하거나 다른 핀을 선택하세요.`);
  for(const [name,p]of Object.entries(config.pins))if(name!==pin&&p.function===fn)config.pins[name]={...p,function:'Reset',label:''};
  config.pins[pin]={function:fn,pull:previous?.pull??'NOPULL',edge:'FALLING',initial:0,label:previous?.label??''};
  config.peripherals[id]={...config.peripherals[id],enabled:true,baud:config.peripherals[id]?.baud??115200};
}
// remaps (F1 AFIO): TX/RX move together, so a whole free remap option is chosen instead of the first free pin per role.
export function setSerialEnabled(config,id,enabled,routes=SERIAL_ROUTES,remaps=null){
  if(!routes[id])throw new Error('지원하지 않는 UART/USART입니다.');
  const next=structuredClone(config);
  if(enabled){
    const usable=(pin,role)=>!next.pins[pin]||next.pins[pin].function==='Reset'||next.pins[pin].function===id+'_'+role;
    // Keep the group of pins already assigned (a TX or RX the user picked), else the first fully free group.
    const current=role=>Object.keys(next.pins).find(pin=>next.pins[pin].function===id+'_'+role),fits=o=>['TX','RX'].every(role=>o.pins[role]&&usable(o.pins[role],role));
    const group=remaps&&(remaps.find(o=>fits(o)&&['TX','RX'].some(role=>current(role)&&o.pins[role]===current(role)))||remaps.find(fits));
    if(remaps&&!group)throw new Error(`${id}: 함께 옮겨지는 TX/RX 핀 묶음 중 비어 있는 것이 없습니다 (${remaps.map(o=>o.pins.TX+'/'+o.pins.RX).join(', ')}).`);
    if(group){for(const role of ['TX','RX'])assignSerialPin(next,id,role,group.pins[role],routes);return next;}
    for(const role of ['TX','RX']){
      const fn=id+'_'+role,assigned=Object.keys(next.pins).find(pin=>next.pins[pin].function===fn&&routes[id][role].includes(pin));
      const available=assigned||routes[id][role].find(pin=>!next.pins[pin]||next.pins[pin].function==='Reset');
      if(!available)throw new Error(`${id} ${role}: 사용 가능한 핀이 없습니다 (${routes[id][role].join(', ')}).`);
      assignSerialPin(next,id,role,available,routes);
    }
  }else{
    next.peripherals[id]={...next.peripherals[id],enabled:false};
    for(const [pin,p]of Object.entries(next.pins))if(serialFunction(p.function)===id)next.pins[pin]={...p,function:'Reset',label:''};
    if(next.nvic[id+'_IRQn'])next.nvic[id+'_IRQn'].enabled=false;
  }
  return next;
}
