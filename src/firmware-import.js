import {importIoc,defaultMcu,generateHal} from './mcu-config.js';
import {expandC} from './c-format.js';
import {regenerateMain} from './c-source-edit.js';
import {regenerateOverrides} from './project-overrides.js';
import {validateProject} from './project.js';
import {projectBoard,boardForFamily} from './boards.js';
import {SOURCE_PATH,MAX_SOURCE_FILES,MAX_SOURCE_BYTES,baseName,folderOf,nameClash,normalizeText} from './source-files.js';

export function importFirmware(project,files){
  if(!Array.isArray(files)||files.length>MAX_SOURCE_FILES+1||!files.length)throw new Error('.ioc 및 .c/.h 파일을 선택하세요.');
  const next=structuredClone(project),warnings=[],names=new Set();let size=0;
  for(const file of files){if(!file||typeof file.name!=='string'||!(/^[\w.-]+\.ioc$/.test(file.name)||SOURCE_PATH.test(file.name)&&/\.(c|h|s|ld)$/.test(file.name))||typeof file.text!=='string'||names.has(file.name))throw new Error('파일 이름, 확장자 또는 중복을 확인하세요.');names.add(file.name);size+=file.text.length;}
  if(size>MAX_SOURCE_BYTES)throw new Error('가져올 파일은 합계 1 MB 이하로 선택하세요.');
  files=files.map(f=>({...f,text:normalizeText(f.text)}));
  const iocs=files.filter(f=>f.name.endsWith('.ioc'));if(iocs.length>1)throw new Error('.ioc 파일은 하나만 선택하세요.');
  const board=projectBoard(project);
  if(iocs.length){
    const imported=importIoc(iocs[0].text);
    if(imported.config.family!==board.mcuFamily)throw new Error(`이 .ioc는 ${imported.config.family}용입니다. 현재 보드는 ${board.name}이니 ${boardForFamily(imported.config.family)?.name??imported.config.family} 보드로 새 프로젝트를 만든 뒤 가져오세요.`);
    next.mcu=imported.config;warnings.push(...imported.warnings);
  }
  next.mcu??=defaultMcu(board.mcuFamily);
  const sourceFiles=files.filter(f=>/\.[ch]$/.test(f.name));
  if(!sourceFiles.length&&files.some(f=>/\.(s|ld)$/.test(f.name)))throw new Error('시작 코드·링커 스크립트는 main.c를 함께 가져올 때 들어옵니다. 이미 있는 프로젝트에는 파일 추가로 넣으세요.');
  if(sourceFiles.length){
    // main.c: at the top, or where CubeIDE keeps it (Core/Src); its folder is remembered so the tree stays as imported.
    const mains=sourceFiles.filter(f=>baseName(f.name)==='main.c'),main=mains.find(f=>f.name==='main.c')??mains.find(f=>/(^|\/)Core\/Src\/main\.c$/.test(f.name))??mains[0];
    if(!main)throw new Error('C 소스를 가져올 때 main.c를 함께 선택하세요.');
    if(mains.length>1)warnings.push(`main.c가 여러 개라 ${main.name}을 주 소스로 썼습니다: ${mains.filter(f=>f!==main).map(f=>f.name).join(', ')}는 가져오지 않았습니다.`);
    // Names a project cannot hold (MAIN.C beside main.c, two names that differ only in case, a file where a folder is)
    // are left out with a warning: with them the project could not be saved or opened again.
    const kept=[],left=[];for(const f of sourceFiles.filter(f=>baseName(f.name)!=='main.c')){if(nameClash(kept.map(k=>k.name),f.name))left.push(f.name);else kept.push(f);}
    if(left.length)warnings.push(`이름이 겹쳐 가져오지 않은 파일: ${left.join(', ')}`);
    // The project's own startup code and linker script come along (the ARM build then uses them in place of the SDK's
    // startup file and the script the app writes) — only the ones of this board's MCU: a startup file of another MCU
    // would give a wrong vector table, and the _RAM script would link the program into RAM.
    const digits=/^STM32F(\d{3})/.exec(next.mcu.family)?.[1]||'',skippedBuild=[];
    for(const f of files.filter(f=>/\.(s|ld)$/.test(f.name))){
      const base=baseName(f.name),fits=/\.s$/.test(base)?new RegExp(`^startup_stm32f${digits}`,'i').test(base):new RegExp(`F${digits}`,'i').test(base)&&!/_RAM\.ld$/i.test(base);
      const twice=/\.s$/.test(base)?kept.some(k=>/(^|\/)startup_[^/]*\.s$/i.test(k.name)):kept.some(k=>/\.ld$/.test(k.name));
      if(!digits||!fits||twice||nameClash(kept.map(k=>k.name),f.name))skippedBuild.push(f.name);else kept.push(f);
    }
    if(skippedBuild.length)warnings.push(`가져오지 않은 시작 코드·링커 스크립트: ${skippedBuild.join(', ')} (이 보드의 MCU 것이 아니거나 _RAM 스크립트이거나 이미 하나 가져옴). 앱이 넣는 것으로 빌드합니다.`);
    next.code=main.text;next.firmware={mode:'hal',files:kept.map(f=>({name:f.name,text:f.text})),...(folderOf(main.name)?{mainFolder:folderOf(main.name)}:{})};
  }
  // Only an .ioc: the settings change and main.c is generated from them as CubeMX does (USER CODE sections kept), so the
  // import shows in the code too. A configuration that cannot be generated leaves main.c as it was, with the reason. A
  // main.c without USER CODE sections (written by hand) is never replaced: it would lose everything outside them.
  let regenerated=false;
  if(iocs.length&&!sourceFiles.length&&!/\/\* USER CODE BEGIN /.test(project.code||''))warnings.push('main.c에 USER CODE 구역이 없어 코드는 그대로 두었습니다. Pinout & Configuration의 "설정으로 HAL 코드 생성"으로 이 설정의 코드를 만들 수 있습니다.');
  else if(iocs.length&&!sourceFiles.length){
    const previous=(()=>{try{return expandC(generateHal(project.mcu));}catch{return '';}})();
    try{const r=regenerateMain(project.code,expandC(generateHal(next.mcu)),previous,(next.firmware?.files||[]).map(f=>f.text));next.code=r.code;regenerated=true;if(r.moved.length)warnings.push('USER CODE 구역 밖에 있던 코드를 구역 안으로 옮겨 유지했습니다: '+r.moved.join(', '));
      // Edited generated files (feature 45) are regenerated with the new settings as well.
      const o=regenerateOverrides(project,next.mcu);if(next.firmware)next.firmware.files=o.files;if(o.report.length)warnings.push('다시 생성하며 USER CODE 구역 밖에서 고친 줄을 지웠습니다: '+o.report.map(x=>`${x.name} ${x.reset?'원본으로':x.lost+'줄'}`).join(', '));}
    catch(e){warnings.push('main.c는 바꾸지 않았습니다: '+e.message);}
  }
  return {project:validateProject(next),warnings,regenerated};
}
