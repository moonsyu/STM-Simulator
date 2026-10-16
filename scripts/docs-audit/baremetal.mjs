import fs from 'node:fs/promises';
import {PART_LIBRARY} from '../../src/part-library.js';
import {deviceDocs} from '../../src/device-docs-data.js';
import {baremetalCards} from '../../src/device-baremetal.js';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {cFunctions} from '../../src/c-source-edit.js';
import {fixture} from './runtime.mjs';
import paths from './paths.cjs';
const rows=[];
for(const {type}of PART_LIBRARY){const docs=deviceDocs(type);for(const card of baremetalCards(docs.sample.mcu,type,docs.sample)){
 const {project,target}=fixture(type);
 try{const applied=applyDeviceExample(project,target,{mode:'baremetal',api:card.id}).project;rows.push({type,api:card.id,inserted:true,target:applied.ide?.native?.target,noNewFiles:JSON.stringify(project.firmware.files)===JSON.stringify(applied.firmware.files),noNewFunctions:JSON.stringify(cFunctions(project.code).map(f=>f.name))===JSON.stringify(cFunctions(applied.code).map(f=>f.name)),runtime:'not-supported-in-HAL-simulator'});}catch(e){rows.push({type,api:card.id,inserted:false,error:e.message,runtime:'not-tested'});}
}}
await fs.mkdir(paths.out,{recursive:true});
await fs.writeFile(new URL('baremetal.json',paths.out),JSON.stringify(rows,null,2));console.log(JSON.stringify({count:rows.length,insertionFailures:rows.filter(r=>!r.inserted),runtimeVerified:0}));
