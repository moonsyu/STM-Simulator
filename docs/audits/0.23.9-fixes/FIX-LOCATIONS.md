# 개발용 수정 위치 — 0.23.9

제품 코드 기준 commit: `105eab70a2f3cb2bb8151042768eacb62c93f9fc`. 사용자 보고에서는 이 위치 목록을 생략합니다.

| 항목 | 위치·책임 | 재검사 |
|---|---|---|
| A01 | `desktop/workspace-transaction.cjs` commit/recover, `desktop/workspace.cjs` 폴더별 직렬화/flush | `node --test tests/workspace-recovery.test.js`, `node scripts/storage-recovery-check.cjs` |
| A02 | `src/app.js:385` 매 입력 dirty, `:421` 저장 시점 snapshot 대조 | storage-recovery-check A02 |
| A03 | `src/app.js:90` 동기 flush, `:92` beforeunload, `desktop/main.cjs:27` 창 종료 후 shutdown | storage-recovery-check A03, release-runtime-check 정상 종료/재실행 |
| A04 | `src/ide-ui.js:93` 폴더 문맥 reset, `desktop/main.cjs:77` workspace:clear, `desktop/native-ide.cjs` 현재 터미널 종료 이벤트 | storage-recovery-check A04 actual cmd cwd |
| A05 | `src/device-assistance.js:28` label과 GPIO 네트 식별 분리 | `tests/docs-reset-reapply.test.js`, `scripts/audits/docs-reapply-0238.mjs` 출력 경로 별도 지정 |
| A06~A10 | `src/c-expression-type.js` 타입 탐색, `src/c-types.js` 승격/변환/연산, `src/runtime.js:73` sizeofExpr, `:105` layout 및 initialize | `tests/c-semantics.test.js`, `scripts/audits/project-0238.mjs` GCC/ARM 독립 대조 |
| A11~A12 | `src/c-types.js` numberLiteral, `src/parser.js:39` constantValue 및 enum | 같은 C 회귀 검사 |
| A13 | `src/c-inline.js:45` sizeof AST, `:63` switch body/return/fallthrough | C 회귀 및 변환된 소스 GCC 실행 |
| A14~A15 | `scripts/prepare-artifact.cjs` 실제 패키지/출처, `scripts/verify-release.ps1` 공개 자산/ZIP/tag/CI 대조, Windows workflow release job | `scripts/release-runtime-check.cjs`, `scripts/release-update-check.cjs` |
| A16 | package-lock, package overrides, `scripts/build-editor.mjs` vendored DOMPurify 제외/대체, `tests/build-proxy.test.js` | clean npm ci → install Electron → build:editor, npm audit, 실제 편집기 검사 |
| A17 | `tests/hal.test.js` 구조체 크기 8, `docs/HAL-API.md` 지원 범위, 새 저장/C/Docs 회귀 및 `scripts/docs-audit/verify-behavior.mjs` | 365 단위 검사 및 아래 전수 실행 |

## 전수 실행

Node 24를 사용합니다. 감사 원본 0.23.8 증거를 덮어쓰지 않도록 `AUDIT_OUT`과 `DOCS_AUDIT_OUT`을 별도로 지정합니다. `AUDIT_ASSERT=1`은 원본 감사 스크립트를 수정 후 통과 검사로 실행합니다.

- `scripts/docs-audit/audit.mjs core` → `cards` → `verify-behavior.mjs`: 114 장치·979 API·배선 손상 복구 판정.
- `scripts/code-reset-audit.mjs`: 128 최소 초기화 및 114 장치 재적용 동작.
- `scripts/storage-recovery-check.cjs`: 프로젝트 저장·취소·터미널·정상 종료 복원 실제 Electron 경로.
- `scripts/docs-audit/packaged.cjs`: 실제 EXE의 Docs 클릭/실행/JSONL. `LAB_EXE`는 검증할 포터블 경로, `DOCS_AUDIT_TYPES`는 장치 목록. TFT는 `--step-samples`로 프레임 단계별 로그를 추가할 수 있습니다.
- UART의 연속 수신/재송신 확인은 `uart` 이벤트의 direction/bytes를 시간 순으로 연결합니다. console 콜백은 문자열 이어 붙임이 별도 처리되므로 callback 최초 문자열만으로 전체 수신을 판단하지 않습니다.
- 공개 파일 검증 후 `release-runtime-check.cjs`는 standalone/ZIP 모두 실행하고 C 회귀와 종료 직전 입력 복원을 확인합니다. `release-update-check.cjs`는 해시가 확인된 이전 공개 EXE 사본의 실제 자동 업데이트를 실행합니다.
