# 현재 검증 기록 — 0.17.0 (장치 크기와 IDE 설정)

- 검증일: 2026-10-14. Windows x64, Electron 44.2.0, Monaco 0.57.0, Playwright 1.58.2.
- 변경 범위: 모든 장치의 기하 배율, Jellybean 기본 테마, IDE 표시 설정, 사용자 테마와 설정 파일, 공개 릴리스 자동 업데이트 검증.

## 검사 결과

| 검사 | 결과 | 증거 |
| --- | --- | --- |
| 전체 모델 | 217/217 통과 | work/test-results/v017-model.log |
| 새 모델 검사 | 모든 부품의 회전/배율, STM 핀과 배선, 기본/추가 빵판 장착 위치, 전류 보존, 원자적 범위 검사, 테마 저장/검증 8개 통과 | tests/appearance.test.js |
| 기존 Electron UI | 15개 스크립트 모두 통과 | work/test-results/v017-ui.log |
| 새 Electron UI | 35종 부품을 실제 UI에서 150%로 변경. STM/기본 빵판 핀·선택 검색·회로 실행, 설정 재시작/프로젝트 전환 보존, JSON 내보내기/가져오기, 잘못된 설정 거부, Light 전환과 함수 색상, 1024px 배치 검사 통과 | appearance-smoke.json, ide-settings-jellybean.png, jellybean-code-highlights.png, all-devices-scaled.png, ide-settings-compact.png |
| IDE 회귀 검사 | 프로젝트·Monaco·디버거·패널·저장 통과 | ide-smoke.json |
| 네이티브 IDE | 실제 GCC 빌드, GDB step/watch/register, EXE 실행·터미널, clangd 진단·오류 이동·실패 빌드 무효화 통과 | native-ide-smoke.json |
| 업데이트 UI/도우미 | 좁은 창·저장 후 재시작 및 실제 Windows EXE 잠금·교체·재실행·원본 복원·부모 종료 후 생존 검사 통과 | update-ui-check.json, update-apply-check.json |
| 패키지 | 새 기하·테마·설정·업데이터 파일의 asar/원본 일치, 버전·아이콘·런타임/Monaco 고지 검사 통과 | npm run build:artifact |

파일명만 적은 증거는 work/test-results/ 아래에 있다. 함수/자료형 색 구분은 C/C++ 토큰과 호출 형태를 사용하는 표시 기능이며 네이티브 컴파일러의 정적 분석 결과는 clangd 경로로 제공한다.

## 로컬 빌드

- EXE: outputs/artifact/STM-Simulator-0.17.0-win-x64.exe
- 크기: 102606633 bytes
- SHA-256: d80b3cf58afdcf1d85b7f26b2dd652c990be93fef4d6b0bc19af78f19844bed9
- 매니페스트: outputs/artifact/update-manifest.json
- 이 해시는 로컬 빌드다. GitHub의 태그 CI 산출물은 별도 빌드이며, 공개 Assets의 SHA256.txt와 BUILD-INFO.json을 기준으로 확인한다.

## 공개 릴리스와 실제 자동 업데이트

v0.16.1의 태그 CI 38540312010이 빌드/게시까지 성공했다. 공개 EXE를 다시 내려받아 102591677 bytes, SHA-256 b6133ff34e1c17401f9ef519becf35824eb590bd62534290af395516f6858a63, 빌드 커밋 a09d41039fdb8f530d9c9e0fe2e39e5acc2d97a0을 확인했다. 이 EXE를 공개 업그레이드 출발점으로 사용한다.

공개 v0.17.0 게시 후 `node scripts/release-update-check.cjs`는 이전 공개 EXE 자체의 원본 업데이트 코드로 GitHub 조회·다운로드·SHA-256 검증·저장 후 재시작·실제 파일 교체를 수행한다. 교체 도우미가 실행한 새 프로세스의 asar 버전과 새 EXE 해시를 검사하고, 새 앱을 다시 열어 현재 버전·기존 코드·새 IDE 설정 화면을 확인한다. 네트워크나 업데이트 IPC 응답을 대체하지 않는다.

최종 공개 실행 결과는 [v0.17.0 릴리스](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.17.0)의 **UPDATE-VERIFICATION.json**, 로컬 work/test-results/release-update-proof.json에서 확인한다. 공개 EXE/ZIP/태그/빌드 커밋 검증은 work/test-results/release-proof.json에 기록한다. 테스트 프로필과 중간 EXE는 검증 종료 후 정리한다.
