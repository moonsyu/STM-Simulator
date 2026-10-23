import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {blankProject} from '../../src/project.js';
import {withTempDir,patched,readText,exists} from './helpers/tmp.js';

const require=createRequire(import.meta.url);
const workspace=require('../../desktop/workspace.cjs');
const transaction=require('../../desktop/workspace-transaction.cjs');
const updater=require('../../desktop/updater.cjs');
const {Diagnostics}=require('../../desktop/diagnostics.cjs');
const nativeBuild=require('../../desktop/native-build.cjs');
const {GdbSession,parseRecord,quote}=require('../../desktop/gdb-mi.cjs');
const fsp=require('node:fs/promises');
assert.equal(fsp,fs,'CommonJS and ESM share the fs/promises module object, so patches reach the desktop code');

const sha=data=>createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------- workspace
function oldProject(){const p=blankProject();p.code='int main(void){return 1;}';p.firmware.files=[{name:'old.c',text:'int old_value = 1;'},{name:'shared.h',text:'#pragma once\n'}];return p;}
function newProject(p){const n=structuredClone(p);n.code='int main(void){return 2;}';n.firmware.files=[{name:'new.c',text:'int new_value = 2;'},{name:'shared.h',text:'#pragma once\n// v2\n'}];return n;}
async function withWorkspace(run){return withTempDir(async parent=>{const p=oldProject(),state=await workspace.createWorkspace(parent,'project',JSON.stringify(p));return run(p,state,parent);},'stm-ws-');}
async function snapshotDir(directory){const out={};for(const name of (await fs.readdir(directory)).sort())if(name!=='.stm-save'){const stat=await fs.stat(path.join(directory,name));if(stat.isFile())out[name]=await readText(path.join(directory,name));}return out;}
async function assertOldState(p,directory){
  const files=await snapshotDir(directory);
  assert.equal(files['main.c'],p.code);assert.equal(files['old.c'],'int old_value = 1;');assert.equal(files['shared.h'],'#pragma once\n');assert.equal(files['new.c'],undefined);
  assert.equal(JSON.parse(files['project.stm32lab']).code,p.code);assert.equal(await exists(path.join(directory,'.stm-save')),false,'journal cleaned up');
}
async function assertNewState(n,directory){
  const files=await snapshotDir(directory);
  assert.equal(files['main.c'],n.code);assert.equal(files['new.c'],'int new_value = 2;');assert.equal(files['shared.h'],'#pragma once\n// v2\n');assert.equal(files['old.c'],undefined);
  assert.deepEqual(JSON.parse(files['project.stm32lab']).firmware.files.map(f=>f.name),['new.c','shared.h']);
}

describe('workspace folders',()=>{
  test('createWorkspace writes the document, main.c, sources and a marker',()=>withWorkspace(async(p,state)=>{
    const files=await snapshotDir(state.directory);
    assert.deepEqual(Object.keys(files),['main.c','old.c','project.stm32lab','shared.h','stm-project.json']);
    assert.equal(files['main.c'],p.code);assert.deepEqual(JSON.parse(files['stm-project.json']),{format:'stm-simulator-workspace',version:1,document:'project.stm32lab'});
    assert.equal(state.hashes.get('main.c'),sha(p.code));
  }));
  test('createWorkspace refuses existing folders, unsafe names and invalid projects',()=>withTempDir(async parent=>{
    const text=JSON.stringify(blankProject());await workspace.createWorkspace(parent,'한글 프로젝트',text);
    await assert.rejects(workspace.createWorkspace(parent,'한글 프로젝트',text),/이미 있습니다/);
    for(const name of ['../escape','con','LPT1.txt','trailing.','trailing ','',' lead','a/b','x'.repeat(81)])await assert.rejects(workspace.createWorkspace(parent,name,text),/프로젝트 이름/,name);
    await assert.rejects(workspace.createWorkspace(parent,'bad',JSON.stringify({format:'nope'})),/지원하지 않는/);
    assert.equal(await exists(path.join(parent,'bad')),false,'no folder left behind for an invalid project');
    assert.equal(workspace.safeName('My_Project-1'),true);assert.equal(workspace.safeName('aux'),false);
  },'stm-ws-'));
  test('open reads main.c and sources from disk into the project',()=>withWorkspace(async(p,state)=>{
    await fs.writeFile(path.join(state.directory,'main.c'),'int main(void){return 7;}');
    const opened=await workspace.openWorkspace(state.directory),project=JSON.parse(opened.text);
    assert.equal(project.code,'int main(void){return 7;}');assert.equal(project.firmware.files[0].text,'int old_value = 1;');
    assert.equal(opened.state.hashes.get('main.c'),sha('int main(void){return 7;}'));
  }));
  test('open rejects foreign folders, missing sources and symlinked sources',()=>withWorkspace(async(p,state,parent)=>{
    await fs.mkdir(path.join(parent,'other'));await fs.writeFile(path.join(parent,'other','stm-project.json'),JSON.stringify({format:'x',document:'project.stm32lab'}));
    await assert.rejects(workspace.openWorkspace(path.join(parent,'other')),/프로젝트 폴더가 아닙니다/);
    await fs.rename(path.join(state.directory,'old.c'),path.join(parent,'old.c'));await assert.rejects(workspace.openWorkspace(state.directory),/old\.c 소스 파일이 없습니다/);
    await fs.symlink(path.join(parent,'old.c'),path.join(state.directory,'old.c'));await assert.rejects(workspace.openWorkspace(state.directory),/일반 파일/);
  }));
  test('save writes the complete new file set and removes deleted sources',()=>withWorkspace(async(p,state)=>{
    const n=newProject(p);await workspace.saveWorkspace(state,JSON.stringify(n));await assertNewState(n,state.directory);
    assert.equal(state.hashes.get('new.c'),sha('int new_value = 2;'));assert.equal(state.hashes.has('old.c'),false);
    const reopened=JSON.parse((await workspace.openWorkspace(state.directory)).text);assert.equal(reopened.code,n.code);
  }));
  test('external edits are never overwritten by a save',()=>withWorkspace(async(p,state)=>{
    await fs.writeFile(path.join(state.directory,'old.c'),'// edited in another editor');
    await assert.rejects(workspace.saveWorkspace(state,JSON.stringify(newProject(p))),/old\.c 파일이 앱 밖에서 변경되었습니다/);
    assert.equal(await readText(path.join(state.directory,'old.c')),'// edited in another editor');assert.equal(await readText(path.join(state.directory,'main.c')),p.code);
    const opened=await workspace.openWorkspace(state.directory);await workspace.saveWorkspace(opened.state,opened.text);
    assert.equal(await readText(path.join(state.directory,'old.c')),'// edited in another editor','after reopening, the external edit becomes the base');
  }));
  test('a file created externally with a name the save wants to use is protected',()=>withWorkspace(async(p,state)=>{
    await fs.writeFile(path.join(state.directory,'new.c'),'// someone else');
    await assert.rejects(workspace.saveWorkspace(state,JSON.stringify(newProject(p))),/new\.c 파일이 앱 밖/);
    assert.equal(await readText(path.join(state.directory,'new.c')),'// someone else');
  }));
  test('saving requires an opened workspace and a valid project',()=>withWorkspace(async(p,state)=>{
    await assert.rejects(workspace.saveWorkspace(null,'{}'),/먼저 프로젝트 폴더/);
    await assert.rejects(workspace.saveWorkspace(state,'{"format":"bad"}'),/지원하지 않는/);
    await assert.rejects(workspace.saveWorkspace(state,'x'.repeat(2000001)),/크기 제한/);
    await assertOldState(p,state.directory);
  }));
  test('concurrent saves are serialized and the last one wins',()=>withWorkspace(async(p,state)=>{
    const a=newProject(p),b=structuredClone(a);b.code='int main(void){return 3;}';
    await Promise.all([workspace.saveWorkspace(state,JSON.stringify(a)),workspace.saveWorkspace(state,JSON.stringify(b))]);
    assert.equal(await readText(path.join(state.directory,'main.c')),b.code);await workspace.flush();
  }));
});

