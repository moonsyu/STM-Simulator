// Read-only product audit: all generated sources and executables stay in work/.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileHal} from '../../src/hal-source.js';
import {HAL_CONSTANTS} from '../../src/hal.js';
import {Runtime} from '../../src/runtime.js';
import {inlineStatements} from '../../src/c-inline.js';
import {fixture} from '../docs-audit/runtime.mjs';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {resetMainCode} from '../../src/code-reset.js';

const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(root,process.env.AUDIT_OUT||'work/test-results/project-audit-0238/semantics');await fs.mkdir(out,{recursive:true});
const gcc=process.env.AUDIT_HOST_GCC||'C:/msys64/ucrt64/bin/gcc.exe';
const cases=[
 ['struct-padding','struct Reading { float v; uint16_t raw; };','result=sizeof(struct Reading);'],
 ['sizeof-side-effect','','int i=1; result=sizeof(i++); result=result*100+i;'],
 ['sizeof-double-expression','','double x=2; result=sizeof(x+1);'],
 ['float-pointer-index','','float a[1]={5.0f};float *p=a;result=p[0]/2;'],
 ['float-nested-member','struct A { float v; };struct B { struct A a; };','struct B b={{5.0f}};result=b.a.v/2;'],
 ['struct-initializer-width','struct A { uint8_t v; };','struct A a={300};result=a.v;'],
 ['float-struct-array','struct A { float v; };','struct A a[1]={{5.0f}};result=a[0].v/2;'],
 ['comparison-type','','result=(1.0<2.0)/2;'],
 ['unsigned-right-shift','','uint32_t x=0x80000000U;result=x>>1;'],
 ['unsigned-promotion','','uint32_t x=0xffffffffU;int y=-1;result=(x==y);'],
 ['unsigned-addition-wrap','','uint32_t x=0xffffffffU;result=x+1U;'],
 ['octal-literal','','result=010;'],
 ['enum-expression','enum E { A=1<<3, B };','result=B;'],
 ['function-return-conversion','int f(void){return 3.5;}','result=f();'],
];
const results=[];
const armGcc=path.join(root,'work/native-tools/xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const armFile=path.join(out,'arm-abi.c');
await fs.writeFile(armFile,'#include <stdint.h>\nstruct Reading {float v;uint16_t raw;};\n_Static_assert(sizeof(struct Reading)==8,"struct padding");\n_Static_assert(sizeof(double)==8,"double");\n_Static_assert(sizeof(double*)==4,"pointer");\n');
const armBuild=spawnSync(armGcc,['-std=c11','-mcpu=cortex-m4','-mthumb','-c',armFile,'-o',path.join(out,'arm-abi.o')],{encoding:'utf8',windowsHide:true});
const armAbi={compiler:armGcc,passed:armBuild.status===0,stderr:armBuild.stderr||armBuild.error?.message};
for(const [id,preamble,body]of cases){
 const source=`#include <stdint.h>\n${preamble}\ndouble result=0;\nint main(void){${body}return 0;}\n`;
 const filename=path.join(out,id+'.c'),exe=path.join(out,id+'.exe');
 await fs.writeFile(filename,'#include <stdio.h>\n#define main audit_main\n'+source+'\n#undef main\nint main(void){audit_main();printf("%.17g",result);return 0;}\n');
 const build=spawnSync(gcc,['-std=c11','-O0',filename,'-o',exe],{encoding:'utf8',windowsHide:true});
 let native,error,simulator;
 if(build.status===0){const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});native=Number(run.stdout);if(run.status!==0)error=run.stderr;}
 else error=build.stderr||build.error?.message;
 try{const r=new Runtime(compileHal(source),{constants:HAL_CONSTANTS});r.tick(0);simulator=r.vars.result;}catch(e){simulator={error:e.message};}
 const row={id,source,native,simulator,nativeError:error,mismatch:!error&&native!==simulator};results.push(row);console.log(JSON.stringify(row));
}
for(const [id,source,expected]of [['inline-sizeof','int n=sizeof(uint32_t);',4],['inline-switch','int n=0;switch(1){case 1:n=2;break;default:n=3;}',2]]){
 let generated,error,native;try{generated=inlineStatements(source);
 const filename=path.join(out,id+'.c'),exe=path.join(out,id+'.exe');await fs.writeFile(filename,'#include <stdint.h>\n#include <stdio.h>\nint main(void){'+generated+'\nprintf("%d",n);return 0;}');
 const build=spawnSync(gcc,['-std=c11',filename,'-o',exe],{encoding:'utf8',windowsHide:true});if(build.status!==0)throw Error(build.stderr||build.error?.message);const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true});if(run.status!==0)throw Error(run.stderr);native=Number(run.stdout);
 }catch(e){error=e.message;}
 results.push({id,source,generated,native,expected,error,mismatch:!!error||native!==expected});
}
for(const type of ['board','breadboard','button']){
 const f=fixture(type),first=applyDeviceExample(f.project,f.target).project;
 for(const p of Object.values(first.mcu.pins))if(p.label)p.label='Custom_'+p.label;
 let second,error;try{second=applyDeviceExample(resetMainCode(first),f.target).project;}catch(e){error=e.message;}
 await fs.writeFile(path.join(out,'reapply-'+type+'.json'),JSON.stringify({first,second,error},null,2));
 results.push({id:'custom-label-reapply-'+type,beforeParts:first.components.length,afterParts:second?.components.length,beforeWires:first.wires.length,afterWires:second?.wires.length,error,mismatch:!!error||JSON.stringify(first.components)!==JSON.stringify(second.components)||JSON.stringify(first.wires)!==JSON.stringify(second.wires)});
}
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({recordedAt:new Date().toISOString(),source:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim(),armAbi,cases:results},null,2));
console.log(JSON.stringify({checked:results.length,confirmedDifferences:results.filter(r=>r.mismatch).length}));
if(process.env.AUDIT_ASSERT&&(!armAbi.passed||results.some(r=>r.mismatch||r.nativeError)))process.exitCode=1;
