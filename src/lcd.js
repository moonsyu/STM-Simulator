// Independent HD44780-compatible write-side model; no vendor library is bundled.
export class LCDController {
  constructor(){this.reset();this.powered=false;this.enable=false;}
  reset(){this.ram=new Uint8Array(128).fill(32);this.cgram=new Uint8Array(64);this.address=0;this.cgramMode=false;this.eightBit=true;this.half=null;this.display=false;this.cursor=false;this.blink=false;this.increment=1;this.entryShift=false;this.shift=0;this.busyUntil=0;}
  receive(value,data,micros){
    if(micros<this.busyUntil)return;
    if(data){const memory=this.cgramMode?this.cgram:this.ram;memory[this.address%memory.length]=value;this.address=(this.address+this.increment+memory.length)%memory.length;if(this.entryShift&&!this.cgramMode)this.shift=(this.shift+this.increment+40)%40;}
    else if(value&128){this.address=value&127;this.cgramMode=false;}
    else if(value&64){this.address=value&63;this.cgramMode=true;}
    else if(value&32){this.eightBit=!!(value&16);this.half=null;}
    else if(value&16){if(value&8)this.shift=(this.shift+((value&4)?-1:1)+40)%40;else this.address=(this.address+((value&4)?1:-1)+128)%128;}
    else if(value&8){this.display=!!(value&4);this.cursor=!!(value&2);this.blink=!!(value&1);}
    else if(value&4){this.increment=(value&2)?1:-1;this.entryShift=!!(value&1);}
    else if(value===2){this.address=0;this.shift=0;this.cgramMode=false;}
    else if(value===1){this.ram.fill(32);this.address=0;this.shift=0;this.cgramMode=false;}
    this.busyUntil=micros+(!data&&(value===1||value===2)?1520:37);
  }
  update(part,result,micros){
    const v=n=>result?.voltage(`part:${part.id}:p${n}`),gnd=v(1),supply=v(2),powered=!result?.fault&&gnd!=null&&supply!=null&&supply-gnd>=4.5&&supply-gnd<=5.5;
    if(!powered){if(this.powered)this.reset();this.powered=false;this.enable=false;return this.snapshot(false);}
    this.powered=true;
    const bit=n=>{const value=v(n);return value==null?null:value-gnd>=2?1:value-gnd<=.8?0:null;};
    const enable=bit(6)===1,rs=bit(4),rw=bit(5);
    if(this.enable&&!enable&&rs!==null&&rw===0){
      const data=Array.from({length:8},(_,i)=>bit(i+7));
      if(this.eightBit){const value=data.reduce((v,b,i)=>v|((b??0)<<i),0);if(data.every(b=>b!==null)||[0x20,0x30].includes(value))this.receive(value,rs,micros);}
      else if(data.slice(4).every(b=>b!==null)){
        const nibble=data.slice(4).reduce((v,b,i)=>v|(b<<i),0);
        if(this.half===null)this.half={value:nibble,rs};else {const first=this.half;this.half=null;if(first.rs===rs)this.receive((first.value<<4)|nibble,rs,micros);}
      }
    }
    this.enable=enable;
    const contrast=v(3),visible=contrast!=null&&contrast-gnd<supply-gnd-1;
    return this.snapshot(visible,micros);
  }
  snapshot(contrast,micros=0){
    const visible=this.powered&&this.display&&contrast;
    const codes=[0,64].map(base=>Array.from({length:16},(_,i)=>this.ram[base+(i+this.shift)%40]));
    return {powered:this.powered,visible,lines:codes.map(row=>row.map(c=>c>=32&&c<127?String.fromCharCode(c):' ').join('')),codes,cgram:[...this.cgram],cursor:this.cursor,blink:this.blink&&Math.floor(micros/400000)%2===0,address:this.address,shift:this.shift};
  }
}

