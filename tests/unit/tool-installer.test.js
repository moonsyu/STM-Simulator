import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {withTempDir,exists} from './helpers/tmp.js';

const require=createRequire(import.meta.url);
const {installPlan,installTools,installRelease,installCube,RELEASES}=require('../../desktop/tool-installer.cjs');
const manifest=require('../../desktop/tool-manifest.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const windows=process.platform==='win32';
// Zips a folder with Windows' bsdtar (the installer extracts with the same tool).
async function zip(dir,out){execFileSync(path.join(process.env.SystemRoot||'C:/Windows','System32','tar.exe'),['-a','-cf',out,'-C',dir,'.']);return fs.readFile(out);}
const fakeFetch=routes=>async url=>{const body=routes[url];if(body===undefined)return new Response('missing',{status:404});return new Response(body,{headers:{'content-length':String(body.length)}});};

test('the plan lists only missing tools, in install order, with sizes and hosts',()=>{
 const all={armGcc:'g',armGdb:'d',cube:'c',openocd:'o',clangd:'l'};
 assert.deepEqual(installPlan(all),[]);
 const plan=installPlan({...all,armGdb:'',cube:'',clangd:''});
 assert.deepEqual(plan.map(p=>p.id),['gcc','cube','clangd']);
 assert.ok(plan.every(p=>p.bytes>0&&p.label&&p.source));
 assert.equal(plan[0].source,'github.com');
});

test('the pinned manifest covers the HAL, CMSIS device and CMSIS core files the ARM build uses',()=>{
 const paths=manifest.sources.flatMap(s=>s.files.map(f=>path.posix.join(s.into,f.path)));
 for(const needed of ['Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h','Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal_conf_template.h','Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_gpio.c',
  'Drivers/CMSIS/Device/ST/STM32F4xx/Include/stm32f446xx.h','Drivers/CMSIS/Device/ST/STM32F4xx/Source/Templates/system_stm32f4xx.c','Drivers/CMSIS/Device/ST/STM32F4xx/Source/Templates/gcc/startup_stm32f446xx.s','Drivers/CMSIS/Include/core_cm4.h'])
  assert.ok(paths.includes(needed),needed);
 assert.ok(manifest.sources.every(s=>/^[0-9a-f]{40}$/.test(s.commit)&&s.files.every(f=>/^[0-9a-f]{64}$/.test(f.sha256))));
});

test('a release zip is installed after its SHA-256 matches, and rejected (leaving nothing behind) when it does not',{skip:!windows&&'bsdtar zip extraction is Windows-only'},()=>withTempDir(async dir=>{
 const src=path.join(dir,'src');await fs.mkdir(path.join(src,'tool-1.0','bin'),{recursive:true});await fs.writeFile(path.join(src,'tool-1.0','bin','tool.exe'),'MZ');
 const bytes=await zip(src,path.join(dir,'tool.zip')),root=path.join(dir,'root');await fs.mkdir(root);
 const item={id:'tool',label:'Tool',url:'https://example.test/tool.zip',sha256:sha(bytes),bytes:bytes.length,check:'tool-1.0/bin/tool.exe'},events=[];
 await installRelease(item,root,{fetchImpl:fakeFetch({[item.url]:bytes}),onProgress:e=>events.push(e.phase)});
 assert.ok(await exists(path.join(root,'tool-1.0','bin','tool.exe')));
 assert.ok(events.includes('download')&&events.includes('extract'));
 const other=path.join(dir,'other');await fs.mkdir(other);
 await assert.rejects(installRelease({...item,sha256:'0'.repeat(64)},other,{fetchImpl:fakeFetch({[item.url]:bytes}),onProgress:()=>{}}),/SHA-256 검증 실패/);
 assert.deepEqual(await fs.readdir(other),[]);
}));

test('the STM32CubeF4 subset is assembled from an archive and single files, each file checked against the manifest',{skip:!windows&&'bsdtar zip extraction is Windows-only'},()=>withTempDir(async dir=>{
 // GitHub source archives hold a single top folder named <repo>-<commit>.
 const wrap=path.join(dir,'wrap'),archive=path.join(wrap,'repo-abc');await fs.mkdir(path.join(archive,'Inc'),{recursive:true});
 await fs.writeFile(path.join(archive,'Inc','a.h'),'#define A 1\n');await fs.writeFile(path.join(archive,'README.md'),'not kept');
 const zipBytes=await zip(wrap,path.join(dir,'repo.zip'));
 const core=Buffer.from('/* core */\n'),commit='a'.repeat(40);
 const fake={version:'test',sources:[
  {repo:'st/repo',commit,into:'Drivers/HAL',archive:true,files:[{path:'Inc/a.h',bytes:12,sha256:sha(Buffer.from('#define A 1\n'))}]},
  {repo:'st/cube',commit,into:'',archive:false,files:[{path:'Drivers/CMSIS/Include/core.h',bytes:core.length,sha256:sha(core)}]}]};
 const routes={[`https://codeload.github.com/st/repo/zip/${commit}`]:zipBytes,[`https://raw.githubusercontent.com/st/cube/${commit}/Drivers/CMSIS/Include/core.h`]:core};
 const root=path.join(dir,'root');await fs.mkdir(root);
 await installCube(root,{fetchImpl:fakeFetch(routes),onProgress:()=>{}},fake);
 assert.equal(await fs.readFile(path.join(root,'STM32CubeF4','Drivers','HAL','Inc','a.h'),'utf8'),'#define A 1\n');
 assert.equal(await fs.readFile(path.join(root,'STM32CubeF4','Drivers','CMSIS','Include','core.h'),'utf8'),'/* core */\n');
 assert.ok(!await exists(path.join(root,'STM32CubeF4','Drivers','HAL','README.md')),'files outside the manifest are not kept');
 // A tampered file aborts the install and leaves no partial SDK.
 const bad=path.join(dir,'bad');await fs.mkdir(bad);
 await assert.rejects(installCube(bad,{fetchImpl:fakeFetch({...routes,[`https://raw.githubusercontent.com/st/cube/${commit}/Drivers/CMSIS/Include/core.h`]:Buffer.from('changed')}),onProgress:()=>{}},fake),/core\.h 검증 실패/);
 assert.deepEqual(await fs.readdir(bad),[]);
}));

test('installTools skips tools already present and rejects unknown ids',()=>withTempDir(async dir=>{
 const gcc=RELEASES[0];await fs.mkdir(path.join(dir,path.dirname(gcc.check)),{recursive:true});await fs.writeFile(path.join(dir,gcc.check),'MZ');
 const events=[];await installTools(['gcc'],{root:dir,fetchImpl:()=>{throw new Error('must not download');},onProgress:e=>events.push(e)});
 assert.deepEqual(events,[{id:'gcc',phase:'skipped'}]);
 await assert.rejects(installTools(['unknown'],{root:dir}),/설치할 도구/);
}));
