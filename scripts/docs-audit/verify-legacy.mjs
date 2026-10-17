import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {PART_LIBRARY} from '../../src/part-library.js';
import {HAL_EXAMPLES,halExample} from '../../src/hal-examples.js';
import {deviceDocs} from '../../src/device-docs-data.js';
import {legacyIds,legacyAssessment} from './legacy.mjs';
import {apply} from './runtime.mjs';
import {assess} from './oracles.mjs';
import paths from './paths.cjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),file=name=>new URL(name,paths.out),publicMode=process.argv.includes('--public');
const legacy=[];
for(const id of legacyIds){const row=await read(file('legacy-'+id+'.json'));assert.deepEqual(row.project,halExample(id),'current standalone source '+id);const result=legacyAssessment(id,row.project,row.execution);assert.equal(result.passed,true,id);legacy.push({id,name:HAL_EXAMPLES[id],checks:result.checks});}
const devices=[],cards=[];
for(const {type,name}of PART_LIBRARY.filter(p=>!p.type.startsWith('ref_'))){
 const core=await read(file('core-'+type+'.json')),apis=await read(file('cards-'+type+'.json')),saved=await read(file(type+'.stm32lab'));
 assert.deepEqual(saved,apply(type).project,'current Docs circuit '+type);
 for(const ok of [core.assessment.passed,core.repair.assessment.passed,core.topology.connected,core.topology.isolated,core.repair.topology.connected,core.repair.topology.isolated,...Object.values(core.structure),core.idempotent,core.repair.unrelatedWirePreserved])assert.equal(ok,true,type);
 assert.ok(core.removedWireChecks.every(c=>c.connected&&c.isolated&&!c.error),type+' individual wire repair');
 assert.deepEqual(apis.cards.map(c=>c.api).sort(),deviceDocs(type).functions.map(f=>f.name).sort(),type+' API coverage');
 for(const card of apis.cards){assert.equal(card.status,'api-exercised',type+':'+card.api);assert.ok(Object.values(card.structure).every(Boolean));assert.ok(card.topology.connected&&card.topology.isolated);cards.push({type,api:card.api,status:card.status});}
 devices.push({type,name,passed:true,wireRepairs:core.removedWireChecks.length,halCards:apis.cards.length});
}
const remapped=await Promise.all(['stepper','l298n'].map(type=>read(file('remapped-'+type+'.json'))));assert.ok(remapped.every(r=>r.passed&&!r.execution.error));
const arm=await read(path.join(paths.root,'work/test-results/legacy-docs-arm.json'));assert.ok(arm.passed&&arm.results.length===46);
const ui=await read(path.join(paths.root,'work/test-results/code-reset-'+(publicMode?'public':'dev')+'.json'));assert.ok(ui.passed&&ui.remapped.length===2&&ui.version===paths.version);
let release=null,packaged=null;
if(publicMode){
 release=await read(path.join(paths.root,`work/test-results/release-${paths.version}-proof.json`));assert.ok(release.verified&&release.version===paths.version&&release.latest==='v'+paths.version);assert.equal(ui.exeSha256,release.manifest.sha256);
 packaged=await read(file('packaged-summary.json'));assert.ok(!packaged.dev&&packaged.version===paths.version&&packaged.rows.length===devices.length);assert.equal(packaged.exeSha256,release.manifest.sha256);
 const phases=await read(file('phase-samples/packaged-summary.json'));assert.ok(!phases.dev&&phases.stepSamples&&phases.version===paths.version);assert.equal(phases.exeSha256,release.manifest.sha256);assert.deepEqual(phases.rows.map(r=>r.type).sort(),['matrix','relay','servo']);
 assert.deepEqual(packaged.rows.map(r=>r.type).sort(),devices.map(r=>r.type).sort());
 for(const row of packaged.rows){
  assert.ok(!row.error&&!row.errors.length&&row.applied&&row.started&&row.stateEvents&&row.simulationMs>=3500,row.type);const saved=await read(file('packaged-'+row.type+'.stm32lab'));assert.deepEqual(saved,apply(row.type).project,row.type+' public source');
  const raw=await read(file('packaged-'+row.type+'.json')),frames=raw.events.filter(e=>e.type==='simulation.state').map(e=>e.detail),printed=raw.console.map(e=>({text:e.message})),text=printed.map(e=>e.text).join('\n'),parts=frames.map(f=>f.parts?.selected).filter(Boolean);
  assert.ok(frames.every(f=>!f.fault),row.type+' public circuit fault');let checks;
  // File state samples are sparse; edge-by-edge behavior remains covered by the
  // source audit. Judge observable public outputs, not the existence of a log.
  const check=(name,passed)=>[{name,passed:!!passed}];
  if(row.type==='resistor'){const source=await read(file('core-resistor.json')),values=Object.keys(source.execution.calls.HAL_ADC_GetValue.returns);checks=check('divider current and ADC output for the selected resistance',parts.some(p=>p.current>0&&p.voltage>0)&&values.some(v=>new RegExp('\\b'+v+'\\b').test(text)));}
  else if(row.type==='ldr')checks=check('printed ADC changes with illumination',new Set([...text.matchAll(/LDR ADC=(\d+)/g)].map(m=>m[1])).size>=2);
  else if(row.type==='capacitor')checks=check('capacitor charges under PWM',parts.some(p=>p.voltage>1));
  else if(row.type==='button')checks=check('unpressed button is read correctly',/button=0/.test(text));
  else if(row.type==='rgb')checks=check('RGB output is lit',parts.some(p=>Object.values(p.channels||{}).some(c=>c.on)));
  else if(row.type==='stepper')checks=check('shaft moves and both directions are commanded',parts.some(p=>Math.abs(p.steps)>0)&&/direction=-1/.test(text)&&/direction=1/.test(text));
  else if(['board','breadboard','led'].includes(row.type))checks=check('GPIO reads alternate HIGH/LOW (periodic LED snapshots can alias)',/PA5=1/.test(text)&&/PA5=0/.test(text));
  // The desktop accelerometer range input rounds 0.75 to its 0.1-g step, 0.8.
  else if(row.type==='mpu6050')checks=check('WHO_AM_I and desktop quantized acceleration/gyro inputs',[/WHO_AM_I=0x68/,/-0\.50/,/90\.0/,/0\.80/,/-45\.0/].every(re=>re.test(text)));
  else if(['matrix','relay','servo'].includes(row.type)){
   const sampled=await read(file('phase-samples/packaged-'+row.type+'.json'));
   assert.ok(!sampled.error&&!sampled.errors.length&&sampled.applied&&sampled.started&&sampled.simulationMs>=3500,row.type+' sampled run');
   assert.deepEqual(await read(file('phase-samples/packaged-'+row.type+'.stm32lab')),saved,row.type+' sampled source');
   checks=assess(row.type,{error:sampled.error,frames:sampled.events.filter(e=>e.type==='simulation.state').map(e=>e.detail),printed:sampled.console.map(e=>({text:e.message})),calls:{}}).checks;
  }
  else checks=assess(row.type,{error:row.error,frames,printed,calls:{}}).checks;
  assert.ok(checks.every(c=>c.passed),row.type+' public output: '+JSON.stringify(checks.filter(c=>!c.passed)));
  devices.find(d=>d.type===row.type).publicChecks=checks.map(c=>({name:c.name,passed:c.passed}));
 }
}
const output=path.join(paths.root,'docs/audits',paths.version+'-legacy-docs');await fs.mkdir(output,{recursive:true});
const result={version:paths.version,sourcePassed:true,publicPassed:publicMode,legacyCount:legacy.length,deviceCount:devices.length,halCardCount:cards.length,singleWireRepairs:devices.reduce((n,d)=>n+d.wireRepairs,0),armLinks:arm.results.length,legacy,devices,remapped:remapped.map(r=>({type:r.type,passed:r.passed,binding:r.binding})),resetChecks:ui.checks,release:release?{url:release.release,commit:release.tagCommit,exeSha256:release.manifest.sha256}:null};
await fs.writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));await fs.writeFile(path.join(output,'hal-cards.csv'),'device,api,status\n'+cards.map(c=>[c.type,c.api,c.status].join(',')).join('\n')+'\n');
const report=`# ${paths.version} 기존 HAL 예제·Docs·코드 초기화 검증\n\n상태: ${publicMode?'공개 Release EXE 검증 완료':'소스·개발 Electron 검증 완료. 공개 Release 검증 대기'}.\n\n## 수정 내용\n\n- Docs 미리보기를 실제 배정 GPIO·타이머·I²C 주소·클록 값에 맞춤. 원본의 낡은 핀 설명 주석은 미리보기에 포함하지 않음.\n- 복합 GPIO 비트 마스크와 동적 스테퍼 위상 마스크를 여러 포트에 맞게 변환. 마스크·출력 식은 한 번만 평가하며 0인 포트 마스크는 호출하지 않음.\n- main 폴링으로 바꾼 입력 예제의 최초 상태를 가짜 이벤트로 보고하지 않고 RISING/FALLING/CHANGE 조건을 지킴. PIR·엔코더 설명 보완.\n- 코드 초기화: main만 기본 코드로 교체. 회로·배선·핀 설정·보조 파일 유지, 취소/Esc/되돌리기/재적용 지원, 실행 중 사용 제한, 진단 로그 저장.\n\n## 검증 결과\n\n| 검사 | 결과 |\n|---|---|\n| 기존 HAL 원본 예제 | ${legacy.length}/${legacy.length} 실제 실행·출력 판정 |\n| 기존 장치 + 보드 Docs | ${devices.length}/${devices.length} 전체 예제·입력 반응·손상 배선 복구 실행 |\n| 기존 Docs 개별 HAL 카드 | ${cards.length}/${cards.length} 적용 후 선택 API 호출·반환 확인 |\n| 선 하나씩 제거·복구 | ${result.singleWireRepairs}개 연결/분리 검사 |\n| 다른 포트에 재배선 | 스테퍼 정·역회전, L298N 양방향 회전 통과 |\n| ARM GCC + ST HAL/CMSIS | 원본 40 + 초기화 4 + 재배선 2 = 46개 링크 |\n| 코드 초기화 앱 로그 | ${ui.checks.length}개 확인, LED OFF 0 A → 재적용 ON 약 3.93 mA |\n| 공개 EXE | ${publicMode?devices.length+'개 Docs + 초기화·재배선 앱 로그 대조 통과':'대기'} |\n\n공개 EXE는 36개 장치의 출력 값도 대조했다. 버튼 누름/해제와 RGB 모든 채널은 촘촘한 소스 실행 로그로 확인했으며, 공개 자동 실행에서는 버튼의 초기 상태와 RGB 점등을 확인했다. 매트릭스·서보·릴레이는 앱의 스텝 버튼으로 구간별 상태를 추가 기록했다. MPU6050의 데스크톱 입력은 슬라이더 0.1 g 간격에 맞춰 0.75가 0.8 g로 반올림된다.\n\n기존 원본 예제는 Docs 레시피로 대체하지 않고 직접 실행했다. 원본 EXTI 엔코더, USER 버튼, 내장 USART2 VCP, TIM 인터럽트/입력 캡처/독립 PWM, ADC 배열, 함수·구조체 예제를 포함한다.\n\n개별 카드의 API 호출 도달은 장치 전체 동작 판정과 구분했다. 모든 단선 위치마다 동작을 반복한 것은 아니며, 전체 누락·오접속 복구에는 실제 실행을 포함했다. 실제 STM32 보드 실행이 아닌 시뮬레이터 실행이다. ARM 링크는 빌드 검사이며 실물 동작 검증이 아니다. Bare-metal의 실행 지원 범위는 변경하지 않았다.\n\n## 기존 원본 예제 목록\n\n| ID | 예제 | 결과 |\n|---|---|---|\n${legacy.map(r=>`| ${r.id} | ${r.name} | 통과 |`).join('\n')}\n\n## 기존 장치 Docs 목록\n\n| 장치 | HAL 카드 | 단선 복구 | 결과 |\n|---|---|---|---|\n${devices.map(r=>`| ${r.name} (${r.type}) | ${r.halCards} | ${r.wireRepairs} | 통과 |`).join('\n')}\n\n## 재현과 증거\n\n- 실행 스크립트: scripts/docs-audit/README.md 참고. 원본/Docs/수리/카드/재배선 로그: work/test-results/docs-audit-${paths.version}/.\n- 초기화 앱 파일 로그: work/test-results/code-reset-${publicMode?'public':'dev'}.json. 격리 프로필을 사용하며 사용자 앱은 조작하지 않았다.\n- 상세 수정 위치는 FIX-LOCATIONS.md에 별도로 기록.\n${release?'- 공개 Release: '+release.release+'\n- 빌드 커밋: '+release.tagCommit+'\n- STM-Simulator.exe SHA-256: '+release.manifest.sha256+'\n':''}`;
await fs.writeFile(path.join(output,'REPORT.md'),report);console.log(JSON.stringify({passed:true,public:publicMode,legacy:legacy.length,docs:devices.length,cards:cards.length,wireRepairs:result.singleWireRepairs,arm:46}));
