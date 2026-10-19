# 부품·배선 렌더링 변경과 검증

## 참고와 범위

- 사용자 첨부 회로 화면의 가는 유색 점퍼, 둥근 경유점, 위에서 본 부품/금속 접점, 흰색 빵판의 어두운 접점과 명확한 전원 레일을 기준으로 기존 SVG를 직접 수정했습니다. 외부 사진·SVG·브랜드 자산은 복제하지 않았습니다.
- 보드는 기존 NUCLEO-F446RE이며 108개 보드 헤더 접점, 400개 빵판 홀, 부품 전기 정의·HAL·저장 좌표를 변경하지 않았습니다. 부품별 실제 치수의 기구 도면이 아니라 기존 회로 격자에 맞춘 학습용 평면 모형입니다.
- 카탈로그 78종과 기존 부품 34종, 빵판과 보드까지 라이브러리 114항목을 검사합니다. 카탈로그의 여러 핀 변형은 기존 핀 순서와 개수를 그대로 씁니다.

## 구현

- `src/wire-path.js`: `roundedWirePath(points, radius=6)`는 저장된 점 배열을 변경하지 않습니다. 끝점은 정확히 유지하고 각 굴곡에 quadratic Bézier를 넣으며 각 인접 구간 길이의 절반을 넘지 않게 제한합니다. 중복점·일직선·역방향·음수/원거리 좌표·비정상 입력을 처리합니다.
- `src/render.js`: 실제 배선의 외형/그림자/클릭 경로가 같은 helper를 씁니다. 표시 두께는 2.6, 클릭 영역은 기존 CSS의 넓은 범위를 유지합니다. Nucleo의 금속 Mini-USB, Morpho 핀/Arduino 소켓, 칩 표기 및 빵판의 홈·홀 테두리·내부 금속 접점·양쪽 행/열/레일을 개선했습니다.
- 부품의 다리는 어두운 금속 테두리와 밝은 중심선으로 구분합니다. 기존 부품은 실제 단자 순서의 이름을 표시하여 비슷한 카탈로그 모형의 다른 핀 순서를 표시하지 않습니다. 회전·비율·기울기·빵판 실장 끝점의 계산 경로는 유지합니다.
- `src/catalog-render.js`: 공유 PCB 가장자리·장착홀·IC 다리·금속 나사 단자·핀 1의 사각 패드를 개선했습니다. 저항 값에 맞는 색띠, LED의 캐소드 평면/렌즈/리드 프레임, 버튼의 금속 덮개, 전해 커패시터 상면, 슬라이드 스위치, LCD의 녹색 문자창, HC-SR04 금속 격자, 서보 혼, 조이스틱/인코더 노브, USB UART 케이블, 모터 드라이버를 구체화했습니다.
- `src/catalog-view.js`: 새 슬라이드 손잡이도 실시간 위치를 반영하며 LCD 문자/CGRAM은 녹색 문자창의 원래 픽셀 색으로 표시합니다. LED/RGB 발광, 버튼, 모터/서보, 7세그먼트, 릴레이, OLED/TFT/matrix 메모리 canvas hook은 보존합니다.
- 루트 구현에서 `wire-draft.js`의 작성 중 배선과 `app.js`의 net 강조에도 같은 helper를 사용합니다.

## 순수 회귀 결과

2026-10-19 로컬 Node 24에서 `tests/wire-path.test.js`, `tests/render-models.test.js`, `tests/catalog.test.js` 총 23개 성공. 이후 UART 케이블/드라이버 세부 조정 후 새 렌더 테스트 10개를 다시 실행하여 성공했습니다.

- 114항목의 SVG 생성과 오류 좌표 부재, 프로젝트/부품 정의 불변.
- 각 부품의 모든 표시 접점과 실제 전기 끝점 일치; 45° 회전·X/Y 비율·기울기·음수 위치·빵판 실장에서도 동일.
- 빵판 400홀과 Nucleo 헤더의 원래 좌표 유지.
- 78종 카탈로그의 모든 물리 핀 라벨과 OLED 128×64/TFT 128×160/matrix 8×8 메모리 크기 보존.
- 슬라이드 위치·LCD·발광 hook의 실제 속성 갱신.
- 둥근 경로, 짧은 구간, 중복·역방향, 입력 불변, 불량 좌표 차단, 외형/선택/클릭 경로 일치.
- 기존 카탈로그 테스트에는 HAL 예제 실행·실제 회로 결과·자동 배선·Docs 삽입 검사가 포함되어 있으며 모두 통과했습니다.

## 화면 검수 1차와 수정

