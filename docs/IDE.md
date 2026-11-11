# IDE와 시뮬레이터 사용법

STM Simulator는 프로젝트·코드·시뮬레이터·터미널을 한 화면에서 사용하는 학습용 IDE다.

## 작업 화면과 테마

화면은 VS Code와 같은 구성입니다.

| 영역 | 내용 |
|---|---|
| 제목 표시줄 | 프로그램 이름과 파일·편집·보기·실행·터미널·도움말 메뉴(좁은 창에서도 표시), 명령 검색 칸(돋보기, 누르면 명령 팔레트), **▶ 실행**, 새 버전이 있을 때만 나타나는 **업데이트** 버튼, 화면 테마(태양/달 아이콘), 패널 표시 전환, 저장. 빌드·디버그는 실행 메뉴·명령 팔레트·실행 및 디버그 보기에 있습니다. 프로젝트 이름은 탐색기 위, 저장 상태는 상태 표시줄에 표시합니다 |
| 활동 바(왼쪽 끝) | 탐색기 · 부품 · 예제 · 보드/핀 설정 · 실행 및 디버그 · 장치 Docs. 같은 아이콘을 다시 눌러도 보기는 그대로 열려 있습니다(1.44.0부터. 사이드바는 Ctrl+B나 제목 표시줄 단추로 접습니다). 사이드바를 새 창(⧉)으로 꺼내 둔 때에는 아이콘을 누르면 본 창으로 돌아옵니다. 마우스를 올리면 아이콘 오른쪽에 이름과 단축키가 나타나고, 아이콘을 끌어다 놓거나(포커스 후 Alt+↑/↓) 순서를 바꾸면 기억합니다 |
| 기본 사이드바 | 선택한 보기의 내용. 탐색기에는 소스 파일과 회로 개요, 실행 및 디버그에는 **실행 환경**(시뮬레이터 · 펌웨어 에뮬레이터 · 연결된 보드마다 "NUCLEO-F446RE (COM5)" · Windows C/C++, Debug/Release)과 디버그 도구 모음·변수·감시식·호출 스택·중단점이 있습니다 |
| 편집기 영역 | 소스 탭이 있는 코드 편집기와 회로 그룹. 그룹 오른쪽 위 버튼으로 최대화하거나 새 창으로 분리합니다. 회로 도구 막대에 부저 **소리 켜기/끄기**가 있습니다 |
| 하단 패널 | 문제 · 출력 · 터미널 · 직렬 모니터 · 파형 · 변수 그래프 · 로직 분석기 · 빌드 |
| 보조 사이드바(오른쪽) | 선택한 핀·배선·부품의 속성과 실시간 측정 |
| 상태 표시줄 | 실행 상태(실행 중에는 파란색), 실행 대상, 문제 수, 실행 시간, 최대 전류, 빌드 상태, 커서 위치, 언어, clangd, 보드, 알림 |

**명령 팔레트**(Ctrl+Shift+P 또는 F1)에서 모든 메뉴 명령을 이름으로 검색해 실행합니다. **빠른 열기**(Ctrl+P)는 소스 파일로 이동하고, `:줄번호`를 입력하면 현재 파일의 해당 줄로 이동합니다.

White/Dark는 VS Code Modern 계열의 중성 표면과 파란 강조색을 사용합니다. 처음 실행하면 **System** 설정에 따라 Windows가 밝으면 White, 어두우면 Dark를 적용하며 실행 중 시스템 변경도 반영합니다. 제목 표시줄의 태양(White)/달(Dark) 아이콘을 누르면 다른 모드로 고정되고, **보기 → 화면 테마: 시스템 설정 따르기** 또는 설정에서 System으로 되돌립니다. 코드 블록의 Jellybeans/GitHub Light/등록 colorscheme는 화면 테마와 독립되어 모드별로 기억합니다.

저장이나 열기가 실패하면 오른쪽 아래 알림과 출력 로그에 표시합니다. **로그 보기**로 자세한 오류를 확인하고 저장 위치나 파일을 고쳐 다시 시도합니다.

### 단축키

실행·디버그·빌드·코드 정렬과 보기 명령 단축키는 **편집 → 설정 → 단축키**(Ctrl+K Ctrl+S)에서 보고 바꿀 수 있습니다. F9 중단점, Ctrl+S/Z/Y, Ctrl+F/R(H), 회로 단축키(W·V·R·Delete 등)는 고정입니다. 항목을 누르고 새 키 조합을 입력한 뒤 Enter로 저장하고, Backspace로 지우며, ↺로 기본값에 돌아갑니다. 같은 키를 쓰는 명령은 충돌로 표시됩니다. 아래는 기본값입니다.

