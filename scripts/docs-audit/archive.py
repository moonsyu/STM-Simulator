"""Archive only synthetic audit evidence; exclude app profiles and caches."""
import hashlib
import json
import os
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parents[2]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
data = pathlib.Path(os.environ.get('DOCS_AUDIT_OUT', root / f'work/test-results/docs-audit-{version}'))
if not data.is_absolute():
    data = root / data
report = root / f'docs/audits/{version}-device-docs'
results = json.loads((report / 'results.json').read_text(encoding='utf-8'))
assert results['passed'] and results['stage'] == 'public-release'
files = [(p, 'evidence/' + p.name) for p in sorted(data.iterdir()) if p.is_file() and p.suffix in ('.json', '.stm32lab')]
files += [(p, 'report/' + p.name) for p in sorted(report.iterdir()) if p.is_file()]
files += [(p, 'reproduce/' + p.name) for p in sorted(pathlib.Path(__file__).parent.iterdir()) if p.is_file()]
for name in ['docs-fixes-full-unit.log', 'docs-0232-regression.log', 'docs-0232-arm.log', f'release-{version}-proof.json']:
    p = root / 'work/test-results' / name
    if p.exists():
        files.append((p, 'verification/' + p.name))
output = root / 'work/audit-archives'
output.mkdir(parents=True, exist_ok=True)
target = output / f'docs-audit-{version}.zip'
manifest = {}
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for filename, entry in files:
        content = filename.read_bytes()
        manifest[entry] = hashlib.sha256(content).hexdigest()
        archive.writestr(entry, content)
    archive.writestr('MANIFEST-SHA256.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    for entry, digest in manifest.items():
        assert hashlib.sha256(archive.read(entry)).hexdigest() == digest
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.sha256.txt').write_text(f'{digest}  {target.name}\n', encoding='utf-8')
print(json.dumps({'archive': str(target), 'files': len(files), 'sha256': digest, 'bytes': target.stat().st_size}))
