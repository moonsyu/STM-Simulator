import {I2C_DEVICES,SPI_DEVICES} from './device-defs.js';
import {modulePowered,deviceTerminal} from './device-motion.js';

export function crc8(bytes){let crc=255;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=crc&128?((crc<<1)^0x31)&255:(crc<<1)&255;}return crc;}
const word=n=>[n>>8&255,n&255];
const signed=n=>Math.max(-32768,Math.min(32767,Math.round(n)));
// Register/transaction models, independent from the C interpreter. No vendor firmware is bundled.
export class DeviceBuses{
 constructor(){this.states=new Map();this.revision=0;}
 state(p){
  if(!this.states.has(p.id))this.reset(p);
  return this.states.get(p.id);
 }
 reset(p){
  const s={version:++this.revision,pointer:0,powered:false};
  if(p.type==='sht31')Object.assign(s,{readyAt:null,sample:null});
  if(p.type==='mpu6050'){s.registers=new Uint8Array(128);s.registers[0x75]=0x68;s.registers[0x6b]=0x40;}
  if(p.type==='oled')Object.assign(s,{ram:new Uint8Array(1024),display:false,invert:false,all:false,mode:2,col:0,page:0,colStart:0,colEnd:127,pageStart:0,pageEnd:7,remap:false,flip:false,startLine:0,offset:0,contrast:127,pending:[],need:0});
  if(p.type==='tft')Object.assign(s,{ram:new Uint16Array(128*160),display:false,sleep:true,invert:false,format:0x55,madctl:0,colStart:0,colEnd:127,rowStart:0,rowEnd:159,col:0,row:0,command:null,args:[],highByte:null});
  if(p.type==='matrix')Object.assign(s,{ram:new Uint8Array(8),display:false,test:false,intensity:0,scan:7,shift:[],selected:false});
  this.states.set(p.id,s);return s;
 }
 touch(s){s.version=++this.revision;}
 writeI2c(p,bytes,micros){
  const s=this.state(p);if(!bytes.length)return true;
  if(p.type==='sht31'){
   const command=bytes[0]*256+bytes[1];if(bytes.length!==2)return false;
   if(command===0x30a2){this.reset(p).powered=true;return true;}
   if(command!==0x2400)return false;
   const t=word(Math.round((p.temperature+45)/175*65535)),h=word(Math.round(p.humidity/100*65535));
   s.sample=[...t,crc8(t),...h,crc8(h)];s.readyAt=micros+15000;return true;
  }
  if(p.type==='mpu6050'){
   s.pointer=bytes[0]&127;
   for(const value of bytes.slice(1)){
    const reg=s.pointer;if(![0x6b,0x1a,0x1b,0x1c,0x19].includes(reg))throw new Error(`MPU6050: 쓰기를 지원하지 않는 레지스터 0x${reg.toString(16)}`);
    if(reg===0x6b&&value&128){this.reset(p).powered=true;return true;}
    s.registers[reg]=value;s.pointer=(reg+1)&127;
   }return true;
  }
  if(p.type==='oled'){
   // Control byte: Co=0, D/C# selects one complete command or data stream.
   if(![0,0x40].includes(bytes[0]))throw new Error('SSD1306: 제어 바이트 0x00(명령) 또는 0x40(데이터)를 사용하세요.');
   for(const value of bytes.slice(1))if(bytes[0]===0x40){s.ram[s.page*128+s.col]=value;
    if(s.mode===1){if(++s.page>s.pageEnd){s.page=s.pageStart;if(++s.col>s.colEnd)s.col=s.colStart;}}
    else if(s.mode===0){if(++s.col>s.colEnd){s.col=s.colStart;if(++s.page>s.pageEnd)s.page=s.pageStart;}}
    else s.col=(s.col+1)&127;
   }else this.oledCommand(s,value);
   this.touch(s);return true;
  }
  return false;
 }
 readI2c(p,count,micros){
  const s=this.state(p);
  if(p.type==='sht31'){if(s.readyAt==null||micros<s.readyAt||count!==6)return null;const bytes=s.sample;s.readyAt=null;return bytes;}
  if(p.type==='mpu6050'){
   if(!(s.registers[0x6b]&0x40)){
    const as=[16384,8192,4096,2048][s.registers[0x1c]>>3&3],gs=[131,65.5,32.8,16.4][s.registers[0x1b]>>3&3];
    s.registers.set([...word(signed(p.ax*as)),...word(signed(p.ay*as)),...word(signed(p.az*as)),...word(signed((25-36.53)*340)),...word(signed(p.gx*gs)),...word(signed(p.gy*gs)),...word(signed(p.gz*gs))],0x3b);
   }
   return Array.from({length:count},()=>{const value=s.registers[s.pointer];s.pointer=(s.pointer+1)&127;return value;});
  }
  return null;
 }
 oledCommand(s,value){
  if(s.need){s.pending.push(value);if(--s.need)return;const [cmd,a,b]=s.pending;s.pending=[];
   if(cmd===0x20){if(a>2)throw new Error('SSD1306: 주소 모드는 0~2입니다.');s.mode=a;}
   if(cmd===0x21){if(a>b||b>127)throw new Error('SSD1306: 열 주소 범위 0~127');s.colStart=a;s.colEnd=b;s.col=a;}
   if(cmd===0x22){if(a>b||b>7)throw new Error('SSD1306: 페이지 주소 범위 0~7');s.pageStart=a;s.pageEnd=b;s.page=a;}
   if(cmd===0x81)s.contrast=a;
   if(cmd===0xd3)s.offset=a&63;
   if(cmd===0xa8&&a!==63)throw new Error('SSD1306: 64행 MUX만 지원합니다.');
   return;
  }
  const count=({0x20:1,0x21:2,0x22:2,0x81:1,0xa8:1,0xd3:1,0xd5:1,0xd9:1,0xda:1,0xdb:1,0x8d:1})[value];
  if(count){s.pending=[value];s.need=count;return;}
  if(value<=0xf)s.col=(s.col&0x70)|value;
  else if(value>=0x10&&value<=0x17)s.col=(s.col&15)|((value&7)<<4);
  else if(value>=0x40&&value<=0x7f)s.startLine=value&63;
  else if(value>=0xb0&&value<=0xb7)s.page=value&7;
  else if(value===0xae||value===0xaf)s.display=value===0xaf;
  else if(value===0xa6||value===0xa7)s.invert=value===0xa7;
  else if(value===0xa4||value===0xa5)s.all=value===0xa5;
  else if(value===0xa0||value===0xa1)s.remap=value===0xa1;
  else if(value===0xc0||value===0xc8)s.flip=value===0xc8;
  else if(value!==0xe3)throw new Error(`SSD1306: 지원하지 않는 명령 0x${value.toString(16)}`);
 }
 transfer(p,value,result){
  const s=this.state(p);
  if(p.type==='matrix'){s.selected=true;s.shift.push(value);if(s.shift.length>2)s.shift.shift();return 255;}
  if(p.type!=='tft')return 255;
  if((result.voltage(deviceTerminal(p,7))??0)<2)return 255;
  const data=(result.voltage(deviceTerminal(p,6))??0)>=2;
  if(!data){
   s.command=value;s.args=[];s.highByte=null;
   if(value===0x01){this.reset(p).powered=true;return 255;}
   if(value===0x10)s.sleep=true;if(value===0x11)s.sleep=false;
   if(value===0x28)s.display=false;if(value===0x29)s.display=true;
   if(value===0x20)s.invert=false;if(value===0x21)s.invert=true;
   if(value===0x2c){s.col=s.colStart;s.row=s.rowStart;}
   if(![0x00,0x01,0x10,0x11,0x20,0x21,0x28,0x29,0x2a,0x2b,0x2c,0x36,0x3a].includes(value))throw new Error(`ST7735: 지원하지 않는 명령 0x${value.toString(16)}`);
   this.touch(s);return 255;
  }
  if(s.command===0x2c){
   if(s.format!==0x55)throw new Error('ST7735: RGB565(0x55)만 지원합니다.');
   if(s.highByte==null)s.highByte=value;
   else {let x=s.col,y=s.row;if(s.madctl&0x20)[x,y]=[y,x];if(s.madctl&0x40)x=127-x;if(s.madctl&0x80)y=159-y;
    let color=s.highByte*256+value;if(s.madctl&8)color=(color&0x7e0)|((color&31)<<11)|((color>>11)&31);
    if(x>=0&&x<128&&y>=0&&y<160)s.ram[y*128+x]=color;s.highByte=null;
    if(++s.col>s.colEnd){s.col=s.colStart;if(++s.row>s.rowEnd)s.row=s.rowStart;}this.touch(s);
   }
  }else if(s.command===0x2a||s.command===0x2b){
   s.args.push(value);if(s.args.length===4){const a=s.args[0]*256+s.args[1],b=s.args[2]*256+s.args[3];if(a>b||b>161)throw new Error('ST7735: 주소 창이 범위를 벗어났습니다.');if(s.command===0x2a){s.colStart=a;s.colEnd=b;}else{s.rowStart=a;s.rowEnd=b;}}else if(s.args.length>4)throw new Error('ST7735: 주소 데이터는 4바이트입니다.');
  }else if(s.command===0x36){s.madctl=value;this.touch(s);}
  else if(s.command===0x3a){if(value!==0x55)throw new Error('ST7735: RGB565(0x55)만 지원합니다.');s.format=value;}
  else throw new Error('ST7735: 데이터에 앞서 지원하는 쓰기 명령을 보내세요.');
  return 255;
 }
 latchMatrix(s){
  if(s.shift.length!==2){s.shift=[];return;}
  const [reg,value]=s.shift;s.shift=[];
  if(reg>=1&&reg<=8)s.ram[reg-1]=value;
  else if(reg===9&&value!==0)throw new Error('MAX7219: 매트릭스는 no-decode(0) 모드를 사용하세요.');
  else if(reg===10)s.intensity=value&15;
  else if(reg===11)s.scan=value&7;
  else if(reg===12)s.display=!!(value&1);
  else if(reg===15)s.test=!!(value&1);
  else if(![0,9].includes(reg))throw new Error('MAX7219: 지원하지 않는 레지스터입니다.');
  this.touch(s);
 }
 update(project,result){
  for(const p of project.components){if(![...I2C_DEVICES,...SPI_DEVICES].includes(p.type))continue;
   const powered=modulePowered(p,result);let s=this.state(p);
   if(!powered&&s.powered)s=this.reset(p);s.powered=powered;
   if(p.type==='tft'){
    const reset=(result.voltage(deviceTerminal(p,7))??0)<2;
    if(reset&&!s.resetHeld){s=this.reset(p);s.powered=powered;}s.resetHeld=reset;
   }
   if(p.type==='matrix'){
    const load=result.voltage(deviceTerminal(p,3));
    if(s.selected&&load!=null&&load>=2){if(powered)this.latchMatrix(s);s.selected=false;}
    if(load==null){s.shift=[];s.selected=false;}
   }
   const visible=powered&&(p.type==='matrix'?(s.display||s.test):s.display&&!s.sleep);
   Object.assign(result.parts[p.id]??={voltage:0,current:0,power:0},{powered,on:visible,device:s,visible});
  }
 }
}