describe('workspace save transaction (atomic multi-file save)',()=>{
  const inside=(dir,file)=>path.dirname(file)===dir;
  test('a failure replacing the second file rolls back to the old set and a retry succeeds',()=>withWorkspace(async(p,state)=>{
    let replaced=0;
    await patched(fs,'rename',rename=>async(from,to)=>{if(inside(state.directory,to)&&++replaced===2)throw Object.assign(new Error('file is locked'),{code:'EBUSY'});return rename(from,to);},
      ()=>assert.rejects(workspace.saveWorkspace(state,JSON.stringify(newProject(p))),/file is locked/));
    assert.ok(replaced>=2,'one file was already replaced when the failure happened');
    await assertOldState(p,state.directory);
    await workspace.saveWorkspace(state,JSON.stringify(newProject(p)));await assertNewState(newProject(p),state.directory);
  }));
  test('a failure deleting an obsolete source restores everything already replaced',()=>withWorkspace(async(p,state)=>{
    await patched(fs,'unlink',unlink=>async file=>{if(file===path.join(state.directory,'old.c'))throw new Error('delete denied');return unlink(file);},
      ()=>assert.rejects(workspace.saveWorkspace(state,JSON.stringify(newProject(p))),/delete denied/));
    await assertOldState(p,state.directory);
    await workspace.saveWorkspace(state,JSON.stringify(newProject(p)));await assertNewState(newProject(p),state.directory);
  }));
  test('a failure while staging (before any project file changes) leaves no journal',()=>withWorkspace(async(p,state)=>{
    await patched(fs,'open',open=>async(file,...rest)=>{if(String(file).includes('next-1'))throw new Error('disk full');return open(file,...rest);},
      ()=>assert.rejects(workspace.saveWorkspace(state,JSON.stringify(newProject(p))),/disk full/));
    await assertOldState(p,state.directory);
  }));
  test('a crash-left journal (rollback also failed) is recovered on the next open',()=>withWorkspace(async(p,state)=>{
    let replaced=0;
    await patched(fs,'rename',rename=>async(from,to)=>{
      if(path.basename(from).startsWith('restore-'))throw new Error('power lost during rollback');
      if(inside(state.directory,to)&&++replaced===3)throw new Error('power lost');
      return rename(from,to);
    },()=>assert.rejects(workspace.saveWorkspace(state,JSON.stringify(newProject(p))),/복구 기록을 남겼습니다/));
    assert.equal(await exists(path.join(state.directory,'.stm-save','journal.json')),true,'journal left on disk');
    assert.notEqual(await readText(path.join(state.directory,'main.c'))+await readText(path.join(state.directory,'project.stm32lab')),p.code+JSON.stringify(p),'files are in a mixed state before recovery');
    const opened=await workspace.openWorkspace(state.directory);
    assert.equal(JSON.parse(opened.text).code,p.code);await assertOldState(p,state.directory);
    await workspace.saveWorkspace(opened.state,JSON.stringify(newProject(p)));await assertNewState(newProject(p),state.directory);
  }));
  test('recovery refuses to overwrite a file edited after the crash',()=>withWorkspace(async(p,state)=>{
    let replaced=0;
    await patched(fs,'rename',rename=>async(from,to)=>{if(path.basename(from).startsWith('restore-'))throw new Error('crash');if(inside(state.directory,to)&&++replaced===2)throw new Error('crash');return rename(from,to);},
      ()=>assert.rejects(workspace.saveWorkspace(state,JSON.stringify(newProject(p)))));
    const journal=JSON.parse(await readText(path.join(state.directory,'.stm-save','journal.json')));
    const victim=journal.entries[0].name;await fs.writeFile(path.join(state.directory,victim),'// edited after crash');
    await assert.rejects(workspace.openWorkspace(state.directory),/외부 변경을 발견했습니다/);
    assert.equal(await readText(path.join(state.directory,victim)),'// edited after crash');
  }));
  test('a journal whose commit marker was written is simply discarded',()=>withWorkspace(async(p,state)=>{
    const folder=path.join(state.directory,'.stm-save');await fs.mkdir(folder);
    await fs.writeFile(path.join(folder,'journal.json'),JSON.stringify({version:1,entries:[{name:'main.c',before:Buffer.from('old').toString('base64'),after:sha(p.code)}]}));
    await fs.writeFile(path.join(folder,'committed'),'1');
    assert.equal(await transaction.recover(state.directory),false);assert.equal(await exists(folder),false);assert.equal(await readText(path.join(state.directory,'main.c')),p.code);
  }));
  test('an empty staging folder is removed; malformed journals are rejected',()=>withWorkspace(async(p,state)=>{
    const folder=path.join(state.directory,'.stm-save');await fs.mkdir(folder);
    assert.equal(await transaction.recover(state.directory),false);assert.equal(await exists(folder),false);
    await fs.mkdir(folder);await fs.writeFile(path.join(folder,'journal.json'),JSON.stringify({version:1,entries:[{name:'../../etc/passwd',before:null,after:null}]}));
    await assert.rejects(transaction.recover(state.directory),/복구 기록이 올바르지 않습니다/);
    assert.equal(await transaction.recover(path.join(state.directory,'nowhere')),false,'no journal, nothing to do');
  }));
  test('recovery restores deleted files and removes created ones',()=>withWorkspace(async(p,state)=>{
    const folder=path.join(state.directory,'.stm-save');await fs.mkdir(folder);
    await fs.unlink(path.join(state.directory,'old.c'));await fs.writeFile(path.join(state.directory,'new.c'),'int new_value = 2;');
    await fs.writeFile(path.join(folder,'journal.json'),JSON.stringify({version:1,entries:[
      {name:'old.c',before:Buffer.from('int old_value = 1;').toString('base64'),after:null},
      {name:'new.c',before:null,after:sha('int new_value = 2;')}]}));
    assert.equal(await transaction.recover(state.directory),true);await assertOldState(p,state.directory);
  }));
});

