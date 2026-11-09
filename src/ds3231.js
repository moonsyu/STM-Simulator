// DS3231 RTC (Analog Devices/Maxim DS3231 datasheet, Figure 1 "Timekeeping Registers", Control/Status, Aging,
// Temperature) and the AT24C32 EEPROM of the ZS-042 module (32 Kbit, 2-byte word address, 32-byte page).
// The clock keeps registers 00h-06h as written and adds the seconds counted since, so a set time runs on; a module
// with its backup battery starts at the PC's local time. Alarm flags (A1F/A2F) follow the alarm registers and masks.
const bcd=n=>((Math.floor(n/10)<<4)|(n%10)),dec=v=>(v>>4)*10+(v&15);
const DAY=86400;
/** Register file and clock of one DS3231. `now`: the wall clock (ms) the run starts at. */
export function resetDs3231(now=Date.now()){
 const d=new Date(now),regs=new Uint8Array(19);
 regs[0x0e]=0x1c;regs[0x0f]=0x08; // INTCN = 1, RS2/RS1 = 1; EN32kHz = 1 (power-on values)
 const s={regs,pointer:0,at:0,h12:false,checked:0,
  fields:{sec:d.getSeconds(),min:d.getMinutes(),hour:d.getHours(),date:d.getDate(),month:d.getMonth()+1,year:d.getFullYear()},
  dow:d.getDay()+1,dowDay:0};
 s.dowDay=Math.floor(base(s)/DAY);s.checked=base(s);return s;
}
const base=s=>{const f=s.fields;return Date.UTC(f.year,f.month-1,f.date,f.hour,f.min,f.sec)/1000;};
const elapsed=(s,micros)=>Math.max(0,Math.floor((micros-s.at)/1e6));
/** Clock time in seconds (local time written as UTC) at `micros` of the run. */
export const ds3231Time=(s,micros)=>base(s)+elapsed(s,micros);
const fieldsOf=t=>{const d=new Date(t*1000);return {sec:d.getUTCSeconds(),min:d.getUTCMinutes(),hour:d.getUTCHours(),date:d.getUTCDate(),month:d.getUTCMonth()+1,year:d.getUTCFullYear()};};
const dowAt=(s,t)=>((s.dow-1+Math.floor(t/DAY)-s.dowDay)%7+7)%7+1;
const hourOf=v=>v&0x40?dec(v&0x1f)%12+(v&0x20?12:0):dec(v&0x3f);
// Alarm 1 (07h-0Ah: seconds, minutes, hours, day/date with A1M1-A1M4) and alarm 2 (0Bh-0Dh, at seconds 00).
function alarm(s,t,first){
 const r=s.regs,f=fieldsOf(t),m=i=>r[i]&0x80,sec=first?(m(7)||f.sec===dec(r[7]&0x7f)):f.sec===0,o=first?8:11;
 const day=r[o+2];
 return sec&&(m(o)||f.min===dec(r[o]&0x7f))&&(m(o+1)||f.hour===hourOf(r[o+1]))&&(m(o+2)||(day&0x40?dowAt(s,t)===(day&15):f.date===dec(day&0x3f)));
}
function updateAlarms(s,micros){
 const t=ds3231Time(s,micros);
 for(let u=Math.max(s.checked+1,t-2*DAY);u<=t;u++){if(alarm(s,u,true))s.regs[0x0f]|=1;if(alarm(s,u,false))s.regs[0x0f]|=2;}
 s.checked=Math.max(s.checked,t);
}
function register(s,reg,micros,temperature){
 const t=ds3231Time(s,micros),f=fieldsOf(t);
 if(reg===0)return bcd(f.sec);if(reg===1)return bcd(f.min);
 if(reg===2)return s.h12?0x40|(f.hour>=12?0x20:0)|bcd(f.hour%12||12):bcd(f.hour);
 if(reg===3)return dowAt(s,t);if(reg===4)return bcd(f.date);
 if(reg===5)return bcd(f.month)|(f.year>=2100?0x80:0);if(reg===6)return bcd(f.year%100);
 if(reg===0x0f)updateAlarms(s,micros);
 // Temperature: 10-bit two's complement in 0.25 °C steps (MSB integer part, LSB bits 7-6 the fraction).
 const q=Math.round(Math.max(-128,Math.min(127.75,Number(temperature)||0))*4);
 if(reg===0x11)return (q>>2)&255;if(reg===0x12)return (q&3)<<6;
 return s.regs[reg];
}
/** A burst write: the register pointer, then registers from it on (00h-12h, wrapping). */
export function writeDs3231(s,bytes,micros){
 let reg=bytes[0];if(reg>0x12)return false;
 const values=bytes.slice(1),time=values.some((_,i)=>(reg+i)%19<=6);s.pointer=reg;if(!values.length)return true;
 let dow=null;
 if(time){
  // The time registers hold what was written; the seconds already counted are folded in first, keeping the
  // sub-second phase. The day-of-week register is its own counter (it does not follow a written date).
  updateAlarms(s,micros);const t=ds3231Time(s,micros);dow=dowAt(s,t);s.fields=fieldsOf(t);s.at=micros-((micros-s.at)%1e6);
 }
 for(const v of values){
  const f=s.fields;
  if(reg===0){f.sec=dec(v&0x7f);s.at=micros;} // writing the seconds resets the countdown chain
  else if(reg===1)f.min=dec(v&0x7f);
  else if(reg===2){s.h12=!!(v&0x40);f.hour=hourOf(v);}
  else if(reg===3)dow=(v&7)||1;
  else if(reg===4)f.date=dec(v&0x3f);
  else if(reg===5){f.month=dec(v&0x1f);f.year=2000+f.year%100+(v&0x80?100:0);}
  else if(reg===6)f.year=2000+dec(v)+(f.year>=2100?100:0);
  else if(reg===0x0e)s.regs[reg]=v&~0x20; // CONV: the conversion is done at once
  else if(reg===0x0f)s.regs[reg]=(s.regs[reg]&v&0x83)|(v&0x08); // OSF, A2F, A1F can only be cleared
  else if(reg<0x11)s.regs[reg]=v;
  reg=(reg+1)%19;
 }
 if(time){const t=ds3231Time(s,micros);s.dow=dow;s.dowDay=Math.floor(t/DAY);s.checked=t;}
 s.pointer=reg;return true;
}
export function readDs3231(s,count,micros,temperature){
 return Array.from({length:count},()=>{const v=register(s,s.pointer,micros,temperature);s.pointer=(s.pointer+1)%19;return v;});
}

// AT24C32: 4096 bytes, erased to FFh. A write sets the 12-bit word address, then fills one 32-byte page (wrapping).
export const resetEeprom=()=>({data:new Uint8Array(4096).fill(255),address:0});
export function writeEeprom(e,bytes){
 if(bytes.length<2)return bytes.length===1; // the first address byte alone is acknowledged
 e.address=((bytes[0]<<8)|bytes[1])&4095;
 for(const v of bytes.slice(2)){e.data[e.address]=v;e.address=(e.address&~31)|((e.address+1)&31);}
 return true;
}
export function readEeprom(e,count){return Array.from({length:count},()=>{const v=e.data[e.address];e.address=(e.address+1)&4095;return v;});}
