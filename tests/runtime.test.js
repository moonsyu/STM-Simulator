import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,Runtime} from '../src/program.js';
const start=(code,api={})=>{const out=[];const runtime=new Runtime(compile(code),{print:v=>out.push(v),...api});runtime.tick(0);return {runtime,out};};

test('functions, nested scope, for/continue/break, arrays, bitwise and safe strings',()=>{
 const {out}=start(`int sum(int a[], int count) { int total=0; for (int i=0;i<count;i++) { if(i==1)continue; total+=a[i]; } return total; }
 int values[]={1,2,4,8}; void setup(){ int x=10; {int x=3; Serial.println(x);} Serial.println(x); Serial.println(sum(values,4)); Serial.println((0xF0 >> 4) | 0b10000); Serial.println("http://text/*literal*/"); }
 void loop(){delay(100);}`);
 assert.deepEqual(out,['3','10','13','31','http://text/*literal*/']);
});
test('user functions can yield delays and resume local values',()=>{
 const {runtime,out}=start(`void blink(int n){for(int i=0;i<n;i++){Serial.println(i);delay(10);}} void setup(){blink(3);} void loop(){delay(100);}`);
 assert.deepEqual(out,['0']);runtime.tick(25);assert.deepEqual(out,['0','1','2']);
});
test('structures, structure copy, pointers and pointer array arithmetic',()=>{
 const {out}=start(`struct Point { int x; int y; }; Point make(){Point p={2,4};return p;} void move(Point *p){p->x+=3;}
 void setup(){Point a=make(); Point b=a; move(&a); int values[]={3,5}; int *p=values; *(p+1)=7; Serial.println(a.x); Serial.println(b.x); Serial.println(values[1]);}void loop(){delay(100);}`);
 assert.deepEqual(out,['5','2','7']);
});
test('out of bounds, const writes, dangling pointers and recursion fail closed',()=>{
 for(const [code,pattern]of [
  ['int a[2]; Serial.println(a[2]);',/범위/],['const int x=1;x=2;',/const/],['int *p; {int x=1;p=&x;} Serial.println(*p);',/유효기간/]
 ])assert.throws(()=>start(`void setup(){${code}}void loop(){delay(10);}`),pattern);
 assert.throws(()=>start('int f(){return f();} void setup(){f();}void loop(){delay(10);}'),/깊이/);
 assert.throws(()=>compile('#include <unknown.h>\nvoid loop(){}'),/라이브러리/);
});
test('timer callbacks run while the sketch sleeps, preserve global state and cancel',()=>{
 const {runtime,out}=start(`int count=0; int id; void pulse(){count++;Serial.println(millis());if(count==3)Timer.cancel(id);}void setup(){id=Timer.every(10,pulse);}void loop(){delay(1000);}`);
 runtime.tick(60);assert.deepEqual(out,['10','20','30']);
 assert.throws(()=>{const r=start('void f(){delay(1);}void setup(){Timer.after(1,f);}void loop(){delay(100);}').runtime;r.tick(2);},/콜백/);
});
test('edge interrupts trigger once, can be masked and detached',()=>{
 let level=1;
 const {runtime,out}=start(`void edge(){Serial.println(1);}void setup(){pinMode(D2,INPUT_PULLUP);attachInterrupt(digitalPinToInterrupt(D2),edge,FALLING);}void loop(){delay(100);}`,{read:()=>level});
 level=0;runtime.tick(1);runtime.tick(2);assert.deepEqual(out,['1']);runtime.call('noInterrupts',[]);level=1;runtime.tick(3);level=0;runtime.tick(4);assert.equal(out.length,1);runtime.call('interrupts',[]);runtime.tick(5);assert.equal(out.length,2);runtime.call('detachInterrupt',['D2']);level=1;runtime.tick(6);level=0;runtime.tick(7);assert.equal(out.length,2);
});
test('ADC DMA fills a buffer on timed events and invokes completion',()=>{
 let voltage=1.65;
 const {runtime,out}=start(`int samples[3];void done(){for(int i=0;i<3;i++)Serial.println(samples[i]);}void setup(){DMA.start(A0,samples,3,5,done);}void loop(){delay(100);}`,{voltage:()=>voltage});
 runtime.tick(5);voltage=3.3;runtime.tick(15);assert.deepEqual(out,['2048','4095','4095']);
});
test('PWM produces bounded timed edges when waveform mode is enabled',()=>{
 const edges=[];let r;
 r=new Runtime(compile('void setup(){pinMode(D13,OUTPUT);analogWriteFrequency(D13,100);analogWrite(D13,128);}void loop(){delay(100);}'),{pwmEnabled:true,changed:us=>edges.push([us,r.gpio.PA5?.value])});
 r.tick(20);assert.deepEqual(edges.map(e=>e[1]),[0,3.3,0,3.3,0,3.3]);assert.ok(Math.abs(edges[2][0]-10000*128/255)<.001);
});
test('DMA output, do/while and array pointers retain values',()=>{
 const {runtime,out}=start('int data[]={0,255};void done(){Serial.println(1);}void setup(){pinMode(D13,OUTPUT);DMA.write(D13,data,2,10,done);int i=0;do{i++;}while(i<3);Serial.println(i);}void loop(){delay(100);}');
 runtime.tick(10);assert.equal(runtime.gpio.PA5.value,0);runtime.tick(20);assert.equal(runtime.gpio.PA5.value,3.3);assert.deepEqual(out,['3','1']);
});
test('structure expansion and copying terminate within resource limits',()=>{
 let types='struct T0 { int a; };';for(let i=1;i<16;i++)types+=`struct T${i} { T${i-1} a; T${i-1} b; };`;
 assert.throws(()=>start(types+'void setup(){T15 value;}void loop(){delay(1);}'),/한도/);
});
test('define comments preserve quoted URLs and numeric values',()=>{
 const {out}=start('#define VALUE 42 // 설명\n#define URL "https://example.test"\nvoid setup(){Serial.println(VALUE);Serial.println(URL);}void loop(){delay(100);}');assert.deepEqual(out,['42','https://example.test']);
});