// ---------------------------------------------------------------- updater
const REPO='https://github.com/moonsyu/STM-Simulator/releases/download';
const exeBytes=(size=64)=>{const b=Buffer.alloc(size,7);b.write('MZ',0);return b;};
function release(version='0.30.0',{size=64,assets}={}){
  const tag='v'+version,asset=(name,extra={})=>({name,state:'uploaded',size,browser_download_url:`${REPO}/${tag}/${name}`,...extra});
  return {tag_name:tag,draft:false,prerelease:false,assets:assets?assets(asset):[asset('STM-Simulator.exe'),asset('update-manifest.json',{size:200})]};
}
const manifestFor=(info,bytes)=>({schemaVersion:1,version:info.version,filename:info.filename,bytes:info.bytes,sha256:sha(bytes)});

describe('updater: versions, URLs and release metadata',()=>{
  test('compareVersions orders numerically and rejects non-release strings',()=>{
    assert.equal(updater.compareVersions('0.10.0','0.9.9'),1);assert.equal(updater.compareVersions('1.0.0','1.0.0'),0);assert.equal(updater.compareVersions('0.25.2','0.25.10'),-1);
    for(const bad of ['1.0','v1.0.0','1.0.0-beta','01.0.0','1.0.0.0','../1.0.0','1.0.1234567'])assert.throws(()=>updater.compareVersions(bad,'1.0.0'),/버전 번호/,bad);
  });
  test('allowedUrl only permits HTTPS GitHub release endpoints',()=>{
    for(const ok of ['https://api.github.com/repos/moonsyu/STM-Simulator/releases/latest',`${REPO}/v1.0.0/STM-Simulator.exe`,'https://objects.githubusercontent.com/x','https://release-assets.githubusercontent.com/y'])assert.ok(updater.allowedUrl(ok));
    for(const bad of ['http://github.com/moonsyu/STM-Simulator/releases/download/x','https://github.com/evil/STM-Simulator/releases/download/x','https://user:pw@github.com/moonsyu/STM-Simulator/releases/download/x','https://github.com:8443/moonsyu/STM-Simulator/releases/download/x','https://api.github.com/repos/moonsyu/STM-Simulator/releases','https://example.com/'])
      assert.throws(()=>updater.allowedUrl(bad),/주소/,bad);
  });
  test('releaseInfo: newer stable release with complete fixed-name assets',()=>{
    const info=updater.releaseInfo(release('0.30.0'),'0.25.2');
    assert.deepEqual(info,{version:'0.30.0',filename:'STM-Simulator.exe',bytes:64,url:`${REPO}/v0.30.0/STM-Simulator.exe`,manifestUrl:`${REPO}/v0.30.0/update-manifest.json`});
    assert.equal(updater.releaseInfo(release('0.25.2'),'0.25.2'),null,'same version is not an update');assert.equal(updater.releaseInfo(release('0.1.0'),'0.25.2'),null);
    assert.throws(()=>updater.releaseInfo({...release(),prerelease:true},'0.1.0'),/정식 릴리스/);assert.throws(()=>updater.releaseInfo({...release(),draft:true},'0.1.0'),/정식 릴리스/);
  });
  test('releaseInfo: legacy versioned asset names still work, incomplete fixed assets never fall back',()=>{
    const legacy=release('0.30.0',{assets:a=>[a('STM-Simulator-0.30.0-win-x64.exe'),a('update-manifest.json')]});assert.equal(updater.releaseInfo(legacy,'0.1.0').filename,'STM-Simulator-0.30.0-win-x64.exe');
    const incomplete=release('0.30.0',{assets:a=>[a('STM-Simulator.exe',{state:'new'}),a('STM-Simulator-0.30.0-win-x64.exe'),a('update-manifest.json')]});
    assert.throws(()=>updater.releaseInfo(incomplete,'0.1.0'),/게시가 완료되지 않았습니다/);
    const dup=release('0.30.0',{assets:a=>[a('STM-Simulator.exe'),a('STM-Simulator.exe'),a('update-manifest.json')]});assert.throws(()=>updater.releaseInfo(dup,'0.1.0'),/게시가 완료/);
    const moved=release('0.30.0',{assets:a=>[a('STM-Simulator.exe',{browser_download_url:'https://evil.example/x.exe'}),a('update-manifest.json')]});assert.throws(()=>updater.releaseInfo(moved,'0.1.0'),/주소가 올바르지/);
    const noManifest=release('0.30.0',{assets:a=>[a('STM-Simulator.exe')]});assert.throws(()=>updater.releaseInfo(noManifest,'0.1.0'),/게시가 완료/);
    for(const size of [1,400*1024*1024+1,1.5])assert.throws(()=>updater.releaseInfo(release('0.30.0',{size}),'0.1.0'),/크기/);
  });
  test('validateManifest must match the release exactly',()=>{
    const info=updater.releaseInfo(release(),'0.1.0'),good=manifestFor(info,exeBytes());
    assert.equal(updater.validateManifest({...good,sha256:good.sha256.toUpperCase()},info).sha256,good.sha256);
    for(const change of [{schemaVersion:2},{version:'0.30.1'},{filename:'other.exe'},{bytes:65},{sha256:'abc'}])assert.throws(()=>updater.validateManifest({...good,...change},info),/일치하지 않습니다/,JSON.stringify(change));
  });
  test('verifyFile checks size, SHA-256 and the MZ header',()=>withTempDir(async dir=>{
    const bytes=exeBytes(),file=path.join(dir,'a.exe');await fs.writeFile(file,bytes);const info={bytes:bytes.length,sha256:sha(bytes)};
    await updater.verifyFile(file,info);
    await assert.rejects(updater.verifyFile(file,{...info,bytes:63}),/크기/);
    await assert.rejects(updater.verifyFile(file,{...info,sha256:sha('x')}),/검증에 실패/);
    const noMz=Buffer.from(bytes);noMz.write('ZM',0);await fs.writeFile(file,noMz);await assert.rejects(updater.verifyFile(file,{bytes:noMz.length,sha256:sha(noMz)}),/검증에 실패/);
    await fs.symlink(path.join(dir,'missing'),path.join(dir,'link.exe'));await assert.rejects(updater.verifyFile(path.join(dir,'link.exe'),info));
  },'stm-upd-'));
});

