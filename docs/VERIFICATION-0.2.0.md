# 검증 기록 — 0.2.0

검증일: 2026-09-06. Windows x64, Node.js 24.19.0, Electron 44.2.0.

## 회로·배치·파일 형식

`node --test tests/circuit.test.js`: 22개 통과.

기존 17개 회로·인터프리터 검증에 다음 내용을 추가했습니다.

- 저항·LED·4핀 버튼·16핀 LCD를 장착했을 때 모든 단자가 빵판 구멍과 정확히 같은 좌표를 사용하는지 확인했습니다.
- 모든 다리가 들어가지 않거나 구멍을 다른 부품이 점유한 경우 장착을 거부합니다.
- 4핀 버튼의 같은 쪽 두 다리는 항상 연결되며 누를 때 양쪽이 연결됩니다.
- 45° 회전, 360° 순환, LCD 16개 단자의 저장·복원과 잘못된 단자 거부를 확인했습니다.
- 버전 1 회로를 버전 2로 변환한 뒤 기존 부품 위치와 버튼 입력 동작을 확인했습니다.
- 공백·대소문자를 포함한 PC 13, PA 8, Arduino 별칭, 헤더 번호 검색을 확인했습니다.

## 실제 앱 조작

개발용 Electron 및 `dist/win-unpacked/STM32 Circuit Lab.exe`에서 아래 두 스크립트를 모두 통과했습니다.

`scripts/ui-smoke.cjs`: 기존 LED 실행, 배선 추가·되돌리기, LED 장착, 버튼 누르기·떼기, ADC 출력, 실행 한도, 실제 IPC 파일 저장·불러오기.

`scripts/editor-smoke.cjs`:

1. 저항·LED의 두 점 설치, 정확한 다리 좌표.
2. 빵판 구멍을 가린 부품 몸체의 클릭 우선순위.
3. R로 45°씩 8회 회전하고 원래 각도로 복귀.
4. 배선 색상 10개 모두 변경하고 자동 저장 결과 확인.
5. 연결 도중 Esc 취소, 선택한 부품·배선 Esc 삭제, 되돌리기.
6. LED 드래그 장착, 버튼 모형 생성·4핀 장착·분리.
7. LCD 모형 생성·회전 버튼·16핀 장착·핀에 배선 연결.
8. 실제 IPC 파일 입출력으로 각도·핀 연결·배선을 저장하고 복원.
9. PC 13 검색·확대, PA 8의 Arduino/Morpho 위치 동시 강조.
10. renderer JavaScript 오류 없음.

기록: `test-results/ui-smoke.json`, `test-results/editor-smoke.json`.
패키징된 앱 화면: `test-results/04-editor-updates.png`.

## 최종 단일 EXE

`scripts/portable-smoke.cjs`로 `dist/STM32-Circuit-Lab-0.2.0-win-x64.exe`를 직접 실행하여 통과했습니다. 앱 추출·창 열기, 400개 빵판 구멍, 10개 배선 색상, PC 13 검색, LED 회로 실행을 확인했습니다. 전체 편집 검증은 동일 패키지의 `win-unpacked` 앱 본체에서 수행했습니다.

- 파일 크기: 100,401,004 bytes
- SHA-256: `863492A9E6872CEE64B64B0DA9EFA63071437EF9D8C5750E06EA97969F67EBB8`
- 직접 실행 결과: `test-results/portable-smoke.json`
- 업데이트 화면: `docs/editor-preview-0.2.0.png`
- 사용 안내: `dist/사용방법.txt`

## 해석 범위

LCD는 배치·배선 모형이며 HD44780 명령 실행이나 문자열 표시는 포함하지 않습니다. 부품 다리는 약간의 굽힘을 허용하여 정확한 구멍 좌표에 연결합니다. 이 검증은 실제 부품 치수 전체를 검사하는 기계 CAD, 실제 STM32 CPU 명령·ELF/BIN 펌웨어 또는 전체 주변장치의 동등성 검증이 아닙니다.

이전 0.1.0의 검증 기록은 `VERIFICATION.md`에 보존했습니다.
