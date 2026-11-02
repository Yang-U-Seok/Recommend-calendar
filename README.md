# Recommend-calendar
사용자의 관심 분야에 맞춰 채용공고와 자격증을 추천하고, 모의고사 성적 및 자격증 합격률을 분석하여 개인별 학습 일정을 자동 생성하는 맞춤형 캘린더 서비스입니다. 명지대학교 정보통신공학과 캡스톤디자인 프로젝트입니다.

## 실행 방법

필요한 것: Node.js (LTS), Git

```bash
# 1. 화면 (React + Vite) → http://localhost:5173
npm install
npm run dev

# 2. API 서버 (Express) → http://localhost:3001  (터미널을 하나 더 열어서)
cd api_server
npm install
npm start
```

## API 인증키 설정

`api_server/.env.example`을 복사해 `api_server/.env`를 만들고 공공데이터포털 인증키와 주소를 넣습니다.
`.env`는 GitHub에 올리지 않습니다.

공공데이터포털에서 아래 API를 활용신청해야 합니다.

| API | 사용하는 곳 |
| --- | --- |
| 한국산업인력공단_연도별 회별 국가기술자격 합격률 | 자격증 정보 > 합격률 |
| 한국산업인력공단_등급별 취득소요기간현황 | 자격증 정보 > 취득소요기간 |
| 한국산업인력공단_국가자격 시험일정 조회 서비스 | 자격증 정보 > 시험일정 |

## API 서버 주소

| 주소 | 설명 |
| --- | --- |
| `GET /api/qnet/pass-rate?keyword=&grade=30&year=2020` | 자격증별 합격률 (회차 통합) |
| `GET /api/qnet/acquisition-term?keyword=&grade=30&year=2023` | 평균 취득소요기간 |
| `GET /api/qnet/exam-schedule?year=2026&qualgbCd=T` | 시험일정 (T=국가기술자격, S=국가전문자격) |
