// Delete only recognized build outputs. Validate every candidate before deleting any.
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const PORTABLE = new RegExp(`^STM-(?:Emulator|Simulator)-${VERSION}-win-x64\\.exe$`, 'i');
const RELEASE_ZIP = new RegExp(`^STM-Simulator-${VERSION}-Windows-x64\\.zip$`, 'i');
const NSIS_ARCHIVE = new RegExp(`^stm-(?:emulator|simulator)-${VERSION}-x64\\.nsis\\.7z$`, 'i');
const VERSIONED_ARTIFACT = new RegExp(`^artifact-${VERSION}$`, 'i');
const BUNDLE_FILES = new Set(['LICENSE.electron.txt', 'LICENSES.chromium.html', 'README.md', 'THIRD_PARTY_NOTICES.md', 'SHA256.txt', 'BUILD-INFO.json']);
const BUNDLE_DOCS = new Set(['COPYRIGHT-REVIEW.md', 'SKETCH-API.md', 'HAL-API.md']);
const RUNTIME_FILES = new Set([
  'STM Emulator.exe', 'STM Simulator.exe', 'LICENSE.electron.txt', 'LICENSES.chromium.html',
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll',
  'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak', 'snapshot_blob.bin',
  'v8_context_snapshot.bin', 'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll',
  'chrome_crashpad_handler.exe', 'notification_helper.exe'
]);

function inside(base, target) {
  const relative = path.relative(base, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function statIfPresent(target) {
  try { return await fs.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function refuse(message, target) {
  throw new Error(`빌드 정리를 중단했습니다: ${message}\n${target}\n사용자 파일은 별도 위치로 옮긴 후 다시 빌드하세요.`);
}

async function makePlan(root, onlyArtifact = false, outputDirectory = 'dist') {
  root = path.resolve(root);
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) refuse('프로젝트 경로가 실제 폴더가 아닙니다.', root);
  if (!['dist', 'work/build', 'outputs'].includes(outputDirectory)) refuse('허용된 빌드 출력 경로가 아닙니다.', outputDirectory);
  const dist = path.resolve(root, outputDirectory);
  const plan = {root, dist, files: [], directories: [], paths: []};
  for (let ancestor = path.dirname(dist); ancestor !== root; ancestor = path.dirname(ancestor)) {
    const stat = await statIfPresent(ancestor);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) refuse('출력 상위 경로가 링크 또는 실제 폴더가 아닙니다.', ancestor);
  }
  const distStat = await statIfPresent(dist);
  if (!distStat) return plan;
  if (!inside(root, dist) || distStat.isSymbolicLink() || !distStat.isDirectory()) refuse('dist가 링크 또는 실제 폴더가 아닌 경로입니다.', dist);
  const realRoot = await fs.realpath(root);
  const realDist = await fs.realpath(dist);
  if (!inside(realRoot, realDist)) refuse('dist가 프로젝트 경로 밖을 가리킵니다.', dist);
  plan.realDist = realDist;
  plan.paths.push(dist);

  async function inspect(target, kind, relative = '') {
    if (!inside(dist, target)) refuse('삭제 대상이 dist 밖에 있습니다.', target);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) refuse('빌드 출력에 링크가 있습니다. 링크 대상은 삭제하지 않습니다.', target);
    if (!inside(realDist, await fs.realpath(target))) refuse('삭제 대상이 실제 dist 경로 밖에 있습니다.', target);
    plan.paths.push(target);
    if (stat.isDirectory()) {
      if (relative && !((kind === 'bundle' && relative === 'docs') || (kind === 'runtime' && ['locales', 'resources'].includes(relative)))) {
        refuse('자동 삭제 대상으로 확인할 수 없는 폴더가 있습니다.', target);
      }
      for (const entry of await fs.readdir(target)) {
        await inspect(path.join(target, entry), kind, relative ? `${relative}/${entry}` : entry);
      }
      plan.directories.push(target);
    } else if (stat.isFile()) {
      const known = kind === 'file' || (kind === 'bundle'
        ? (PORTABLE.test(relative) || BUNDLE_FILES.has(relative) || (relative.startsWith('docs/') && BUNDLE_DOCS.has(relative.slice(5))))
        : (RUNTIME_FILES.has(relative) || /^locales\/[a-zA-Z0-9_-]+\.pak$/.test(relative) || relative === 'resources/app.asar' || relative === 'resources/elevate.exe'));
      if (!known) refuse('자동 삭제 대상으로 확인할 수 없는 파일이 있습니다.', target);
      plan.files.push(target);
    } else refuse('일반 파일이 아닌 출력이 있습니다.', target);
  }

  for (const name of await fs.readdir(dist)) {
    if (name === 'artifact' || (!onlyArtifact && VERSIONED_ARTIFACT.test(name))) {
      const target = path.join(dist, name);
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink()) refuse('배포 출력 경로가 실제 폴더가 아닙니다.', target);
      await inspect(target, 'bundle');
    } else if (!onlyArtifact && name === 'win-unpacked') {
      const target = path.join(dist, name);
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink()) refuse('실행 파일 출력 경로가 실제 폴더가 아닙니다.', target);
      await inspect(target, 'runtime');
    } else if (!onlyArtifact && (PORTABLE.test(name) || RELEASE_ZIP.test(name) || NSIS_ARCHIVE.test(name) || ['builder-debug.yml', 'builder-effective-config.yaml'].includes(name))) {
      const target = path.join(dist, name);
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) refuse('실행 파일 출력 경로가 일반 파일이 아닙니다.', target);
      await inspect(target, 'file');
    }
  }
  return plan;
}