| 조작 | 기능 |
|---|---|
| Ctrl+F5 | 실행 (일시정지 중에는 계속 실행) |
| F10 | 디버그 시작 (일시정지 중에는 계속 실행) |
| F11 | 디버그 중 한 줄 실행 (누르고 있으면 연속 실행) |
| Ctrl+F2 | 디버그 및 실행 중지 (빌드 중에는 빌드 취소) |
| Ctrl+F11 · Shift+F11 · F6 · F9 | 함수 안으로 · 함수 밖으로 · 일시정지 · 중단점 |
| Ctrl+Shift+P / F1 | 명령 팔레트 |
| Ctrl+P | 파일로 이동 (`:줄`로 줄 이동) |
| Ctrl+B / Ctrl+J / Ctrl+Alt+B | 사이드바 / 하단 패널 / 속성 패널 표시 전환 |
| Ctrl+Shift+E · A · X · O · D · K | 탐색기 · 부품 · 예제 · 보드/핀 · 실행 및 디버그 · 장치 Docs |
| Ctrl+, / Ctrl+K Ctrl+S | 설정 창 / 설정 창의 단축키 (편집 메뉴) |
| Ctrl+Shift+M / Ctrl+Shift+U / Ctrl+` | 문제 / 출력 / 터미널 |
| Ctrl+Shift+B | 빌드 |
| Ctrl+S / Ctrl+Z / Ctrl+Y | 저장 / 되돌리기 / 다시 실행 |
| Ctrl+F / Ctrl+R (Ctrl+H) | 코드 찾기 / 바꾸기. 편집기 안의 F3·Shift+F3도 같은 찾기 막대를 연다 |
| Alt+Shift+F | 코드 정렬 (편집 → 코드 정렬, 선택 영역 코드 정렬) |
| W / V / R / Delete (회로) | 배선 / 선택 / 45° 회전 / 삭제 |

## 회로 키보드 조작

회로 작업 공간에 Tab으로 들어간 뒤 PageDown/PageUp으로 보드·빵판·부품·배선·선택한 배선의 꺾임점을 탐색한다. Enter로 선택하고 방향키로14단위, Shift+방향키로70단위 이동한다. P로 해당 장치의 핀 탐색을 시작하고 방향키로 다음 접점을 찾은 뒤 Enter로 배선을 시작하거나 끝낸다.

선택한 배선에서 Insert로 경유점을 추가한다. 경유점에 초점이 있을 때 Delete는 그 점만 지운다. 실행 중 USER/푸시버튼은 Space를 누르는 동안 연결되고, 슬라이드 스위치는 Space로 전환하며 RESET은 Space로 재시작한다. 기존 Esc는 작성 중 배선을 취소하고, 작성 중인 배선이 없으면 선택한 객체를 삭제한다. 삭제·이동은 Ctrl+Z로 되돌릴 수 있다.

## 저장·복구

폴더 저장은 회로 파일과 main.c/보조 소스를 하나의 복구 가능한 작업으로 처리한다. 파일 교체에 실패하면 이전 내용으로 복원하고 다시 저장할 수 있다. 저장 도중 프로세스가 종료되면 다음에 폴더를 열 때 미완료 저장 기록을 복구한다. 외부 편집과 충돌하면 그 파일을 덮어쓰지 않고 오류와 복구 기록을 남긴다.

저장 직후 또는 저장 중에 다시 편집한 내용은 미저장으로 유지한다. 정상 창 종료 직전에는 자동 저장 대기 중인 최신 초안을 기록한다. 초안 기록에 실패하고 미저장 내용이 있으면 창을 닫지 않는다. 새 프로젝트나 다른 폴더로 이동하면 터미널도 이전 폴더 문맥을 해제한다. 정상 종료의 초안 복원은 강제 전원 차단이나 디스크 고장을 보장하는 기능이 아니다.

## Pinout의 Clock 탭 (1.26.0, CubeMX Clock Configuration)

Pinout & Configuration 오른쪽의 **Clock** 탭에서 CubeMX Clock Configuration처럼 클록을 정한다.

1. **클록 트리 사용**을 켠다. 지금 프로젝트의 APB1 타이머 클록에 맞는 HSI 설정으로 시작한다.
2. 원본과 PLL을 고른다.
   - **System Clock Mux**: HSI / HSE / PLLCLK.
   - **PLL Source**: F103RB는 HSI/2 또는 HSE.
   - F446RE는 PLLM·PLLN·PLLP·PLLQ, F103RB는 HSE Prediv·PLLMul을 정한다.
3. **AHB·APB1·APB2·ADC Prescaler**를 고른다.
4. 아래 표에서 SYSCLK, HCLK, APB1/APB2와 그 타이머 클록, ADC 클록, Flash latency를 확인한다. 한계를 넘은 값은 빨간 줄로 표시되고, 아래 오류에도 이유가 나온다.

- **HSE**는 NUCLEO의 ST-LINK가 주는 8 MHz(BYPASS)다. 보드 X3에는 기본으로 수정이 없다.
- 버튼:
  - **NUCLEO 보드 기본**: CubeMX의 보드 기본값. F446RE는 HSI PLL 84 MHz, F103RB는 HSI/2 PLL 64 MHz.
  - **최대**: F446RE HSE PLL 180 MHz(APB1 45, APB2 90 MHz, Over-drive), F103RB HSE PLL 72 MHz.
- 트리를 쓰면 생성 코드의 `SystemClock_Config`와 ADC 분주가 이 설정을 따른다. 핀 설정 탭의 **APB1 타이머 입력 클록** 칸은 계산값만 보여 준다. 끄면 예전처럼 그 칸 하나(HSI)로 정한다.
- `.ioc`를 가져오면 CubeMX의 클록 설정(HSE, 72 MHz, 180 MHz 포함)이 그대로 들어온다.
- 180 MHz처럼 빠른 클록은 에뮬레이터가 실시간보다 느리게 실행될 수 있다(상태 표시의 실시간 비율).
- **ADC1 Sampling Time**(ADC1 카드): Rank 1의 샘플링 시간을 고른다. 아래에 한 번 변환에 걸리는 시간이 보인다. 앱 기본값은 가장 긴 시간(F446RE 480, F103RB 239.5 Cycles)이다. CubeMX 기본은 가장 짧은 시간이다.

## Pinout의 USART · SPI 설정 (1.23.0)

- **USART(비동기) Parameter Settings**: Word Length(8/9비트, 패리티 포함), Parity(None/Even/Odd), Stop Bits(1/2), Data Direction(송수신/송신만/수신만), Over Sampling(16/8 — F103RB는 16만). 생성 코드의 `huartN.Init`과 .ioc 가져오기에 반영된다. ARM GCC 시뮬레이터(기본)에서 그대로 동작하고, 내장 해석기는 8N1만 지원한다. 직렬 모니터의 ST-LINK VCP는 같은 형식으로 받는다(실물 PC 터미널을 같은 형식으로 맞춘 것과 같다). 외부 UART 부품은 8N1이다.
- **SPI1 Parameter Settings**: Clock Polarity(CPOL)·Clock Phase(CPHA)로 SPI mode 0~3, Data Size 8/16비트, First Bit(MSB/LSB). 카드에 SPI mode 번호가 보인다. 로직 분석기의 SPI 해석도 이 설정을 따른다.
- **TIM PWM 채널별 설정(1.24.0)**: PWM 모드 타이머 카드에 채널 핀마다 PWM Generation CHn이 생긴다. Pulse, Mode(PWM mode 1/2), CH Polarity(High/Low)를 채널마다 정하고, 출력이 High인 비율을 보여 준다. 생성 코드는 채널마다 설정을 다시 쓴 뒤 `HAL_TIM_PWM_ConfigChannel`을 부른다. 내장 해석기는 PWM mode 1·High만 지원한다.
- **TIM 출력 비교·Counter Mode(1.27.0)**: 동작 모드에서 **출력 비교 (Output Compare)**를 고르면 채널 핀마다 Output Compare CHn 칸이 생긴다. Mode(Frozen, Active/Inactive Level on match, Toggle on match, Forced Active/Inactive), Pulse, CH Polarity를 정하면 아래에 핀이 어떻게 바뀌는지 나온다(예: "CCR 일치 2 Hz · 핀 토글 → 1 Hz 사각파"). Frozen은 핀을 바꾸지 않고 인터럽트로만 쓴다. NVIC를 켜면 생성 코드가 `HAL_TIM_OC_Start_IT`와 `HAL_TIM_OC_DelayElapsedCallback`을 넣는다. 엔코더가 아닌 타이머에는 **Counter Mode**(Up, Down, Center Aligned mode1~3)가 있다. 중앙 정렬은 0 → ARR → 0으로 세어 PWM 주파수가 타이머 클록 / 2·ARR이 된다.
- **실제 CubeMX .ioc 가져오기(1.43.0)**: CubeMX 4.8~6.18이 저장한 `.ioc` 190개로 확인했다. 보드 템플릿으로 만든 프로젝트(핀 이름 `PC13-TAMPER-RTC`, 라벨 `B1 [Blue PushButton]`, SWD·오실레이터 핀)는 경고 없이 읽힌다. 모델에 없는 것은 이유와 함께 빼고 나머지로 바로 코드를 생성한다: 가져오지 않은 주변장치의 인터럽트·DMA, 중복 라벨, ADC 내부 채널(온도 센서·VREFINT), 8 MHz가 아닌 크리스털 보드의 클록 트리(보드 기본 클록 사용). `LCD-D4` 같은 라벨은 CubeMX의 매크로 이름처럼 `LCD_D4`로 읽는다. F446의 TIM9~14, ADC2·ADC3, CAN, USB, FreeRTOS는 가져오지 않는다.
- **SPI Transmit Only Master(1.43.0)**: Pinout의 SPI **Mode**에서 고르면 MISO 핀 없이 SCK·MOSI만으로 설정이 완성된다(디스플레이·DAC·시프트 레지스터). `.ioc`의 송신 전용 설정도 이 모드로 가져오고, 반이중(1선)은 송신 전용으로 가져오며 알려 준다.
- **.ioc로 내보내기(1.36.0)**: Pinout의 **.ioc로 내보내기**가 적용된 핀·주변장치·DMA·NVIC·클록 설정을 STM32CubeMX의 `.ioc` 파일로 저장한다(열려 있는 초안이 아니라 "설정 적용"된 내용). 그 파일을 이 앱에서 다시 가져오면 같은 설정이 된다. CubeMX에서 여는 것은 아직 확인하지 못했으니, CubeMX에서 열었을 때 다른 점이 있으면 알려 주면 맞춘다.
- **내장 해석기가 실행하는 C 문법(1.40.0 추가)**: 2차원 배열(`static const uint8_t font[][5] = { {…}, {…} };`, `char names[3][8]`, 행을 `uint8_t *`로 넘기기, `int m[][3]` 매개변수), 지정 초기화(`{ .pin = GPIO_PIN_5, .name = "LD2" }`, `{ [BLUE] = "blue" }`), 함수 포인터(`void (*const table[])(void) = { a, b };`, 콜백 매개변수, `typedef void (*Handler)(int);`, 구조체 필드 `cmd.run()`). union은 1.42.0부터 실행된다(`typedef union { uint32_t w; uint8_t b[4]; } U;`, 멤버는 숫자형과 그 배열). 이제 내장 해석기에서 실행되지 않는 문법은 goto, 3차원 이상 배열, `uint64_t`, 레지스터 직접 접근, 구조체 안에 직접 쓴 이름 없는 union이다(ARM GCC 시뮬레이터로 실행).
- **내장 해석기의 HAL 조회 함수(1.39.0 추가)**: `SystemCoreClock`, `HAL_RCC_GetHCLKFreq`·`HAL_RCC_GetSysClockFreq`·`HAL_RCC_GetPCLK2Freq`, `HAL_GetTickFreq`, `assert_param`, `HAL_GetUIDw0`~`2`·`HAL_GetDEVID`, `HAL_UART_GetState`·`HAL_ADC_GetState`, `HAL_I2C_IsDeviceReady`(I2C 주소 스캔), `__WFI()`·`HAL_PWR_EnterSLEEPMode`(다음 틱까지 멈춤). 타이머 Update 플래그는 1.41.0부터 폴링할 수 있다(`__HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE)`, `__HAL_TIM_CLEAR_FLAG`, `__HAL_TIM_CLEAR_IT`). 그 밖의 플래그 매크로(`TIM_FLAG_CC1`, `__HAL_UART_GET_FLAG` 등)는 내장 해석기에서 실행되지 않으니 ARM GCC 시뮬레이터를 쓴다.
- **내장 해석기의 문자열·메모리 함수(1.38.0 추가)**: `strchr`·`strrchr`·`strstr`, `strtol`·`strtoul`·`atof`, `<ctype.h>`(`isdigit`·`isalpha`·`isspace`·`toupper`·`tolower` 등), `putchar`, printf의 `%e`·`%g`·`%zu`·`%lld`. `memset`·`memcpy`·`memcmp`는 C처럼 바이트 수로 센다: `memset(buf16, 0, sizeof(buf16))`, `memset(&cfg, 0, sizeof(cfg))`, `memcpy(&copy, &orig, sizeof(copy))`, 수신 바이트를 값으로 옮기는 `memcpy(&value, rx, 4)`(리틀 엔디언). `sscanf`는 `%d`·`%i`·`%u`·`%x`·`%f`·`%s`·`%c`와 폭·`%*`를 읽는다. 구조체의 memset은 0으로 채우는 것만 된다.
- **내장 해석기가 실행하는 C 문법(1.37.0 추가)**: 쉼표 연산자(`for (i = 0, j = n; i < j; i++, j--)`), `#if MODE == 2`·`#if defined(A) && !defined(B)`·`#elif`, 구조체 필드 다중 선언(`int x, y;`)과 포인터 필드(`const char *name;`), `GPIO_TypeDef *`를 변수·표(`GPIO_TypeDef *const ports[] = {GPIOA, GPIOB};`)·매개변수·구조체 필드로 쓰기, `static inline`, `do { … } while (0)` 매크로와 `\`로 이어 쓴 매크로, `<stdlib.h>`의 `atoi`·`rand`·`srand`, `__HAL_GPIO_EXTI_GET_IT`·`__HAL_GPIO_EXTI_CLEAR_IT`. `GPIOA->ODR` 같은 레지스터 직접 접근과 `uint64_t`는 내장 해석기에서 실행되지 않으며(이유를 알려 주는 오류가 난다) ARM GCC 시뮬레이터를 쓴다.
- **소스 이름(1.37.0)**: `main.c`와 대소문자만 다른 이름(`Main.c`), 이미 있는 이름과 대소문자만 다른 이름, 다른 소스의 폴더 이름과 같은 파일 이름은 추가·이름 변경·끌어다 놓기·가져오기에서 받지 않는다(놓기와 가져오기는 그 파일만 빼고 알려 준다). 같은 이름의 헤더가 여러 폴더에 있을 때 이름 변경은 그 파일을 가리키는 `#include`만 바꾼다.
- **내장 해석기가 실행하는 C 문법(1.36.0 추가)**: `typedef struct { … } Name;`, 함수형 매크로(`#define MAX(a, b) ((a) > (b) ? (a) : (b))`), `<math.h>`의 `sqrtf`·`fabsf`·`atan2f` 같은 실수형과 `fabs`·`fmod`·`atan2`·`exp`·`log10`. 다차원 배열·union·goto·함수 포인터·지정 초기화는 내장 해석기에서 실행되지 않으므로 ARM GCC 시뮬레이터를 쓴다.
- **CubeIDE 프로젝트 폴더 그대로(1.35.0)**: "Cube 프로젝트 폴더 가져오기"가 프로젝트의 `.c/.h`를 폴더와 함께 읽는다(Core/Src, Core/Inc, 직접 만든 폴더. Drivers·Middlewares·Debug 같은 SDK·빌드 폴더는 제외). 소스 파일 목록에 이름과 폴더가 함께 보이고, 파일 추가·이름 변경에서 `Core/Src/app.c`처럼 폴더를 쓸 수 있다. `#include "app.h"`는 어느 폴더에 있든 찾는다(같은 폴더 → 경로 → 이름 순). 한도는 보조 소스 120개, 합계 1 MB.
- **끌어다 놓기(1.35.0)**: 탐색기에서 파일이나 폴더를 창에 놓는다. `.c/.h/.cpp/.hpp`는 소스에 추가되고(같은 이름은 놓은 내용으로 바뀜), `.ioc`나 `main.c`가 들어 있으면 프로젝트 가져오기, `.stm32lab`은 열기다. 실행 중에는 받지 않는다. Ctrl+Z로 되돌린다.
- **프로젝트 구조 (CubeIDE)(1.44.0)**: 탐색기 아래쪽의 **프로젝트 구조 (CubeIDE)**를 펼치면 CubeIDE 프로젝트와 같은 폴더 트리가 보인다: `<이름>.ioc`, `Core/Inc`(main.h, hal_conf.h), `Core/Src`(main.c, stm32xxxx_it.c, syscalls.c, sysmem.c, system_stm32xxxx.c), `Core/Startup`(startup_….s), `Drivers`(CMSIS, HAL 드라이버), 링커 스크립트(`STM32…_FLASH.ld`). 곧은 글씨는 프로젝트 파일이고 기울인 글씨는 빌드가 넣는 파일이다. 기울인 파일을 열면 읽기 전용으로 보이고, **프로젝트로 복사해 수정**을 누르면 그 자리의 프로젝트 파일이 되어 고칠 수 있으며 ARM 빌드가 그 파일을 쓴다(시작 코드와 링커 스크립트도 된다). 복사한 파일은 앱이 다시 만들지 않으므로, 지우면 원래 파일로 돌아간다. `.ioc`는 현재 Pinout 설정을 보여 주기만 하며 Pinout에서 바꾼다.
- **편집기 탭 닫기(1.47.0)**: 탭에 마우스를 올리면 ×가 보인다. 탭을 우클릭하면 닫기 · 다른 탭 닫기 · 오른쪽 탭 닫기 · 모두 닫기(Ctrl+K W)가 나오고, 탭 줄 끝의 ⋯에도 모두 닫기가 있다. 닫은 파일은 탐색기에서 누르면 다시 열린다. 탭을 닫아도 파일은 프로젝트에 그대로 있다.
- **탐색기 트리(1.47.0)**: "소스 파일"은 폴더 트리다(폴더를 눌러 접고 편다). 트리는 깊이마다 같은 간격으로 들여 쓴다.
- **구조체 멤버 자동완성(1.46.4)**: 변수 뒤에 `.`이나 `->`를 치면 그 구조체의 멤버가 나온다(`hadc1.Init.Resolution`, `GPIO_InitStruct.Pull`, 프로젝트에서 정의한 struct). clangd를 켠 실보드 대상에서는 clangd가 대신 답한다.
- **버튼 채터링(1.45.0)**: 하단 **파형** 탭의 **버튼 채터링**에서 2·5·10·20 ms를 고르면, 실행 중 버튼(보드의 B1·SW1, 회로의 푸시 버튼)을 누르고 뗄 때 그 시간 동안 접점이 1 ms 간격으로 붙었다 떨어졌다 한다. 디바운스 없이 "눌릴 때마다 LED 토글"을 하면 한 번 눌러도 여러 번 바뀌는 것을 볼 수 있고, 누른 뒤와 뗀 뒤에 20~100 ms씩 기다리면 한 번이 된다. 기본은 없음(깨끗한 접점)이며 프로젝트에 저장된다. 1.46.2부터 2 ms도 흔들린다(2번 뒤집힘).
- **RA6E1 새 프로젝트 템플릿과 강의 예제(1.45.0)**: 새 프로젝트 창에서 보드를 **FPB-RA6E1**로 고르면 시작 템플릿이 **Bare Metal - Minimal**(빈 `hal_entry`)·**Bare Metal - Blinky**(LED1·LED2 깜빡이기)와 FSP 예제로 바뀐다. 예제에 강의 실습이 들어 있다: S1 폴링으로 LED1 토글(`R_IOPORT_PinRead`, 디바운스), S1 인터럽트(Rising·`irq_callback`)로 LED2 토글, 도전 과제(아두이노 헤더의 외부 LED 4개와 스위치 2개).
- **FPB-RA6E1 프로젝트 구조와 Developer Assistance(1.46.0)**: 탐색기의 **프로젝트 구조 (e² studio)**는 `src/hal_entry.c`(수정하는 파일), `ra_gen`(main.c·hal_data·pin_data·vector_data), `ra_cfg/fsp_cfg`(bsp_pin_cfg.h 등), `script`, `ra`(이 프로젝트의 Stack이 쓰는 FSP 소스와 보드 파일)를 보여 준다. hal_entry.c 말고는 읽기 전용으로 열린다. 그 아래 **Developer Assistance**는 Stack마다 `Call R_…()`과 콜백 정의를 나열한다. 항목을 누르면 편집 중인 소스의 커서 자리에 들어가고, 편집기로 끌어 놓아도 된다.
- **RASC 이름·흐름(1.46.0)**: RA Configuration의 **Summary**는 보드·장치·클록·Stack 목록, **BSP**는 Main stack size·Heap size(8의 배수, `bsp_cfg.h`에 반영)다. **Pins**의 Mode는 Disabled · Output mode · Input mode · IRQn(-DS) · Analog mode이고 풀업은 Pull up/down의 None · input pull-up이다. 외부 인터럽트는 **Stacks**의 New Stack → Input → External IRQ로 넣고, Properties에서 Channel · Pin · Trigger · Digital Filtering · Callback · Pin Interrupt Priority · Pin Input Pull-up을 정한다(인터럽트 핀의 풀업은 Pins가 아니라 여기서 고른다). IRQ1과 IRQ1-DS처럼 같은 채널의 두 핀은 함께 쓸 수 없다.
- **부품 더블클릭(1.44.0)**: 회로의 부품이나 보드를 두 번 누르면 속성 패널이 열린다(닫아 두었어도 열린다).
- **읽기 전용 파일을 프로젝트로 복사해 수정(1.35.0)**: 앱이 빌드에 넣는 `stm32xxxx_it.c`·`syscalls.c`·`sysmem.c`나 SDK 소스·헤더를 열면 경로 줄에 **프로젝트로 복사해 수정**이 있다. 누르면 같은 경로의 프로젝트 파일이 되어 자유롭게 고칠 수 있고, ARM 빌드는 그 파일을 쓴다(지우면 원래 파일로 돌아간다). 내장 해석기는 SDK 소스 복사본을 실행에 쓰지 않는다(HAL을 API 수준으로 실행).
- **핀 설정으로 회로 만들기(1.35.0)**: 회로가 없는 프로젝트에 `.ioc`를 가져오면 핀 기능과 라벨로 고른 부품 목록이 뜬다(출력 → LED와 330 Ω, 입력 → 버튼, ADC → 가변저항, PWM → LED, I2C·SPI·UART → 모듈). 필요한 것만 남기고 **회로 만들기**를 누르면 빵판에 놓고 배선한다. 보드의 LD2·B1·ST-LINK 핀과 CS·DC·RST 같은 제어 핀은 부품을 만들지 않고 이유를 보여 준다. Pinout의 **핀 설정으로 회로 만들기**로 언제든 다시 만들 수 있다(기존 회로는 바뀜, Ctrl+Z). 부품은 초안이므로 실제 장치에 맞게 바꾼다.
- **ADC 다채널·외부 트리거(1.34.0)**: ADC1 카드의 **Number Of Conversion**을 2 이상으로 하면 Scan 변환이 되고 **Rank**마다 채널을 고른다(ADC 핀으로 잡은 채널 중에서). 한 번 시작하면 Rank 순서대로 변환한다. **External Trigger Conversion Source**에서 타이머 TRGO(F446RE: Timer 2·3·8, F103RB: Timer 3)를 고르면 소프트웨어 시작 대신 그 타이머의 갱신마다 변환이 시작된다. 그 타이머를 켜고 Trigger Event Selection을 Update Event로 둬야 하며(아니면 문제 목록에 표시), `HAL_ADC_Start_IT`로 시작해 `HAL_ADC_ConvCpltCallback`에서 값을 읽는다.
- **타이머 TRGO·One Pulse(1.34.0)**: 모든 타이머 카드에 **Trigger Event Selection (TRGO)**과 **One Pulse Mode**가 있다. One Pulse를 켜면 시작 뒤 다음 갱신에서 인터럽트를 한 번 내고 카운터가 멈춘다. 다시 `HAL_TIM_Base_Start_IT`를 부르면 한 번 더 돈다.
- **NRST 리셋 핀(1.34.0)**: 보드의 RESET(NRST) 핀에 버튼을 달아 GND로 당기면 MCU가 리셋되어 프로그램이 처음부터 다시 실행된다(출력 탭 `[NRST]`). 다시 시작한 프로그램에서 `__HAL_RCC_GET_FLAG(RCC_FLAG_PINRST)`가 1이다.
- **ARM GCC 시뮬레이터의 오류 안내(1.34.0)**: 시뮬레이터에 없는 주변장치(USB, SAI, QUADSPI 등)의 레지스터에 접근하면 "USB_OTG_FS: 이 시뮬레이터에 없는 주변장치"처럼 이름을 알려 준다. NUCLEO-F103RB는 실제 메모리 크기(플래시 128 KB, RAM 20 KB)를 넘는 접근이 오류가 된다.
- **다시 생성해도 사용자 코드 유지(1.33.0)**: "설정으로 HAL 코드 생성"이나 .ioc 가져오기로 main.c를 다시 만들 때 USER CODE 구역 안의 코드는 그대로이고, 구역 밖에 직접 넣은 함수·전역 변수·`#include`도 지워지지 않는다. `#include`는 `Includes`, main 앞의 선언은 `PV`, main 앞의 함수는 `0`, main 뒤의 코드는 `4` 구역으로 옮겨지고 출력 탭에 옮긴 이름이 나온다. 생성기가 만드는 함수(MX_*_Init, SystemClock_Config 등)를 구역 밖에서 고친 것은 CubeMX처럼 새로 생성된다. 예제는 보조 함수를 처음부터 구역 안에 둔다.
- **TIM1·TIM8 고급 타이머(1.33.0)**: Timers에 **TIM1**(두 보드)과 **TIM8**(NUCLEO-F446RE)이 있다. CH1~CH4 외에 상보 출력 **CH1N~CH3N** 핀을 고를 수 있고(PWM·출력 비교 모드), 카드에 **Repetition Counter**(갱신 인터럽트가 그 값 + 1 주기마다)와 **Dead Time**(DTG 0~255)이 있다. 인터럽트는 갱신(`TIM1_UP_TIM10_IRQn`, F103은 `TIM1_UP_IRQn`, `TIM8_UP_TIM13_IRQn`)과 캡처/비교(`TIM1_CC_IRQn`, `TIM8_CC_IRQn`)로 나뉜다. 상보 출력은 `HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1)`로 시작한다. 내장 해석기는 상보 출력을 채널 PWM의 반전으로 그리며 데드타임 구간과 Break 입력은 ARM GCC 시뮬레이터에서 확인한다.
- **I2C2·SPI2, I2C3·SPI3(1.32.0)**: Connectivity에 **I2C2**·**SPI2**(두 보드)와 **I2C3**·**SPI3**(NUCLEO-F446RE)가 있다. 카드마다 Clock과 매개변수(I2C: 주소·Duty·No Stretch, SPI: CPOL·CPHA·Data Size·First Bit)를 따로 정하고, 핀은 핀을 눌러 고른다. F446RE: I2C2 SCL PB10 / SDA PB3·PC12, I2C3 SCL PA8 / SDA PC9·PB4, SPI2 SCK PB13·PB10·PC7·PA9 / MISO PB14·PC2 / MOSI PB15·PC3·PC1, SPI3 SCK PC10·PB3 / MISO PC11·PB4 / MOSI PC12·PB5·PB0·PB2·PC1. F103RB: I2C2 PB10/PB11, SPI2 PB13/PB14/PB15. 생성 코드의 핸들은 `hi2c2`·`hspi2`처럼 번호를 따른다. 내장 해석기의 I2C 슬레이브와 SD 카드 SPI 모드는 I2C1·SPI1만 지원한다.
- **IWDG·WWDG 워치독(1.31.0, 두 보드)**: System Core의 **IWDG**를 켜면 Prescaler(4~256)와 Reload(0~4095)를 정하고, 카드가 타임아웃(LSI 32 kHz, F103은 40 kHz 기준)을 보여 준다. `HAL_IWDG_Init` 뒤 그 시간 안에 `HAL_IWDG_Refresh(&hiwdg)`를 부르지 않으면 리셋되어 프로그램이 처음부터 다시 실행된다. **WWDG**는 Prescaler(1~8)·Window·Counter(64~127)·Early wakeup interrupt를 정한다. 카운터가 Window보다 클 때 `HAL_WWDG_Refresh`를 부르면 바로 리셋, 카운터가 0x40 아래로 내려가도 리셋이다. Early wakeup을 켜면 NVIC `WWDG_IRQn`이 함께 켜지고 생성 코드의 `HAL_WWDG_EarlyWakeupCallback`이 0x40에서 갱신한다. 다시 시작한 프로그램은 `__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)`(`WWDGRST`·`SFTRST`·`PORRST`·`PINRST`)로 원인을 읽고 `__HAL_RCC_CLEAR_RESET_FLAGS()`로 지운다. 출력 탭에 `[IWDG]`·`[WWDG]` 리셋 안내가 나온다.
- **DAC(1.30.0, NUCLEO-F446RE)**: Analog의 **DAC**를 켜고 OUT1(PA4)·OUT2(PA5)를 체크하면 핀이 아날로그로 바뀐다. 채널마다 Trigger, Output Buffer, Wave generation(Noise·Triangle, 트리거가 있을 때)과 진폭을 고른다. 출력 전압은 값/4095 × 3.3 V다. 트리거가 None이면 `HAL_DAC_SetValue`가 바로 나오고, TIMx TRGO 트리거는 그 타이머의 Trigger Event Selection을 Update Event로 둬야 갱신마다 나온다. 표(예: 사인파)를 내보내려면 DMA 탭에 DAC1(DMA1 Stream5)·DAC2(Stream6)를 Circular로 추가하고 `HAL_DAC_Start_DMA(&hdac, DAC_CHANNEL_1, (uint32_t *)표, 길이, DAC_ALIGN_12B_R)` 뒤 타이머를 시작한다. 내장 해석기는 DAC 갱신을 5 kHz까지 따라가고, 더 빠르면 ARM GCC 시뮬레이터(펌웨어 에뮬레이터)로 실행한다. PA5에는 NUCLEO의 녹색 LED(LD2)가 달려 있어 OUT2 전압에 따라 LED가 밝아진다. NUCLEO-F103RB에는 DAC가 없다.
- **RTC(1.29.0, 두 보드)**: Timers의 **RTC**를 켜면 카드에서 클록 원본(LSE 32.768 kHz 크리스털 — NUCLEO의 X2, 또는 LSI), 달력 시각·날짜, 알람 A, WakeUp 타이머(F446RE), Hour Format(F446RE)을 정한다. 알람 인터럽트는 NVIC Settings의 `RTC_Alarm_IRQn`(EXTI 17), WakeUp은 `RTC_WKUP_IRQn`(EXTI 22), F103RB의 초 인터럽트(`HAL_RTCEx_SetSecond_IT`)는 `RTC_IRQn`이다. 생성 코드는 CubeMX처럼 `MX_RTC_Init`에 BCD 값(`sTime.Hours = 0x23;`)과 `RTC_FORMAT_BCD`를 쓰고, 켠 인터럽트의 핸들러와 `HAL_RTC_AlarmAEventCallback`·`HAL_RTCEx_WakeUpTimerEventCallback`을 넣는다. F446RE 알람은 날짜/요일·시·분·초를 각각 마스크로 무시할 수 있고(예: 날짜를 마스크하면 매일 같은 시각), F103RB 알람은 시·분·초가 같을 때 한 번이다. F103RB의 RTC는 초 카운터라 날짜를 HAL이 핸들에 보관하므로 `HAL_RTC_GetTime`을 하루에 한 번 이상 불러야 날짜가 넘어가고, 요일은 HAL이 날짜로 계산한다(일요일 0). STM32F1 HAL은 `RTC_FORMAT_BIN`으로 10~12월 상수(`RTC_MONTH_OCTOBER` = 0x10)를 그대로 저장해 날짜가 멈추므로 BCD 형식이나 10~12를 쓴다(내장 해석기는 이 경우 오류로 알린다).
- **TIM6·TIM7 기본 타이머(1.28.0, NUCLEO-F446RE)**: 채널·핀이 없는 Up 카운터다. 카드에는 동작 모드·Counter Mode 대신 Prescaler·Period와 **Trigger Event Selection (TRGO)**(Reset, Enable, Update Event)만 있다. 주기 인터럽트는 NVIC Settings에서 켠다. TIM6의 인터럽트 이름은 CubeMX처럼 `TIM6_DAC_IRQn`(핸들러 `TIM6_DAC_IRQHandler`)이고 TIM7은 `TIM7_IRQn`이다. 생성 코드는 `HAL_TIMEx_MasterConfigSynchronization`으로 TRGO를 정한다. TRGO는 DAC·ADC 변환을 시작하는 신호인데, 이 시뮬레이터에는 아직 그것을 받는 DAC가 없다. NUCLEO-F103RB(STM32F103RB)에는 TIM6·TIM7이 없다.
- **I2C1 Parameter Settings(1.24.0)**: Primary Address(슬레이브로 쓸 때의 7비트 주소, 코드에는 `OwnAddress1 = 주소 << 1`), Fast Mode Duty Cycle(100 kHz보다 빠를 때 2 또는 16/9), Clock No Stretch Mode.

