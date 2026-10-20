// Firmware fixture catalogue shared by the build script and the tests.
// Example fixtures reuse the app's own HAL examples (circuit + Cube-style main.c);
// hand-written fixtures keep their sources in src/<name>/ and build a circuit here.
import { applyHalExample } from '../../../src/hal-examples.js';
import { blankProject, exampleProject } from '../../../src/project.js';
import { defaultMcu } from '../../../src/mcu-config.js';
import { boardPin } from '../../../src/pins.js';

const example = kind => () => applyHalExample(blankProject(), kind);
const wire = (p, from, to, color = '#23a68a') => p.wires.push({ id: 'w' + (p.wires.length + 1), from: from.startsWith('part:') ? from : boardPin(from), to: to.startsWith('part:') ? to : boardPin(to), color });
function custom(build) {
  return () => { const p = exampleProject(); p.name = 'firmware fixture'; p.mcu = defaultMcu(); p.components = []; p.wires = []; p.simulation = { stepMs: 1, pwmWaveform: false }; build(p); return p; };
}

export const FIXTURES = {
  blink: { project: example('blink') },
  exti: { project: example('exti') },
  uart: { project: example('uart') },
  adc: { project: example('adc') },
  pwm: { project: example('pwm') },
  i2c: { project: example('i2c') },
  spi: { project: example('spi') },
  lcd: { project: example('lcd') },
  potentiometer: { project: example('potentiometer') },
  sht31: { project: example('sht31') },
  mpu6050: { project: example('mpu6050') },
  matrix: { project: example('matrix') },
  timer_capture: { project: example('timer_capture') },
  timer_encoder: { project: example('timer_encoder') },
  timer_multi: { project: example('timer_multi') },
  sd_spi: { project: example('ref_sd_storage_board') },
  can: { project: example('ref_can_transceiver_6') },
  i2s: { project: example('ref_max98357a_9') },
  ov2640: { project: example('ref_ov2640_camera') },
  fault: { handwritten: true, project: custom(() => {}) },
  uart_dma: { handwritten: true, project: custom(() => {}) },
  usart_sync: {
    handwritten: true,
    project: custom(p => {
      p.components.push({ id: 'mem', name: 'SPI1', type: 'spi', x: 820, y: 260, rotation: 0 });
      wire(p, '3V3', 'part:mem:p1'); wire(p, 'GND', 'part:mem:p2'); wire(p, 'PB6', 'part:mem:p3');
      wire(p, 'PA8', 'part:mem:p4'); wire(p, 'PA9', 'part:mem:p5'); wire(p, 'PA10', 'part:mem:p6');
    }),
  },
  adc_dma: {
    handwritten: true,
    project: custom(p => {
      // PA0: potentiometer wiper (3V3–pot–GND), PA1: 10k/10k divider.
      p.components.push({ id: 'pot', name: 'VR1', type: 'potentiometer', value: 10000, position: 25, x: 800, y: 200, rotation: 0 });
      p.components.push({ id: 'r1', name: 'R1', type: 'resistor', value: 10000, x: 800, y: 300, rotation: 0, span: 70 }, { id: 'r2', name: 'R2', type: 'resistor', value: 10000, x: 800, y: 360, rotation: 0, span: 70 });
      wire(p, '3V3', 'part:pot:p1'); wire(p, 'GND', 'part:pot:p3'); wire(p, 'PA0', 'part:pot:p2');
      wire(p, '3V3', 'part:r1:a'); wire(p, 'part:r1:b', 'part:r2:a'); wire(p, 'part:r2:b', 'GND'); wire(p, 'PA1', 'part:r1:b');
    }),
  },
  nvic: { handwritten: true, project: custom(() => {}) },
  dcmi: { handwritten: true, extra: ['hal:stm32f4xx_hal_dcmi.c'], project: custom(() => {}) },
  sdio: { handwritten: true, extra: ['hal:stm32f4xx_hal_sd.c', 'hal:stm32f4xx_ll_sdmmc.c'], project: custom(() => {}) },
  watchdog: { handwritten: true, extra: ['hal:stm32f4xx_hal_iwdg.c'], project: custom(() => {}) },
};