export function constructLCD(args,runtime){
  if(![6,7,10,11].includes(args.length))throw new Error('LiquidCrystal(rs, [rw,] enable, d4,d5,d6,d7) 또는 8비트 핀을 지정하세요.');
  const hasRW=args.length===7||args.length===11,pins=args.map(p=>runtime.pin(p));
  if(new Set(pins).size!==pins.length)throw new Error('LCD 제어 핀은 서로 달라야 합니다.');
  return {kind:'device',name:'LiquidCrystal',rs:pins[0],rw:hasRW?pins[1]:null,enable:pins[hasRW?2:1],data:pins.slice(hasRW?3:2),control:4,entry:2,started:false};
}
export function callLCD(device,method,args,runtime){
  const set=(pin,value)=>runtime.call('digitalWrite',[pin,value]);
  const pulse=value=>{device.data.forEach((pin,i)=>set(pin,(value>>i)&1));set(device.enable,1);runtime.microTime+=1;set(device.enable,0);runtime.microTime+=1;};
  const send=(value,data=false)=>{set(device.rs,data?1:0);if(device.rw)set(device.rw,0);if(device.data.length===4){pulse((value>>4)&15);pulse(value&15);}else pulse(value&255);runtime.microTime+=!data&&(value===1||value===2)?2000:40;};
  if(method==='begin'){
    if(args[0]!==16||args[1]!==2)throw new Error('현재 LCD 크기는 begin(16, 2)입니다.');
    for(const pin of [device.rs,device.rw,device.enable,...device.data].filter(Boolean))runtime.call('pinMode',[pin,'OUTPUT']);
    set(device.enable,0);set(device.rs,0);if(device.rw)set(device.rw,0);runtime.microTime+=15000;
    if(device.data.length===4){for(const wait of [4500,150,150]){pulse(3);runtime.microTime+=wait;}pulse(2);runtime.microTime+=150;}
    send(device.data.length===4?0x28:0x38);send(0x0c);send(0x06);send(1);device.control=4;device.entry=2;device.started=true;return 0;
  }
  if(!device.started)throw new Error('lcd.begin(16, 2)를 먼저 호출하세요.');
  if(method==='print'||method==='println'){const text=runtime.format(args);if(text.length>512)throw new Error('LCD 출력은 한 번에 512자 이하로 작성하세요.');for(const char of text)send(char.charCodeAt(0)&255,true);return text.length;}
  if(method==='write'){send(Number(args[0])&255,true);return 1;}
  if(method==='command'){send(Number(args[0])&255);return 0;}
  if(method==='clear'||method==='home'){send(method==='clear'?1:2);return 0;}
  if(method==='setCursor'){const [col,row]=args;if(!Number.isInteger(col)||!Number.isInteger(row)||col<0||col>15||row<0||row>1)throw new Error('LCD 커서 범위는 열 0~15, 행 0~1입니다.');send(128|(row?64:0)|col);return 0;}
  const controls={display:4,noDisplay:-4,cursor:2,noCursor:-2,blink:1,noBlink:-1};
  if(Object.hasOwn(controls,method)){const flag=controls[method];device.control=flag>0?device.control|flag:device.control&~(-flag);send(8|device.control);return 0;}
  if(method==='scrollDisplayLeft'||method==='scrollDisplayRight'){send(method==='scrollDisplayLeft'?0x18:0x1c);return 0;}
  if(['leftToRight','rightToLeft','autoscroll','noAutoscroll'].includes(method)){if(method==='leftToRight')device.entry|=2;if(method==='rightToLeft')device.entry&=~2;if(method==='autoscroll')device.entry|=1;if(method==='noAutoscroll')device.entry&=~1;send(4|device.entry);return 0;}
  if(method==='createChar'){const slot=Number(args[0]);if(!Number.isInteger(slot)||slot<0||slot>7)throw new Error('사용자 문자 번호는 0~7입니다.');send(64|(slot<<3));for(let i=0;i<8;i++)send(runtime.get(runtime.pointerCell(args[1],i))&31,true);send(128);return 0;}
  throw new Error(`지원하지 않는 LCD 함수: ${method}`);
}
