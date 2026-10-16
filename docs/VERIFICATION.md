# 0.23.0 검증 진행 기록

2026-10-16. 빈 시작 화면, 단일 보드/여러 빵판 검색 추가, main 내부 Docs 예제와 기존 초기화 병합, 배선 20색을 검사합니다. 아래 v0.22.0의 공개 배포 기록과는 구분합니다.

- `tests/empty-workspace-inline.test.js`: 빈 접점, 구버전 저장 호환, 모든 검색 장치와 HAL 함수별 적용/미리보기, 추가 함수/파일 없음, 재적용, 기존 GPIO 설정 보존, UART 폴링 에코, C 전개 제어 흐름과 구버전 콜백 정리.
- `scripts/empty-workspace-ui.cjs`: 실제 검색/클릭으로 보드 1개·빵판 여러 개, 20색 재색칠, 삭제/되돌리기/재열기, Docs 적용 및 LCD 실행, 핀 선택 후 빈 프로젝트 생성.
- ARM 검사: `scripts/device-docs-arm-check.cjs`로 실제 ST HAL/CMSIS 컴파일·링크. 실물 보드 검증은 아닙니다.
- 모델 검사 280개, 114개 장치의 HAL 함수 카드 977개 적용·미리보기, 장치 HAL/레지스터 예제 381개 ARM 컴파일·링크를 통과했습니다. CI, 공개 파일 해시와 EXE 실행 검증은 Release 게시 확인 후 기록합니다.

---

# 검증 기록 — 0.22.0 공개 릴리스

검증일: 2026-10-15. Windows x64 / Electron 44.2.0 / Monaco 0.57.0.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.22.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38709544798). GitHub latest는 v0.22.0입니다.
- 빌드 커밋과 공개 태그: `3e9b3e40059b6ebf98a2f7f7667d2e1e1db9ba48`. 작성자·커미터·푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.22.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 비인증 다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP으로 갱신했습니다.
- EXE 102,742,609 bytes. SHA-256 `110eeb098c245ec0cca46250d90e005194754dbf039cc3f9aaa73c94a25462a0`.
- ZIP SHA-256 `ee0edc3cb2207ddd3a1d75db455561acec434db43c73f802d050415a7773d958`.
- 증거: `work/test-results/release-0.22.0-proof.json`, `work/test-results/public-022/public-exe-proof.json`.

## 구현과 검사 결과

| 항목 | 확인 결과 |
| --- | --- |
| 화면 테마 | 기본 System, Dark/White 직접 선택, 상단 토글 및 System 복귀. OS 색상 media 변경을 브라우저에서 재현하여 자동 전환/수동 고정/재시작 보존 확인. 실제 Windows 개인 설정은 변경하지 않음 |
| 코드 테마 | Dark 기본 Jellybeans, White 기본 GitHub Light Default 6.3.5. 모드별 코드 테마 선택, 등록/수정/내보내기/재시작과 화면 팔레트 독립 확인. 두 원본 SHA-256 및 MIT 고지 보존 |
| 들여쓰기 | 실제 Monaco 키보드 Tab으로 스페이스 4칸 확인. 모델 전환 시 옵션 적용 및 v1 설정 이전 검사 |
| 기본 보드·빵판 이동 | 실제 몸체 드래그, 장착 부품과 내부 경유점 이동, 외부 배선 끝점·핀 좌표, 한 번의 Undo/Redo, Esc 취소와 재시작 보존 |
| 배선 우클릭 취소 | 바닥과 GPIO에서 우클릭 시 작성 중 경유점/미리보기 제거, 기존 배선 보존, GPIO 설정창을 잘못 열지 않음, 취소 후 새 배선 완성 |
| 배치 공간 | 고정 좌표 상한 제거. 음수/6000 초과 보드·빵판 이동, 2핀·다핀 새 부품 배치, 가운데 버튼 팬, 전체 보기와 저장/재시작. 유한수·부품 수·배선 수 검증 유지 |
| 모델 | 전체 273개 통과. 설정 호환/모드 분리/원본 테마 해시/이동 기하 및 경유점 회귀 검사 포함 |
| 글자 대비 | Dark/White 52상태 HTML 글자/placeholder 대비 4.5:1 미만 0건. 상단 버튼·Pinout 카드/footer·검색·설정·다이얼로그·터미널·1024px 창 포함 |
| 시각 확인 | Dark/White 전체 화면, Pinout 및 작은 창 설정을 캡처 묶음으로 확인. 추가 시각 수정 없이 통과 |
| 기존 기능 | 113종 실제 크기 조절, colorscheme 등록, HAL 카탈로그·Docs·main.c 삽입·배선 로컬 UI 통과. 전체 Windows CI에서 미리보기·IDE/편집/HAL/USART2 UI와 업데이트/패키지 검증 통과 |
| 공개 EXE | 다운로드한 실제 단일 EXE에서 새 테마/이동/우클릭/넓은 배치 검사 전체 및 두 테마 12상태 대비 검사 통과. 격리된 테스트 프로필 사용 |

대비 검사는 HTML UI 대상이며 C/C++ 토큰 원본 팔레트와 장치 SVG 도색은 제외합니다. 코드 테마 변환은 지원 C/C++ TextMate 범위이며 VS Code의 전체 문맥/semanticTokenColors를 복제하지 않습니다. 실제 ARM 보드 디버깅과 이전 공개 버전에서 새 버전으로 자동 다운로드·교체하는 전체 경로를 이번 변경에서 다시 실행하지 않았습니다. CI의 포터블 업데이트 도우미/EXE 교체·롤백 검사는 통과했습니다.

## 별도 미해결 감사 항목

앞서 재현한 저장 트랜잭션 실패, 저장 직후 편집 시 미저장 경고 누락, 새 프로젝트의 터미널 경로, 종료 직전 자동 저장 지연 4건은 이번 요청 범위에 포함하지 않았습니다. `docs/NON-DEVICE-AUDIT.md`에 원인·코드 위치·재현·수정 방향을 보존했습니다.

이 게시 후 기록은 같은 버전의 문서 커밋으로 남기며 공개 태그/자산을 덮어쓰지 않습니다. 0.19.0 이하에서 고정 EXE 이름으로 전환하려면 0.20.0 이상을 한 번 수동 다운로드합니다.
