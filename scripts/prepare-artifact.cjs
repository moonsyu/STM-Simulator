// Prepare a download from this build only; old EXEs are never included.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const {cleanArtifactOutput} = require('./clean-build.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const name = pkg.build.portable.artifactName.replace('${version}', pkg.version);
  const dist = path.join(root, 'work', 'build');
  const unpacked = path.join(dist, 'win-unpacked');
  const output = path.join(root, 'outputs', 'artifact');
  const asar = await import('@electron/asar');
  const archive = path.join(unpacked, 'resources', 'app.asar');
  const entries = asar.listPackage(archive).map(p => p.replaceAll('\\', '/'));
  assert.ok(!entries.some(p => /^\/(assets|work|outputs|test-results|tests|scripts)(\/|$)/.test(p)), 'Reference media and test fixtures must not be packaged');
  for (const file of ['src/feature-examples.js', 'src/component-examples.js']) assert.ok(!entries.includes('/' + file), 'Removed example module must not be packaged: ' + file);
  for (const file of ['src/editor-search.js', 'src/hal-examples.js', 'src/hal-circuits.js', 'src/hal-stdio.js', 'src/device-defs.js', 'src/device-buses.js', 'src/device-motion.js', 'src/device-examples.js', 'src/device-ui.js']) assert.ok(entries.includes('/' + file), 'Missing HAL module: ' + file);
  assert.doesNotMatch(asar.extractFile(archive, 'src/hal-examples.js').toString(), /\bSerial\d*\./, 'Shipped examples must use HAL and stdio');
  assert.ok(!entries.some(p => /\.png$/i.test(p) && p !== '/desktop/icons/stm-simulator.png'), 'Only the app icon PNG may be packaged');
  for (const file of ['desktop/icons/stm-simulator.png', 'desktop/icons/stm-simulator.ico']) {
    assert.deepEqual(asar.extractFile(archive, path.normalize(file)), await fs.readFile(path.join(root, file)), 'Packaged app icon differs from source: ' + file);
  }
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(packed.version, pkg.version, 'Packaged version must match source');
  assert.equal(packed.name, pkg.name, 'Packaged name must match source');
  assert.match(asar.extractFile(archive, 'index.html').toString(), /<title>STM Simulator<\/title>/, 'Packaged app must display the current product name');
  for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md', 'docs/COPYRIGHT-REVIEW.md', 'docs/APP-ICON.md', 'docs/SKETCH-API.md', 'docs/HAL-API.md']) {
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
  await fs.mkdir(path.join(output, 'docs'));
  for (const file of ['COPYRIGHT-REVIEW.md', 'APP-ICON.md', 'SKETCH-API.md', 'HAL-API.md']) {
    await fs.copyFile(path.join(root, 'docs', file), path.join(output, 'docs', file));
  }
  await fs.writeFile(path.join(output, 'SHA256.txt'), `${hash}  ${name}\n`);
  await fs.writeFile(path.join(output, 'BUILD-INFO.json'), JSON.stringify({
    version: pkg.version, filename: name, bytes: binary.length, sha256: hash,
    commit: process.env.GITHUB_SHA || null,
    workflow: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    builtAt: new Date().toISOString()
  }, null, 2) + '\n');
  console.log(`Verified ${name}: ${binary.length} bytes, SHA-256 ${hash}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
