import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';
export const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'RISING',initial:0,label:'',...extra});
// Builds a HAL project from MCU settings plus user globals/init/loop/callback code.
export function halProject({pins={},peripherals={},nvic={},dma,clock,globals='',init='',loop='    HAL_Delay(10);',extra='',components=[],wires=[],simulation,code}={}){
 const p=blankProject();Object.assign(p.mcu.pins,pins);Object.assign(p.mcu.peripherals,peripherals);Object.assign(p.mcu.nvic,nvic);if(dma)p.mcu.dma=dma;if(clock)p.mcu.timerClockHz=clock;
 p.components=components;p.wires=wires;if(components.length||wires.length)p.surfaces.board.hidden=false;if(simulation)p.simulation=simulation;
 if(code){p.code=code;return p;}
 p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {',globals+'\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+init).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n'+loop)+'\n'+extra+'\n';
 return p;
}
export function run(p,options={}){const output=[],warnings=[],session=new SimulationSession(p,{print:x=>output.push(x),warn:x=>warnings.push(x),...options});session.tick(0);return {s:session,session,output,warnings};}
export function advance(s,to,step=1){for(let t=Math.ceil((s.runtime.time+1e-9)/step)*step;t<=to+1e-9;t+=step)s.tick(Math.min(t,to));}
