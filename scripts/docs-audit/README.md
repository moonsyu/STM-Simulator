# Docs 실행 감사

Node 24와 저장소 의존성을 사용합니다. 명령은 저장소 루트에서 실행합니다.

```powershell
node scripts/docs-audit/audit.mjs core
node scripts/docs-audit/audit.mjs cards
node scripts/docs-audit/baremetal.mjs
node scripts/docs-audit/focused.mjs
node scripts/docs-audit/packaged.cjs
node scripts/docs-audit/migration.mjs
node scripts/docs-audit/verify.mjs --public
```

- 출력: `work/test-results/docs-audit-<package version>/`. `DOCS_AUDIT_OUT`으로 별도 출력 경로 지정 가능. 보고서: `docs/audits/<package version>-device-docs/`. 0.23.1 감사 자료와 이전 report.mjs는 당시 실패 기록으로 보존합니다.
- `DOCS_AUDIT_TYPES`: 쉼표로 구분한 장치 type만 검사. 미지정 시 114개.
- `DOCS_AUDIT_WORKERS`: Node 테스트 worker 수, 기본 3. 사람/대화 에이전트를 생성하지 않습니다.
- 공개 EXE는 `outputs/artifact/STM-Simulator.exe`, 또는 `LAB_EXE`로 지정. 별도 프로필/숨김 창 사용. 실행 중인 사용자 앱은 건드리지 않습니다.
- `packaged.cjs --dev`는 저장소 Electron으로 동일 UI/IPC 경로를 검사합니다. 개발 검사로 공개 EXE 검증을 대체하지 않습니다.
- `core`: 실제 신규 배치 기본값, main 직접 삽입/기존 코드 보존, 원본과 동작 비교, 입력 변화, 모든 자동 생성 선의 단선 복구, 전체 누락/오접속 복구 후 실제 재실행.
- `cards`: 각 카드로 새 프로젝트에 적용 후 실제 HAL 호출·반환·회로 상태 기록. API 도달을 장치 전체 기능 통과로 취급하지 않습니다.
- `baremetal`: main 삽입/ARM 대상 전환만 검사. 레지스터 코드의 실제 실행은 검증하지 않습니다.
- `packaged`: 실제 파일 열기와 UI 이벤트 경로로 Docs 전체 적용/실행. 앱이 파일에 남긴 diagnostics 이벤트를 보관. 코드와 회로 상태를 브라우저에서 직접 덮어쓰는 테스트 API를 사용하지 않습니다.
- `core`/`cards`는 실패가 있어도 나머지 장치를 검사합니다. `verify.mjs`는 누락·중복·실패·구조 변경·배선 단락·EXE 로그 누락이 하나라도 있으면 실패합니다. `--source-only`는 소스만, 기본은 로컬 EXE까지, `--public`은 공개 자산 검증 파일의 해시와 실행 EXE까지 대조합니다.
- `migration`은 이전 감사의 독립 회로 10개를 재적용합니다. 기존 `work/test-results/docs-audit` 자료가 필요하며 사용자 프로필을 읽지 않습니다.
- raw 상태의 큰 숫자 배열은 길이/0이 아닌 항목 수/앞뒤 값/SHA-256으로 저장합니다. TFT는 기대 픽셀 전체 해시와 비교합니다.

검사 범위는 해당 버전의 라이브러리 항목과 예제입니다. 물리 STM32 펌웨어 실행, 임의 장치 조합 전체, 모든 배치 기하 상태까지 증명하지 않습니다. 미지원·미검증 범위는 보고서에 유지합니다.
