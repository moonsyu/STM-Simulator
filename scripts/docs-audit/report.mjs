import fs from 'node:fs/promises';
import {PART_LIBRARY} from '../../src/part-library.js';
import {assess} from './oracles.mjs';
const root=new URL('../../',import.meta.url),input=new URL('work/test-results/docs-audit/',root),output=new URL('docs/audits/2026-10-17-device-docs/',root);
await fs.mkdir(output,{recursive:true});
const read=async name=>JSON.parse(await fs.readFile(new URL(name,input),'utf8'));
const rows=[],cards=[];
for(const {type,name}of PART_LIBRARY){
 const c=await read(`core-${type}.json`),a=await read(`cards-${type}.json`),p=await read(`packaged-${type}.json`);
 if(c.fatal||a.fatal)throw new Error(type+': '+(c.fatal||a.fatal));
 const check=assess(type,c.execution),repair=c.repair.execution?assess(type,c.repair.execution):null;
 const saved=await read(`packaged-${type}.stm32lab`),generated=await read(type+'.stm32lab');
 const appEvent=p.events?.find(e=>e.type==='docs.applied'),sameCode=saved.code===generated.code;
 rows.push({type,name,behavior:check.passed?'pass':'fail',failedChecks:check.checks.filter(c=>!c.passed),repairBehavior:repair?.passed?'pass':'fail',repairError:c.repair.error,
  removedWireChecks:c.removedWireChecks.length,removedWireFailures:c.removedWireChecks.filter(r=>r.error||!r.connected||!r.isolated),topology:c.topology,repairTopology:c.repair.topology,
  idempotent:c.idempotent,structure:c.structure,unrelatedWirePreserved:c.repair.unrelatedWirePreserved,
  packaged:{version:p.version,applied:p.applied,correctTarget:appEvent?.detail.binding.type===type,started:p.started,stateEvents:p.stateEvents,simulationMs:p.simulationMs,sameCode,error:p.error,errors:p.errors},
  observed:[...new Set(c.execution.printed.map(v=>v.text))].slice(0,24),evidence:`core-${type}.json`});
 for(const card of a.cards)cards.push({type,name,api:card.api,status:card.status,deviceBehavior:check.passed?'pass':'fail',error:card.error||card.execution?.error?.message||'',callCount:card.execution?.calls[card.api]?.count||0,returns:card.execution?.calls[card.api]?.returns||{},durationMs:card.execution?.endMs,structure:card.structure,topology:card.topology,evidence:`cards-${type}.json`});
}
const bare=await read('baremetal.json'),diagnostic=await read('diagnostic-limit.json');
const summary={date:'2026-10-17',version:'0.23.1',sourceCommit:'b17f289e32d4cba58e532583cff8519cfc32397d',releaseCommit:'99f8f02e578dfc1510fe06a834e111f11f9e4197',exeSha256:'fab499411f0d9c97f907b23ada771b111aed367aaf069acde32644d307ddcd45',
 devices:rows.length,behaviorPassed:rows.filter(r=>r.behavior==='pass').length,behaviorFailed:rows.filter(r=>r.behavior==='fail').length,repairPassed:rows.filter(r=>r.repairBehavior==='pass').length,wireRecoveryChecks:rows.reduce((n,r)=>n+r.removedWireChecks,0),wireRecoveryFailures:rows.reduce((n,r)=>n+r.removedWireFailures.length,0),
 halCards:cards.length,apiExercised:cards.filter(c=>c.status==='api-exercised').length,apiProblems:cards.filter(c=>c.status!=='api-exercised'),baremetalCards:bare.length,baremetalInserted:bare.filter(c=>c.inserted).length,baremetalRuntimeVerified:0,
 packagedRuns:rows.filter(r=>r.packaged.started&&r.packaged.correctTarget&&r.packaged.sameCode).length,packagedStateLogs:rows.filter(r=>r.packaged.stateEvents>0).length,diagnostic,rows};
