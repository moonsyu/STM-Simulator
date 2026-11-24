// What goes beyond two modules in the circuit: loss on the air, ESP-01 transparent mode, the phone and the router's PC.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {WirelessHub,ROUTER,PC} from '../../src/wireless.js';

function bench(modules){
 const session={project:{components:modules.map(([id,variant,part={}])=>({id,type:'wireless',catalogVariant:variant,name:id,baud:variant==='esp01-wifi-8'?115200:9600,role:'slave',btPin:'1234',...part}))},buses:{trace(){}},sent:{},wirelessRx(module,frames){(this.sent[module.id]??=[]).push(...frames.map(f=>String.fromCharCode(f.value)));}};
 const hub=new WirelessHub(session),result={fault:false,parts:{},voltage:id=>{const [,part,pin]=id.split(':');return pin==='p5'&&session.project.components.find(p=>p.id===part).catalogVariant==='hc05-bluetooth-6'?0:({p1:3.3,p2:0,p5:3.3,p6:3.3})[pin];}};let now=0;
 const advance=us=>{for(let i=0;i<us;i+=1000){now+=1000;hub.advance(now,result,session);}};
 const send=(id,text)=>{const m=hub.modules.get(id)??hub.module(session.project.components.find(p=>p.id===id));hub.transmit([...text].map((c,i)=>({value:c.charCodeAt(0),at:now+i})),m.uartBaud,x=>x===id);};
 const take=id=>{const t=(session.sent[id]??[]).join('');session.sent[id]=[];return t;};
 const at=(id,line,us=2000)=>{send(id,line+'\r\n');advance(us);return take(id);};
 advance(400000);return {hub,session,advance,send,take,at,now:()=>now};
}
const joined=()=>{const b=bench([['w','esp01-wifi-8']]);b.take('w');b.at('w','ATE0');assert.match(b.at('w','AT+CWLAP'),new RegExp(ROUTER.ssid));
 b.send('w','AT+CWJAP="'+ROUTER.ssid+'","'+ROUTER.pwd+'"\r\n');b.advance(1600000);assert.match(b.take('w'),/WIFI GOT IP/);return b;};

