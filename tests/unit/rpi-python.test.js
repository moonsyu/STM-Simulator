// The Raspberry Pi main.py interpreter: the language subset, its errors, and gpiozero / RPi.GPIO on the board pins.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {PythonProgram,PythonDriver,parse} from '../../src/rpi-python.js';

// Runs a program without a board: everything it prints, with sleep() and input() answered at once.
function run(source,lines=[]){
 let out='',clock=0;const host={now:()=>clock,print:t=>{out+=t;},readLine:()=>lines.length?lines.shift():null,modules:{time:{pyModule:true,sleep:function*(a){clock+=Number(a[0]?.v??a[0])*1e6;return null;},perf_counter:()=>clock/1e6}}};
 const p=new PythonProgram(source,host);p.budget=Infinity;const it=p.run();for(let s=it.next(),guard=0;!s.done;s=it.next(),guard++){if(guard>1e5)throw new Error('stuck');if(s.value.input)throw new Error('waits for input');}
 return out;
}
describe('Python language subset',()=>{
 test('numbers print like Python: int, float, division, floor, power',()=>{
  assert.equal(run('print(7/2, 7//2, 7%3, 2**10, 1.0, 0.1+0.2, -7//2, round(2.5), round(0.125, 2))'),'3.5 3 1 1024 1.0 0.30000000000000004 -4 2 0.13\n');
 });
 test('f-strings with format specs, % formatting and str methods',()=>{
  assert.equal(run('d=0.55\nn=7\nprint(f"{d:.0%} {n:3d}|{n:<3}|{3.14159:.2f} {n*10}% {{x}}")\nprint("%d-%s" % (4, "a"))\nprint(",".join(["a","b"]).upper(), "x y  z".split())'),"55%   7|7  |3.14 70% {x}\n4-a\nA,B ['x', 'y', 'z']\n");
 });
 test('lists, tuples, dicts, membership, comprehensions, unpacking and slices',()=>{
  assert.equal(run('a=[1,2,3]\na.append(4)\nb=(0,)*3\nd={1:"x",2:"y"}\nq,r=divmod if False else (7,8)\nprint(a[-1], a[1:3], b, d[2], 3 in a, 5 not in d, [x*x for x in a if x%2], q+r, len(d))'),'4 [2, 3] (0, 0, 0) y True True [1, 9] 15 2\n');
 });
 test('functions with globals, defaults, lambdas and recursion',()=>{
  assert.equal(run('count=0\ndef add(n=1):\n    global count\n    count += n\n    return count\nadd()\nadd(5)\nsq=lambda x: x*x\ndef f(n):\n    return 1 if n<2 else n*f(n-1)\nprint(count, sq(4), f(5))'),'6 16 120\n');
 });
 test('loops: while/else, for with break and continue',()=>{
  assert.equal(run('s=0\nfor i in range(10):\n    if i==2: continue\n    if i==6: break\n    s+=i\nn=0\nwhile n<3:\n    n+=1\nelse:\n    print("done", n)\nprint(s)'),'done 3\n13\n');
 });
 test('try/except catches the named error; finally always runs; raise rethrows',()=>{
  assert.equal(run('try:\n    int("x")\nexcept ValueError as e:\n    print("bad")\nfinally:\n    print("end")\ntry:\n    {}[1]\nexcept (KeyError, IndexError):\n    print("missing")'),'bad\nend\nmissing\n');
  assert.throws(()=>run('try:\n    1/0\nexcept ValueError:\n    pass'),/0으로 나눌 수 없습니다/);
 });
 test('input() reads the lines sent from the serial monitor and echoes them',()=>{
  assert.equal(run('n=int(input("n> "))\nprint(n*2)',['21']),'n> 21\n42\n');
 });
 test('errors name the line and the kind of mistake',()=>{
  assert.throws(()=>parse('if x\n    pass'),/1행: ':'/);
  assert.throws(()=>parse('def f():\nprint(1)'),/indent|들여쓰기|필요/);
  assert.throws(()=>run('print(y)'),/'y'이\(가\) 정의되지 않았습니다/);
  assert.throws(()=>run('import numpy'),/numpy/);
  assert.throws(()=>run('x=1\ndef f():\n    x += 1\nf()'),/global x/);
 });
});

