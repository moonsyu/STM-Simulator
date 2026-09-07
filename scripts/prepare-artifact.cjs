// Prepare a download from this build only; old EXEs in dist are never included.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const name = pkg.build.portable.artifactName.replace('${version}', pkg.version);
  const dist = path.join(root, 'dist');
  const unpacked = path.join(dist, 'win-unpacked');
  const output = path.join(dist, 'artifact');
  const asar = await import('@electron/asar');
  const archive = path.join(unpacked, 'resources', 'app.asar');
  const entries = asar.listPackage(archive).map(p => p.replaceAll('\\', '/'));
  assert.ok(!entries.some(p => /^\/(assets|test-results|tests|scripts)(\/|$)/.test(p)), 'Reference media and test fixtures must not be packaged');
  for (const file of ['src/feature-examples.js', 'src/component-examples.js']) assert.ok(!entries.includes('/' + file), 'Removed example module must not be packaged: ' + file);
  for (const file of ['src/hal-examples.js', 'src/hal-stdio.js']) assert.ok(entries.includes('/' + file), 'Missing HAL module: ' + file);
  assert.doesNotMatch(asar.extractFile(archive, 'src/hal-examples.js').toString(), /\bSerial\d*\./, 'Shipped examples must use HAL and stdio');
  assert.ok(!entries.some(p => /\.png$/i.test(p)), 'Legacy screenshots must not be packaged');
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(packed.version, pkg.version, 'Packaged version must match source');
  for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md', 'docs/COPYRIGHT-REVIEW.md', 'docs/SKETCH-API.md', 'docs/HAL-API.md']) {
    assert.ok(entries.includes('/' + file), 'Missing notice: ' + file);
  }
  // Check that upstream notices survived packaging without modification.
  for (const [source, target] of [['LICENSE', 'LICENSE.electron.txt'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']]) {
    assert.deepEqual(await fs.readFile(path.join(unpacked, target)), await fs.readFile(path.join(root, 'node_modules/electron/dist', source)), 'Changed runtime notice: ' + target);
  }
  const binary = await fs.readFile(path.join(dist, name));
  assert.equal(binary.subarray(0, 2).toString(), 'MZ', 'Expected Windows executable');
  const hash = createHash('sha256').update(binary).digest('hex');
  // Refuse stale output instead of deleting a directory that might contain user files.
  await fs.mkdir(output, {recursive: true});
  assert.equal((await fs.readdir(output)).length, 0, 'dist/artifact must be empty before preparation');
  await fs.writeFile(path.join(output, name), binary);
  for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    await fs.copyFile(path.join(unpacked, file), path.join(output, file));
  }
  for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md']) {
    await fs.copyFile(path.join(root, file), path.join(output, file));
  }
  await fs.mkdir(path.join(output, 'docs'));
  for (const file of ['COPYRIGHT-REVIEW.md', 'SKETCH-API.md', 'HAL-API.md']) {
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
