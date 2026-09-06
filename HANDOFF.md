# STM Emulator — 작업 인계 및 이어가기

마지막 정리: **2026-09-06 (KST)**. 이 문서는 대화 없이 저장소만 받은 사람이 개발을 이어가기 위한 현황 기록입니다. 기록 이후 변경 사항은 `git log`와 현재 소스로 확인하세요. 대화 전체나 개인 PC의 자동 저장 회로가 GitHub에 동기화되는 것은 아닙니다.

## 1. 먼저 확인할 현재 상태

| 항목 | 현재 기록 |
|---|---|
| 프로젝트명 / 앱 버전 | **STM Emulator / 0.3.2** |
| 저장소 | [moonsyu/STM-Emulator](https://github.com/moonsyu/STM-Emulator), **Private** |
| 기본 브랜치 | `main` |
| 실행까지 검증한 앱 소스 커밋 | `476dc7a594ef0700267472e8054c4967bf30b67b` |
| 배포 대상 | Windows x64, Electron portable 단일 EXE |
| 실행파일명 | `STM-Emulator-0.3.2-win-x64.exe` |
| 구현 방식 | JavaScript ES modules + SVG + Electron + 자체 회로 해석기·스케치 인터프리터 |
| 의존성 | Electron `44.2.0`, electron-builder `26.15.3`; `package-lock.json`으로 고정 |
| 확인한 개발 Node.js | `24.19.0`; GitHub Actions는 Node.js `24` 계열 |
| 현재 기능 요구사항 처리 | 아래 완료 항목 구현됨. 다음 기능 작업의 우선순위는 아직 지정되지 않음 |

이 문서와 README의 인계 링크는 검증한 앱 소스 이후에 추가한 **문서 변경**입니다. 위 커밋은 실행파일의 기준이며 문서 커밋이나 이후 HEAD를 뜻하지 않습니다. 이번 문서 추가로 앱 버전을 올리거나 EXE를 다시 배포하지 않습니다.

## 2. 사용자의 목표와 진행 이력

목표는 **Tinkercad처럼 STM 보드와 빵판에 부품·배선을 직접 배치하고 코드를 실행하는 데스크톱 실습 환경**입니다. 사용자 제공 NUCLEO-F446RE 보드 사진과 핀맵을 참고해 시작했습니다. 보드 모델은 STM32F446RE MCU가 탑재된 **NUCLEO-F446RE / MB1136**입니다. 사용자에게는 존댓말로 응답합니다.

| 버전 | 진행 내용 |
|---|---|
| 0.1.0 | 보드·빵판 SVG, 배선·기본 부품, GPIO 스케치 실행, 저장/불러오기, Windows EXE |
| 0.2.0 | 다리와 구멍 정렬, 45° 회전, 배선 10색, Esc 삭제, 부품 몸체 클릭 우선, 다핀 모형 배치, 보드 핀 검색 |
| 0.3.0 | 선택한 검색 결과의 물리 핀 강조, 부품 9종 추가 및 각 실행 예제 |
| 0.3.1 | 프로젝트·창·실행파일 이름을 STM Emulator로 변경. 기존 저장 데이터 호환 유지 |
| 0.3.2 | 권리 검토, 참고 이미지 업로드 제외, 장식용 ST 표기 교체, Private GitHub 업로드, Actions EXE 빌드·다운로드 |

과거 버전별 검증은 [0.1.0](docs/VERIFICATION.md), [0.2.0](docs/VERIFICATION-0.2.0.md), [0.3.0](docs/VERIFICATION-0.3.0.md), [0.3.1](docs/VERIFICATION-0.3.1.md)에 있습니다. 이 문서의 아래 검증 항목은 0.3.2를 별도로 구분합니다.

## 3. 완료된 기능

### 회로 편집과 보드

- 보드 커넥터 핀 **108개**: Morpho CN7/CN10, Arduino CN5/CN6/CN8/CN9. Arduino 별칭과 GPIO 이름은 같은 전기적 노드로 처리합니다.
- 빵판 **400홀**: 일반 구멍 30행 × 10개 + 전원 레일 4개 × 25개. 같은 행 A–E와 F–J는 각각 내부 연결, 중앙 홈은 분리, 각 전원 레일은 독립된 연속 노드입니다.
- 보드 핀·빵판 구멍·부품 단자 사이 배선, 확대/축소·이동, 되돌리기/다시 실행, 선택 부품의 값과 측정 표시.
- 두 핀 부품은 두 연결점을 클릭해 설치합니다. 다핀 부품은 모형 생성 후 드래그해 설치합니다.
- 다리 접점은 장착한 구멍의 정확한 좌표를 사용합니다. 모든 다리가 빈 구멍에 맞아야 장착하며, 다른 부품이 점유한 구멍에는 중복 장착하지 않습니다. 맞지 않으면 자유 배치입니다.
- `R` 또는 회전 버튼으로 **45°** 회전. 구멍 정렬을 위한 시각적 다리 굽힘은 허용합니다.
- 배선 색상 **10개**: 초록·빨강·검정·보라·파랑·노랑·주황·분홍·갈색·흰색. 기존 배선도 선택 후 색을 바꿀 수 있습니다.
- 선택한 부품·배선을 `Esc` / `Delete`로 삭제. 연결 중 Esc는 연결 취소, 입력칸 편집 중에는 부품 삭제 방지.
- 빵판 구멍과 부품 몸체가 겹치면 몸체 선택을 우선합니다.
- `PC 13`, `PA 8`, `D13` 등 공백·대소문자를 무시한 핀 검색. 검색 결과 선택 시 **해당 물리 핀 하나와 결과 행**을 선택 표시하고 다른 검색 결과는 노란색으로 남깁니다. 같은 GPIO의 여러 커넥터 위치를 구분해야 합니다.

### 부품 13종

| 부품 | 설치 / 구현 범위 |
|---|---|
| 저항 | 두 점 설치, 저항값·전압·전류·전력 |
| LED | 두 점 설치, 색상과 극성, 전류에 따른 점등 |
| 버튼 | 4핀 모형, 같은 쪽 단자 내부 연결, 누르는 동안 양쪽 연결 |
| LCD 1602 | 16핀 모형과 배선. **문자 출력은 미구현** |
| 가변저항 | 3핀 모형, 전체 저항·가변 접점 위치, 부하를 반영한 분압 |
| 슬라이드 스위치 | 3핀 SPDT, COM↔A/B 연결 유지, 실행 중 전환 |
| RGB LED | 4핀 공통 음극, 채널별 전류·혼합색, 외부 직렬 저항 필요 |
| 커패시터 | 두 점 설치, 비극성, 20 ms 단위 RC 충·방전 |
| 다이오드 | 두 점 설치, 순방향·역방향 전류 모델 |
| 능동 부저 | 두 점 설치, 전압에 따른 동작, 합성음 켜기/끄기 |
| 7세그먼트 | 10핀 공통 음극, a–g와 dp 독립 점등 |
| TMP36 온도 센서 | 3핀 모형, 전원 조건과 온도에 따른 아날로그 출력 |
| HC-SR04 초음파 센서 | 4핀 모형, 전원·TRIG 조건과 거리별 ECHO / `pulseIn` 모델 |

기본 LED·버튼·분압 예제 외에 추가 부품 9종의 완성 회로·코드 예제가 있습니다. 실행 중 가변저항 위치, 스위치, 온도, 거리를 바꿀 수 있습니다. 세부 수치와 단순화는 [README](README.md)를 기준으로 확인하세요.

### 실행과 저장

- GPIO 출력/입력/풀업/풀다운, 12비트 ADC, 평균 전압 PWM, 보드 USER/PC13 및 LD2/PA5 표시.
- 전원 단락 시 정지, GPIO·LED 과전류 및 저항 전력 경고, Serial 텍스트 로그.
- `setup()` / `loop()`와 제한된 Arduino 스타일 API를 자체 인터프리터로 실행합니다. 지원 함수·문법은 README의 코드 문법 절을 확인하세요.
- `.stm32lab` JSON 저장/불러오기, 마지막 회로 자동 저장, 버전 1 파일을 버전 2로 변환.

## 4. 코드 구조와 수정 지점

| 파일 | 역할 / 변경할 때 볼 지점 |
|---|---|
| `src/pins.js` | `PINS`, `HOLES`, `ALIASES`, `endpointInfo`, 검색 정규화. 그림·배선·회로가 공유하는 좌표와 단자 ID |
| `src/components.js` | `PART_DEFS`, 두 핀/다핀 분류, 핀 라벨·기본값, 회전·단자·장착 정보 변환 |
| `src/placement.js` | 점유 구멍 계산, `findMount`, `applyMount`. 전체 다리 정렬·중복 점유 검사 |
| `src/render.js` | 보드·빵판·기본 부품 SVG와 전기 상태 표시 |
| `src/part-render.js` | 추가 부품 SVG와 실시간 표시 |
| `src/part-controls.js` | 추가 부품의 속성 입력 UI |
| `src/app.js` | 선택·배선·포인터 이벤트·회전·단축키·검색 강조·실행 루프·자동 저장·undo/redo 통합 |
| `src/engine.js` | `UnionFind`, `topology`, `solveCircuit`, `CircuitSimulation`. 연결 노드, DC 해석, 과도 상태 |
| `src/program.js` | `compile`, `Runtime`. 스케치 파싱·실행 및 실행 예산 |
| `src/sensors.js` | `UltrasonicSignals`. TRIG/ECHO 상태와 `pulseIn` 모델 |
| `src/project.js` | 예제·빈 프로젝트·`validateProject`, 입력 검증과 형식 변환 |
| `src/component-examples.js` | 추가 9종 부품의 예제 회로·스케치 |
| `index.html`, `src/style.css` | 전체 화면 구조·부품 목록·스타일 |
| `desktop/main.cjs` | Electron 창, 사용자 데이터 위치, 파일 저장/열기 IPC, 크기 제한 |
| `desktop/preload.cjs` | `window.desktop.save/open`만 renderer에 노출 |
| `tests/circuit.test.js` | 회로·인터프리터·배치·저장·센서 등 모델 테스트 31개 |
| `scripts/*-smoke.cjs` | 실제 Electron 및 portable EXE 검증 |
| `scripts/prepare-artifact.cjs` | 배포 검사, EXE·라이선스·체크섬·빌드 정보로 다운로드 구성 |
| `.github/workflows/build-windows.yml` | Windows 빌드와 Actions Artifact 업로드 |

흐름은 **입력 → 프로젝트/선택 상태 수정 → 장착·연결 노드 계산 → 회로 해석·스케치 실행 → SVG/측정 표시**입니다. 새 부품을 추가할 때는 분류/핀 정의, 모델, 그림, 속성 UI, 파일 검증, 라이브러리 버튼, 예제를 함께 확인하세요. 물리 단자 위치를 수정하면 렌더링 좌표뿐 아니라 `endpointInfo`와 장착 계산의 일치도 확인해야 합니다.

## 5. 호환성과 유지해야 할 결정

- 앱 표시 이름은 **STM Emulator**입니다. 아래 내부 이름은 기존 데이터 호환성을 위해 남겨 둔 것이므로 단순 이름 정리로 바꾸지 마세요.
- Electron `appId`: `local.stm32.circuitlab`.
- 사용자 데이터: Electron `app.getPath('appData')` 아래 **`STM32 Circuit Lab`** 폴더. Windows에서는 기존 Roaming 프로필을 사용합니다.
- 파일 확장자: `.stm32lab`; JSON `format`: **`stm32-circuit-lab`**; 스키마 `version`: **2**.
- 자동 저장 키: **`stm32lab.project.v2`**, 읽을 때 **`stm32lab.project.v1`**도 fallback으로 확인합니다.
- 두 핀 장착 정보는 `attachA` / `attachB`, 다핀은 `attachments`를 사용합니다. `attachments()`·`assignAttachments()`를 사용해 표현 차이를 처리합니다.
- 구형 파일은 변환해서 읽지만 새 부품이 포함된 파일이 모든 구형 앱에서 열리는 것은 아닙니다.
- GPIO의 전기적 별칭과 화면에서 선택한 **물리 핀 ID**는 구분합니다.
- 테스트에는 `CIRCUIT_LAB_TEST_PROFILE`로 격리된 프로필을 사용하고 실제 사용자의 자동 저장 회로를 초기화하지 마세요.
- renderer의 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`를 유지합니다. 외부 창·페이지 이동은 차단되어 있고 파일 IPC는 선택한 회로 파일을 대상으로 합니다.

## 6. 다른 환경에서 시작하기

저장소 접근 권한이 있는 GitHub 계정, Git, Windows x64, Node.js 24 계열을 준비합니다. 이미 작업 폴더가 있으면 새로 clone하기 전에 `git status`로 미커밋 작업부터 확인하세요.

```powershell
git clone https://github.com/moonsyu/STM-Emulator.git
cd STM-Emulator
node --version
npm ci
node node_modules/electron/install.js
npm test
npm start
```

개발용 웹 화면은 `npm run dev:web`으로 `http://127.0.0.1:4173`에서 확인할 수 있습니다. 실제 데스크톱 앱은 웹 서버 없이 로컬 파일로 실행됩니다.

로컬 Windows 배포 생성:

```powershell
npm run build
npm run build:artifact
```

- `dist/STM-Emulator-<version>-win-x64.exe`: 사용자용 단일 EXE.
- `dist/win-unpacked/STM Emulator.exe`: 패키징된 앱 본체. 이 파일만 따로 복사하면 안 되며 같은 폴더의 런타임 파일이 필요합니다.
- `dist/artifact/`: 다운로드 묶음. 이전 결과가 남아 있으면 준비 스크립트가 중단합니다. 이전 파일을 별도로 보존한 후 빈 출력 폴더로 준비하세요.
- EXE는 Electron 런타임을 포함하므로 사용자의 PC에 Node.js를 별도 설치할 필요가 없습니다. macOS/Linux 배포·Windows의 모든 버전·다른 실제 PC에서의 동작을 검증한 상태는 아닙니다.

### 실제 앱 검증

Playwright는 현재 `package.json`의 의존성에 포함되어 있지 않습니다. UI 검증 환경에서 별도로 준비하고 필요하면 `PLAYWRIGHT_MODULE`을 해당 패키지의 절대 경로로 지정하세요. 개발·일반 모델 테스트에는 필요하지 않습니다.

```powershell
node scripts/ui-smoke.cjs
node scripts/editor-smoke.cjs
node scripts/parts-smoke.cjs
node scripts/portable-smoke.cjs
```

첫 세 스크립트의 `LAB_EXE`는 `win-unpacked` 앱 본체에만 지정합니다. portable 래퍼를 Playwright의 `_electron.launch`로 실행하면 연결을 기다리며 멈출 수 있으므로, 단일 EXE는 전용 `portable-smoke.cjs`를 사용하세요. 이 스크립트는 EXE를 실행한 뒤 격리된 프로필의 디버깅 포트에 연결합니다. 테스트 환경에서 `ELECTRON_RUN_AS_NODE`가 설정되어 있지 않은지도 확인합니다.

이전 환경에서 Node.js 20으로 경로/실행 문제가 있었고 Node.js 24.19.0으로 검증했습니다. 패키지·환경 오류가 나면 기존 테스트 코드를 우회하기 전에 현재 Node 버전과 Electron 런타임 설치 상태를 확인하세요.

## 7. GitHub 빌드·다운로드와 검증 증거

[빌드 목록](https://github.com/moonsyu/STM-Emulator/actions/workflows/build-windows.yml)에서 성공한 실행의 **Artifacts → STM-Emulator-Windows-x64**를 내려받습니다. Private 저장소이므로 로그인과 읽기 권한이 필요합니다. 워크플로는 `main` push 및 수동 실행에 반응하며, 문서 전용 커밋에 `[skip ci]`를 사용한 경우에는 새 빌드를 만들지 않습니다.

단계: `npm ci` → Electron 설치 → `npm test` → portable 빌드 → 패키지 검사 → Artifact 업로드. GitHub CI는 현재 모델 테스트를 수행하며, Playwright UI·portable 실행 검증은 이 워크플로에 포함되지 않습니다.

**0.3.2 검증 기록:**

| 항목 | 확인 결과 |
|---|---|
| 로컬 모델 테스트 | 31개 통과 |
| 로컬 실제 UI | 배선·부품·LED·버튼·ADC·실행 한도·IPC 저장/열기 검증 통과 |
| GitHub Windows 빌드 | [실행 34027506133](https://github.com/moonsyu/STM-Emulator/actions/runs/34027506133), `success` |
| 패키지 검사 | 버전 일치, 참고 이미지·기존 PNG 제외, 고지 문서 포함, Electron/Chromium 라이선스 원문 바이트 일치 |
| Artifact | ID `9987570101`, `STM-Emulator-Windows-x64`, 102,257,571 bytes |
| EXE | `STM-Emulator-0.3.2-win-x64.exe`, 100,117,415 bytes |
| 내려받은 EXE | 체크섬 확인 후 실제 실행. 압축 해제·창 열기·400홀·13종 부품·선택 핀 강조·LED·HC-SR04 예제 통과 |

EXE SHA-256:

```text
85d321832aed3ae5c9d2d5cbe6e0a185223632a1c0e4f5f6e6874681f056133e
```

다운로드 ZIP SHA-256:

```text
64d2c4d68a3597282777b2f64326209a5c46efc5fcb50682f6d8fc9153a89037
```

해당 Artifact의 기록된 만료 시각은 **2026-12-05 10:28:13 UTC**입니다. 이후에는 존재 여부를 다시 확인하세요. 보관 기간은 90일이며 만료 시 수동으로 재빌드할 수 있습니다. 재빌드는 같은 소스여도 빌드 환경·메타데이터에 따라 해시가 달라질 수 있으므로, 새 다운로드의 `BUILD-INFO.json`과 `SHA256.txt`를 기준으로 확인해야 합니다.

0.3.0에서는 전체 편집·추가 부품 UI 스크립트도 검증했지만, 이를 0.3.2에서 모두 다시 수행했다고 해석하지 마세요. 부저는 음향 그래프 생성까지 확인했으며 스피커 청취 검증 기록은 없습니다. 이 문서 추가 작업은 문서 변경이므로 모델·UI 테스트를 새로 실행한 작업은 아닙니다.

## 8. GitHub에 있는 것과 로컬에만 있는 것

| 위치 | 보관 범위 |
|---|---|
| GitHub | 앱 소스·테스트 스크립트·lockfile·빌드 워크플로·README·인계 문서·버전별 검증 MD·권리 검토·제3자 고지 |
| Actions Artifact | 해당 빌드 EXE·라이선스 원문·README·권리 검토·체크섬·빌드 정보. 영구 보관 아님 |
| `assets/` | 참고 사진·사용자 핀맵·생성 이미지. 로컬 보존, Git/EXE 제외 |
| `docs/*.png` | 과거 화면 이미지. 로컬 보존, Git/EXE 제외 |
| `test-results/` | 테스트 결과 JSON·스크린샷·격리 프로필. 로컬 전용이며 재실행으로 바뀔 수 있음 |
| `dist/` | 로컬 빌드 및 이전 EXE. Git 제외 |
| `node_modules/`, `.cache/` | 설치 의존성·다운로드·임시 도구. Git 제외, 새 환경에서 재생성 |
| 앱 자동 저장·대화 기록 | 사용자 PC / 대화 서비스에 별도 존재. GitHub에 포함되지 않음 |

따라서 과거 검증 MD에 있는 PNG나 결과 JSON 경로가 새 clone에서 존재하지 않아도 소스 누락으로 단정하지 마세요. 사용자가 작성한 실제 회로를 다른 PC에서 계속 쓰려면 앱의 **파일 저장**으로 `.stm32lab`을 별도 전달해야 합니다.

## 9. 권리 관련 결정

이전 작업에서 참고 이미지의 재배포 허락과 보드 외관 표현의 권리 관계를 확정하지 못해 **Private**으로 업로드했습니다. Private 설정이 이용 허락을 대신하는 것은 아닙니다. 사진·핀맵·생성 이미지·기존 스크린샷은 업로드하지 않았고, SVG의 장식용 ST 글자를 DBG/GPIO로, 부품 카드의 ST를 F4로 바꿨습니다.

기존의 [저작권·상표 검토](docs/COPYRIGHT-REVIEW.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)를 먼저 읽으세요. 이번 인계 문서 작업은 새로운 법률 판단이나 Public 전환 승인이 아닙니다. 참고 파일을 무심코 재추가하거나 `package.json`의 배포 파일 범위를 전체 폴더로 넓히지 마세요. 프로젝트 전체에 별도 오픈소스 라이선스를 부여하지 않았습니다.

## 10. 미구현 범위와 다음 작업 후보

현재 구현은 **학습용 회로 시뮬레이터와 제한된 스케치 실행기**입니다. 다음 항목은 완료 기능으로 소개하면 안 됩니다.

- **Cortex-M4 명령 실행, STM32 주변장치 레지스터, CubeIDE ELF/BIN 실행, 전체 HAL**: 미구현.
- LCD HD44780 명령 해석과 문자 출력: 미구현. 배치·배선만 지원.
- UART/I²C/SPI, DMA, 실제 타이머/인터럽트, ST-LINK/솔더 브리지/전체 보드 전원 회로: 미구현.
- 일반 C/C++ 컴파일·라이브러리, 사용자 함수, 배열·포인터·구조체, `for`, `#include`: 미지원.
- 정밀 SPICE, MCU 클록에 맞춘 시간 모델, PWM 파형, 기계 CAD 수준의 부품 치수·충돌 검증: 미구현.
- HC-SR04는 µs 단위 CPU 실행이 아닌 프로토콜 모델입니다. 현재 `pulseIn`은 ECHO와 입력 핀이 같은 도선 노드에 있을 때 동작하며 분압 회로를 통한 펄스 측정·임의 GPIO 펄스 측정·실제 반사 환경은 미지원입니다.
- macOS/Linux 실행파일, 코드 서명, 자동 업데이트: 현재 배포에 없음.

다음 순서는 사용자가 아직 확정하지 않았습니다. 범위를 정할 때 검토할 후보는 LCD 문자 출력, 스케치 문법 확장, 디지털 파형·주변장치 모델 확장, 실제 펌웨어 실행 방식 설계입니다. 특히 실제 ELF/BIN 실행은 현재 인터프리터에 함수를 조금 추가하는 수준이 아니므로 CPU·메모리·주변장치 모델의 범위를 별도로 설계해야 합니다. 새 기능은 사용자가 정한 우선순위에 맞춰 진행하세요.

## 11. 다음 작업자가 시작할 순서

1. 이 문서와 README를 읽고 `git status`, 현재 브랜치, `git log`를 확인합니다. `476dc7a` 이후 실제 코드 변경 여부를 구분합니다.
2. Private 유지 및 자료 제외 결정, 저장 경로·파일 형식 호환성 조건을 확인합니다.
3. 사용자에게서 새로 요청받은 기능 범위를 기준으로 위 코드 표에서 수정 위치를 찾습니다. 이미 끝난 기능을 다시 만들지 않습니다.
4. 관련 모델을 바꾸면 `npm test`, 편집/실행 UI를 바꾸면 관련 smoke 스크립트, 배포를 바꾸면 실제 portable EXE를 검증합니다. 문서만 바꾸는 작업에 전체 EXE 재빌드가 반드시 필요한 것은 아닙니다.
5. 기능·호환성·버전이 바뀌면 README와 이 문서의 상태를 갱신하고, 검증한 커밋·실제 빌드 링크·검증 범위를 기록합니다. 실행하지 않은 검증은 통과했다고 적지 않습니다.

새 작업에서 사용할 요청 예시:

> 이 저장소의 HANDOFF.md와 README.md를 읽고 현재 코드·브랜치·검증 상태를 확인한 뒤 이어서 작업해 주세요. 프로젝트명과 기존 회로 파일·자동 저장 호환성, Private 및 참고 자료 제외 결정을 유지해 주세요. 다음으로 구현할 기능은 [사용자가 지정할 기능]입니다. 변경한 범위에 맞게 검증하고 인계 문서를 갱신해 주세요.
