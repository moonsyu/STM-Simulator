import {halExample} from '../../src/hal-examples.js';
import {circuitFixture} from './circuits.js';
import {programFixture} from './programs.js';
import {deviceFixture} from './devices.js';
// Physical fixtures validate HAL against circuits; the product offers code only.
export function halCircuit(kind){
  const source=halExample(kind),physical=['uart','i2c','spi'].includes(kind)?programFixture(kind):['temperature','ultrasonic'].includes(kind)?deviceFixture(kind):circuitFixture(['adc','samples'].includes(kind)?'divider':'blink');
  return {...source,components:physical.components,wires:physical.wires};
}
