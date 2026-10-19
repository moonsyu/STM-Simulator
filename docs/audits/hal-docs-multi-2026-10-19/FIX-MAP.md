# HAL Docs 여러 예제 적용 — 내부 검토 위치

2026-10-19 읽기 전용 검토입니다. 코드 위치는 후속 수정용으로 이 문서에 보관합니다. 제품 소스는 변경하지 않았으며 Electron 앱이나 사용자 프로필을 실행하지 않았습니다. 현재 작업 파일 기준 줄 번호이므로 이후 변경 시 함수명으로 다시 찾습니다.

## 확인된 동작

| 항목 | 판정 | 내부 위치와 이유 |
| --- | --- | --- |
| 서로 다른 장치의 예제 | 함께 적용 가능 | `src/device-assistance.js:145`, `:155`에서 장치 ID별 binding을 추가합니다. `:128`–`:136`의 `installCode()`는 전체 bindings를 main.c의 공통 초기화·실행 영역으로 합성합니다. UI에서는 각 장치를 선택해 차례로 적용합니다. |
| 같은 장치의 함수 카드 여러 개 | 누적 선택이 아니라 마지막 카드로 교체 | `src/device-assistance.js:150`, `:155`에서 같은 key의 binding 한 개를 새 api/mode로 교체합니다. `src/device-docs-ui.js:24`도 단일 api를 전달합니다. 현재 동작 제약으로 보고하며 이번 검토에서 변경하지 않습니다. |
| 카드에 다른 함수 호출도 포함되는 이유 | 선택한 호출까지 필요한 준비 코드를 포함 | `src/device-code-insertion.js:19`–`:23`의 `selectOperation()`이 첫 대상 호출까지 앞선 문장을 유지합니다. `src/device-inline-example.js:32`는 초기화/루프에서 선택 예제를 추출합니다. 임의의 카드 집합을 합치는 기능과는 다릅니다. |
| 전체 예제 버튼 | 선택 장치의 전체 recipe 적용 | `src/device-docs-ui.js:24`의 `api:'all'`은 그 장치의 전체 예제를 적용합니다. 모든 배치 장치 또는 모든 함수 카드를 한꺼번에 선택하는 기능은 아닙니다. |
| 별도 함수·파일 생성 | 현재 main.c에 직접 합성 | `src/device-assistance.js:134`–`:136`, `src/device-code-insertion.js:25`–`:37`. 기존 초기화 함수를 보완하고 main의 선언·초기화·반복 영역에 넣습니다. 기존 HAL 핸들은 재사용하거나 extern으로 참조합니다. |
| 장치 간 변수 이름 | 장치별 이름으로 분리 | `src/device-assistance.js:115`–`:126`에서 장치 인덱스별 prefix와 핀/핸들 재매핑을 적용합니다. 공통 핸들과 초기화는 `:129`–`:134`에서 합칩니다. |

같은 LED에 WritePin 적용 후 TogglePin을 적용한 Node 실험에서는 binding 수가 1이고 마지막 api가 `HAL_GPIO_TogglePin`이었습니다. 관리되는 STEP 영역에서 이전 WritePin 호출은 빠지고 TogglePin 호출이 남았습니다. 초기화의 WritePin까지 없어져야 한다는 의미는 아닙니다.

## 합성 제약과 보호 장치

| 구분 | 현재 동작과 제약 | 내부 위치 |
| --- | --- | --- |
| GPIO | 이미 설정되었거나 다른 장치와 연결된 핀을 피하고 합법적인 대체 핀을 찾습니다. 사용 가능한 핀이 없으면 적용을 거부합니다. | `src/device-assistance.js:48`–`:80`, 특히 `:51`, `:62`–`:73` |
| TIM/UART | 사용 중 자원과 충돌하면 사용 가능한 다른 타이머 또는 UART 및 해당 핀 조합을 찾습니다. 타이머 폭·채널/핀 제약과 자원 부족 때문에 임의의 장치 수를 무제한 합성할 수는 없습니다. | `src/device-assistance.js:53`–`:59` |
| I2C/SPI | 지원 버스의 핀은 공유할 수 있지만 설정이 다르면 거부합니다. 같은 I2C 버스의 중복 주소도 거부합니다. SPI 장치별 CS 등 일반 GPIO는 별도 배정합니다. | `src/device-assistance.js:58`, `:66`, `:152` |
| ADC | 채널 핀을 구분하고 각 장치 실행 앞에서 해당 ADC 채널을 다시 선택합니다. | `src/device-assistance.js:64`, `:74`, `:124`–`:126` |
| 클록과 고정 핀 | 일부 네오픽셀 장치는 필요한 클록이 있으며 기존 설정이 있는 프로젝트의 클록을 임의로 바꾸지 않고 오류를 알립니다. ARM 전용/특정 예제는 원래 핀 배치가 고정됩니다. | `src/device-assistance.js:50`, `:65`, `:143` |
| 사용자 코드 | 관리 영역 밖의 사용자 문장과 기존 초기화를 보존하고 관리 영역 직접 수정은 재적용 전에 거부합니다. 기존 기본 루프의 단독 `HAL_Delay(500)` 및 레거시 Docs hook은 정리 대상입니다. 임의 사용자 C 코드와 모든 장치 예제의 의미적 충돌을 자동 해결한다는 보장은 아닙니다. | `src/device-assistance.js:20`, `:148`–`:149`; `src/device-code-insertion.js:13`–`:15`, `:25`–`:37` |
| 실패 시 원본 보존 | 복제한 프로젝트에 배정·배선·코드 생성을 수행한 후 검증된 결과를 반환합니다. 실패한 적용이 호출자의 원본을 직접 바꾸지 않습니다. | `src/device-assistance.js:138`–`:159` |
| 실행 시간 | 각 장치 STEP을 main 루프에서 순서대로 실행합니다. HAL_Delay와 블로킹 통신은 뒤 장치의 실행을 늦춥니다. 독립 스레드나 동시에 진행되는 상태 기계로 자동 변환하지 않습니다. | `src/device-assistance.js:134`; UI 안내 `src/device-docs-ui.js:18` |
| 입력/통신 콜백 | Docs는 별도 콜백 함수를 만들지 않도록 UART 및 일부 EXTI 예제를 main 폴링으로 바꿉니다. 긴 대기와 합성되면 짧은 입력 변화 또는 통신 응답을 제때 처리하지 못할 수 있습니다. | `src/device-inline-example.js:7`–`:28`; PIR 제한 안내 `src/device-docs-data.js:23` |
| Bare-metal/ARM 전용 혼합 | 해당 binding이 하나라도 포함되면 ARM 빌드 대상으로 전환합니다. 그 조합을 회로 HAL 인터프리터에서 실행 검증했다고 표현하면 안 됩니다. | `src/device-assistance.js:157`–`:159`; `src/device-docs-ui.js:18` |

