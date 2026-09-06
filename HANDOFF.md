# STM Emulator — 작업 인계 및 이어가기

마지막 정리: **2026-09-06 (KST)**. 현재 개발 버전은 **0.4.0**입니다. 실제 STM32 펌웨어 실행은 이번 구현에서 제외한다는 사용자 지시를 유지합니다. 대화 없이 저장소만 받아도 이어서 작업할 수 있도록 정리했습니다.

## 1. 현재 목표와 결정

사용자는 Tinkercad처럼 NUCLEO-F446RE 보드와 빵판에 부품·배선을 배치하고 코드를 실행하는 EXE 앱을 원합니다. 실제 Cortex-M4/ELF/BIN 실행을 제외하고 우선 **Windows 실습 기능(LCD·통신·문법·타이머·파형)**을 확장했습니다. 사용자에게는 존댓말로 응답합니다.

- 이름: **STM Emulator**.
- 저장소: [moonsyu/STM-Emulator](https://github.com/moonsyu/STM-Emulator), **Private**, 기본 브랜치 `main`.
- 앱: Electron **44.2.0**, electron-builder **26.15.3**, JavaScript ES modules/SVG. 의존성 lockfile 유지.
- 개발 검증 Node.js: **24.19.0**. CI는 Node.js 24 계열.
- 버전: **0.4.0**, EXE 이름 `STM-Emulator-0.4.0-win-x64.exe`.
- 검증: 모델 테스트 **53개**, 기존 UI·편집·부품 및 새 기능 UI 스크립트 통과. GitHub 빌드와 다운로드한 portable EXE 검증도 통과.
- 배포 소스는 `112497923e7805882b49319d740c2fd4e5ddfc36`, [성공한 빌드 34039203704](https://github.com/moonsyu/STM-Emulator/actions/runs/34039203704)입니다. EXE 해시와 검증 항목은 [0.4.0 검증 기록](docs/VERIFICATION-0.4.0.md)의 배포 절을 확인합니다. 후속 문서 커밋과 바이너리 소스 커밋을 구분하세요.

기존 0.3.2 기준 인계 기록은 [문서 커밋 ab1c486](https://github.com/moonsyu/STM-Emulator/blob/ab1c486bb012c71ad713f0f6db3ec12ad624ef17/HANDOFF.md)에 보존되어 있습니다. 위 버전과 현재 HEAD가 다르면 `git log`와 소스를 우선 확인하세요.

## 2. 완료한 기능

### 기존 기능 유지

- 보드 커넥터 **108핀**: CN7/CN10 및 CN5/CN6/CN8/CN9. GPIO 전기적 별칭과 물리 커넥터 핀을 구분.
- 빵판 **400홀**: 30행 × 10개 + 독립 전원 레일 4개 × 25개. A–E/F–J 내부 연결, 중앙 홈 분리.
- 두 핀 부품은 두 점 클릭, 다핀 부품은 생성 후 드래그. 모든 다리가 빈 구멍에 맞아야 장착하며 접점은 구멍 좌표에 정렬.
- **45° 회전**, **10색 배선**, 선택 후 Esc/Delete 삭제, 연결 중 Esc 취소, 입력칸 편집 중 삭제 방지, 부품 몸체 클릭 우선.
- 핀 검색의 공백/대소문자 정규화 및 결과에서 선택한 **물리 핀 하나** 강조.
- GPIO/ADC, 전원 단락 정지·과전류 경고, USER/PC13와 LD2/PA5, 저장·자동 저장·undo/redo.
- 기존 저항·LED·버튼·LCD 및 가변저항·슬라이드·RGB·커패시터·다이오드·부저·7세그먼트·TMP36·HC-SR04.

### 0.4.0 추가

- **LCD 출력**: 4/8비트 쓰기 명령, ASCII, 커서/블링크/스크롤, 사용자 문자 8개. LiquidCrystal 호출이 GPIO를 구동하고 연결된 LCD가 E 에지를 읽음.
- **UART 터미널·I²C 메모리·SPI 메모리** 추가로 총 **16종** 부품. 전원·배선·주소/속도/CS 확인. UART 입력과 통신 이벤트 UI.
- **스케치 확장**: 사용자 함수, 지연 후 함수 재개, for/do/return/break/continue, 배열·구조체·단일 포인터, 복합 대입·비트 연산·진수/문자 리터럴.
- **실행 한도**: 인덱스·포인터 수명·const·재귀·코드/메모리·이벤트 한도 검사. `eval`이나 호스트 API 노출 없음.
- **Timer.every/after**, GPIO 에지 인터럽트, **DMA.start/write**로 ADC/PWM 배열 전송과 완료 콜백.
- **4채널 파형**: 선택한 0.1~20 ms 계산 간격 + GPIO 전환 시점, PWM 실제 HIGH/LOW 옵션, RC 필터 전압, CSV 저장. 12,000개 샘플 순환 보관.
- LCD/통신/타이머/인터럽트/DMA/문법/PWM의 **기능 예제 9개**. 설정 저장/복원.

구체적인 함수·핀·인수·모델의 생략은 **[SKETCH-API.md](docs/SKETCH-API.md)**에 있습니다. 통신 API 이름만 보고 전체 Arduino/STM32 라이브러리 호환으로 소개하지 마세요.

## 3. 코드 지도

| 파일 | 담당 |
|---|---|
| `src/pins.js` | 핀·구멍·별칭·endpointInfo·검색 |
| `src/components.js` | 부품 정의·분류·다리·장착 정보 변환 |
| `src/placement.js` | findMount/applyMount, 구멍 정렬·점유 검사 |
| `src/project.js` | 기본 예제·파일 검증·구형 파일 변환·simulation 설정 |
| `src/component-examples.js` | 부품별 예제 |
| `src/feature-examples.js` | LCD·통신·타이머 등 새 기능 예제 9개 |
| `src/parser.js` | 안전한 C 계열 문법 토큰화·AST 생성 |
| `src/runtime.js` | 스코프·배열/포인터·generator 실행·타이머·IRQ·DMA·PWM |
| `src/program.js` | compile/Runtime의 기존 import 경로를 유지하는 재노출 |
| `src/session.js` | Runtime, 회로 해석, LCD, 버스, 센서, 파형을 통합하는 SimulationSession |
| `src/engine.js` | UnionFind/topology/DC/RC 계산; solve와 같은 시간의 hold 구분 |
| `src/lcd.js` | LCDController와 LiquidCrystal 내장 어댑터 |
| `src/buses.js` | UART 큐·I²C/SPI 메모리·전원/배선 검사·통신 로그 |
| `src/sensors.js` | HC-SR04 TRIG/ECHO 프로토콜 상태 |
| `src/trace.js` | WaveRecorder, CSV, 파형 SVG |
| `src/monitor.js` | 로그/파형/통신 탭, 채널·해상도·입력·CSV UI |
| `src/app.js` | 편집·검색·선택·실행·자동 저장 통합 |
| `src/render.js`, `src/part-render.js` | 보드·빵판·부품·LCD/전기 상태 SVG |
| `src/part-controls.js` | 부품 속성·라이브 측정 UI |
| `desktop/main.cjs`, `desktop/preload.cjs` | Electron 및 회로 파일/CSV IPC |
| `tests/circuit.test.js` | 기존 회로·편집 모델 31개 |
| `tests/runtime.test.js` | 확장 실행기 11개 |
| `tests/session.test.js` | 통합 회로/통신/파형 11개 |
| `scripts/*-smoke.cjs` | 실제 앱/EXE 검증 |
| `.github/workflows/build-windows.yml` | Windows CI·Artifact |

중요 흐름: 입력 → 프로젝트 수정 → Runtime 이벤트 → 이전 GPIO 상태로 해당 시점까지 RC 적분 → 새 GPIO의 같은 시점 회로 계산 → LCD/통신·센서 상태·파형 기록 → 화면 표시.

GPIO 상태를 바꾸기 전 `beforeChange`와 바꾼 후 `changed`의 순서를 유지하세요. 과거 시간 구간을 새 GPIO 값으로 적분하면 RC 파형이 잘못됩니다. 같은 시간의 재측정이 커패시터를 다시 충전해서도 안 됩니다.

새 부품은 정의·모형·속성·전기 모델·파일 검증·예제·테스트까지 확인합니다. 핀 좌표를 바꾸면 렌더링, endpointInfo, 장착 계산이 일치해야 합니다.

## 4. 호환성 규칙

- 표시 이름은 STM Emulator지만 appId **`local.stm32.circuitlab`** 유지.
- 사용자 데이터 폴더는 Electron appData 아래 **`STM32 Circuit Lab`** 유지. 단순 이름 정리로 옮기지 않습니다.
- 확장자 **`.stm32lab`**, JSON format **`stm32-circuit-lab`**, 스키마 **version 2** 유지.
- 자동 저장 키 **`stm32lab.project.v2`**, 읽기 시 v1 fallback 유지.
- 0.4.0의 선택적 `simulation: {stepMs, pwmWaveform}`은 기존 파일에서 생략 가능. 기본 1 ms, PWM 파형 꺼짐.
- 두 핀은 `attachA/attachB`, 다핀은 `attachments`. 헬퍼로 표현 차이를 처리합니다.
- 새 부품과 문법은 구버전 앱에서 실행되지 않을 수 있습니다.
- renderer의 contextIsolation/sandbox 유지, nodeIntegration 금지. 회로 파일·CSV는 제한된 IPC로 저장.
- 테스트는 **CIRCUIT_LAB_TEST_PROFILE**로 격리하며 실제 사용자의 자동 저장 데이터를 삭제하지 않습니다.

## 5. 개발·검증·빌드

Windows x64, Git, Node.js 24 계열을 준비합니다. 새 PC에서는 저장소 읽기 권한이 필요합니다. 기존 폴더라면 먼저 미커밋 파일을 확인하세요.

```powershell
git clone https://github.com/moonsyu/STM-Emulator.git
cd STM-Emulator
npm ci
node node_modules/electron/install.js
npm test
npm start
```

웹 확인은 `npm run dev:web` 후 `http://127.0.0.1:4173`입니다. 데스크톱 앱 자체는 웹 서버 없이 실행됩니다.

```powershell
npm run build
npm run build:artifact
```

- `dist/STM-Emulator-<version>-win-x64.exe`: 배포용 단일 파일.
- `dist/win-unpacked/STM Emulator.exe`: 런타임 폴더와 함께 있어야 하는 앱 본체.
- `dist/artifact/`: EXE·고지·API 문서·체크섬·빌드 정보. 기존 결과가 남으면 준비 스크립트는 중단하므로 결과를 별도 보관 후 빈 폴더로 준비하세요.
- 실행 사용자에게는 Node.js 설치가 필요 없습니다.

UI 테스트는 별도 Playwright가 필요합니다. `PLAYWRIGHT_MODULE`로 패키지 절대 경로를 지정할 수 있습니다.

```powershell
node scripts/ui-smoke.cjs
node scripts/editor-smoke.cjs
node scripts/parts-smoke.cjs
node scripts/features-smoke.cjs
node scripts/portable-smoke.cjs
```

`LAB_EXE`는 첫 네 스크립트를 `win-unpacked` 앱 본체로 돌릴 때 사용합니다. portable 래퍼를 Playwright `_electron.launch`로 넘기지 말고 전용 portable 스크립트를 쓰세요. 이 스크립트는 별도 프로필과 디버깅 포트를 사용합니다. `ELECTRON_RUN_AS_NODE`도 제거합니다.

GitHub Actions는 모델 테스트·빌드·패키지/라이선스 검사를 수행합니다. 실제 Playwright/portable UI는 현재 CI에 자동 포함되지 않으며 별도 실행 결과와 구분해야 합니다. 마지막 작업 환경에서는 모델 테스트와 개발용 UI 및 GitHub에서 다운로드한 0.4.0 EXE를 확인했고, 항목별 결과를 버전별 검증 기록에 남겼습니다.

## 6. 배포와 자료 위치

[Windows 빌드 목록](https://github.com/moonsyu/STM-Emulator/actions/workflows/build-windows.yml) → 성공한 실행 → **Artifacts → STM-Emulator-Windows-x64**.

- Private이므로 GitHub 로그인과 저장소 접근 권한 필요.
- main push 또는 수동 실행으로 빌드. `[skip ci]` 문서 커밋은 제외.
- Artifact는 90일 보관. 만료되면 다시 빌드하고 해당 파일의 BUILD-INFO.json·SHA256.txt를 확인합니다.
- Git에는 소스·문서·테스트·lockfile·워크플로가 있습니다.
- `assets/`, `docs/*.png`, `test-results/`, `dist/`, `node_modules/`, `.cache/`는 로컬 전용이며 업로드하지 않습니다.
- 대화 기록·실제 사용자의 자동 저장 회로는 GitHub에 포함되지 않습니다. 회로를 옮기려면 앱에서 `.stm32lab`을 별도 저장해야 합니다.

과거 검증 MD의 PNG나 결과 JSON이 새 clone에서 없다고 해서 소스 누락으로 판단하지 마세요. 실제 결과 파일은 로컬 전용이고 일부 테스트는 재실행 때 덮어씁니다.

## 7. 권리 결정 유지

[저작권·상표 검토](docs/COPYRIGHT-REVIEW.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)를 따릅니다. 참고 이미지·핀맵·사진 기반 생성 이미지의 재배포 권리와 외관 표현의 권리 관계를 확정하지 못해 Private으로 유지합니다. 비공개 설정이 이용 허락을 뜻하지는 않습니다.

참고 자료와 기존 스크린샷을 업로드하지 않고 장식용 ST 표기를 DBG/GPIO/F4로 바꿨습니다. 이번 확장의 스케치·LCD·통신 코드는 자체 구현이며 Arduino 라이브러리나 STM32 펌웨어를 복사·링크하지 않았습니다. 제외 파일을 재추가하거나 배포 파일 범위를 전체 폴더로 넓히지 마세요. 프로젝트 전체에 오픈소스 라이선스를 임의로 부여하지 않았습니다.

## 8. 현재 한계와 남은 작업

- **실제 STM32 CPU·레지스터·ELF/BIN·전체 HAL 실행**: 사용자 지시에 따라 이번 범위에서 제외.
- C/C++ 전체 컴파일·ABI·정수 비트폭/오버플로, 외부 라이브러리·클래스·템플릿·오버로드·다차원 배열·동적 메모리 등은 미지원.
- UART/I²C/SPI는 트랜잭션 단위 모델. 실제 비트 파형, SPI 모드/비트 순서, I²C 중재/clock stretching, UART 오류·노이즈는 미지원.
- Timer/IRQ/DMA는 협력적 스케치 스케줄러. 실제 NVIC 우선순위·CPU 선점·버스 경쟁을 재현하지 않음.
- LCD는 쓰기 측·ASCII/사용자 문자 모델. busy-flag 읽기·모든 폰트 ROM·정확한 부품별 전기 사양은 미지원.
- RC 해석은 후진 오일러 학습용 모델. 정밀 SPICE·전체 반도체 동특성·기계 CAD 치수 검사는 미지원.
- HC-SR04의 임의 파형 측정·분압을 거친 ECHO·반사 환경은 기존과 같이 미지원.
- macOS/Linux 배포, 코드 서명, 자동 업데이트는 이번 Windows 기능 확장에 포함되지 않았습니다. 서명에는 사용자 소유 인증서/플랫폼 계정이 필요합니다.

다음 작업은 사용자 우선순위를 따라 정합니다. 구현한 모델을 정밀 하드웨어 재현으로 확대 설명하지 마세요. 변경 후 관련 테스트와 인계 문서·API 문서·버전별 검증 기록을 함께 갱신합니다.

## 9. 다음 작업 시작 순서

1. HANDOFF.md, README.md, SKETCH-API.md와 `git status`/현재 브랜치/최근 커밋을 확인합니다.
2. 기존 호환성·Private·자료 제외 조건을 유지합니다.
3. 사용자가 새로 요청한 기능만 범위를 구체화하고 코드 지도에서 수정 위치를 찾습니다.
4. 모델 변경은 관련 단위/통합 테스트, UI 변경은 해당 smoke, 배포 변경은 실제 EXE를 검증합니다. 이미 끝난 기능을 다시 만들지 않습니다.
5. 실행한 검증만 완료로 기록하고, 빌드 링크·소스 커밋·해시를 구분해 남깁니다.

새 작업 요청 예시:

> HANDOFF.md와 README.md, docs/SKETCH-API.md를 읽고 현재 코드와 검증 상태를 확인한 뒤 이어서 작업해 주세요. 실제 STM32 펌웨어 실행은 제외하고 기존 회로 파일·자동 저장 호환성 및 Private/자료 제외 결정을 유지해 주세요. 다음 작업은 [사용자가 지정할 기능]입니다.