describe('PortableUpdater (local fixtures, no network)',()=>{
  async function setup(dir,{payload=exeBytes(),version='0.25.2',enabled=true,corrupt=false,now=Date.now}={}){
    const target=path.join(dir,'app','STM-Simulator.exe');await fs.mkdir(path.dirname(target));await fs.writeFile(target,exeBytes(16));
    const calls={read:[],download:0,apply:[]},rel=release('0.30.0',{size:payload.length});
    const read=async url=>{calls.read.push(url);if(url.endsWith('/latest'))return rel;return manifestFor(updater.releaseInfo(rel,version),payload);};
    const download=async(info,file,{onProgress})=>{calls.download++;const data=corrupt?Buffer.from(payload).fill(1,2):payload;await fs.writeFile(file,data);onProgress(data.length);};
    const apply=async job=>{calls.apply.push(job);};
    const u=new updater.PortableUpdater({version,directory:path.join(dir,'updates'),target,enabled,read,download,apply,now});
    return {u,calls,target};
  }
  test('disabled (dev) builds never contact the server',()=>withTempDir(async dir=>{
    const {u,calls}=await setup(dir,{enabled:false});assert.equal(u.snapshot().phase,'unsupported');
    assert.equal((await u.check()).phase,'unsupported');assert.deepEqual(calls.read,[]);u.close();
  },'stm-upd-'));
  test('manual check offers the update, download verifies it, install hands off to the helper',()=>withTempDir(async dir=>{
    const {u,calls,target}=await setup(dir);await fs.mkdir(u.directory,{recursive:true});
    const states=[];u.on('state',s=>states.push(s.phase));
    const [a,b]=await Promise.all([u.check(),u.check()]);assert.equal(a.phase,'available');assert.equal(b.phase,'available');assert.equal(calls.read.length,2,'concurrent checks share one request pair');
    assert.equal(a.latestVersion,'0.30.0');assert.equal(calls.download,0,'manual checks do not download');
    assert.equal((await u.download()).phase,'ready');assert.equal(await exists(path.join(u.directory,'pending.exe')),true);
    assert.equal(await u.install(),true);assert.equal(calls.apply.length,1);assert.equal(calls.apply[0].target,target);assert.equal(calls.apply[0].info.sha256,sha(exeBytes()));
    assert.deepEqual(states.slice(0,3),['checking','available','downloading']);
    assert.equal((await u.check()).phase,'installing','no re-check while installing');u.close();
  },'stm-upd-'));
  test('while the app is in use: focusing the window checks again once 10 minutes have passed',()=>withTempDir(async dir=>{
    let clock=1_000_000;const {u,calls}=await setup(dir,{version:'0.30.0',now:()=>clock});await fs.mkdir(u.directory,{recursive:true});
    assert.equal(u.wake(),true,'the first focus checks');await u.pending;assert.equal(calls.read.length,1);assert.equal(u.state.phase,'current');
    clock+=9*60*1000;assert.equal(u.wake(),false,'not again within 10 minutes');
    clock+=2*60*1000;assert.equal(u.wake(),true);await u.pending;assert.equal(calls.read.length,2);
    await u.configure(false);clock+=60*60*1000;assert.equal(u.wake(),false,'off when automatic checks are off');
    u.close();
  },'stm-upd-'));
  test('a failed background check keeps a found update; a manual check reports the error',()=>withTempDir(async dir=>{
    const {u}=await setup(dir);await fs.mkdir(u.directory,{recursive:true});
    assert.equal((await u.check()).phase,'available');u.read=async()=>{throw new Error('getaddrinfo ENOTFOUND');};
    const s=await u.check(true);assert.equal(s.phase,'available');assert.match(s.message,/확인하지 못했습니다.*ENOTFOUND/);assert.equal(s.latestVersion,'0.30.0');
    assert.equal((await u.check()).phase,'error');u.close();
  },'stm-upd-'));
  test('automatic check downloads in the background but does not install',()=>withTempDir(async dir=>{
    const {u,calls}=await setup(dir);await fs.mkdir(u.directory,{recursive:true});
    assert.equal((await u.check(true)).phase,'ready');assert.equal(calls.download,1);assert.equal(calls.apply.length,0);u.close();
  },'stm-upd-'));
  test('a corrupt download never becomes ready and leaves the installed EXE untouched',()=>withTempDir(async dir=>{
    const {u,calls,target}=await setup(dir,{corrupt:true});await fs.mkdir(u.directory,{recursive:true});
    await u.check();const s=await u.download();assert.equal(s.phase,'error');assert.match(s.message,/검증에 실패/);
    assert.equal(await exists(path.join(u.directory,'pending.exe')),false);assert.deepEqual(await fs.readFile(target),exeBytes(16));
    assert.deepEqual((await fs.readdir(u.directory)).filter(n=>n.endsWith('.part')),[],'partial files removed');
    await assert.rejects(u.install(),/먼저 업데이트 다운로드/);assert.equal(calls.apply.length,0);u.close();
  },'stm-upd-'));
  test('an already verified pending.exe is reused without downloading again',()=>withTempDir(async dir=>{
    const {u,calls}=await setup(dir);await fs.mkdir(u.directory,{recursive:true});await fs.writeFile(path.join(u.directory,'pending.exe'),exeBytes());
    await u.check();assert.equal((await u.download()).phase,'ready');assert.equal(calls.download,0);u.close();
  },'stm-upd-'));
  test('up-to-date and offline results',()=>withTempDir(async dir=>{
    const {u}=await setup(dir,{version:'0.30.0'});assert.equal((await u.check()).phase,'current');u.close();
    const offline=new updater.PortableUpdater({version:'0.1.0',directory:path.join(dir,'u2'),target:path.join(dir,'x.exe'),enabled:true,read:async()=>{throw new Error('getaddrinfo ENOTFOUND');}});
    const s=await offline.check();assert.equal(s.phase,'error');assert.match(s.message,/ENOTFOUND/);offline.close();
  },'stm-upd-'));
  test('automatic preference persists; a failed previous install is reported once',()=>withTempDir(async dir=>{
    const {u}=await setup(dir);await u.init();await assert.rejects(u.configure('yes'),/설정이 올바르지/);await u.configure(false);u.close();
    assert.deepEqual(JSON.parse(await readText(path.join(u.directory,'settings.json'))),{automatic:false});
    await fs.writeFile(path.join(u.directory,'last-result.json'),'\uFEFF'+JSON.stringify({ok:false,message:'locked'}));
    const second=new updater.PortableUpdater({version:'0.25.2',directory:u.directory,target:u.target,enabled:true});const snap=await second.init();
    assert.equal(second.automatic,false);assert.equal(snap.phase,'error');assert.equal(await exists(path.join(u.directory,'last-result.json')),false);second.close();
  },'stm-upd-'));
  test('install re-verifies the pending file and keeps the app running on helper failure',()=>withTempDir(async dir=>{
    const {u,calls}=await setup(dir);await fs.mkdir(u.directory,{recursive:true});await u.check();await u.download();
    u.apply=async()=>{throw new Error('helper crashed');};await assert.rejects(u.install(),/helper crashed/);assert.equal(u.snapshot().phase,'ready');
    await fs.writeFile(path.join(u.directory,'pending.exe'),exeBytes(65));await assert.rejects(u.install(),/크기/);assert.equal(calls.apply.length,0);u.close();
  },'stm-upd-'));
});