await fs.writeFile(new URL('results.json',output),JSON.stringify(summary,null,2));
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
await fs.writeFile(new URL('hal-cards.csv',output),'\uFEFF'+[['device','name','api','execution','device_behavior','call_count','return_values','simulation_ms','evidence'],...cards.map(c=>[c.type,c.name,c.api,c.status,c.deviceBehavior,c.callCount,JSON.stringify(c.returns),c.durationMs,c.evidence])].map(row=>row.map(csv).join(',')).join('\n'));
const failures=rows.filter(r=>r.behavior==='fail');
const md=`# Docs 코드 적용·자동 배선 실행 감사 — 0.23.1

검사일: 2026-10-17. 모든 항목을 초기화한 별도 프로젝트에서 실행했습니다. 생산 코드, 사용자 회로와 사용자 프로필은 변경하지 않았습니다.

## 결과

- 라이브러리 ${summary.devices}개(보드·빵판 포함): 기능 기준 ${summary.behaviorPassed}개 통과, ${summary.behaviorFailed}개 실패.
- 전체 배선 누락 + 오접속을 넣고 재적용한 회로: ${summary.repairPassed}개 기능 통과. 위와 같은 장치 실패는 재배선 후에도 재현됩니다.
- 자동 생성 선 ${summary.wireRecoveryChecks}개를 하나씩 끊고 재적용: 기준 예제와의 전기적 연결 복구 ${summary.wireRecoveryChecks-summary.wireRecoveryFailures}개 통과. **버튼 두 모델의 기준 예제 자체가 잘못되어 있으므로 이 숫자는 모든 배선의 기능 정상 판정이 아닙니다.**
- HAL 함수 카드 ${summary.halCards}개 실제 실행: ${summary.apiExercised}개에서 선택 API 호출·반환 확인, ${summary.apiProblems.length}개 호출 미반영. **호출 도달과 장치 기능 통과는 별도입니다.** DS18B20과 SD는 HAL 호출이 성공해도 반환값 전달이 잘못됩니다.
- 공개 EXE: ${summary.packagedRuns}개 UI Docs 적용 → 실행. 로컬 파일의 실행 상태 로그 ${summary.packagedStateLogs}개 확인. TFT 2개는 로그 크기 제한으로 상태 기록이 누락됩니다.
- Bare-metal 카드 ${summary.baremetalCards}개: ${summary.baremetalInserted}개 main 삽입·ARM 대상 전환 확인. HAL 시뮬레이터에서 실행할 수 없으므로 **실제 동작 미검증**입니다.

## 발견한 기능 문제

| 장치 | 실행 결과 |
|---|---|
${failures.map(r=>`| ${r.name} | ${r.observed.filter(v=>v!=='HAL ready').slice(0,3).join(' / ')} |`).join('\n')}

1. 2핀 순간 버튼, KY-004 3핀 버튼 모듈: 자동 배선에 입력·접지 연결이 빠져 있습니다. 눌러도 출력이 바뀌지 않습니다. 원본 예제에서도 재현됩니다.
2. DS18B20 TO-92, 방수 프로브: 온도를 25 → 10 → 45℃로 바꿔도 삽입본은 0.00℃를 출력합니다. helper를 main으로 펼칠 때 반환 임시 변수와 지역 변수 이름이 충돌합니다. 동일 변환의 최소 재현에서도 21×2가 0으로 나옵니다.
3. SD 카드 모듈: SPI 로그에는 CMD0 응답 01이 있지만 main의 수신 결과는 0으로 전달되어 CMD0 timeout을 출력합니다. 원본은 OCR=40ff8000을 읽습니다. 위 반환값 변수 충돌과 같은 원인입니다.
4. 기존 인코더, KY-040: 3칸 정방향 → 1칸 역방향 변경 시 원본은 count=3/edges=12 → count=1/edges=4입니다. Docs 폴링 변환본은 count=0에 머뭅니다. 2ms 간격 에지를 느린 main 루프가 놓칩니다.

## 개별 함수 카드와 진단 로그 문제

| 장치 | 함수 | 관측 |
|---|---|---|
${summary.apiProblems.map(c=>`| ${c.name} | ${c.api} | ${c.status}; ${c.durationMs}ms 실행 |`).join('\n')}

커패시터 PWM 예제의 설정은 타이머 모드를 명시하지 않습니다. Docs에서 초기화를 재생성하면 Base_Init으로 바뀌어, 선택한 PWM_Init 카드 호출이 사라집니다. 전체 예제의 충전 동작과 별도로 카드 적용 결함입니다.

TFT, ST7735S 8핀의 상태 객체는 ${diagnostic[0]?.characters.toLocaleString()}자입니다. 앱 진단 이벤트 한도 65,536자를 넘어 저장이 거부됩니다. 시뮬레이터 실행 로그에서는 20,480개 RGB565 픽셀 전체 해시를 기대 색상 막대와 대조했지만, 공개 EXE 파일 로그만으로 TFT 상태를 확인하는 경로는 현재 실패합니다.

## 검사 조건과 판정 범위

- 각 장치를 검색으로 새로 배치했을 때의 기본값 사용. Docs 전체 적용 후 main 코드, GPIO/주변 장치 설정, 자동 배선을 사용했습니다.
- 장치별 3,500ms, DHT 5,500ms 시뮬레이션. 1,100ms와 2,300ms에 버튼·스위치·조도·온도·습도·거리·가속도·축·인코더 값을 변경했습니다. UART에는 100ms에 Audit42를 주입하고 에코를 확인했습니다.
- LED/부저 on·off, PWM 음계, LCD 문자열, OLED 프레임, TFT 전체 픽셀, 모터 회전 방향/RPM, 서보 각도, 스테퍼 이동, 릴레이 접점, ADC 결과, EEPROM 읽기, 센서 응답을 판정했습니다.
- 단선 697건은 토폴로지 복구 검사입니다. 각 단선 상태 전부를 동적으로 재실행한 것은 아닙니다. 전체 누락+오접속 복구 회로 114개는 각각 실제 재실행했습니다.
- HAL 카드는 800~6,500ms 실행하여 해당 API의 호출/반환과 당시 GPIO·타이머·장치 상태를 기록했습니다. 카드 단독 실행이 전체 장치 예제와 같은 모든 출력을 낼 필요는 없으므로, 전체 기능 판정은 별도 열로 표시합니다.
- 공개 EXE는 별도 프로필과 숨김 창에서 실제 파일 열기·Docs 버튼·실행 버튼 이벤트를 사용했습니다. 4.2초(DHT 6초) 동안 실행했습니다. 부하가 큰 장치는 실제 진행된 시뮬레이션 시간이 더 짧으며 results.json에 기록했습니다. 입력 변경의 정밀 검사는 동일 소스의 SimulationSession에서 수행했습니다.
- CAN은 내부 루프백, OV2640은 전원/XCLK/SCCB와 ID 읽기, SD는 초기화/OCR 범위입니다. 외부 CAN 네트워크, 카메라 영상, SD 파일시스템, 물리 보드 실행, 임의의 다중 장치 조합 전체를 검증한 결과는 아닙니다.
- 재적용 멱등성, 기존 사용자 코드/함수/파일 보존, 관련 없는 배선의 ID·색·꺾임점 보존도 검사했습니다.

## 장치별 결과

| 장치 | 전체 기능 | 재배선 후 | EXE 상태 로그 |
|---|---|---|---|
${rows.map(r=>`| ${r.name} | ${r.behavior==='pass'?'통과':'실패'} | ${r.repairBehavior==='pass'?'통과':'실패'} | ${r.packaged.stateEvents>0?'기록됨':'누락'} |`).join('\n')}

## 재현 자료

- results.json: 장치별 판정, 출력, 소스/EXE 식별 정보.
- hal-cards.csv: 977개 개별 함수 호출·반환·시뮬레이션 시간. api-exercised는 함수 도달 확인이며 기능 전체 통과를 뜻하지 않습니다.
- work/test-results/docs-audit: 생성된 회로, 원본/삽입본/배선 복구 실행 상태, API 반환값, UART/SPI 통신 로그, 공개 EXE diagnostics 이벤트 사본.
- outputs/artifact/docs-audit-0.23.1.zip: 위 독립 테스트 데이터 보관본. 사용자 프로필·캐시는 포함하지 않습니다.
- 수정할 위치와 확인된 원인은 FIX-LOCATIONS.md에 별도 저장했습니다.

검사 소스 커밋: ${summary.sourceCommit}. 공개 EXE SHA-256: ${summary.exeSha256}.
`;
await fs.writeFile(new URL('REPORT.md',output),md);console.log(JSON.stringify({...summary,rows:undefined,apiProblems:summary.apiProblems.map(({type,api,status})=>({type,api,status}))},null,2));