describe('the router and the PC',()=>{
 test('a wrong password is refused; the right one gets a 192.168.1.x address',()=>{
  const b=bench([['w','esp01-wifi-8']]);b.at('w','ATE0');b.send('w','AT+CWJAP="'+ROUTER.ssid+'","nope"\r\n');b.advance(1600000);assert.match(b.take('w'),/\+CWJAP:2/);
  const c=joined();assert.match(c.at('w','AT+CIFSR'),/STAIP,"192\.168\.1\.2"/);
 });
 test('TCP to the PC in both directions, with +IPD on the module',()=>{
  const b=joined();b.send('w','AT+CIPSTART="TCP","'+PC.ip+'",'+PC.port+'\r\n');b.advance(60000);assert.match(b.take('w'),/CONNECT/);
  b.send('w','AT+CIPSEND=2\r\n');b.advance(2000);b.send('w','hi');b.advance(10000);assert.equal(b.hub.outsideOutput('pc'),'hi');
  b.take('w');assert.equal(b.hub.outsideInput('pc','yo',b.now()),2);b.advance(10000);assert.match(b.take('w'),/\+IPD,2:yo/);
 });
 test('the PC connects to a server on the router when it first sends',()=>{
  const b=joined();b.at('w','AT+CIPMUX=1');b.at('w','AT+CIPSERVER=1,333');b.take('w');
  assert.equal(b.hub.outsideInput('pc','abc',b.now()),3);b.advance(70000);const t=b.take('w');assert.match(t,/0,CONNECT/);assert.match(t,/\+IPD,0,3:abc/);
 });
 test('without a connection or a server there is nobody to send to',()=>{const b=joined();assert.equal(b.hub.outsideInput('pc','x',b.now()),0);});
});
describe('ESP-01 transparent mode',()=>{
 const through=()=>{const b=joined();b.send('w','AT+CIPSTART="TCP","'+PC.ip+'",'+PC.port+'\r\n');b.advance(60000);assert.match(b.at('w','AT+CIPMODE=1'),/OK/);assert.match(b.at('w','AT+CIPSEND'),/>/);b.take('w');return b;};
 test('bytes go out without AT+CIPSEND, come back without +IPD, and +++ ends it',()=>{
  const b=through();b.send('w','hello');b.advance(5000);assert.equal(b.hub.outsideOutput('pc'),'','held until the line stays quiet');b.advance(30000);assert.equal(b.hub.outsideOutput('pc'),'hello');
  b.hub.outsideInput('pc','back',b.now());b.advance(10000);assert.equal(b.take('w'),'back');
  b.send('w','+++');b.advance(40000);assert.equal(b.hub.outsideOutput('pc'),'hello','+++ is not sent');
  assert.match(b.at('w','AT'),/OK/,'AT commands work again');
 });
 test('needs a single connection: AT+CIPMUX=1 refuses it',()=>{const b=joined();b.at('w','AT+CIPMUX=1');assert.match(b.at('w','AT+CIPMODE=1'),/ERROR/);});
});
describe('a phone on a Bluetooth module',()=>{
 test('it pairs on the first send, STATE-wise linked, and both directions work',()=>{
  const b=bench([['bt','hc06-bluetooth-4']]);assert.equal(b.hub.outsideInput('phone:bt','hi',b.now()),2);
  const m=b.hub.modules.get('bt');assert.equal(m.peer,b.hub.phone);b.advance(1600000);assert.equal(b.take('bt'),'hi');
  b.send('bt','ok');b.advance(30000);assert.equal(b.hub.outsideOutput('phone:bt'),'ok');
 });
 test('a module paired with another one, or a master, refuses the phone',()=>{
  const b=bench([['a','hc05-bluetooth-6',{role:'master'}]]);assert.throws(()=>b.hub.outsideInput('phone:a','x',b.now()),/마스터/);
  const c=bench([['m','hc05-bluetooth-6',{role:'master'}],['s','hc06-bluetooth-4']]);c.advance(1600000);assert.throws(()=>c.hub.outsideInput('phone:s','x',c.now()),/연결되어/);
 });
});
describe('loss on the air',()=>{
 const pair=(airLoss)=>{const b=bench([['m','hc05-bluetooth-6',{role:'master',airLoss}],['s','hc06-bluetooth-4']]);b.advance(1600000);return b;};
 test('0 % is the fixed delay; a lossy link still delivers in order, later',()=>{
  const last=b=>{let end=0;const rx=b.session.wirelessRx.bind(b.session);b.session.wirelessRx=(m,frames,baud)=>{end=Math.max(end,...frames.map(f=>f.at));rx(m,frames,baud);};const start=b.now();b.send('m','abcdef');b.advance(1000);return end-start;};
  const clean=pair(0),quick=last(clean);assert.equal(clean.take('s'),'abcdef');
  const lossy=pair(50),slow=last(lossy);assert.equal(lossy.take('s'),'abcdef');assert.ok(slow>quick+20000,`${slow} > ${quick}`);
 });
 test('100 % loses everything, and says so',()=>{
  const notes=[];const b=pair(100);b.session.buses.trace=e=>notes.push(e.message);b.send('m','x');b.advance(50000);assert.equal(b.take('s'),'');assert.match(notes.join(),/손실/);
 });
 test('UDP is not retried: a lossy link drops datagrams and the same run repeats',()=>{
  const run=()=>{const b=joined();b.hub.modules.get('w').part.airLoss=50;b.send('w','AT+CIPSTART="UDP","'+PC.ip+'",'+PC.port+'\r\n');b.advance(3000);for(let i=0;i<40;i++){b.send('w','AT+CIPSEND=1\r\n');b.advance(1000);b.send('w','u');b.advance(2000);}return b.hub.outsideOutput('pc').length;};
  const got=run();assert.ok(got>5&&got<35,String(got));assert.equal(run(),got);
 });
});
