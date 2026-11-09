// DS3231 RTC register model (datasheet timekeeping, control/status, alarm and temperature registers), the ZS-042
// module's AT24C32 EEPROM at 0x57, and the ZS-042 part example running on the interpreter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resetDs3231,writeDs3231,readDs3231,ds3231Time,resetEeprom,writeEeprom,readEeprom} from '../../src/ds3231.js';
import {catalogExample} from '../../src/catalog-examples.js';
import {catalogType,CATALOG_DEFS} from '../../src/catalog-defs.js';
import {SimulationSession} from '../../src/session.js';
import {validateProject} from '../../src/project.js';

const bcd=n=>((Math.floor(n/10)<<4)|(n%10));
const read=(s,reg,count,us,t=25)=>{writeDs3231(s,[reg],us);return readDs3231(s,count,us,t);};
// 2026-11-09 (Monday, day register 2 as a sketch counting Sunday = 1) 23:59:58.
const setTime=(s,us)=>writeDs3231(s,[0,bcd(58),bcd(59),bcd(23),2,bcd(9),bcd(11),bcd(26)],us);

test('a run starts at the PC clock; a written time runs on and rolls over midnight, day-of-week counting on',()=>{
 const s=resetDs3231(new Date(2026,10,9,8,30,15).getTime());
 assert.deepEqual(read(s,0,7,0),[0x15,0x30,0x08,2,0x09,0x11,0x26],'2026-11-09 (Mon) 08:30:15');
 assert.deepEqual(read(s,0,3,2500000),[0x17,0x30,0x08],'2.5 s later');
 setTime(s,3e6);
 assert.deepEqual(read(s,0,7,3.9e6),[0x58,0x59,0x23,2,0x09,0x11,0x26],'still 23:59:58 before a whole second');
 assert.deepEqual(read(s,0,7,6e6),[0x01,0x00,0x00,3,0x10,0x11,0x26],'3 s later: next day, day register 3');
 // A date written on its own keeps the day-of-week counter (the chip does not derive it).
 writeDs3231(s,[4,bcd(28),bcd(2)],6e6);assert.deepEqual(read(s,3,4,6e6),[3,0x28,0x02,0x26]);
 assert.deepEqual(read(s,0,7,6e6+86400e6),[0x01,0x00,0x00,4,0x01,0x03,0x26],'Feb 28 2026 → Mar 1');
});

test('12-hour mode, century, pointer wrap after 12h, control CONV and status flags',()=>{
 const s=resetDs3231(new Date(2099,11,31,23,59,59).getTime());
 writeDs3231(s,[2,0x40|0x20|bcd(11)],0);assert.equal(read(s,2,1,0)[0],0x40|0x20|0x11,'11 PM in 12-hour mode');
 assert.deepEqual(read(s,0,7,1e6),[0,0,0x40|0x12,6,0x01,0x81,0x00],'12 AM, 2100-01-01 with the century bit');
 assert.deepEqual(read(s,0x12,2,1e6),[0,0],'pointer wraps from 12h to 00h');
 assert.deepEqual(read(s,0x0e,2,1e6),[0x1c,0x08],'power-on control and status');
 writeDs3231(s,[0x0e,0x3c],1e6);assert.equal(read(s,0x0e,1,1e6)[0],0x1c,'CONV clears at once');
 writeDs3231(s,[0x0f,0xff],1e6);assert.equal(read(s,0x0f,1,1e6)[0],0x08,'OSF/A1F/A2F cannot be set by a write');
});

test('temperature registers: 0.25 °C steps, two\'s complement',()=>{
 const s=resetDs3231(0);
 assert.deepEqual(read(s,0x11,2,0,25.25),[25,0x40]);
 assert.deepEqual(read(s,0x11,2,0,-10.5),[0xf5,0x80],'-10.5 = -11 + 0.5');
});