// ---------------------------------------------------------------- diagnostics
describe('diagnostics log',()=>{
  test('records events with session/version and stores the latest project',()=>withTempDir(async dir=>{
    const d=new Diagnostics(dir,'0.25.2');const project=JSON.stringify(blankProject());
    assert.deepEqual(await d.record({type:'app.start',detail:{a:1}}),{ok:true});
    await d.record({type:'project.saved',project});await d.flush();
    const lines=(await readText(path.join(dir,'diagnostics','events.jsonl'))).trim().split('\n').map(JSON.parse);
    assert.equal(lines.length,2);assert.equal(lines[0].version,'0.25.2');assert.equal(lines[0].session,lines[1].session);assert.deepEqual(lines[0].detail,{a:1});
    assert.equal(lines[0].projectSha256,null);assert.equal(lines[1].projectSha256,sha(project));
    assert.equal(await readText(path.join(dir,'diagnostics','latest-project.stm32lab')),project);
  },'stm-diag-'));
  test('large numeric arrays in simulation state are summarised with a hash',()=>withTempDir(async dir=>{
    const d=new Diagnostics(dir,'1.0.0'),pixels=Array.from({length:100},(_,i)=>i%3);
    await d.record({type:'simulation.state',detail:{oled:{pixels},small:[1,2,3]}});await d.flush();
    const [event]=(await readText(path.join(dir,'diagnostics','events.jsonl'))).trim().split('\n').map(JSON.parse);
    assert.deepEqual(event.detail.small,[1,2,3]);const s=event.detail.oled.pixels;
    assert.equal(s.length,100);assert.equal(s.nonzero,pixels.filter(Boolean).length);assert.equal(s.sha256,sha(JSON.stringify(pixels)));assert.deepEqual(s.first,pixels.slice(0,16));assert.deepEqual(s.last,pixels.slice(-4));
  },'stm-diag-'));
  test('the log rotates into events.previous.jsonl when it exceeds maxBytes',()=>withTempDir(async dir=>{
    const d=new Diagnostics(dir,'1.0.0',{maxBytes:600});
    for(let i=0;i<10;i++)await d.record({type:'tick',detail:{i,pad:'x'.repeat(60)}});
    const current=await readText(path.join(dir,'diagnostics','events.jsonl')),previous=await readText(path.join(dir,'diagnostics','events.previous.jsonl'));
    assert.ok(Buffer.byteLength(current)<=600);assert.ok(previous.length>0);
    const all=[...previous.trim().split('\n'),...current.trim().split('\n')].map(l=>JSON.parse(l).detail.i);assert.equal(all.at(-1),9);
    assert.deepEqual(all,[...all].sort((a,b)=>a-b),'order preserved across rotation');
  },'stm-diag-'));
  test('invalid, oversized and flooding inputs are refused',()=>withTempDir(async dir=>{
    const d=new Diagnostics(dir,'1.0.0');
    for(const type of [undefined,'','Upper','1start','a/b','x'.repeat(65)])await assert.rejects(d.record({type}),/Invalid diagnostic event/);
    await assert.rejects(d.record({type:'big',detail:'x'.repeat(70000)}),/too large/);
    await assert.rejects(d.record({type:'p',project:'{"code":1}'}),/Invalid diagnostic project/);
    await assert.rejects(d.record({type:'p',project:'not json'}));
    const results=await Promise.all(Array.from({length:80},(_,i)=>d.record({type:'flood',detail:{i}})));
    assert.ok(results.some(r=>r.ok===false&&/queue is full/.test(r.message)));assert.ok(results.filter(r=>r.ok).length>=64);
  },'stm-diag-'));
});

