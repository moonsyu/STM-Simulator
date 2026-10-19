# 0.25.0 검증 증거

## 공개 실행 파일·업데이트

- [공개 검증 집계](public-verification.json): CI39214636630·v0.25.0 공개5자산·latest·태그/빌드 커밋/해시·ZIP 대조, 공개429판정·74상태·10시나리오·114모델·대비37,062건 저대비0/renderer 오류0.
- 단독/ZIP EXE 각각 의미론7조건과 즉시 종료·재열기 복원, native System·실제 C 토큰, 공개 Docs `tft`·`ref_st7735_8`·`uart` 3종의 코드/배선/실제 실행 로그를 포함합니다. 아래 개발 앱114장치 Docs 결과와 별도 범위입니다.
- 원본 공개0.24.0→0.25.0의 실제 스케줄러 검색·다운로드/SHA 검증·EXE 교체·새 main 재기동·재열기와 코드/Jellybean/글꼴17/장치 배율1.25/자동 업데이트 설정 보존을 확인했습니다.
- 직접 검토한 [White](public-white.png), [Dark](public-dark.png), [900폭·글꼴20 White](public-compact-white.png). [화면 manifest](public-screenshots.json)에 원본 상대경로·EXE SHA·PNG SHA를 기록했습니다. 900폭·글꼴20 Dark도 원본 검사 화면에서 직접 확인했습니다.

집계는 개인정보 검사를 통과했습니다. 모든 앱 검사 후 보조 수집기 manifest 저장에서 발생한 .NET 빈 경로 오류는 원본8증거 SHA·EXE 해시 재대조 및 같은 runId의 임시 manifest 저장 복구 후 수집기 재검증으로 마무리했습니다. 제품 수정·앱 재실행 없이 처리했으며 최초 실패 manifest는 별도 보존했습니다. 상세 이력은 [로그](../LOG.md)에 있습니다.

## 로컬 모델·테마

코드 영역의 [실제 토큰 색상](editor-theme-tokens.json)은 개발 Electron에서 System Dark/White를 전환하고 C 타입·함수·키워드·숫자·주석·문자열의 렌더링 색을 각각 고정 원본 테마 값과 대조한 결과입니다. `scripts/appearance-canvas-ui.cjs`로 재현할 수 있습니다. JSON/Java/Markdown/diff 전용 scope가 C에 섞이던 문제를 수정한 이후의 결과이며, 저장된 구버전 기본 테마의 재로딩과 사용자 colorscheme 보존은 `scripts/colorscheme-smoke.cjs`로 확인합니다.

2026-10-19 최종 SVG 소스를 별도 headless Chrome에서 검사한 결과입니다. 사용자 프로젝트·프로필·개인 경로는 포함하지 않습니다.

- [집계 JSON](rendering-summary.json): 라이브러리 114개 디코딩·idle 렌더 DOM 대조, 갤러리 80개 카드·78개 부품 렌더 대조, 검색 8개 결과와 렌더 소스 SHA-256.
- [대표 부품 연락판](models-01.png): 보드·빵판·LCD·LED·버튼·가변저항·UART·서보 등 12개.
- [구동기·통신 부품 연락판](models-09.png): TFT·매트릭스·모터·릴레이·드라이버·EEPROM 등 12개.
- [갤러리 검색](gallery-search-adc.png): `ADC 3핀`에 해당하는 5개 부품.

전체 114개 검사 결과의 대표 화면 3장만 보관합니다. 저장소에는 원본 로컬 증거를 대량 복사하지 않습니다. 위 PNG는 앞선 최종 화면 검사의 원본이며 JSON에 파일 해시를 기록했습니다. 기본 모델과 정지 상태의 표시를 검증한 것으로, 모든 실행 상태나 실제 STM32 펌웨어 실행 검사를 의미하지 않습니다.

## 재현

저장소 루트에서 의존성 설치 후 다음을 실행합니다. 독립 임시 HTTP 서버와 새 headless 브라우저를 사용하며 Electron과 사용자 브라우저 세션에 연결하지 않습니다.

```sh
node docs/audits/tinkercad-workbench/evidence/reproduce-rendering.cjs
```

기본 브라우저는 설치된 Google Chrome입니다. 다른 Chromium 실행 파일을 쓰려면 `STM_AUDIT_BROWSER` 환경 변수에 실행 파일 경로를 지정합니다. 스크립트는 기록된 소스 해시를 확인하므로 이 증거가 포함된 동일 렌더러 버전에서 실행해야 합니다.

결과는 `work/rendering-evidence-reproduction/result.json`과 PNG 3장에 저장됩니다. 기존 공개 증거와 원본 `work/tinkercad-render-final/`은 덮어쓰거나 삭제하지 않습니다. 화면 글꼴 등 운영체제 차이를 허용하며 픽셀 해시 일치가 아닌 SVG 요소·속성·텍스트, 접점 수, 검색 결과를 비교합니다.

프리뷰는 실제 idle 후처리를 포함하며, 갤러리는 정적 `renderParts` 결과와 대조합니다. 프리뷰의 클릭용 영역과 부품명만 제거하고 XML 속성의 namespace 직렬화만 정규화합니다. 요소 namespace는 비교에 포함합니다.

## Docs 코드·자동 배선 동작

- [소스 행동 판정](docs-behavior.json): 장치 114개, HAL 카드 979개, 단선 위치 701개, 전체 손상 회로 114개 통과. 사용자 코드/파일 보존, 반복 적용, 신호 분리와 복구 후 실행을 포함합니다.
- [개발 앱 로그 판정](docs-runtime.json): Docs 적용·실행 114개와 상태 이벤트 338개 대조. 적용 대상, 생성 코드/배선 일치, 실행 시간, 센서 입력/응답, TFT 전체 RAM 해시, 오류/fault 없음 조건을 확인했습니다.

Node 24에서 저장소 루트를 기준으로 실행합니다. 두 소스 단계를 순차 실행해 worker 2개를 유지합니다. 앱 검사는 별도 격리 프로필을 생성합니다.

```powershell
$env:DOCS_AUDIT_OUT = 'work/test-results/workbench-docs-0.25.0'
$env:DOCS_AUDIT_WORKERS = '2'
Remove-Item Env:DOCS_AUDIT_TYPES -ErrorAction SilentlyContinue
node scripts/docs-audit/audit.mjs core
node scripts/docs-audit/audit.mjs cards
node scripts/docs-audit/verify-behavior.mjs
node scripts/docs-audit/packaged.cjs --dev
node docs/audits/tinkercad-workbench/evidence/verify-docs-runtime.mjs
```

런타임 판정기는 기존 `scripts/docs-audit/verify.mjs`의 packaged 조건만 분리하며, 완료 summary·114개 로그·생성본·앱 저장본이 모두 있어야 통과합니다. 원시 로그는 위 `work` 경로에 보존하고 공개 JSON에는 개인 절대 경로를 포함하지 않습니다.

단선 위치별 검사는 연결/분리 상태를 확인하며 각 단선을 동적으로 재실행한 것은 아닙니다. 전체 손상 회로 114개는 복구 후 실제 시뮬레이션으로 재실행했습니다. API 카드의 호출/반환과 장치 전체 동작은 별도로 판정했습니다. 개발 Electron 결과를 공개 배포 EXE·자동 업데이트·물리 STM32·Bare-metal 실행 검증으로 확대하지 않습니다. 전체 `verify.mjs`의 추가 Bare-metal/migration/focused 자료는 이번 묶음에 없으며, 이전 원본 HAL 40개 전용 legacy 검사도 별도 범위입니다.
