# 현재 검증 기록 — 0.7.0

2026-09-07, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 변경

- HAL 예제 13개 선택 시 코드·핀·부품·배선·시뮬레이션 설정을 함께 교체한다. 사용자가 정한 회로 이름은 유지하고 취소/Undo/Redo로 전체 이전 작업을 복원한다.
- GPIO LED/버튼, ADC 분압, 전원 연결 UART/I²C/SPI 및 센서, PWM RC 회로를 제공한다. PWM은 파형 계산을 자동 활성화하고, 초음파는 ECHO에 1 kΩ/2 kΩ 분압을 구성한다. 함수·배열 예제는 외부 회로가 필요 없다.
- 새 프로젝트는 빈 HAL 회로다. printf 및 UART TX/RX 로그를 유지하고, 통신 탭에서 로그로 전환하면 최신 출력을 바로 표시한다.
- 앱·창·저장 대화상자·CSV 파일명·패키지·EXE·Actions 묶음 이름을 STM Simulator로 변경했다. 자동 저장 데이터 경로와 사용자 회로 파일 형식은 유지한다.
- GitHub 저장소를 `moonsyu/STM-Simulator`로 변경했다. 같은 저장소 ID 1359035403과 Private 설정을 확인했다. 로컬 저장소 폴더와 origin 주소도 새 이름으로 변경했다.
- `npm run build`는 이전 Emulator/Simulator EXE, artifact 및 버전별 artifact 폴더, win-unpacked를 먼저 정리한다. 전체 대상 검사 및 파일 잠금 확인 후 삭제하며, 사용자 파일·링크·잠긴 파일이 있으면 중단한다. `build:artifact`도 검증된 빌드로 기존 생성 묶음을 교체한다.
- 중복 HAL 테스트 fixture를 제거했다. 테스트와 UI가 제품의 예제 생성기를 직접 검사한다.

## 모델 및 빌드 정리 검증

`npm test`: **111개 통과**, 실패 없음.

- HAL 13개 예제의 부품/배선 구성, 실제 ADC·온도·초음파 로그, 전기적 fault 부재.
- 버튼 눌림/해제, PWM RC 필터 파형, 초음파 100.0 cm 및 MCU 입력 최고 전압 3.1~3.3 V.
- 코드·핀·회로·계산 설정 교체와 원본 객체 보존, 이름 유지 및 빈 회로 예제로 전환.
- 기존 GPIO·부품·전기 모델·HAL·UART 여섯 장치·IRQ·사용자 파일 호환 검증.
- 빌드 정리 13개 테스트: 이전/현재 이름 EXE 제거, 고정/버전별 배포 폴더, win-unpacked, 사용자 파일 보존, 정리 전 전체 검사, 실제 Windows 공유 잠금, junction/symlink 및 경로 변경 거부, 한글·공백·문자열 `$()` 경로, 묶음 재생성 시 현재 빌드 입력 보존.

## Electron UI 검증

`npm run test:ui`: **7개 스크립트 통과** (ui/editor/parts/features/hal/layout-serial/hal-examples).

앱 제목·브랜드·Electron 이름, HAL 예제 회로 자동 구성, 실행 중 적용 방지, 취소/Undo/Redo의 회로·코드·설정 복원, 이름 보존, 센서 측정, UART TX/RX 로그, PWM 파형, 파일 저장/복원과 기존 편집·통신 기능을 검사했다. 렌더러 오류 없음. 실제 사용자 자동 저장과 분리한 테스트 프로필을 사용했다.

## 배포

- `npm run build` 및 패키지 버전·이름·참고 자료 제외·고지 원문 검사 통과.
- `dist/win-unpacked/STM Simulator.exe`에서 HAL 예제 회로·로그 UI 검사 통과.
- `node scripts/portable-smoke.cjs`: 단일 EXE 직접 실행, HAL 회로 선택 및 UART TX/RX 로그·Pinout, 기존 파일의 회로·LCD·통신·파형 검증 통과. 렌더러 오류 없음.
- `npm run build:artifact` 연속 두 번 성공. 기존 묶음을 자동 교체하고 같은 체크섬의 최신 EXE 하나만 포함함을 확인.
- 실제 완성된 win-unpacked 전체를 정리 계획으로 검사하여 다음 빌드에서 정리 가능한 파일임을 확인. 중단 빌드의 정확한 제품명/버전 패턴 `.nsis.7z`도 정리하며 무관한 압축 파일은 보존하는 테스트 통과.
- 지정 저장소·빌드 소스·app.asar의 소스/UI/문서 **37개 파일 바이트 일치**, package.json 주요 메타데이터 일치, 상대 문서 링크 정상.
- EXE: `STM-Simulator-0.7.0-win-x64.exe`, **100,163,689 bytes**.
- SHA-256: `fef1e141b483ef65d80358cee52cf9bfa3d9b4ae176d5eedcbbd466a9f0b9d4f`.

- 소스: `C:\Users\SSAFY\Desktop\ct\STM-Simulator`.
- GitHub: [moonsyu/STM-Simulator](https://github.com/moonsyu/STM-Simulator)
- 최신 배포: 저장소의 `dist/artifact/`.
- 이전 0.5.1/0.6.0 EXE와 배포 폴더는 자동 정리 스크립트로 제거 완료(파일 11개, 폴더 3개). 사용자 앱이 종료된 것을 확인했으며 강제 종료하지 않았다.
- 최신 증거는 저장소 `test-results/`의 JSON·PNG·CSV로 갱신한다. 테스트 프로필과 별도 빌드 폴더의 중복 생성물은 전달 후 정리한다.

## 범위

지원 HAL API를 연결하는 소스 인터프리터이며 전체 ST 드라이버·ARM/ELF/BIN 실행기는 아니다. HAL DMA, 동기식 USART, MCU UART 간 직접 배선 전송, 실제 NVIC 선점은 미지원이다. GitHub 저장소 이름과 로컬 origin만 변경했고 원격 push/Release/Actions 실행은 수행하지 않았다.
