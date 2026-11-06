# ADC 실행 중 값 반영 · 연속 변환 수정 계획

작성 2026-11-06. 상태: **계획(구현 전)**.

## 1. 보고된 현상

가변저항(POT, 1=GND · 2=PA0 ADC · 3=3.3 V)을 연결하고 아래 코드를 실행한 뒤, 실행 중에 속성 패널의 **가변 접점 위치**를 바꿔도 출력되는 ADC 값이 바뀌지 않는다.

```c
/* USER CODE BEGIN 2 */
HAL_ADC_Start(&hadc1);          // 한 번만 시작
/* USER CODE END 2 */
while (1) {
    adc_val = HAL_ADC_GetValue(&hadc1);   // 결과 레지스터만 반복해서 읽음
    printf("value: %d\r\n", adc_val);
    HAL_Delay(100);
}
```

## 2. 확인한 사실

커밋된 코드(1.19.0, `3ec1495`)를 내려받아 node로 확인했다.

| 경우 | 접점 50 % → 90 % | 판단 |
|---|---|---|
| ADC 예제(매 루프 `Start` + `PollForConversion`) · 내장 해석기 | 2047 → 3685 | 정상 |
| 같은 예제 · ARM GCC 펌웨어 에뮬레이터(`potentiometer.elf`) | 2047 → 3685 | 정상 |
| 위 코드(`Start` 한 번, `GetValue`만 반복) · 내장 해석기 | 2047 → 2047 | 실제 보드와 같음 |

- 회로 엔진과 두 실행 엔진은 실행 중 접점 변경을 반영한다. 속성 패널의 접점 슬라이더는 실행 중에도 바꿀 수 있다(`part-controls.js`, `data-live="true"`).
- 값이 그대로인 이유는 **단일 변환 모드**다. 앱이 생성하는 `MX_ADC1_Init`은 CubeMX 기본값처럼 `ContinuousConvMode = DISABLE`이다(`hal-generator.js`). 이 모드에서는 `HAL_ADC_Start` 한 번에 변환이 한 번만 일어나고, 그 뒤의 `GetValue`는 같은 결과를 계속 돌려준다. 실물 NUCLEO에서도 같다.
- 앱의 Pinout에는 **Continuous Conversion Mode**를 켤 방법이 없다. 그래서 CubeMX에서처럼 "연속 변환을 켜고 Start 한 번 후 GetValue만 반복"하는 코드를 앱에서 만들 수 없다. 이 차이는 `docs/CUBEMX-GAPS.md`의 ADC 항목(단일 변환만)에 이미 적혀 있다.
- 에뮬레이터 ADC는 연속 변환을 레지스터 단위로 지원한다(`emu/stm32f446/adc.js`). 내장 해석기도 변환 반복 구조가 있다(`hal.js`의 ADC 변환 루프). 생성 코드와 설정 UI만 막혀 있다.

## 3. 수정 계획

1. **Pinout ADC1 설정에 Continuous Conversion Mode 추가** (F446RE·F103RB)
   - `mcu-config.js`: `peripherals.ADC1.continuous`(기본 false)를 검증·저장하고, `.ioc` 가져오기·내보내기(`ADC1.ContinuousConvMode`)를 연결한다.
   - `pinout-ui.js`: ADC1 패널에 CubeMX와 같은 이름의 Enabled/Disabled 선택을 둔다.
   - `hal-generator.js`: 켜면 `hadc1.Init.ContinuousConvMode = ENABLE`. 끄면 지금과 같은 생성 결과(기존 예제·테스트가 그대로).
2. **실행 엔진 확인과 보완**
   - 내장 해석기: `ContinuousConvMode = ENABLE`이면 `HAL_ADC_Start` 한 번 뒤에도 변환을 반복해, `GetValue`가 접점 변경을 따라가게 한다. 지금 단일 모드 동작(값 고정)은 유지한다.
   - ARM GCC 에뮬레이터: 같은 코드를 실제 빌드해 연속 변환에서 값이 따라가는지 확인한다(모델은 있음).
3. **틀리기 쉬운 경우 안내** (선택)
   - 단일 변환 모드에서 새 변환 없이 `HAL_ADC_GetValue`를 반복 호출하는데 입력 전압이 바뀌었으면, 실행 로그에 한 번 알린다. 예: "단일 변환 모드입니다. 매번 HAL_ADC_Start · HAL_ADC_PollForConversion을 부르거나 Pinout에서 Continuous Conversion Mode를 켜세요."
4. **테스트**
   - 단위: 생성 코드(`ContinuousConvMode` ENABLE/DISABLE), `.ioc` 왕복, 해석기에서 연속 모드 + Start 한 번 → 접점 변경이 반영되고 단일 모드는 고정.
   - 펌웨어 픽스처 또는 toolchain 시험: ARM GCC 빌드 + 에뮬레이터에서 같은 확인.
   - E2E(창은 다른 창 뒤, 다크 모드): 실행 중 속성 패널 슬라이더를 움직이면 직렬 모니터·로그의 ADC 값이 바뀐다.
5. **문서**: `docs/CUBEMX-GAPS.md` ADC 항목에서 Continuous를 지원으로 옮기고, `docs/HAL-API.md`·`docs/IDE.md`의 ADC 설명과 업데이트 로그를 고친다.

## 4. 지금 바로 쓸 수 있는 방법

연속 변환 설정이 생기기 전에는 매 루프에서 변환을 시작하고 끝날 때까지 기다린다.

```c
while (1) {
    HAL_ADC_Start(&hadc1);
    if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
        uint32_t adc_val = HAL_ADC_GetValue(&hadc1);
        printf("value: %lu\r\n", adc_val);
    }
    HAL_Delay(100);
}
```
