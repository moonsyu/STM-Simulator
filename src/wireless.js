// Wireless UART modules: HC-05 / HC-06 Bluetooth SPP and the ESP-01 with ESP8266 AT firmware. A board talks to its module
// over a real UART (same net, same baud); what crosses the air is modelled at message level: no radio physics, only a
// loss rate set on the module. Outside the circuit there are a phone (Bluetooth), a router with a PC on it (Wi-Fi), and
// behind the router an MQTT broker and a web server (broker.stm-lab.test, api.stm-lab.test).
// ESP32 sketches join the same air with BluetoothSerial and WiFi (Esp32Bluetooth, Esp32Wifi).
// Facts come from the HC Serial Bluetooth manual, the HC-05 importer datasheet, the Ai-Thinker ESP-01 datasheet and the
// Espressif ESP8266 AT command reference (docs/device-visual-references.json lists them).
//
// Model terminals of every module: p1 VCC, p2 GND, p3 TXD, p4 RXD, then p5 EN / CH_PD, p6 STATE / RST.
const LINE='\r\n';
const AIR_US={bluetooth:20000,wifi:5000};
const PAIR_US=1500000,JOIN_US=1500000,BOOT_US=300000,TCP_US=50000;
// HC-06: "the command of HC-06 end or not is determined by the time interval" and at most one command per second.
const HC06_GAP_US=500000;
// Link-layer retries of what may not get lost (Bluetooth, TCP); UDP is just gone. ESP8266 transparent mode sends after this much quiet.
const RETRIES=7,THROUGH_QUIET_US=20000,THROUGH_MAX=2048;
export const ROUTER={ssid:'STM-Router',pwd:'stm32-router',ip:'192.168.1.1'},PC={ip:'192.168.1.100',port:8080};
// The internet behind the router (documentation addresses, RFC 5737): it answers a little later than the local network.
export const INTERNET={broker:{name:'broker.stm-lab.test',ip:'203.0.113.10',port:1883},web:{name:'api.stm-lab.test',ip:'203.0.113.20',port:80}};
const INTERNET_US=20000;
const HC06_BAUDS={1:1200,2:2400,3:4800,4:9600,5:19200,6:38400,7:57600,8:115200,9:230400,A:460800,B:921600,C:1382400};
const BT_ADDRESSES=[['98d3','31','f5a1b2'],['98d3','31','f5a1b3'],['98d3','31','f5a1b4'],['98d3','31','f5a1b5']];
export const WIRELESS_DEFAULTS={
 'hc05-bluetooth-6':{baud:9600,role:'slave',btPin:'1234'},
 'hc06-bluetooth-4':{baud:9600,btPin:'1234'},
 'esp01-wifi-8':{baud:115200}
};
export const WIRELESS_BAUDS=[1200,2400,4800,9600,19200,38400,57600,115200];
const high=v=>v!=null&&v>=2;

class Module{
 constructor(hub,part){this.hub=hub;this.part=part;this.id=part.id;this.name=part.name||part.id;this.baud=part.baud;this.powered=false;this.txFree=0;this.input='';}
 say(text,at){this.hub.emit(this,[...text].map(c=>c.charCodeAt(0)&255),at);}
 volts(result){const v=result.voltage(`part:${this.id}:p1`),g=result.voltage(`part:${this.id}:p2`);return v==null||g==null||g>=.1?0:v-g;}
 pin(result,n){return result.voltage(`part:${this.id}:p${n}`);}
 get uartBaud(){return this.baud;}
}

