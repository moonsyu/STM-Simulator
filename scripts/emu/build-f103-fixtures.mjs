// Builds the NUCLEO-F103RB firmware emulator fixtures: HAL examples ported to the F103RB, compiled with the
// app's own ARM GCC pipeline (desktop/native-build.cjs → STM32CubeF1 HAL + CMSIS startup).
//
//   node scripts/emu/build-f103-fixtures.mjs [exampleId ...]
//
// Tools are auto-detected like the app does (STM-Simulator-Tools, STM32CubeIDE); ARM_GCC and
// STM32CUBE_F1_ROOT override them. Output: tests/fixtures/firmware-f103/<id>.elf and <id>.json (project).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCb);

export const F103_FIXTURES = ['blink', 'exti', 'uart', 'adc', 'pwm', 'i2c', 'spi', 'dma_uart_echo', 'adc_dma_scan', 'timer_capture', 'timer_encoder', 'ref_can_transceiver_6'];

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { prepareBuild, build, detectTools } = require(path.join(root, 'desktop/native-build.cjs'));
const { blankProject } = await import('../../src/project.js');
const { applyHalExample } = await import('../../src/hal-examples.js');
const out = path.join(root, 'tests/fixtures/firmware-f103');
const tools = await detectTools({ armGcc: process.env.ARM_GCC || '' });
if (!tools.armGcc || !tools.cubeF1) throw new Error('ARM GCC와 STM32CubeF1이 필요합니다.');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : F103_FIXTURES;
await fs.mkdir(out, { recursive: true });
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stm-f103-'));
try {
  for (const id of ids) {
    const project = applyHalExample({ ...blankProject('STM32F103RB'), boardId: 'nucleo-f103rb' }, id);
    const result = await build(await prepareBuild({ project, tools, root: work, target: 'arm', configuration: 'Debug' }), { onOutput: () => {} });
    // The emulator uses the symbol table and .debug_line only; the -g3 macro / DIE sections are dropped (as for the F446 fixtures).
    const objcopy = tools.armGcc.replace(/gcc(\.exe)?$/, (_, e) => 'objcopy' + (e || ''));
    await execFile(objcopy, [...['.debug_macro', '.debug_str', '.debug_info', '.debug_abbrev', '.debug_rnglists', '.debug_loclists', '.debug_aranges', '.debug_frame', '.debug_str_offsets'].map(n => '--remove-section=' + n), result.elf, path.join(out, id + '.elf')]);
    await fs.writeFile(path.join(out, id + '.json'), JSON.stringify(project));
    console.log(id, (await fs.stat(path.join(out, id + '.elf'))).size, 'bytes');
  }
} finally { await fs.rm(work, { recursive: true, force: true }); }
