import {isTimer,isBasicTimer,isAdvancedTimer,timerIrq,timerCcIrq,timerMax as f4TimerMax,TIM_TRGO} from './timer-config.js';
const integer=(n,min,max,label)=>{if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label}: ${min}~${max} 범위를 확인하세요.`);return n;};
const wrap=(n,period)=>((n%period)+period)%period;
const quadrature=[0,-1,1,0,1,0,0,-1,-1,0,0,1,0,1,-1,0];
// TIM_COUNTERMODE_UP / DOWN / CENTERALIGNED1-3 (the three center modes differ only in when CCxIF is set).
const COUNT_MODES={0:'up',16:'down',32:'center',64:'center',96:'center'};
// TIM_OCMODE_TIMING / ACTIVE / INACTIVE / TOGGLE / FORCED_INACTIVE / FORCED_ACTIVE
const OC_MODES=[0,16,32,48,64,80];

// One counter per peripheral; capture / PWM / output compare channels share that counter. The counter is kept as a
// phase u in one counting cycle: up CNT = u, down CNT = ARR - u, center-aligned CNT = u <= ARR ? u : 2*ARR - u.
export class HalTimers {
  constructor(hal){this.hal=hal;this.states=new Map();}
  // Counter width of the project's MCU (all F1 timers are 16-bit; F4 TIM2/TIM5 are 32-bit).
  max(id){return this.hal.family?.timerMax?this.hal.family.timerMax(id):f4TimerMax(id);}
  init(ptr,r,kind,encoder){
    const h=this.hal,{id,init}=h.handle(ptr,r,'TIM'),get=k=>h.field(init,k),p=h.config.peripherals[id];
    if(!isTimer(id)||!Object.hasOwn(COUNT_MODES,get('CounterMode'))||get('ClockDivision'))throw new Error(`${id}: 내부 클록, Counter Mode Up/Down/Center Aligned, DIV1을 사용하세요.`);
    if(kind==='Encoder'&&get('CounterMode'))throw new Error(id+': 엔코더 모드는 Counter Mode Up으로 초기화하세요.');
    if(isBasicTimer(id)&&(kind!=='Base'||get('CounterMode')))throw new Error(`${id}: 기본 타이머는 채널이 없는 Up 카운터입니다. HAL_TIM_Base_Init과 TIM_COUNTERMODE_UP을 쓰세요.`);
    integer(get('Prescaler'),0,65535,id+' Prescaler');integer(get('Period'),0,this.max(id),id+' ARR');
    if(get('Prescaler')!==p.prescaler||get('Period')!==p.period)throw new Error(`${id}: 소스와 Pinout의 Prescaler/Period가 다릅니다.`);
    if(this.states.get(id)?.active)throw new Error(id+': 타이머를 정지한 뒤 초기화하세요.');
    // Advanced timers: an update event (and its interrupt) comes every RepetitionCounter + 1 counter cycles.
    const repetition=isAdvancedTimer(id)?integer(get('RepetitionCounter')??0,0,255,id+' RepetitionCounter'):0;
    const s={id,ptr,init,kind,repetition,count:COUNT_MODES[get('CounterMode')],value:0,at:r.microTime,active:false,base:false,baseIT:false,generation:0,channels:new Map(),down:false};
    if(kind==='Encoder'){
      const cfg=r.get(r.pointerCell(encoder));s.encoderMode=h.field(cfg,'EncoderMode');
      if(![1,2,3].includes(s.encoderMode)||get('Prescaler')!==0)throw new Error(id+': 엔코더 TI1/TI2/TI12, Prescaler 0을 사용하세요.');
      for(const n of [1,2]){if(h.field(cfg,`IC${n}Polarity`)!==0||h.field(cfg,`IC${n}Selection`)!==1||h.field(cfg,`IC${n}Prescaler`)!==0||h.field(cfg,`IC${n}Filter`)!==0)throw new Error(id+': 엔코더 direct TI, rising, DIV1, filter 0을 지원합니다.');h.pinFor(id+'_CH'+n);}
    }
    this.states.set(id,s);return s;
  }
  get(ptr,r){const {id}=this.hal.requireHandle(ptr,r,'TIM'),s=this.states.get(id);if(!s)throw new Error(id+': 타이머 초기화가 필요합니다.');return s;}
  period(s){return this.hal.field(s.init,'Period')+1;}
  // With a Clock Configuration, TIM1/8/9/10/11 count on the APB2 timer clock and the others on APB1's.
  hz(s){const c=this.hal.clocks,clock=c?(/^TIM(1|8|9|10|11)$/.test(s.id)?c.tim2:c.tim1):this.hal.config.timerClockHz;return clock/(this.hal.field(s.init,'Prescaler')+1);}
  arr(s){return this.period(s)-1;}
  cycle(s){return s.count==='center'?2*Math.max(1,this.arr(s)):this.period(s);}
  phase(s,us){if(this.period(s)===1||s.kind==='Encoder')return s.value;return wrap(s.value+(s.active?(us-s.at)*this.hz(s)/1e6:0),this.cycle(s));}
  cntOf(s,u){u=Math.floor(u);return s.kind==='Encoder'||s.count==='up'||this.period(s)===1?u:s.count==='down'?this.arr(s)-u:u<=this.arr(s)?u:2*this.arr(s)-u;}
  counter(s,us){return this.cntOf(s,this.phase(s,us));}
  countingDown(s,us){return s.kind==='Encoder'?s.down:s.count==='down'||s.count==='center'&&this.phase(s,us)>this.arr(s);}
  freeze(s,us){s.updates=this.updates(s,us);s.value=this.phase(s,us);s.at=us;}
  // Update events (the counter passing its end; both ends in center-aligned mode) since the update flag was last
  // cleared — for code that polls __HAL_TIM_GET_FLAG(&htim, TIM_FLAG_UPDATE) instead of using the interrupt.
  updates(s,us){
    const held=s.updates??0;if(this.period(s)===1||s.kind==='Encoder'||!s.active)return held;
    const span=this.cycle(s)/(s.count==='center'?2:1);return held+Math.floor((s.value+(us-s.at)*this.hz(s)/1e6)/span)-Math.floor(s.value/span);
  }
  // Phases in (0, cycle] where CNT = CCR: none when CCR > ARR, two in center-aligned mode (counting up and down).
  matchPhases(s,pulse){
    const arr=this.arr(s),cycle=this.cycle(s);if(pulse>arr||this.period(s)===1)return [];
    if(s.count==='up')return [pulse||cycle];if(s.count==='down')return [arr-pulse||cycle];
    return pulse===0?[cycle]:pulse===arr?[arr]:[pulse,cycle-pulse];
  }
  syncActive(s,r){this.freeze(s,r.microTime);s.active=s.base||s.baseIT||s.encoderActive||[...s.channels.values()].some(c=>c.active||c.nActive);}
  // One Pulse Mode: at the next update event the counter stops at 0 (CEN cleared); a PWM1 output is then at its
  // CNT < CCR level. The update interrupt of that event still comes.
  onePulse(s,r,generation){
    const u=this.phase(s,r.microTime),cycle=this.cycle(s),hal=this.hal;
    r.event(r.microTime/1000+Math.max(.000001,(cycle-u)*1000/this.hz(s)),()=>{
      if(generation!==s.generation||!s.active)return;
      if(s.baseIT)hal.queue(timerIrq(s.id,hal.f1),function*(){yield* hal.userCall(r,'HAL_TIM_PeriodElapsedCallback',[s.ptr]);},s.id+':update');
      s.generation++;s.value=0;s.updates=0;s.at=r.microTime;s.base=false;s.baseIT=false;
      for(const c of s.channels.values()){if(!c.active)continue;c.active=false;c.generation=(c.generation??0)+1;if(c.kind==='PWM')r.call('digitalWrite',[c.pin,Number(c.pulse>0)]);}
      s.active=false;
    });
  }
  schedule(s,r){
    const generation=++s.generation;if(s.onePulse&&s.active&&this.period(s)>1){this.onePulse(s,r,generation);return;}if(!s.baseIT||this.period(s)===1)return;
    // Update events at overflow, and also at underflow in center-aligned mode (so every ARR ticks there).
    const u=this.phase(s,r.microTime),cycle=this.cycle(s),step=s.count==='center'?this.arr(s):cycle,next=s.count==='center'&&u<this.arr(s)?this.arr(s):cycle;
    const rep=(s.repetition??0)+1,ms=((next-u)+(rep-1)*step)*1000/this.hz(s),full=rep*step*1000/this.hz(s);if(full<.1||full>3600000)throw new Error(s.id+': 인터럽트 주기 범위 0.1~3600000 ms');
    const fire=()=>{if(generation!==s.generation||!s.baseIT)return;const hal=this.hal;hal.queue(timerIrq(s.id,hal.f1),function*(){if(s.baseIT)yield* hal.userCall(r,'HAL_TIM_PeriodElapsedCallback',[s.ptr]);},s.id+':update');r.event(r.microTime/1000+full,fire);};
    r.event(r.microTime/1000+Math.max(.000001,ms),fire);
  }
  // The channel's own pin; null when only its complementary pin (CHxN) is assigned.
  mainPin(s,n){const h=this.hal,fn=`${s.id}_CH${n}`,has=f=>Object.values(h.config.pins).some(p=>p.function===f);return has(fn)||!has(fn+'N')?h.pinFor(fn):null;}
  channel(s,key){integer(key/4,0,3,'TIM 채널');const c=s.channels.get(key);if(!c)throw new Error(s.id+': 채널을 먼저 초기화하세요.');return c;}
  notify(s,c,key,r){if(!c.it)return;const hal=this.hal;hal.queue(timerCcIrq(s.id,hal.f1),function*(){if(!c.active||s.kind==='Encoder'&&!s.encoderActive)return;const {h}=hal.requireHandle(s.ptr,r,'TIM');h.fields.Channel.value=1<<(key/4);try{yield* hal.userCall(r,'HAL_TIM_IC_CaptureCallback',[s.ptr]);}finally{h.fields.Channel.value=0;}},s.id+':capture:'+key);}
  observe(r,us=r.microTime){
    for(const s of this.states.values()){
      if(!s.active)continue;
      if(s.kind==='Encoder'&&s.encoderActive){
        const a=Number(!!r.api.read(this.hal.pinFor(s.id+'_CH1'))),b=Number(!!r.api.read(this.hal.pinFor(s.id+'_CH2'))),next=a*2+b,prev=s.previous;
        s.previous=next;if(prev===undefined||prev===next||this.period(s)===1)continue;
        const changed=prev^next,allowed=s.encoderMode===3||s.encoderMode===1&&changed===2||s.encoderMode===2&&changed===1,delta=allowed?quadrature[prev*4+next]:0;
        if(delta){s.value=wrap(s.value+delta,this.period(s));s.at=us;s.down=delta<0;const key=changed===2?0:4;this.notify(s,{active:s.encoderActive,it:s.encoderIT},key,r);}
      }else for(const [key,c]of s.channels){
        if(!c.active||c.kind!=='IC')continue;
        const now=Number(!!r.api.read(c.pin)),old=c.previous;c.previous=now;
        if(now===old||!(c.polarity===10||c.polarity===0&&now||c.polarity===2&&!now))continue;
        if(++c.edges%c.divider)continue;c.captured=this.counter(s,us);this.notify(s,c,key,r);
      }
    }
  }
  outputs(s,r){for(const [key,ch]of s.channels){if(ch.kind==='PWM')this.pwm(s,ch,r);else if(ch.kind==='OC')this.oc(s,ch,key,r);}}
  // Output compare: the pin shows OCxREF xor CH Polarity. Toggle on match is a square wave (drawn like PWM); Active /
  // Inactive on match change the level at the next match; the interrupt calls HAL_TIM_OC_DelayElapsedCallback per match.
  oc(s,ch,key,r){
    const generation=ch.generation=(ch.generation??0)+1,pin=ch.pin,pol=ch.polarity?1:0;
    // `main`: the channel's own output is driven (started, and it has a pin); the complementary one may run alone.
    const main=ch.active&&!!pin;if(pin)r.call('pinMode',[pin,'OUTPUT']);
    if(ch.mode===80)ch.ref=1;else if(ch.mode===64)ch.ref=0;
    if(pin&&!ch.active)r.call('digitalWrite',[pin,0]);
    if(!ch.active&&!ch.nActive){if(ch.nPin)r.call('digitalWrite',[ch.nPin,0]);return;}
    const matches=this.matchPhases(s,ch.pulse),cycle=this.cycle(s),hz=this.hz(s);
    if(ch.mode===48&&matches.length){
      const f=hz/cycle*matches.length/2,high=matches.length===2?(matches[1]-matches[0])/cycle:.5;
      if(f>2000)throw new Error(`${s.id} ${pin}: 회로 시뮬레이터의 토글 출력은 2000 Hz까지입니다 (현재 ${Math.round(f)} Hz). Prescaler/Period를 키우거나 펌웨어 에뮬레이터로 실행하세요.`);
      if(main){if(f<1)r.pwmFrequency.set(pin,f);else r.call('analogWriteFrequency',[pin,f]);
      r.call('analogWrite',[pin,(pol?1-high:high)*255]);}
    }else if(main)r.call('digitalWrite',[pin,ch.ref^pol]);
    // Complementary output (HAL_TIMEx_OCN_Start): the inverse of the channel's output.
    if(ch.nPin){r.call('pinMode',[ch.nPin,'OUTPUT']);if(!ch.nActive)r.call('digitalWrite',[ch.nPin,0]);else if(ch.mode===48&&matches.length){const f=hz/cycle*matches.length/2,high=matches.length===2?(matches[1]-matches[0])/cycle:.5;if(f<1)r.pwmFrequency.set(ch.nPin,f);else r.call('analogWriteFrequency',[ch.nPin,f]);r.call('analogWrite',[ch.nPin,(pol?high:1-high)*255]);}else r.call('digitalWrite',[ch.nPin,(ch.ref^pol)?0:1]);}
    const settle=ch.mode===16&&!ch.ref||ch.mode===32&&ch.ref;
    if(!matches.length||!settle&&!ch.it)return;
    const each=cycle/matches.length*1000/hz;if(ch.it&&(each<.1||each>3600000))throw new Error(s.id+': 출력 비교 인터럽트 주기 범위 0.1~3600000 ms');
    const u=this.phase(s,r.microTime);let i=matches.findIndex(m=>m>u+1e-9);const next=i<0?matches[0]+cycle:matches[i];if(i<0)i=0;
    const hal=this.hal,fire=()=>{
      if(generation!==ch.generation||!ch.active&&!ch.nActive)return;
      if(ch.mode===16||ch.mode===32){const level=ch.mode===16?1:0;if(ch.ref!==level){ch.ref=level;if(main)r.call('digitalWrite',[pin,ch.ref^pol]);if(ch.nPin&&ch.nActive)r.call('digitalWrite',[ch.nPin,(ch.ref^pol)?0:1]);}}
      if(!ch.it)return;
      hal.queue(timerCcIrq(s.id,hal.f1),function*(){if(!ch.active)return;const {h}=hal.requireHandle(s.ptr,r,'TIM');h.fields.Channel.value=1<<(key/4);try{yield* hal.userCall(r,'HAL_TIM_OC_DelayElapsedCallback',[s.ptr]);}finally{h.fields.Channel.value=0;}},s.id+':oc:'+key);
      const j=(i+1)%matches.length,step=((matches[j]-matches[i])%cycle+cycle)%cycle||cycle;i=j;r.event(r.microTime/1000+step*1000/hz,fire);
    };
    r.event(r.microTime/1000+Math.max(.000001,(next-u)*1000/hz),fire);
  }
  pwm(s,c,r){
    // Center-aligned PWM runs at timer clock / 2*ARR with duty CCR / ARR.
    const pin=c.pin,period=this.period(s),hz=this.hz(s)/this.cycle(s),span=s.count==='center'?Math.max(1,this.arr(s)):period;
    if(pin)r.call('pinMode',[pin,'OUTPUT']);
    // Complementary output (TIMx_CHnN, HAL_TIMEx_PWMN_Start): the inverse of the channel's PWM; dead time is not drawn.
    if(c.nPin){r.call('pinMode',[c.nPin,'OUTPUT']);if(c.nActive&&period>1&&hz<=2000){if(hz<1)r.pwmFrequency.set(c.nPin,hz);else r.call('analogWriteFrequency',[c.nPin,hz]);r.call('analogWrite',[c.nPin,(1-Math.min(1,c.pulse/span))*255]);}else r.call('digitalWrite',[c.nPin,0]);}
    if(!pin)return;
    if(c.active&&period>1){
      // Full-width 32-bit ARR gives a valid period of several minutes.
      // The sketch API's 1 Hz lower bound must not reject an initialized HAL timer.
      // The circuit simulator models PWM up to 2 kHz; ARM builds on the emulator or board have no such limit.
      if(hz>2000)throw new Error(`${s.id} ${pin}: 회로 시뮬레이터의 PWM은 2000 Hz까지입니다 (현재 ${Math.round(hz)} Hz). Prescaler/Period를 키우거나 펌웨어 에뮬레이터로 실행하세요.`);
      if(hz<1)r.pwmFrequency.set(pin,hz);else r.call('analogWriteFrequency',[pin,hz]);
      r.call('analogWrite',[pin,Math.min(1,c.pulse/span)*255]);
    }
    else if(c.active)r.call('digitalWrite',[pin,Number(this.counter(s,r.microTime)<c.pulse)]);
    else r.call('digitalWrite',[pin,0]);
  }
  call(name,args,r){
    if(!name.startsWith('HAL_TIM')&&!name.startsWith('__HAL_TIM'))return undefined;
    const [a,b,c]=args,h=this.hal,s=this.get(a,r);
    if(name==='HAL_TIM_ConfigClockSource'){if(h.field(r.get(r.pointerCell(b)),'ClockSource')!==0)throw new Error(s.id+': 내부 클록만 지원합니다.');return 0;}
    if(name==='HAL_TIMEx_MasterConfigSynchronization'){const cfg=r.get(r.pointerCell(b)),trgo=h.field(cfg,'MasterOutputTrigger');if(![0,16,32].includes(trgo)||h.field(cfg,'MasterSlaveMode'))throw new Error(`${s.id}: TRGO는 ${Object.keys(TIM_TRGO).map(k=>'TIM_TRGO_'+k).join('·')}, MasterSlaveMode는 DISABLE만 지원합니다.`);s.trgo=trgo;return 0;}
    if(name==='HAL_TIM_MspPostInit'||name==='HAL_TIM_IRQHandler')return 0;
    if(name==='HAL_TIM_OnePulse_Init'){if(s.kind==='Encoder')throw new Error(s.id+': 엔코더 모드에서는 One Pulse Mode를 쓰지 않습니다.');if(![0,8].includes(b))throw new Error('HAL_TIM_OnePulse_Init: TIM_OPMODE_SINGLE 또는 TIM_OPMODE_REPETITIVE입니다.');if(s.active)throw new Error(s.id+': 타이머를 정지한 뒤 One Pulse Mode를 설정하세요.');s.onePulse=b===8;return 0;}
    if(name==='HAL_TIMEx_ConfigBreakDeadTime'){
      if(!isAdvancedTimer(s.id))throw new Error(`${s.id}: Break / Dead Time은 고급 타이머 TIM1/TIM8에만 있습니다.`);
      const cfg=r.get(r.pointerCell(b)),dead=h.field(cfg,'DeadTime');integer(dead,0,255,s.id+' DeadTime');
      if(h.field(cfg,'BreakState'))throw new Error(`${s.id}: 내장 해석기는 Break 입력을 지원하지 않습니다(TIM_BREAK_DISABLE). ARM GCC 시뮬레이터로 실행하세요.`);
      if(dead&&!s.deadNoted){s.deadNoted=true;r.warn?.(`[${s.id}] Dead Time ${dead}: 내장 해석기는 상보 출력의 데드타임 구간을 그리지 않습니다(ARM GCC 시뮬레이터에서 확인).`);}
      s.deadTime=dead;return 0;
    }
    if(/^HAL_TIMEx_(PWMN|OCN)_(Start|Stop)$/.test(name)){
      if(!isAdvancedTimer(s.id))throw new Error(`${s.id}: 상보 출력(CHxN)은 고급 타이머 TIM1/TIM8에만 있습니다.`);
      integer(b/4,0,2,'TIM 상보 채널(CH1N~CH3N)');const ch=this.channel(s,b);if(ch.kind==='IC'||ch.kind!==(name.includes('PWMN')?'PWM':'OC'))throw new Error(`${s.id}: ${name}은 ${name.includes('PWMN')?'PWM':'출력 비교'} 채널에 씁니다.`);
      ch.nPin=h.pinFor(`${s.id}_CH${b/4+1}N`);ch.nActive=name.endsWith('_Start');this.freeze(s,r.microTime);
      // The complementary output runs with the counter even when the main output (CHx) is not started.
      if(ch.nActive&&!ch.active){ch.nRuns=true;s.nCount=(s.nCount??0)+1;}else if(!ch.nActive&&ch.nRuns){ch.nRuns=false;s.nCount--;}
      this.syncActive(s,r);if(ch.kind==='PWM')this.pwm(s,ch,r);else this.oc(s,ch,b,r);return 0;
    }
    if(name==='__HAL_TIM_GET_COUNTER')return this.counter(s,r.microTime);
    if(['__HAL_TIM_GET_FLAG','__HAL_TIM_CLEAR_FLAG','__HAL_TIM_CLEAR_IT'].includes(name)){
      if(b!==1)throw new Error(`${name}: 내장 해석기는 Update 플래그(TIM_FLAG_UPDATE / TIM_IT_UPDATE)만 지원합니다. 다른 플래그는 ARM GCC 빌드로 실행하세요.`);
      if(name==='__HAL_TIM_GET_FLAG')return Number(this.updates(s,r.microTime)>0);
      this.freeze(s,r.microTime);s.updates=0;return 0;
    }
    if(name==='__HAL_TIM_IS_TIM_COUNTING_DOWN')return Number(this.countingDown(s,r.microTime));
    if(name==='__HAL_TIM_SET_COUNTER'){
      const v=integer(b,0,this.max(s.id),'TIM counter'),arr=this.arr(s),cycle=this.cycle(s),down=this.countingDown(s,r.microTime);s.updates=this.updates(s,r.microTime);
      s.value=s.kind==='Encoder'||s.count==='up'||this.period(s)===1?v:s.count==='down'?wrap(arr-v,cycle):down&&v>0?wrap(2*arr-v,cycle):wrap(v,cycle);
      s.at=r.microTime;this.schedule(s,r);this.outputs(s,r);return 0;
    }
    if(name==='__HAL_TIM_GET_AUTORELOAD')return this.period(s)-1;
    if(name==='__HAL_TIM_SET_AUTORELOAD'||name==='__HAL_TIM_SET_PRESCALER'){
      this.freeze(s,r.microTime);const key=name.endsWith('AUTORELOAD')?'Period':'Prescaler';s.init.fields[key].value=integer(b,0,key==='Period'?this.max(s.id):65535,key);if(this.period(s)>1)s.value%=s.kind==='Encoder'?this.period(s):this.cycle(s);this.schedule(s,r);this.outputs(s,r);return 0;
    }
    if(/^HAL_TIM_Base_(Start|Stop)(_IT)?$/.test(name)){
      if(s.kind==='Encoder')throw new Error(s.id+': 엔코더 Start/Stop을 사용하세요.');
      const start=name.includes('_Start'),it=name.endsWith('_IT'),key=it?'baseIT':'base';if(start&&s[key])return 2;
      this.freeze(s,r.microTime);s[key]=start;this.syncActive(s,r);this.schedule(s,r);return 0;
    }
    if(isBasicTimer(s.id)&&/^(HAL_TIM_(PWM|OC|IC)_|__HAL_TIM_(SET|GET)_COMPARE|HAL_TIM_ReadCapturedValue|HAL_TIM_Encoder_|__HAL_TIM_SET_CAPTUREPOLARITY)/.test(name))throw new Error(`${s.id}: 기본 타이머에는 채널이 없습니다(${name}).`);
    if(name==='HAL_TIM_PWM_ConfigChannel'){
      if(s.kind==='Encoder')throw new Error('엔코더와 PWM은 같은 타이머를 공유할 수 없습니다.');
      integer(c/4,0,3,'TIM 채널');const cfg=r.get(r.pointerCell(b));if(h.field(cfg,'OCMode')!==96||h.field(cfg,'OCPolarity'))throw new Error('PWM: 내장 해석기는 PWM1 active high만 지원합니다. PWM2·Low 극성은 ARM GCC 시뮬레이터로 실행하세요.');
      s.channels.set(c,{kind:'PWM',pulse:integer(h.field(cfg,'Pulse'),0,this.max(s.id),'PWM compare'),active:false,pin:this.mainPin(s,c/4+1)});return 0;
    }
    if(name==='HAL_TIM_OC_ConfigChannel'){
      if(s.kind==='Encoder')throw new Error('엔코더와 출력 비교는 같은 타이머를 공유할 수 없습니다.');
      integer(c/4,0,3,'TIM 채널');const cfg=r.get(r.pointerCell(b)),mode=h.field(cfg,'OCMode'),polarity=h.field(cfg,'OCPolarity');
      if(!OC_MODES.includes(mode)||![0,2].includes(polarity))throw new Error('출력 비교: OCMode는 TIMING·ACTIVE·INACTIVE·TOGGLE·FORCED_ACTIVE·FORCED_INACTIVE, CH Polarity는 HIGH·LOW를 지원합니다. PWM 모드는 HAL_TIM_PWM_ConfigChannel을 쓰세요.');
      const old=s.channels.get(c);if(old?.active)throw new Error(s.id+': 채널을 정지한 뒤 설정하세요.');
      s.channels.set(c,{kind:'OC',mode,polarity,pulse:integer(h.field(cfg,'Pulse'),0,this.max(s.id),'Output compare Pulse'),ref:old?.ref??0,active:false,pin:this.mainPin(s,c/4+1)});return 0;
    }
    if(name==='HAL_TIM_IC_ConfigChannel'){
      if(s.kind==='Encoder')throw new Error('엔코더와 입력 캡처는 같은 타이머를 공유할 수 없습니다.');
      integer(c/4,0,3,'TIM 채널');const cfg=r.get(r.pointerCell(b)),get=k=>h.field(cfg,k),polarity=get('ICPolarity'),prescaler=get('ICPrescaler');
      if(![0,2,10].includes(polarity)||get('ICSelection')!==1||![0,4,8,12].includes(prescaler)||get('ICFilter')!==0)throw new Error('입력 캡처: direct TI, DIV1/2/4/8, filter 0을 지원합니다.');
      s.channels.set(c,{kind:'IC',active:false,polarity,divider:2**(prescaler/4),edges:0,captured:0,pin:h.pinFor(s.id+'_CH'+(c/4+1))});return 0;
    }
    if(/^HAL_TIM_(PWM|OC|IC)_(Start|Stop)(_IT)?$/.test(name)||name==='__HAL_TIM_SET_COMPARE'||name==='__HAL_TIM_GET_COMPARE'||name==='HAL_TIM_ReadCapturedValue'||name==='__HAL_TIM_SET_CAPTUREPOLARITY'){
      const ch=this.channel(s,b);
      if(name==='HAL_TIM_ReadCapturedValue')return ch.captured??ch.pulse;
      if(name==='__HAL_TIM_GET_COMPARE')return ch.pulse??ch.captured;
      if(name==='__HAL_TIM_SET_CAPTUREPOLARITY'){if(![0,2,10].includes(c)||ch.kind!=='IC')throw new Error('입력 캡처 polarity를 확인하세요.');ch.polarity=c;return 0;}
      if(name==='__HAL_TIM_SET_COMPARE'){if(ch.kind==='IC')throw new Error('PWM 또는 출력 비교 채널이 필요합니다.');ch.pulse=integer(c,0,this.max(s.id),'Compare');}
      else {
        if(!name.includes('_'+ch.kind+'_'))throw new Error('타이머 채널 모드가 다릅니다.');
        if(ch.kind==='PWM'&&name.endsWith('_IT'))throw new Error('PWM 완료 인터럽트는 지원하지 않습니다.');
        const start=name.includes('_Start');if(start&&ch.active)return 2;this.freeze(s,r.microTime);ch.active=start;ch.it=name.endsWith('_IT');
        if(ch.kind==='IC'){ch.previous=Number(!!r.api.read(ch.pin));ch.edges=0;}
      }
      this.syncActive(s,r);if(s.onePulse)this.schedule(s,r);if(ch.kind==='PWM')this.pwm(s,ch,r);else if(ch.kind==='OC')this.oc(s,ch,b,r);return 0;
    }
    if(/^HAL_TIM_Encoder_(Start|Stop)(_IT)?$/.test(name)){
      if(s.kind!=='Encoder'||b!==60)throw new Error('엔코더 초기화 후 TIM_CHANNEL_ALL을 사용하세요.');
      const start=name.includes('_Start');if(start&&s.encoderActive)return 2;s.encoderActive=start;s.encoderIT=name.endsWith('_IT');s.previous=Number(!!r.api.read(h.pinFor(s.id+'_CH1')))*2+Number(!!r.api.read(h.pinFor(s.id+'_CH2')));this.syncActive(s,r);return 0;
    }
    return undefined;
  }
}
