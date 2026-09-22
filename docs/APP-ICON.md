# STM Simulator 앱 아이콘

2026-09-22, Codex 내장 image_gen 도구로 만든 앱 전용 그림입니다. 입력 참고 이미지는 사용하지 않았습니다. 초록색 타일, 아이보리 칩, 사각 신호 파형과 금색 점으로 시뮬레이터를 표현합니다.

- 원본 PNG: `desktop/icons/stm-simulator.png`
- Windows ICO: `desktop/icons/stm-simulator.ico` (16/20/24/32/40/48/64/128/256px)
- 적용 위치: 앱 창·작업 표시줄, portable EXE·내부 EXE, 웹 파비콘
- PNG에서 ICO 재생성: `npm run build:icon`. Electron nativeImage로 크기를 변환하고 투명도를 보존해 ICO로 묶습니다.
- 빌드에서는 `signExecutable: false`로 코드 서명을 생략하면서 아이콘·제품명 리소스 편집을 적용합니다. `signAndEditExecutable: false`는 아이콘 편집도 막으므로 사용하지 않습니다.
- 패키지 검사는 실제 portable EXE와 내부 EXE의 기본 아이콘 리소스가 원본 ICO와 일치하는지 확인합니다.

## 생성 프롬프트

```text
Use case: logo-brand. Create one finished Windows desktop application icon for STM Simulator, a friendly STM32 circuit and HAL-code simulator whose interface uses sage green and warm ivory. A square 1024x1024 image: one large deep sage-green rounded-square tile occupying about 90% of the canvas, with actual transparent pixels outside the rounded silhouette. Within it, a bold warm-ivory microcontroller chip symbol with three chunky short pins on each of its four sides. In the middle of the chip, a simple deep-green square-wave signal path with one small muted-gold signal dot. Polished restrained app-icon design with very subtle dimensional edge shading, centered, high contrast, generous spacing, instantly readable at 32px and 16px. No letters, no words, no ST logo or manufacturer branding, no watermark, no surrounding mockup or extra objects. One icon only, no variant sheet. Preserve actual transparent alpha outside the icon.
```
