"""Read-only public release audit; never installs or republishes artifacts."""
import hashlib,json,pathlib,requests,subprocess,zipfile
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'work/test-results/project-audit-0238'
cache=root/'work/release-audit/0.23.8';cache.mkdir(parents=True,exist_ok=True)
base='https://github.com/moonsyu/STM-Simulator/releases/download/v0.23.8/'
session=requests.Session();session.headers['User-Agent']='STM-Simulator-read-only-audit'
def fetch(name):
    response=session.get(base+name,timeout=60);response.raise_for_status();return response
info=fetch('BUILD-INFO.json').json();manifest=fetch('update-manifest.json').json()
hashes={line.split()[1]:line.split()[0] for line in fetch('SHA256.txt').text.lstrip('\ufeff').splitlines() if line.strip()}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
result={'version':'0.23.8','auditedHead':head,'metadata':info,'manifest':manifest,'provenanceMatches':info.get('commit')==head,'assets':[]}
for name,expected in hashes.items():
    if pathlib.PurePath(name).name!=name:raise ValueError('Invalid asset path')
    target=cache/name
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest()!=expected:
        with session.get(base+name,stream=True,timeout=60) as response:
            response.raise_for_status()
            with target.open('wb') as file:
                for chunk in response.iter_content(1048576):file.write(chunk)
    result['assets'].append({'name':name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'hashMatches':hashlib.sha256(target.read_bytes()).hexdigest()==expected})
with zipfile.ZipFile(cache/'STM-Simulator-0.23.8-Windows-x64.zip') as z:
    result['zipCrcValid']=z.testzip() is None
    names=set(z.namelist());result['zipEntries']=sorted(names)
    result['zipMetadataMatches']=all(name in names for name in ['BUILD-INFO.json','update-manifest.json']) and json.loads(z.read('BUILD-INFO.json'))==info and json.loads(z.read('update-manifest.json'))==manifest
    result['zipExeMatches']='STM-Simulator.exe' in names and hashlib.sha256(z.read('STM-Simulator.exe')).hexdigest()==manifest['sha256']
    result['zipDocsMatchCurrentHead']={}
    for name in ['README.md','docs/HAL-API.md','docs/UPDATES.md','docs/DIAGNOSTICS.md']:
        current=subprocess.check_output(['git','show',head+':'+name],cwd=root).decode('utf8').replace('\r\n','\n')
        result['zipDocsMatchCurrentHead'][name]=name in names and z.read(name).decode('utf-8-sig').replace('\r\n','\n')==current
    if 'resources/app.asar' in names:(cache/'zip-app.asar').write_bytes(z.read('resources/app.asar'))
(out/'release-assets.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result,indent=2))