## 코드 초기화

**HAL 코드 생성**(Pinout & Configuration)은 핀·주변장치를 바꾼 뒤 main.c를 다시 만들 때 CubeMX처럼 `/* USER CODE BEGIN … */`~`/* USER CODE END … */` 사이의 코드를 그대로 옮긴다(1.13.0). 생성되는 구간은 `Includes`(헤더), `PV`(전역 변수), `0`(main 앞 함수), `2`(초기화 뒤), `3`(while 안), `4`(파일 끝 함수)와 콜백 본문(`EXTI_Callback`, `UART_RxCplt`, `TIM_PeriodElapsed`, `TIM_IC_Capture`)이다. 새 코드에 없어진 구간(꺼진 주변장치의 콜백 등)은 버리지 않고 `#if 0`으로 감싸 구간 4 끝에 보관하며, 사용자가 손대지 않은 구간은 새 설정에 맞는 기본 코드로 바뀐다. 구간 밖의 코드는 새로 만든다.

코드 패널의 **코드 도구 → 코드 초기화**를 누르면 확인창을 표시한다. 확인하면 `main.c`의 작성 코드·Docs 예제를 지우고 현재 Pinout 설정의 GPIO·주변 장치 초기화만 남긴다. 자동 점멸, PWM 시작, UART 예제 송신은 넣지 않는다. 핀 라벨은 설정에 보존하지만 사용하지 않는 `LD2_Pin`·`LD2_GPIO_Port` 같은 별칭 매크로는 생성하지 않는다. `stdio.h`, 출력 보조 함수, 빈 콜백, 임의의 지연도 넣지 않는다. 활성 핀·인터럽트가 없으면 빈 GPIO 초기화 함수까지 생략한다. HAL/시스템 클록, 활성 주변장치의 핸들·초기화, 사용 중인 오류 처리는 유지한다. 회로·배선·핀 설정·다른 소스 파일은 유지한다. 보조 파일을 보고 있어도 초기화 대상은 main이다.

**편집 → 보드 구성 초기화**(1.18.3부터 main.c 포함)는 보드·빵판·부품·배선을 지우고 핀·주변장치 설정을 보드 기본값으로 되돌린 뒤, main.c도 그 기본 설정에 대한 코드 초기화 결과(HAL_Init·SystemClock_Config만 있는 main)로 바꾼다. 직접 추가한 다른 소스 파일은 유지하고, Ctrl+Z/상단 되돌리기 한 번으로 회로·핀 설정·코드가 함께 돌아온다.

스케치 모드는 빈 setup/loop, Windows C/C++ 대상은 기본 main으로 돌아간다. 취소 또는 Esc는 변경하지 않으며, 적용 후 Ctrl+Z/상단 되돌리기로 이전 코드를 복구할 수 있다. 실행·일시정지·네이티브 빌드/디버그 중에는 사용할 수 없다. main 중단점과 기존 Docs 적용 기록은 지우므로, 다음 Docs 적용은 선택한 장치 예제만 넣는다. 초기화 사실과 회로 스냅샷은 로컬 진단에 기록한다.

## 버전 정보

**도움말 → 업데이트 로그**(1.13.0)는 IDE 위에 떠 있는 창을 연다(제목을 끌어 옮기고 ×나 Esc로 닫는다). 버전마다 업데이트 일자와 버전, 그 아래 바뀐 기능을 개조식으로 보여 주며 최신 버전이 맨 위에 온다. 위 검색 칸에 버전(`1.12`), 날짜(`2026-11-04`), 기능 낱말을 넣으면 맞는 버전과 항목만 남고 찾은 글자를 강조한다. 한 페이지에 5개씩 보이고 아래 페이지 단추로 넘긴다.

**도움말 → 버전 정보 · 업데이트 상태**는 메뉴에 현재 버전(예: `v1.2.3`)을 표시하고, 새 버전이 받아지고 있거나 준비되면 `→ v새 버전`도 함께 보여 준다. 누르면 현재 버전·최신 버전·업데이트 상태·마지막 확인 시각과 업데이트 확인·다운로드·저장 후 재시작 버튼이 있는 창이 열린다. 개발 실행(`npm start`)에서는 상태가 "자동 업데이트를 쓸 수 없는 실행 방식"으로 표시된다.

## 부품 추가

부품 목록의 카드를 누르면 그 부품이 보이는 작업 공간 가운데에 바로 놓인다(이미 부품이 있으면 그 둘레의 빈 자리). 저항·LED 같은 2핀 부품도 구멍 두 개를 고르는 단계 없이 같은 방식이며, 놓인 부품을 끌어 빵판에 꽂는다.

## 부품 검색 미리보기

기존 부품 검색 목록의 작은 이미지에서 장치 외형을 확인한다. 카드에 마우스를 올리거나 키보드로 초점을 옮기면 실제 회로와 같은 모형의 확대 이미지, 부품 이름(예: "NTC 온도 센서"), 데이터시트의 상세 모델명(예: "KY-013"), 핀 수와 인터페이스를 표시한다. 이름은 부품 종류를 나타내는 일반 이름이고 모델명은 그 아래 한 줄에 따로 보여 준다. 옛 이름이나 모델명으로도 검색된다. 보드·빵판, 기존34종과 조사 자료의 변형78종을 합한114개 메뉴 항목에 적용된다. 확대 이미지는 검색 패널 밖에 표시되며 화면 가장자리를 넘지 않는다. Esc, 목록 클릭, 검색 변경 또는 스크롤로 닫힌다. 미리보기가 열린 상태의 Esc는 회로 부품을 삭제하지 않는다. 기존 추가 방식과 검색 조건은 유지한다.

## 정의로 이동과 코드 개요 (1.17.0)

CubeIDE처럼 편집기에서 함수·매크로·타입·변수 이름을 **Ctrl+클릭**하거나 커서를 두고 **F12**(정의로 이동), **Alt+F12**(정의 미리보기)를 누르면 정의로 이동한다. Ctrl을 누른 채 이름 위에 마우스를 올리면 링크처럼 밑줄이 생긴다.

- 프로젝트 파일(main.c와 추가 소스)에 정의가 있으면 그 파일·줄로 간다. 예: `MX_GPIO_Init`, `huart2`, 직접 쓴 `USART2_IRQHandler`.
- `HAL_UART_IRQHandler`, `HAL_Init`, `UART_HandleTypeDef`, `USART2_IRQn`, `__HAL_RCC_GPIOA_CLK_ENABLE`처럼 정의가 STM32Cube SDK에 있으면 보드에 맞는 SDK(NUCLEO-F446RE: STM32CubeF4, NUCLEO-F103RB: STM32CubeF1)의 원본 파일을 **읽기 전용 탭**으로 연다. 탭 이름은 기울임꼴이고 ×로 닫는다. 편집기 위에는 `STM32CubeF1 › Drivers › STM32F1xx_HAL_Driver › Src › stm32f1xx_hal_uart.c`처럼 SDK 안의 위치가 보인다. SDK 파일 안에서도 Ctrl+클릭으로 계속 이동할 수 있고 Ctrl+F는 그 파일 안을 찾는다.
- 탐색기의 **소스 파일** 목록은 그대로 프로젝트 파일만 보인다(CubeIDE의 Drivers 폴더는 펼치지 않는다). 프로젝트 파일 탭을 누르면 원래 파일로 돌아간다.
- **자동완성(1.18.2)**: clangd를 켜지 않아도 두 글자부터 보드 SDK의 HAL·CMSIS 이름(예: `HAL_TIM_Base_Start_IT`, `__HAL_RCC_GPIOA_CLK_ENABLE`, `GPIO_PIN_5`)을 대소문자 구분 없이 제안하고 선언을 옆에 보여 준다. Ctrl+Space로 직접 열 수 있다.
- **Alt+←**는 이동하기 전 위치로, **Alt+→**는 다시 앞으로 간다(CubeIDE Back/Forward).
- **코드 개요 (Outline)**: 탐색기 소스 파일 아래에 지금 보고 있는 파일의 include, 매크로(M), typedef(T), enum 상수(E), 전역 변수(V), 함수(F), 함수 선언(D)을 CubeIDE Outline처럼 `HAL_UART_IRQHandler(UART_HandleTypeDef *huart) : void`, `huart2 : UART_HandleTypeDef` 형식으로 보여 준다. 누르면 그 줄로 가고 위 칸에서 이름으로 거른다. 항목이 많으면 600개까지 보이고 나머지는 검색으로 좁힌다.
- **Core · Startup (1.17.1)**: 탐색기 소스 파일 아래의 접힌 묶음을 펼치면 ARM 빌드에 함께 들어가는 파일이 CubeIDE 이름으로 보인다. `stm32f1xx_it.c`(F446RE는 `stm32f4xx_it.c`, SysTick·켜진 인터럽트 핸들러), `syscalls.c`(printf/scanf용 `_write`·`_read` 등), `sysmem.c`(malloc용 `_sbrk`)는 빌드가 실제로 넣는 코드이고, `system_stm32f1xx.c`와 `startup_stm32f103xb.s`(F446RE는 `startup_stm32f446xx.s`)는 SDK 원본이다. 모두 읽기 전용 탭으로 열리며 소스 파일 목록에는 추가되지 않는다. main.c에 직접 쓴 핸들러는 it.c에 만들지 않고 그 목록을 맨 위에 적는다. CubeIDE의 startup 파일 이름(`startup_stm32f103rbtx.s`)과 다른 것은 이 앱이 SDK의 startup을 쓰기 때문이다.
- SDK는 **실행 및 디버그 → 개발 도구 → 필요한 도구 설치**로 받는 STM32CubeF4/F1 폴더(또는 개발 도구 설정의 SDK 경로)를 쓴다. 없으면 프로젝트 파일 안의 정의로만 이동하고 출력에 안내가 나온다. 정의는 전처리기 없이 찾으므로 `#if`로 갈린 여러 정의가 있으면 목록으로 고른다.

## 코드 정렬

**편집 → 코드 정렬**(Alt+Shift+F)은 현재 파일을 정렬한다. clangd가 켜져 있으면(STM32 · ARM GCC, Windows · C/C++ 대상) clangd와 프로젝트의 `.clang-format` 규칙을 쓰고, 그 밖의 경우(회로 시뮬레이터, 펌웨어 에뮬레이터, clangd 미설치)에는 내장 정렬기를 쓴다. **선택 영역 코드 정렬**은 선택한 줄만 정렬한다.

내장 정렬기는 한 줄에 여러 문장이 있으면 문장마다 줄을 나누고(`;`, 블록 `{` `}`, `case …:` 뒤), 중괄호 깊이에 맞춰 들여쓰기(설정의 들여쓰기 칸 수)를 다시 계산한다. `switch`의 `case`, 중괄호 없는 `if`/`for`/`while` 본문, 여러 줄에 걸친 괄호를 들여 쓰고 `if (`·`) {`·`} else`·쉼표 뒤 공백을 맞춘다. 중괄호가 있는 `}` 뒤의 `else 문장;`·`else if (조건) 문장;`처럼 한 갈래만 중괄호가 없으면 중괄호를 붙여 모든 갈래를 같은 모양으로 만든다. 초기화 중괄호(`={0, 1}`), `for (;;)` 머리, 문자열·문자·주석·전처리기 줄(`#define` 연속 줄 포함)과 연산자 주변 공백은 바꾸지 않는다. 줄을 나눠도 중단점은 원래 문장의 줄을 따라간다. `extern "C" { }` 안은 들여 쓰지 않는다.

**`}` 입력 시 블록 정렬**(기본 켜짐): 블록을 닫는 `}`를 입력하면(한글 입력 상태와 자동으로 닫힌 `}` 위에 입력하는 경우 포함) 그 블록(`{`가 있는 줄부터 `}`까지)을 같은 규칙으로 바로 정렬한다. **저장 시 코드 정렬**(기본 꺼짐)을 켜면 저장할 때 프로젝트의 모든 C/C++ 파일을 내장 정렬기로 정렬하며 실행 취소(Ctrl+Z)로 되돌릴 수 있다. 두 옵션은 **편집 → 설정 → 글꼴과 편집**에 있다.

## IDE 표시 설정

**편집 → 설정** 또는 **Ctrl+,**로 떠 있는 설정 창(화면·편집기, 단축키, 업데이트, 레이아웃)을 연다. 개발 도구 설정은 **편집 → 개발 도구 설정**에 있다. 코드 글꼴 크기(9~40), 줄 높이(12~64), 글꼴 이름, 화면 글꼴 크기(11~20), 터미널 글꼴 크기(9~32), 들여쓰기(1~8), 자동 줄 바꿈, 줄 번호, 미니맵, 괄호 색상을 바꿀 수 있다. 코드 글꼴을 줄 높이보다 크게 바꾸면 줄 높이도 늘어난다.

프로그램을 시작하면 항상 Windows 테마를 따른다(Windows가 어두우면 Dark, 밝으면 White). 실행 중에는 제목 표시줄의 태양/달 아이콘이나 설정 창의 화면 테마로 바꿀 수 있고, 다음 시작에는 다시 Windows 테마를 따른다. 화면·버튼·핀 설정·터미널은 고정된 Dark/White 팔레트를 사용한다.

**코드 블록 Colorscheme**는 편집기 내부와 코드 미리보기에만 적용한다. Dark의 기본은 **Jellybeans**, White의 기본은 **GitHub Light Default**다. 각 화면 모드에서 선택한 코드 테마를 따로 기억하며 화면 색상은 바꾸지 않는다. **복사하여 추가**로 새 테마를 만들고 이름·밝기·코드 구문/배경/선택/검색/디버그 색상을 수정한다. 기본 테마도 편집·초기화할 수 있고, 기존 STM Light를 포함한 기본 테마 세 개와 사용자 테마를 합쳐 30개까지 저장한다.

기본 들여쓰기는 **스페이스 4칸**이며 새 파일과 파일 전환에도 적용한다. 이전 설정 버전의 기본 2칸은 4칸으로 이전하고, 이후 설정에서 1~8칸을 직접 선택하면 해당 값을 유지한다.

각 변경은 즉시 적용·자동 저장한다. **설정 내보내기**로 JSON 파일을 저장하고 **설정 가져오기**로 다시 적용할 수 있다. 잘못된 형식·범위·색상·글꼴 값은 적용하지 않는다. 설정은 `stm32lab.idePreferences.v1`로 앱 프로필에 저장하며 프로젝트 전환·재시작 후에도 유지한다. 장치 온도·회전·저항값 등은 기존 **속성 / 측정**에서 변경한다.

