import {LCDController} from './lcd.js';
import {sdCardFor} from './sdcard.js';
// SPI-mode SD card: CMD0/8/55/41/58 init, CMD9/10 registers, CMD13 status, CMD16 block length,
// CMD17/18 single/multi block read, CMD24/25 single/multi block write, CMD12 stop. SDHC block addressing.
function sdData(card,block){return [0xfe,...card.disk.read(block),0xff,0xff];}
function sdCsd(card){const c=card.disk.sectors/1024-1;return [0x40,0x0e,0x00,0x32,0x5b,0x59,0x00,(c>>16)&0x3f,(c>>8)&255,c&255,0x7f,0x80,0x0a,0x40,0x00,0x01];}
function transferSdSpi(p,s,value){
 const w=s.write;
 if(w&&w.phase==='token'&&!s.response.length){if(value===0xfe||value===0xfc){w.phase='data';w.data=[];}else if(value===0xfd&&w.multi){s.write=null;s.response=[0xff,0x00,0xff];}return 255;}
 if(w&&w.phase==='data'){{w.data.push(value);if(w.data.length===514){const card=sdCardFor(p);try{card.disk.write(w.block,Uint8Array.from(w.data.slice(0,512)));card.dirty=true;}catch{s.write=null;s.response=[0x0d];return 255;}if(w.multi){w.block++;w.phase='token';s.response=[0x05,0x00,0xff];}else{s.write=null;s.response=[0x05,0x00,0x00,0xff];}s.version++;}return 255;}
 }
 if(s.reading!=null&&value!==0xff){s.response=[];s.reading=null;}
 if(s.response.length){const out=s.response.shift();if(!s.response.length&&s.reading!=null){s.reading++;s.response=[0xff,...sdData(sdCardFor(p),s.reading)];}return out;}
 if(!s.command.length){if((value&0xc0)!==0x40)return 255;s.command=[value];return 255;}
 s.command.push(value);if(s.command.length===6){const cmd=s.command[0]&63,arg=((s.command[1]<<24)|(s.command[2]<<16)|(s.command[3]<<8)|s.command[4])>>>0;s.command=[];const card=sdCardFor(p),r1=s.idle?1:0,ok=n=>Number.isInteger(n)&&n<card.disk.sectors;
  if(cmd===12){s.reading=null;s.response=[0xff,0x00];return 255;}
  if(cmd===0){s.idle=true;s.response=[1];}else if(cmd===8)s.response=[r1,0,0,1,0xaa];else if(cmd===55){s.app=true;s.response=[r1];}else if(cmd===41&&s.app){s.idle=false;s.app=false;s.response=[0];}else if(cmd===58)s.response=[r1,0x40,0xff,0x80,0];
  else if(s.idle)s.response=[4|1];
  else if(cmd===9)s.response=[0,0xff,0xfe,...sdCsd(card),0xff,0xff];else if(cmd===10)s.response=[0,0xff,0xfe,0x03,0x53,0x44,...[...'STMSD'].map(c=>c.charCodeAt(0)),0x10,0x12,0x34,0x56,0x78,0x01,0x9a,0x01,0xff,0xff];
  else if(cmd===13)s.response=[0,0];else if(cmd===16)s.response=[arg===512?0:0x40];
  else if(cmd===17||cmd===18){if(!ok(arg))s.response=[0x40];else{s.response=[0,0xff,...sdData(card,arg)];if(cmd===18)s.reading=arg;}}
  else if(cmd===24||cmd===25){if(!ok(arg))s.response=[0x40];else{s.response=[0];s.write={phase:'token',block:arg,multi:cmd===25};}}
  else s.response=[4];
 }return 255;
}
const word=n=>[n>>8&255,n&255],bcd=n=>((Math.floor(n/10)<<4)|(n%10));
export function resetCatalogBus(p){const id=p.catalogVariant,s={pointer:0,registers:new Uint8Array(256),words:new Uint16Array(4),version:0,display:false};
 if(id==='ov2640-camera'){s.cameraBank=0;s.cameraBanks=[new Uint8Array(256),new Uint8Array(256)];s.cameraBanks[1].set([0x26,0x42],10);}
 if(id==='lcd-i2c-4'){s.lcd=new LCDController();s.lcd.powered=true;}
 if(id==='sd-storage-board'){s.command=[];s.response=[];s.idle=true;s.app=false;s.write=null;s.reading=null;}
 if(id?.startsWith('rgb-'))s.symbols='';
 p.catalogState??={};return s;
}
export function writeCatalogI2c(p,s,bytes,micros,result){
 const id=p.catalogVariant;if(!bytes.length)return true;s.version++;
 if(id==='lcd-i2c-4'){if(![0,0x40].includes(bytes[0]))return false;bytes.slice(1).forEach((value,i)=>s.lcd.receive(value,bytes[0]===0x40,micros+i*90));s.display=s.lcd.display;s.lcd.powered=true;return true;}
 if(id==='mcp4725-6'){if(bytes.length<2)return false;const value=bytes[0]&0x40?(bytes[1]<<4)|(bytes[2]>>4):((bytes[0]&15)<<8)|bytes[1];s.value=value;p.catalogState.voltage=value*3.3/4096;return true;}
 s.pointer=bytes[0];
 if(id==='ov2640-camera'){for(const value of bytes.slice(1)){const reg=s.pointer++&255;if(reg===255)s.cameraBank=value&1;else if(!(s.cameraBank===1&&[10,11].includes(reg)))s.cameraBanks[s.cameraBank][reg]=value;}s.pointer=bytes[0];return true;}
 if(id==='ads1115-10'){if(bytes.length===3){s.words[s.pointer&3]=(bytes[1]<<8)|bytes[2];if(s.pointer===1){const config=s.words[1],mux=config>>12&7,gain=[6.144,4.096,2.048,1.024,.512,.256,.256,.256][config>>9&7],voltage=n=>result?.voltage(`part:${p.id}:p${5+n}`)??0;const v=mux>=4?voltage(mux-4):voltage([0,0,1,2][mux])-voltage([1,3,3,3][mux]);s.words[0]=Math.max(-32768,Math.min(32767,Math.round(v/gain*32768)))&65535;s.readyAt=micros+8000;}}return true;}
 for(const value of bytes.slice(1))s.registers[s.pointer++&255]=value;s.pointer=bytes[0];
 if(id==='motor-driver-hat'){const duty=n=>{const b=6+n*4,on=s.registers[b]|s.registers[b+1]<<8,off=s.registers[b+2]|s.registers[b+3]<<8;return off&4096?0:on&4096?1:((off-on+4096)&4095)/4096;},vm=result?.voltage(`part:${p.id}:p5`)??0;p.catalogState.outputs=[duty(1)*duty(0)*vm,duty(2)*duty(0)*vm,duty(3)*duty(5)*vm,duty(4)*duty(5)*vm];}
 return true;
}
export function readCatalogI2c(p,s,count,micros){
 const id=p.catalogVariant;
 if(id==='ov2640-camera')return Array.from({length:count},()=>{const reg=s.pointer++&255;return reg===255?s.cameraBank:s.cameraBanks[s.cameraBank][reg];});
 if(id==='ads1115-10'){if(s.pointer===0&&micros<(s.readyAt??0))return null;const bytes=word(s.words[s.pointer&3]);return Array.from({length:count},(_,i)=>bytes[i%2]);}
 if(id==='urm09-i2c-4')s.registers.set(word(p.distance??100),3);
 if(id==='ds3231-8'){const seconds=Math.floor(micros/1e6);s.registers.set([bcd(seconds%60),bcd(Math.floor(seconds/60)%60),bcd(Math.floor(seconds/3600)%24),1,1,1,0]);}
 return Array.from({length:count},()=>s.registers[s.pointer++&255]);
}
export function transferCatalogSpi(p,s,value){
 if(p.catalogVariant==='sd-storage-board')return transferSdSpi(p,s,value);
 if(p.catalogVariant?.startsWith('rgb-')){s.symbols+=value.toString(2).padStart(8,'0');if(s.symbols.length>=72){let grb=0;for(let i=0;i<24;i++)grb=(grb<<1)|(s.symbols.slice(i*3,i*3+3)==='110'?1:0);s.symbols='';s.color=[grb>>8&255,grb>>16&255,grb&255];s.display=s.color.some(Boolean);s.version++;}return 255;}
 return 255;
}
