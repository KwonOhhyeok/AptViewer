# AptViewer

Google 스프레드시트 summary 시트를 GitHub Pages에서 Vue 3로 테이블 렌더링하는 뷰어입니다.

## 요구사항 요약

- GitHub Pages + Jekyll 기반 정적 호스팅
- Google 스프레드시트 첫 번째 시트(summary) 데이터 로드
- 원본 형식(2단 헤더 + 18열)을 그대로 테이블 렌더링
- 지역구 정렬 (서울 → 경기도 → 그 외, 각 그룹 내 지역구 오름차순)

## 설정 방법

### 1. Google 스프레드시트 공개 설정

1. 스프레드시트 열기
2. 파일 > 공유 > 링크가 있는 모든 사용자에게 공개 (또는) 파일 > 웹에 게시
3. CSV 접근이 가능하도록 공개

### 2. index.html 설정

`AptViewer/index.html`에서 아래 중 하나만 설정하세요.

- **CSV_URL 사용 (가장 간단)**

```javascript
const CSV_URL = "https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=0";
```

- **SHEET_ID 사용 (gid 기본값 0)**

```javascript
const SHEET_ID = "스프레드시트ID";
const SHEET_GID = "0";
```

### 3. GitHub Pages 배포

1. `AptViewer` 디렉토리를 `AptViewer` 저장소로 업로드
2. GitHub 저장소 Settings > Pages 활성화
3. `https://<username>.github.io/AptViewer/` 접속

## 데이터 구조

- 1행: `단지정보 | 전고점 정보 | 시세`
- 2행: 총 18개 컬럼 헤더
- 3행부터 데이터

정렬 기준은 `지역구` 컬럼(2번째 컬럼)입니다.

## 기술 스택

- Vue.js 3 (CDN)
- PapaParse (CSV 파싱)
- Jekyll (GitHub Pages)
