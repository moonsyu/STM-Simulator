# 0.23.8 감사 — 개발용 수정 위치

사용자 보고에는 코드 위치를 나열하지 않는다. 이 파일은 후속 수정용이다. 기준 dc999bfc55f42664aa58968c320abaeab847e8c4. 전부 미수정. 행 이동 시 식별자를 검색한다.

| ID | 위치 / 원인 | 수정 및 회귀 조건 |
|---|---|---|
| A01 | `desktop/workspace.cjs:28` saveWorkspace, `:32` 파일별 교체, `:34` 완료 후 hashes 갱신. `:24` openWorkspace의 main 우선 읽기 | 프로젝트 파일 세트의 트랜잭션/rollback 및 중단 복구. 두 번째 rename 실패·삭제 실패·재저장·재열기, 외부 변경 보호 유지. |
| A02 | `src/app.js:383` input에서 checkpoint 시에만 dirty 설정, `:91` checkpoint, `:419` save의 dirty=false | undo 묶음 시점과 dirty revision을 분리. 저장 도중 추가 편집도 저장한 revision과 비교. 빠른 save/edit/new 및 open, 보조 파일 회귀. |
| A03 | `src/app.js:90` autosave의 200ms timer, `desktop/main.cjs:27` before-quit, `:66` window-all-closed | renderer 최신 문서 저장을 기다리는 종료 handshake. 실패 피드백, 중복 종료, 일반 종료/업데이트 종료 공통화. |
| A04 | `src/ide-ui.js:93` reset은 renderer folder만 제거. `desktop/main.cjs:10` workspaceState 및 `:55` terminal-open | main workspace clear IPC와 프로젝트 전환 일관성. A→미저장 B→terminal cd, A→폴더 B, 이미 열린 터미널 정책. |
| A05 | `src/device-assistance.js:22` bindParts, `:28-34` configuredPeers의 사용자 label을 템플릿 label과 동일 비교. `src/code-reset.js` deviceDocs 제거 | label과 전기 연결 식별을 분리. topology를 기준으로 사용자 라벨 보존. 다른 바인딩 부품을 탈취하지 않도록 기존 claimed 보호 유지. 6종 재현 및 전체 114종 재적용·동작 회귀. |
| A06 | `src/runtime.js:89` sizeof가 evaluate 호출; `:102` typeSize가 구조체 field size 단순 합; `src/parser.js:89-92` sizeof AST | 값 평가 없는 타입 해석, Cortex-M4 ABI alignment/tail padding, expression/pointer/array 크기. ARM static_assert 대조. |
| A07 | `src/runtime.js:103` numericType이 name 기반 index/member만 처리; `:86` 나눗셈 truncate | 모든 lvalue/member/index/pointer의 타입 추적. float pointer, struct array, nested member, 함수/삼항식 회귀. |
| A08 | `src/runtime.js:103` binary type을 operand float로 일괄 추론 | 관계·동등·논리 연산 결과는 int. `(1.0<2.0)/2`, ==, &&, || 조합을 실제 C와 비교. |
| A09 | `src/runtime.js:58` binary JS 연산, `:86` 숫자 계산, `:33` coerce는 저장 시 적용. `src/parser.js:98` 숫자 literal 타입 | integer promotions/usual arithmetic conversions, uint32 shift와 표현식 수준 modulo. signed overflow는 정의되지 않은 C 사례로 정답을 강요하지 말 것. |
| A10 | `src/runtime.js:109-113` initialize가 struct 필드에 clone(v)만 적용 | 필드 타입으로 재귀 initialize/coerce, owner 전달. nested struct와 uint8 300→44; 값 복사·const·수명 회귀. |
| A11 | `src/parser.js:98` Number(raw)가 010을 decimal로 처리 | octal parsing, 08/09 거절, suffix와 0/hex/binary 구분. native C 기준. |
| A12 | `src/parser.js:37-45` parseEnumBody의 literal/unary-only nextVal 계산 | bounded integer constant expression 평가, 상수 참조/shift/음수/자동 증가. 비상수 case/enum 표현식 검사도 고려. |
| A13 | `src/c-inline.js:43` n.targetType vs parser n.to; `:60` c.consequent vs parser c.body | AST 계약 통일 후 변환 출력 재파싱·native C 컴파일, switch fallthrough/break/return 보존. 기존 HAL 카드 영향과 내부 변환기 실패를 분리해서 보고. |
| A14 | 공개 v0.23.8 ZIP은 win-unpacked 형식. `desktop/main.cjs:14` PORTABLE_EXECUTABLE_FILE 없으면 updater disabled | 정상 prepare-artifact 산출 폴더로 새 버전 ZIP 생성. 고정 파일명, 메타데이터, 실제 ZIP 실행 updater 검증. 기존 릴리스/태그를 덮어쓰지 말 것. |
| A15 | `scripts/prepare-artifact.cjs:103-107` GITHUB_SHA/RUN_ID 없으면 null. `.github/workflows/build-windows.yml:181-189` existing release는 원격 자산 대조 없이 성공 종료 | local 빌드 provenance fallback 또는 배포 시 null 거절. 기존 릴리스 보존은 유지하되 원격 metadata 불일치는 실패로 보고. 공개 자산·태그·CI commit·해시 대조를 별도 게이트로 두기. |
| A16 | `package-lock.json`; `npm ls brace-expansion http-cache-semantics dompurify --all`; Monaco는 자체 DOMPurify 소스도 포함 | lockfile만 override해서 vendored Monaco의 DOMPurify까지 교체됐다고 간주하지 말 것. 호환 가능한 upstream 갱신 후 build/UI/native/packaged 검사. scanner 개수와 exploitable path 분리. |
| A17 | `tests/hal.test.js:118` sizeof struct의 기대값 6. `docs/HAL-API.md:110` enum/switch unsupported | 독립된 native/ARM oracle과 failure-path coverage 추가. bounded C 문법과 제한 문서 동기화. 제품 오류를 현재 출력에 맞춰 기대값으로 고정하지 말 것. |

