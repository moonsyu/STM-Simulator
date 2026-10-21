// Regenerates the STM32Cube manifests: the files of STM32CubeF4 / STM32CubeF1 the ARM build needs, with the SHA-256 of
// each git object, so the in-app installer can download GitHub source archives and verify every file it keeps.
// Usage: node scripts/build-tool-manifest.mjs <STM32CubeF4 clone at v1.28.3 with the two driver submodules>
//        node scripts/build-tool-manifest.mjs --f1 <STM32CubeF1 clone at v1.8.7 with the two driver submodules>
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const f1=process.argv[2]==='--f1',cube=process.argv[f1?3:2];
if(!cube)throw new Error('STM32Cube clone path is required.');
const S=f1?{version:'STM32CubeF1 v1.8.7',hal:'STM32F1xx_HAL_Driver',device:'STM32F1xx',halRepo:'stm32f1xx_hal_driver',deviceRepo:'cmsis_device_f1',cubeRepo:'STM32CubeF1',system:'system_stm32f1xx.c',license:'License.md',out:'tool-manifest-f1.json'}
  :{version:'STM32CubeF4 v1.28.3',hal:'STM32F4xx_HAL_Driver',device:'STM32F4xx',halRepo:'stm32f4xx_hal_driver',deviceRepo:'cmsis_device_f4',cubeRepo:'STM32CubeF4',system:'system_stm32f4xx.c',license:'LICENSE.md',out:'tool-manifest.json'};
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{maxBuffer:64*1024*1024});
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
function files(dir,commit,keep){
  return git(dir,'ls-tree','-r','--name-only',commit).toString().split('\n').filter(p=>p&&keep(p))
    .map(p=>{const bytes=git(dir,'cat-file','blob',`${commit}:${p}`);return {path:p,bytes:bytes.length,sha256:sha(bytes)};});
}
const hal=path.join(cube,'Drivers',S.hal),device=path.join(cube,'Drivers/CMSIS/Device/ST',S.device);
const commits={cube:git(cube,'rev-parse','HEAD').toString().trim(),hal:git(hal,'rev-parse','HEAD').toString().trim(),device:git(device,'rev-parse','HEAD').toString().trim()};
const manifest={
  version:S.version,
  // Each source is a GitHub repository at a fixed commit; `into` is its folder inside the SDK root.
  sources:[
    {repo:'STMicroelectronics/'+S.halRepo,commit:commits.hal,into:'Drivers/'+S.hal,archive:true,
     files:files(hal,commits.hal,p=>/^(Inc|Src)\//.test(p)||p==='LICENSE.md')},
    {repo:'STMicroelectronics/'+S.deviceRepo,commit:commits.device,into:'Drivers/CMSIS/Device/ST/'+S.device,archive:true,
     files:files(device,commits.device,p=>/^Include\//.test(p)||p==='Source/Templates/'+S.system||/^Source\/Templates\/gcc\//.test(p)||p===S.license)},
    // CMSIS Core headers are a few files inside the large STM32Cube repository, fetched one by one.
    {repo:'STMicroelectronics/'+S.cubeRepo,commit:commits.cube,into:'',archive:false,
     files:files(cube,commits.cube,p=>/^Drivers\/CMSIS\/Include\/[^/]+\.h$/.test(p)||p==='Drivers/CMSIS/LICENSE.txt')}
  ]
};
const out=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','desktop',S.out);
fs.writeFileSync(out,JSON.stringify(manifest,null,1)+'\n');
console.log(out,manifest.sources.map(s=>`${s.repo}@${s.commit.slice(0,7)} ${s.files.length} files`).join(', '));
