# GitHub Light Default

White 화면의 기본 코드 테마는 GitHub 공식 확장 GitHub Theme의 Light Default 6.3.5입니다. 원본 JSON과 MIT 라이선스를 포함하고, 빌드 시 `source.json`의 SHA-256을 확인한 다음 기존 colorscheme 등록기로 Monaco 표현으로 변환합니다. 인터넷 연결 없이 사용할 수 있습니다. 원본의 TextMate 색상 중 지원하는 C/C++ 토큰을 대응하며 VS Code 자체의 문법 엔진이나 semanticTokenColors 전체를 복제하지 않습니다. 화면·버튼·시뮬레이터 팔레트는 이 코드 테마와 독립적입니다.

2026-10-15 공식 Marketplace 설치 수와 GitHub 별을 비교했습니다. 수치는 각 확장 전체의 누적 수이며 Light 변형만의 수치나 모든 테마 중 순위는 아닙니다.

| 후보 | Marketplace 설치 | GitHub 별 |
| --- | ---: | ---: |
| [GitHub Theme](https://marketplace.visualstudio.com/items?itemName=GitHub.github-vscode-theme) | 20,360,458 | 2,041 |
| [Atom One Light](https://marketplace.visualstudio.com/items?itemName=akamud.vscode-theme-onelight) | 1,456,755 | 91 |

두 후보 중 사용 규모가 큰 GitHub Theme를 선택했습니다. 원본 저장소: [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme), 비교 저장소: [akamud/vscode-theme-onelight](https://github.com/akamud/vscode-theme-onelight).

다운로드: [공식 Marketplace VSIX](https://marketplace.visualstudio.com/_apis/public/gallery/publishers/GitHub/vsextensions/github-vscode-theme/6.3.5/vspackage). `extension/themes/light-default.json`과 `extension/LICENSE.txt`를 그대로 보존합니다. 원본 파일에는 `type`이 없어 확장 매니페스트의 `vs` 정보를 변환 입력에만 추가합니다.
