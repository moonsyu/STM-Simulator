# 0.25.2 빵판 예제 배치·배선 검사

작성일: 2026-10-19. 작업 저장소: `D:\codex\project\STM-Simulator`.

## 변경 내용

- HAL 예제 120개, 장치 Docs 114개 항목, 새 프로젝트 예제 템플릿에 빵판 배치 규칙 적용.
- 예제 부품 몸체와 다리를 빵판 위에 배치. 접점·부품 사이 간격 확보, 구멍별 다리/점퍼 중복 방지, 신호별 연결 행 분리.
- 부품 몸체와 핀을 피해 꺾이는 배선, 독립 전원 레일, 공간 부족 시 추가 빵판, 확대·이동된 MCU 영역 회피.
- 물리 버튼과 모델 접점의 장착 정보 변환 수정. 사용하지 않는 추가 물리 핀도 빵판 전기 연결에 반영.
- 이미 확장한 연결 행에서 선을 끊은 뒤 재적용할 때 빈 구멍을 복구하는 처리 추가.

## 개발 검사

- 단위 410개 통과 후 확대·이동 MCU 회귀 1개 추가. 최신 기하 검사 5개 통과. 전체 411개 검사는 Windows CI에서 다시 수행합니다.
- 모든 120개 라이브러리 예제: 배치, 다리와 점퍼 구멍 분리, 몸체·핀을 가로지르는 선 없음, 전기 연결망의 모든 쌍 비교 통과.
- 장치 Docs 114개: 실제 시뮬레이션 실행·입력 변화·원본 동작 대조, 재적용 동일성, 코드/파일 보존 통과.
- 자동 생성 선 1,062개를 각각 끊은 뒤 재적용: 연결 복구·다른 신호와의 분리 통과. 모든 선 누락·오접속 복구 후 114개 장치를 다시 실행하고 동작 판정 통과.
- 독립 Electron 프로필: 기존 라이브러리 40개 선택·빌드·실행·저장·Undo/Redo 검사 통과.
- 실제 UI에서 LED WritePin, 가변저항, LCD, HC-SR04, 7세그먼트, 모터 HAT 적용·실행 및 파일 JSONL 기록 확인. 타이머 캡처의 빵판 경유도 검사.
- 다중 Docs UI 3개 시나리오(같은 장치 카드 교체, LED 2개, LED+가변저항+UART+서보), 저장 복구, 기존 코드·배선 보존 통과.

개발 검사 자료는 `work/test-results/breadboard-layout/`에 있으며 기존 0.25.1 공개 증거와 분리했습니다. 최종 제품 소스와 공개 EXE 검증 결과는 아래에 추가합니다. 실제 사용자 프로필·회로는 수정하거나 공개하지 않습니다.

## 내부 수정 위치

- `src/example-breadboard.js`: 회로 그래프를 유지하는 장착·구멍 할당·전원 레일·복구.
- `src/example-wire-route.js`: 몸체와 접점을 피하는 직각 배선.
- `src/circuit-topology.js`: 예제/Docs가 공유하는 정적 연결망.
- `src/catalog-model.js`: 물리 핀 장착의 계산 모델 전달.
- `src/device-assistance.js`, `src/hal-examples.js`, `src/ide-ui.js`, `src/app.js`: 적용 진입점과 화면 맞춤.
- `tests/example-breadboard.test.js`, `scripts/breadboard-examples-ui.cjs`: 전체 배치·연결망 회귀 및 실제 앱 로그 검사.

## 범위

장치 외형과 빵판 피치는 학습용 비율입니다. 큰 모듈은 여유 있는 빵판과 연결 다리로 표시합니다. 물리적 납땜 가능성이나 실제 전류 허용량을 인증하지 않습니다. Bare-metal은 기존 ARM 빌드 대상이며 이 검사는 실제 ARM 명령 실행 검증이 아닙니다.

## 확정 제품 소스 재검사

제품 커밋 `97d1aa3e787b9e7007db0869412d7b8fe44313c9`를 게시한 뒤 114개 장치 실행·재실행과 1,068개 개별 단선을 다시 검사해 모두 통과했습니다. 개발 중 검사와 구분한 [확정 소스 집계](evidence/product-runtime-summary.json), [모든 실행·회로 원본 ZIP](evidence/product-runtime-evidence.zip), [UI 실행·저장·다중 적용 ZIP](evidence/source-ui-evidence.zip)을 보존합니다.

## CI 실패 및 검사 기준 수정

