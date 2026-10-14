# 현재 검증 기록 — 0.17.2 (장치 크기·IDE 설정·자동 업데이트)

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
| 패키징 GUI 도우미 | 실제 Electron main/asar에서 긴 한글·공백·작은따옴표·달러 경로로 도우미 시작, GUI 종료 뒤 교체와 EXE 실행 통과 | update-gui-helper-check.json |
| 패키지 | 새 기하·테마·설정·업데이터 파일의 asar/원본 일치, 버전·아이콘·런타임/Monaco 고지 검사 통과 | npm run build:artifact |

파일명만 적은 증거는 work/test-results/ 아래에 있다. 함수/자료형 색 구분은 C/C++ 토큰과 호출 형태를 사용하는 표시 기능이며 네이티브 컴파일러의 정적 분석 결과는 clangd 경로로 제공한다.

## 패키지와 공개 파일

`npm run build:artifact`는 outputs/artifact/의 EXE와 매니페스트, asar의 버전과 소스 포함 상태를 확인한다. GitHub 태그 CI는 별도 빌드이므로 공개 Assets의 SHA256.txt·update-manifest.json·BUILD-INFO.json을 기준으로 확인한다. 로컬 빌드의 해시를 공개 EXE의 해시로 사용하지 않는다.

## 공개 릴리스와 실제 자동 업데이트

v0.16.1의 공개 EXE에서 v0.17.0을 조회·다운로드하고 해시 검증까지 통과했다. 실제 GUI에서 도우미를 생성할 때 `spawn EPERM`이 발생해 교체에는 실패했다. 이전 앱과 작성 중인 코드는 유지됐으며, 이 결과를 자동 업데이트 성공으로 기록하지 않는다.

v0.17.1은 중첩 인코딩 명령을 짧은 파일 실행 인자로 변경했다. 수정된 개발 앱과 패키징된 GUI의 도우미 검사 및 전체 모델 217개는 통과했다. 최종 재현 검사는 수정된 공개 v0.17.1 EXE를 출발점으로 공개 v0.17.2를 대상으로 한다.

`node scripts/release-update-check.cjs`는 이전 공개 EXE 자체의 원본 업데이트 코드로 GitHub 조회·다운로드·SHA-256 검증·저장 후 재시작·실제 파일 교체를 수행한다. 자동 확인을 켠 뒤 원본 스케줄러에 맡기며 수동 확인·다운로드 메서드를 호출하지 않는다. 도우미가 실행한 새 프로세스의 asar 버전과 EXE 해시를 검사하고 새 앱을 다시 열어 버전·기존 코드·Jellybean·글꼴·보드 크기·자동 설정 보존을 확인한다. 네트워크나 업데이트 IPC를 대체하지 않는다. 성공 시에만 work/test-results/release-update-proof.json을 생성한다.

최종 공개 실행 결과는 [최신 릴리스](https://github.com/moonsyu/STM-Simulator/releases/latest)의 **UPDATE-VERIFICATION.json / UPDATE-VERIFICATION.md** 첨부 유무와 내용으로 확인한다. 이 문서를 작성한 시점의 계획과 실제 실행 증거를 구분한다. 공개 EXE·ZIP·태그·빌드 커밋 검증은 work/test-results/release-proof.json에 기록한다. 테스트 프로필과 중간 EXE는 각 검증 종료 시 해당 시험이 만든 경로만 정리한다.