// ---------------------------------------------------------------- native build helpers
describe('native build helpers',()=>{
  test('validateTools requires absolute single-line paths and returns every key',()=>{
    const abs=path.resolve('/opt/gcc/bin/arm-none-eabi-gcc');const v=nativeBuild.validateTools({armGcc:abs});
    assert.deepEqual(Object.keys(v),nativeBuild.TOOL_KEYS);assert.equal(v.armGcc,abs);assert.equal(v.cube,'');
    for(const bad of [{armGcc:'gcc'},{armGcc:'./gcc'},{armGcc:abs+'\n--evil'},{armGcc:abs+'\0'},{armGcc:5},{armGcc:'/'+'x'.repeat(2048)}])assert.throws(()=>nativeBuild.validateTools(bad),/절대 경로/);
    assert.throws(()=>nativeBuild.validateTools(null),/개발 도구/);
  });
  test('detectTools keeps configured paths that exist and detects again those that do not',()=>withTempDir(async dir=>{
    const gcc=path.join(dir,'arm-none-eabi-gcc');await fs.writeFile(gcc,'');
    const tools=await nativeBuild.detectTools({armGcc:gcc,clangd:path.join(dir,'missing','clangd.exe'),buildRoot:'/tmp/b',bogus:'x'});
    assert.deepEqual(Object.keys(tools).sort(),[...nativeBuild.TOOL_KEYS].sort());assert.equal(tools.armGcc,gcc);assert.equal(tools.buildRoot,'/tmp/b');
    assert.notEqual(tools.clangd,path.join(dir,'missing','clangd.exe'),'a missing path is not kept');
  },'stm-detect-'));
  test('diagnosticsFrom parses GCC messages',()=>{
    const out='C:/w/main.c:12:5: error: expected \';\' before \'}\' token\nuser.c:3:1: warning: unused variable \'x\'\nmain.c:4:2: note: declared here\nmain.c:1:10: fatal error: foo.h: No such file\nlinker noise';
    assert.deepEqual(nativeBuild.diagnosticsFrom(out).map(d=>[d.file,d.line,d.column,d.severity]),[['main.c',12,5,'error'],['user.c',3,1,'warning'],['main.c',4,2,'info'],['main.c',1,10,'error']]);
  });
  test('fingerprint depends only on build inputs',()=>{
    const p=blankProject(),f=nativeBuild.fingerprint(p,{target:'arm'});
    assert.match(f,/^[a-f0-9]{64}$/);assert.equal(nativeBuild.fingerprint({...p,name:'renamed',components:[1]},{target:'arm'}),f);
    assert.notEqual(nativeBuild.fingerprint({...p,code:p.code+' '},{target:'arm'}),f);assert.notEqual(nativeBuild.fingerprint(p,{target:'host'}),f);
  });
  test('prepareBuild (host) writes sources and compile_commands.json without running a compiler',()=>withTempDir(async dir=>{
    const gcc=path.join(dir,'bin','gcc');await fs.mkdir(path.dirname(gcc));await fs.writeFile(gcc,'');
    const p=blankProject();p.code='int main(void){return 0;}';p.firmware.files=[{name:'util.c',text:'int u;'},{name:'util.h',text:'#pragma once'},{name:'algo.cpp',text:'int a;'}];
    const plan=await nativeBuild.prepareBuild({project:p,tools:{hostGcc:gcc},root:path.join(dir,'build'),target:'host',configuration:'Release'});
    assert.equal(path.dirname(plan.directory),path.join(dir,'build'));assert.deepEqual(plan.files,['main.c','util.c','util.h','algo.cpp']);
    assert.equal(await readText(path.join(plan.directory,'util.h')),'#pragma once');
    assert.equal(plan.units.length,3,'headers are not compiled');assert.ok(plan.flags.includes('-Os'));assert.equal(plan.linker,path.join(dir,'bin','g++'),'C++ sources link with g++');
    const cppUnit=plan.units.find(u=>u.file.endsWith('algo.cpp'));assert.ok(cppUnit.arguments.includes('-std=c++17'));assert.ok(!cppUnit.arguments.includes('-Werror=implicit-function-declaration'));
    assert.deepEqual(JSON.parse(await readText(path.join(plan.directory,'compile_commands.json'))),plan.units);
    assert.equal(plan.elf,path.join(plan.directory,'program.exe'));
  },'stm-build-'));
  test('prepareBuild (arm) generates main.h, startup environment and linker script from a Cube SDK layout',()=>withTempDir(async dir=>{
    const gcc=path.join(dir,'bin','arm-none-eabi-gcc'),cube=path.join(dir,'cube');await fs.mkdir(path.dirname(gcc));await fs.writeFile(gcc,'');
    const inc=path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc');await fs.mkdir(inc,{recursive:true});await fs.writeFile(path.join(inc,'stm32f4xx_hal.h'),'');await fs.writeFile(path.join(inc,'stm32f4xx_hal_conf_template.h'),'/* conf */');
    const p=blankProject();p.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'LD2',initial:0};p.mcu.pins.PC13={function:'GPIO_EXTI',pull:'NOPULL',edge:'FALLING',label:'',initial:0};
    p.mcu.nvic.EXTI15_10_IRQn={enabled:true,priority:0};p.mcu.peripherals.USART2={enabled:true,baud:115200};p.mcu.nvic.USART2_IRQn={enabled:true,priority:1};
    const plan=await nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc,cube},root:path.join(dir,'build')});
    assert.match(await readText(path.join(plan.directory,'main.h')),/void Error_Handler/);assert.ok(plan.flags.includes('-DLD2_Pin=GPIO_PIN_5')&&plan.flags.includes('-DLD2_GPIO_Port=GPIOA'),'labels reach every source, also with a user main.h');
    const env=await readText(path.join(plan.directory,'__stm_environment.c'));
    assert.match(env,/void EXTI15_10_IRQHandler\(void\) \{ HAL_GPIO_EXTI_IRQHandler\(GPIO_PIN_13\); \}/);assert.match(env,/void USART2_IRQHandler\(void\) \{ HAL_UART_IRQHandler\(&huart2\); \}/);
    assert.match(await readText(path.join(plan.directory,'stm32f446re.ld')),/FLASH \(rx\) : ORIGIN = 0x08000000, LENGTH = 512K/);
    assert.equal(await readText(path.join(plan.directory,'stm32f4xx_hal_conf.h')),'/* conf */');
    assert.ok(plan.flags.includes('-mcpu=cortex-m4')&&plan.flags.includes('-DSTM32F446xx')&&plan.flags.includes('-O0'));assert.ok(plan.linkFlags.includes('--specs=nano.specs'));
    assert.ok(plan.units.some(u=>u.file.endsWith('startup_stm32f446xx.s')));assert.equal(path.basename(plan.elf),'firmware.elf');
  },'stm-build-'));
  test('prepareBuild (arm) for an STM32F103RB project uses STM32CubeF1, Cortex-M3 flags, F103xB startup and 128K/20K memory',()=>withTempDir(async dir=>{
    const gcc=path.join(dir,'bin','arm-none-eabi-gcc'),cubeF1=path.join(dir,'cubef1');await fs.mkdir(path.dirname(gcc));await fs.writeFile(gcc,'');
    const inc=path.join(cubeF1,'Drivers/STM32F1xx_HAL_Driver/Inc');await fs.mkdir(inc,{recursive:true});await fs.writeFile(path.join(inc,'stm32f1xx_hal.h'),'');await fs.writeFile(path.join(inc,'stm32f1xx_hal_conf_template.h'),'/* f1 conf */');
    const p={...blankProject('STM32F103RB'),boardId:'nucleo-f103rb'};p.mcu.dma={USART2_RX:{stream:'DMA1_Channel6',channel:0,mode:'CIRCULAR',priority:'HIGH'}};
    // The F4 SDK alone is not enough for an F1 project.
    await assert.rejects(nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc,cube:path.join(dir,'none')},root:path.join(dir,'build')}),/STM32CubeF1/);
    const plan=await nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc,cubeF1},root:path.join(dir,'build')});
    assert.match(await readText(path.join(plan.directory,'main.h')),/#include "stm32f1xx_hal.h"/);
    assert.equal(await readText(path.join(plan.directory,'stm32f1xx_hal_conf.h')),'/* f1 conf */');
    const ld=await readText(path.join(plan.directory,'stm32f103rb.ld'));assert.match(ld,/LENGTH = 128K/);assert.match(ld,/LENGTH = 20K/);
    assert.ok(plan.flags.includes('-mcpu=cortex-m3')&&plan.flags.includes('-DSTM32F103xB')&&!plan.flags.some(f=>f.startsWith('-mfpu')));
    assert.ok(plan.units.some(u=>u.file.endsWith('startup_stm32f103xb.s'))&&plan.units.some(u=>u.file.endsWith('stm32f1xx_hal_gpio_ex.c')));
    assert.match(await readText(path.join(plan.directory,'__stm_environment.c')),/void DMA1_Channel6_IRQHandler\(void\) \{ HAL_DMA_IRQHandler\(&hdma_usart2_rx\); \}/);
  },'stm-build-'));
  test('prepareBuild (arm) wires each enabled interrupt to its own HAL handler (sync USART, I2C, ADC, EXTI lines)',()=>withTempDir(async dir=>{
    const gcc=path.join(dir,'bin','arm-none-eabi-gcc'),cube=path.join(dir,'cube');await fs.mkdir(path.dirname(gcc));await fs.writeFile(gcc,'');
    const inc=path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc');await fs.mkdir(inc,{recursive:true});await fs.writeFile(path.join(inc,'stm32f4xx_hal.h'),'');await fs.writeFile(path.join(inc,'stm32f4xx_hal_conf_template.h'),'');
    const p=blankProject(),pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
    Object.assign(p.mcu.pins,{PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),PA4:pin('USART2_CK'),PB8:pin('I2C1_SCL'),PB9:pin('I2C1_SDA'),PA0:pin('GPIO_EXTI'),PC13:pin('GPIO_EXTI'),PA1:pin('ADC1_IN1')});
    Object.assign(p.mcu.peripherals,{USART2:{enabled:true,baud:115200,mode:'synchronous'},I2C1:{enabled:true,clock:100000},ADC1:{enabled:true}});
    for(const irq of ['USART2_IRQn','I2C1_EV_IRQn','I2C1_ER_IRQn','ADC_IRQn','EXTI0_IRQn','EXTI15_10_IRQn','TIM3_IRQn','USART1_IRQn'])p.mcu.nvic[irq]={enabled:true,priority:1};
    // The #else branch of #if 0 defines SysTick_Handler; a handler inside #if 0 (with a nested #ifdef) does not count.
    p.code+='\n#if 0\nvoid SysTick_Handler(void){}\n#else\nvoid SysTick_Handler(void){HAL_IncTick();}\n#endif\n#if 0\n#ifdef X\n#endif\nvoid EXTI0_IRQHandler(void){}\n#endif\n';
    const env=await readText(path.join((await nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc,cube},root:path.join(dir,'build')})).directory,'__stm_environment.c'));
    assert.match(env,/extern USART_HandleTypeDef husart2;/);
    assert.doesNotMatch(env,/void SysTick_Handler/);assert.doesNotMatch(env,/huart2/);
    assert.match(env,/void USART2_IRQHandler\(void\) \{ HAL_USART_IRQHandler\(&husart2\); \}/);
    assert.match(env,/void I2C1_EV_IRQHandler\(void\) \{ HAL_I2C_EV_IRQHandler\(&hi2c1\); \}/);assert.match(env,/void I2C1_ER_IRQHandler\(void\) \{ HAL_I2C_ER_IRQHandler\(&hi2c1\); \}/);
    assert.match(env,/void ADC_IRQHandler\(void\) \{ HAL_ADC_IRQHandler\(&hadc1\); \}/);
    assert.match(env,/void TIM3_IRQHandler\(void\) \{  \}/);assert.match(env,/void USART1_IRQHandler\(void\) \{  \}/,'no handle for a disabled peripheral');assert.doesNotMatch(env,/htim3|huart1/);
    assert.match(env,/void EXTI0_IRQHandler\(void\) \{ HAL_GPIO_EXTI_IRQHandler\(GPIO_PIN_0\); \}/);assert.match(env,/void EXTI15_10_IRQHandler\(void\) \{ HAL_GPIO_EXTI_IRQHandler\(GPIO_PIN_13\); \}/);
  },'stm-build-'));
  test('prepareBuild rejects bad targets, non-ASCII build roots, missing tools and reserved names',()=>withTempDir(async dir=>{
    const gcc=path.join(dir,'gcc');await fs.writeFile(gcc,'');const p=blankProject(),root=path.join(dir,'b');
    await assert.rejects(nativeBuild.prepareBuild({project:p,tools:{hostGcc:gcc},root:path.join(dir,'빌드'),target:'host'}),/한글/);
    await assert.rejects(nativeBuild.prepareBuild({project:p,tools:{hostGcc:gcc},root,target:'riscv'}),/빌드 대상/);
    await assert.rejects(nativeBuild.prepareBuild({project:p,tools:{hostGcc:gcc},root,target:'host',configuration:'Fast'}),/빌드 대상/);
    await assert.rejects(nativeBuild.prepareBuild({project:p,tools:{},root,target:'host'}),/GCC 경로/);
    await assert.rejects(nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc},root,target:'arm'}),/STM32CubeF4/);
    const sketch=blankProject();sketch.firmware.mode='sketch';await assert.rejects(nativeBuild.prepareBuild({project:sketch,tools:{armGcc:gcc},root,target:'arm'}),/HAL 프로젝트/);
    const reserved=blankProject();reserved.firmware.files=[{name:'__stm_environment.c',text:''}];await assert.rejects(nativeBuild.prepareBuild({project:reserved,tools:{hostGcc:gcc},root,target:'host'}),/내부 빌드용/);
  },'stm-build-'));
});