첫 [CI 39252461024](https://github.com/moonsyu/STM-Simulator/actions/runs/39252461024)는 수동 부저 테스트의 이전 직결 배선 개수(2개)와 새 빵판 경유 배선 개수(3개)가 달라 실패했습니다. 실패한 빌드는 배포되지 않았습니다. [실패 로그](evidence/ci-first-failure.log)를 남깁니다.

`068d6a95d680a7ff4197ef8702612f216017ea74`에서는 수동 부저와 L298N의 배선 개수 및 저장 비교 기준만 새 적용 결과로 갱신했습니다. 부저의 실제 523/587 Hz 출력·무음·저장 복원, L298N 정/역회전·제동·전원 누락 검사를 로컬에서 재실행해 통과했습니다. 앱 소스 143개 파일의 바이트가 앞선 114장치 실행 검사와 동일함을 [소스 대조 기록](evidence/release-source-equivalence.json)으로 확인했습니다. 후속 전체 [CI 39254875301](https://github.com/moonsyu/STM-Simulator/actions/runs/39254875301)의 결과는 아래에 기록합니다.

두 번째 CI는 1008×681 화면에서 모터의 크기 조절 핸들이 옆 전원 부품을 가로막아 실패했습니다. [두 번째 실패 로그](evidence/ci-second-failure.log). `7b4c3fb5328c0e383a8e499f6f5c1e1aac3c65d9`에서 크기 조절 레이어를 모든 부품·접점 아래로 이동하고 동일한 작은 화면의 실제 클릭·값 변경·저장 복원 회귀를 추가했습니다.

로컬 전체 크기 조절 첫 검사에서는 한 장치의 드래그가 반영되지 않았으나, 같은 코드 재검사에서 113종·보드·빵판 모두 통과했습니다. 테스트는 장치 선택으로 화면 맞춤·인스펙터 갱신이 끝나기 전에 좌표를 읽을 수 있어, 연속 프레임에서 위치가 안정된 뒤 드래그하도록 보완했습니다. 최종 소스에서 다시 실행한 기록과 [CI 39257882264](https://github.com/moonsyu/STM-Simulator/actions/runs/39257882264)를 최종 판정에 사용합니다. 회로 모델·배치 알고리즘은 114장치 실행을 마친 소스와 같고, 변경된 UI 레이어만 별도 실행 검사합니다. [최종 소스 구분](evidence/final-source-comparison.json).


## 공개 0.25.2 배포 검증 완료

최종 UI 수정본의 로컬 113종 크기 조절·작은 화면 L298N·작업 화면 검사는 [집계](evidence/final-ui-priority.json)와 [첫 드래그 실패/재검사 원본 ZIP](evidence/final-ui-priority-evidence.zip)에 보존했습니다.

- 전체 [Windows CI 39257882264](https://github.com/moonsyu/STM-Simulator/actions/runs/39257882264)의 검사·빌드·배포 작업이 모두 성공했습니다. 단위 411/411개를 CI 원본 로그에서 대조했습니다. [CI 판정](evidence/ci-proof.json) · [원본 로그 ZIP](evidence/ci-logs.zip).
- [Release v0.25.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.2)의 최신 선택, 태그/BUILD-INFO 커밋 `7b4c3fb5328c0e383a8e499f6f5c1e1aac3c65d9`, EXE·ZIP·SHA256·BUILD-INFO·update-manifest 5개 자산을 확인했습니다. 공개 다운로드와 ZIP 내부 EXE·문서·메타데이터를 대조했습니다.
- 공개 단독 EXE와 ZIP 내부 EXE 각각 C 의미 7조건과 종료 직전 코드 저장·재열기 복원을 통과했습니다. [실행 결과](evidence/public-runtime.json).
- 공개 EXE의 실제 UI에서 LED WritePin, 가변저항, LCD, 초음파 센서, 7세그먼트, 모터 HAT를 Docs로 적용하고 실행했습니다. 각 회로·화면·JSONL을 보존했으며 타이머 캡처 예제의 두 점퍼가 빵판을 경유하는 것도 확인했습니다. [UI 집계](evidence/public-ui-summary.json) · [종료 성공 기록](evidence/public-ui-exit.json) · [회로/화면/실행 로그 ZIP](evidence/public-ui-evidence.zip).
- 공개 EXE의 L298N 라이브러리 예제는 1008×681 화면에서 정/역회전·제동, 모터 선택 후 옆 전원 부품 클릭·전압 변경·재열기, 전원 누락 시 정지를 확인했습니다. [작은 화면 회귀](evidence/public-l298n-compact.json).
- 원본 공개 0.25.1→0.25.2 자동 검색·다운로드·SHA 검증·EXE 교체·새 앱 기동·재열기 통과. 코드·Jellybean·글꼴·보드 크기·자동 업데이트 설정이 보존됐습니다. [자동 업데이트 기록](evidence/public-update.json).
- EXE SHA-256 `85b1bbb5a387e3a8cdb71bee9263fd38fc15f37296aeda5ef52c1d2ce7baed1c`. ZIP SHA-256 `f7c1a1744c41a1ea1d062ae0fc3e2efe12dc9833a91120e26342d9bf756ed4c0`.
- [최종 집계](evidence/public-verification.json)와 [증거 파일 해시](evidence/SHA256.txt). 114개 장치 전체의 모델 실행 검사와 공개 EXE UI 6종 검사를 구분합니다. 이후 검사 문서 커밋은 제품 태그·배포 파일을 변경하지 않습니다.

기존 사용자 회로는 로드만으로 자동 재배치하지 않습니다. 새 배치 규칙은 해당 장치 Docs 예제를 다시 적용하면 반영되며 Ctrl+Z로 되돌릴 수 있습니다.
