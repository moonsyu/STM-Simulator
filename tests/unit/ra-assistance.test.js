// Feature 21: Developer Assistance lists the API calls of the stacks an FSP project has, with its own instance names.
import test from 'node:test';
import assert from 'node:assert/strict';
import {raAssistance} from '../../src/ra-assistance.js';
import {raDefaultMcu,validateRaMcu} from '../../src/ra-config.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';

const names=groups=>groups.map(g=>g.name);
const item=(groups,name,label)=>groups.find(g=>g.name===name).items.find(i=>i.label===label).code;

test('the board template: g_ioport, BSP and g_external_irq1 with the pin symbols and callback of the project',()=>{
 const g=raAssistance(validateRaMcu(raDefaultMcu()));
 assert.deepEqual(names(g),['g_ioport','BSP','g_external_irq1']);
 assert.equal(item(g,'g_ioport','Call R_IOPORT_PinWrite()'),'R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);');
 assert.equal(item(g,'BSP','Call R_BSP_SoftwareDelay()'),'R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);');
 assert.equal(item(g,'g_external_irq1','Call R_ICU_ExternalIrqOpen()'),'R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);');
 assert.match(item(g,'g_external_irq1','Callback function definition'),/^void external_irq1_callback\(external_irq_callback_args_t \*p_args\)\n\{\n    if \(1 == p_args->channel\)/);
});

test('a renamed pin and callback, an input pin, and no IRQ stack when S1 is a plain input',()=>{
 const m=raDefaultMcu();m.pins.P408.label='BBQ_LED';m.pins.P205={function:'GPIO_Input',pull:'PULLUP',label:'SW1'};
 const g=raAssistance(validateRaMcu(m));
 assert.deepEqual(names(g),['g_ioport','BSP']);
 assert.match(item(g,'g_ioport','Call R_IOPORT_PinWrite()'),/BBQ_LED/);
 assert.equal(item(g,'g_ioport','Call R_IOPORT_PinRead()'),'bsp_io_level_t level;\nR_IOPORT_PinRead(&g_ioport_ctrl, SW1, &level);');
 const n=raDefaultMcu();n.pins.P205.callback='irq_callback';assert.match(item(raAssistance(validateRaMcu(n)),'g_external_irq1','Callback function definition'),/^void irq_callback\(/);
});

test('every example: a group per stack it uses, each call naming an instance the generated code has',()=>{
 const want={ra_uart_echo:'g_uart9',ra_gpt_pwm:'g_timer6',ra_adc_pot:'g_adc0',ra_agt_tick:'g_agt0',ra_iic_memory:'g_i2c_master0',ra_led4_switch2:'g_external_irq6'};
 for(const e of RA_EXAMPLES){
  const g=raAssistance(validateRaMcu(e.mcu()));assert.ok(names(g).includes('g_ioport'),e.id);
  if(want[e.id])assert.ok(names(g).includes(want[e.id]),`${e.id}: ${names(g).join(' ')}`);
  // The example's own code uses the same instance names the assistance offers.
  for(const group of g)if(/^g_(uart|timer|agt|adc|i2c_master)/.test(group.name))assert.ok(e.code.includes(group.name+'_ctrl'),`${e.id}: ${group.name}_ctrl`);
 }
 const pwm=raAssistance(validateRaMcu(RA_EXAMPLES.find(e=>e.id==='ra_gpt_pwm').mcu()));
 assert.ok(pwm.find(g=>g.name==='g_timer6').items.some(i=>i.label==='Call R_GPT_DutyCycleSet()'));
 assert.ok(!pwm.find(g=>g.name==='g_timer1').items.some(i=>i.label==='Call R_GPT_DutyCycleSet()'),'a periodic timer has no duty cycle');
});
