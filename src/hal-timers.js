import {isTimer,timerMax} from './timer-config.js';
const integer=(n,min,max,label)=>{if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label}: ${min}~${max} 범위를 확인하세요.`);return n;};
const wrap=(n,period)=>((n%period)+period)%period;
const quadrature=[0,-1,1,0,1,0,0,-1,-1,0,0,1,0,1,-1,0];

// One counter per peripheral; capture / PWM channels share that counter.
export class HalTimers {
  constructor(hal){this.hal=hal;this.states=new Map();}
  init(ptr,r,kind,encoder){
    const h=this.hal,{id,init}=h.handle(ptr,r,'TIM'),get=k=>h.field(init,k),p=h.config.peripherals[id];
    if(!isTimer(id)||get('CounterMode')||get('ClockDivision'))throw new Error(`${id}: 내부 클록, up counter, DIV1을 사용하세요.`);
    integer(get('Prescaler'),0,65535,id+' Prescaler');integer(get('Period'),0,timerMax(id),id+' ARR');
    if(get('Prescaler')!==p.prescaler||get('Period')!==p.period)throw new Error(`${id}: 소스와 Pinout의 Prescaler/Period가 다릅니다.`);
    if(this.states.get(id)?.active)throw new Error(id+': 타이머를 정지한 뒤 초기화하세요.');
    const s={id,ptr,init,kind,value:0,at:r.microTime,active:false,base:false,baseIT:false,generation:0,channels:new Map(),down:false};
    if(kind==='Encoder'){
      const cfg=r.get(r.pointerCell(encoder));s.encoderMode=h.field(cfg,'EncoderMode');
      if(![1,2,3].includes(s.encoderMode)||get('Prescaler')!==0)throw new Error(id+': 엔코더 TI1/TI2/TI12, Prescaler 0을 사용하세요.');
      for(const n of [1,2]){if(h.field(cfg,`IC${n}Polarity`)!==0||h.field(cfg,`IC${n}Selection`)!==1||h.field(cfg,`IC${n}Prescaler`)!==0||h.field(cfg,`IC${n}Filter`)!==0)throw new Error(id+': 엔코더 direct TI, rising, DIV1, filter 0을 지원합니다.');h.pinFor(id+'_CH'+n);}
    }
    this.states.set(id,s);return s;
  }
  get(ptr,r){const {id}=this.hal.requireHandle(ptr,r,'TIM'),s=this.states.get(id);if(!s)throw new Error(id+': 타이머 초기화가 필요합니다.');return s;}
  period(s){return this.hal.field(s.init,'Period')+1;}
  hz(s){return this.hal.config.timerClockHz/(this.hal.field(s.init,'Prescaler')+1);}
  counter(s,us){return Math.floor(wrap(s.value+(s.active&&s.kind!=='Encoder'?(us-s.at)*this.hz(s)/1e6:0),this.period(s)));}
  freeze(s,us){s.value=this.counter(s,us);s.at=us;}
  syncActive(s,r){this.freeze(s,r.microTime);s.active=s.base||s.baseIT||s.encoderActive||[...s.channels.values()].some(c=>c.active);}
  schedule(s,r){
    const generation=++s.generation;if(!s.baseIT)return;
    const ms=(this.period(s)-this.counter(s,r.microTime))*1000/this.hz(s);
    const full=this.period(s)*1000/this.hz(s);if(full<.1||full>3600000)throw new Error(s.id+': 인터럽트 주기 범위 0.1~3600000 ms');
    const fire=()=>{if(generation!==s.generation||!s.baseIT)return;this.hal.queue(s.id+'_IRQn',()=>{if(s.baseIT)this.hal.callback(r,'HAL_TIM_PeriodElapsedCallback',[s.ptr]);},s.id+':update');r.event(r.microTime/1000+full,fire);};
    r.event(r.microTime/1000+Math.max(.000001,ms),fire);
  }
  channel(s,key){integer(key/4,0,3,'TIM 채널');const c=s.channels.get(key);if(!c)throw new Error(s.id+': 채널을 먼저 초기화하세요.');return c;}
  notify(s,c,key,r){if(!c.it)return;this.hal.queue(s.id+'_IRQn',()=>{if(!c.active||s.kind==='Encoder'&&!s.encoderActive)return;const {h}=this.hal.requireHandle(s.ptr,r,'TIM');h.fields.Channel.value=1<<(key/4);try{this.hal.callback(r,'HAL_TIM_IC_CaptureCallback',[s.ptr]);}finally{h.fields.Channel.value=0;}},s.id+':capture:'+key);}
  observe(r,us=r.microTime){
    for(const s of this.states.values()){
      if(!s.active)continue;
      if(s.kind==='Encoder'&&s.encoderActive){
        const a=Number(!!r.api.read(this.hal.pinFor(s.id+'_CH1'))),b=Number(!!r.api.read(this.hal.pinFor(s.id+'_CH2'))),next=a*2+b,prev=s.previous;
        s.previous=next;if(prev===undefined||prev===next)continue;
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
  pwm(s,c,r){
    const pin=c.pin,period=this.period(s),hz=this.hz(s)/period;
    r.call('pinMode',[pin,'OUTPUT']);
    if(c.active){r.call('analogWriteFrequency',[pin,hz]);r.call('analogWrite',[pin,Math.min(1,c.pulse/period)*255]);}
    else r.call('digitalWrite',[pin,0]);
  }
  call(name,args,r){
    if(!name.startsWith('HAL_TIM')&&!name.startsWith('__HAL_TIM'))return undefined;
    const [a,b,c]=args,h=this.hal,s=this.get(a,r);
    if(name==='HAL_TIM_ConfigClockSource'){if(h.field(r.get(r.pointerCell(b)),'ClockSource')!==0)throw new Error(s.id+': 내부 클록만 지원합니다.');return 0;}
    if(name==='HAL_TIMEx_MasterConfigSynchronization'){const cfg=r.get(r.pointerCell(b));if(h.field(cfg,'MasterOutputTrigger')||h.field(cfg,'MasterSlaveMode'))throw new Error('타이머 동기화는 지원하지 않습니다.');return 0;}
    if(name==='HAL_TIM_MspPostInit'||name==='HAL_TIM_IRQHandler')return 0;
    if(name==='__HAL_TIM_GET_COUNTER')return this.counter(s,r.microTime);
    if(name==='__HAL_TIM_IS_TIM_COUNTING_DOWN')return Number(s.down);
    if(name==='__HAL_TIM_SET_COUNTER'){s.value=integer(b,0,this.period(s)-1,'TIM counter');s.at=r.microTime;this.schedule(s,r);return 0;}
    if(name==='__HAL_TIM_GET_AUTORELOAD')return this.period(s)-1;
    if(name==='__HAL_TIM_SET_AUTORELOAD'||name==='__HAL_TIM_SET_PRESCALER'){
      this.freeze(s,r.microTime);const key=name.endsWith('AUTORELOAD')?'Period':'Prescaler';s.init.fields[key].value=integer(b,0,key==='Period'?timerMax(s.id):65535,key);s.value%=this.period(s);this.schedule(s,r);for(const ch of s.channels.values())if(ch.kind==='PWM')this.pwm(s,ch,r);return 0;
    }
    if(/^HAL_TIM_Base_(Start|Stop)(_IT)?$/.test(name)){
      if(s.kind==='Encoder')throw new Error(s.id+': 엔코더 Start/Stop을 사용하세요.');
      const start=name.includes('_Start'),it=name.endsWith('_IT'),key=it?'baseIT':'base';if(start&&s[key])return 2;
      this.freeze(s,r.microTime);s[key]=start;this.syncActive(s,r);this.schedule(s,r);return 0;
    }
    if(name==='HAL_TIM_PWM_ConfigChannel'){
      if(s.kind==='Encoder')throw new Error('엔코더와 PWM은 같은 타이머를 공유할 수 없습니다.');
      integer(c/4,0,3,'TIM 채널');const cfg=r.get(r.pointerCell(b));if(h.field(cfg,'OCMode')!==96||h.field(cfg,'OCPolarity'))throw new Error('PWM1 active high만 지원합니다.');
      s.channels.set(c,{kind:'PWM',pulse:integer(h.field(cfg,'Pulse'),0,this.period(s),'PWM compare'),active:false,pin:h.pinFor(s.id+'_CH'+(c/4+1))});return 0;
    }
    if(name==='HAL_TIM_IC_ConfigChannel'){
      if(s.kind==='Encoder')throw new Error('엔코더와 입력 캡처는 같은 타이머를 공유할 수 없습니다.');
      integer(c/4,0,3,'TIM 채널');const cfg=r.get(r.pointerCell(b)),get=k=>h.field(cfg,k),polarity=get('ICPolarity'),prescaler=get('ICPrescaler');
      if(![0,2,10].includes(polarity)||get('ICSelection')!==1||![0,4,8,12].includes(prescaler)||get('ICFilter')!==0)throw new Error('입력 캡처: direct TI, DIV1/2/4/8, filter 0을 지원합니다.');
      s.channels.set(c,{kind:'IC',active:false,polarity,divider:2**(prescaler/4),edges:0,captured:0,pin:h.pinFor(s.id+'_CH'+(c/4+1))});return 0;
    }
    if(/^HAL_TIM_(PWM|IC)_(Start|Stop)(_IT)?$/.test(name)||name==='__HAL_TIM_SET_COMPARE'||name==='__HAL_TIM_GET_COMPARE'||name==='HAL_TIM_ReadCapturedValue'||name==='__HAL_TIM_SET_CAPTUREPOLARITY'){
      const ch=this.channel(s,b);
      if(name==='HAL_TIM_ReadCapturedValue')return ch.captured??ch.pulse;
      if(name==='__HAL_TIM_GET_COMPARE')return ch.pulse??ch.captured;
      if(name==='__HAL_TIM_SET_CAPTUREPOLARITY'){if(![0,2,10].includes(c)||ch.kind!=='IC')throw new Error('입력 캡처 polarity를 확인하세요.');ch.polarity=c;return 0;}
      if(name==='__HAL_TIM_SET_COMPARE'){if(ch.kind!=='PWM')throw new Error('PWM 채널이 필요합니다.');ch.pulse=integer(c,0,this.period(s),'PWM compare');}
      else {
        if(!name.includes('_'+ch.kind+'_'))throw new Error('타이머 채널 모드가 다릅니다.');
        if(ch.kind==='PWM'&&name.endsWith('_IT'))throw new Error('PWM 완료 인터럽트는 지원하지 않습니다.');
        const start=name.includes('_Start');if(start&&ch.active)return 2;this.freeze(s,r.microTime);ch.active=start;ch.it=name.endsWith('_IT');
        if(ch.kind==='IC'){ch.previous=Number(!!r.api.read(ch.pin));ch.edges=0;}
      }
      this.syncActive(s,r);if(ch.kind==='PWM')this.pwm(s,ch,r);return 0;
    }
    if(/^HAL_TIM_Encoder_(Start|Stop)(_IT)?$/.test(name)){
      if(s.kind!=='Encoder'||b!==60)throw new Error('엔코더 초기화 후 TIM_CHANNEL_ALL을 사용하세요.');
      const start=name.includes('_Start');if(start&&s.encoderActive)return 2;s.encoderActive=start;s.encoderIT=name.endsWith('_IT');s.previous=Number(!!r.api.read(h.pinFor(s.id+'_CH1')))*2+Number(!!r.api.read(h.pinFor(s.id+'_CH2')));this.syncActive(s,r);return 0;
    }
    return undefined;
  }
}
