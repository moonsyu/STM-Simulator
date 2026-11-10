// SPI "Transmit Only Master" (SCK and MOSI, no MISO pin): the mode CubeMX offers for displays, DACs and shift
// registers. 12 of 190 real .ioc files use it or a half-duplex mode, and the import stopped at "MISO 핀을 활성화하세요".
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal,validateMcu,configProblems,importIoc} from '../../src/mcu-config.js';
import {exportIoc} from '../../src/ioc-export.js';
import {SimulationSession} from '../../src/session.js';

const pin=(fn,label='')=>({function:fn,pull:'NOPULL',edge:'FALLING',label,initial:0});
const mcuOf=direction=>{const p=blankProject();p.mcu.pins={PA5:pin('SPI1_SCK'),PA7:pin('SPI1_MOSI'),PB6:pin('GPIO_Output','CS')};p.mcu.peripherals={SPI1:{enabled:true,...(direction?{direction}:{})}};return p;};

test('without a MISO pin SPI1 is complete as Transmit Only Master, and incomplete as Full-Duplex',()=>{
 assert.deepEqual(configProblems(validateMcu(mcuOf('TX_ONLY').mcu)),[]);
 assert.deepEqual(configProblems(validateMcu(mcuOf().mcu)),['SPI1: MISO 핀을 활성화하세요.']);
 assert.throws(()=>validateMcu({...mcuOf().mcu,peripherals:{SPI1:{enabled:true,direction:'RX_ONLY'}}}),/SPI1\.direction/);
});

test('the generated code transmits on the interpreter; a receive reads 0xFF',()=>{
 const p=mcuOf('TX_ONLY');p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */',String.raw`  /* USER CODE BEGIN 2 */
  uint8_t tx[2] = {0xA5, 0x3C}, rx = 0;
  HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_RESET);
  HAL_StatusTypeDef a = HAL_SPI_Transmit(&hspi1, tx, 2, 100);
  HAL_StatusTypeDef b = HAL_SPI_Receive(&hspi1, &rx, 1, 100);
  HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_SET);
  printf("%d %d %02X\n", a == HAL_OK, b == HAL_OK, rx);`);
 assert.match(p.code,/SPI_DIRECTION_2LINES/);assert.ok(!/MISO/.test(p.code));
 const out=[],warn=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:w=>warn.push(w)});s.tick(0);for(let t=10;t<=50;t+=10)s.tick(t);
 assert.deepEqual(out,['1 1 FF']);assert.deepEqual(warn,[]);
});

test('.ioc: Transmit Only Master and half-duplex come in as TX_ONLY (half-duplex with a note); export and import agree',()=>{
 const head='Mcu.Family=STM32F4\nMcu.Name=STM32F446R(C-E)Tx\nMcu.UserName=STM32F446RETx\nMcu.IP0=SPI1\n';
 const tx=importIoc(head+'PA5.Mode=TX_Only_Simplex_Unidirect_Master\nPA5.Signal=SPI1_SCK\nPA7.Mode=TX_Only_Simplex_Unidirect_Master\nPA7.Signal=SPI1_MOSI\nSPI1.Direction=SPI_DIRECTION_2LINES\nSPI1.Mode=SPI_MODE_MASTER\nSPI1.VirtualType=VM_MASTER\n');
 assert.equal(tx.config.peripherals.SPI1.direction,'TX_ONLY');assert.deepEqual(tx.warnings,[]);
 const half=importIoc(head+'PA5.Mode=Simplex_Bidirectional_Master\nPA5.Signal=SPI1_SCK\nPA7.Mode=Simplex_Bidirectional_Master\nPA7.Signal=SPI1_MOSI\nSPI1.Direction=SPI_DIRECTION_1LINE\nSPI1.Mode=SPI_MODE_MASTER\n');
 assert.equal(half.config.peripherals.SPI1.direction,'TX_ONLY');assert.deepEqual(half.warnings,['SPI1: 반이중(1선) 모드는 송신 전용으로 가져왔습니다. 같은 선으로 받는 동작은 실행 모델에 없습니다.']);
 const v=validateMcu(mcuOf('TX_ONLY').mcu);assert.deepEqual(importIoc(exportIoc(v)).config,v);
 // With all three pins it stays full duplex.
 assert.equal(importIoc(head+'PA5.Signal=SPI1_SCK\nPA6.Signal=SPI1_MISO\nPA7.Signal=SPI1_MOSI\n').config.peripherals.SPI1.direction,undefined);
});