describe('the board: gpiozero and RPi.GPIO on its pins',()=>{
 const part=code=>({id:'rpi',type:'devboard',model:'rpi5',name:'RPI-1',x:0,y:0,rotation:0,code});
 // A board stepping with a fake circuit: `levels` sets the voltage of input pins.
 function board(code,levels={}){
  const logs=[],d=new PythonDriver(part(code),{log:t=>logs.push(t)});
  const result={voltage:id=>{const pin=id.split('.')[1];return pin in levels?levels[pin]:null;}};
  d.observe(result,0);return {d,logs,step:(ms)=>{d.advance(ms);d.observe(result,ms);return d.gpio();},levels};
 }
 test('LED and sleep: the pin follows the program over time',()=>{
  const b=board('from gpiozero import LED\nfrom time import sleep\nled = LED(17)\nwhile True:\n    led.on()\n    sleep(0.5)\n    led.off()\n    sleep(0.5)');
  assert.equal(b.step(100)['rpi.GPIO17'].value,3.3);assert.equal(b.step(700)['rpi.GPIO17'].value,0);assert.equal(b.step(1200)['rpi.GPIO17'].value,3.3);
 });
 test('PWMLED value is a duty; a software PWM loop averages to its duty too',()=>{
  const pwm=board('from gpiozero import PWMLED\nled=PWMLED(18)\nled.value=0.25\nfrom signal import pause\npause()');
  assert.deepEqual(pwm.step(10)['rpi.GPIO18'].pwm.duty,0.25);
  const soft=board('from gpiozero import LED\nfrom time import perf_counter\nled=LED(17)\ndef wait(s):\n    end=perf_counter()+s\n    while perf_counter()<end:\n        pass\nwhile True:\n    led.on()\n    wait(0.0005)\n    led.off()\n    wait(0.0015)');
  soft.step(5);const g=soft.step(25)['rpi.GPIO17'];assert.ok(g.pwm&&Math.abs(g.pwm.duty-0.25)<0.05,JSON.stringify(g));
 });
 test('Button callbacks run on edges; pull-ups set the pin mode',()=>{
  const b=board('from gpiozero import Button\nfrom signal import pause\nb=Button(27)\nb.when_pressed=lambda: print("down")\nb.when_released=lambda: print("up")\npause()',{GPIO27:3.3});
  assert.equal(b.step(10)['rpi.GPIO27'].mode,'INPUT_PULLUP');b.levels.GPIO27=0;b.step(20);b.levels.GPIO27=3.3;b.step(30);
  assert.deepEqual(b.logs.slice(-2),['down','up']);
 });
 test('RPi.GPIO in BCM and BOARD numbering, with PWM',()=>{
  const b=board('import RPi.GPIO as GPIO\nGPIO.setmode(GPIO.BOARD)\nGPIO.setup(11, GPIO.OUT)\nGPIO.output(11, GPIO.HIGH)\np=GPIO.PWM(11, 100)\nGPIO.setup(13, GPIO.IN, pull_up_down=GPIO.PUD_UP)\nprint(GPIO.input(13))\np.start(40)\nimport time\ntime.sleep(10)',{GPIO27:3.3});
  const g=b.step(10);assert.equal(g['rpi.GPIO17'].pwm.duty,0.4);assert.equal(g['rpi.GPIO27'].mode,'INPUT_PULLUP');assert.deepEqual(b.logs,['1']);
  assert.throws(()=>board('import RPi.GPIO as GPIO\nGPIO.setup(17, GPIO.OUT)').step(10),/setmode/);
 });
 test('a program error stops the board with its line; a finished program says so',()=>{
  assert.throws(()=>board('x = 1\ny = x + "a"').step(10),/RPI-1 · main.py 2행: TypeError/);
  const done=board('print("hi")');done.step(10);assert.deepEqual(done.logs,['hi','main.py가 끝났습니다.']);
 });
});
