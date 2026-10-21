// Regenerates desktop/tool-manifest.json: the files of STM32CubeF4 the ARM build needs, with the SHA-256 of each
// git object, so the in-app installer can download GitHub source archives and verify every file it keeps.
// Usage: node scripts/build-tool-manifest.mjs <STM32CubeF4 clone at v1.28.3 with the two driver submodules>
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const cube=process.argv[2];
if(!cube)throw new Error('STM32CubeF4 clone path is required.');
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{maxBuffer:64*1024*1024});
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
function files(dir,commit,keep){
  return git(dir,'ls-tree','-r','--name-only',commit).toString().split('\n').filter(p=>p&&keep(p))
    .map(p=>{const bytes=git(dir,'cat-file','blob',`${commit}:${p}`);return {path:p,bytes:bytes.length,sha256:sha(bytes)};});
}
const hal=path.join(cube,'Drivers/STM32F4xx_HAL_Driver'),device=path.join(cube,'Drivers/CMSIS/Device/ST/STM32F4xx');
const commits={cube:git(cube,'rev-parse','HEAD').toString().trim(),hal:git(hal,'rev-parse','HEAD').toString().trim(),device:git(device,'rev-parse','HEAD').toString().trim()};
const manifest={
  version:'STM32CubeF4 v1.28.3',
  // Each source is a GitHub repository at a fixed commit; `into` is its folder inside the SDK root.
  sources:[
    {repo:'STMicroelectronics/stm32f4xx_hal_driver',commit:commits.hal,into:'Drivers/STM32F4xx_HAL_Driver',archive:true,
     files:files(hal,commits.hal,p=>/^(Inc|Src)\//.test(p)||p==='LICENSE.md')},
    {repo:'STMicroelectronics/cmsis_device_f4',commit:commits.device,into:'Drivers/CMSIS/Device/ST/STM32F4xx',archive:true,
     files:files(device,commits.device,p=>/^Include\//.test(p)||/^Source\/Templates\/(system_stm32f4xx\.c|gcc\/)/.test(p)||p==='LICENSE.md')},
    // CMSIS Core headers are a few files inside the large STM32CubeF4 repository, fetched one by one.
    {repo:'STMicroelectronics/STM32CubeF4',commit:commits.cube,into:'',archive:false,
     files:files(cube,commits.cube,p=>/^Drivers\/CMSIS\/Include\/[^/]+\.h$/.test(p)||p==='Drivers/CMSIS/LICENSE.txt')}
  ]
};
const out=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','desktop','tool-manifest.json');
fs.writeFileSync(out,JSON.stringify(manifest,null,1)+'\n');
console.log(out,manifest.sources.map(s=>`${s.repo}@${s.commit.slice(0,7)} ${s.files.length} files`).join(', '));
