// Feature 33: one r_iic_slave program and the master's transfers that both engines run (the interpreter in
// tests/unit/ra-iic-slave.test.js, the real FSP on the emulator in tests/toolchain/ra-iic-slave.test.mjs), with the
// callback events [i2c_slave_event_t, p_args->bytes] r_iic_slave.c gives for each.
// Events: 1 ABORTED, 2 RX_COMPLETE, 3 TX_COMPLETE, 4 RX_REQUEST, 5 TX_REQUEST, 6 RX_MORE_REQUEST, 7 TX_MORE_REQUEST.
import {raDefaultMcu} from '../../../src/ra-config.js';

export function slaveProbeMcu(){
 const m=raDefaultMcu();m.pins.P400={function:'Peripheral',signal:'IIC0_SCL'};m.pins.P401={function:'Peripheral',signal:'IIC0_SDA'};
 m.peripherals={IIC0:{enabled:true,mode:'SLAVE',rate:'STANDARD',slave:0x42,callback:'i2c_slave0_callback',priority:12}};return m;
}
// The callback answers by the number of the transfer (`step` counts the transfers that ended).
export const SLAVE_PROBE=`#include "hal_data.h"
void R_BSP_WarmStart(bsp_warm_start_event_t event);
void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event)
    {
        R_IOPORT_Open(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}
void external_irq1_callback(external_irq_callback_args_t *p_args) { (void) p_args; }

volatile uint32_t n = 0, step = 0, err_open = 99, err_again = 99;
volatile uint8_t ev[40];
volatile uint32_t nb[40];
uint8_t rx[8];
uint8_t tx[4] = { 0xA1, 0xB2, 0xC3, 0xD4 };

void i2c_slave0_callback(i2c_slave_callback_args_t *p_args)
{
    if (n < 40)
    {
        ev[n] = (uint8_t) p_args->event;
        nb[n] = p_args->bytes;
        n++;
    }
    switch (p_args->event)
    {
        case I2C_SLAVE_EVENT_RX_REQUEST:
        {
            if ((0 == step) || (6 == step)) { R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, rx, 4); }
            else if ((1 == step) || (2 == step)) { R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, rx, 2); }
            break;
        }
        case I2C_SLAVE_EVENT_RX_MORE_REQUEST:
        {
            if (1 == step) { R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, rx, 0); }
            else if (2 == step) { R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, &rx[2], 2); }
            break;
        }
        case I2C_SLAVE_EVENT_TX_REQUEST:
        {
            if (3 == step) { R_IIC_SLAVE_Write(&g_i2c_slave0_ctrl, tx, 4); }
            else if (4 == step) { R_IIC_SLAVE_Write(&g_i2c_slave0_ctrl, tx, 2); }
            break;
        }
        case I2C_SLAVE_EVENT_TX_MORE_REQUEST:
        {
            if (4 == step) { R_IIC_SLAVE_Write(&g_i2c_slave0_ctrl, &tx[2], 1); }
            break;
        }
        default:
        {
            step++;
            break;
        }
    }
}

void hal_entry(void)
{
    err_open = R_IIC_SLAVE_Open(&g_i2c_slave0_ctrl, &g_i2c_slave0_cfg);
    err_again = R_IIC_SLAVE_Open(&g_i2c_slave0_ctrl, &g_i2c_slave0_cfg);
    while (1)
    {
    }
}
`;
// The same transfers from an ESP32 sketch (Wire master on GPIO21/GPIO22, wired as in the ra_iic_slave example), then a
// write of no bytes (a bus scan). What the sketch prints is the same on both engines.
export const SLAVE_SKETCH=`#include <Wire.h>
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  delay(100);
  Wire.beginTransmission(0x42); Wire.write(0x11); Wire.write(0x22);
  int e0 = Wire.endTransmission();
  Serial.printf("S0 e=%d\\n", e0);
  delay(30);
  Wire.beginTransmission(0x42); Wire.write(0x31); Wire.write(0x32); Wire.write(0x33); Wire.write(0x34);
  int e1 = Wire.endTransmission();
  Serial.printf("S1 e=%d\\n", e1);
  delay(30);
  Wire.beginTransmission(0x42); Wire.write(0x41); Wire.write(0x42); Wire.write(0x43); Wire.write(0x44);
  int e2 = Wire.endTransmission();
  Serial.printf("S2 e=%d\\n", e2);
  delay(30);
  int g3 = Wire.requestFrom(0x42, 2);
  int a3 = Wire.read(); int b3 = Wire.read();
  Serial.printf("S3 got=%d %d %d\\n", g3, a3, b3);
  delay(30);
  int g4 = Wire.requestFrom(0x42, 4);
  int a4 = Wire.read(); int b4 = Wire.read(); int c4 = Wire.read(); int d4 = Wire.read();
  Serial.printf("S4 got=%d %d %d %d %d\\n", g4, a4, b4, c4, d4);
  delay(30);
  Wire.beginTransmission(0x42); Wire.write(0x55);
  int e5 = Wire.endTransmission();
  Serial.printf("S5 e=%d\\n", e5);
  delay(30);
  Wire.beginTransmission(0x42); Wire.write(0x66); Wire.write(0x67);
  int e6 = Wire.endTransmission();
  Serial.printf("S6 e=%d\\n", e6);
  delay(30);
  int g7 = Wire.requestFrom(0x42, 1);
  int a7 = Wire.read();
  Serial.printf("S7 got=%d %d\\n", g7, a7);
  delay(30);
  Wire.beginTransmission(0x42);
  int e8 = Wire.endTransmission();
  Serial.printf("S8 e=%d\\n", e8);
}
void loop() {
  delay(100);
}
`;
// NACK ends a write with error 2; the write the callback does not serve was ACKed (error 0) and aborted afterwards.
export const SLAVE_SKETCH_LINES=Object.freeze(['S0 e=0','S1 e=2','S2 e=0','S3 got=2 161 178','S4 got=4 161 178 195 195','S5 e=0','S6 e=2','S7 got=1 255','S8 e=0']);
// The write of no bytes: no buffer was asked for, so r_iic_slave reports TX_COMPLETE, and its count is one less than 0
// because the Read(4) of transfer 6 had taken 1 byte (the "total > loaded" correction of iic_err_slave).
export const SLAVE_SKETCH_EVENTS=()=>[...SLAVE_SEQUENCES.flatMap(q=>q.events),[3,0xffffffff]];
/** The probe program on the board with the ESP32 master of the ra_iic_slave example's circuit. */
export function slaveSketchProject(base,circuit,code=SLAVE_PROBE){
 const p={...base,mcu:slaveProbeMcu(),code};p.components=circuit.components.map(c=>c.type==='devboard'?{...c,code:SLAVE_SKETCH}:c);p.wires=circuit.wires;delete p.surfaces;return p;
}
// In order (the program counts them): what the master does, the callback's events, the ACK of each written byte, the
// bytes read, the slave's buffer.
export const SLAVE_SEQUENCES=Object.freeze([
 {name:'0 write 2 into Read(4)',write:[0x11,0x22],events:[[4,0],[2,2]],acks:[true,true],received:[0x11,0x22]},
 {name:'1 write 4 into Read(2), then Read(0): NACK',write:[0x31,0x32,0x33,0x34],events:[[4,0],[6,2],[2,2]],acks:[true,true,true,false],received:[0x31,0x32]},
 {name:'2 write 4 into Read(2) and Read(2) more',write:[0x41,0x42,0x43,0x44],events:[[4,0],[6,2],[2,4]],acks:[true,true,true,true],received:[0x41,0x42,0x43,0x44]},
 {name:'3 read 2 of Write(4)',read:2,events:[[5,0],[3,2]],data:[0xa1,0xb2]},
 {name:'4 read 4 of Write(2) and Write(1) twice more',read:4,events:[[5,0],[7,2],[7,3],[3,4]],data:[0xa1,0xb2,0xc3,0xc3]},
 {name:'5 write without R_IIC_SLAVE_Read: SCL held to the time-out, ABORTED',write:[0x55],events:[[4,0],[1,0]],acks:[true],settle:20},
 {name:'6 the write after the abort: its first byte still gets the NACK left set',write:[0x66,0x67],events:[[4,0],[2,1]],acks:[false],received:[0x66]},
 {name:'7 read without R_IIC_SLAVE_Write: 0xFF after the time-out, ABORTED',read:1,events:[[5,0],[1,0]],data:[0xff],settle:20}
]);