test('alarm 1 (h:m:s match) and alarm 2 (minute match) set A1F / A2F; writing 0 clears them',()=>{
 const s=resetDs3231(0);setTime(s,0);
 writeDs3231(s,[7,bcd(5),bcd(0),bcd(0),0x80,bcd(1),0x80,0x80],0); // A1: 00:00:05 every day; A2: minute 01 every hour
 assert.equal(read(s,0x0f,1,6e6)[0]&3,0,'00:00:04: no alarm yet');
 assert.equal(read(s,0x0f,1,7e6)[0]&3,1,'00:00:05: A1F');
 writeDs3231(s,[0x0f,0x08],7e6);assert.equal(read(s,0x0f,1,7e6)[0]&3,0);
 assert.equal(read(s,0x0f,1,62e6)[0]&3,2,'00:01:00: A2F');
});

test('AT24C32: 12-bit word address, writes wrap inside a 32-byte page, sequential reads wrap at 4 KB',()=>{
 const e=resetEeprom();
 writeEeprom(e,[0x0f,0xfe,1,2,3,4]);writeEeprom(e,[0x0f,0xfe]);
 assert.deepEqual(readEeprom(e,4),[1,2,0xff,0xff],'0FFE, 0FFF then 1000 wraps to 0000 (erased)');
 writeEeprom(e,[0x0f,0xe0]);assert.deepEqual(readEeprom(e,2),[3,4],'page wrap: 3 and 4 went to 0FE0 and 0FE1');
});

test('ZS-042 module: the left 6-pin header, 0x68 clock and 0x57 EEPROM, the Docs example prints date, time and temperature',()=>{
 const type=catalogType('ds3231-zs042-10');
 assert.deepEqual(CATALOG_DEFS[type].labels,['32K','SQW','SCL','SDA','VCC','GND']);
 // The header pins stand two holes (5 mm) left of the board's header holes: drawn as legs out of the board.
 assert.ok(CATALOG_DEFS[type].terminals.every(([x])=>x===-119)&&CATALOG_DEFS[type].body.width===210);
 const project=catalogExample(type,()=>{throw new Error('own example');});
 const part=project.components.find(p=>p.type===type);part.temperature=31.75;
 const out=[],session=new SimulationSession(project,{print:s=>out.push(String(s))});
 for(let t=50;t<=2100;t+=50)session.tick(t);
 const lines=out.join('\n').split('\n').filter(l=>/^20\d\d-/.test(l));
 assert.ok(lines.length>=2,out.join('\n'));
 assert.match(lines[0],/^20\d\d-\d\d-\d\d \d\d:\d\d:\d\d {2}31\.75 C$/);
 const now=new Date(),y=now.getFullYear();assert.ok(lines[0].startsWith(String(y))||lines[0].startsWith(String(y-1)),'the PC date');
 // Both addresses answer on the same SDA/SCL.
 assert.equal(session.buses.i2cTarget(0x68).connected,true);assert.equal(session.buses.i2cTarget(0x57).connected,true);
 assert.equal(session.buses.i2cTarget(0x50).part,undefined);
 assert.ok(ds3231Time(session.buses.devices.state(session.buses.project.components.find(p=>p.catalogVariant==='ds3231-zs042-10')).rtc,2e6)>0);
});

test('a 1.27.0 project with wires and pins on the removed right pins (p7..p10) opens with them on the left pins of the same signal',()=>{
 const project=catalogExample(catalogType('ds3231-zs042-10'),()=>{throw new Error('own example');});
 const part=project.components.find(p=>p.type==='ref_ds3231_zs042_10');
 const old=structuredClone(project);
 // 1.27.0: SCL wired at the right pin p7 instead of p3, and the right VCC (p9) wired to the left VCC (p5).
 const pin=k=>`part:${part.id}:${k}`,scl=old.wires.find(w=>w.from===pin('p3')||w.to===pin('p3'));
 if(scl.from===pin('p3'))scl.from=pin('p7');else scl.to=pin('p7');
 old.wires.push({id:'bridge',from:pin('p9'),to:pin('p5'),color:'#23a68a'});
 const clean=validateProject(old),w=clean.wires.find(x=>x.id===scl.id);
 assert.ok([w.from,w.to].includes(pin('p3')),JSON.stringify(w));
 assert.equal(clean.wires.find(x=>x.id==='bridge'),undefined,'a wire between a removed pin and its own left pin disappears');
 assert.ok(!clean.wires.some(x=>/:p(7|8|9|10)$/.test(x.from)||/:p(7|8|9|10)$/.test(x.to)));
});