// ---------------------------------------------------------------- GDB/MI
describe('GDB/MI parser',()=>{
  test('result records with tokens, nested tuples and lists',()=>{
    const r=parseRecord('12^done,bkpt={number="1",type="breakpoint",addr="0x08000420",file="main.c",line="7",thread-groups=["i1"]}');
    assert.equal(r.token,12);assert.equal(r.type,'^');assert.equal(r.class,'done');assert.deepEqual(r.bkpt.number,'1');assert.deepEqual(r.bkpt['thread-groups'],['i1']);
    const frames=parseRecord('^done,stack=[frame={level="0",func="add"},frame={level="1",func="main"}]');assert.equal(frames.token,null);assert.deepEqual(frames.stack.map(f=>f.func),['add','main']);
    const regs=parseRecord('5^done,register-values=[{number="0",value="0x1"},{number="15",value="0x8000"}]');assert.deepEqual(regs['register-values'][1],{number:'15',value:'0x8000'});
    assert.deepEqual(parseRecord('7^done'),{token:7,type:'^',class:'done'});
  });
  test('async and stream records with C escapes',()=>{
    const s=parseRecord('*stopped,reason="breakpoint-hit",frame={func="main",args=[],file="main.c",line="9"}');
    assert.equal(s.type,'*');assert.equal(s.class,'stopped');assert.equal(s.reason,'breakpoint-hit');assert.deepEqual(s.frame.args,[]);
    assert.deepEqual(parseRecord('~"Hello\\tWorld\\n"'),{type:'~',text:'Hello\tWorld\n'});
    assert.deepEqual(parseRecord('@"\\101\\102\\"q\\""'),{type:'@',text:'AB"q"'});
    assert.equal(parseRecord('=thread-group-added,id="i1"').id,'i1');
    assert.equal(parseRecord('(gdb) '),null);assert.equal(parseRecord('plain program output'),null);
    assert.throws(()=>parseRecord('~"unterminated'),/Incomplete MI string/);
    assert.equal(quote('a "b"\\c'),'"a \\"b\\"\\\\c"');
  });
});

