import test from 'node:test';
import assert from 'node:assert/strict';
import {compileHal} from '../src/hal-source.js';
import {Runtime} from '../src/runtime.js';
import {HAL_CONSTANTS} from '../src/hal.js';
import {inlineStatements} from '../src/c-inline.js';
const run=(body,globals='')=>{const runtime=new Runtime(compileHal(globals+'\ndouble result; int main(void){'+body+' return 0;}'),{constants:HAL_CONSTANTS});runtime.tick(0);return runtime.vars.result;};

for(const [name,body,expected,globals='']of [
 ['struct alignment','result=sizeof(struct Reading);',8,'struct Reading {float v;uint16_t raw;};'],
 ['nested alignment','result=sizeof(struct Outer);',24,'struct Inner {double d;char c;};struct Outer {char a;struct Inner b;};'],
 ['unevaluated increment','int i=1;result=sizeof(i++);result=result*100+i;',401],
 ['unevaluated null dereference','double *p=0;result=sizeof(*p);',8],
 ['unevaluated call','result=sizeof(f());result=result*10+calls;',80,'int calls;double f(void){calls++;return 0;}'],
 ['double expression','double x=2;result=sizeof(x+1);',8],
 ['array and pointer sizes','double a[3];double *p=a;result=sizeof(a)*100+sizeof(p);',2404],
 ['string size','result=sizeof("abc");',4],
 ['float pointer index','float a[1]={5.0f};float *p=a;result=p[0]/2;',2.5],
 ['nested member type','struct B b={{5.0f}};result=b.a.v/2;',2.5,'struct A {float v;};struct B {struct A a;};'],
 ['narrow member initialization','struct A a={300};result=a.v;',44,'struct A {uint8_t v;};'],
 ['struct array member','struct A a[1]={{5.0f}};result=a[0].v/2;',2.5,'struct A {float v;};'],
 ['comparison result type','result=(1.0<2.0)/2;',0],
 ['equality result type','result=(1.0==1.0)/2;',0],
 ['unsigned right shift','uint32_t x=0x80000000U;result=x>>1;',1073741824],
 ['unsigned comparison','uint32_t x=0xffffffffU;int y=-1;result=x==y;',1],
 ['unsigned expression wrap','uint32_t x=0xffffffffU;result=x+1U;',0],
 ['unsigned multiplication precision','uint32_t x=0xffffffffU;result=x*x;',1],
 ['narrow integer promotion','uint8_t x=255;result=x+1;',256],
 ['unsigned compound shift','uint32_t x=0x80000000U;x>>=1;result=x;',1073741824],
 ['octal literal','result=010;',8],
 ['octal suffix','result=077U;',63],
 ['enum expression and increment','result=B;',9,'enum E {A=1<<3,B};'],
 ['enum references','result=C;',18,'enum E {A=1<<3,B=A+1,C=B*2};'],
 ['return conversion','result=f();',3,'int f(void){return 3.5;}'],
 ['conditional conversion','result=(1?5:2.0)/2;',2.5],
])test(name,()=>assert.equal(run(body,globals),expected));
test('invalid octal and unsupported wide integer fail explicitly',()=>{for(const literal of ['08','09','4294967296U'])assert.throws(()=>compileHal('int main(void){int x='+literal+';}'),/8진수|32비트/);});
test('inline sizeof and switch preserve execution and helper returns',()=>{
 const helper='int calls; double sizeOnly(void){calls++;return 1;} int choose(int n){switch(n){case 1:return 7;default:return 9;} return 99;}';
 const body='result=sizeof(uint32_t)+sizeof(sizeOnly())+choose(1);result=result*10+calls;';
 const generated=inlineStatements(body,helper);
 assert.doesNotMatch(generated,/undefined|sizeOnly\(\)|choose\(/);
 assert.equal(run(generated,'int calls;'),190);
 assert.equal(run(inlineStatements('int x=0;switch(1){case 1:x=2;case 2:x+=3;break;default:x=9;}result=x;')),5);
});
