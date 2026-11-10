import {importIoc,defaultMcu,generateHal} from './mcu-config.js';
import {expandC} from './c-format.js';
import {regenerateMain} from './c-source-edit.js';
import {validateProject} from './project.js';
import {projectBoard,boardForFamily} from './boards.js';
import {SOURCE_PATH,MAX_SOURCE_FILES,MAX_SOURCE_BYTES,baseName,folderOf} from './source-files.js';

export function importFirmware(project,files){
  if(!Array.isArray(files)||files.length>MAX_SOURCE_FILES+1||!files.length)throw new Error('.ioc 및 .c/.h 파일을 선택하세요.');
  const next=structuredClone(project),warnings=[],names=new Set();let size=0;
  for(const file of files){if(!file||typeof file.name!=='string'||!(/^[\w.-]+\.ioc$/.test(file.name)||SOURCE_PATH.test(file.name)&&/\.[ch]$/.test(file.name))||typeof file.text!=='string'||names.has(file.name))throw new Error('파일 이름, 확장자 또는 중복을 확인하세요.');names.add(file.name);size+=file.text.length;}
  if(size>MAX_SOURCE_BYTES)throw new Error('가져올 파일은 합계 1 MB 이하로 선택하세요.');
  const iocs=files.filter(f=>f.name.endsWith('.ioc'));if(iocs.length>1)throw new Error('.ioc 파일은 하나만 선택하세요.');
  const board=projectBoard(project);
  if(iocs.length){
    const imported=importIoc(iocs[0].text);
    if(imported.config.family!==board.mcuFamily)throw new Error(`이 .ioc는 ${imported.config.family}용입니다. 현재 보드는 ${board.name}이니 ${boardForFamily(imported.config.family)?.name??imported.config.family} 보드로 새 프로젝트를 만든 뒤 가져오세요.`);
    next.mcu=imported.config;warnings.push(...imported.warnings);
  }
  next.mcu??=defaultMcu(board.mcuFamily);
  const sourceFiles=files.filter(f=>/\.[ch]$/.test(f.name));
  if(sourceFiles.length){
    // main.c: at the top, or where CubeIDE keeps it (Core/Src); its folder is remembered so the tree stays as imported.
    const mains=sourceFiles.filter(f=>baseName(f.name)==='main.c'),main=mains.find(f=>f.name==='main.c')??mains.find(f=>/(^|\/)Core\/Src\/main\.c$/.test(f.name))??mains[0];
    if(!main)throw new Error('C 소스를 가져올 때 main.c를 함께 선택하세요.');
    if(mains.length>1)warnings.push(`main.c가 여러 개라 ${main.name}을 주 소스로 썼습니다: ${mains.filter(f=>f!==main).map(f=>f.name).join(', ')}는 가져오지 않았습니다.`);
    next.code=main.text;next.firmware={mode:'hal',files:sourceFiles.filter(f=>baseName(f.name)!=='main.c').map(f=>({name:f.name,text:f.text})),...(folderOf(main.name)?{mainFolder:folderOf(main.name)}:{})};
  }
  // Only an .ioc: the settings change and main.c is generated from them as CubeMX does (USER CODE sections kept), so the
  // import shows in the code too. A configuration that cannot be generated leaves main.c as it was, with the reason. A
  // main.c without USER CODE sections (written by hand) is never replaced: it would lose everything outside them.
  let regenerated=false;
  if(iocs.length&&!sourceFiles.length&&!/\/\* USER CODE BEGIN /.test(project.code||''))warnings.push('main.c에 USER CODE 구역이 없어 코드는 그대로 두었습니다. Pinout & Configuration의 "설정으로 HAL 코드 생성"으로 이 설정의 코드를 만들 수 있습니다.');
  else if(iocs.length&&!sourceFiles.length){
    const previous=(()=>{try{return expandC(generateHal(project.mcu));}catch{return '';}})();
    try{const r=regenerateMain(project.code,expandC(generateHal(next.mcu)),previous,(next.firmware?.files||[]).map(f=>f.text));next.code=r.code;regenerated=true;if(r.moved.length)warnings.push('USER CODE 구역 밖에 있던 코드를 구역 안으로 옮겨 유지했습니다: '+r.moved.join(', '));}
    catch(e){warnings.push('main.c는 바꾸지 않았습니다: '+e.message);}
  }
  return {project:validateProject(next),warnings,regenerated};
}
