# Git 작성자 설정 및 이력 정정

## 2026-11-03 전체 이력 정정

사용자의 요청으로 `main`의 커밋 451개 전부의 작성자와 커미터를 이 PC의 기본값 `moonsyu <anstn0104@naver.com>`으로 바꾸고, 메시지 끝의 `Co-Authored-By: Claude …`(331개)와 `Claude-Session: …`(25개) 줄을 지웠습니다. 파일 트리, 작성·커밋 시각, 그 밖의 메시지는 커밋마다 그대로이고 SHA만 달라졌습니다. 태그 78개와 `redesign` 브랜치는 파일 트리가 같은 새 커밋으로 옮겼습니다(주석 태그 v0.13.0은 같은 메시지·시각으로 다시 만들었습니다). 대응표: [commit-identity-map-2026-11-03.json](commit-identity-map-2026-11-03.json).

이미 배포된 Release 파일은 바꾸지 않았습니다. 그 안의 `BUILD-INFO.json`은 빌드 당시의 원래 SHA를 가리키며, 대응표에서 같은 트리의 새 커밋을 찾을 수 있습니다.

## 2026-10-15 정정

2026-10-15에 사용자의 요청으로 잘못된 계정으로 작성된 커밋 11개의 작성자와 커미터를 `moonsyu <54017527+moonsyu@users.noreply.github.com>`으로 정정했습니다. `main`과 이 커밋을 가리키는 태그 7개에 동일하게 적용했습니다.

각 커밋의 파일 트리, 메시지, 작성 시각은 그대로 유지했습니다. 작성자 정보와 부모 커밋 번호가 바뀌어 커밋 SHA만 달라졌습니다. 이전·이후 SHA와 동일한 파일 트리의 SHA는 [commit-identity-map.json](commit-identity-map.json)에 기록되어 있습니다.

## 앞으로 사용할 설정

작성자 메일은 전역 설정(`anstn0104@naver.com`)을 그대로 씁니다. 이 프로젝트의 로컬 Git 설정은 다음과 같습니다. 다른 PC에서 새로 복제한 경우 저장소 폴더에서 적용합니다.

```powershell
git config --local user.name moonsyu
git config --local credential.https://github.com.username moonsyu
```

저장소 소유자는 `moonsyu/STM-Simulator`이며, GitHub에 저장된 `moonsyu` 인증으로 푸시합니다. 별도 프로젝트가 사용하는 전역 계정 설정은 이 저장소의 설정과 구분됩니다.

## 기존 릴리스와 빌드 출처

이미 배포된 EXE, ZIP, 체크섬, `BUILD-INFO.json`, `update-manifest.json`은 교체하지 않습니다. 기존 실행 파일의 `BUILD-INFO.json`에는 실제 빌드 당시의 원래 SHA가 남습니다. 수정된 태그가 가리키는 커밋과 그 원래 커밋은 파일 트리가 동일하며, 위 대응표로 비교할 수 있습니다. 기존 Actions 실행 기록도 빌드 당시 SHA를 유지합니다.

릴리스 게시자는 자동 배포를 수행한 `github-actions[bot]`으로 표시될 수 있습니다. 소스 커밋의 작성자·커미터와 Git 푸시 인증 계정은 `moonsyu`입니다.

기존 복제본이 이전 이력을 가지고 있다면 변경 파일을 먼저 보관하고 새로 복제하거나, 작성자 정정에 맞춰 이력을 동기화해야 합니다. 이전 `main`을 병합하면 잘못된 작성자 이력이 다시 들어올 수 있습니다.
