# 현재 검증 기록 — 0.16.0 (포터블 자동 업데이트)

- 검증일: 2026-10-14. Windows x64, Electron 44.2.0, Playwright 1.58.2.
- 범위: 포터블 EXE 자동 확인·다운로드·검증·저장 후 재시작, Windows 교체 도우미와 태그 릴리스 게시 구성.
- 현재 결과는 로컬 구현·빌드 검증이다. 공개 GitHub 최신 릴리스는 API 확인 시 v0.15.2였다. 이 변경은 아직 게시하지 않았다.

## 검사 결과

| 검사 | 결과 | 증거 |
| --- | --- | --- |
| 전체 모델 | 209/209 통과 | work/test-results/updates-model.log |
| 업데이트 모델·전송 | 13/13 통과. 버전 비교, 업로드 완료, HTTPS 주소, SHA-256, 잘림/초과, 중복 요청, 오프라인, 캐시 재사용/변조 | tests/updater.test.js |
| 기존 Electron UI | 15개 스크립트 모두 통과. 회로·편집·부품·HAL·IDE·레이아웃·타이머 기본값 | work/test-results/updates-regression-ui.log |
| 업데이트 Electron UI | 설정·준비 상태·설치 오류·1024px 창 검사. 설치 요청 직전 현재 코드의 캐시와 실제 프로젝트 폴더 저장 확인 | update-ui-check.json, update-ready.png, update-compact.png |
| 실제 Windows 교체 | 실행 파일 잠금 해제 대기, 원자적 교체·재실행, 잘못된 EXE의 원본 복원, 부모 종료 후 도우미 생존·재실행, 한글/공백/따옴표/$ 경로 통과 | update-apply-check.json |
| 실제 단일 포터블 EXE | 추출·실행, 올바른 버전, 업데이트 활성화, 설정 영속화, 공개 GitHub 수동 확인 완료 | update-portable-check.json, update-portable.png |
| 패키지·라이선스 | 업데이트 JS·PowerShell·문서 및 기존 IDE 파일의 asar/원본 일치, 아이콘·런타임·Monaco 라이선스 보존 | npm run build:artifact |
| 게시 구성 | YAML 파싱, 태그 빌드와 성공 빌드 의존성, 게시 PowerShell 구문 파싱 통과 | .github/workflows/build-windows.yml |
| 변경 형식 | git diff --check 통과 | Git 작업 트리 |

증거 파일명만 적은 항목은 work/test-results/ 아래에 있다. 업데이트 창의 0.17.0 표시는 IPC 테스트용 가상 버전이며 실제 공개 릴리스가 아니다. Windows 교체 시험은 별도로 컴파일한 작은 EXE를 사용했다.

## 로컬 배포 파일

- EXE: outputs/artifact/STM-Simulator-0.16.0-win-x64.exe
- 크기: 102592788 bytes
- SHA-256: 70c512e9f7874aed93bb79ce9d2813a95e54208f014388bdd82be47d82f6740e
- 자동 업데이트 매니페스트: outputs/artifact/update-manifest.json
- 빌드 정보·해시: outputs/artifact/BUILD-INFO.json, outputs/artifact/SHA256.txt
- 로컬 빌드이므로 BUILD-INFO의 commit/workflow는 null이다. 공개 배포 시 태그 CI에서 다시 만든 산출물의 커밋·해시를 사용한다.

## 검증의 범위

공개 서버에 서로 다른 두 정식 앱 버전을 게시한 뒤 실제 앱 간 업그레이드를 수행하는 검사는 남아 있다. 태그 게시 작업도 아직 원격에서 실행하지 않았다. 현재는 실제 Windows 도우미의 교체/복원/부모 종료 동작과 실제 포터블 앱의 GitHub 확인을 각각 검증했다.

교체 도우미는 새 프로세스를 시작하는 데 실패할 때 백업 복원을 시도한다. 앱이 시작 후 정상 동작하는지 판정하는 롤백 기능은 아니다. 자세한 동작·제약·재현 명령은 UPDATES.md를 참고한다.