## 재현 명령

아래는 제품을 고치지 않고 실패를 관찰하는 감사 스크립트다. 성공 종료는 제품이 정상이라는 뜻이 아니다. 실패 목록을 JSON으로 확인한다.

```powershell
node scripts/audits/non-device-repro.cjs
node scripts/audits/project-0238.mjs
node scripts/audits/docs-reapply-0238.mjs
node scripts/audits/native-0238.cjs
python scripts/audits/release-0238.py
# release-runtime은 내려받은 ZIP을 work/release-audit/0.23.8/zip-unpacked에 안전하게 푼 뒤 실행
node scripts/audits/release-runtime-0238.cjs
$env:DOCS_AUDIT_OUT='work/test-results/project-audit-0238/devices'
$env:DOCS_AUDIT_WORKERS='3'
node scripts/docs-audit/audit.mjs core
node scripts/docs-audit/audit.mjs cards
```

프로젝트 루트에서 실행한다. semantic/native 감사는 `C:/msys64/ucrt64/bin/gcc.exe`, `work/native-tools/xpack-arm-none-eabi-gcc-15.2.1-1.1`, `work/tools/clangd_23.1.0`, `work/tools/STM32CubeF4`를 사용했다. 다른 환경에서는 경로 조정이 필요하다. 최초 native 기본 검사에서 clangd 자동 발견이 되지 않았으며 기존 설치 경로를 감사에만 지정한 재실행은 통과했다. 이를 제품 빌드 실패로 집계하지 않았다.

원본 실행 증거: `work/test-results/project-audit-0238/`. 소스 비교의 package.json은 electron-builder 정상 변환이고 테마 원본 파일은 generated 번들로 대체되므로 release-source.json의 그 차이를 별도 결함으로 집계하지 않는다. 사용자 실제 diagnostics는 저장소로 복사하지 않는다.