async function preflightWindows(plan) {
  if (process.platform !== 'win32' || !plan.paths.length) return;
  // Pass paths as stdin JSON, never interpolate them into executable shell text.
  // Exclusive writable handles detect a running EXE before any old output is removed.
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$cleanupInput = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
$cleanupHandles = @()
try {
  foreach ($cleanupPath in $cleanupInput.paths) {
    $cleanupItem = Get-Item -LiteralPath $cleanupPath -Force
    if (($cleanupItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "링크 또는 재분석 지점은 삭제하지 않습니다: $cleanupPath" }
  }
  foreach ($cleanupPath in $cleanupInput.files) {
    $cleanupHandles += [IO.File]::Open($cleanupPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  }
} catch {
  [Console]::Error.WriteLine("$cleanupPath : $($_.Exception.Message)")
  exit 1
} finally {
  foreach ($cleanupHandle in $cleanupHandles) { $cleanupHandle.Dispose() }
}
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    input: JSON.stringify({paths: plan.paths, files: plan.files}).replace(/[^\x00-\x7f]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')),
    encoding: 'utf8', windowsHide: true, timeout: 30000
  });
  if (result.error || result.status !== 0) {
    throw new Error(`이전 빌드 파일을 정리할 수 없어 빌드를 중단했습니다. 실행 중인 STM Emulator / STM Simulator를 저장 후 종료하고 다시 빌드하세요. 파일 권한도 확인하세요. 아직 파일은 삭제하지 않았습니다.\n${result.stderr?.trim() || result.error?.message || '파일 사용 여부를 확인하지 못했습니다.'}`);
  }
}

async function executePlan(plan, {preflight = preflightWindows} = {}) {
  await preflight(plan);
  // No recursive delete: remove only individually verified files and empty folders.
  // Recheck each path immediately before mutation in case the output changed meanwhile.
  const fileSet = new Set(plan.files);
  for (const target of [...plan.files, ...plan.directories]) {
    for (let ancestor = path.dirname(plan.dist); ancestor !== plan.root; ancestor = path.dirname(ancestor)) {
      if (!inside(plan.root, ancestor) || (await fs.lstat(ancestor)).isSymbolicLink()) refuse('정리 중 출력 상위 경로가 변경되었습니다.', ancestor);
    }
    const distStat = await fs.lstat(plan.dist);
    if (distStat.isSymbolicLink() || !distStat.isDirectory() || await fs.realpath(plan.dist) !== plan.realDist) {
      refuse('정리 중 dist 경로가 변경되었습니다.', plan.dist);
    }
    for (let ancestor = path.dirname(target); ancestor !== plan.dist; ancestor = path.dirname(ancestor)) {
      if (!inside(plan.dist, ancestor) || (await fs.lstat(ancestor)).isSymbolicLink()) {
        refuse('정리 중 출력 상위 경로가 변경되었습니다.', ancestor);
      }
    }
    const stat = await fs.lstat(target);
    if (!inside(plan.dist, target) || stat.isSymbolicLink() || !inside(plan.realDist, await fs.realpath(target)) || (fileSet.has(target) ? !stat.isFile() : !stat.isDirectory())) {
      refuse('정리 중 출력 경로가 변경되었습니다.', target);
    }
    try {
      if (stat.isDirectory()) await fs.rmdir(target);
      else if (stat.isFile()) await fs.unlink(target);
      else refuse('정리 중 출력 형식이 변경되었습니다.', target);
    } catch (error) {
      throw new Error(`이전 빌드 파일 정리를 완료하지 못했습니다. 실행 중인 앱을 저장 후 종료하고 다시 빌드하세요.\n${target}\n${error.message}`);
    }
  }
  return {files: plan.files.length, directories: plan.directories.length};
}

async function cleanBuildOutputs(root, options = {}) { return executePlan(await makePlan(root, false, options.outputDirectory), options); }
async function cleanArtifactOutput(root, options = {}) { return executePlan(await makePlan(root, true, options.outputDirectory), options); }

async function cleanAllBuildOutputs(root) {
  const plans = await Promise.all(['dist', 'work/build', 'outputs'].map(directory => makePlan(root, false, directory)));
  // Check every output location before removing anything, including file locks.
  await preflightWindows({paths:plans.flatMap(p => p.paths), files:plans.flatMap(p => p.files)});
  const total = {files:0, directories:0};
  for (const plan of plans) {
    const result = await executePlan(plan, {preflight:async () => {}});
    total.files += result.files;total.directories += result.directories;
  }
  return total;
}

module.exports = {cleanBuildOutputs, cleanArtifactOutput, cleanAllBuildOutputs, makePlan, preflightWindows};

if (require.main === module) {
  cleanAllBuildOutputs(path.resolve(__dirname, '..')).then(result => {
    console.log(`이전 빌드 출력 정리 완료: 파일 ${result.files}개, 폴더 ${result.directories}개`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
