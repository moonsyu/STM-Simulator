# 후속 수정용 위치 기록

사용자 화면 보고에는 코드 위치를 나열하지 않고 이 문서에 보관한다.

| 문제/기능 | 수정 위치 | 재현·검증 |
|---|---|---|
| 복합/동적 GPIO 마스크가 이전 포트를 제어 | src/device-gpio-remap.js, src/device-assistance.js의 remapCode | tests/legacy-docs.test.js의 split-port 사례, scripts/docs-audit/remapped.mjs |
| Docs 미리보기가 배정 핀/주소/타이머와 불일치 | src/device-example-preview.js, src/device-docs-ui.js | LED PA5 예약, 서보 TIM2 예약, SHT31 0x45 |
| 최초 폴링 상태를 이벤트로 처리, 에지 방향 누락 | src/device-inline-example.js의 mainOnlyRecipe | USER 버튼의 FALLING 1회만 출력 |
| PIR/엔코더 문서가 실제 Docs 방식과 불일치 | src/device-docs-data.js, src/device-defs.js | Docs polling / TIM4, 원본 EXTI 유지 |
| main 코드 초기화/이전 Docs 재삽입 방지 | src/code-reset.js, src/app.js, index.html | tests/code-reset.test.js, scripts/code-reset-check.cjs |
| 기존 예제 검증 경로 누락 | scripts/docs-audit/legacy.mjs, verify-legacy.mjs | HAL_EXAMPLES에서 카탈로그를 제외한 40개 원본 실행 |
| 실제 ARM 빌드 검증 | scripts/device-docs-arm-check.cjs --legacy | 원본 40 + reset 4 + split-port 2 |

증거는 work/test-results/docs-audit-0.23.3/ 및 code-reset-dev/public.json. 공개 파일 해시는 release-0.23.3-proof.json에서 확인한다. 초기 조사 중 실패 로그와 최종 결과를 혼동하지 않는다.