// ---------------------------------------------------------------- Bluetooth
class Bluetooth extends Module{
 constructor(hub,part,index){
  super(hub,part);this.hc05=part.catalogVariant==='hc05-bluetooth-6';this.kind='bluetooth';
  this.role=this.hc05?part.role??'slave':'slave';this.btPin=String(part.btPin??'1234');this.btName=this.hc05?'HC-05':'HC-06';this.cmode=1;this.bind='';
  this.address=BT_ADDRESSES[index%BT_ADDRESSES.length];this.peer=null;this.at=false;this.at38400=false;this.pairAt=null;this.lastByte=0;
 }
 get addressText(){return this.address.join(':');}
 get uartBaud(){return this.hc05&&this.at&&this.at38400?38400:this.baud;}
 // Slaves wait; only a master searches. Both ends need the same PIN (manual: master + slave, "the password must be correct").
 get searching(){return this.powered&&this.hc05&&this.role==='master'&&!this.peer&&!this.at38400&&!this.at;}
 get discoverable(){return this.powered&&this.role==='slave'&&!this.peer&&!this.at38400;}
 matches(slave){return (slave.anyPin||slave.btPin===this.btPin)&&(this.cmode===1||this.bind===slave.address.join(','));}
 update(us,result){
  const volts=this.volts(result),on=volts>=3.3&&volts<=6;
  if(on&&!this.powered&&this.hc05)this.at38400=high(this.pin(result,5));
  if(!on&&this.powered)this.disconnect(us,'전원 꺼짐');
  this.powered=on;if(!on){this.at=false;this.pairAt=null;this.input='';return;}
  if(this.hc05){const at=high(this.pin(result,5));if(at!==this.at){this.at=at;this.input='';if(!at)this.at38400=false;}}
  if(!this.hc05&&this.input&&us-this.lastByte>=HC06_GAP_US){const line=this.input;this.input='';if(!this.peer)this.hc06Command(line,us);}
  if(this.searching){
   const slave=this.hub.bluetooth().find(m=>m!==this&&m.discoverable&&this.matches(m));
   if(!slave)this.pairAt=null;else if(this.pairAt==null)this.pairAt=us+PAIR_US;else if(us>=this.pairAt){this.pairAt=null;this.peer=slave;slave.peer=this;this.hub.note('Bluetooth',us,`${this.name} ↔ ${slave.name} 연결`);}
  }else this.pairAt=null;
 }
 disconnect(us,why){const peer=this.peer;if(!peer)return;this.peer=null;peer.peer=null;this.hub.note('Bluetooth',us,`${this.name} ↔ ${peer.name} 연결 끊김 · ${why}`);}
 receive(frames){
  for(const {value,at}of frames){
   if(this.hc05&&this.at){this.input+=String.fromCharCode(value);if(this.input.endsWith(LINE)){const line=this.input.slice(0,-2);this.input='';this.hc05Command(line,at);}else if(this.input.length>128)this.input='';continue;}
   if(this.peer){const delay=this.hub.air(this,AIR_US.bluetooth,true);if(delay!=null)this.hub.emit(this.peer,[value],at+delay);else this.hub.note('Bluetooth',at,`${this.name}: 재전송 ${RETRIES}회 실패 · 1 B 손실`);continue;}
   // Before pairing an HC-06 reads AT commands; a master or slave HC-05 in communication mode drops what it cannot send.
   if(!this.hc05){this.input=(this.input+String.fromCharCode(value)).slice(-64);this.lastByte=at;}
  }
  if(this.peer&&frames.length&&!(this.hc05&&this.at))this.hub.note('Bluetooth',frames.at(-1).at,`${this.name} → ${this.peer.name} ${frames.length} B`);
 }
 // No terminator; the reply follows at once (the module has no OK for anything else).
 hc06Command(line,us){
  const reply=text=>this.say(text,us),m=/^AT(?:\+(VERSION|NAME|PIN|BAUD)(.*))?$/.exec(line);if(!m)return;
  if(!m[1])return reply('OK');
  if(m[1]==='VERSION')return reply('OKlinvorV1.8');
  if(m[1]==='NAME'){if(m[2].length<1||m[2].length>20)return;this.btName=m[2];return reply('OKsetname');}
  if(m[1]==='PIN'){if(!/^\d{4}$/.test(m[2]))return;this.btPin=m[2];return reply('OKsetPIN');}
  const baud=HC06_BAUDS[m[2]];if(!baud)return;reply('OK'+baud);this.baud=baud;
 }
 hc05Command(line,at){
  const ok=(...lines)=>this.say(lines.map(l=>l+LINE).join('')+'OK'+LINE,at),error=code=>this.say(`ERROR:(${code})${LINE}`,at);
  const m=/^AT(?:\+([A-Z]+)(\?|=(.*))?)?$/i.exec(line.trim());if(!m)return error(0);
  const cmd=(m[1]||'').toUpperCase(),query=m[2]==='?',value=m[3];
  if(!cmd)return ok();
  if(cmd==='RESET'||cmd==='ORGL'){
   if(cmd==='ORGL'){Object.assign(this,{role:'slave',btPin:'1234',btName:'HC-05',cmode:1,bind:'',baud:38400});}
   ok();this.disconnect(at,'모듈 재시작');return;
  }
  if(cmd==='VERSION'&&query)return ok('+VERSION:2.0-20100601');
  if(cmd==='ADDR'&&query)return ok('+ADDR:'+this.addressText);
  if(cmd==='STATE'&&query)return ok('+STATE:'+(this.peer?'CONNECTED':this.pairAt!=null?'PAIRING':this.at38400?'INITIALIZED':'PAIRABLE'));
  if(cmd==='NAME'){if(query)return ok('+NAME:'+this.btName);if(!value||value.length>32)return error(4);this.btName=value;return ok();}
  if(cmd==='PSWD'){if(query)return ok('+PSWD:'+this.btPin);const pin=value?.replace(/"/g,'');if(!/^\d{4}$/.test(pin||''))return error(5);this.btPin=pin;return ok();}
  if(cmd==='ROLE'){if(query)return ok('+ROLE:'+(this.role==='master'?1:0));if(!['0','1'].includes(value))return error(6);this.role=value==='1'?'master':'slave';return ok();}
  if(cmd==='CMODE'){if(query)return ok('+CMODE:'+this.cmode);if(!['0','1'].includes(value))return error(6);this.cmode=Number(value);return ok();}
  if(cmd==='BIND'){if(query)return ok('+BIND:'+(this.bind||'0:0:0').replace(/,/g,':'));if(!/^[0-9a-f]{1,4},[0-9a-f]{1,2},[0-9a-f]{1,6}$/i.test(value||''))return error(6);this.bind=value.toLowerCase();return ok();}
  if(cmd==='UART'){
   if(query)return ok(`+UART:${this.baud},0,0`);
   const [baud,stop,parity]=(value||'').split(',').map(Number);if(!WIRELESS_BAUDS.includes(baud)||stop!==0||parity!==0)return error(7);
   ok();this.baud=baud;return;
  }
  return error(0);
 }
 status(){
  const name=this.hc05?(this.role==='master'?'마스터':'슬레이브'):'슬레이브';
  if(!this.powered)return '전원과 GND를 확인하세요. (VCC 3.3~6 V)';
  if(this.hc05&&this.at)return `AT 명령 모드 · ${this.uartBaud} baud · ${name}${this.peer?` · ${this.peer.name}와 연결 유지`:''}`;
  if(this.peer)return `연결됨 · ${this.peer.name} · ${this.uartBaud} baud · ${name}`;
  return `연결 대기 · ${this.uartBaud} baud · ${name}${this.pairAt!=null?' · 상대를 찾아 페어링 중':this.searching?' · PIN이 같은 슬레이브를 찾는 중':''}`;
 }
}

// ---------------------------------------------------------------- Wi-Fi (ESP8266 AT firmware)
const q=s=>`"${s}"`;
class Wifi extends Module{
 constructor(hub,part,index){
  super(hub,part);this.kind='wifi';this.index=index;this.apMac=`1a:fe:34:00:00:${(index*2+1).toString(16).padStart(2,'0')}`;this.staMac=`18:fe:34:00:00:${(index*2+1).toString(16).padStart(2,'0')}`;
  this.reset();
 }
 reset(){this.enabled=false;this.bootAt=null;this.echo=true;this.mode=1;this.ap=null;this.joined=null;this.ip=null;this.mux=0;this.server=null;this.links=[];this.sending=null;this.input='';this.clients=0;this.cipmode=0;this.through=null;this.held=[];this.heldAt=0;this.flushing=false;}
 update(us,result){
  const volts=this.volts(result),inRange=volts>=3&&volts<=3.6;
  if(volts>3.6&&!this.overvolted){this.overvolted=true;this.hub.note('Wi-Fi',us,`${this.name}: VCC ${volts.toFixed(1)} V · ESP-01은 3.0~3.6 V 전용입니다. 3.3 V에 연결하세요.`);}
  if(volts<=3.6)this.overvolted=false;
  this.powered=inRange;
  // CH_PD is active high with no pull-up on the module; RST idles high and resets when pulled low.
  const rst=this.pin(result,6),on=inRange&&high(this.pin(result,5))&&!(rst!=null&&rst<.8);
  if(on&&!this.enabled&&this.bootAt==null)this.bootAt=us+BOOT_US;
  if(!on&&(this.enabled||this.bootAt!=null))this.powerDown(us);
  if(this.bootAt!=null&&us>=this.bootAt){this.bootAt=null;this.enabled=true;this.say('ready'+LINE,us);}
 }
 powerDown(us){for(const l of [...this.links])this.dropLink(l,us,false);this.reset();this.baud=this.part.baud;this.hub.wifi().filter(m=>m.joined===this).forEach(m=>{m.joined=null;m.ip=null;if(m.enabled)m.say('WIFI DISCONNECT'+LINE,us);for(const l of [...m.links])m.dropLink(l,us,false);});}
 receive(frames){
  if(!this.enabled)return;
  for(const {value,at}of frames){
   if(this.through){this.held.push(value);this.heldAt=at;if(!this.flushing){this.flushing=true;this.hub.after(at+THROUGH_QUIET_US,us=>this.flushThrough(us));}continue;}
   if(this.sending){this.sending.data.push(value);if(this.sending.data.length>=this.sending.length){const s=this.sending;this.sending=null;this.finishSend(s,at);}continue;}
   if(this.echo)this.say(String.fromCharCode(value),at);
   this.input+=String.fromCharCode(value);
   if(this.input.endsWith(LINE)){const line=this.input.slice(0,-2);this.input='';this.command(line,at);}else if(this.input.length>256)this.input='';
  }
 }
 ok(at,...lines){this.say(lines.map(l=>l+LINE).join('')+LINE+'OK'+LINE,at);}
 error(at,why){if(why)this.hub.note('Wi-Fi',at,`${this.name}: ${why}`);this.say('ERROR'+LINE,at);}
 args(text){return [...String(text??'').matchAll(/"([^"]*)"|([^,]+)/g)].map(m=>m[1]??m[2]);}
 command(raw,at){
  const line=raw.trim();
  if(line==='AT')return this.ok(at);
  if(line==='ATE0'){this.echo=false;return this.ok(at);}
  if(line==='ATE1'){this.echo=true;return this.ok(at);}
  const m=/^AT\+([A-Z_]+)(\?|=(.*))?$/.exec(line);if(!m)return this.error(at,line?`지원하지 않는 AT 명령: ${line}`:'');
  const cmd=m[1],query=m[2]==='?',a=this.args(m[3]);
  switch(cmd){
   case 'RST':this.ok(at);this.powerDown(at);this.bootAt=at+BOOT_US;return;
   case 'GMR':return this.ok(at,'AT version:2.2.0.0(simulated)','SDK version:v3.4','compile time:simulated','Bin version:2.2.0(1MB)');
   case 'UART_CUR':case 'UART_DEF':{const baud=Number(a[0]);if(!WIRELESS_BAUDS.includes(baud))return this.error(at,`지원하지 않는 속도: ${a[0]}`);this.ok(at);this.baud=baud;return;}
   case 'CWMODE':case 'CWMODE_CUR':case 'CWMODE_DEF':{if(query)return this.ok(at,'+CWMODE:'+this.mode);const mode=Number(a[0]);if(![0,1,2,3].includes(mode))return this.error(at);this.mode=mode;if(!(mode&2))this.ap=null;return this.ok(at);}
   case 'CWSAP':case 'CWSAP_CUR':case 'CWSAP_DEF':{
    if(query)return this.ap?this.ok(at,`+CWSAP:${q(this.ap.ssid)},${q(this.ap.pwd)},${this.ap.channel},${this.ap.ecn},4,0`):this.error(at);
    if(!(this.mode&2))return this.error(at,'AT+CWSAP는 AT+CWMODE=2 또는 3에서만 됩니다.');
    const [ssid,pwd,channel,ecn]=a,e=Number(ecn);if(!ssid||![0,2,3,4].includes(e)||e&&(pwd.length<8||pwd.length>64))return this.error(at,'AT+CWSAP 값 오류 · 암호는 8~64자, ecn은 0/2/3/4입니다.');
    this.ap={ssid,pwd:e?pwd:'',channel:Number(channel)||1,ecn:e};return this.ok(at);
   }
   case 'CWLAP':return this.ok(at,...[...this.hub.wifi().filter(w=>w!==this&&w.enabled&&w.ap),this.hub.router].map((w,i)=>`+CWLAP:(${w.ap.ecn},${q(w.ap.ssid)},${-40-i*5},${q(w.apMac)},${w.ap.channel})`));
   case 'CWJAP':case 'CWJAP_CUR':case 'CWJAP_DEF':{
    if(query)return this.joined?this.ok(at,`+CWJAP:${q(this.joined.ap.ssid)},${q(this.joined.apMac)},${this.joined.ap.channel},-40`):this.ok(at,'No AP');
    if(!(this.mode&1))return this.error(at,'AT+CWJAP는 AT+CWMODE=1 또는 3에서만 됩니다.');
    const [ssid,pwd='']=a;this.hub.after(at+JOIN_US,us=>this.join(ssid,pwd,us));return;
   }
   case 'CWQAP':this.leave(at);return this.ok(at);
   case 'CIFSR':return this.ok(at,...(this.ap?[`+CIFSR:APIP,${q('192.168.4.1')}`,`+CIFSR:APMAC,${q(this.apMac)}`]:[]),...(this.mode&1?[`+CIFSR:STAIP,${q(this.ip??'0.0.0.0')}`,`+CIFSR:STAMAC,${q(this.staMac)}`]:[]));
   case 'CIPMUX':{if(query)return this.ok(at,'+CIPMUX:'+this.mux);if(this.links.length)return this.error(at,'연결이 열려 있으면 AT+CIPMUX를 바꿀 수 없습니다.');if(this.server)return this.error(at,'서버가 열려 있으면 AT+CIPMUX를 바꿀 수 없습니다.');const mux=Number(a[0]);if(![0,1].includes(mux))return this.error(at);this.mux=mux;return this.ok(at);}
   case 'CIPMODE':{if(query)return this.ok(at,'+CIPMODE:'+this.cipmode);const mode=Number(a[0]);if(![0,1].includes(mode))return this.error(at);if(mode&&this.mux)return this.error(at,'패스스루(AT+CIPMODE=1)는 AT+CIPMUX=0에서만 됩니다.');this.cipmode=mode;return this.ok(at);}
   case 'CIPSERVER':{
    if(!this.mux)return this.error(at,'AT+CIPSERVER는 AT+CIPMUX=1 다음에 사용합니다.');
    if(a[0]==='0'){this.server=null;return this.ok(at);}
    if(a[0]!=='1')return this.error(at);this.server={port:Number(a[1]??333)};return this.ok(at);
   }
   case 'CIPSTART':return this.connect(a,at);
   case 'CIPDOMAIN':{const h=this.joined===this.hub.router&&this.hub.internetHost(a[0]);return h?this.ok(at,`+CIPDOMAIN:${h.ip}`):this.error(at,`이름을 찾을 수 없습니다: ${a[0]} (공유기 STM-Router에 접속해야 인터넷 이름을 찾습니다)`);}
   case 'CIPSTATUS':return this.ok(at,`STATUS:${this.links.length?3:this.ip||this.ap?2:5}`,...this.links.map(l=>`+CIPSTATUS:${l.id},${q(l.type)},${q(l.host)},${l.port},${l.localPort},${l.server?1:0}`));
   case 'CIPSEND':return this.beginSend(a,at);
   case 'CIPCLOSE':{const id=this.mux?Number(a[0]):0;const link=this.links.find(l=>l.id===id);if(!link)return this.error(at);this.dropLink(link,at,true);return this.ok(at);}
   default:return this.error(at,`지원하지 않는 AT 명령: AT+${cmd}`);
  }
 }
 join(ssid,pwd,us){
  if(!this.enabled)return;
  const host=ssid===this.hub.router.ap.ssid?this.hub.router:this.hub.wifi().find(w=>w!==this&&w.enabled&&w.ap?.ssid===ssid);
  if(!host)return this.say(`+CWJAP:3${LINE}${LINE}ERROR${LINE}`,us);
  if(host.ap.ecn&&host.ap.pwd!==pwd)return this.say(`+CWJAP:2${LINE}${LINE}ERROR${LINE}`,us);
  this.leave(us);this.joined=host;this.ip=`${host.subnet??'192.168.4'}.${++host.clients+1}`;this.hub.note('Wi-Fi',us,`${this.name} → ${host.name} AP ${q(ssid)} 접속 · ${this.ip}`);
  this.say(`WIFI CONNECTED${LINE}WIFI GOT IP${LINE}${LINE}OK${LINE}`,us);
 }
 leave(us){if(!this.joined)return;this.joined=null;this.ip=null;for(const l of [...this.links])this.dropLink(l,us,true);}
 // The module answering on an address of this module's network: the AP at .1, stations at their leased address.
 resolve(host){
  const net=this.joined??(this.ap?this:null);if(!net)return null;
  if(net===this.hub.router){if(host===PC.ip)return this.hub.pc;const out=this.hub.internetHost(host);if(out)return out;}
  if(host==='192.168.4.1')return net===this?null:net;
  return this.hub.wifi().find(w=>w!==this&&w.joined===net&&w.ip===host)??null;
 }
 freeId(){for(let id=0;id<5;id++)if(!this.links.some(l=>l.id===id))return id;return -1;}
 connect(a,at){
  const args=this.mux?a.slice(1):a,id=this.mux?Number(a[0]):0,[type,host,portText,localText]=args,port=Number(portText);
  if(!['TCP','UDP'].includes(type))return this.error(at,`지원하지 않는 연결 종류: ${type}`);
  if(!Number.isInteger(id)||id<0||id>4||!Number.isInteger(port))return this.error(at);
  if(this.links.some(l=>l.id===id)){this.say('ALREADY CONNECTED'+LINE+LINE+'ERROR'+LINE,at);return;}
  if(!this.ip&&!this.ap)return this.error(at,'AP에 접속한 다음(AT+CWJAP) 또는 AP를 연 다음(AT+CWSAP) 연결하세요.');
  const remote=this.resolve(host);
  if(type==='UDP'){
   const link={id,type,host,port,localPort:Number(localText)||1024+this.freeId(),remote:null,server:false};this.links.push(link);
   this.say((this.mux?`${id},`:'')+'CONNECT'+LINE+LINE+'OK'+LINE,at);return;
  }
  if(!(remote?.accepts?remote.accepts(port):remote?.server?.port===port))return this.hub.after(at+TCP_US,us=>this.say(`ERROR${LINE}CLOSED${LINE}`,us));
  const peerId=remote.freeId();if(peerId<0)return this.error(at,'상대 모듈의 연결 수가 가득 찼습니다.');
  const local={id,type,host,port,localPort:49152+id,server:false},other={id:peerId,type,host:this.ip??'192.168.4.1',port:local.localPort,localPort:port,server:true,remote:this};
  local.remote=remote;local.peerLink=other;other.peerLink=local;this.links.push(local);remote.links.push(other);
  this.hub.after(at+TCP_US,us=>{this.say((this.mux?`${id},`:'')+'CONNECT'+LINE+LINE+'OK'+LINE,us);remote.say(`${peerId},CONNECT${LINE}`,us);this.hub.note('Wi-Fi',us,`${this.name} → ${remote.name} TCP ${host}:${port}`);});
 }
 beginSend(a,at){
  // Transparent transmission: everything after the prompt goes out until a lone +++ (ESP8266 AT reference).
  if(this.cipmode&&!a.length){const link=this.links[0];if(!link)return this.error(at,'먼저 AT+CIPSTART로 연결하세요.');this.through=link;this.held=[];this.say(`OK${LINE}${LINE}>`,at);return;}
  const id=this.mux?Number(a[0]):0,length=Number(a[this.mux?1:0]),link=this.links.find(l=>l.id===id);
  if(!link||!Number.isInteger(length)||length<1||length>2048)return this.error(at,link?'AT+CIPSEND 길이는 1~2048입니다.':'먼저 AT+CIPSTART로 연결하세요.');
  this.sending={link,length,data:[]};this.say(`OK${LINE}> `,at);
 }
 flushThrough(us){
  this.flushing=false;if(!this.through)return;
  if(us-this.heldAt<THROUGH_QUIET_US&&this.held.length<THROUGH_MAX){this.flushing=true;this.hub.after(this.heldAt+THROUGH_QUIET_US,t=>this.flushThrough(t));return;}
  const data=this.held;this.held=[];
  if(String.fromCharCode(...data)==='+++'){this.through=null;this.hub.note('Wi-Fi',us,`${this.name}: 패스스루 끝 (+++)`);return;}
  this.transfer(this.through,data,us);
 }
 finishSend({link,data},at){
  this.say(`${LINE}Recv ${data.length} bytes${LINE}${LINE}SEND OK${LINE}`,at);this.transfer(link,data,at);
 }
 transfer(link,data,at){
  const target=link.type==='TCP'?link.remote:this.resolve(link.host),delay=this.hub.air(this,AIR_US.wifi,link.type==='TCP');
  if(delay==null){this.hub.note('Wi-Fi',at,`${this.name} → ${target?.name??link.host} ${link.type} ${data.length} B 손실`);return;}
  const arrive=at+delay;
  if(link.type==='TCP'){if(target?.links.includes(link.peerLink))target.deliver(link.peerLink,data,arrive);this.hub.note('Wi-Fi',at,`${this.name} → ${target?.name??'?'} TCP ${data.length} B`);return;}
  if(target?.virtual){target.take(data);this.hub.note('Wi-Fi',at,`${this.name} → ${target.name} UDP ${data.length} B`);return;}
  const peer=target?.links.find(l=>l.type==='UDP'&&l.localPort===link.port);if(peer)target.deliver(peer,data,arrive);
  this.hub.note('Wi-Fi',at,`${this.name} → ${target?.name??link.host} UDP ${data.length} B${peer?'':' · 받는 포트 없음'}`);
 }
 deliver(link,data,at){if(!this.enabled)return;if(this.cipmode){this.hub.emit(this,data,at);return;}this.hub.emit(this,[...`${LINE}+IPD,${this.mux?link.id+',':''}${data.length}:`].map(c=>c.charCodeAt(0)),at);this.hub.emit(this,data,at);}
 dropLink(link,us,notify){
  const i=this.links.indexOf(link);if(i<0)return;this.links.splice(i,1);if(this.through===link)this.through=null;if(notify)this.say(`${this.mux?link.id+',':''}CLOSED${LINE}`,us);
  const other=link.peerLink,peer=link.remote;if(other&&peer){const k=peer.links.indexOf(other);if(k>=0){peer.links.splice(k,1);if(peer.enabled)peer.say(`${peer.mux?other.id+',':''}CLOSED${LINE}`,us);}}
 }
 status(){
  if(!this.powered)return '전원과 GND를 확인하세요. (VCC 3.0~3.6 V 전용)';
  if(!this.enabled)return this.bootAt!=null?'부팅 중':'CH_PD를 3.3 V에 연결하세요.';
  const roles=[this.ap&&`AP ${q(this.ap.ssid)}`,this.joined&&`${q(this.joined.ap.ssid)} 접속 · ${this.ip}`,this.server&&`TCP 서버 ${this.server.port}`].filter(Boolean);
  return `${this.uartBaud} baud · ${roles.join(' · ')||'AT 명령 대기'}${this.links.length?` · 연결 ${this.links.length}개`:''}${this.through?' · 패스스루':''}`;
 }
}

// ---------------------------------------------------------------- outside the circuit
class Outside{
 constructor(name){this.name=name;this.virtual=true;this.output='';}
 take(bytes){this.output=(this.output+String.fromCharCode(...bytes)).slice(-4000);}
}
// The phone pairs with one slave at a time, when the serial monitor first sends to it.
class Phone extends Outside{
 constructor(){super('스마트폰');this.kind='phone';this.peer=null;this.uartBaud=9600;this.txFree=0;}
}
class Pc extends Outside{
 constructor(hub){super('PC');this.hub=hub;this.enabled=true;this.server={port:PC.port};this.links=[];}
 freeId(){return this.links.length;}
 say(){}
 deliver(link,data){this.take(data);}
 // What the serial monitor sends: over the open connections, or to the first TCP server on the router.
 send(bytes,at){
  if(!this.links.length){
   const m=this.hub.wifi().find(w=>w.joined===this.hub.router&&w.server);if(!m||m.freeId()<0)return 0;
   const side={id:m.freeId(),type:'TCP',host:PC.ip,port:49152,localPort:m.server.port,server:true,remote:this},mine={id:0,type:'TCP',host:m.ip,port:m.server.port,localPort:49152,server:false,remote:m,peerLink:side};
   side.peerLink=mine;m.links.push(side);this.links.push(mine);m.say(`${side.id},CONNECT${LINE}`,at);this.hub.note('Wi-Fi',at,`PC → ${m.name} TCP ${m.ip}:${m.server.port}`);at+=TCP_US;
  }
  for(const l of this.links){const delay=this.hub.air(l.remote,AIR_US.wifi,l.type==='TCP');if(delay!=null&&l.remote.links.includes(l.peerLink))l.remote.deliver(l.peerLink,bytes,at+delay);}
  return bytes.length;
 }
}

// A host on the internet: TCP on its ports; what it answers goes back over the link the module opened.
class Host extends Outside{
 constructor(hub,{name,ip,port}){super(name);this.hub=hub;this.domain=name;this.ip=ip;this.port=port;this.enabled=true;this.links=[];this.buffers=new Map();}
 accepts(port){return port===this.port;}
 freeId(){return this.links.length;}
 say(){}
 log(text){this.output=(this.output+text+'\n').slice(-4000);}
 reply(link,bytes,at){const delay=this.hub.air(link.remote,AIR_US.wifi+INTERNET_US,true);if(delay!=null&&link.remote.links.includes(link.peerLink))link.remote.deliver(link.peerLink,bytes,at+delay);}
 close(link,at){this.hub.after(at+INTERNET_US,us=>{if(link.remote.links.includes(link.peerLink))link.remote.dropLink(link.peerLink,us,true);});}
 deliver(link,data,at){const buf=[...(this.buffers.get(link)??[]),...data];this.buffers.set(link,this.receive(link,buf,at));}
}
const utf8=text=>[...new TextEncoder().encode(text)],text=bytes=>new TextDecoder().decode(new Uint8Array(bytes));
// HTTP/1.1 with Connection: close. GET / (a greeting), /time (seconds since the run started), /led?state=on|off;
// POST /data stores the body. The requests show in the serial monitor's "웹 서버" target.
class WebServer extends Host{
 constructor(hub){super(hub,INTERNET.web);this.led='off';this.data=[];}
 receive(link,buf,at){
  const raw=text(buf),end=raw.indexOf('\r\n\r\n');if(end<0)return buf;
  const head=raw.slice(0,end),length=Number(/content-length:\s*(\d+)/i.exec(head)?.[1]??0),body=raw.slice(end+4);
  if(new TextEncoder().encode(body).length<length)return buf;
  const [method,target='/']=head.split('\r\n')[0].split(' '),url=new URL(target,'http://'+this.domain);
  let status=200,type='application/json; charset=utf-8',content;
  if(method==='GET'&&url.pathname==='/')content=JSON.stringify({message:'STM Lab 웹 서버입니다.',paths:['/time','/led?state=on','POST /data']}),type='application/json; charset=utf-8';
  else if(method==='GET'&&url.pathname==='/time')content=JSON.stringify({seconds:Math.round(this.hub.now/1e3)/1e3});
  else if(method==='GET'&&url.pathname==='/led'){const s=url.searchParams.get('state');if(s==='on'||s==='off')this.led=s;content=JSON.stringify({led:this.led});}
  else if(method==='POST'&&url.pathname==='/data'){this.data.push(body);content=JSON.stringify({received:body,count:this.data.length});}
  else{status=404;content=JSON.stringify({error:'없는 경로입니다.'});}
  this.log(`${method} ${url.pathname}${url.search} → ${status}${method==='POST'?' · '+body:''}`);
  this.hub.note('Wi-Fi',at,`${this.domain}: ${method} ${url.pathname} → ${status}`);
  const bytes=utf8(content);
  this.reply(link,utf8(`HTTP/1.1 ${status} ${status===200?'OK':'Not Found'}\r\nContent-Type: ${type}\r\nContent-Length: ${bytes.length}\r\nConnection: close\r\n\r\n`).concat(bytes),at);
  this.close(link,at);
  return [];
 }
 /** A request made without a link (ESP32 HTTPClient): status and body. */
 request(method,path,body,at){
  const out=[];const fake={remote:{links:[0],deliver:(l,bytes)=>out.push(...bytes),dropLink(){}},peerLink:0};
  this.receive(fake,utf8(`${method} ${path} HTTP/1.1\r\nHost: ${this.domain}\r\nContent-Length: ${utf8(body??'').length}\r\n\r\n${body??''}`),at);
  const raw=text(out),split=raw.indexOf('\r\n\r\n');return {status:Number(raw.split(' ')[1]),body:raw.slice(split+4)};
 }
}
// MQTT 3.1.1 (QoS 0, QoS 1 acknowledged): CONNECT, PUBLISH, SUBSCRIBE / UNSUBSCRIBE with + and # filters, PINGREQ,
// DISCONNECT. Network clients and ESP32 PubSubClient objects (`attach`) share the topics; the serial monitor's
// "MQTT 브로커" target publishes "topic message" lines and shows what passes through.
export const topicMatches=(filter,topic)=>{const f=filter.split('/'),t=topic.split('/');for(let i=0;i<f.length;i++){if(f[i]==='#')return true;if(i>=t.length||(f[i]!=='+'&&f[i]!==t[i]))return false;}return f.length===t.length;};
class Broker extends Host{
 constructor(hub){super(hub,INTERNET.broker);this.clients=new Map();}
 receive(link,buf,at){
  for(;;){
   if(buf.length<2)return buf;
   let len=0,mult=1,i=1;for(;i<5&&i<buf.length;i++){len+=(buf[i]&127)*mult;mult*=128;if(!(buf[i]&128))break;}
   if(i>=buf.length||buf.length<i+1+len)return buf;
   const type=buf[0]>>4,flags=buf[0]&15,body=buf.slice(i+1,i+1+len);buf=buf.slice(i+1+len);
   this.packet(link,type,flags,body,at);
  }
 }
 packet(link,type,flags,body,at){
  const client=this.clients.get(link)??{subs:[],id:'?'};this.clients.set(link,client);
  const str16=(b,o)=>{const n=(b[o]<<8)|b[o+1];return [text(b.slice(o+2,o+2+n)),o+2+n];};
  if(type===1){const [,o1]=str16(body,0),idAt=o1+4;client.id=str16(body,idAt)[0];this.log(`${client.id} 접속`);this.reply(link,[0x20,2,0,0],at);return;}
  if(type===3){const [topic,o]=str16(body,0),qos=(flags>>1)&3,payload=body.slice(o+(qos?2:0));if(qos===1)this.reply(link,[0x40,2,body[o],body[o+1]],at);this.publish(topic,payload,at,client.id);return;}
  if(type===8){const pid=body.slice(0,2),granted=[];let o=2;while(o<body.length){const [f,n]=str16(body,o);client.subs.push(f);granted.push(0);o=n+1;this.log(`${client.id} 구독 ${f}`);}this.reply(link,[0x90,2+granted.length,...pid,...granted],at);return;}
  if(type===10){let o=2;while(o<body.length){const [f,n]=str16(body,o);client.subs=client.subs.filter(s=>s!==f);o=n;}this.reply(link,[0xb0,2,body[0],body[1]],at);return;}
  if(type===12){this.reply(link,[0xd0,0],at);return;}
  if(type===14){this.clients.delete(link);this.log(`${client.id} 끊음`);}
 }
 subscribers(){return [...[...this.clients].map(([link,c])=>({subs:c.subs,send:(topic,payload,at)=>this.reply(link,mqttPublish(topic,payload),at)})),...this.attached];}
 publish(topic,payload,at,from='모니터'){
  this.log(`${from} → ${topic}: ${text(payload)}`);this.hub.note('Wi-Fi',at,`MQTT ${topic}: ${text(payload).slice(0,40)}`);
  for(const s of this.subscribers())if(s.subs.some(f=>topicMatches(f,topic)))s.send(topic,payload,at);
 }
 get attached(){return this._attached??=[];}
}
function mqttPublish(topic,payload){const t=utf8(topic),len=2+t.length+payload.length,head=[0x30];let x=len;do{let b=x%128;x=Math.floor(x/128);if(x)b|=128;head.push(b);}while(x);return [...head,t.length>>8,t.length&255,...t,...payload];}

// ---------------------------------------------------------------- an ESP32's own radio (BluetoothSerial, WiFi)
export class Esp32Bluetooth extends Bluetooth{
 constructor(hub,board,name){
  super(hub,{id:`esp32bt:${board.id}`,name:`${board.name} Bluetooth`,baud:9600,btPin:'1234',catalogVariant:'hc06-bluetooth-4'},hub.bluetooth().length);
  this.virtual=true;this.anyPin=true;this.powered=true;this.btName=name||'ESP32';this.rx=[];
 }
 update(){}
 take(bytes,at){for(const value of bytes)this.rx.push({value,at});}
 send(bytes,at){if(!this.peer)return 0;for(const value of bytes){const delay=this.hub.air(this,AIR_US.bluetooth,true);if(delay!=null)this.hub.emit(this.peer,[value],at+delay);}return bytes.length;}
}
export class Esp32Wifi extends Wifi{
 constructor(hub,board){
  super(hub,{id:`esp32wifi:${board.id}`,name:`${board.name} Wi-Fi`,baud:115200},hub.wifi().length);
  this.enabled=true;this.powered=true;this.mux=1;
 }
 update(){}
 say(){}
 powerDown(){}
 deliver(link,data,at){for(const value of data)(link.rx??=[]).push({value,at});}
 begin(ssid,pwd,at){this.mode=1;this.hub.after(at+JOIN_US,us=>this.join(ssid,pwd,us));}
 softAP(ssid,pwd,at){this.mode=2;this.ap={ssid,pwd:pwd??'',channel:1,ecn:pwd?3:0};this.hub.note('Wi-Fi',at,`${this.name}: AP ${q(ssid)} 시작`);}
 client(host,port,at){
  const id=this.freeId(),before=this.links.length;if(id<0)return null;
  this.connect([String(id),'TCP',host,String(port)],at);return this.links.length>before?this.links.at(-1):null;
 }
}

// ---------------------------------------------------------------- the air between the modules of a run
/**
 * One per run, shared by every board session of the circuit. `primary` is the main board's session: its solved circuit
 * powers the modules. Each board joins as a port that receives what a module sends on its TXD.
 */
export class WirelessHub{
 constructor(primary){
  this.primary=primary;this.modules=new Map();this.ports=new Map();this.timers=[];this.now=0;this.radios=[];this.seed=0x2545f491;
  this.router={name:'공유기',enabled:true,ap:{ssid:ROUTER.ssid,pwd:ROUTER.pwd,channel:6,ecn:3},apMac:'c8:3a:35:00:00:01',clients:0,subnet:'192.168.1'};this.pc=new Pc(this);this.phone=new Phone();
  this.broker=new Broker(this);this.web=new WebServer(this);
  this.addPort('main',primary);
 }
 addPort(key,session){this.ports.set(key,session);session.wireless=this;if(session.buses)session.buses.wireless=this;}
 parts(){return this.primary.project.components.filter(p=>p.type==='wireless');}
 module(part){
  let m=this.modules.get(part.id);if(m)return m;
  const index=this.parts().findIndex(p=>p.id===part.id);m=part.catalogVariant==='esp01-wifi-8'?new Wifi(this,part,index):new Bluetooth(this,part,index);this.modules.set(part.id,m);return m;
 }
 all(){return [...this.parts().map(p=>this.module(p)),...this.radios];}
 addRadio(radio){this.radios.push(radio);return radio;}
 // The same sequence every run. Null: lost for good.
 random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
 air(sender,base,reliable){
  const rate=Math.min(100,Math.max(0,Number(sender.part?.airLoss)||0))/100;let delay=base;if(!rate)return delay;
  for(let tries=0;this.random()<rate;tries++){if(!reliable||tries>=RETRIES)return null;delay+=base;}
  return delay;
 }
 // The serial monitor's side of the outside world (`phone:<module id>`, `pc`).
 internetHost(name){return [this.broker,this.web].find(h=>h.domain===name||h.ip===name)??null;}
 outsideInput(target,text,at){
  const bytes=[...new TextEncoder().encode(text)];
  if(target==='pc')return this.pc.send(bytes,at);
  if(target==='web')throw new Error('웹 서버에는 직접 보낼 수 없습니다. 보드가 요청을 보내면 여기에 기록됩니다.');
  if(target==='broker'){let n=0;for(const line of String(text).split(/\r?\n/)){const m=/^\s*(\S+)\s+(.*)$/.exec(line);if(!line.trim())continue;if(!m)throw new Error('"토픽 메시지" 형식으로 보내세요. 예: stm/led 1');this.broker.publish(m[1],[...new TextEncoder().encode(m[2])],at);n+=line.length;}return n;}
  const m=this.all().find(x=>x.id===target.slice(6)&&x.kind==='bluetooth');if(!m?.powered)return 0;
  if(m.peer&&m.peer!==this.phone)throw new Error(`${m.name}은 ${m.peer.name}와 연결되어 있습니다.`);
  if(m.hc05&&m.role==='master')throw new Error(`${m.name}은 마스터입니다. 스마트폰은 슬레이브에 연결합니다.`);
  if(this.phone.peer&&this.phone.peer!==m)this.phone.peer.disconnect(at,'스마트폰이 다른 모듈로 연결');
  let start=at;if(!m.peer){m.peer=this.phone;this.phone.peer=m;start+=PAIR_US;this.note('Bluetooth',at,`스마트폰 ↔ ${m.name} 연결`);}
  for(const value of bytes){const delay=this.air(m,AIR_US.bluetooth,true);if(delay==null)continue;if(m.take)m.take([value],start+delay);else this.emit(m,[value],start+delay);}
  return bytes.length;
 }
 outsideOutput(target){return target==='pc'?this.pc.output:target==='broker'?this.broker.output:target==='web'?this.web.output:this.phone.output;}
 bluetooth(){return this.all().filter(m=>m.kind==='bluetooth');}
 wifi(){return this.all().filter(m=>m.kind==='wifi');}
 after(at,fn){this.timers.push({at,fn});}
 note(protocol,micros,message){this.primary.buses?.trace?.({micros,protocol,message});}
 /** Bytes on a UART TX line, delivered to the modules whose RXD is on that net (`wired(partId)`). */
 transmit(frames,baud,wired,report=()=>{}){
  let count=0;
  for(const m of this.all()){
   if(!wired(m.id)||!m.powered)continue;
   if(m.uartBaud!==baud){report(`RX 무시 · ${m.name}은 ${m.uartBaud} baud인데 보낸 쪽은 ${baud} baud`);continue;}
   m.receive(frames);count++;
  }
  return count;
 }
 /** A module's TXD: every board whose enabled UART RX is on that net receives the bytes. */
 emit(module,bytes,at){
  if(!bytes.length)return;
  if(module.virtual){module.take(bytes,at);return;}
  const baud=module.uartBaud,bit=1e7/baud;let t=Math.max(at,module.txFree);
  const frames=bytes.map(value=>({value,at:t+=bit}));module.txFree=t;
  for(const session of this.ports.values())session.wirelessRx?.(module,frames,baud);
 }
 /** Advances with the main board's circuit. */
 advance(micros,result,source){
  if(source!==this.primary||!result||result.fault)return;
  this.now=micros;
  for(const m of this.all())m.update(micros,result);
  for(let guard=0;guard<256;guard++){const i=this.timers.findIndex(t=>t.at<=micros);if(i<0)break;this.timers.splice(i,1)[0].fn(micros);}
  for(const p of this.parts()){const m=this.module(p);p.linked=!!m.peer;result.parts[p.id]={...result.parts[p.id],voltage:(result.voltage(`part:${p.id}:p1`)??0)-(result.voltage(`part:${p.id}:p2`)??0),current:0,power:0,powered:m.powered,on:m.powered,status:m.status(),led:this.led(m,micros)};}
 }
 // Status LED: double flash when paired, once in 2 s in AT mode at 38400, fast while waiting (HC-05 importer datasheet).
 led(m,micros){
  if(!m.powered)return false;
  if(m.kind==='wifi')return true;
  const t=micros/1000;
  if(m.peer)return t%1000<80||(t%1000>=200&&t%1000<280);
  if(m.hc05&&m.at&&m.at38400)return t%2000<120;
  return t%500<250;
 }
}
/** The interpreter's receive side: bytes reach the UARTs of a board whose RX shares the module's TXD net. */
export function deliverToBuses(session,module,frames,baud){
 const buses=session.hal?[...session.hal.serials.values()].map(c=>c.bus):[session.buses];
 for(const bus of buses){
  const u=bus.uart;if(!u.ready||!bus.same(bus.pin(u.rx),`part:${module.id}:p3`))continue;
  if(u.baud!==baud){bus.report(session.runtime,'UART',`RX 무시 · ${module.name}은 ${baud} baud인데 받는 쪽은 ${u.baud} baud`);continue;}
  if(u.queue.length+frames.length>4096)throw new Error('UART 수신 버퍼가 가득 찼습니다.');
  for(const f of frames){u.queue.push({at:f.at,value:f.value});session.runtime.event(f.at/1000,()=>{});}
 }
}
