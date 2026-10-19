# STM Simulator 0.25.1 공개 배포 검증

검증일: 2026-10-19. 상태: **소스 게시·전체 Windows CI·Release 게시·공개 실행·자동 업데이트 검증 완료.** 사용자 프로필과 회로는 사용하지 않고 별도 테스트 프로필을 사용했습니다.

## 배포 식별과 다운로드

- [Release v0.25.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.1) · [STM-Simulator.exe 다운로드](https://github.com/moonsyu/STM-Simulator/releases/download/v0.25.1/STM-Simulator.exe)
- 제품 소스·태그·빌드 커밋: `243ecf205354e18ed4701213c117906ab6a35080`. `BUILD-INFO.json`의 `sourceDirty=false`와 CI 출처를 대조했습니다.
- [Windows CI 39227299473](https://github.com/moonsyu/STM-Simulator/actions/runs/39227299473): 전체 검사·빌드 작업과 Release 게시 작업 모두 성공했습니다.
- 공개 자산 5개: 고정 이름 EXE, 버전별 ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json. 공개 latest는 v0.25.1입니다.
- 비인증 공개 다운로드의 EXE/ZIP SHA와 크기, ZIP 내부 EXE·메타데이터·배포 문서 및 제품 커밋 내용을 대조했습니다.
- EXE: 102,784,459 bytes, SHA-256 `8ab5fc812df020b4bf68b9eb8941e521be75199e0c1cc66ff1a45e08d2c58566`.
- ZIP SHA-256: `2fd38473e8440c3e9e44ea6d80c01f49876274179ebc3be48302f910f886bc94`.

## 이번 버전의 수정

PIN 편집 중 타이머 모드 변경 또는 실패한 용도 배정으로 입력 라벨·옵션이 소실되던 문제를 수정했습니다. 빈 NVIC 우선순위와 타이머 PSC/ARR/CCR 입력을 유효한 0과 구분하고, 잘못된 CCR을 모드 전환으로 숨길 수 없게 했습니다.

IRQ 콜백에서 전체/개별 IRQ 차단이나 우선순위를 변경하면 다음 콜백에 즉시 반영하며, 차단된 pending IRQ는 보존합니다. Analog 핀은 내부 Pull과 디지털 읽기를 비활성화하고 외부 전압·ADC 측정은 유지합니다.

## 검사 범위와 실제 결과

| 대상 | 결과 |
| --- | --- |
| 0.25.1 로컬·Windows CI 단위 검사 | 각 406/406 통과 |
| Windows CI 기존 UI 회귀 | 저장·복구, 업데이트 교체/롤백, 테마·크기·모델 미리보기, 편집·Docs·초기화·UART 등 전체 성공 |
| 공개 단독 EXE | C 의미 7조건, 편집 직후 정상 종료·재실행 최신 코드 복원 통과 |
| 공개 ZIP 내부 EXE | C 의미 7조건, 편집 직후 정상 종료·재실행 최신 코드 복원 통과 |
| 각 공개 EXE의 PIN 설정 | 각각 25개 시나리오: 입력 검증 19, 콜백 변경 3, ADC 3. 실제 HAL 실행 각각 6회 |
| 각 공개 EXE의 Docs | 각각 3개 조합, 적용 12회, 실제 실행 6회, 코드/프로젝트 스냅샷 15개, 파일 저장·재열기 3회 |
| 자동 업데이트 | 원본 공개 0.25.0 → 0.25.1 자동 검색·다운로드·해시 검증·교체·새 앱 실행·재열기 통과 |

Docs는 같은 LED의 카드 변경, LED 2개, LED+가변저항+UART+서보 조합을 검사했습니다. LED 점등/점멸, 실시간 입력 변경에 따른 ADC 값, UART RX/TX의 Q 에코, 서보 각도 변화를 실제 진단 JSONL과 대조했습니다. 기존 사용자 코드·별도 GPIO·배선·다른 장치 설정 보존과 재적용·저장 복구도 확인했습니다.

공개 PIN/Docs 실행의 Renderer 오류·진단 큐 경고·실행 오류·회로 fault/경고는 0건입니다. 의도적으로 잘못 입력한 PIN 옵션의 거부 로그는 정상 검증 결과이며 실행 오류로 계산하지 않았습니다.

첫 공개 Docs 검사에서는 Toggle의 ON/OFF 집합 판정이 실패했습니다. 생성 코드는 사용자 대기 137ms마다 LED를 반전하지만, 2초 주기 상태 로그와 정지 로그는 1,520/3,520/5,200ms의 정상 OFF 구간만 포착했습니다. 원본 실패를 [별도 폴더](evidence/first-attempt-docs/summary.json)에 보존했습니다. 이후 제품·생성 코드·배선을 변경하지 않고 실제 한 단계 실행으로 0ms ON과 140ms OFF를 각각 유지하여 진단 로그에 기록하도록 검사만 보완했습니다. 보완된 검사로 두 공개 EXE의 전체 Docs 3개 시나리오를 다시 통과했으며, 원본 실패는 최종 성공 집계에 섞지 않았습니다.

자동 업데이트는 이전 공개 EXE의 실제 자동 스케줄러와 네트워크를 사용했습니다. 수동 검사·다운로드 호출이나 업데이트 응답 모의 처리는 사용하지 않았습니다. 설치 버튼 이후 새 EXE 해시와 새 프로세스의 패키지 버전을 확인했고, 재열기 후 코드·Dark/Jellybean·글꼴 17·보드 크기 1.25·자동 업데이트 설정 보존을 확인했습니다.

## 이전 검사와의 구분

- [PIN 전체 개발 소스 감사](../pin-options-2026-10-19/REPORT.md): 버전 상승 전 0.25.0 수정본의 362개 시나리오·HAL 실행 342건입니다. 공개 0.25.1에서는 수정 관련 핵심 25개를 EXE와 ZIP 각각 재검사했습니다.
- [Docs 개발 소스 감사](../hal-docs-multi-2026-10-19/REPORT.md): UI 3개/6회 실행, 독립 조합·충돌 7개. 이번 공개 검사는 두 배포 EXE 각각의 실제 UI 3개/6회 실행입니다.
- 같은 장치의 함수 카드는 마지막 선택으로 교체됩니다. 서로 다른 장치의 예제는 main에서 순서대로 실행되며 HAL_Delay의 대기는 뒤 코드를 지연시킵니다. 임의의 모든 장치 조합이나 병렬 실행을 검증했다는 의미가 아닙니다.
- 모든 실행 판정은 시뮬레이터 동작이며 실물 STM32·ARM 명령 실행 검증으로 계산하지 않습니다.

## 원본 증거

- [전체 집계](evidence/public-verification.json), [공개 자산](evidence/public-assets.json), [CI 실행](evidence/ci-run.json), [CI 단계](evidence/ci-jobs.json)
- [EXE·ZIP 실행/복원](evidence/runtime.json), [자동 업데이트](evidence/update.json)
- [단독 EXE PIN](evidence/public-tests/pin-exe.json), [ZIP PIN](evidence/public-tests/pin-zip.json)
- [단독 EXE Docs](evidence/public-tests/docs-exe.json), [ZIP Docs](evidence/public-tests/docs-zip.json)
- [CI 원본 로그](evidence/ci-logs.zip), [CI 로그 판정](evidence/ci-log-proof.json), [원본 파일별 SHA-256](evidence/checksums.json)

`evidence/public-tests/`에는 버전·실행 ID·EXE 해시가 포함된 summary, 실제 JSONL, 생성/실행 C 코드, 저장된 테스트 프로젝트를 바이트 그대로 보관합니다. Electron 프로필 폴더와 사용자 데이터는 포함하지 않습니다. 원본 체크섬과 Git에 저장되는 blob의 체크섬을 대조합니다. 이 보고서·증거·검사 안정화를 올리는 후속 커밋은 제품 태그·배포 바이너리를 변경하지 않습니다.
