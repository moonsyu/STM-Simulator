import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const require = createRequire(import.meta.url);
const {cleanBuildOutputs, cleanArtifactOutput, makePlan} = require('../scripts/clean-build.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stm-build-cleanup-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const write = async (name, text = 'fixture') => {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, text);
    return target;
  };
  return {root, write};
}

test('build cleanup removes both product names and obsolete generated bundles', async t => {
  const {root, write} = await fixture(t);
  const generated = [
    'dist/STM-Emulator-0.5.1-win-x64.exe', 'dist/STM-Simulator-0.7.0-win-x64.exe',
    'dist/stm-emulator-0.6.0-x64.nsis.7z', 'dist/stm-simulator-0.7.0-x64.nsis.7z',
    'dist/artifact-0.5.1/STM-Emulator-0.5.1-win-x64.exe', 'dist/artifact-0.6.0/docs/HAL-API.md',
    'dist/artifact/STM-Simulator-0.7.0-win-x64.exe', 'dist/artifact/BUILD-INFO.json',
    'dist/artifact/SHA256.txt', 'dist/artifact/LICENSES.chromium.html',
    'dist/win-unpacked/STM Emulator.exe', 'dist/win-unpacked/STM Simulator.exe',
    'dist/win-unpacked/resources/app.asar', 'dist/win-unpacked/locales/ko.pak',
    'dist/win-unpacked/dxcompiler.dll', 'dist/builder-debug.yml'
  ];
  for (const name of generated) await write(name);
  await write('dist/user-project.json', 'saved circuit');
  await write('dist/unrelated.exe', 'user executable');
  await write('dist/user-archive.7z', 'user archive');
  await write('dist/stm-simulator-project-x64.nsis.7z', 'not a generated version');
  await write('dist/artifact-personal/notes.txt', 'user notes');
  await write('STM-Emulator-0.5.1-win-x64.exe', 'outside dist');
  const result = await cleanBuildOutputs(root);
  assert.equal(result.files, generated.length);
  assert.deepEqual((await fs.readdir(path.join(root, 'dist'))).sort(), ['artifact-personal', 'stm-simulator-project-x64.nsis.7z', 'unrelated.exe', 'user-archive.7z', 'user-project.json']);
  assert.equal(await fs.readFile(path.join(root, 'dist/user-archive.7z'), 'utf8'), 'user archive');
  assert.equal(await fs.readFile(path.join(root, 'dist/stm-simulator-project-x64.nsis.7z'), 'utf8'), 'not a generated version');
  assert.equal(await fs.readFile(path.join(root, 'dist/user-project.json'), 'utf8'), 'saved circuit');
  assert.equal(await fs.readFile(path.join(root, 'dist/artifact-personal/notes.txt'), 'utf8'), 'user notes');
  assert.equal(await fs.readFile(path.join(root, 'STM-Emulator-0.5.1-win-x64.exe'), 'utf8'), 'outside dist');
});

test('artifact preparation replaces only the fixed bundle and preserves the current build input', async t => {
  const {root, write} = await fixture(t);
  await write('dist/artifact/STM-Emulator-0.6.0-win-x64.exe');
  await write('dist/artifact/README.md');
  await write('dist/artifact/docs/HAL-API.md');
  await write('dist/STM-Simulator-0.7.0-win-x64.exe', 'new binary');
  await write('dist/win-unpacked/resources/app.asar', 'new archive');
  const result = await cleanArtifactOutput(root);
  assert.equal(result.files, 3);
  assert.equal(await fs.readFile(path.join(root, 'dist/STM-Simulator-0.7.0-win-x64.exe'), 'utf8'), 'new binary');
  assert.equal(await fs.readFile(path.join(root, 'dist/win-unpacked/resources/app.asar'), 'utf8'), 'new archive');
  await assert.rejects(fs.stat(path.join(root, 'dist/artifact')), {code: 'ENOENT'});
});

for (const location of ['artifact', 'artifact-0.5.1', 'win-unpacked']) {
  test(`unknown files in ${location} abort the whole cleanup before deleting any output`, async t => {
    const {root, write} = await fixture(t);
    const latest = await write('dist/STM-Simulator-0.7.0-win-x64.exe', 'latest');
    const userFile = await write(`dist/${location}/my-circuit.json`, 'user circuit');
    await assert.rejects(cleanBuildOutputs(root), /확인할 수 없는 파일/);
    assert.equal(await fs.readFile(latest, 'utf8'), 'latest');
    assert.equal(await fs.readFile(userFile, 'utf8'), 'user circuit');
  });
}

test('a locked candidate prevents all removals, including the good latest bundle', async t => {
  const {root, write} = await fixture(t);
  const latest = await write('dist/artifact/STM-Simulator-0.7.0-win-x64.exe', 'latest');
  const old = await write('dist/artifact-0.5.1/STM-Emulator-0.5.1-win-x64.exe', 'running');
  await assert.rejects(cleanBuildOutputs(root, {preflight: async plan => {
    assert.ok(plan.files.includes(old));
    assert.ok(plan.files.includes(latest));
    throw new Error('실행 중인 앱을 종료하고 다시 빌드하세요.');
  }}), /실행 중인 앱/);
  assert.equal(await fs.readFile(latest, 'utf8'), 'latest');
  assert.equal(await fs.readFile(old, 'utf8'), 'running');
});