기본 Jellybeans는 [nanotech/jellybeans.vim](https://github.com/nanotech/jellybeans.vim)의 원본 파일을 포함한다. 커밋 `ef83bf4dc8b3eacffc97bf5c96ab2581b415c9fa`와 SHA-256을 `src/themes/jellybeans/source.json`에 고정하고, 빌드 시 원본 GUI 하이라이트를 읽어 Monaco 테마로 등록한다. Vim 실행 환경이나 언어별 문법 엔진 자체를 이식한 것은 아니다. IDE 패널·버튼·회로 강조는 colorscheme와 분리된 앱 팔레트를 사용한다. White 기본 코드 테마는 공식 GitHub Theme 6.3.5의 GitHub Light Default JSON과 MIT 라이선스를 포함하며, 설치 수·별 비교와 출처는 [선정 기록](https://github.com/moonsyu/STM-Simulator/blob/main/src/themes/github-light/README.md)에 있다. 원본의 MIT 고지를 그대로 보존한다.

**Colorscheme 등록**에서 Monaco 테마 `.json`, VS Code 테마 `.json`/`.jsonc`, 정적 Vim `.vim` 파일을 선택하면 목록에 추가되고 즉시 적용된다. 여러 테마를 등록해 전환·복사·편집·삭제할 수 있으며 앱 재시작 후에도 유지된다. **테마 JSON 내보내기**는 현재 색상 수정까지 포함한 Monaco 파일을 저장한다. **설정 가져오기/내보내기**는 글꼴과 모든 등록 테마를 포함하는 별도 기능이다.

Vim은 `highlight ... guifg=#RRGGBB guibg=#RRGGBB gui=...`, `highlight link`, 배경·이름 설정을 지원하며 Normal의 전경·배경이 필요하다. 번들에 고정된 Jellybeans 원본은 SHA-256 확인 후 전용 변환 결과를 등록한다. 다른 동적 Vimscript·플러그인·외부 파일 include는 실행하지 않고 오류를 표시한다. VS Code 테마는 기본 C/C++ TextMate 토큰을 대응하며 문맥별 scope·semanticTokenColors는 지원하지 않는다. 테마당 500 KB, 기본 테마 포함 30개 제한이다. 기존 팔레트 사용자는 원본 테마로 이동하되 직접 수정한 색상은 보존된다.

## 실제 크기와 부품 사진

작업 공간은 실제 크기 비율로 그린다. 기준은 핀·구멍 간격 2.54 mm(= 14)이고, 1 mm = 14/2.54이다.

- **보드**: NUCLEO-64(MB1136) 70 × 82.5 mm. ST morpho(CN7·CN10)와 Arduino(CN5·CN6·CN8·CN9) 헤더 위치는 UM1724 Figure 5의 치수를 따른다. CN5는 실제 보드처럼 morpho 줄보다 0.4피치 아래에 있고 CN9와 4.06 mm(160 mil) 떨어져 있다.
- **빵판**: 400홀은 BB400급 54.3 × 84 mm, 830홀은 BB830 165.1 × 54.6 mm. 전원 레일은 a·j 열에서 2피치 바깥에 있다. 400홀 빵판의 구멍(a~j) 좌표는 그대로이고 바깥 틀과 전원 레일만 실제 크기로 옮겼다.
- **부품**: 81종 모두 위에서 내려다본 실제 모습의 사진을 데이터시트 크기(`src/part-datasheets.js`)에 맞춰 그린다. 사진은 Figma의 AI 이미지 생성(gpt-image 모델)으로 부품별 실제 외형·크기를 설명해 만들었고, 배경을 지우고 비율을 유지한 채 외곽 안에 맞췄다(`src/part-images.js`). 제조사 로고·상표는 넣지 않았다. LED(기본 "LED"와 "5mm LED")는 속성의 **LED 색상**(빨강·초록·파랑·노랑)에 따라 그 색 렌즈 사진으로 바뀌고, 켜지면 같은 색으로 빛난다. 꺼진 LED는 옅은 색 렌즈로 보이고 켜지면 진한 색으로 빛난다.
- **다리 길이**: 2핀 부품은 몸체에 붙은 짧은 다리로 꽂힌다. LED·광저항·서미스터·커패시터·2핀 버튼은 2피치(다리·빈 구멍·다리, 3칸), 저항·다이오드·12 mm 부저는 3피치(4칸)이다. 한쪽에 핀이 있는 모듈과 부품은 몸체 가장자리에서 핀까지가 OLED 헤더 다리의 2/3(약 1.7 mm)를 넘지 않게 몸체가 핀 쪽으로 붙는다(OLED 포함). DIP·SOT·슬라이드 스위치처럼 양쪽에 핀 줄이 있는 부품은 핀 줄 간격을 실제 몸체 폭에 맞췄다(DIP-8은 7.62 mm). 카드로 놓을 때와 HAL 예제 자동 배치 모두 같다. 핀 피치가 1.27 mm인 L298N/L298P 단품 칩은 2.54 mm 격자에서 핀 줄이 몸체보다 넓다.
- **4핀 버튼**: 6 × 6 mm 택트 스위치(B3F-1000형)로, 네 핀이 모서리에 두 칸 간격으로 있다.
- **모듈의 핀 위치**: 사진에 단자가 보이는 모듈은 핀이 보드 아래, 그 단자 자리에 있다(2.54 mm 격자에서 가장 가까운 곳, 헤더·단자대는 간격 유지). 예: L298N 모듈은 앞쪽 나사 단자(+12V·GND·+5V), 6핀 헤더(ENA·IN1~IN4·ENB), 양옆 OUT1/2·OUT3/4 단자 자리. 모터 드라이버 HAT(40핀 헤더·모터/전원 단자), 릴레이, 8×8 매트릭스(양쪽 5핀), 절연 RS485, CAN, MAX98357A, ULN2003(모터 소켓), MCP4725, 1.3인치 OLED, URM09 두 종, 4자리 표시 모듈, Grove·커넥터 모듈, Flora NeoPixel도 같다(18종). 사진에 보이지 않는 단자는 보드 바로 아래 한 줄에 있다.
- **직접 배선하는 단자**: 나사 단자(파란·초록 단자대), 흰색 JST 커넥터, 모터 소켓, DC 모터의 단자, 배터리 홀더의 선은 빵판에 꽂지 않고 그 단자에 점퍼선을 바로 연결한다. 단자를 클릭하면 배선이 시작된다. 이런 단자만 있는 모듈(L298N 모듈, 모터 드라이버 HAT, 절연 RS485, Grove SHT31, 가변저항 모듈, Gravity RGB, TM1637, URM09 두 종)과 DC 모터·배터리 홀더는 빵판에 꽂히지 않고, HAL 예제에서는 빵판 옆에 놓여 보드 핀이나 빵판 줄로 바로 배선된다. 릴레이·CAN·MAX98357A·ULN2003처럼 헤더 핀도 있는 모듈은 헤더 핀만 빵판에 꽂고 단자는 배선한다.
- **부품 목록**: 실물 부품마다 카드가 하나다. 예전의 간이 부품 중 실물과 핀 구성이 같은 27종(저항·LED·릴레이·L298N 모듈 등)은 실물 부품 카드로 합쳐졌고, 저장된 회로에서는 그대로 열린다. 실물보다 핀이 적은 간이 부품 7종(MPU6050, TFT, LED 매트릭스, I²C·SPI 메모리, DC 모터 + H 브리지, 스테퍼 + 드라이버)은 카드 설명에 실물 핀 수와 차이를 적었다.
- **HAL 예제**: 모든 예제가 실물 부품으로 만들어진다. 간이 "DC 모터 + H 브리지"는 L298N 모듈·DC 모터·12 V 전원으로, "스테퍼 + 드라이버"는 ULN2003 보드와 28BYJ-48로 나뉜다.
- 핀 위치와 간격은 사진이 아니라 시뮬레이터가 2.54 mm 격자에 정확히 그린다(금색 패드와 다리). 핀이 한쪽 가장자리에만 있는 모듈은 그 가장자리가 핀 쪽에 맞는다.
- 실행 중 바뀌는 부분은 사진 위에 겹쳐 그린다: LED·RGB 발광, 버튼 눌림, LCD 문자(파란 백라이트 위 흰 글자), OLED·TFT·LED 매트릭스 화면, 7세그먼트, 서보 혼·모터 축 회전, 가변저항·인코더 노브, 조이스틱 위치, 슬라이드 스위치 손잡이, 릴레이 LED, 부저 소리 표시.
- 크기 조절점과 **기본 크기** 명령은 없다. 데이터시트 크기가 없던 5종은 같은 계열의 일반 치수를 쓴다(`confidence: 'typical'`).
- HAL 예제 자동 배치는 부품끼리 겹치지 않도록 실제 크기를 쓰고, 막히는 구멍과 배선 경로는 핀 위에 떠 있는 모듈의 기판 자리로 계산한다. 배터리 홀더·DC 모터는 빵판 옆에 선으로 연결되는 부품으로 보아 겹침 검사에서 기판 자리만 쓴다.

## Renesas FPB-RA6E1 (1.20.0 · 주변장치·Clocks·Stacks 1.22.0)

활동 바 **보드/핀 설정**의 보드 목록에서 **FPB-RA6E1**(Renesas RA6E1, Cortex-M33 200 MHz)을 고른다. 이 보드는 Renesas **FSP**로 작성하고, 실행하면 앱이 ARM GCC와 Renesas FSP로 빌드해 RA6E1 펌웨어 에뮬레이터에서 실행한다(STM 보드의 기본 시뮬레이터 방식과 같고, 내장 해석기는 없다). 도구가 없으면 **시뮬레이터 실행 도구 설치** 창이 ARM GCC와 Renesas FSP v6.6.0(약 8 MB)을 받는다.

- **주 소스 `hal_entry.c`**: 새 프로젝트는 e² studio의 FSP 템플릿이다. `hal_entry()`에 코드를 쓰고, 핀은 `R_BSP_WarmStart()`의 `R_IOPORT_Open(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME)`이 설정한다. 핀은 `R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH)`처럼 Pins에서 정한 심볼(LED1 = P408)로 쓴다.
- **Pinout & Configuration (RA Configuration)**: RA Smart Configurator처럼 Summary · BSP · Clocks · Pins · Stacks 탭이 있다(1.46.0, 아래 "RASC 이름·흐름"). Pins 탭은 76개 포트에서 핀을 고르고 Mode(Output·Input·IRQ·Analog), Symbolic Name, 출력 초기값·세기, 풀업, IRQ의 Trigger·Priority·Callback을 정한다. IRQ 핀은 `g_external_irqN`(r_icu) 인스턴스가 생기므로 `R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg)`과 `R_ICU_ExternalIrqEnable()` 뒤 콜백이 불린다. 같은 IRQ 채널을 두 핀에 쓰면 거부한다(예: P104와 S1 P205는 둘 다 IRQ1). SWD(P108·P300)와 부트 모드(P201)는 바꿀 수 없다.
- **주변장치 핀(Peripheral)**: 핀의 Mode를 Peripheral로 하고 Signal을 고르면 그 채널의 인스턴스가 켜진다. SCI UART(TXDn/RXDn → `g_uartN`: 통신 속도와 실제 속도·오차, 우선순위, 콜백), GPT(GTIOCnA/B → `g_timerN`: PWM/Periodic, 주기·단위, 듀티, 콜백), IIC(SCLn/SDAn → `g_i2c_masterN`: Standard/Fast/Fast-mode plus, 슬레이브 주소, 콜백). AN 채널이 있는 핀(A0~A5 = AN000~AN004·AN008 등)을 Analog로 하면 `g_adc0`(Single/Continuous Scan, 분해능)이 켜진다.
- **Clocks 탭**: HOCO(16/18/20 MHz) → PLL(분주·배수) → ICLK·PCLKA~D·FCLK 분주. 주파수와 한계(ICLK 200, PCLKA 100, PCLKB 50, PCLKC 50, PCLKD 100, FCLK 50 MHz)를 보여 주고 넘거나 비율(ICLK ≥ PCLKA ≥ PCLKB, PCLKD ≥ PCLKA)이 맞지 않으면 알린다.
- **Stacks 탭**: 생성될 FSP 인스턴스 목록. 핀 없이 쓰는 타이머(AGT `g_agtN`: PCLKB 또는 LOCO, GPT 주기 타이머)를 New Stack으로 추가하고 주기·콜백·우선순위를 정하거나 삭제한다. 핀이 정하는 인스턴스는 그 핀으로 간다.
- **UART 통신**: 보드에 가상 COM이 없으므로 회로의 UART 부품(USB-TTL)을 D0(RXD9)·D1(TXD9)에 연결한다. 직렬 모니터의 송신 대상에 SCI 채널이 나오고, 부품이 받은 문자를 보여 준다.
- **보드**: LED1(P408)·LED2(P407, 녹색, High에서 켜짐), S1(P205, 누르면 LOW, 보드에 풀업 없음 — 템플릿이 내부 풀업을 켠다), S2 RESET, Arduino Uno R3 헤더(A0~A5 = P000~P004·P008, D0 P110 ~ D13 P102, SDA P401·SCL P400과 2.2 kΩ 풀업). 보드에는 ST-LINK 같은 USB 가상 COM이 없다(J-Link OB). Pmod와 J3/J4 MCU 헤더는 실물처럼 미장착으로 그린다.
- **탐색기 `ra_gen · ra_cfg`**: 앱이 빌드에 넣는 RASC 방식 생성 파일(pin_data.c, hal_data.c/h, vector_data.c/h, common_data, bsp_clock_cfg.h, bsp_pin_cfg.h, fsp.ld 등)을 읽기 전용으로 연다. Ctrl+클릭으로 `g_ioport_ctrl`·`g_external_irq1_cfg` 같은 생성 심볼의 정의로 간다.
- **예제**: 예제 패널의 FSP 예제 — LED1 깜빡이기, S1 외부 인터럽트로 LED2 토글, SCI9 UART 에코(USB-TTL 부품), GPT PWM으로 LED1 밝기·주기 인터럽트로 LED2, 가변저항 전압 읽기(ADC), AGT 주기 타이머·1 ms 틱, I²C 메모리 쓰기·읽기. 회로가 필요한 예제는 부품과 배선도 놓는다. 보드 LED는 PWM이면 듀티만큼 흐리게 보인다.
- **FSP 원본 보기(1.23.0)**: `hal_entry.c`에서 `R_IOPORT_PinWrite`·`R_SCI_UART_Open`·`uart_callback_args_t` 같은 FSP 이름을 F12 또는 Ctrl+클릭하면 설치된 Renesas FSP 폴더의 원본(ra/fsp/src·inc, BSP, CMSIS)을 읽기 전용 탭으로 연다. 자동완성(Ctrl+Space)에 FSP 함수·매크로·열거형 이름이 나온다.
- **실물 보드(J-Link, 1.23.0 · 실물 확인 1.25.0)**: FPB-RA6E1을 USB(J10, DEBUG)로 연결하면 실행 대상 목록에 "FPB-RA6E1 (J-Link 일련번호)"가 나온다. 실행(Ctrl+F5)은 SEGGER J-Link Commander로 `firmware.hex`를 기록·검증·리셋하고, 디버그(F10)는 JLinkGDBServer(127.0.0.1:2331)로 연결한다. SEGGER J-Link Software and Documentation Pack을 직접 설치해야 한다(segger.com, 라이선스 동의·관리자 권한 필요 — 앱이 대신 받지 않는다). 설치 경로가 다르면 개발 도구 설정의 J-Link 칸에 JLink.exe를 지정한다.
- 아직 없는 것: 로직 분석기의 IIC·GPT 파형, SPI·DTC.

## 보드 선택: NUCLEO-F446RE · NUCLEO-F103RB

첫 실행, **새 회로**, 새 프로젝트 창은 NUCLEO-F103RB로 시작한다. 보드 기록이 없는 예전 프로젝트 파일은 예전처럼 NUCLEO-F446RE로 연다.

활동 바 **보드/핀 설정**의 보드 카드나 새 프로젝트 창의 **보드**에서 NUCLEO-F446RE(STM32F446RE, Cortex-M4)와 NUCLEO-F103RB(STM32F103RB, Cortex-M3)를 고른다. 두 보드는 같은 NUCLEO-64(MB1136) 기판이며 그림의 MCU 표기와 CN7-29/31(F446RE PH0/PH1, F103RB PD0/PD1), CN10-18(F103RB PB11)만 다르다.

**보드 기본 연결(1.13.0)**: 헤더 핀은 MB1136 회로도 C-04의 배송 상태 솔더 브리지를 따른다. 다음 핀은 솔더 브리지가 열려 있어 MCU에 연결되지 않으며(NC), 핀을 누르면 이유가 표시되고 배선할 수 없다.

| 헤더 핀 | MCU 핀 | 솔더 브리지 | 실제 연결 |
|---|---|---|---|
| CN9-1 D0, CN10-37 | PA3 | SB62 열림 | ST-LINK 가상 COM 포트(USART2 RX) 전용 |
| CN9-2 D1, CN10-35 | PA2 | SB63 열림 | ST-LINK 가상 COM 포트(USART2 TX) 전용 |
| CN7-25, CN7-27 | PC14, PC15 | SB49, SB48 열림 | 32.768 kHz 수정 X2 |
| CN7-29 | PH0(F103RB PD0) | SB55 열림 | ST-LINK 8 MHz MCO 입력 |

그래서 외부 UART 장치는 USART1 **PA9(TX, D8)·PA10(RX, D2)**에 연결한다. 보드의 **LD2**(초록 LED, R31 510 Ω)는 PA5(D13)에 실제 부하로 걸려 D13의 전압과 전류 계산에 포함되고, **B1 USER**는 R30 4.7 kΩ 풀업과 R29 100 Ω을 거쳐 PC13을 LOW로 만든다(C15 100 nF는 계산하지 않음). 솔더 브리지를 바꾼 보드는 재현하지 않는다.

- **Pinout & Configuration**은 보드의 계열을 따른다. F103RB는 USART1~3, I²C1, SPI1, ADC1, TIM2~4(16비트), DMA1 채널 1~7을 쓰고, 핀은 AF 번호가 아니라 AFIO 리맵 묶음으로 옮긴다(예: USART1 TX/RX는 PA9/PA10 또는 함께 PB6/PB7). 묶음에 맞지 않는 조합은 오류로 알려 준다.
- **HAL 코드 생성**은 F1 HAL(`stm32f1xx_hal.h`, HSI/2×PLL 64 MHz, `__HAL_AFIO_REMAP_*`, `HAL_ADCEx_Calibration_Start`)로 만든다.
- **HAL 예제**는 F446RE용으로 작성되어 있고, F103RB 프로젝트에서 고르면 클럭·핀·타이머 값·DMA 채널·IRQ 이름을 F1에 맞게 바꿔 적용한다. 32비트 TIM2 자유 카운터를 쓰는 예제(초음파·온습도 등)는 16비트 카운터와 `(uint16_t)` 경과 시간 계산으로 바뀐다. F103RB에 없는 DCMI 카메라·I2S 오디오 예제 2개는 목록에서 빠진다.
- F103RB 프로젝트도 F446RE와 같이 회로 시뮬레이터, **STM32 · ARM GCC** 빌드(STM32CubeF1, Cortex-M3, Flash 128 KB / SRAM 20 KB), 실물 보드 실행·디버그, **펌웨어 에뮬레이터**(STM32F103 모델)를 쓸 수 있다. ARM 빌드에는 개발 도구의 **STM32CubeF1 SDK 폴더**가 필요하며 **필요한 도구 설치**로 받을 수 있다.

## 보드 이동과 배치 공간

시뮬레이션을 정지한 상태에서 **보드·빵판 몸체를 끌어 이동**한다. 핀·구멍은 배선에 사용한다. 해당 표면에 모든 다리가 꽂힌 부품과 내부 배선 경유점도 함께 이동한다. 다른 표면으로 나가는 배선은 끝점이 따라가고 직접 만든 경유점은 유지한다. 이동 한 번은 Undo/Redo 한 번으로 처리하며 드래그 중 Esc 또는 창 포커스 이탈로 취소할 수 있다.

**배치 공간의 고정 최대 범위를 제거했다.** 음수 좌표와 기존 6000 범위를 넘는 위치도 저장한다. 빈 공간을 끌거나 마우스 가운데 버튼으로 어디에서든 화면을 이동하고 휠로 확대·축소한다. 확대 비율 버튼을 누르면 전체 장치와 배선 경유점이 보인다. 화면 밖의 장치는 **장치 선택**에서 찾아갈 수 있다. 부품 수·배선 수 등 회로 규모 제한은 별개다.

배선 시작 핀을 선택하고 바닥을 연속 클릭하면 꺾임점을 추가한다. 끝 핀을 누르기 전 **우클릭 또는 Esc**를 누르면 그리던 배선 전체를 취소한다. 시작 핀에서 우클릭해도 핀 설정창을 열지 않고 취소한다. 이미 완성된 배선은 삭제하지 않는다.

**한 칸에는 점퍼선 하나 또는 부품 다리 하나만** 꽂는다. 이미 배선 끝이 있는 핀·구멍이나 부품 다리가 꽂힌 구멍에서는 배선을 시작하거나 끝낼 수 없고, 부품을 끌어 꽂거나 2핀 부품을 놓을 때도 점퍼선 끝이 있는 구멍은 쓰지 않으며, 빵판의 같은 줄 다른 구멍을 쓰라고 알려 준다. 이전 버전에서 만든 프로젝트의 배선은 그대로 연다.

**배선 끝 옮기기**: 이미 만든 점퍼선의 끝(핀 부분)을 끌어 다른 핀·구멍에 놓거나, 끝을 한 번 클릭해 집은 뒤(토글) 옮길 핀·구멍을 클릭하면 그 끝만 옮긴다. 집은 상태에서 같은 끝을 다시 누르거나 빈 곳을 누르거나 Esc를 누르면 취소된다(배선은 지워지지 않는다). 끄는 동안 미리보기 선과 놓을 칸 표시(초록: 가능, 빨강: 사용 중)가 보인다. 색·꺾임점·반대쪽 끝은 유지하며 Ctrl+Z로 되돌린다.

**핀 이름 보기**: 핀이나 구멍에 마우스를 올리면 이름이 나온다(라즈베리파이 `3번 GPIO2`처럼 GPIO 번호 포함). 배선이 연결되어 있거나 지나가는 핀도 같고, 실행 중에는 전압도 함께 보여 준다.

## STM32 보드 여러 개

한 회로에 NUCLEO 보드를 4개까지 놓고, 보드마다 다른 코드·핀 설정으로 함께 실행하거나 각자의 ST-LINK로 실물 보드에 기록할 수 있다(1.7.0).

- **추가**: 활동 바 **보드/핀 설정**의 **다른 보드 추가**에서 **NUCLEO-F446RE** 또는 **NUCLEO-F103RB**를 고른다. 회로에 STM32 보드가 먼저 있어야 한다. 새 보드는 그 MCU의 빈 HAL `main.c`와 기본 핀 설정으로 시작한다. 이름은 `STM32-2`, `STM32-3` …이고(처음 보드는 `STM32-1`) 속성 패널에서 바꾼다. STM32 보드는 회전하지 않는다.
- **보드마다 따로 저장되는 것**: `main.c`와 추가 소스(.c/.h), **Pinout & Configuration** 설정, 중단점·감시식, 장치 Docs로 넣은 코드 기록, 실물 기록용 ST-LINK.
- **편집할 보드 고르기**: 보드를 클릭해 속성의 **이 보드 편집 · 코드와 핀 설정**을 누르거나, 편집기 파일 목록에서 `STM32-2 · main.c (이 보드 편집)`을 고른다. 고른 보드가 **편집 중**인 보드가 되어 편집기·Pinout·HAL 코드 생성·장치 Docs·빌드·디버그가 그 보드를 대상으로 한다. 편집 중인 보드 그림 위에는 `STM32-2 · 편집 중`이 표시된다. 보드는 제자리에 있고 배선도 그대로다(내부적으로 주 보드와 소프트웨어·자리를 바꾼다). 바꾸기는 실행 취소(Ctrl+Z)로 되돌릴 수 있다. 실행 중에는 바꿀 수 없다.
- **함께 실행(시뮬레이터)**: 실행(Ctrl+F5) 한 번에 모든 STM32 보드가 같은 회로·시간축에서 각자의 프로그램을 실행한다. 다른 보드의 printf와 UART 송신 줄은 로그에 `[STM32-2] …`로 나오고, 직렬 모니터에서 `STM32-2 · Serial (USB 출력)`을 고르면 모아서 볼 수 있다. 실행 환경의 **실행 보드**에서 보드 하나만 실행할 수도 있다.
- **보드 버튼과 LED**: 각 보드의 USER 버튼(PC13)·LD2(PA5)가 그 보드에서 동작한다. 다른 보드의 RESET 버튼은 그 보드의 프로그램만 처음부터 다시 실행한다.
- **보드끼리 연결**: 한 보드의 GPIO 출력을 다른 보드의 입력·EXTI에 배선하면 그대로 전달된다. **UART**는 한 보드의 TX를 다른 보드의 RX에 배선하고 두 UART를 활성화한 뒤 baud를 같게 하면 바이트가 전달된다(baud가 다르면 받지 않고 버스 기록에 남긴다). GND·3.3 V·5 V는 보드끼리 공통이다(같은 PC에 USB로 연결한 상태).
- **부품 표시**: 다른 보드에 연결된 부품(OLED·LCD·서보·L298N과 모터 등)은 그 보드의 통신·PWM 결과로 표시된다.
- **시뮬레이터 실행 방식**(1.14.0): 실행 대상이 **시뮬레이터**이면 기본으로 HAL 프로그램을 실물 보드와 같은 ARM GCC·STM32Cube SDK로 빌드해 회로의 펌웨어 에뮬레이터에서 실행한다. 그래서 실물처럼 모든 `#include`(`stdlib.h`, `ctype.h`, CAN·RTC HAL 헤더, 직접 추가한 헤더)와 C 라이브러리 함수(`snprintf`, `atoi` …)를 쓸 수 있다. 실행 및 디버그의 실행 환경에서 **ARM GCC 빌드 / 내장 해석기**를 고른다. 도구가 없는 PC에서 실행하면 **시뮬레이터 실행 도구 설치** 창이 열려 ARM GCC와 보드에 맞는 STM32Cube SDK(약 323 MB)를 받고 바로 실행하며, **내장 해석기로 실행**을 고르면 그 뒤로 해석기를 쓴다(언제든 다시 바꿀 수 있음). 아두이노식 스케치와 FatFs(SD 카드) 프로그램은 설치 도구에 FatFs가 없어 내장 해석기로 실행한다. 내장 해석기는 빌드 없이 바로 시작하지만 지원하는 헤더와 함수만 쓸 수 있다([HAL-API.md](HAL-API.md)).
- **펌웨어 에뮬레이터**: 실행 대상이 펌웨어 에뮬레이터이면 보드마다 ARM GCC로 ELF를 빌드해 각자 에뮬레이터로 실행한다(보드 수만큼 빌드한다).
- **실물 보드**: 실행 대상이 실물 보드일 때 실행(Ctrl+F5)하면 보드마다 그 보드의 소스로 빌드해 각자의 ST-LINK에 차례로 기록·검증·리셋한다. ST-LINK는 보드 속성의 **실물 기록 ST-LINK**에서 고른다. **자동**이면 연결된 ST-LINK 중 보드 종류가 같은 것을 쓰고, 같은 종류 보드가 두 개 이상이면 고르라고 알려 준다. 한 ST-LINK를 두 보드에 지정할 수 없다. 디버그(F10, GDB)는 편집 중인 보드 하나에만 연결한다.
- **삭제**: 편집 중인 보드(주 보드)를 지우면 다음 STM32 보드가 편집 중인 보드가 된다.

**보드끼리 유선 통신**(1.11.0, 에뮬레이터 I²C·SPI는 1.12.0): UART·I²C·SPI 모두 시뮬레이터(HAL 해석 실행)와 펌웨어 에뮬레이터에서 된다. 에뮬레이터에서는 다른 보드의 I2C·SPI 주변장치가 실제 레지스터 동작(OAR1 주소, ADDR·TRA·RxNE·TxE·STOPF·AF, SPI 슬레이브의 RXNE·TXE·OVR)으로 응답하고, 슬레이브가 DR을 채우기 전의 읽기는 SCL을 늘인 것처럼 기다린다(최대 1초). 슬레이브 쪽은 `hi2c1.Init.OwnAddress1`에 주소를 넣고 `HAL_I2C_Slave_Receive`·`HAL_I2C_Slave_Transmit`(`_IT`와 `HAL_I2C_SlaveRxCpltCallback`·`HAL_I2C_SlaveTxCpltCallback`도 가능)을, SPI는 `hspi1.Init.Mode = SPI_MODE_SLAVE`로 초기화해 `HAL_SPI_Receive`·`HAL_SPI_Transmit`·`HAL_SPI_TransmitReceive`(또는 `_IT`)를 쓴다. 넷이 같아야 하고 I²C는 풀업이 필요하다(F103의 I²C 핀은 내부 풀업이 없어 실물도 외부 저항이 필요하다). 슬레이브가 처음 듣기 전에 보내면 NACK이다. 호출 사이에 도착한 바이트는 다음 호출이 받는다(I²C 클럭 늘이기, SPI 시프트 레지스터 해당). 예제 `STM32·STM32 I²C 통신`, `STM32·STM32 SPI 통신`.

**직렬 모니터**: 다른 STM32 보드는 대상을 그 보드로 고르면 보낸 글자가 USART2로 들어간다. **로직 분석기**: 보드가 둘 이상이면 **보드** 목록에서 고른 보드의 파형과 디코딩이 보인다.

**폴더 프로젝트**: 다른 보드의 코드도 `board-<부품 id>-main.c`처럼 `main.c` 옆에 저장하고 열 때 읽는다. 1.11.0 전에 저장한 폴더는 그대로 열리고 다음 저장 때 파일이 생긴다.

한계: SPI 슬레이브의 NSS는 소프트웨어 방식만 있어 항상 선택 상태다. 보드 프로그램은 회로 시간 단계(화면 갱신 단위)만큼 어긋나 돌므로 마스터는 슬레이브가 다음 호출을 할 시간을 두어야 한다. HAL 예제를 적용하면 회로 전체가 예제 회로로 바뀌어 다른 보드도 빠진다(실행 취소로 복구). 보드를 하나 더 실행할 때마다 시뮬레이션 계산이 그만큼 늘어난다(1.12.0에서 회로의 연결 구조를 실행 중 재사용해, 보드 4개 회로가 약 8배 빨라졌다). 1.7.0에서 저장한 여러 STM32 보드 회로는 이전 버전에서 열리지 않는다.

## ESP32·라즈베리파이 보드와 강의 실습 예제

STM32 보드 옆에 **ESP32**와 **Raspberry Pi 5** 보드를 함께 놓을 수 있다. 활동 바 **보드/핀 설정**의 **다른 보드 추가**에서 고른다(다른 보드는 STM32를 포함해 회로당 8개까지). STM32 보드를 여러 개 놓는 방법은 [STM32 보드 여러 개](#stm32-보드-여러-개)를 본다.

- **NodeMCU-32S (ESP-32S, 38핀)**: 강의 보드(NODEMCU ESP-32S V1.1). 핀 배열은 ESP32-DevKitC V4와 같고, 실크 표기는 `P34`·`SVP`·`SD2` 형식이다. 두 핀 열은 22.86 mm(9칸) 떨어져 있다.
- **ESP32 DevKit 38핀 (ESP32-WROOM-32)**: 같은 배열에 DevKitC 표기(`34`·`VP`)로 그렸다. 실물과 대조하지 않아 "핀 배열 확인 필요"로 표시한다.
- **Raspberry Pi 5**: 40핀 헤더(물리 핀 1~40, 홀수 핀은 안쪽 열). 3.3 V 로직이고 아날로그 입력이 없다. GPIO2·GPIO3에는 보드의 1.8 kΩ 풀업이 있다.

보드 이름(`ESP32-1`, `RPI-1` …)이 회로 라벨, 탐색기·편집기 탭, 실행 로그(`[ESP32-1] …`), 직렬 모니터 항목에 함께 쓰인다. 이름은 속성 패널에서 바꾸며 다른 부품과 겹칠 수 없다.

- **배선**: 보드 핀을 클릭해 배선한다. 각 보드의 GPIO는 그 보드만의 신호이고 3.3 V·5 V·GND 핀은 공통 전원·GND에 연결된다(USB로 같은 PC에 연결한 상태). 핀을 선택하면 속성 패널과 **장치 Docs**에 기능과 주의(입력 전용, 사용 금지, 스트래핑, ADC2/Wi-Fi, 3.3 V 전용 등)가 나온다.
- **ESP32는 빵판에 꽂는다**: 끌어서 빵판 가운데 홈을 걸치게 놓으면 38개 핀이 b열·i열(830홀은 90° 돌려 b행·i행)에 꽂힌다. 양쪽에 남는 a·j 구멍으로 배선한다. 라즈베리파이 헤더는 꽂지 않고 점퍼선으로 연결한다. 보드는 R로 90°씩 돌린다.
- **코드**: 보드마다 `sketch.ino`(ESP32) 또는 `main.py`(라즈베리파이)가 있고 탐색기·편집기 탭에 `ESP32-1 · sketch.ino`처럼 보인다. ESP32 스케치는 편집해서 실행하고, 라즈베리파이 코드는 고정 실행 코드라 읽기 전용이다.

**ESP32 스케치 실행**(1.6.0): ESP32 보드의 `sketch.ino`를 실행할 때 STM32 스케치와 같은 C 해석기로 실행한다. `setup()`/`loop()`, 핀은 GPIO 번호(`pinMode(2, OUTPUT)` = GPIO2), `digitalWrite`·`digitalRead`·`analogRead`(12비트 0~4095)·`delay`·`millis`·`attachInterrupt`, `ledcAttach`/`ledcWrite`(2.x의 `ledcSetup`/`ledcAttachPin`도 가능, 평균 전압으로 계산), `Serial.begin`/`print`/`println`/`printf`, DHT 라이브러리(`#include <DHT.h>`, `DHT dht(13, DHT11)`, `begin`/`readTemperature`/`readHumidity`: 그 핀에 배선되고 전원이 들어간 DHT11/DHT22 모듈의 설정값, 아니면 nan), `Wire` I²C 슬레이브(`Wire.begin(주소)`, `onReceive`/`onRequest`, `available`/`read`/`write`, SDA GPIO21·SCL GPIO22)를 지원한다. GPIO6~11(내장 플래시)과 없는 핀 번호는 오류로 멈춘다. 컴파일 오류는 `ESP32-1 · sketch.ino: 3행: …`처럼 보드와 파일을 붙여 실행 전에 보여 준다. Wi-Fi·Bluetooth·MQTT와 그 밖의 라이브러리는 지원하지 않는다.

**라즈베리파이 main.py 실행**(1.12.0): 라즈베리파이의 `main.py`는 앱의 Python 해석기로 STM32와 같은 회로·시간축에서 실행한다. 코드를 고치면 동작도 바뀐다. 쓸 수 있는 것: 대입·`if/elif/else`·`while`·`for … in`·`break/continue/pass`·`def`(`global`, 기본값 인수)·`lambda`·`try/except/finally`·`raise`·f-string(서식 `.1f`·`.0%`·`5d` 등)·리스트·튜플·딕셔너리·리스트 내포, `print`·`input`(직렬 모니터에서 보낸 줄)·`int`·`float`·`str`·`len`·`range`·`min`·`max`·`round`·`sum`·`abs` 등. 라이브러리: gpiozero `LED`·`PWMLED`·`Button`(`when_pressed`/`when_released`, `pull_up`, `active_state`)·`LEDBoard`, `RPi.GPIO`(`setmode` BCM/BOARD, `setup`, `output`, `input`, `PWM`, `cleanup`), `time.sleep`·`perf_counter`·`time`, `signal.pause`, `sys.exit`. 문장마다 2 µs가 걸려서 `perf_counter()`로 기다리는 반복도 시간이 흐르고, 1 ms보다 빠르게 켜고 끄는 핀(소프트웨어 PWM)은 그 평균 듀티로 LED 밝기가 계산된다. 오류는 `RPI-1 · main.py n행: ValueError: …` 형식으로 실행 로그에 나온다. 그 밖의 모듈(`numpy` 등)·클래스 정의·스레드는 지원하지 않는다.

**고정 실행**(라즈베리파이 커널 모듈): 강의 예제의 리눅스 커널 모듈(C)은 실행하지 않고 그 예제의 시나리오대로 핀을 바꾼다. 아래는 이 방식의 설명이다. 강의 예제에서 불러온 라즈베리파이는 그 예제의 시나리오대로 핀을 바꾸고(LED 깜빡임, PWM 밝기, 스위치 입력에 따른 동작, 직렬 모니터 입력에 따른 동작) 코드가 출력할 내용을 로그와 직렬 모니터에 보여 준다. 핀 상태는 STM32와 같은 회로 계산에 들어가서, 배선이 틀리면 실제처럼 LED가 켜지지 않는다. 강의 예제가 아닌 라즈베리파이는 코드를 실행하지 않고 핀을 입력 상태로 둔 채 전압만 계산한다.

- **실행**: 실행(Ctrl+F5) 한 번에 STM32와 다른 보드가 같은 시간축에서 함께 시작한다. 디버그 중 일시정지하면 다른 보드도 함께 멈춘다.
- **실행 보드**: 회로에 다른 보드가 있으면 **실행 및 디버그**의 실행 환경에 **실행 보드**(전체 보드 / STM32만 / 보드 하나만)가 나온다. STM32 보드가 없는 회로나 다른 보드 하나만 고르면 STM32 코드는 실행하지 않는다.
- **직렬 모니터**: 대상에서 `ESP32-1 · Serial (USB)`을 고르면 그 보드의 출력이 보이고, 보낸 글자는 스케치의 `Serial.available`·`Serial.read`로 읽는다. 입력을 읽는 라즈베리파이 예제(LED 제어 쉘·LED 밝기 쉘·커널 PWM LED)는 대상을 `RPI-1`로 고르고 보낸 줄을 프로그램 입력으로 받는다(`> 2`처럼 출력에 함께 보인다). 다른 라즈베리파이 예제에는 보내지 않는다.
- **PWM 밝기**: PWM 출력(STM32 `analogWrite`·HAL 타이머 PWM, ESP32 `ledcWrite`, 라즈베리파이 예제의 PWM)은 평균 전압으로 계산하고, LED는 켜진 구간의 전류 × 듀티비로 계산한다. 그래서 10%는 어둡고 100%는 밝게 보인다(LED 순방향 전압보다 평균 전압이 낮아도 켜진다). 모터·RC 필터·ADC는 평균 전압을 그대로 쓴다.

**ESP32 실물 보드 빌드·업로드**(1.9.0): ESP32 보드를 USB로 연결하면 **실행 및 디버그**의 실행 대상에 `ESP32 (COM4)`처럼 포트가 보인다(CP210x·CH340/CH9102·FTDI·ESP32 내장 USB). 이 대상을 고르면 편집 중인 ESP32 보드(편집 중인 파일이 ESP32가 아니면 회로의 첫 ESP32 보드)의 `sketch.ino`를 다룬다.

- **빌드**(Ctrl+Shift+B): Arduino CLI와 Espressif esp32 코어로 컴파일한다(보드 설정 `esp32:esp32:esp32` · ESP32 Dev Module). 오류는 문제 목록에 `ESP32-1 · sketch.ino`의 줄로 나온다. 같은 스케치는 다시 컴파일하지 않는다. 처음 컴파일은 몇 분, 그 뒤에는 15~40초쯤 걸린다.
- **실행**(Ctrl+F5): 빌드한 뒤 고른 COM 포트로 업로드하고, 끝나면 그 포트의 직렬 출력을 **터미널** 탭에 보여 준다. 속도는 스케치의 `Serial.begin(…)`을 따른다(없으면 115200). 입력 대상 **실행 프로그램 stdin · ESP32 직렬**로 보낸 줄은 보드로 간다. 실행 정지(Ctrl+F2)로 직렬 모니터를 닫는다. 다른 프로그램(Arduino IDE 시리얼 모니터 등)이 포트를 쓰고 있으면 업로드할 수 없다.
- **BOOT 버튼**: 업로드는 보드를 자동으로 다운로드 모드로 리셋한다. 자동 리셋 회로가 없거나 동작하지 않는 보드는 `Connecting......`이 이어지다 "Wrong boot mode"로 실패한다. 이때는 보드의 **BOOT** 버튼을 누른 채로 다시 실행하고 `Writing`이 나오면 손을 뗀다. 업로드가 끝나 보드가 리셋될 때까지 BOOT를 누르고 있으면 보드가 다시 다운로드 모드로 부팅해 직렬 출력에 `waiting for download`만 나온다. 앱이 이를 알려 주며, BOOT에서 손을 뗀 뒤 보드의 **EN**(RST) 버튼을 한 번 누르면 업로드한 스케치가 실행된다.
- **필요한 도구**: Arduino IDE 2를 설치하면 들어 있는 `arduino-cli.exe`를 자동으로 찾는다(개발 도구 설정의 **ESP32 빌드·업로드** 칸에서 바꿀 수 있다). Arduino IDE의 보드 매니저에서 **esp32 by Espressif Systems**를, 스케치가 쓰는 라이브러리는 라이브러리 관리에서 설치한다. Arduino IDE 2의 설정(`~/.arduinoIDE/arduino-cli.yaml`)을 그대로 써서 IDE에 설치한 코어·라이브러리가 보인다. 라이브러리가 없으면 이름을 알려 준다(예: DHT11 예제는 **DHT sensor library**).
- 디버그(F10)·중단점·레지스터 보기는 ESP32 대상에서 지원하지 않는다. 변수와 중단점은 시뮬레이터 대상에서 확인한다.

**예제 목록과 분류**: 활동 바의 **예제**(Ctrl+Shift+X)는 보드 종류별로 **Raspberry Pi · STM32 · ESP32** 묶음으로 보인다. 목록 위의 **전체 / Raspberry Pi / STM32 / ESP32** 단추로 한 묶음만 볼 수 있고, 고른 단추는 다음 실행에도 유지된다. 두 종류 이상의 보드를 쓰는 예제(STM32·ESP32 I2C 통신)는 해당 묶음마다 모두 나온다. HAL 예제는 STM32 묶음에 있다. 강의 예제는 **강의 실습**·**강의 과제** 표시와 함께 무엇을 하는 예제인지만 이름으로 보인다. 강의 코드(RPI-02, KER-01, 도전 3 …)와 교재 쪽수로도 검색할 수 있다.

**강의 예제**: 강의 회로도와 같은 보드 핀·부품·연결을 이 앱의 빵판에 만들고, 구멍 위치와 선 경로는 이 앱의 배치를 따른다. 보드 코드는 강의 코드가 아니라 같은 동작을 하는 이 앱의 짧은 예시다. ESP32 예제는 스케치가 실제로 실행되어 코드를 고치면 동작도 바뀐다.

- **배선**: 라즈베리파이는 90° 돌려 빵판 왼쪽에 세운다. 헤더 핀 간격이 빵판 구멍 간격과 같아서, 핀 2k−1·2k가 빵판 k+1번 줄과 나란하고 선은 핀 사이 틈에서 곧게 자기 줄로 들어간다(선 교차 없음). ESP32는 빵판에서 비어 있는 a·j 구멍만 쓰고 선은 구멍 사이 틈으로 지나며 보드 위를 가로지르지 않는다. 핀 순서 때문에 피할 수 없는 교차만 남는다(STM32·ESP32 I2C 1곳, ESP32 입출력 종합 4곳).

| 분류 | 예제 | 내용 |
|---|---|---|
| 강의 실습 | 라즈베리파이 3.3V LED | 3.3V(1번 핀) 전원으로 LED 켜기(코드 없음) |
| 강의 실습 | 라즈베리파이 LED 깜빡이기 / PWM LED | GPIO17 LED 1초 깜빡임 / PWM 밝기 0→100% |
| 강의 실습 | 라즈베리파이 Tact 스위치 / 풀업 스위치 2개 | GPIO27 내부 풀업 / GPIO27 내부 풀업 + GPIO22 외부 10 kΩ 풀업 |
| 강의 실습 | 라즈베리파이 커널 드라이버 LED / Tact 스위치 | GPIO20 LED 타이머 깜빡임 / GPIO2 스위치 인터럽트로 GPIO20 LED |
| 강의 과제 | 라즈베리파이 LED 3개 깜빡이기 | GPIO4·17·22 LED를 0.5초 간격으로 함께 깜빡임(라즈베리파이와AI Day1 도전 1) |
| 강의 과제 | 라즈베리파이 LED 제어 쉘 | 직렬 모니터로 1·2·3을 보내면 그 LED를 켜고 끔, 그 밖의 숫자는 종료(도전 2) |
| 강의 과제 | 라즈베리파이 LED 밝기 쉘 | 1은 10% 밝게, 2는 10% 어둡게(0~100%), 그 밖은 종료(도전 3) |
| 강의 과제 | 라즈베리파이 버튼 LED | 버튼(GPIO26, 외부 10 kΩ 풀업)을 누르는 동안 LED 3개 켜짐(도전 4) |
| 강의 과제 | 라즈베리파이 버튼 PWM 밝기 | 500 Hz PWM 직접 구현, 버튼1을 누르면 밝기 최대 90%까지, 버튼2는 최소 10%까지(도전 5) |
| 강의 과제 | 라즈베리파이 크리스마스 트리 | LED 5개, 버튼을 누를 때마다 번갈아 깜빡임 ↔ 함께 깜빡임(도전 6) |
| 강의 과제 | 라즈베리파이 커널 PWM LED | 앱 입력 10~90을 듀티비로 GPIO20 LED PWM, 그 밖의 값은 LED 끄고 종료(리눅스커널프로그래밍 Day3 도전 2) |
| 강의 과제 | 라즈베리파이 커널 타이머 LED 2개 | 커널 타이머로 GPIO20 LED 5초, GPIO12 LED 7초 주기, 상태를 구조체로 전달(Day3 도전 3) |
| 강의 실습 | STM32·ESP32 I2C 통신 | STM32(I²C 마스터, HAL 코드)가 ESP32(I²C 슬레이브 0x08, 스케치)에 1/0을 보내 LED를 켜고 끔 |
| 강의 실습 | ESP32 LED 깜빡이기 | ESP32 GPIO2 LED 0.5초 깜빡임(보드 내장 파란 LED도 함께) |
| 강의 실습 | ESP32 LED·스위치·가변저항·DHT11 | LED(GPIO17)·스위치(GPIO18, 외부 풀업)·가변저항(GPIO36)·DHT11(GPIO13), 830홀 빵판 |

강의 과제는 교재의 "도전" 중 회로가 있는 것만 넣었다. 출력만 하는 커널 드라이버 과제, 조사·문서 과제, 카메라·OpenCV·PyTorch·YOLO 과제, Sense HAT 과제는 회로 예제가 아니라서 넣지 않았다. 임베디드Firmware·임베디드AIoT 교재는 이 PC에 없어 그 과제는 넣지 않았다.

한계: 라즈베리파이의 리눅스 커널 모듈(C)은 실행하지 않는다(고정 실행). ESP32 스케치는 회로 시뮬레이터에서 해석 실행하고, 실물 보드에는 **ESP32 (COMn)** 실행 대상으로 Arduino CLI 빌드·업로드한다(1.9.0, 디버그 없음). 로직 분석기에는 다른 보드의 핀이 나오지 않는다. 1.5.0의 회로 파일을 이전 버전에서 열면 다른 보드를 알 수 없어 열리지 않는다.

## DS3231 RTC 모듈 (1.27.0)

부품 검색에서 `DS3231`으로 찾는다. **DS3231 RTC 모듈 (ZS-042)**은 흔히 쓰는 파란 모듈이다: 왼쪽 6핀 직각 헤더 32K·SQW·SCL·SDA·VCC·GND가 기판 왼쪽으로 다리처럼 나와 빵판에 꽂힌다. 오른쪽 4개 구멍(다음 I²C 장치를 이어 붙이는 통과 구멍)은 1.28.0부터 연결점이 아니다. 새로 놓으면 이름은 `DS3231`, 두 번째는 `DS3231-2`다. 뒷면의 CR2032 홀더는 그리지 않는다.
- I²C 주소: DS3231 0x68, 같은 기판의 AT24C32 EEPROM 0x57.
- 실행을 시작하면 PC의 지금 시각에서 시작한다(배터리가 있는 모듈처럼). 00h~06h에 시각을 쓰면 그 시각부터 흐른다. 날짜·월·연(세기 비트), 12/24시간, 요일(1~7, 자정마다 1씩), 알람 1·2와 상태의 A1F·A2F, 제어·에이징 레지스터를 데이터시트대로 읽고 쓴다.
- 온도(11h·12h)는 속성 패널의 **칩 온도**(0.25 °C 단위)다.
- 아직 없는 것: SQW/INT 핀 출력(알람 인터럽트, 사각파)과 32K 출력.
- 이전의 8핀 부품은 **Adafruit DS3231 RTC 브레이크아웃 8핀**으로 이름이 바뀌었고 같은 모델로 동작한다.

## 블루투스·Wi-Fi 모듈과 보드 간 통신

부품 검색에서 `블루투스`, `와이파이`, `HC-05`, `ESP-01`로 찾는다. 보드와 모듈은 실물처럼 UART로 연결한다. 보드 TX → 모듈 RXD, 모듈 TXD → 보드 RX, 전원·GND를 연결하고 양쪽 속도가 같아야 한다.

| 부품 | 전원 | 기본 속도 | 하는 일 |
|---|---|---|---|
| **HC-05** (6핀) | VCC 3.3~6 V, RXD 3.3 V 로직 | 통신 9600, AT 38400 | 마스터·슬레이브. 전원을 넣을 때 EN이 HIGH면 AT 모드 38400, 켜진 뒤 HIGH로 올리면 현재 속도의 AT 모드. 명령은 CR LF로 끝낸다. STATE는 연결되면 HIGH |
| **HC-06** (4핀) | VCC 3.3~6 V | 9600 | 슬레이브 전용. 연결 전에는 AT 명령을 받는다. CR LF 없이 보내고 명령 뒤 쉬는 시간(0.5 s)으로 끝을 판단한다 |
| **ESP-01** (8핀) | VCC 3.0~3.6 V 전용, CH_PD HIGH | 115200 | ESP8266 AT 펌웨어. AP·스테이션, TCP/UDP. 2×4 헤더라 점퍼선으로 연결한다 |

**연결 규칙.** 블루투스는 HC-05 하나가 마스터(속성 패널의 역할 또는 `AT+ROLE=1`)여야 하고, PIN이 같은 슬레이브를 찾아 약 1.5초 뒤 연결된다. `AT+CMODE=0`이면 `AT+BIND`로 정한 주소에만 연결한다. Wi-Fi는 한 모듈이 AP(`AT+CWMODE=2`, `AT+CWSAP`)를 열고 다른 모듈이 접속(`AT+CWJAP`)한 뒤 TCP(`AT+CIPSTART`, 서버는 `AT+CIPMUX=1`·`AT+CIPSERVER`)나 UDP로 주고받는다. AP 주소는 192.168.4.1, 스테이션은 192.168.4.2부터다.

**예제**(예제 목록, `보드 간 통신` 표시).

- **STM32·STM32 블루투스 통신**: STM32-1(HC-05 마스터)이 STATE로 연결을 확인하고 1초마다 `LED ON`/`LED OFF`를 보내면 STM32-2(HC-06)가 LD2를 켜고 끄고 `ACK`로 답한다.
- **STM32·ESP32 블루투스 통신**: 같은 명령을 ESP32가 `Serial2`(GPIO16 RX, GPIO17 TX)의 HC-06으로 받아 파란 LED를 켜고 끈다. ESP32 스케치는 `Serial2.begin(baud[, SERIAL_8N1, rx, tx])`, `available`, `read`, `print`, `println`, `write`를 쓸 수 있다.
- **STM32·STM32 Wi-Fi 통신**: STM32-2의 ESP-01이 AP와 TCP 서버(포트 333)를 열고 STM32-1의 ESP-01이 접속해 명령을 보낸다. `+IPD`로 받은 내용을 읽어 답한다.
- 부품마다 한 보드 예제도 있다(HC-05·ESP-01 설정, HC-06 AT 응답). 부품의 **HAL 예제**로 연다.

실행하면 출력 탭에 UART 송수신이, 파형 옆 통신 로그에 `Bluetooth`·`Wi-Fi` 항목이 나오고, 모듈을 선택하면 속성 패널에 연결 상태가 보인다. 모듈의 LED는 상태에 따라 깜빡인다(대기 빠르게, AT 38400 2초에 한 번, 연결 후 두 번씩).

**실물로 옮길 때.** 예제 C 코드는 HAL만 쓰므로 그대로 빌드된다. 실물 HC-05는 먼저 AT 모드에서 `AT+ROLE=1`, `AT+CMODE=1`을 설정해야 한다(HC-05 한 보드 예제). 시뮬레이터의 속성 패널 역할은 그 설정이 끝난 상태를 나타낸다. 5 V 보드에서는 모듈 RXD에 분압이 필요하고, ESP-01은 순간 전류가 커서 별도 3.3 V 전원이 안전하다.

**패킷 손실.** 모듈 속성의 **패킷 손실 (%)**(기본 0)로 무선 구간의 손실을 정한다. 블루투스와 TCP는 다시 보내므로 늦게 도착하고 7번 넘게 실패하면 잃어버리며, UDP는 그대로 사라진다. 손실은 통신 로그에 남고 같은 회로는 실행할 때마다 같게 재현된다.

**회로 밖의 상대.** 직렬 모니터 대상에서 고른다.

- **스마트폰 → 모듈 이름**: 슬레이브로 쓰는 HC-05·HC-06 또는 `BluetoothSerial`을 시작한 ESP32와 처음 보낼 때 페어링하고(1.5초), 양쪽으로 글자를 주고받는다. 이미 다른 모듈과 연결된 모듈이나 마스터는 거부한다.
- **공유기의 PC**(`192.168.1.100:8080`): ESP-01·ESP32가 AP `STM-Router`(암호 `stm32-router`)에 접속하면 `192.168.1.x` 주소를 받고, `AT+CIPSTART="TCP","192.168.1.100",8080`처럼 PC에 연결한다. 보낸 내용이 모니터에 보인다. 모듈이 TCP 서버를 열어 두었으면 PC가 먼저 보낼 때 그 서버로 접속한다.

**인터넷**(1.12.0): 공유기 `STM-Router`에 접속한 모듈·ESP32는 공유기 너머의 두 서버에 TCP로 연결한다(응답은 20 ms 더 늦다).

- **MQTT 브로커** `broker.stm-lab.test`(203.0.113.10:1883, MQTT 3.1.1): CONNECT·PUBLISH(QoS 0·1)·SUBSCRIBE(`+`·`#`)·UNSUBSCRIBE·PINGREQ·DISCONNECT. 직렬 모니터 대상 **인터넷 MQTT 브로커**에서 `토픽 메시지`(예: `stm/led 1`)를 보내 발행하고, 오가는 메시지를 본다.
- **웹 서버** `api.stm-lab.test`(203.0.113.20:80, HTTP/1.1, 응답 뒤 연결을 닫음): `GET /`, `GET /time`(실행 시작 후 초), `GET /led?state=on|off`, `POST /data`(본문 저장). 요청은 직렬 모니터 대상 **인터넷 웹 서버 기록**에 남는다.
- ESP-01은 `AT+CIPDOMAIN="api.stm-lab.test"`로 주소를 찾고 `AT+CIPSTART="TCP","api.stm-lab.test",80`처럼 이름으로 연결한다. ESP32 스케치는 `HTTPClient`(`begin("http://…")`·`GET`·`POST`·`getString`·`end`)와 `PubSubClient`(`setServer`·`setCallback`·`connect`·`connected`·`subscribe`·`publish`·`loop`)를 쓴다. 예제 `ESP32 인터넷 MQTT·웹 통신`. https·TLS와 그 밖의 라이브러리는 지원하지 않는다.

**ESP-01 패스스루.** `AT+CIPMUX=0`에서 `AT+CIPMODE=1` 다음 인수 없는 `AT+CIPSEND`로 들어간다. 그 뒤로 보내는 내용은 20 ms 동안 조용해지면 나가고, 받는 내용에는 `+IPD`가 붙지 않는다. `+++`만 보내면 끝나고 AT 명령으로 돌아온다.

**ESP32 자체 무선.** 스케치에서 `BluetoothSerial`(`begin`·`available`·`read`·`print`·`println`·`write`·`connected`)과 `WiFi`(`mode`·`softAP`·`begin`·`status`·`disconnect`·`localIP`·`softAPIP`), `WiFiServer`(`begin`·`available`), `WiFiClient`(`connect`·`connected`·`available`·`read`·`print`·`println`·`write`·`stop`)를 쓸 수 있다. 예제 `ESP32·ESP32 Wi-Fi 통신`, `ESP32 스마트폰 블루투스 통신`. 코드는 실물 Arduino 코어로도 빌드되는 형태다.

**한계.** 메시지 단위 모델이라 거리·전파 세기·잡음은 계산하지 않고, 지연은 고정값에 재전송 시간을 더한 값이다(블루투스 20 ms, Wi-Fi 5 ms). 인터넷 쪽에는 아래 두 서버만 있고, 그 밖의 도메인은 찾지 못한다. 마스터 HC-05는 스마트폰에 연결하지 않는다. ESP-01의 SSL과 그 밖의 AT 명령은 `ERROR`로 답하고 통신 로그에 이유를 남긴다. AT로 바꾼 설정은 그 실행 동안만 유지되고 다음 실행에는 속성 패널 값으로 시작한다. 라즈베리파이 코드에서의 모듈 사용은 지원하지 않는다.

## 패널 크기와 위치

- 사이드바·속성 패널·하단 패널·코드/회로 사이의 경계선을 끌어 크기를 조절합니다. 경계선에 키보드 포커스를 두고 방향키(Shift는 크게)로도 조절하며, 코드/회로 경계선을 두 번 클릭하면 반으로 나눕니다.
- **패널 옮기기**: 탐색기·코드·회로·출력/터미널·속성 패널 머리 왼쪽의 손잡이(⠿)를 끌어 다른 영역에 놓으면 두 패널의 자리가 바뀝니다.
- **새 창으로 분리**: 패널 머리의 ⧉ 버튼으로 프로그램 밖 별도 창에 띄웁니다(다른 모니터로 옮길 수 있습니다). 분리된 창에서도 편집·실행·단축키가 그대로 동작하고, 창을 닫거나 원래 자리의 **여기로 되돌리기**를 누르면 돌아옵니다.
- 코드·회로·하단 패널은 최대화할 수 있고 하단 패널은 닫을 수 있습니다.
- 사이드바를 접은 상태, 각 크기와 패널 배치는 이 PC에 저장되어 다음 실행에 복원됩니다. **편집 → 설정 → 레이아웃 → 레이아웃 초기화**로 기본 배치로 돌아갑니다.
- 속성 패널을 직접 닫으면 부품을 선택해도 다시 열리지 않습니다. 제목 표시줄의 패널 버튼이나 Ctrl+Alt+B로 다시 엽니다.

## 프로젝트 생성과 파일 관리

**새 프로젝트**에서 이름, 보드(기본 NUCLEO-F103RB, NUCLEO-F446RE 선택 가능), 빈 HAL 또는 예제 템플릿, 저장할 상위 폴더를 선택한다. 폴더를 선택하지 않으면 미저장 프로젝트로 시작한다.

폴더 프로젝트는 다음 파일을 만든다.

```text
MyProject/
  stm-project.json     프로젝트 폴더 표시
  project.stm32lab      회로·핀 설정·소스 목록·디버그 설정
  main.c               주 소스
  main.h               초기 헤더
  user.c / user.h       사용자가 추가한 소스
```

**프로젝트 열기**는 이 형식의 폴더를 연다. **회로 파일 열기**는 기존 `.stm32lab` 단일 문서를 연다. CubeIDE의 기존 프로젝트는 코드 패널의 **Cube 프로젝트 폴더**로 가져온다.

왼쪽 소스 파일 목록과 상단 파일 탭에서 파일을 전환한다. **파일 추가**, **이름 변경**, **삭제**를 지원한다. main.c는 삭제하거나 이름을 바꿀 수 없다. 이름 변경 시 해당 파일을 참조하는 include를 갱신하며, 다른 소스에서 include 중인 파일은 삭제 전에 참조를 제거해야 한다. 보조 C/C++/H 파일은 최대 40개다.

**파일 저장 / Ctrl+S**는 열린 프로젝트 폴더의 회로와 소스를 함께 저장한다. 새로 추가·이름 변경·삭제한 파일도 이때 반영된다. 저장 후 앱 밖에서 파일이 변경되었다면 덮어쓰기를 중단한다. 외부 변경을 확인하고 프로젝트를 다시 연다. 앱 재시작 시 자동 복구된 문서는 폴더 저장 연결을 복원하지 않으므로, 원래 폴더에 계속 저장하려면 **프로젝트 열기**를 사용한다.

## 코드 작성과 빌드

Monaco 편집기로 C/C++/H 구문 색상, 줄 번호, 괄호 짝, 접기, 다중 커서, 파일별 커서 위치를 제공한다. Ctrl+Space는 프로젝트 식별자와 주요 지원 API를 제안한다. 알려진 API는 마우스를 올리면 호출 형식을 보여준다. F12는 프로젝트 소스에서 찾을 수 있는 함수 정의로 이동한다.

Ctrl+F는 현재 파일 찾기, Ctrl+R은 바꾸기, Ctrl+Z/Y는 프로젝트 실행 취소/재실행이다. 코드와 회로 변경은 같은 프로젝트 이력에 저장된다.

**빌드 / Ctrl+Shift+B**는 지원 C/C++/H 문법과 전처리를 검사하고 시뮬레이터 실행 프로그램을 준비한다. 빌드 오류를 누르면 원래 C/C++/H 파일의 해당 줄로 이동한다. 배선·전원·HAL 설정은 실행할 때 추가로 검사한다.

위 설명은 **회로 시뮬레이터** 실행 대상에 해당한다. 실제 GCC/GDB 대상은 아래 항목을 따른다.

**printf 실수 출력**: `printf("%.2f", t)`는 시뮬레이터와 ARM GCC 빌드 모두 숫자를 출력한다(빌드는 늘 `-u _printf_float`). 1.25.0~1.26.0의 도구 막대 printf float 칸은 1.27.0에서 없앴다. CubeIDE 새 프로젝트는 이 설정(*Use float with printf from newlib-nano*, Project Properties › C/C++ Build › Settings › MCU/MPU Settings)이 꺼져 있으니, 실물 보드용 CubeIDE 프로젝트에서는 직접 켠다.

**문제 탭**은 배선·전원 검사와 함께 다음도 알린다(1.25.0).
- **it.c 핸들러 중복**: Pinout NVIC를 켠 인터럽트의 핸들러(`ADC1_2_IRQHandler` 등)나 `SysTick_Handler`를 main.c에 직접 쓰면, 시뮬레이터에서는 동작하지만 CubeIDE는 같은 함수를 `Core/Src/stm32xxxx_it.c`에 만들어 *multiple definition* 링크 오류가 난다고 알린다. 처리는 HAL 콜백(`HAL_ADC_ConvCpltCallback`, `HAL_GPIO_EXTI_Callback`, `HAL_TIM_PeriodElapsedCallback` 등)에 쓴다. 항목을 누르면 그 줄로 이동한다. Pinout 코드 생성이 만든 핸들러(USER CODE 구역이 있는 형태)와 가져온 it.c는 알리지 않는다.
- **핀 과전압**: STM32 핀에 걸린 전압이 핀의 허용 범위를 넘으면 오류로 표시한다. 5 V 비허용(TT·TTa) 핀은 VDD + 0.3 V = 3.6 V까지(NUCLEO-F103RB의 PA0~PA7·PB0·PB1·PB5·PC0~PC5·PC13~PC15, NUCLEO-F446RE의 PA4·PA5), 5 V 허용(FT) 핀은 5.5 V까지, ADC 입력으로 쓰는 핀은 FT여도 3.6 V까지, 모든 핀은 −0.3 V 이상이다. 실행 중이면 출력 탭에도 한 번 알린다. 가변저항 양 끝을 5V에 연결해 ADC 핀에 넣는 경우 등을 잡는다.

## 실행과 소스 디버그

| 조작 | 동작 |
|---|---|
| Ctrl+F5 / 실행 | 시작, 중단점에서 계속 실행 (실행 버튼은 실행 중 누르면 정지) |
| F10 / 디버그 시작 | 첫 실행 문장 앞에서 멈춤, 멈춘 상태에서는 계속 실행 |
| F9 / 줄 왼쪽 표시 영역 클릭 | 현재 파일·줄의 중단점 추가/제거 |
| F6 | 다음 실행 문장에서 일시정지 |
| F11 | 한 줄 실행: 현재 문장 실행, 호출 함수는 끝까지 실행 |
| Ctrl+F11 | 함수 안으로 한 단계 실행 |
| Shift+F11 | 현재 함수 밖으로 실행 |
| Ctrl+F2 / 정지 | 디버그 및 실행 종료 |
| 기존 ‘한 단계’ | 시뮬레이션 시간 20ms 진행; 소스 한 줄 실행과 별개 |

멈춘 줄은 코드에서 강조된다. 활동 바의 **실행 및 디버그** 보기(Ctrl+Shift+D)에 디버그 도구 모음과 함께 현재 함수의 지역 변수, 프로그램 전역 변수, 호출 스택, 중단점, 감시식을 표시한다. 스택 항목을 누르면 해당 코드로 이동한다. 감시식은 `counter`, `values[0]`, `counter+1` 같은 읽기 전용 식이며 함수 호출·대입·증감은 허용하지 않는다.

중단점과 감시식은 프로젝트에 저장한다. 편집기에서 줄을 삽입·삭제하면 중단점 위치도 이동한다. 주석·선언 전용 줄에는 실행 문장이 없어서 멈추지 않을 수 있다. 실행 중에는 소스 변경이 잠긴다.

회로 시뮬레이터에서 디버깅할 때는 C 소스 실행기를 사용한다. 인터럽트 콜백은 NVIC 우선순위에 따라 선점되는 별도 실행 문맥이며 콜백 안 중단점·한 줄 실행을 지원하고 호출 스택에 ISR을 표시한다. 펌웨어 에뮬레이터는 ELF의 DWARF 줄 정보로 소스 줄 중단점·한 줄/함수 안/밖 실행·호출 스택·전역 변수·레지스터·메모리를 제공한다(지역 변수는 표시하지 않는다). ARM/Windows 대상에서는 아래의 실제 GDB를 사용한다. 회로·시간 모델의 범위는 [HAL API](HAL-API.md)를 따른다.


## 실제 GCC 빌드와 개발 도구 설치

**실행 대상 고르기**(1.12.3): 제목 표시줄의 실행 버튼 옆 ▾에서도 실행 대상(시뮬레이터, 펌웨어 에뮬레이터, 연결된 실물 보드, ESP32, Windows)을 고를 수 있다. NUCLEO가 새로 연결되면(앱 시작 때 연결돼 있던 보드 포함) 실행 대상이 그 실물 보드로 바뀌고 실행 로그에 알린다. 여러 개면 프로젝트 보드와 같은 종류를 먼저 고르고, 종류가 다르면(1.13.0) 그래도 실행 대상을 바꾼 뒤 보드/핀 설정에서 프로젝트 보드를 바꾸라고 안내한다(기록은 같은 종류의 보드에만 된다). 실행 중에는 바꾸지 않고, 다른 대상을 고르면 보드를 다시 꽂을 때까지 그대로 둔다. ▾ 메뉴는 ▾를 다시 누르거나 메뉴 밖을 누르거나 Esc를 누르거나 다른 창으로 옮기면 닫힌다.

상단 **실행 대상**에서 `STM32 · ARM GCC` 또는 `Windows · C/C++`를 선택한다. 같은 프로젝트에 저장된 대상·Debug/Release 설정을 다음 실행에서도 복원한다. `.cpp`, `.cc`, `.hpp` 파일을 추가할 수 있으며 C는 C11, C++는 C++17로 각각 컴파일하고 함께 링크한다. `main.c` 이름은 유지한다. C와 C++ 사이에서 함수를 호출할 때 헤더에 `extern "C"`를 적절히 사용한다.

**개발 도구**에서 아래 실행 파일과 SDK를 선택하고 **저장 후 검사**를 누른다. PATH, MSYS2, 기본 STM32Cube 저장소와 아래 설치 스크립트의 기본 위치를 자동 검색한다. 도구 경로는 PC 설정이며 회로 파일에 넣지 않는다. 설치된 STM32CubeIDE(`C:\ST\STM32CubeIDE_*`)가 있으면 그 안의 GNU Tools for STM32(ARM GCC·GDB)와 OpenOCD도 자동으로 찾는다. 이 경우 보드에 맞는 STM32Cube 드라이버(F446RE는 STM32CubeF4, F103RB는 STM32CubeF1)만 받으면 된다. 프로젝트의 보드(MCU 계열)에 따라 SDK·컴파일 옵션·startup·링커 스크립트가 정해진다.

**필요한 도구 설치**(개발 도구 창): 빠진 도구만 크기·출처와 함께 보여 주고 **설치 시작**을 누르면 `%LOCALAPPDATA%\STM-Simulator-Tools`에 받는다. ARM GCC 15.2.1(GDB 포함, xPack), STM32CubeF4 v1.28.3 드라이버(NUCLEO-F446RE), STM32CubeF1 v1.8.7 드라이버(NUCLEO-F103RB, 약 2 MB), OpenOCD 0.12.0(xPack), clangd 23.1.0. 릴리스 파일은 고정 SHA-256으로, STM32CubeF4·F1은 고정 커밋의 파일마다 SHA-256으로 검증하며 Git은 필요 없다. ARM GCC를 받으면 압축을 푼 뒤 약 1.5 GB를 사용한다. 앱을 시작하고 3초 뒤 실물 보드용 도구(ARM GCC·GDB·STM32CubeF4·OpenOCD, F103RB 프로젝트를 열었으면 STM32CubeF1도)가 빠져 있으면 알림으로 **설치·나중에·다시 묻지 않기**를 고를 수 있다. ST-LINK USB 드라이버(ST STSW-LINK009)는 별도로 설치해야 할 수 있다.

**보드에 기록하지 못할 때**(1.12.2): 빌드가 끝난 뒤 OpenOCD가 실패하면 출력 원문 앞에 원인과 할 일을 붙여 보여 준다.

| OpenOCD 출력 | 뜻과 할 일 |
|---|---|
| `LIBUSB_ERROR_NOT_FOUND` | ST-LINK USB 드라이버가 없다. 장치 관리자의 "ST-Link Debug"가 오류로 보이면 ST-LINK USB 드라이버(STSW-LINK009)나 STM32CubeProgrammer를 관리자 권한으로 설치하고 USB를 다시 연결한다. 앱은 드라이버를 설치하지 않는다. |
| `LIBUSB_ERROR_ACCESS`·`BUSY` | STM32CubeIDE·STM32CubeProgrammer·다른 디버그 세션이 ST-LINK를 쓰고 있다. 그 프로그램을 닫는다. |
| `Address already in use` | 디버그 포트 3333을 다른 GDB 서버가 쓰고 있다. |
| `Target voltage`가 0 V | 보드 MCU에 전원이 없다. JP5·JP6 점퍼를 확인한다. |
| `unable to connect to the target` | 프로그램이 SWD 핀(PA13·PA14)을 바꾸었거나 저전력 상태다. RESET을 누른 채 실행하고 기록이 시작되면 뗀다. |
| `open failed`만 있을 때 | ST-LINK를 찾지 못했다. 데이터 케이블과 CN2 점퍼를 확인한다. |

| 작업 | 필요한 도구 |
|---|---|
| STM32F446RE 펌웨어 빌드 | `arm-none-eabi-gcc.exe`와 같은 배포판의 g++, objcopy, size; STM32CubeF4의 HAL/CMSIS |
| STM32F103RB 펌웨어 빌드 | 같은 ARM GCC; STM32CubeF1의 HAL/CMSIS (`-mcpu=cortex-m3`, `STM32F103xB`) |
| 실물 보드 실행·디버그 | `arm-none-eabi-gdb.exe`; OpenOCD + ST-LINK 또는 이미 실행 중인 GDB 서버 |
| ESP32 빌드·업로드 | `arduino-cli.exe`(Arduino IDE 2에 포함) + 보드 매니저의 esp32 패키지, 스케치가 쓰는 라이브러리 |
| Windows C/C++ 빌드·실행·디버그 | MinGW-w64 GCC/g++/GDB (MSYS2 UCRT64 권장) |
| C/C++ 의미 분석 | `clangd.exe`와 해당 대상의 컴파일러·SDK |

저장소에서 ARM 도구·clangd·OpenOCD·SDK를 설치하려면 PowerShell과 Git을 준비하고 다음을 실행한다. 관리자 권한과 전역 PATH 변경은 필요 없다. 다운로드 SHA-256 및 SDK 커밋을 검사하며 각 배포판의 라이선스 파일을 보존한다.

```powershell
./scripts/setup-native-tools.ps1
# 다른 설치 폴더를 사용할 때
./scripts/setup-native-tools.ps1 -Destination C:\STM-Tools
```

기본 설치 위치는 `%LOCALAPPDATA%/STM-Simulator-Tools`다. Windows GCC/GDB는 별도로 [MSYS2](https://www.msys2.org/)에서 설치한다. 도구를 직접 설치할 때는 [Arm GNU](https://learn.arm.com/install-guides/gcc/arm-gnu/), [STM32CubeF4](https://github.com/STMicroelectronics/STM32CubeF4), [clangd](https://clangd.llvm.org/installation.html), [OpenOCD](https://openocd.org/pages/getting-openocd.html)를 참고한다.

GCC·binutils의 Windows 한글 경로 제한 때문에 컴파일러와 SDK는 영문 경로를 사용한다. **사용자 프로젝트 폴더는 한글·공백 경로를 사용할 수 있다.** 빌드는 앱 데이터의 독립 작업 폴더에 소스를 복사해 진행한다. Windows 사용자 프로필 경로에도 한글이 있으면 개발 도구의 **빌드 작업 폴더**에서 영문 폴더를 선택한다.

- **빌드 / Ctrl+Shift+B**: 실제 컴파일러 명령·출력을 빌드 탭에 스트리밍한다. Debug는 `-g3 -O0`, Release는 `-g3 -Os`를 사용한다. 중단 버튼으로 빌드를 취소할 수 있다.
- ARM 결과는 `firmware.elf`, `.bin`, `.hex`, `.map`, `compile_commands.json`, `build-result.json`이다. Windows 결과는 `program.exe`, `.map` 등이다. **빌드 폴더 열기**로 실제 파일을 확인한다. 매 빌드마다 새 작업 폴더를 사용하므로 실패한 결과로 이전 바이너리를 실행하지 않는다.
- 프로젝트의 C/C++ 소스와 실제 ST HAL 드라이버, CMSIS, 보드의 startup을 컴파일한다. F446RE는 Flash 512 KB / SRAM 128 KB, F103RB는 Flash 128 KB / SRAM 20 KB 링커 스크립트, 기본 인터럽트 연결 및 main.h를 준비한다. 프로젝트가 제공한 main.h, HAL 설정 헤더와 시스템 초기화 파일은 우선한다. 기본 IRQ 함수는 프로젝트 소스에 같은 이름의 함수가 없을 때만 생성하므로(`#if 0` 안의 정의는 제외) 사용자 정의로 교체할 수 있다.
- 파일 추가·편집·빌드 설정 변경 후 실행하면 현재 소스와 일치하는 빌드를 사용한다. 링크 오류 등 줄 번호가 없는 오류는 전체 빌드 로그에서 확인한다. 빌드 결과의 경고도 표시한다.
- 빌드 작업 폴더는 재현과 디버깅을 위해 보존한다. 사용하지 않는 작업 폴더는 실행·언어 서버 종료 후 사용자가 삭제할 수 있다.

## 실제 GDB 디버그 및 Run

**Windows · C/C++**는 새 프로젝트의 `Windows C/C++ · 콘솔 프로그램` 템플릿으로 시작할 수 있다. 실행은 EXE를 별도 프로세스로 시작하고 출력과 종료 코드를 **실행 / 터미널**에 표시한다. 입력 대상에서 `실행 프로그램 stdin`을 선택해 표준 입력을 보낸다. 디버그 시작은 실제 GDB가 main에서 정지한다.

**STM32 · ARM GCC**는 프로젝트 보드(NUCLEO-F446RE 또는 NUCLEO-F103RB)의 ST-LINK USB를 연결하고 **보드 연결**을 설정한다.

처음 쓸 때 순서: (1) **실행 및 디버그 → 실행 환경**에서 **STM32 · ARM GCC**를 고른다. (2) **개발 도구**에서 ARM GCC·ARM GDB·보드의 STM32Cube SDK(F4 또는 F1)·OpenOCD가 채워졌는지 확인한다(비워 두고 저장하면 바로 자동 감지한다. STM32CubeIDE가 설치돼 있으면 GCC·GDB·OpenOCD는 그 안에서 찾고, SDK는 **필요한 도구 설치**로 받는다). (3) **보드 연결**은 기본값(**OpenOCD 자동 시작 · ST-LINK**)이면 된다. (4) 실행(Ctrl+F5)은 항상 새 빌드를 보드에 기록·검증하고 리셋한다. 디버그 시작(F10)은 **디버그 시작(F10) 때 빌드한 펌웨어를 보드에 기록**(기본 켜짐)을 끄면 보드에 이미 있는 펌웨어에 연결만 한다. 프로젝트 보드와 다른 종류의 보드만 연결되어 있으면 기록하지 않고 알려 준다.

1. OpenOCD 자동 시작은 `interface/stlink.cfg`와 보드의 target(`target/stm32f4x.cfg` 또는 `target/stm32f1x.cfg`)을 사용하고 127.0.0.1:3333에서 GDB 연결을 받는다. ST-LINK가 여러 개 연결되어 있으면 STM32CubeProgrammer(STM32CubeIDE에 포함)의 보드 이름으로 프로젝트 보드의 ST-LINK를 고르고(`adapter serial`), 고를 수 없으면 **보드 연결**의 **ST-LINK 시리얼**을 입력하라고 알려 준다. USB 드라이버는 설치한 ST-LINK/OpenOCD 환경에서 준비되어 있어야 한다. STM32CubeIDE에 들어 있는 OpenOCD(ST 빌드)를 쓰면 CubeIDE의 `st_scripts` 폴더를 `-s`로 지정하고 `interface/stlink-dap.cfg`(`transport select dapdirect_swd`)로 연결한다.
2. 외부 GDB 서버는 `host:port`로 연결한다. 예를 들어 이미 시작한 ST-LINK GDB Server 또는 OpenOCD를 사용할 수 있다. 외부 서버가 대상을 정지·초기화한 상태여야 한다.
3. **디버그 시작(F10) 때 빌드한 펌웨어를 보드에 기록**은 기본 켜짐이다. 켜면 GDB `load`로 보드의 기존 펌웨어를 교체한다. 끄면 보드에 현재 ELF와 같은 펌웨어가 이미 있어야 소스·주소가 일치한다.
4. **디버그 시작**은 선택한 빌드 구성과 관계없이 Debug 구성으로 빌드하고 main에서 멈춘다. 빌드 구성의 기본값은 Release다(1.12.3). **실행**(Ctrl+F5)은 OpenOCD 자동 시작일 때 CubeIDE의 Run처럼 새 빌드를 항상 기록·검증하고 리셋한 뒤 OpenOCD를 끝내 디버거를 분리한다. 보드는 단독으로 실행하며, 디버거가 계속 붙어 있지 않으므로 ST-LINK 통신 LED(LD1)가 계속 깜빡이지 않는다. 변수·중단점이 필요하면 **디버그 시작**을 쓴다. 외부 GDB 서버 연결에서는 GDB로 연결한 채 실행한다. ARM 대상도 연결된 보드 또는 외부 GDB 대상이 있어야 실행된다.

**newlib 시스템 함수**: ARM 빌드는 STM32CubeIDE의 `syscalls.c`처럼 `_read`·`_close`·`_fstat`·`_isatty`·`_lseek`·`_getpid`·`_kill`을 약한 정의(weak)로 넣는다(`_read`는 `__io_getchar()`를 부른다). 그래서 빌드마다 나오던 "_close is not implemented" 링커 경고가 없고, 프로젝트에 직접 만든 `syscalls.c`가 있으면 그쪽이 쓰인다.

F9 중단점, Ctrl+F5 또는 F10 계속 실행, F6 일시정지, F11 한 줄 실행, Ctrl+F11 함수 진입, Shift+F11 함수 복귀, Ctrl+F2 종료를 사용한다(기본값). GDB의 `finish`는 함수 호출 결과를 대입하기 전에 멈출 수 있다. 이 경우 한 줄 더 실행한 뒤 대입된 변수를 확인한다.

지역·전역 변수, 스택 프레임, 읽기 전용 감시식, 레지스터, 지정 주소의 메모리(최대 4096 바이트)를 조회한다. 스택을 선택하면 해당 프레임에서 지역 변수·감시식을 평가한다. 전역 목록은 사용자 소스의 최대 40개이며 추가 변수는 감시식에서 조회한다. 감시식의 함수 호출·대입·증감은 차단한다. 실제 보드에서는 사용 가능한 하드웨어 중단점 개수 등 디버그 프로브의 제한을 따른다.

정지는 앱이 시작한 디버거·실행 프로세스·OpenOCD를 종료한다. 외부 GDB 서버 프로세스를 종료하지 않는다. 디버그 중에는 소스·프로젝트 편집이 잠기고, 종료하면 다시 편집할 수 있다.

## clangd 코드 분석과 터미널

ARM 또는 Windows 대상을 선택하고 편집기 아래 **clangd 꺼짐**을 눌러 연결한다. 실제 컴파일 데이터베이스를 기준으로 오류·경고, 멤버 완성(Ctrl+Space), 타입/함수 호버, 프로젝트 정의 이동(F12), 참조 찾기(Shift+F12), 함수 인수 안내, 서식 정리(Shift+Alt+F)를 제공한다. 편집한 내용은 저장 전에도 언어 서버에 전달한다. 현재 정의·참조 이동은 프로젝트에 등록된 소스 범위이며 SDK 외부 헤더 열기는 포함하지 않는다. 연결하지 않으면 기존 기본 완성을 사용한다.

**실행 / 터미널 → 터미널 시작**은 열린 프로젝트 폴더(미저장 프로젝트는 앱 데이터 폴더)에서 Windows 명령 프롬프트를 실행한다. 입력 대상 `터미널 명령`으로 명령을 보내고 **터미널 종료**로 자식 프로세스까지 정리한다. 실제 OS 명령을 실행하는 출력/입력 콘솔이며 PTY를 요구하는 전체 화면 도구·대화형 TUI는 지원하지 않는다. 프로젝트를 연다고 자동으로 셸 명령을 실행하지 않는다.

## 실행 대상

| 실행 대상 | 동작 |
|---|---|
| 회로 시뮬레이터 | 컴파일하지 않고 HAL C 소스를 해석해 회로와 함께 실행합니다. NVIC 우선순위 선점, HAL DMA, USART 동기 모드, 카메라·SD 카드 모델을 지원합니다 |
| 펌웨어 에뮬레이터 · ARM ELF | ARM GCC로 실제 ST HAL·CMSIS를 빌드한 ELF를 Cortex-M 명령어 단위로 실행하고, 프로젝트 보드의 주변장치 레지스터 모델(STM32F446 또는 STM32F103: RCC·GPIO CRL/CRH·AFIO 리맵·DMA1 채널·F1 ADC)을 빵판 회로에 연결합니다. F103RB 모델은 F446과 같은 메모리 버스를 쓰므로 128 KB/20 KB를 넘는 주소 접근을 오류로 막지 않습니다. 소스 줄 중단점, 단계 실행, 레지스터·메모리 조회를 지원합니다. CubeIDE 등에서 만든 ELF는 **파일 → 펌웨어 ELF 열기**로 바로 실행합니다 |
| STM32 · ARM GCC | 실물 NUCLEO-F446RE/NUCLEO-F103RB에 기록하고 GDB·OpenOCD로 디버그합니다 |
| ESP32 (COMn) | 회로의 ESP32 보드 `sketch.ino`를 Arduino CLI로 빌드해 실물 ESP32에 업로드하고 직렬 출력을 보여 줍니다(디버그 없음) |
| Windows · C/C++ | PC용 C/C++ 프로그램을 빌드·실행·디버그합니다 |

- 앱 EXE 자체, 회로 시뮬레이터, 이미 만든 ELF의 에뮬레이터 실행에는 개발 도구가 필요 없습니다. 에뮬레이터용 빌드와 실물 보드·Windows 대상은 ARM GCC, STM32CubeF4/STM32CubeF1 등 해당 도구가 필요합니다.
- 범용 Visual Studio의 모든 언어·확장·Git UI·임의 CMake 프로젝트·프로파일러를 복제한 제품은 아닙니다. 네이티브 프로젝트는 F446RE/F103RB HAL 또는 평면 C/C++ 소스(최대 40개 보조 파일)입니다.
- 회로 시뮬레이터(HAL 해석 실행)는 `GPIOA`·`LD2_GPIO_Port` 같은 포트를 HAL 함수 인수로 바로 쓸 때만 지원합니다. `GPIO_TypeDef *port = GPIOA;`처럼 포트를 변수에 담는 코드는 펌웨어 에뮬레이터나 실물 보드 대상으로 실행하세요.

## 변수 그래프 (1.19.0, STM Studio 방식)

하단 **변수 그래프** 탭은 STM Studio·STM32CubeMonitor처럼 전역 변수 값을 시간에 따라 그린다. 수업의 "버튼을 눌러 값을 높여보자" 같은 실습을 ST-LINK와 실물 보드 없이 할 수 있다.

1. 위 칸에 변수 이름을 넣고 **추가**(또는 Enter)를 누른다. 칸을 누르면 main.c와 추가 소스의 전역 변수가 제안된다. 8개까지 그릴 수 있고, 목록은 프로젝트에 저장되어 다음 실행에도 남는다.
2. 실행(Ctrl+F5)하면 **샘플 간격**(1·5·10·50·100 ms, 시뮬레이션 시간)마다 값을 읽어 꺾은선과 네모 표시로 그린다. 변수 칩 옆에 지금 값이 보이고, ×로 그래프에서 뺀다.
3. **시간 범위**(1~60 s)는 화면에 보이는 구간이다. 정지한 뒤에도 마지막 기록이 남고, **CSV 저장**은 시간(ms)과 변수별 열로 저장한다. **기록 지우기**는 그린 값을 비운다.

- 읽을 수 있는 식: 전역 변수, 배열 요소(`adc[0]`), 구조체 멤버(`point.x`, 해석 실행), 전역 변수끼리의 계산(`value * 2`). 지역 변수는 STM Studio처럼 읽지 않는다(어디서 실행 중이든 같은 전역 값을 읽는다).
- **해석 실행**은 해석기의 전역 변수를, **ARM GCC 빌드(에뮬레이터)**는 ELF의 심볼 주소에서 에뮬레이터 RAM 값을 읽는다(타입은 소스의 선언으로 정한다). 배열·구조체 전체, 없는 이름은 칩에 "읽기 실패"와 이유가 나온다.
- 실물 보드에서 STM Studio를 쓰려면 ARM GCC Debug 빌드의 `firmware.elf`(빌드 탭 **빌드 폴더 열기**)를 STM Studio에 넣으면 된다. 기본 빌드 폴더는 `%APPDATA%\STM32 Circuit Lab\native-builds\<빌드마다 새 폴더>`다. 1.25.0부터 디버그 정보가 DWARF 4라 STM Studio의 GDB가 읽는다(1.24.1까지는 "Dwarf Error: wrong version"이 났다).

## 로직 분석기와 선로 잡음

하단 **로직 분석기**는 UART TX/RX, I²C SDA/SCL, SPI SCK/MOSI/MISO/NSS, USART 동기 CK, 1-Wire 선로를 비트 단위 파형으로 보여 주고 프레임(바이트, ACK/NACK, 오류)을 해석합니다. 시간 범위는 200 µs~1 s이며 휠로 확대·축소, 끌어서 이동, **실시간 따라가기**로 최신 구간을 봅니다.

**선로 잡음**에서 비트 오류율, 글리치 확률, 지터를 지정하면 수신기가 잡음이 섞인 파형을 다시 샘플링합니다. UART 프레이밍·패리티 오류(`HAL_UART_ErrorCallback`), I²C NACK·버스 오류, 손상된 SPI 바이트를 그대로 관찰할 수 있으며 설정은 프로젝트에 저장됩니다.

## 0.24.0 캔버스 조작과 실시간 측정

- 휠은 커서 아래 좌표를 고정하여 확대·축소합니다. 트랙패드 핀치(ctrl+wheel)는 더 작은 단계로 움직입니다. +/− 버튼은 화면 중앙을 기준으로 하며 전체 보기와 무제한 배치 좌표를 유지합니다.
- Shift+빈 공간 드래그는 기존 선택에 부품 중심 및 경로 전체가 박스 안에 든 배선을 추가합니다. 일반 빈 공간/가운데 버튼 드래그는 화면 이동입니다. 마키 도중 Esc/포커스 이탈은 취소하고, 완료된 그룹의 Esc는 삭제합니다.
- 회로에 포커스가 있을 때 Ctrl/Cmd+A는 모든 부품·배선을, Ctrl/Cmd+D는 선택 항목을 내부 배선과 함께 복제합니다. 보드 표면은 기존 단일 보드로 유지합니다. 입력창/코드 에디터는 자체 단축키를 사용하며 실행 중 구조 변경은 막습니다.
- 배선 인스펙터에서 기본 10색·파스텔 10색을 변경합니다. Ctrl+Z로 복원되며 실행 중 스와치는 비활성화합니다.
- 핀·배선 측정에는 HIGH(≥2.0 V), LOW(≤0.8 V), ANALOG(중간), 부유(기준 전압 없음)를 함께 표시합니다. 실행 전은 미측정입니다. 이는 UI 표시 기준이며 기존 MCU 입력 판정 모델을 변경하지 않습니다.
- 시뮬레이션 틱은 측정값만 패치하여 인스펙터의 입력창/슬라이더/스크롤을 보존합니다. 추가 빵판 모델·선택 상태가 바뀌지 않으면 빵판 SVG를 다시 생성하지 않습니다.
