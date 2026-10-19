# 명명 규칙

기존 JavaScript ES module/CJS 구조를 유지합니다. 새 브라우저 모듈·스크립트 파일은 kebab-case, 함수·지역 변수는 camelCase, 모델 상수는 UPPER_SNAKE_CASE를 사용합니다. 기존 DOM ID와 data attribute는 유지하며 새 UI ID는 기능명을 드러내는 kebab-case를 사용합니다.

부품 type·프로젝트 pin ID·기존 저장 key는 호환성 계약입니다. 시각 모델 개선을 위해 바꾸지 않습니다. 새 UI 오류 범위는 save/open/autosave로 구분합니다. 테스트 자료는 work/test-results 아래의 명명된 실행별 폴더에 저장하고, 검증된 요약·증거만 docs/audits로 옮깁니다.
