// The internet behind the router: an MQTT broker and a web server, reached from an ESP-01 (AT) and an ESP32 sketch.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {WirelessHub,ROUTER,INTERNET,topicMatches} from '../../src/wireless.js';
import {applyLectureExample} from '../../src/lecture-examples.js';
import {SimulationSession} from '../../src/session.js';
import {createBoardDrivers} from '../../src/fixed-run.js';
import {connectStm32Drivers} from '../../src/stm32-boards.js';

function esp01(){
 const session={project:{components:[{id:'w',type:'wireless',catalogVariant:'esp01-wifi-8',name:'w',baud:115200}]},buses:{trace(){}},sent:[],wirelessRx(m,frames){this.sent.push(...frames.map(f=>f.value));}};
 const hub=new WirelessHub(session),result={fault:false,parts:{},voltage:id=>({p1:3.3,p2:0,p5:3.3,p6:3.3})[id.split(':')[2]]};let now=0;
 const advance=us=>{for(let i=0;i<us;i+=1000){now+=1000;hub.advance(now,result,session);}};
 const send=bytes=>{const m=hub.module(session.project.components[0]);hub.transmit([...bytes].map((v,i)=>({value:typeof v==='string'?v.charCodeAt(0):v,at:now+i})),m.uartBaud,()=>true);};
 const take=()=>{const b=session.sent.splice(0);return {text:new TextDecoder().decode(new Uint8Array(b)),bytes:b};};
 const at=(line,us=3000)=>{send([...line+'\r\n']);advance(us);return take().text;};
 advance(400000);take();at('ATE0');send([...'AT+CWJAP="'+ROUTER.ssid+'","'+ROUTER.pwd+'"\r\n']);advance(1600000);take();
 return {hub,send,take,at,advance};
}
describe('internet hosts behind the router',()=>{
 test('MQTT topic filters: + one level, # the rest',()=>{
  assert.ok(topicMatches('stm/+/led','stm/a/led'));assert.ok(topicMatches('stm/#','stm/a/b'));assert.ok(!topicMatches('stm/+','stm/a/b'));assert.ok(topicMatches('stm/led','stm/led'));
 });
 test('ESP-01: the name resolves, an HTTP GET gets JSON, and the server closes the connection',()=>{
  const e=esp01();assert.match(e.at('AT+CIPDOMAIN="'+INTERNET.web.name+'"'),/203\.0\.113\.20/);
  assert.match(e.at('AT+CIPSTART="TCP","'+INTERNET.web.name+'",80',80000),/CONNECT/);
  const req='GET /led?state=on HTTP/1.1\r\nHost: '+INTERNET.web.name+'\r\n\r\n';
  e.at('AT+CIPSEND='+req.length);e.send([...req]);e.advance(120000);const t=e.take().text;
  assert.match(t,/\+IPD,\d+:HTTP\/1\.1 200 OK/);assert.match(t,/"led":"on"/);assert.match(t,/CLOSED/);
  assert.match(e.hub.outsideOutput('web'),/GET \/led\?state=on → 200/);
 });
 test('ESP-01: raw MQTT packets: CONNECT gets CONNACK, a subscription receives what the monitor publishes',()=>{
  const e=esp01();e.at('AT+CIPSTART="TCP","'+INTERNET.broker.name+'",1883',80000);
  const str=s=>[s.length>>8,s.length&255,...[...s].map(c=>c.charCodeAt(0))];
  const connect=[0x10,...(b=>[b.length,...b])([...str('MQTT'),4,2,0,60,...str('a1')])],subscribe=[0x82,...(b=>[b.length,...b])([0,1,...str('stm/#'),0])];
  for(const packet of [connect,subscribe]){e.at('AT+CIPSEND='+packet.length);e.send(packet);e.advance(100000);}
  const got=e.take().bytes;assert.ok(got.includes(0x20)&&got.includes(0x90),JSON.stringify(got));
  assert.equal(e.hub.outsideInput('broker','stm/led hello',0),13);e.advance(100000);assert.match(e.take().text,/stm\/led.*hello/);
  assert.throws(()=>e.hub.outsideInput('broker','nospace'),/토픽 메시지/);
 });
 test('without joining the router the internet is not there',()=>{
  const session={project:{components:[{id:'w',type:'wireless',catalogVariant:'esp01-wifi-8',name:'w',baud:115200}]},buses:{trace(){}},wirelessRx(){}};
  const hub=new WirelessHub(session);hub.module(session.project.components[0]).joined=null;assert.equal(hub.module(session.project.components[0]).resolve(INTERNET.web.name),null);
 });
});
describe('WF-03: an ESP32 sketch with HTTPClient and PubSubClient',()=>{
 test('it joins the router, reads the time, subscribes, follows stm/led and reports on stm/status',()=>{
  const {project}=applyLectureExample('wireless-internet-esp32'),out=[];
  const session=new SimulationSession({...project,code:'void setup(){}\nvoid loop(){delay(10);}',firmware:{mode:'sketch',files:[]}},{print:()=>{}});
  session.circuit.drivers=createBoardDrivers(project,{log:t=>out.push(t)});connectStm32Drivers(session);session.tick(0);
  for(let t=20;t<=6000;t+=20){session.tick(t);if(t===3000)session.wireless.outsideInput('broker','stm/led 1',t*1000);}
  const text=out.join('\n');
  assert.match(text,/192\.168\.1\.\d+/);assert.match(text,/HTTP 200/);assert.match(text,/"seconds"/);assert.match(text,/MQTT connected/);assert.match(text,/stm\/led: 1/);
  assert.ok(session.circuit.drivers[0].runtime.gpio.GPIO2?.value>0,'LED on');
  assert.match(session.wireless.outsideOutput('broker'),/esp32-lab → stm\/status: LED ON/);
 });
});
