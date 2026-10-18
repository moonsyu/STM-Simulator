// Prepare a download from this build only; old EXEs are never included.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {cleanArtifactOutput} = require('./clean-build.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const name = pkg.build.portable.artifactName.replace('${version}', pkg.version);
  assert.equal(name, 'STM-Simulator.exe', 'Release executable filename must stay fixed');
  const dist = path.join(root, 'work', 'build');
  const unpacked = path.join(dist, 'win-unpacked');
  const output = path.join(root, 'outputs', 'artifact');
  const asar = await import('@electron/asar');
  const archive = path.join(unpacked, 'resources', 'app.asar');
  const entries = asar.listPackage(archive).map(p => p.replaceAll('\\', '/'));
  assert.ok(!entries.some(p => /^\/(assets|work|outputs|test-results|tests|scripts)(\/|$)/.test(p)), 'Reference media and test fixtures must not be packaged');
  for (const file of ['src/feature-examples.js', 'src/component-examples.js']) assert.ok(!entries.includes('/' + file), 'Removed example module must not be packaged: ' + file);
  for (const file of ['src/editor-search.js', 'src/hal-examples.js', 'src/hal-circuits.js', 'src/hal-stdio.js', 'src/device-defs.js', 'src/device-buses.js', 'src/device-motion.js', 'src/device-examples.js', 'src/device-ui.js']) assert.ok(entries.includes('/' + file), 'Missing HAL module: ' + file);
  for (const file of entries.filter(p=>/^\/src\/(catalog-|device-code-insertion|device-catalog-data|device-register-setup|wire-draft|hal-example-search)/.test(p))) {
    assert.deepEqual(asar.extractFile(archive, path.normalize(file.slice(1))), await fs.readFile(path.join(root,file.slice(1))), 'Packaged catalog module differs: '+file);
  }
  for (const file of ['src/passive-buzzer.js', 'src/passive-buzzer-example.js', 'src/buzzer-audio.js', 'src/l298n.js', 'src/l298n-example.js', 'src/l298n-ui.js']) {
    assert.deepEqual(asar.extractFile(archive, path.normalize(file)), await fs.readFile(path.join(root, file)), 'Packaged feature module differs from source: ' + file);
  }
  for (const file of ['src/mcu-defaults.js', 'src/mcu-config.js', 'src/timer-config.js', 'src/hal-timers.js', 'src/hal-generator.js', 'src/pinout-ui.js', 'desktop/workspace.cjs', 'desktop/native-build.cjs', 'desktop/native-ide.cjs', 'desktop/gdb-mi.cjs', 'desktop/clangd.cjs', 'desktop/process-tools.cjs', 'src/native-ide-ui.js', 'src/parser.js', 'src/runtime.js', 'src/hal-source.js', 'src/session.js', 'src/ide-ui.js', 'src/workspace-layout.js', 'src/layout-model.js', 'src/debug-tools.js', 'src/ide.css', 'src/generated/code-editor.js', 'src/generated/code-editor.css', 'src/generated/editor.worker.js', 'src/generated/MONACO-LICENSE.txt', 'src/generated/MONACO-NOTICES.txt']) {
    assert.deepEqual(asar.extractFile(archive, path.normalize(file)), await fs.readFile(path.join(root, file)), 'Packaged IDE asset differs: ' + file);
  }
  for (const [source, target] of [['LICENSE', 'MONACO-LICENSE.txt'], ['ThirdPartyNotices.txt', 'MONACO-NOTICES.txt']]) {
    assert.deepEqual(asar.extractFile(archive, path.normalize('src/generated/' + target)), await fs.readFile(path.join(root, 'node_modules/monaco-editor', source)), 'Changed editor notice: ' + target);
  }
  assert.doesNotMatch(asar.extractFile(archive, 'src/hal-examples.js').toString(), /\bSerial\d*\./, 'Shipped examples must use HAL and stdio');
  assert.ok(!entries.some(p => /\.png$/i.test(p) && p !== '/desktop/icons/stm-simulator.png'), 'Only the app icon PNG may be packaged');
  for (const file of ['desktop/icons/stm-simulator.png', 'desktop/icons/stm-simulator.ico']) {
    assert.deepEqual(asar.extractFile(archive, path.normalize(file)), await fs.readFile(path.join(root, file)), 'Packaged app icon differs from source: ' + file);
  }
  async function verifySource(directory) {
    for (const item of await fs.readdir(path.join(root, directory), {withFileTypes: true})) {
      const file = directory + '/' + item.name;
      if (item.isDirectory()) await verifySource(file);
      else {
        assert.ok(entries.includes('/' + file), 'Missing source module: ' + file);
        assert.deepEqual(asar.extractFile(archive, path.normalize(file)), await fs.readFile(path.join(root, file)), 'Packaged source differs: ' + file);
      }
    }
  }
  await verifySource('src');
  await verifySource('desktop');
  assert.deepEqual(asar.extractFile(archive, 'desktop/diagnostics.cjs'), await fs.readFile(path.join(root,'desktop/diagnostics.cjs')), 'Packaged diagnostics differ from source');
  assert.deepEqual(asar.extractFile(archive, 'docs/DIAGNOSTICS.md'), await fs.readFile(path.join(root,'docs/DIAGNOSTICS.md')), 'Packaged diagnostics guide differs from source');
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  for (const file of ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/updater.cjs', 'desktop/apply-update.ps1', 'desktop/start-update.ps1', 'src/update-ui.js', 'src/geometry.js', 'src/resize.js', 'src/resize-ui.js', 'src/ide-preferences.js', 'src/colorscheme.js', 'src/device-docs-ui.js', 'src/device-assistance.js', 'src/device-baremetal.js', 'src/device-docs.css', 'src/themes/jellybeans/jellybeans.vim', 'src/themes/jellybeans/theme.js', 'src/ide-settings-ui.js', 'src/preferences.css', 'src/components.js', 'src/pins.js', 'src/render.js', 'docs/UPDATES.md']) {
    assert.deepEqual(asar.extractFile(archive, path.normalize(file)), await fs.readFile(path.join(root, file)), 'Packaged updater differs from source: ' + file);
  }
  assert.equal(packed.version, pkg.version, 'Packaged version must match source');
  assert.equal(packed.name, pkg.name, 'Packaged name must match source');
  assert.match(asar.extractFile(archive, 'index.html').toString(), /<title>STM Simulator<\/title>/, 'Packaged app must display the current product name');
  for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md', 'docs/COPYRIGHT-REVIEW.md', 'docs/APP-ICON.md', 'docs/SKETCH-API.md', 'docs/HAL-API.md', 'docs/IDE.md', 'docs/MCU-DEFAULTS.md', 'docs/DEVICE-DOCS.md', 'docs/DEVICE-CATALOG.md', 'docs/device-model-gallery.html', 'docs/DEVICE-VISUAL-REFERENCES.md', 'docs/device-reference-gallery.html', 'docs/device-visual-references.json']) {
    assert.ok(entries.includes('/' + file), 'Missing notice: ' + file);
  }
  // Check that upstream notices survived packaging without modification.
  for (const [source, target] of [['LICENSE', 'LICENSE.electron.txt'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']]) {
    assert.deepEqual(await fs.readFile(path.join(unpacked, target)), await fs.readFile(path.join(root, 'node_modules/electron/dist', source)), 'Changed runtime notice: ' + target);
  }
  const binary = await fs.readFile(path.join(dist, name));
  assert.equal(binary.subarray(0, 2).toString(), 'MZ', 'Expected Windows executable');
  // Check the actual default Windows icon, not just the builder configuration.
  const resedit = require('resedit');
  const icon = resedit.Data.IconFile.from(await fs.readFile(path.join(root, 'desktop/icons/stm-simulator.ico')));
  for (const [label, bytes] of [[name, binary], ['STM Simulator.exe', await fs.readFile(path.join(unpacked, 'STM Simulator.exe'))]]) {
    const resources = resedit.NtExecutableResource.from(resedit.NtExecutable.from(bytes));
    const groups = resedit.Resource.IconGroupEntry.fromEntries(resources.entries).sort((a,b) => Number(a.id) - Number(b.id));
    assert.ok(groups.length, 'Missing Windows icon: ' + label);
    const items = groups[0].getIconItemsFromEntries(resources.entries);
    for (const size of [16,32,48,256]) {
      const expected = icon.icons.find(item => item.data.width === size).data;
      const actual = items.find(item => (item.width || 256) === size);
      assert.ok(actual?.isRaw(), `Missing ${size}px app icon in ${label}`);
      assert.deepEqual(Buffer.from(actual.bin), Buffer.from(expected.bin), `Wrong ${size}px app icon in ${label}`);
    }
  }
  const hash = createHash('sha256').update(binary).digest('hex');
  // Replace a recognized older bundle only after the new binary and notices pass.
  // Unknown files and running executables abort without deleting the previous bundle.
  await cleanArtifactOutput(root, {outputDirectory:'outputs'});
  await fs.mkdir(output, {recursive: true});
  await fs.writeFile(path.join(output, name), binary);
  for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    await fs.copyFile(path.join(unpacked, file), path.join(output, file));
  }
  for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md']) {
    await fs.copyFile(path.join(root, file), path.join(output, file));
  }
  for (const file of ['MONACO-LICENSE.txt', 'MONACO-NOTICES.txt','DOMPURIFY-LICENSE.txt']) await fs.copyFile(path.join(root, 'src/generated', file), path.join(output, file));
  await fs.mkdir(path.join(output, 'docs'));
  await fs.copyFile(path.join(root,'docs/DIAGNOSTICS.md'),path.join(output,'docs/DIAGNOSTICS.md'));
  for (const file of ['COPYRIGHT-REVIEW.md', 'APP-ICON.md', 'SKETCH-API.md', 'HAL-API.md', 'IDE.md', 'MCU-DEFAULTS.md', 'UPDATES.md', 'DEVICE-DOCS.md', 'DEVICE-CATALOG.md', 'device-model-gallery.html', 'DEVICE-VISUAL-REFERENCES.md', 'device-reference-gallery.html', 'device-visual-references.json']) {
    await fs.copyFile(path.join(root, 'docs', file), path.join(output, 'docs', file));
  }
  await fs.writeFile(path.join(output, 'SHA256.txt'), `${hash}  ${name}\n`);
  await fs.writeFile(path.join(output, 'update-manifest.json'), JSON.stringify({schemaVersion:1, version:pkg.version, filename:name, bytes:binary.length, sha256:hash}, null, 2) + '\n');
  const commit=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  const sourceDirty=!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  assert.match(commit,/^[a-f0-9]{40}$/,'Build commit must be recorded');
  if(process.env.GITHUB_ACTIONS){assert.ok(process.env.GITHUB_RUN_ID&&process.env.GITHUB_REPOSITORY,'CI provenance is required');assert.equal(sourceDirty,false,'Release build source must be committed');}
  await fs.writeFile(path.join(output, 'BUILD-INFO.json'), JSON.stringify({
    version: pkg.version, filename: name, bytes: binary.length, sha256: hash,
    commit,sourceDirty,
    workflow: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local',
    builtAt: new Date().toISOString()
  }, null, 2) + '\n');
  console.log(`Verified ${name}: ${binary.length} bytes, SHA-256 ${hash}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
