import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PART_LIBRARY} from '../../src/part-library.js';
import {deviceDocs} from '../../src/device-docs-data.js';
import {assess} from './oracles.mjs';
import {family} from './runtime.mjs';
import paths from './paths.cjs';

const {out,version}=paths,publicRun=process.argv.includes('--public'),sourceOnly=process.argv.includes('--source-only');
const output=new URL(`../../docs/audits/${version}-device-docs/`,import.meta.url);
await fs.mkdir(output,{recursive:true});
const read=async name=>JSON.parse(await fs.readFile(new URL(name,out),'utf8'));
const structural=v=>v&&Object.values(v).every(x=>x===true);
const connected=v=>v?.connected===true&&v?.isolated===true;
const rows=[],cards=[],problems=[];
const requireResult=(condition,message)=>{if(!condition)problems.push(message);};
const packaged=sourceOnly?null:await read('packaged-summary.json');
let release=null;
if(publicRun){
 release=JSON.parse(await fs.readFile(new URL(`../../work/test-results/release-${version}-proof.json`,import.meta.url),'utf8'));
 assert.equal(release.verified,true);assert.equal(release.version,version);assert.equal(release.latest,'v'+version);
 assert.equal(packaged.exeSha256,release.manifest.sha256,'Tested binary must be the public download');
}
for(const {type,name}of PART_LIBRARY){
 const core=await read(`core-${type}.json`),cardRun=await read(`cards-${type}.json`);
 assert.ok(!core.fatal&&!cardRun.fatal,type+': '+(core.fatal||cardRun.fatal));
 const behavior=assess(type,core.execution),repair=core.repair?.execution&&assess(type,core.repair.execution);
 const wires=core.removedWireChecks,wireFailures=wires.filter(w=>w.error||!connected(w));
 const structure=structural(core.structure)&&core.idempotent&&core.repair.unrelatedWirePreserved;
 requireResult(behavior.passed&&repair?.passed&&connected(core.topology)&&connected(core.repair.topology)&&!wireFailures.length&&structure,type+': behavior/repair/structure');
 const expected=deviceDocs(type).functions.map(c=>c.name).sort();
 assert.deepEqual(cardRun.cards.map(c=>c.api).sort(),expected,type+': missing/duplicate HAL cards');
 for(const card of cardRun.cards){
  const ok=card.status==='api-exercised'&&structural(card.structure)&&connected(card.topology);
  requireResult(ok,type+': '+card.api+' '+card.status);
  cards.push({type,name,api:card.api,passed:ok,status:card.status,callCount:card.execution?.calls[card.api]?.count||0,returns:card.execution?.calls[card.api]?.returns||{},simulationMs:card.execution?.endMs});
 }
 const row={type,name,behavior:behavior.passed,repair:!!repair?.passed,structure,wireChecks:wires.length,wireFailures,observed:[...new Set(core.execution.printed.map(v=>v.text))].slice(0,24)};
 if(!sourceOnly){
  const app=await read(`packaged-${type}.json`),generated=await read(type+'.stm32lab'),saved=await read(`packaged-${type}.stm32lab`);
  const applied=app.events?.find(e=>e.type==='docs.applied'),states=app.events?.filter(e=>e.type==='simulation.state')||[];
  const text=(app.console||[]).map(e=>e.message).join('\n');
  const inputChecks=[];
  if(/ds18b20/.test(type))inputChecks.push(/10\.00/.test(text)&&/45\.00/.test(text));
  if(['encoder','ref_encoder_module_5'].includes(type))inputChecks.push(/count=3 edges=12/.test(text)&&/count=1 edges=4/.test(text));
  if(family(type)==='sd')inputChecks.push(/SD OCR=40ff8000/.test(text));
  if(family(type)==='tft'){
   const expected=createHash('sha256').update(JSON.stringify(Array.from({length:128*160},(_,i)=>i%128<43?0xf800:i%128<86?0x07e0:0x001f))).digest('hex');
   inputChecks.push(states.some(e=>e.detail.parts.selected?.device?.ram?.sha256===expected));
  }
  row.packaged={version:app.version,applied:app.applied,started:app.started,correctTarget:applied?.detail.binding.type===type,sameCode:saved.code===generated.code,sameWires:JSON.stringify(saved.wires)===JSON.stringify(generated.wires),stateEvents:states.length,simulationMs:app.simulationMs,stimuli:app.stimuli,inputChecks,error:app.error,errors:app.errors};
  const p=row.packaged;
  requireResult(p.version===version&&p.applied&&p.started&&p.correctTarget&&p.sameCode&&p.sameWires&&p.stateEvents>0&&p.simulationMs>=(/dht|ds18b20/.test(type)?5500:3500)&&!p.error&&!p.errors?.length&&inputChecks.every(Boolean)&&!states.some(e=>e.detail.fault),type+': packaged logs');
 }
 rows.push(row);
}
const bare=await read('baremetal.json'),migration=await read('migration.json'),diagnostics=await read('diagnostic-limit.json'),inline=await read('inline-name-collision.json');
requireResult(bare.every(r=>r.inserted&&r.noNewFiles&&r.noNewFunctions&&r.target==='arm'),'Bare-metal insertion');
requireResult(migration.length===10&&migration.every(r=>r.passed),'Previous-version reapplication');
requireResult(inline.passed&&diagnostics.length===2&&diagnostics.every(r=>r.accepted&&r.ram?.length===20480),'Inline/diagnostics focused checks');
const summary={version,stage:publicRun?'public-release':sourceOnly?'source':'local-exe',passed:problems.length===0,problems,devices:rows.length,behaviorPassed:rows.filter(r=>r.behavior).length,repairPassed:rows.filter(r=>r.repair).length,wireRecoveryChecks:rows.reduce((n,r)=>n+r.wireChecks,0),halCards:cards.length,apiExercised:cards.filter(c=>c.passed).length,baremetalCards:bare.length,baremetalRuntimeVerified:0,migrationPassed:migration.filter(r=>r.passed).length,packagedRuns:sourceOnly?0:rows.filter(r=>r.packaged?.stateEvents>0).length,exeSha256:packaged?.exeSha256,releaseCommit:release?.tagCommit,releaseUrl:release?.release,diagnostics,rows};
await fs.writeFile(new URL('results.json',output),JSON.stringify(summary,null,2)+'\n');
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
await fs.writeFile(new URL('hal-cards.csv',output),'\uFEFF'+[['device','name','api','passed','status','calls','returns','simulation_ms'],...cards.map(c=>[c.type,c.name,c.api,c.passed,c.status,c.callCount,JSON.stringify(c.returns),c.simulationMs])].map(r=>r.map(csv).join(',')).join('\n'));
const md=`# Docs 코드 적용·자동 배선 재검증 — ${version}

검사일: 2026-10-17. 단계: ${summary.stage}. 종합: ${summary.passed?'통과':'실패'}.

## 확인 결과

- 라이브러리 ${summary.devices}개: 실제 장치 동작 ${summary.behaviorPassed}개 통과.
- 전체 배선 누락·오접속 후 Docs 재적용: ${summary.repairPassed}개 회로 재실행 통과.
- 자동 생성 선 ${summary.wireRecoveryChecks}개를 하나씩 제거 후 재적용: 전기적 연결/신호 분리 검사. 각 단선 상태의 동적 실행은 아니며, 전체 손상 복구 회로는 모두 동적으로 실행했습니다.
- 개별 HAL 카드 ${summary.halCards}개: 선택 API의 호출·반환 ${summary.apiExercised}개 통과. 초기화 전용 카드는 해당 초기화 동작을 판정하고, 장치 전체 동작은 전체 예제로 별도 검사했습니다.
- 구버전 문제 회로 10개: 재적용 후 ${summary.migrationPassed}개 기능·사용자 함수/파일 보존 통과.
- Bare-metal ${summary.baremetalCards}개: main 삽입·파일/함수 보존·ARM 대상 전환 확인. 직접 레지스터 코드는 HAL 실행기에서 실행하지 않으므로 **동작 미검증**입니다.
- EXE 파일 로그: ${summary.packagedRuns}/114개. ${sourceOnly?'공개 EXE 검증은 게시 후 추가합니다.':publicRun?'공개 다운로드의 SHA-256과 실제 테스트한 EXE가 일치합니다.':'로컬 빌드 EXE이며 공개 Release 확인은 별도입니다.'}

## 수정한 원인

1. main에 보조 함수를 펼칠 때 반환 변수와 매개변수/지역 변수 이름 충돌 제거. DS18B20 온도와 SD 응답 전달 복구.
2. 2핀 순간 버튼·KY-004에서 중복 접점 병합 시 빵판 입력/접지 연결 보존.
3. 인코더·KY-040은 TIM 하드웨어 계수로 회전 에지 누락 방지. 새 콜백/함수/파일을 만들지 않음.
4. 커패시터 PWM 모드를 명시하여 PWM_Init 카드가 실제 PWM 초기화 실행.
5. TFT 전체 프레임의 SHA-256과 표본을 남기도록 상태 로그 축약. 두 TFT 모두 20,480개 기대 RGB565 픽셀의 전체 해시 일치.

## 실행 조건과 범위

- 기본 배치 → Docs 적용 → main 실행. 1,100ms와 2,300ms에 버튼·스위치·조도·온습도·거리·축·인코더 입력 변경, UART 수신 주입.
- DHT/DS18B20 5,500ms, 나머지 3,500ms 시뮬레이션. HAL 카드별 800~6,500ms. 생성 코드, GPIO, 타이머, API 반환, 전류, 통신 응답, 화면 메모리, 모터/서보 동작 기록.
- LED/부저 on/off, ADC 변화, LCD 문자열, OLED/매트릭스/TFT 데이터, 모터 정·역회전, 서보 각도, 릴레이 접점, 센서 응답, EEPROM 읽기를 개별 판정.
- EXE는 분리된 프로필·숨긴 창에서 실제 파일 열기/Docs/실행 버튼 경로 사용. 환경값은 실제 속성 입력 이벤트로 변경하고 시뮬레이션 시간 진행을 기다림. 앱이 기록한 JSONL을 별도 복사. 정밀 에지/입력 판정은 동일 소스의 SimulationSession 로그로 보완.
- 사용자 앱/회로에는 접근하지 않았습니다. 기존 회로에 이미 삽입된 코드는 자동 변경하지 않으므로 수정된 예제가 필요하면 Docs를 재적용합니다. 사용자가 관리 영역을 편집했다면 덮어쓰지 않습니다.
- CAN 루프백, OV2640 전원/XCLK/SCCB 식별, SD 초기화/OCR 범위. 외부 CAN 중재, 카메라 영상, SD 파일시스템, 물리 보드 실행, 임의의 모든 다중 장치 조합은 검증 대상이 아닙니다.

## 장치별 결과

| 장치 | 동작 | 손상 배선 복구 | EXE 상태 로그 |
|---|---|---|---|
${rows.map(r=>`| ${r.name} | ${r.behavior?'통과':'실패'} | ${r.repair?'통과':'실패'} | ${r.packaged?.stateEvents>0?'기록됨':'미확인'} |`).join('\n')}

## 증거

- results.json: 장치별 기능·구조 보존·배선·EXE 검증.
- hal-cards.csv: 개별 HAL 호출 수·반환값·실행 시간.
- work/test-results/docs-audit-${version}: 생성 프로젝트, core/cards/migration 실행 로그, EXE diagnostics 사본. 큰 숫자 배열은 전체 SHA-256 포함.
- work/audit-archives/docs-audit-${version}.zip: 테스트 데이터·보고서·재현 스크립트 보관본. 실제 사용자 프로필·브라우저 캐시 제외.
- 실패했던 0.23.1 감사 자료는 기존 보고서에 보존합니다. 수정 위치는 FIX-LOCATIONS.md에 별도로 기록합니다.
${publicRun?`\n공개 [Release](${release.release}), 빌드/태그 커밋 ${release.tagCommit}. EXE SHA-256: ${summary.exeSha256}.`:''}
${problems.length?'\n실패: '+problems.join('; '):''}
`;
await fs.writeFile(new URL('REPORT.md',output),md);
console.log(JSON.stringify({...summary,rows:undefined,diagnostics:undefined},null,2));
if(problems.length)process.exitCode=1;
