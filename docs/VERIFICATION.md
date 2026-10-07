# 현재 검증 기록 — 0.15.0 (실제 GCC / GDB IDE)

- 검증일: 2026-10-07. Windows x64, Node.js 24, Electron 44.2.0, Monaco 0.57.0, Playwright 1.58.2.
- 도구: ARM GCC 15.2.1 (xPack), Windows GCC/GDB (MSYS2 UCRT64), clangd 23.1.0, STM32CubeF4 v1.28.3. OpenOCD 0.12.0-7 설치 헬퍼 실행 완료.

## 검사 결과

- 실제 ST HAL/CMSIS/startup과 사용자 소스를 ARM GCC로 컴파일·링크해 ELF/BIN/HEX/MAP, compile_commands.json과 SHA-256 기록을 생성했다. 컴파일러 모형을 사용하지 않았다.
- Windows GCC Debug/Release 빌드, 실제 EXE 실행·출력을 검사했다. C/C++ 여러 소스와 std::vector를 링크한 프로그램이 10을 출력했다.
- 실제 GDB/MI로 main·줄 중단점, step into/over/out, continue/interrupt, 지역·전역 변수, 스택, 감시식, 레지스터·메모리를 검사했다. 디버그 종료 뒤 다시 빌드·실행할 수 있음을 UI에서 확인했다.
- ARM GDB를 QEMU netduinoplus2 (STM32F405 Cortex-M4)에 TCP로 연결했다. ARM ELF의 main/helper 단계 실행, 중단점, counter=7, SRAM 07 00 00 00, PC 및 일시정지를 검사했다. 이는 F446RE 실물이나 가상 빵판 전체 에뮬레이션 검증이 아니다.
- 실제 clangd 호버·정의 결과와 Electron 편집기의 저장 전 소스 오류 밑줄을 확인했다. GCC 오류 파일 이동과 개발 도구 설정도 검사했다.
- 실제 Windows 명령 프롬프트의 명령 실행과 출력을 UI에서 확인했다.
- 실패·취소 시 이전 바이너리를 실행하지 않도록 결과가 무효화되는지, 컴파일러 프로세스가 종료되는지 검사했다.
- 모델 189/189 통과. 기존 회로·IDE 모델과 GDB MI 구문, 컴파일 진단, 도구 경로 검사 포함. 마지막 변경 후 IDE·네이티브 단위 검사 11개도 통과했다.
- 기존 Electron UI 14개 스크립트 모두 통과. 신규 네이티브 IDE UI도 통과했다.
- 1024×640 창에서 문서 가로 넘침 없음. 도구 모음은 내부 스크롤, 패널은 이동·크기 조절·최대화로 접근한다. 데스크톱과 작은 창 캡처를 함께 확인했다.
- Impeccable 수동 검사 1회: 기존 디버그 화살표 테두리를 카드 장식으로 판단한 경고만 출력했다. 해당 진단은 적용 대상이 아니다.

## 배포 검사

- EXE: outputs/artifact/STM-Simulator-0.15.0-win-x64.exe
- 크기: 102583777 bytes
- SHA-256: 713b8c566b963d65ae1925cf58e0e512e397027142ed986f42f427eeef95d9b7
- ZIP: outputs/STM-Simulator-0.15.0-Windows-x64.zip
- ZIP SHA-256: 77717e3fb7dee7711524eb339dbf0ca9258fb65c95ec4df237c9bd1422c0b1f4
- asar의 네이티브 서비스·GDB·clangd·UI·Monaco와 소스 바이트 일치, 아이콘·라이선스 원문, 테스트·참고자료 제외 검사를 통과했다.
- win-unpacked 앱에서도 기존 IDE 및 새 네이티브 IDE UI 검사를 통과했다.
- 실제 단일 portable EXE에서 Monaco 초기화, GCC 컴파일, GDB main 정지·레지스터, 종료 후 재실행 및 Hello from STM Simulator: 42 출력을 확인했다.
- NSIS 런처는 Playwright Electron 런처의 inspector stderr를 전달하지 않아 직접 _electron.launch 검사를 진행하지 못했다. 해당 검사 프로세스만 종료하고, 동일 EXE의 자식 앱에 로컬 CDP로 연결하는 전용 검사로 위 결과를 확인했다.
- 이번 결과는 로컬 빌드다. 0.15.0 GitHub Release/Actions 게시 검증은 수행하지 않았다.

## 미검증 및 범위

- 현재 PC에서 연결된 ST-LINK를 확인하지 못했다. OpenOCD 자동 시작·GDB 서버·선택적 보드 기록 기능은 구현했으나 F446RE 실물 플래시·실행·디버그는 미검증이다.
- GCC/GDB·SDK·clangd·OpenOCD는 별도 설치 도구이며 EXE에 번들하지 않는다. 현재 PC에는 검사 도구를 준비했고 앱에서 경로 설정 및 사용을 검증했다.
- ARM ELF를 가상 빵판과 연결하는 CPU/주변장치 에뮬레이터는 제공하지 않는다. 기존 회로 소스 실행기의 C 부분집합·콜백 내부 디버그 제한은 실제 GDB 대상과 별개다.
- 프로젝트, 터미널, 언어 서버의 구체적인 지원 범위는 [IDE 사용법](IDE.md)에 기록했다.

## 로컬 증거

- work/test-results/native-ide-check.json, native-ide-check.log
- work/test-results/arm-gdb-check.json, arm-gdb-check.log
- work/test-results/native-ide-smoke.json, native-packaged-tests.log, native-portable-check.json
- work/test-results/native-ide-desktop.png, native-ide-compact.png
- work/test-results/ui-native-regression.log, native-build-package.log, native-design-detect.json
