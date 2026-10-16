# WBS

## 0.23.1 Docs GPIO 적용 수정

| ID | 산출물 | 담당 | 의존 | 예상 | 상태 | 완료 기준 |
|---|---|---|---|---|---|---|
| DOC-01 | 현재 자동 저장 회로의 코드·배선 진단 | Codex | 없음 | 15분 | done | 사용자 화면 조작 없이 사본에서 빈 STEP과 GND 누락 구분 |
| DOC-02 | 실행 가능한 WritePin 예제와 배선 회귀 검사 | Codex | DOC-01 | 25분 | done | main에 호출 삽입, SET 점등/RESET 소등, 누락 GND 복원, 사용자 배선 보존 |
| LOG-01 | 로컬 실행·Docs 적용 로그와 최근 회로 스냅샷 | Codex | DOC-02 | 15분 | done | 로그만으로 API·핀·배선·코드 확인, 용량 제한, 외부 전송 없음 |
| REL-01 | 검증된 EXE와 소스/Release 게시 | Codex | LOG-01 | 20분 | in_progress | 전체 검사, ARM 링크, 공개 자산 버전·해시 확인 |

사용자 결정: `D:\codex\project\STM-Simulator`에서 작업. 진단은 로그/저장 데이터 우선. 현재 사용 중인 앱은 조작하지 않음.

검증: 모델 287개 통과. 분리된 Electron 프로필에서 Docs 버튼 → main → 실행 → 파일 로그까지 통과. 사용자 자동 저장 사본 두 개에서 기존 배선 보존·GND 1개 복구·LED 전류 약 3.93 mA 확인. 실물 측정값은 아님.