describe('GdbSession command plumbing (fake GDB process)',()=>{
  function fakeSession(replies={}){
    const s=new GdbSession(),sent=[];s.closed=false;s.state='paused';s.files=new Set(['main.c']);
    s.child={stdin:{write(text,cb){sent.push(text);cb?.();const m=/^(\d+)(.*)\n$/.exec(text);const reply=Object.entries(replies).find(([prefix])=>m[2].startsWith(prefix))?.[1]??'^done';setImmediate(()=>s.receive(m[1]+(typeof reply==='function'?reply(m[2]):reply)));}}};
    return {s,sent};
  }
  test('commands are numbered and resolved by their token',async()=>{
    const {s,sent}=fakeSession({'-data-evaluate-expression':'^done,value="42"'});
    assert.equal(await s.evaluate('count + 1'),'42');assert.equal(sent[0],'1-data-evaluate-expression "count + 1"\n');
    assert.equal(await s.evaluate('a[2] == 3'),'42','comparisons are read-only');
  });
  test('watch expressions with side effects are refused before reaching GDB',async()=>{
    const {s,sent}=fakeSession();
    for(const bad of ['x = 1','x++','--x','x += 2','f()','a; b','x <<= 1','','x'.repeat(251)])await assert.rejects(s.evaluate(bad),/읽기 전용 감시식/,bad);
    assert.deepEqual(sent,[]);
  });
  test('GDB error records reject with the GDB message',async()=>{
    const {s}=fakeSession({'-data-evaluate-expression':'^error,msg="No symbol \\"nope\\" in current context."'});
    await assert.rejects(s.evaluate('nope'),/No symbol "nope" in current context/);
  });
  test('stopped/running records update state and emit events',async()=>{
    const {s}=fakeSession(),events=[];s.on('state',e=>events.push(e));s.on('output',t=>events.push({output:t}));
    s.receive('*running,thread-id="all"');assert.equal(s.state,'running');
    s.receive('*stopped,reason="end-stepping-range",frame={line="8"}');assert.equal(s.state,'paused');
    s.receive('~"console text\\n"');s.receive('not mi at all');
    s.receive('*stopped,reason="exited-normally"');assert.equal(s.state,'exited');
    assert.deepEqual(events.map(e=>e.state??e.output),['running','paused','console text\n','not mi at all\n','exited']);
  });
  test('stepping requires a paused target; unknown actions are rejected',async()=>{
    const {s,sent}=fakeSession();await s.action('over');assert.equal(sent[0],'1-exec-next\n');
    s.state='running';await assert.rejects(s.action('into'),/일시정지/);await s.action('pause');assert.equal(sent[1],'2-exec-interrupt --all\n');
    await assert.rejects(s.action('reverse'),/지원하지 않는/);
  });
  test('breakpoints are validated, replaced and reported as verified or pending',async()=>{
    const {s,sent}=fakeSession({'-break-insert':cmd=>cmd.includes('later.c')?'^done,bkpt={number="2",addr="<PENDING>",line="0"}':'^done,bkpt={number="1",addr="0x0800",line="12"}'});
    const result=await s.setBreakpoints([{file:'main.c',line:10},{file:'later.c',line:5}]);
    assert.deepEqual(result,[{file:'main.c',line:10,verified:true,actualLine:12},{file:'later.c',line:5,verified:false,actualLine:5}]);
    await s.setBreakpoints([]);assert.ok(sent.includes('3-break-delete 1\n')&&sent.includes('4-break-delete 2\n'),sent.join(''));
    await assert.rejects(s.setBreakpoints([{file:'../x.c',line:1}]),/중단점 위치/);await assert.rejects(s.setBreakpoints([{file:'main.c',line:0}]),/중단점 위치/);
  });
  test('memory reads are bounded; commands fail after close',async()=>{
    const {s}=fakeSession({'-data-read-memory-bytes':'^done,memory=[{begin="0x20000000",contents="0102"}]'});
    assert.deepEqual(await s.memory('0x20000000',2),[{begin:'0x20000000',contents:'0102'}]);
    for(const [addr,count]of [['$sp',4],['0x10',0],['0x10',4097],['0x10',1.5]])await assert.rejects(s.memory(addr,count),/주소와 길이/);
    s.finish(new Error('closed'));assert.equal(s.state,'idle');await assert.rejects(s.command('-gdb-version'),/디버거를 먼저 시작/);
  });
  test('pending commands are rejected when the session finishes',async()=>{
    const s=new GdbSession();s.closed=false;s.child={stdin:{write(){}}};
    const pending=s.command('-exec-continue');s.finish(new Error('GDB 연결이 종료되었습니다.'));await assert.rejects(pending,/연결이 종료/);
  });
});

describe('native tools for a real NUCLEO board',()=>{
 const {NativeIde,openocdArgs}=require('../../desktop/native-ide.cjs');
 const {detectTools}=require('../../desktop/native-build.cjs');
 test('OpenOCD from STM32CubeIDE starts with ST scripts and the ST-LINK DAP interface; other builds keep stlink.cfg',()=>withTempDir(async dir=>{
  const plugins=path.join(dir,'STM32CubeIDE','plugins');
  const exe=path.join(plugins,'com.st.stm32cube.ide.mcu.externaltools.openocd.win32_2.4.200','tools','bin','openocd.exe');
  for(const v of ['2.2.0','2.3.100']){const scripts=path.join(plugins,`com.st.stm32cube.ide.mcu.debug.openocd_${v}`,'resources','openocd','st_scripts','interface');await fs.mkdir(scripts,{recursive:true});await fs.writeFile(path.join(scripts,'stlink-dap.cfg'),'');}
  assert.deepEqual(await openocdArgs(exe),['-s',path.join(plugins,'com.st.stm32cube.ide.mcu.debug.openocd_2.3.100','resources','openocd','st_scripts'),'-f','interface/stlink-dap.cfg','-c','transport select dapdirect_swd','-f','target/stm32f4x.cfg']);
  assert.deepEqual(await openocdArgs(path.join(dir,'xpack-openocd-0.12.0-7','bin','openocd.exe')),['-f','interface/stlink.cfg','-f','target/stm32f4x.cfg']);
  // NUCLEO-F103RB: F1 target script, and one ST-LINK picked by serial when several boards are connected.
  assert.deepEqual(await openocdArgs(exe,{target:'stm32f1x',serial:'0668FF544949878667173544'}).then(a=>a.slice(4)),['-c','adapter serial 0668FF544949878667173544','-c','transport select dapdirect_swd','-f','target/stm32f1x.cfg']);
  assert.deepEqual(await openocdArgs(path.join(dir,'openocd.exe'),{target:'stm32f1x'}),['-f','interface/stlink.cfg','-f','target/stm32f1x.cfg']);
 }));
 test('the ST-LINK of the project board is chosen by board name; several unknown ones ask for the serial',async()=>{
  const {chooseStlink}=require('../../desktop/native-ide.cjs');
  const two=async()=>[{serial:'0668FF544949878667173544',board:'NUCLEO-F103RB'},{serial:'0672FF485775495067192757',board:'NUCLEO-F446RE'}];
  assert.equal(await chooseStlink('NUCLEO-F103RB','',two),'0668FF544949878667173544');
  assert.equal(await chooseStlink('NUCLEO-F446RE','',two),'0672FF485775495067192757');
  assert.equal(await chooseStlink('NUCLEO-F446RE','ABCDEF0123',two),'ABCDEF0123');
  await assert.rejects(chooseStlink('NUCLEO-F446RE','0668FF544949878667173544',two),/선택한 보드 NUCLEO-F103RB는 프로젝트 보드 NUCLEO-F446RE와 다릅니다/);
  assert.equal(await chooseStlink('NUCLEO-F446RE','',async()=>[{serial:'0672FF485775495067192757',board:''}]),'0672FF485775495067192757');
  assert.equal(await chooseStlink('NUCLEO-F446RE','',async()=>[]),'');
  // Only another kind of board connected: never write firmware for the wrong MCU.
  await assert.rejects(chooseStlink('NUCLEO-F103RB','',async()=>[{serial:'0672FF485775495067192757',board:'NUCLEO-F446RE'}]),/NUCLEO-F103RB가 연결되어 있지 않습니다.*NUCLEO-F446RE/);
  await assert.rejects(chooseStlink('NUCLEO-F103RB','',async()=>[{serial:'AAAA0000',board:''},{serial:'BBBB1111',board:''}]),/ST-LINK가 2개 연결되어 있습니다.*AAAA0000, BBBB1111/);
 });
 test('saving the tools dialog keeps the entered values in the file and auto-detects empty entries right away',()=>withTempDir(async dir=>{
  const ide=new NativeIde(dir),entered={armGcc:'',armGdb:'',cube:'',cubeF1:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''};
  const tools=await ide.configure(entered);
  assert.deepEqual(JSON.parse(await readText(path.join(dir,'native-tools.json'))),entered);
  assert.deepEqual(tools,await detectTools(entered));
 }));
});