`work/tinkercad-render-probe.cjs`로 독립 Electron 프로필에서 114개 실제 미리보기 이미지를 모두 디코딩하고, Light/Dark 회로 화면과 12개씩 나눈 모델 10장을 저장했습니다. pageerror 0, 이미지 디코딩 실패 0. 결과는 `work/tinkercad-render-review/render-review.json`, `models-01.png`~`models-10.png`, `circuit-light.png`, `circuit-dark.png`입니다.

10장의 직접 확인에서 추가로 발견·수정한 사항:

- 핀명과 PCB 실크/센서 외형의 겹침: 핀명은 실제 단자 밖으로 이동, 4자 축약 및 전체 title 보존. 초음파 중복 실크 제거.
- OV2640 등 2열 헤더가 하나의 패드 행으로 투영되던 문제: 같은 열의 행 간격을 유지. 전체 카탈로그의 패드 좌표가 중복되지 않는 회귀 검사를 추가.
- 기존 L298N·I²C/SPI·LCD·LDR/NTC 등의 축소된 몸체와 다리 시작점 사이의 시각적 단절: 전기 끝점은 유지하고 몸체 쪽 시작점을 실제 표시 경계에 연결. LDR/NTC bare 소자 중심과 리드 모양을 정리하고, 해당 패키지 안으로 다리가 이어지는 회귀 검사를 추가.

이 1차 PNG는 위 추가 수정 전 화면입니다. 아래 최종 증거가 이를 대체합니다. 배포 파일/실제 회로 실행 확인은 통합 결과에 별도 기록합니다.

## 최종 화면 재검사와 접점 보완

2026-10-19, 사용자 브라우저/프로필 및 Electron에 접근하지 않는 별도 **headless Chrome 155**에서 현재 소스를 임시 localhost 서버로 열고 다시 검사했습니다. 재현 스크립트는 `work/tinkercad-render-final-probe.cjs`입니다.

최종 검수 중 초기 프리뷰와 실제 정지 화면의 LED 등 표시색이 달라지는 경로를 확인했습니다. `part-preview.js`도 실제 화면과 같은 `updateSimulationSvg(..., null, {})` 후처리를 호출합니다. 보드가 없는 단일 부품 SVG에서도 동작하도록 `render.js`의 내장 LED 접근에 null 검사를 추가했습니다.

추가로 발견한 몸체·접점 문제와 수정:

- 기존 motor, relay, stepper, DC motor, DC supply 등에서 새 몸체가 원래 핀을 가렸습니다. `model-geometry.js`의 공유 표시 배율 계산으로 기존 전기 끝점을 움직이지 않고 몸체만 핀 사이에 맞춥니다. TFT 등은 표시 몸체 경계에서 금속 리드를 시작합니다.
- TO-92, 방수 온도 프로브, bare RGB, SPDT, 트리머, L298N/P 등은 정의된 배치용 사각형보다 실제 패키지가 작아 리드가 떨어져 보였습니다. 실제 패키지 안에서 커넥터 패드까지 금속 리드를 그려 연결합니다. 원형 렌즈에서도 리드 시작점이 몸체 안에 놓이도록 내부 타원으로 제한합니다.
- 접점 원은 몸체 다음에 그립니다. HAT의 PCB 내부 헤더 접점도 배경에 가려지지 않습니다. UART는 기존 유색 케이블 끝에 이어 그리며 2핀의 중복 리드와 bare L298의 몸체 밖 전원 표시점을 제거했습니다.
- 저장된 핀 ID·좌표, 전기 정의, HAL 및 자동 배선 계산은 변경하지 않았습니다.

수정 전 실패 화면은 `work/tinkercad-render-before-contact-fix/`에 별도로 보존했습니다. 이 폴더의 `models-05.png`~`models-09.png`에서 분리된 bare 리드와 가려진 기존 접점을 비교할 수 있습니다.

최종 증거는 **`work/tinkercad-render-final/`**에 있습니다.

