import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
const require=createRequire(import.meta.url);
const {PortableUpdater,compareVersions,allowedUrl,releaseInfo,validateManifest,verifyFile,readJson,downloadFile}=require('../desktop/updater.cjs');
const binary=Buffer.from('MZ update fixture'),hash=createHash('sha256').update(binary).digest('hex');
function fixture(version='0.17.0'){
 const filename=`STM-Simulator-${version}-win-x64.exe`,base=`https://github.com/moonsyu/STM-Simulator/releases/download/v${version}/`;
 return {release:{tag_name:'v'+version,draft:false,prerelease:false,assets:[filename,'update-manifest.json'].map(name=>({name,state:'uploaded',size:binary.length,browser_download_url:base+name}))},manifest:{schemaVersion:1,version,filename,bytes:binary.length,sha256:hash}};
}
async function setup(t,options={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'stm-update-test-')),target=path.join(directory,'STM custom name.exe');await fs.writeFile(target,'MZ old');
 const data=fixture();let reads=0,transfers=0,applied=0;
 const updater=new PortableUpdater({version:'0.16.0',directory,target,enabled:true,read:async url=>{reads++;return url.endsWith('/latest')?data.release:data.manifest;},download:async(info,file,{onProgress})=>{transfers++;await fs.writeFile(file,binary);onProgress(binary.length);},apply:async()=>{applied++;},...options});
 t.after(async()=>{updater.close();await fs.rm(directory,{recursive:true,force:true});});
 await updater.init();return {updater,directory,target,data,counts:()=>({reads,transfers,applied})};
}
test('stable versions compare numerically, rejecting paths, prereleases and malformed values',()=>{
 assert.equal(compareVersions('0.16.10','0.16.2'),1);assert.equal(compareVersions('1.0.0','0.99.99'),1);assert.equal(compareVersions('0.16.0','0.16.0'),0);
 for(const bad of ['0.16.0-beta','v0.16.0','01.2.3','../exe','1.2.3\n','9999999.0.0'])assert.throws(()=>compareVersions(bad,'0.16.0'));
});
test('updater only follows HTTPS to the official repo and GitHub asset hosts',()=>{
 for(const url of ['https://api.github.com/repos/moonsyu/STM-Simulator/releases/latest','https://github.com/moonsyu/STM-Simulator/releases/download/v0.17.0/update-manifest.json','https://release-assets.githubusercontent.com/a?signature=example'])assert.ok(allowedUrl(url));
 for(const url of ['http://github.com/moonsyu/STM-Simulator/releases/download/a','https://github.com.evil.test/moonsyu/STM-Simulator/releases/download/a','https://github.com/other/repo/releases/download/a','https://user:pass@release-assets.githubusercontent.com/a','https://release-assets.githubusercontent.com:444/a','file:///C:/bad.exe'])assert.throws(()=>allowedUrl(url));
});
test('releases require a newer stable version, matching exact EXE and complete upload',()=>{
 const {release,manifest}=fixture();const info=releaseInfo(release,'0.16.0');assert.equal(info.version,'0.17.0');assert.equal(validateManifest(manifest,info).sha256,hash);
 assert.equal(releaseInfo(release,'0.17.0'),null);assert.equal(releaseInfo(release,'0.18.0'),null);
 assert.throws(()=>releaseInfo({...release,prerelease:true},'0.16.0'));
 assert.throws(()=>releaseInfo({...release,assets:release.assets.slice(0,1)},'0.16.0'));
 assert.throws(()=>releaseInfo({...release,assets:[{...release.assets[0],browser_download_url:'https://example.com/evil.exe'},release.assets[1]]},'0.16.0'));
 for(const field of ['version','filename','bytes','sha256','schemaVersion'])assert.throws(()=>validateManifest({...manifest,[field]:'wrong'},info));
});
test('manual checks offer download, deduplicate concurrent requests and verify before installation',async t=>{
 const {updater,counts,target}=await setup(t);await Promise.all([updater.check(),updater.check()]);
 assert.equal(updater.snapshot().phase,'available');assert.equal(counts().reads,2);assert.equal(counts().transfers,0);
 await Promise.all([updater.download(),updater.download()]);assert.equal(updater.snapshot().phase,'ready');assert.equal(counts().transfers,1);
 assert.equal(await fs.readFile(target,'utf8'),'MZ old');assert.equal(await updater.install(),true);assert.equal(counts().applied,1);assert.equal(updater.snapshot().phase,'installing');
 await assert.rejects(()=>updater.install());
});
test('automatic checks download without restarting the app',async t=>{
 const {updater,counts}=await setup(t);await updater.check(true);assert.equal(updater.snapshot().phase,'ready');assert.equal(counts().transfers,1);assert.equal(counts().applied,0);
});
test('a cached verified download is reused after reopening the app',async t=>{
 const {updater,directory,counts}=await setup(t);await fs.writeFile(path.join(directory,'pending.exe'),binary);await updater.check(true);assert.equal(updater.snapshot().phase,'ready');assert.equal(counts().transfers,0);
});
test('automatic preference persists and disabling it prevents automatic download',async t=>{
 const {updater,directory}=await setup(t);await updater.configure(false);await updater.check(true);assert.equal(updater.snapshot().phase,'available');
 const reloaded=new PortableUpdater({version:'0.16.0',directory,enabled:false});t.after(()=>reloaded.close());await reloaded.init();assert.equal(reloaded.snapshot().automatic,false);await assert.rejects(()=>updater.configure('yes'));
});
test('corrupt download never becomes ready and leaves the old EXE untouched',async t=>{
 const {updater,directory,target}=await setup(t,{download:async(_info,file)=>fs.writeFile(file,'MZ corrupted')});await updater.check(true);
 assert.equal(updater.snapshot().phase,'error');assert.equal(await fs.readFile(target,'utf8'),'MZ old');assert.equal((await fs.readdir(directory)).filter(file=>file.endsWith('.part')||file==='pending.exe').length,0);await assert.rejects(()=>updater.install());
});
test('rechecks the cached EXE immediately before applying and permits retry on helper failure',async t=>{
 const {updater,directory,counts}=await setup(t);await updater.check(true);await fs.writeFile(path.join(directory,'pending.exe'),'MZ tampered');await assert.rejects(()=>updater.install());assert.equal(counts().applied,0);assert.equal(updater.snapshot().phase,'ready');
 await fs.writeFile(path.join(directory,'pending.exe'),binary);updater.apply=async()=>{throw new Error('helper unavailable');};await assert.rejects(()=>updater.install(),/helper unavailable/);assert.equal(updater.snapshot().phase,'ready');
});
test('offline errors are recoverable, and dev builds do not contact the server',async t=>{
 const {updater}=await setup(t,{read:async()=>{throw new Error('offline');}});await updater.check();assert.equal(updater.snapshot().phase,'error');assert.match(updater.snapshot().message,/offline/);
 updater.enabled=false;assert.equal((await updater.check()).phase,'error');
 const {updater:dev,counts}=await setup(t,{enabled:false});assert.equal((await dev.check()).phase,'unsupported');assert.equal(counts().reads,0);
});
test('file verification rejects size, hash and EXE magic mismatches',async t=>{
 const {directory}=await setup(t);const info={bytes:binary.length,sha256:hash},file=path.join(directory,'verify.exe');await fs.writeFile(file,binary);await verifyFile(file,info);
 await assert.rejects(()=>verifyFile(file,{...info,sha256:'0'.repeat(64)}));await assert.rejects(()=>verifyFile(file,{...info,bytes:1}));
 const noExe=Buffer.from(binary);noExe[0]=0;await fs.writeFile(file,noExe);await assert.rejects(()=>verifyFile(file,{bytes:noExe.length,sha256:createHash('sha256').update(noExe).digest('hex')}));
});
function mockNetwork(t,replies){
 const calls=[];
 t.mock.method(https,'get',(url,_options,callback)=>{
  calls.push(String(url));const reply=replies[String(url)];if(!reply)throw new Error('Unexpected request: '+url);
  const request=new EventEmitter();request.setTimeout=()=>request;request.destroy=error=>request.emit('error',error);
  queueMicrotask(()=>{const stream=Readable.from(reply.chunks||[Buffer.from(reply.body||'')]);stream.statusCode=reply.status||200;stream.headers=reply.headers||{};callback(stream);});return request;
 });return calls;
}
test('production JSON transport handles redirects and rejects off-host or excessive responses',async t=>{
 const url='https://api.github.com/repos/moonsyu/STM-Simulator/releases/latest',redirect='https://release-assets.githubusercontent.com/fixture';
 const replies={[url]:{status:302,headers:{location:redirect}},[redirect]:{body:'{"version":"0.17.0"}'}};
 const calls=mockNetwork(t,replies);assert.equal((await readJson(url)).version,'0.17.0');assert.equal(calls.length,2);
 replies[url].headers.location='https://example.com/update.exe';await assert.rejects(()=>readJson(url),/공식 GitHub/);
 replies[url]={chunks:[Buffer.alloc(2*1024*1024+1)]};await assert.rejects(()=>readJson(url),/너무 큽니다/);
 replies[url]={status:403};await assert.rejects(()=>readJson(url),/요청 한도/);
});
test('production download transport streams and verifies bytes, refusing truncated/oversized payloads',async t=>{
 const {directory}=await setup(t),info=validateManifest(fixture().manifest,releaseInfo(fixture().release,'0.16.0'));
 const replies={[info.url]:{chunks:[binary.subarray(0,2),binary.subarray(2)]}};mockNetwork(t,replies);
 const file=path.join(directory,'stream.exe');await downloadFile(info,file);assert.deepEqual(await fs.readFile(file),binary);
 replies[info.url]={chunks:[binary.subarray(0,4)]};await assert.rejects(()=>downloadFile(info,path.join(directory,'short.exe')),/크기/);
 replies[info.url]={chunks:[Buffer.alloc(info.bytes+1)]};await assert.rejects(()=>downloadFile(info,path.join(directory,'large.exe')),/초과/);
});
