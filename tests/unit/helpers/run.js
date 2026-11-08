// Small runners for C programs: HAL main.c through a real SimulationSession, sketches through the bare Runtime.
import {compile} from '../../../src/parser.js';
import {Runtime} from '../../../src/runtime.js';
import {SimulationSession} from '../../../src/session.js';
import {blankProject} from '../../../src/project.js';

/** Runs `code` as main.c of a blank HAL project. Returns {session, out, error, location}. */
export function runHal(code,{ms=50,files=[],project}={}){
  const p=project??blankProject();p.code=code;if(files.length)p.firmware={...p.firmware,files};
  const out=[];let session,error=null,location=null;
  try{session=new SimulationSession(p,{print:v=>out.push(String(v))});session.tick(ms);}
  catch(e){error=e;location=e.location??session?.runtime.location??null;}
  return {session,out,error,location,vars:session?.runtime.vars};
}
/** Wraps statements into `int main(void){...}` and returns printed lines; throws on any error. */
export function halLines(body,globals='',ms=50){
  const r=runHal(`#include <stdio.h>\n${globals}\nint main(void){\n${body}\n  while (1) { HAL_Delay(10); }\n}`,{ms});
  if(r.error)throw r.error;return r.out;
}
/** Returns the error thrown by a HAL program (and its location), failing if none is thrown. */
export function halError(code,ms=50){
  const r=runHal(code,{ms});if(!r.error)throw new Error('expected the program to fail, output: '+JSON.stringify(r.out));return r;
}
export function runSketch(code,{ms=0,...api}={}){
  const out=[];const runtime=new Runtime(compile(code),{print:v=>out.push(String(v)),...api});runtime.tick(ms);return {runtime,out};
}
