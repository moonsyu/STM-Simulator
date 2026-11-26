# STM Simulator

## 프로젝트 소개

STM32·Renesas 보드 없이 **설정 → 코드 → 빌드 → 실행 확인**을 한 화면에서 하는 Windows 학습용 IDE입니다.

**[⬇ 최신 EXE 다운로드 (GitHub Releases)](https://github.com/moonsyu/STM-Simulator/releases/latest)**: `STM-Simulator-<버전>-Windows-x64.zip`을 받아 압축을 풀고 `STM-Simulator.exe`를 실행합니다.

```mermaid
flowchart LR
    DL["GitHub Releases<br/>latest"] --> ZIP["STM-Simulator-버전-Windows-x64.zip"]
    ZIP --> EXE["STM-Simulator.exe<br/>설치 없이 실행"]
    EXE --> APP["STM Simulator"]

    subgraph APP_IN["한 앱 안에서"]
        direction LR
        MX["CubeMX처럼<br/>핀·클록·주변장치 설정"] --> IDE["CubeIDE처럼<br/>코드 작성·빌드·디버그"] --> SIM["보드 시뮬레이터<br/>LED·버튼·센서·통신 확인"]
    end
    APP --> APP_IN

    subgraph BOARDS["지원 보드"]
        B1["NUCLEO-F103RB"]
        B2["NUCLEO-F446RE"]
        B3["FPB-RA6E1<br/>Renesas FSP"]
    end
    APP_IN --- BOARDS

    EXE -. "새 버전 확인·해시 검증·교체" .-> DL
```

| 실행 방식 | 필요한 것 |
|---|---|
| 회로 시뮬레이터 · 펌웨어 에뮬레이터 | EXE만 |
| ARM GCC 빌드 · 실물 보드 기록·디버그 | 앱의 "필요한 도구 설치"로 받는 ARM GCC · SDK · OpenOCD/J-Link |

## 목적

```mermaid
flowchart TB
    GOAL(["목적: 실물 보드 없이도 MCU 펌웨어가 실제로 어떻게 동작하는지 보기"])

    GOAL --> G1["MCU 설정 도구와 같은 설정"]
    GOAL --> G2["임베디드 개발 환경과 같은<br/>코드 작성 · 빌드 · 디버그"]
    GOAL --> G3["실물 보드와 같은 실행 결과"]

    G1 --> D1["핀 · 클록 · 인터럽트 · DMA 설정<br/>설정 파일 가져오기 · 내보내기<br/>초기화 코드 생성"]
    G2 --> D2["표준 프로젝트 폴더 구조<br/>사용자 코드 구역 보존 · 주변장치별 .c/.h<br/>빌드 수준 · GDB 디버그"]
    G3 --> D3["제조사 드라이버로 빌드한 ELF를<br/>Cortex-M 명령어 단위로 실행<br/>빵판 회로와 전압 · 전류 계산"]

    D1 & D2 & D3 --> OUT(["판단 기준: 제조사 개발 도구와 같은 결과를 내는가,<br/>실물 보드와 같이 동작하는가"])
```

## 개발 계기

```mermaid
flowchart LR
    subgraph BEFORE["기존 STM32 학습 흐름"]
        direction TB
        A1["CubeMX로 설정"] --> A2["CubeIDE로 코드 작성·빌드"]
        A2 --> A3{"보드가 있나?"}
        A3 -- "있음" --> A4["ST-LINK로 기록해 확인"]
        A3 -- "없음" --> A5["동작을 확인할 방법이 없음"]
    end

    subgraph PROBLEM["불편한 점"]
        direction TB
        P1["도구가 셋으로 나뉨"]
        P2["보드·부품·배선이 있어야 실습 가능"]
        P3["코드 한 줄의 결과를 바로 못 봄"]
    end

    subgraph AFTER["STM Simulator"]
        direction TB
        S1["설정·코드·회로를 한 프로젝트로 저장"] --> S2["실행 즉시 가상 보드·빵판에 결과 표시"]
        S2 --> S3["같은 코드를 실물 보드에도 그대로 기록"]
    end

    A5 --> PROBLEM --> AFTER
```

## 시스템 아키텍처

```mermaid
flowchart TB
    USER(["사용자"]) --> APP

    subgraph APP["STM-Simulator.exe · Electron"]
        direction LR
        R["Renderer<br/>화면 · 편집기 · 시뮬레이터"] <-->|"제한된 IPC<br/>contextIsolation · sandbox"| PRE["Preload"]
        PRE <--> M["Main 프로세스<br/>파일 · 빌드 · 디버그 · 업데이트"]
    end

    subgraph LOCAL["이 PC"]
        FS[("프로젝트<br/>.stm32lab · 프로젝트 폴더")]
        DIAG[("진단 기록<br/>events.jsonl")]
        TOOLS["개발 도구<br/>ARM GCC · GDB · clangd"]
        SDK["SDK<br/>STM32CubeF1/F4 · Renesas FSP"]
        DBG["OpenOCD · J-Link"]
    end

    subgraph HW["실물 보드 (선택)"]
        N1["NUCLEO-F103RB / F446RE<br/>ST-LINK"]
        N2["FPB-RA6E1<br/>J-Link"]
    end

    subgraph GH["GitHub"]
        REL["Releases<br/>EXE · ZIP · SHA256 · 매니페스트"]
        CI["Actions CI<br/>검사 · 빌드 · 게시"]
    end

    M --> FS
    M --> DIAG
    M --> TOOLS
    TOOLS --> SDK
    M --> DBG
    DBG --> N1
    DBG --> N2
    M <-->|"새 버전 확인 · 다운로드 · 해시 검증"| REL
    M -->|"필요한 도구 설치"| TOOLS
    CI --> REL
```

## 애플리케이션 아키텍처

### 모듈 구성

```mermaid
flowchart TB
    subgraph UI["화면 계층 (src)"]
        SHELL["shell · 활동 바 · 메뉴 · 설정"]
        EDITOR["Monaco 편집기 · 탐색기 트리<br/>ide-ui · code-editor"]
        PINOUT["Pinout · Clock · NVIC<br/>pinout-ui · ra-pinout-ui"]
        CANVAS["회로 화면<br/>render · catalog-render · wire-router"]
        PANEL["직렬 모니터 · 로직 분석기 · 변수 그래프"]
    end

    subgraph MODEL["프로젝트 모델"]
        PROJ["project · app-state<br/>회로 · 코드 · 설정 · Undo"]
        MCU["mcu-config · ra-config<br/>핀 · 주변장치 · 클록"]
    end

    subgraph GEN["코드 생성"]
        HALGEN["hal-generator · peripheral-files<br/>main.c · gpio.c/.h · usart.c/.h"]
        RAGEN["ra-generator<br/>hal_entry.c · ra_gen"]
        IOC["ioc-export · firmware-import"]
    end

    subgraph RUST["Rust 코어 (rust/stm-core → WebAssembly)"]
        RC["rust-core.js · rustCall"]
        RS["regen · couple · explorer<br/>duty · build_level · family"]
    end

    subgraph EXEC["실행 엔진"]
        INTERP["C 인터프리터<br/>parser · runtime · hal · fsp-interp"]
        EMU["펌웨어 에뮬레이터<br/>emu/cpu · bus · scs<br/>stm32f103 · stm32f446 · ra6e1"]
        CIRCUIT["회로 엔진 engine.js<br/>전압 · 전류 · LED 밝기"]
        DEV["장치 모델<br/>LCD · OLED · 센서 · 모터 · 통신 모듈"]
    end

    subgraph MAIN["Main 프로세스 (desktop)"]
        NB["native-build · ra-build<br/>ARM GCC 빌드"]
        NI["native-ide · gdb-mi · jlink<br/>실물 보드 디버그"]
        WS["workspace · workspace-transaction<br/>원자적 저장"]
        UP["updater · tool-installer"]
    end

    UI --> MODEL
    PINOUT --> GEN
    GEN --> RC
    EDITOR --> RC
    RC --> RS
    MODEL --> EXEC
    INTERP --> CIRCUIT
    EMU --> CIRCUIT
    CIRCUIT --> DEV
    CIRCUIT --> CANVAS
    EXEC --> PANEL
    EDITOR -->|"IPC"| NB
    NB -->|"firmware.elf"| EMU
    EDITOR -->|"IPC"| NI
    MODEL -->|"IPC"| WS
```

### 실행 흐름

```mermaid
flowchart LR
    CODE["main.c · .c/.h<br/>+ Pinout 설정"] --> CHOICE{"실행 대상"}

    CHOICE -->|"시뮬레이터 · 인터프리터"| PARSE["C 소스 해석<br/>HAL 함수 모델"]
    CHOICE -->|"시뮬레이터 · ARM GCC"| BUILD["ARM GCC 빌드<br/>실제 ST HAL · CMSIS<br/>빌드 수준 -O0 ~ -Ofast"]
    CHOICE -->|"실물 보드"| FLASH["ELF 기록<br/>OpenOCD · J-Link"]

    BUILD --> ELF["firmware.elf"]
    ELF --> CPU["Cortex-M 명령어 실행<br/>레지스터 단위 주변장치"]
    ELF --> FLASH

    PARSE --> PINS["핀 상태 · 듀티"]
    CPU --> PINS
    PINS --> SOLVE["회로 계산"]
    SOLVE --> VIEW["보드 · 빵판 화면<br/>LED · LCD · 모터"]
    SOLVE --> MON["직렬 모니터 · 파형 · 그래프"]

    FLASH --> GDB["GDB 디버그<br/>중단점 · 변수 · 레지스터"]
    CPU --> DEBUG["앱 내장 디버그<br/>중단점 · 호출 스택"]
```

## 개발 과정

### 버전 흐름

```mermaid
timeline
    title STM Simulator 주요 버전 (2026)
    09-06 : 첫 공개 (STM Emulator) : Windows 빌드 · 회로 · LCD · 버스 장치 · 파형
    10-22 : v1.0.0 : 전체 기능 점검 (실물 보드 연동 제외)
    11-04 : v1.13 ~ v1.14 : NUCLEO-64 회로도 기본 연결 : 시뮬레이터를 ARM GCC 빌드로 (실제 HAL ELF 실행)
    11-06 : v1.20 ~ v1.25 : FPB-RA6E1 · RA6E1 에뮬레이터 · Clock 설정
    11-10 : v1.35 ~ v1.44 : CubeIDE 프로젝트 가져오기 · 전체 파일 구조 수정
    11-11 : v1.49 : 주변장치별 .c/.h 생성
    11-24 : v1.59 : 지원 보드를 STM32와 FPB-RA6E1로 정리
    11-25 : v1.61 ~ v1.63 : Rust 코어(WebAssembly) · 빌드 수준 · 탐색기 한 트리 · LED 듀티 표시
```

### 기획 과정

```mermaid
flowchart TB
    REQ(["사용자 요청<br/>기능 · 오류 · 질문"]) --> PLAN["기획 세션"]
    PLAN --> CHECK["코드 · 진단 기록으로<br/>현재 동작 확인"]
    CHECK --> CMP{"제조사 개발 도구 ·<br/>실물 보드와 같은가?"}
    CMP -->|"다름"| SCOPE["범위 정리<br/>바뀌는 화면 · 동작 · 기본값"]
    CMP -->|"같음"| ANSWER["원인 설명 · 답변"]
    SCOPE --> ASK{"요청 밖의 추가 사항?"}
    ASK -->|"있음"| APPROVE["사용자 승인 받기"]
    ASK -->|"없음"| LIST
    APPROVE --> LIST["docs/FEATURES.md에 번호로 기록<br/>상태: 미착수"]
    LIST --> LOG["docs/WORKLOG.md 맨 위에 기록"]
    LOG --> HAND["구현 세션에 전달"]
```

### 구현 · 검증 · 게시 과정

```mermaid
flowchart LR
    HAND["기능 목록 N번"] --> IMPL["구현<br/>새·수정 기능은 Rust"]
    IMPL --> RT["npm run test:rust<br/>fmt · clippy · cargo test · wasm"]
    RT --> UT["npm test<br/>단위 · 에뮬레이터 · 펌웨어"]
    UT --> E2E["npm run test:e2e<br/>실제 앱 창 · 다크 모드"]
    E2E --> PKG["패키지 검사<br/>packaged.test.mjs"]
    PKG --> VER["버전 커밋 · push"]

    subgraph CI["GitHub Actions"]
        direction TB
        C1["checks"] --> C2["firmware<br/>ARM GCC · 툴체인"] --> C3["package<br/>EXE · ZIP"] --> C4["release"]
    end

    VER --> CI
    C4 --> REL["GitHub Release<br/>자산 5개"]
    REL --> DONE["FEATURES: 완료 (버전)<br/>HANDOFF · VERIFICATION · WORKLOG"]
    REL --> USERS["사용자 앱 자동 업데이트"]
```

### 수정 과정

```mermaid
flowchart TB
    BUG(["앱에서 이상 동작 발견"]) --> DIAG["진단 기록 읽기<br/>events.jsonl · latest-project.stm32lab"]
    DIAG --> REPRO["같은 프로젝트로 재현<br/>Node 스크립트 · 에뮬레이터"]
    REPRO --> CAUSE{"원인"}
    CAUSE -->|"사용자 코드 · 설정"| EXPLAIN["원인과 고칠 방법 안내"]
    CAUSE -->|"앱 오류"| REC["FEATURES에 (오류)로 기록"]
    REC --> FIX["수정 + 재현 시험 추가"]
    FIX --> PATCH["패치 버전 게시<br/>예: 1.63.1"]
    PATCH --> VERIFY["CI 전체 통과 · Release 자산 확인"]
    VERIFY --> UPD["자동 업데이트로 사용자에게 전달"]
```

## 라이선스

STM Simulator의 소스 코드와 문서는 [MIT 라이선스](LICENSE)로 공개합니다. 사용·복제·수정·배포·판매가 자유롭고, 저작권 표시와 라이선스 문구만 함께 두면 됩니다. 함께 배포하는 Electron·Monaco·DOMPurify 등은 각자의 라이선스를 따르며 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 적었습니다.

## 권리 관련 안내

STM Simulator는 STMicroelectronics와 Renesas Electronics의 공식 제품이 아닌 개인 학습 프로젝트이며, 두 회사의 후원·승인·제휴를 주장하지 않습니다. STM32, NUCLEO, STM32CubeMX, STM32CubeIDE, Renesas, RA, FSP, e² studio 등 제품명과 상표의 권리는 각 권리자에게 있습니다.

모든 자료의 권리 관계에 대한 법률 검토가 완료된 것은 아닙니다. **저작권·상표권·라이선스 등 권리 관련 문제 또는 법적 문제가 확인되는 경우, 해당 저장소를 삭제 조치하겠습니다.** 관련 문제는 [GitHub Issues](https://github.com/moonsyu/STM-Simulator/issues)를 통해 알려 주세요.
