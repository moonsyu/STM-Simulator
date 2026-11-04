// What an OpenOCD failure tells the person at the board (desktop/native-ide.cjs openocdHint).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {openocdHint}=createRequire(import.meta.url)('../../desktop/native-ide.cjs');

// The log of a NUCLEO-F103RB whose ST-LINK debug interface has no Windows driver (2026-11-04, this repository's PC).
const NO_DRIVER=`xPack Open On-Chip Debugger 0.12.0+dev-02228-ge5888bda3-dirty (2025-10-04-22:44)
Warn : DEPRECATED: auto-selecting transport "swd (dapdirect)". Use 'transport select swd' to suppress this message.
Info : tcl server disabled
Info : telnet server disabled
Error: libusb_open() failed with LIBUSB_ERROR_NOT_FOUND
Error: open failed`;

test('a missing ST-LINK USB driver is named, with what to install',()=>{
 assert.match(openocdHint(NO_DRIVER),/ST-LINK USB 드라이버가 설치되어 있지 않습니다[\s\S]*STSW-LINK009[\s\S]*STM32CubeProgrammer/);
});
test('each kind of failure gets its own advice; an unknown log gets none',()=>{
 assert.match(openocdHint('Error: libusb_open() failed with LIBUSB_ERROR_ACCESS\nError: open failed'),/다른 프로그램/);
 assert.match(openocdHint("Error: couldn't bind gdb to socket on port 3333: Address already in use"),/3333/);
 assert.match(openocdHint('Info : Target voltage: 0.012345\nError: init mode failed (unable to connect to the target)'),/전원/);
 assert.match(openocdHint('Error: init mode failed (unable to connect to the target)'),/RESET 버튼/);
 assert.match(openocdHint('Error: open failed'),/USB 케이블/);
 assert.equal(openocdHint('Info : Listening on port 3333 for gdb connections'),null);
 assert.equal(openocdHint(''),null);
});
