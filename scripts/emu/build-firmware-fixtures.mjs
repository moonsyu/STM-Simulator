// Builds the firmware emulator test fixtures with the app's own ARM GCC
// pipeline (desktop/native-build.cjs → STM32CubeF4 HAL + CMSIS startup).
//
//   node scripts/emu/build-firmware-fixtures.mjs [name ...]
//
// Environment: ARM_GCC (arm-none-eabi-gcc path), STM32CUBE_F4_ROOT (Cube root
// with Drivers/), FATFS_ROOT (stm32_mw_fatfs/source, for the SD fixture).
// Output: tests/fixtures/firmware/<name>.elf, <name>.json (project) and the
// sources under tests/fixtures/firmware/src/<name>/.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCb);
import { FIXTURES } from '../../tests/fixtures/firmware/fixtures.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { prepareBuild, build } = require(path.join(root, 'desktop/native-build.cjs'));
const out = path.join(root, 'tests/fixtures/firmware');
const tools = {
  armGcc: process.env.ARM_GCC || '/home/claude/tools/xpack-arm-none-eabi-gcc-14.2.1-1.1/bin/arm-none-eabi-gcc',
  cube: process.env.STM32CUBE_F4_ROOT || '/home/claude/tools/cubef4',
  armGdb: '', hostGcc: '', hostGdb: '', clangd: '', openocd: '', buildRoot: '',
};
const only = new Set(process.argv.slice(2));

async function sourceFiles(name) {
  const dir = path.join(out, 'src', name), files = [];
  for (const entry of await fs.readdir(dir).catch(() => [])) files.push({ name: entry, text: await fs.readFile(path.join(dir, entry), 'utf8') });
  return files;
}
async function extraFile(rel) {
  const [kind, file] = rel.split(':');
  const base = kind === 'hal' ? path.join(tools.cube, 'Drivers/STM32F4xx_HAL_Driver/Src') : kind === 'fatfs' ? (process.env.FATFS_ROOT || '/tmp/claude-0/fatfs/stm32_mw_fatfs/source') : null;
  return { name: path.basename(file), text: await fs.readFile(path.join(base, file), 'utf8') };
}

async function interruptFile(project) {
  const { isSerial, serialHandle } = await import('../../src/serial-config.js'), { isTimer } = await import('../../src/timer-config.js');
  const lines = ['#include "main.h"', 'void SysTick_Handler(void) { HAL_IncTick(); }'];
  for (const [id, p] of Object.entries(project.mcu?.peripherals || {})) if (p.enabled) { if (isSerial(id)) lines.push(`extern UART_HandleTypeDef ${serialHandle(id)};`); if (isTimer(id)) lines.push(`extern TIM_HandleTypeDef htim${id.slice(3)};`); }
  for (const [irq, p] of Object.entries(project.mcu?.nvic || {})) if (p.enabled) {
    const id = irq.replace('_IRQn', '');
    const body = isTimer(id) ? `HAL_TIM_IRQHandler(&htim${id.slice(3)});` : isSerial(id) ? `HAL_UART_IRQHandler(&${serialHandle(id)});` : Object.entries(project.mcu.pins).filter(([pin, q]) => q.function === 'GPIO_EXTI').map(([pin]) => `HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_${pin.slice(2)});`).join('');
    lines.push(`void ${id}_IRQHandler(void) { ${body} }`);
  }
  return lines.join('\n') + '\n';
}

for (const [name, fixture] of Object.entries(FIXTURES)) {
  if (only.size && !only.has(name)) continue;
  const project = await fixture.project();
  const dir = path.join(out, 'src', name);
  await fs.mkdir(dir, { recursive: true });
  // Generated example code is written to src/<name>/main.c so the source is reviewable;
  // hand-written fixtures keep their main.c there.
  if (!fixture.handwritten) await fs.writeFile(path.join(dir, 'main.c'), project.code);
  const own = await sourceFiles(name);
  project.code = own.find(f => f.name === 'main.c')?.text ?? project.code;
  const files = [...own.filter(f => f.name !== 'main.c'), ...await Promise.all((fixture.extra || []).map(extraFile))];
  // A Cube project always has stm32f4xx_it.c with strong handlers. native-build's
  // __stm_environment.c only provides *weak* SysTick/IRQ handlers, which lose to the
  // weak Default_Handler aliases of startup_stm32f446xx.s (linked first), so the
  // generated example firmware would hang in Default_Handler at the first SysTick.
  if (!fixture.handwritten && !files.some(f => f.name === 'stm32f4xx_it.c')) files.push({ name: 'stm32f4xx_it.c', text: await interruptFile(project) });
  project.firmware = { mode: 'hal', files };
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stm-fixture-'));
  try {
    const plan = await prepareBuild({ project, tools, root: work, target: 'arm', configuration: fixture.configuration || 'Debug' });
    let log = '';
    const result = await build(plan, { onOutput: t => { log += t; } }).catch(e => { console.error(log.slice(-6000)); throw e; });
    // The emulator uses the symbol table and .debug_line only; the -g3 macro / DIE
    // sections (~1 MB of strings per image) are dropped to keep the fixtures small.
    const objcopy = tools.armGcc.replace(/gcc(\.exe)?$/, (_, e) => 'objcopy' + (e || ''));
    await execFile(objcopy, [...['.debug_macro', '.debug_str', '.debug_info', '.debug_abbrev', '.debug_rnglists', '.debug_loclists', '.debug_aranges', '.debug_frame', '.debug_str_offsets'].map(n => '--remove-section=' + n), result.elf, path.join(out, name + '.elf')]);
    const stored = { ...project, firmware: { mode: 'hal', files: own.filter(f => f.name !== 'main.c') } };
    await fs.writeFile(path.join(out, name + '.json'), JSON.stringify(stored, null, 1));
    const size = (await fs.stat(result.elf)).size;
    console.log(`${name}: ${size} bytes`);
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}
