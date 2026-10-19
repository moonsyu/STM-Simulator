# 시스템 경계

Windows 사용자는 하나의 Electron 앱에서 코드·회로를 편집합니다. renderer는 로컬 정적 코드와 Monaco를 실행하고, sandbox/contextIsolation이 켜진 preload의 제한된 IPC를 통해 main 프로세스의 파일·도구·업데이트 기능을 사용합니다.

[시스템·UI·저장 흐름 그림](diagrams/rendered/architecture-overview.svg)에서 프로세스 경계와 배포 경로를 확인할 수 있습니다. [편집 가능한 원본](diagrams/src/architecture-overview.cjs)은 외부 의존성 없이 SVG를 생성합니다.

- 로컬 상태: 회로 autosave, 독립 IDE 설정, 도크 배치. 명시적 저장은 .stm32lab 또는 프로젝트 폴더 트랜잭션을 사용합니다.
- 외부 경계: 사용자 선택 프로젝트/도구, 기존 GitHub 공개 Release 업데이트. 이번 UI 개선은 새 네트워크 서비스/권한/계정 경계를 만들지 않습니다.
- 참고 자료: Tinkercad 사용자 탭은 읽기 전용 참고입니다. 이미지나 회로 내용을 앱의 원격 실행 의존성으로 사용하지 않습니다. 배포본은 자체 SVG를 포함합니다.
- 실행 범위: 지원 C/HAL 해석과 전기 회로 모델, 기존 선택 네이티브 빌드·디버그 기능. 실제 STM32 칩의 모든 ARM 펌웨어 실행을 뜻하지 않습니다.
- 배포: 고정 파일명 STM-Simulator.exe, ZIP, 해시/빌드/업데이트 메타데이터. CI 성공 후 새 버전을 게시하고 공개 자산 및 실제 EXE/ZIP·업데이트 경로를 확인합니다.
- 장애 확인: 사용자 동작/회로 상태는 기존 진단 JSONL에 남습니다. UI는 실패를 화면에 표시하며 현재 작업 보존과 재시도를 제공합니다.

renderer 모듈과 상태 흐름은 [애플리케이션 구조](APPLICATION_ARCHITECTURE.md)에 기록합니다. 검증은 사용자 앱의 실제 프로필을 변경하지 않는 독립 프로필에서 수행합니다.
