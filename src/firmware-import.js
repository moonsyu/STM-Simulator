import {importIoc,defaultMcu} from './mcu-config.js';
import {validateProject} from './project.js';

export function importFirmware(project,files){
  if(!Array.isArray(files)||files.length>41||!files.length)throw new Error('.ioc 및 .c/.h 파일을 선택하세요.');
  const next=structuredClone(project),warnings=[],names=new Set();let size=0;
  for(const file of files){if(!file||typeof file.name!=='string'||! /^[\w.-]+\.(ioc|c|h)$/.test(file.name)||typeof file.text!=='string'||names.has(file.name))throw new Error('파일 이름, 확장자 또는 중복을 확인하세요.');names.add(file.name);size+=file.text.length;}
  if(size>800000)throw new Error('가져올 파일은 합계 800 KB 이하로 선택하세요.');
  const iocs=files.filter(f=>f.name.endsWith('.ioc'));if(iocs.length>1)throw new Error('.ioc 파일은 하나만 선택하세요.');
  if(iocs.length){const imported=importIoc(iocs[0].text);next.mcu=imported.config;warnings.push(...imported.warnings);}
  next.mcu??=defaultMcu();
  const sourceFiles=files.filter(f=>/\.[ch]$/.test(f.name));
  if(sourceFiles.length){
    const main=sourceFiles.find(f=>f.name==='main.c');
    if(!main)throw new Error('C 소스를 가져올 때 main.c를 함께 선택하세요.');
    next.code=main.text;next.firmware={mode:'hal',files:sourceFiles.filter(f=>f!==main).map(f=>({name:f.name,text:f.text}))};
  }
  return {project:validateProject(next),warnings};
}