## 기존 단위검사가 실제로 확인하는 것

이번에 다음 명령으로 관련 검사 3개를 다시 실행했습니다. **통과 3, 실패 0, 이름 필터에 따른 제외 7**입니다. 전체 `device-docs.test.js` 또는 전체 저장소 검사 재실행 결과로 확대하지 않습니다.

```text
node --test --test-name-pattern="two selected devices|shared ADC and independent PWM|separate UART terminals" tests/device-docs.test.js
```

| 기존 검사 | 실제 검증 범위 | 한계 |
| --- | --- | --- |
| `tests/device-docs.test.js:25` — RGB 두 개 | GPIO 분리, STEP 영역 중복 없음, SimulationSession을 2.1초까지 실행한 뒤 fault 없음 | 각 RGB 채널의 시점별 색 변화는 직접 판정하지 않습니다. |
| `tests/device-docs.test.js:35` — 가변저항+NTC+서보+모터 | 두 PWM 장치의 타이머 분리, 2.5초 미만 SimulationSession 실행 후 fault 없음 | 모든 장치 출력값·ADC 값·서보 각도·모터 속도의 의미론을 이 검사 하나가 판정하지는 않습니다. |
| `tests/device-docs.test.js:41` — UART 두 개 / I2C 주소 충돌 | 서로 다른 UART 배정 및 두 터미널의 실제 `HAL UART ready` 수신, 중복 I2C 주소 적용 실패와 원본 불변 | 모든 UART 장치 조합이나 장시간 동시 송수신 검사는 아닙니다. |
| `tests/empty-workspace-inline.test.js:27` — 장치별 카드 삽입 | 각 카드를 각각 적용할 때 함수·파일이 늘지 않는지 및 같은 예제 재적용의 멱등성 | 같은 장치에서 여러 카드를 누적하는 검사도, 모든 카드의 합성 실행 검사도 아닙니다. 이번 이름 필터 실행 대상에 포함하지 않았습니다. |
| `tests/empty-workspace-inline.test.js:36`, `:43` | 사용자 main/초기화 코드 보존, 단일 UART Docs 폴링 echo 실행 | 여러 장치의 임의 사용자 코드까지 안전하다는 근거는 아닙니다. 이번 이름 필터 실행 대상에 포함하지 않았습니다. |

## 이번 추가 Node 실행 확인

제품 코드를 수정하지 않고 `applyDeviceExample()`을 장치별로 적용한 뒤 `SimulationSession`으로 약 3~3.5초까지 실행했습니다. 이 표는 소스 기반 실행 결과이며 실제 Docs UI 조작이나 배포 EXE 검사 결과와 구분합니다. 별도의 장치 조합 전체 검사 로그를 생성하지 않았습니다.

| 조합 | 관찰한 결과 |
| --- | --- |
| LED + 버튼 | 서로 다른 출력 핀으로 배정되고 LED 상태와 버튼 읽기 로그가 생성됨. fault 없음. |
| 가변저항 + NTC + 서보 + 모터 | ADC1의 PA0/PA1을 구분하고 TIM2/TIM3을 배정. `1.650 V`, `NTC=25.0 C`, 서보 명령, 모터 명령 로그 및 서보/모터 상태 확인. fault 없음. |
| SHT31 + OLED | I2C1의 같은 SDA/SCL을 공유. 센서 측정 로그와 OLED 전송 성공·화면 메모리 갱신 확인. fault 없음. |
| SHT31 두 개, 주소 0x44/0x45 | 공통 I2C 버스에서 두 측정 예제가 실행되고 두 장치 상태가 갱신됨. fault 없음. |
| TFT + LED 매트릭스 | SPI1을 공유하고 서로 다른 제어 핀 배정. TFT RGB565 전송 로그와 매트릭스 프레임 로그, 두 장치 표시 상태 확인. fault 없음. |

추가로 LED WritePin/TogglePin/Delay 단일 카드도 각각 100ms까지 실행되어 fault가 없음을 확인했습니다. 이 표의 다섯 조합 및 기존 세 검사에서 새 합성 결함은 재현하지 못했습니다. **임의 장치 조합 전체·모든 함수 카드 조합·실제 STM32 하드웨어를 전수검사했다는 뜻은 아닙니다.** 같은 장치 카드 교체, 자원 제한, 순차 실행 지연은 위에 기록한 현재 제약입니다.