- `models-01.png`~`models-10.png`: 114항목 전체 연락판. 10장 모두 직접 열어 핀 라벨, 두 줄 패드, 몸체와 리드의 연속성, 가려진 접점 유무를 재확인했습니다.
- `regression-details.png`: 기존 LCD/7세그먼트/L298N/I²C/SPI/온도센서/가변저항/스위치/LDR/NTC와 OV2640 2열 패드의 확대 비교.
- `circuit-light.png`, `circuit-dark.png`: 실제 파일 입력으로 연 버튼+LED 회로의 White/Dark 화면. 두 장 모두 직접 확인했습니다. `workbench-light.png`, `workbench-dark.png`도 함께 저장했습니다.
- `svg/`: 114항목의 실제 프리뷰 SVG 원본.
- `render-final.json`: 모델 114개 디코딩 성공, 프리뷰와 실제 idle 렌더 DOM 일치 114개, pageerror 및 console error 0, 검사 도중 렌더 소스 해시 불변. 비교에서는 프리뷰 전용 히트 영역/부품명 제거와 XML 속성 namespace 직렬화 차이만 정규화하며, 요소 namespace·핀·도형·색·문자는 비교합니다.
- `unit-tests.txt`: 최종 `render-models`, `wire-path`, `catalog` **26/26 성공**. 기본/변환/실장 접점 유지, 몸체가 핀을 가리지 않음, 패키지 내부에서 패드까지의 리드 연결, 원래 HAL/Docs 회귀를 포함합니다.

이 검수는 기본 모델과 대표 회로의 표시, 원래 전기 좌표와 변환/실장 보존을 확인합니다. 114항목 각각의 모든 실행 상태에 대한 시각 검증을 뜻하지는 않으며, 실제 실행·키보드·배포 검증은 통합 검수에 별도로 남깁니다.

## 보드 텍스트 계약과 공개 갤러리 최종 반영

기존 배치 공간 텍스트 제거 계약에 맞춰 보드 모형에 새로 넣었던 STM32/F446RE/NUCLEO/MB1136 실크 문자를 제거했습니다. ARM Cortex-M4, USER·PC13, LD2·PA5 등 기능 표기와 108개 접점, 검색 카드의 NUCLEO-F446RE 제품명은 유지합니다. 이 변경 후 `render-models`와 `wire-path` **13/13 성공** 결과를 `work/tinkercad-render-final/board-contract-tests.txt`에 저장했습니다.

`scripts/build-model-gallery.mjs`는 부품 몸체와 리드를 별도로 조합하던 코드를 제거하고 앱의 `renderParts`를 직접 사용합니다. 따라서 공유 `model-geometry`의 몸체 배율·리드 시작점·패드 배치가 `docs/device-model-gallery.html`에도 반영됩니다. 기존 80개 검색 카드의 이름·인터페이스·핀 설명·출처는 유지했습니다. 갤러리는 정적 기본 렌더 모형이며, 앱 프리뷰는 여기에 실행 상태 표시 후처리를 적용합니다.

최종 headless 검사에서 갤러리 부품 78개의 SVG DOM이 실제 `renderParts` 결과와 모두 일치하고, 핀 개수와 80개 카드의 이름·출처 URL을 확인했습니다. 오류 0이며 결과는 `render-final.json`의 `gallery` 항목에 있습니다. 최신 보드 수정 후 114개 연락판과 White/Dark 회로도 다시 생성했습니다. 갤러리 상단 및 DC 모터·TMP36 검색 결과(`gallery-top.png`, `gallery-motor.png`, `gallery-temperature.png`), `models-01.png`의 보드, White/Dark 회로를 직접 열어 최종 화면을 확인했습니다.

생성 HTML의 검색 정규식은 실제 `/\s+/`이며 템플릿 소스의 이중 이스케이프가 정상임을 확인했습니다. 검색 안내와 달리 인터페이스 문자열이 검색 대상에서 빠져 있던 기존 문제를 수정했습니다. 별도 headless Chrome에서 다중 단어·역순·탭/연속 공백·대소문자·일치 없음·초기화 검색 8건을 검사했습니다. `ADC 3핀`은 수정 전 0건에서 해당 부품 5건으로 바뀌었으며 오류 0입니다. 결과는 `work/tinkercad-render-final/gallery-search.json`, 직접 확인한 화면은 `gallery-search-adc.png`입니다.

## 저장소에 보관한 공개 증거

[재현 안내와 범위](evidence/README.md), [집계 JSON](evidence/rendering-summary.json), [재현 스크립트](evidence/reproduce-rendering.cjs)를 함께 보관합니다. 최종 연락판 중 [대표 부품 12개](evidence/models-01.png)와 [구동기·통신 부품 12개](evidence/models-09.png), [갤러리 검색 결과](evidence/gallery-search-adc.png)만 공개용 대표 화면으로 복사했습니다. 원본 로컬 증거는 유지했습니다.

공개 자료는 저장소 상대경로와 합성 기본 부품만 포함합니다. 재현 스크립트를 독립 headless Chrome에서 실제 실행하여 **114개 모델·80개 갤러리 카드·78개 렌더 대조·검색 8건**을 다시 통과했습니다. 재현 출력은 `work/rendering-evidence-reproduction/`에 별도로 저장됩니다.
