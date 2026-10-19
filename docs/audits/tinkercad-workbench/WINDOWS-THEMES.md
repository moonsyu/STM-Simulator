# Windows 밝은/어두운 모드 참고

2026-10-19 사용자 추가 지시: White/Dark는 Windows의 밝은/어두운 모드를 참고합니다.

- 참고: [Microsoft Color in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/color), [Theming in Windows apps](https://learn.microsoft.com/en-us/windows/apps/develop/ui/theming). 2026-10-19 확인. 중성 표면, 중요도에 따른 명도 구분, 절제된 강조색, 사용자 모드 자동 추종과 대비 검증을 적용합니다.
- White: 흰 작업 공간/입력, 연회색 패널과 도구 모음, 짙은 글자, 파란 선택·포커스. Dark: #202020 작업 공간, #272727 패널, #303030 도구 모음, 밝은 글자와 밝은 파란 강조색. 색상값은 이 Electron UI의 대비를 위해 선택한 값이며 Windows API 리소스의 완전한 복제라고 주장하지 않습니다.
- 기존 System은 Windows 앱 모드의 `prefers-color-scheme` 변경을 반영합니다. Dark/White 직접 선택은 시스템 변경에 영향을 받지 않으며 System을 다시 선택하면 자동 반영합니다. 사용자 OS 설정은 변경하지 않습니다.
- 초기 네이티브 창 배경도 `nativeTheme.shouldUseDarkColors`로 선택합니다. 등록된 Jellybeans/GitHub Light/사용자 colorscheme는 코드 영역에만 적용합니다. 사용자 테마 선택·가져온 테마·직접 지정한 색은 보존하며, 저장된 기본 테마에서 확인된 이전 scope 변환 오류만 교정합니다. 기존 저장 fixture를 다시 불러와 정상 색 복원과 사용자 설정 보존을 확인했습니다.
- 언어별 scope 변환 수정 후 관련 단위27개, 실제 Electron colorscheme 등록·내보내기·재시작·사용자 색 검사, 전체 단위397개가 통과했습니다. GitHub/Jellybeans의 실제 C 토큰 색과 Electron nativeTheme의 System 자동 전환도 다시 확인했습니다.
- 소스 위치는 내부 기록에만 남깁니다. 실제 두 테마, 글꼴 크기, 메뉴/설정/Pinout 및 System 전환 검증은 같은 감사의 최종 결과에 기록합니다.