test('Windows file sharing locks show an actionable error before any deletion', {skip: process.platform !== 'win32'}, async t => {
  const {root, write} = await fixture(t);
  const latest = await write('dist/artifact/STM-Simulator-0.7.0-win-x64.exe', 'latest');
  const old = await write('dist/artifact-0.5.1/STM-Emulator-0.5.1-win-x64.exe', 'running');
  const script = `$ErrorActionPreference = 'Stop'; $cleanupLock = [IO.File]::Open($env:STM_CLEANUP_TEST_LOCK, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read); try { [Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null } finally { $cleanupLock.Dispose() }`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    windowsHide: true, env: {...process.env, STM_CLEANUP_TEST_LOCK: old}, stdio: ['pipe', 'pipe', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out creating an isolated file lock')), 10000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Lock helper exited early: ${code}`)); });
      child.stdout.on('data', bytes => { if (bytes.toString().includes('READY')) { clearTimeout(timeout); resolve(); } });
    });
    await assert.rejects(cleanBuildOutputs(root), /실행 중인 STM Emulator \/ STM Simulator를 저장 후 종료/);
    assert.equal(await fs.readFile(latest, 'utf8'), 'latest');
    assert.equal(await fs.readFile(old, 'utf8'), 'running');
  } finally {
    const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve();
    child.stdin.end('release\n');
    await exited;
  }
});

test('dist junction or symlink cannot redirect deletion outside the project', async t => {
  const {root, write} = await fixture(t);
  const outside = path.join(root, 'outside');
  const target = await write('outside/STM-Emulator-0.5.1-win-x64.exe', 'keep');
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  await fs.symlink(outside, path.join(repo, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cleanBuildOutputs(repo), /dist가 링크/);
  assert.equal(await fs.readFile(target, 'utf8'), 'keep');
});

test('generated output junctions abort without touching targets or other outputs', async t => {
  const {root, write} = await fixture(t);
  const target = await write('outside/README.md', 'keep');
  const latest = await write('dist/STM-Simulator-0.7.0-win-x64.exe', 'latest');
  await fs.symlink(path.dirname(target), path.join(root, 'dist/artifact'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cleanBuildOutputs(root), /실제 폴더가 아닙니다/);
  assert.equal(await fs.readFile(target, 'utf8'), 'keep');
  assert.equal(await fs.readFile(latest, 'utf8'), 'latest');
});

test('nested output junctions are rejected and unrelated root links are preserved', async t => {
  const {root, write} = await fixture(t);
  const target = await write('outside/HAL-API.md', 'keep');
  const latest = await write('dist/artifact/STM-Simulator-0.7.0-win-x64.exe', 'latest');
  await fs.symlink(path.dirname(target), path.join(root, 'dist/artifact/docs'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.symlink(path.dirname(target), path.join(root, 'dist/user-link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cleanBuildOutputs(root), /링크가 있습니다/);
  assert.equal(await fs.readFile(latest, 'utf8'), 'latest');
  assert.equal(await fs.readFile(target, 'utf8'), 'keep');
  await fs.unlink(path.join(root, 'dist/artifact/docs'));
  await cleanBuildOutputs(root);
  assert.ok((await fs.lstat(path.join(root, 'dist/user-link'))).isSymbolicLink());
  assert.equal(await fs.readFile(target, 'utf8'), 'keep');
});

test('first build with no dist succeeds and planning never mutates files', async t => {
  const {root, write} = await fixture(t);
  assert.deepEqual(await cleanBuildOutputs(root), {files: 0, directories: 0});
  const target = await write('dist/STM-Simulator-0.7.0-beta.1-win-x64.exe', 'keep until execution');
  const plan = await makePlan(root);
  assert.deepEqual(plan.files, [target]);
  assert.equal(await fs.readFile(target, 'utf8'), 'keep until execution');
});

test('dist replacement after preflight cannot redirect a verified cleanup plan', async t => {
  const {root, write} = await fixture(t);
  const name = 'STM-Simulator-0.7.0-win-x64.exe';
  await write(`dist/${name}`, 'planned');
  const outside = await write(`outside/${name}`, 'outside');
  await assert.rejects(cleanBuildOutputs(root, {preflight: async () => {
    await fs.rename(path.join(root, 'dist'), path.join(root, 'saved-dist'));
    await fs.symlink(path.join(root, 'outside'), path.join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  }}), /dist 경로가 변경/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'outside');
  assert.equal(await fs.readFile(path.join(root, 'saved-dist', name), 'utf8'), 'planned');
});

test('cleanup supports Korean project paths without shell interpolation', async t => {
  const {root, write} = await fixture(t);
  const project = path.join(root, '한글 프로젝트 $(literal)');
  await write('한글 프로젝트 $(literal)/dist/artifact/STM-Simulator-0.7.0-win-x64.exe');
  assert.deepEqual(await cleanBuildOutputs(project), {files: 1, directories: 1});
  assert.deepEqual(await fs.readdir(path.join(project, 'dist')), []);
});
