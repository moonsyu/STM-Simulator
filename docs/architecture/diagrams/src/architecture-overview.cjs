// Editable source: node docs/architecture/diagrams/src/architecture-overview.cjs
const fs=require('node:fs'),path=require('node:path');
const esc=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const out=[];
const text=(x,y,value,kind='body',anchor='start')=>out.push(`<text x="${x}" y="${y}" class="${kind}" text-anchor="${anchor}">${esc(value)}</text>`);
const rect=(x,y,w,h,kind='node')=>out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="${kind}"/>`);
const node=(x,y,w,h,title,lines=[],kind='node')=>{rect(x,y,w,h,kind);text(x+18,y+31,title,'node-title');lines.forEach((line,i)=>text(x+18,y+59+i*25,line));};
const arrow=(d,kind='')=>out.push(`<path d="${d}" class="arrow ${kind}" marker-end="url(#${kind==='error'?'error-arrow':'arrow'})"/>`);
const panel=(y,h,n,title)=>{rect(20,y,1400,h,'panel');text(44,y+38,n,'number');text(92,y+38,title,'panel-title');};
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1370" viewBox="0 0 1440 1370" role="img" aria-labelledby="title desc">
<title id="title">STM Simulator 시스템·UI·저장 흐름</title><desc id="desc">검증된 Electron 프로세스 경계, 기존 UI 모듈의 의존 방향, 회로 편집과 저장 오류 처리 흐름을 보여 주는 세 패널 구조도입니다.</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#356b9d"/></marker><marker id="error-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#a13232"/></marker></defs>
<style>text{font-family:'Segoe UI Variable','Segoe UI','Malgun Gothic',sans-serif;fill:#202020}.body{font-size:18px}.caption{font-size:17px;fill:#515151}.heading{font-size:30px;font-weight:650}.panel-title{font-size:24px;font-weight:600}.number{font-size:23px;font-weight:700;fill:#005a9e}.node-title{font-size:20px;font-weight:650}.small{font-size:16px;fill:#515151}.panel{fill:#fff;stroke:#c7c7c7;stroke-width:1.4}.node{fill:#f5f5f5;stroke:#949494;stroke-width:1.5}.boundary{fill:#f4f8fc;stroke:#6a87a5;stroke-width:1.6;stroke-dasharray:7 5}.primary{fill:#e9f3fc;stroke:#005a9e;stroke-width:1.7}.failure{fill:#fff4f4;stroke:#a13232;stroke-width:1.5}.arrow{fill:none;stroke:#356b9d;stroke-width:2.3;stroke-linejoin:round}.arrow.error{stroke:#a13232}.divider{stroke:#d8d8d8;stroke-width:1}</style>
<rect width="1440" height="1370" fill="#f3f3f3"/>`);
text(28,43,'STM Simulator · 시스템 / UI / 저장 흐름','heading');
text(1412,42,'2026-10-19 · 저장소 구현 기준','caption','end');

panel(70,385,'01','시스템 경계와 배포');
rect(44,132,866,186,'boundary');text(60,160,'Windows · Electron 앱','node-title');
node(64,178,236,116,'Renderer',['편집 · 회로 / HAL 실행','ES module · Monaco']);
node(355,178,180,116,'Preload',['제한된 IPC','Node API 비공개']);
node(590,178,294,116,'Main',['파일 · 네이티브 도구','진단 JSONL · 업데이트']);
arrow('M300 236H348');arrow('M535 236H583');
text(62,342,'renderer: contextIsolation / sandbox 활성화 · Node 직접 실행 비활성화','caption');
node(1000,144,390,80,'사용자 선택 로컬 자원',['프로젝트 파일·폴더 / 빌드·디버그 도구']);
node(1000,257,390,80,'GitHub 공개 Release',['기존 공개 업데이트 경로']);
arrow('M884 209H942V184H993');arrow('M884 268H942V297H993');
text(44,391,'배포','node-title');
for(const [x,w,t]of [[130,220,'Windows CI 검증'],[410,378,'EXE · ZIP · 해시 / 빌드 / 업데이트 정보'],[848,234,'GitHub Release'],[1142,248,'앱 다운로드 / 업데이트']]){rect(x,364,w,56);text(x+w/2,399,t,x===410?'small':'body','middle');}
arrow('M350 392H402');arrow('M788 392H840');arrow('M1082 392H1134');
text(44,440,'실행 범위: 지원 C/HAL 해석과 회로 모델 + 선택 네이티브 도구. 모든 ARM 펌웨어 실행을 뜻하지 않습니다.','caption');

panel(477,354,'02','UI 모듈과 초기화 / 호출 관계');
node(48,545,390,94,'workbench-ui · workspace-layout',['실제 컨트롤 재배치 / 메뉴 / 도킹']);
node(48,670,390,94,'canvas-keyboard · tab-accessibility',['키보드 탐색 / 기존 click · ARIA 동기화']);
node(530,582,318,144,'app.js',['프로젝트 · 선택 · Undo · 실행','기존 편집 콜백과 저장 예약','모델 / 렌더 / UI 어댑터 사용'],'primary');
node(940,545,450,94,'모델 · geometry · render',['회로 계산 / 자체 SVG · wire-path']);
node(940,670,450,94,'ide-preferences · ui-feedback',['UI / 코드 테마 분리 · 지속 오류 표시']);
arrow('M530 617H483V592H445');arrow('M530 689H483V717H445');
arrow('M848 617H894V592H933');arrow('M848 689H894V717H933');
text(48,807,'기존 DOM ID와 이벤트를 유지합니다. 프로젝트·설정 파일 형식과 사용자가 조절한 도킹 비율은 유지합니다.','caption');

panel(853,470,'03','회로 편집 → 검증 → 저장 → 오류 복구');
text(44,923,'draft 검증을 거치는 회로 편집 경로 (예: 키보드 이동 · 크기 변경)','caption');
node(48,954,174,107,'편집 입력',['마우스 / 키보드','현재 작업']);
node(280,954,246,107,'가드 · draft 검증',['실행 / drag / 배선 상태','validateProject']);
node(584,954,220,107,'변경 반영',['checkpoint / Undo','프로젝트 반영']);
node(862,954,220,107,'자동 저장 · 렌더',['로컬 상태 예약','현재 회로 표시']);
node(1140,954,250,107,'파일 저장',['.stm32lab','프로젝트 폴더']);
arrow('M222 1008H272');arrow('M526 1008H576');arrow('M804 1008H854');arrow('M1082 1008H1132');
text(1110,943,'사용자 저장','small','middle');
node(280,1131,310,107,'검증 오류: 적용 중단',['현재 작업 유지','진단 / 로그 확인'],'failure');
arrow('M403 1061V1123','error');
node(834,1131,556,107,'저장 실패: 현재 작업 유지',['자동 저장 / 파일 저장 오류 범위를 분리','지속 알림 + 로그 → 저장 위치 확인 후 재시도'],'failure');
arrow('M972 1061V1123','error');arrow('M1265 1061V1123','error');
text(44,1287,'성공한 재시도는 해당 오류를 해제합니다. 자동 저장 성공으로 이전 파일 저장 실패를 덮지 않습니다.','caption');
text(28,1353,'편집 가능한 원본: diagrams/src/architecture-overview.cjs · 외부 이미지 / 런타임 의존성 없음','small');
out.push('</svg>');fs.writeFileSync(path.join(__dirname,'..','rendered','architecture-overview.svg'),out.join('\n')+'\n');
