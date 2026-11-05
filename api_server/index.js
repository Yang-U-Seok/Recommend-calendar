
const express = require('express');
const cors = require('cors');
const { XMLParser } = require('fast-xml-parser');
require('dotenv').config();
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174'
  ],
  credentials: true
}));

 // ==========================================
 // 로그인 / 회원가입 API 설정
 // ==========================================

 // React에서 전송한 JSON 데이터 읽기
 app.use(express.json({ limit: '100kb' }));

 // 세션 비밀키 확인
 if (
   !process.env.SESSION_SECRET ||
   process.env.SESSION_SECRET.length < 32
 ) {
   throw new Error(
     'SESSION_SECRET 환경변수를 32자 이상의 무작위 값으로 설정해주세요.'
   );
 }

 // 로그인 세션 설정
 app.use(session({
   name: 'recommender.sid',
   secret: process.env.SESSION_SECRET,
   resave: false,
   saveUninitialized: false,
   cookie: {
     httpOnly: true,
     secure: false,
     sameSite: 'lax',
     maxAge: 24 * 60 * 60 * 1000
   }
 }));

 // 회원가입 및 로그인 API 연결
 app.use('/api/auth', require('./auth'));


const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getItems(body) {
  return toArray(body?.items?.item);
}

function checkApiResponse(parsed, serviceName) {
  const response = parsed?.response;

  if (!response) {
    throw new Error(`${serviceName} 응답 형식이 올바르지 않습니다.`);
  }

  const code = response.header?.resultCode;

  if (code != null && !['0', '00'].includes(String(code))) {
    throw new Error(
      `${serviceName}: ${response.header?.resultMsg || code}`
    );
  }

  return response.body || {};
}

async function fetchXml(url, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      const parsed = parser.parse(xml);

      if (parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader) {
        const header = parsed.OpenAPI_ServiceResponse.cmmMsgHeader;

        throw new Error(
          header.returnAuthMsg ||
          header.errMsg ||
          '공공데이터 API 인증 오류'
        );
      }

      return parsed;

    } catch (error) {
      lastError = error;

      console.error(
        `API 요청 실패 (${attempt}/${retries}):`,
        error.message
      );

      if (attempt < retries) {
        await sleep(attempt * 1500);
      }
    }
  }

  throw lastError;
}

function createUrl(baseUrl, apiKey, params = {}) {
  const url = new URL(baseUrl);

  url.searchParams.set('serviceKey', apiKey);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url;
}

// ==========================================
// Q-Net 전체 데이터 조회 공통 함수
// ==========================================

async function fetchAllQnetItems(apiUrl, apiKey, params) {
  const allItems = [];
  const pageSize = 100;
  let totalCount = 0;

  for (let page = 1; page <= 100; page++) {
    const url = createUrl(apiUrl, apiKey, {
      ...params,
      pageNo: page,
      numOfRows: pageSize
    });

    const parsed = await fetchXml(url, 5);
    const body = checkApiResponse(parsed, 'Q-Net');

    totalCount = Number(body.totalCount || 0);

    const items = getItems(body);
    allItems.push(...items);

    if (
      items.length === 0 ||
      (totalCount > 0 && allItems.length >= totalCount) ||
      (totalCount === 0 && items.length < pageSize)
    ) {
      break;
    }

    await sleep(300);
  }

  if (totalCount > 0 && allItems.length < totalCount) {
    throw new Error(
      `전체 데이터 조회 미완료: ${allItems.length}/${totalCount}`
    );
  }

  return { allItems, totalCount };
}

// ==========================================
// 기본 서버 확인
// ==========================================

app.get('/', (req, res) => {
  res.send('Recommender Calendar 서버 실행 성공!');
});

// ==========================================
// 1. Q-Net 합격률 조회
// ==========================================

app.get('/api/qnet/pass-rate', async (req, res) => {
  try {
    const apiKey = process.env.QNET_API_KEY;
    const apiUrl = process.env.QNET_API_URL;

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message: 'Q-Net API 환경변수가 설정되지 않았습니다.'
      });
    }

    const year = String(req.query.year || '2020');
    const grade = String(req.query.grade || '30');
    const keyword = String(req.query.keyword || '').trim();

    const validGrades = [
      '10', '20', '30', '31', '32', '33', '40'
    ];

    if (!/^\d{4}$/.test(year) || !validGrades.includes(grade)) {
      return res.status(400).json({
        success: false,
        message: '연도 또는 등급이 올바르지 않습니다.'
      });
    }

    const { allItems, totalCount } = await fetchAllQnetItems(
      apiUrl,
      apiKey,
      {
        grdCd: grade,
        baseYY: year
      }
    );

    const grouped = {};

    for (const item of allItems) {
      const name = String(item.jmFldNm || '');

      if (!name.includes(keyword)) continue;

      const examType = String(item.examTypCcd || '');
      const itemYear = String(item.implYy || year);

      const key = JSON.stringify([
        name,
        examType,
        itemYear
      ]);

      if (!grouped[key]) {
        grouped[key] = {
          name,
          grade: item.grdNm,
          examType,
          year: itemYear,
          rounds: 0,
          applicants: 0,
          passed: 0
        };
      }

      grouped[key].rounds++;

      grouped[key].applicants +=
        Number(item.recptNoCnt) || 0;

      grouped[key].passed +=
        Number(item.examPassCnt) || 0;
    }

    const integrated = Object.values(grouped).map(item => ({
      ...item,
      round: `${item.rounds}개 회차 통합`,
      passRate: item.applicants > 0
        ? `${((item.passed / item.applicants) * 100).toFixed(2)}%`
        : 'N/A'
    }));

    integrated.sort((a, b) => {
      const x = parseFloat(a.passRate);
      const y = parseFloat(b.passRate);

      if (Number.isNaN(x)) return 1;
      if (Number.isNaN(y)) return -1;

      return x - y;
    });

    res.json({
      success: true,
      totalCount,
      count: integrated.length,
      items: integrated
    });

  } catch (error) {
    console.error('Q-Net 합격률 오류:', error);

    res.status(502).json({
      success: false,
      message: 'Q-Net 데이터 조회 실패',
      error: error.message
    });
  }
});

 // ==========================================
 // Q-Net 실제 자격증 목록
 // ==========================================

 let certificateCache = {
   expiresAt: 0,
   items: []
 };

 app.get('/api/qnet/certificates', async (req, res) => {
   try {
     const keyword = String(req.query.keyword || '').trim();
     const year = String(req.query.year || '2025');

     const apiKey = process.env.QNET_API_KEY;
     const apiUrl = process.env.QNET_API_URL;

     if (!apiKey || !apiUrl) {
       return res.status(500).json({
         success: false,
         message: 'Q-Net API 환경변수가 없습니다.'
       });
     }

     // API 호출을 줄이기 위한 24시간 캐시
     if (
       Date.now() > certificateCache.expiresAt ||
       certificateCache.year !== year
     ) {
       const grades = [
         '10', '20', '30', '31', '32', '33', '40'
       ];

       const certificates = new Map();
       const errors = [];

       for (const grade of grades) {
         try {
           const { allItems } = await fetchAllQnetItems(
             apiUrl,
             apiKey,
             {
               grdCd: grade,
               baseYY: year
             }
           );

           for (const item of allItems) {
             const name = String(item.jmFldNm || '').trim();

             if (!name) continue;

             const key = `${grade}:${name}`;

             certificates.set(key, {
               id: key,
               name,
               grade: String(item.grdNm || ''),
               gradeCode: grade
             });
           }
         } catch (error) {
           console.error(`등급 ${grade} 조회 실패:`, error);
           errors.push(grade);
         }
       }

       // 일부 등급이 실패했으면 완전한 캐시로 간주하지 않음
      

       certificateCache = {
  year,
  items: [...certificates.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'ko')
  ),
  expiresAt: errors.length > 0
    ? Date.now() + 5 * 60 * 1000
    : Date.now() + 24 * 60 * 60 * 1000,
  failedGrades: errors
};
     }

     const filtered = certificateCache.items.filter(cert =>
       cert.name.includes(keyword)
     );

 res.json({
  success: true,
  source: 'Q-Net 합격률 API',
  year,
  totalCount: certificateCache.items.length,
  count: filtered.length,
  failedGrades: certificateCache.failedGrades || [],
  partial: (certificateCache.failedGrades || []).length > 0,
  items: filtered
});

   } catch (error) {
     console.error('자격증 목록 오류:', error);

     res.status(500).json({
       success: false,
       message: error.message
     });
   }
 });

// ==========================================
// 2. Q-Net 자격증 취득소요기간
// ==========================================

app.get('/api/qnet/acquisition-term', async (req, res) => {
  try {
    const apiKey = process.env.QNET_API_KEY;
    const apiUrl = process.env.QNET_TERM_API_URL;

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message: '취득소요기간 API 환경변수가 없습니다.'
      });
    }

    const year = String(req.query.year || '2023');
    const grade = String(req.query.grade || '30');
    const keyword = String(req.query.keyword || '').trim();

    if (
      !/^\d{4}$/.test(year) ||
      !['10', '20', '30', '31', '40'].includes(grade)
    ) {
      return res.status(400).json({
        success: false,
        message: '연도 또는 등급이 올바르지 않습니다.'
      });
    }

    const { allItems, totalCount } = await fetchAllQnetItems(
      apiUrl,
      apiKey,
      {
        baseYY: year,
        grdCd: grade
      }
    );

    const items = allItems
      .filter(item =>
        String(item.jmNm || '').includes(keyword)
      )
      .map(item => ({
        name: item.jmNm,
        grade: item.grdNm,
        year: item.statisYy,
        averageDays: item.accumAcquAvgTermDays,
        year1Days: item.yy1AcquAvgTermDays,
        year2Days: item.yy2AcquAvgTermDays,
        year3Days: item.yy3AcquAvgTermDays
      }));

    res.json({
      success: true,
      totalCount,
      count: items.length,
      items
    });

  } catch (error) {
    console.error('취득소요기간 오류:', error);

    res.status(502).json({
      success: false,
      message: '취득소요기간 조회 실패',
      error: error.message
    });
  }
});

// ==========================================
// 3. Q-Net 시험일정
// ==========================================

app.use('/api/qnet', require('./examSchedule'));

// ==========================================
// 4. 인사혁신처 채용공고 API
// ==========================================

// API 환경변수
function getJobApiConfig() {
  return {
    apiKey: process.env.WORK_API_KEY,

    apiUrl: process.env.WORK_API_LIST_URL ||
      (process.env.WORK_API_URL
        ? `${process.env.WORK_API_URL.replace(/\/$/, '')}/getList`
        : '')
  };
}

// 한국 시간 기준 날짜 변환
function dateToYmd(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

// 최근 N일 날짜
function daysAgoYmd(days) {
  return dateToYmd(
    new Date(Date.now() - days * 86400000)
  );
}

// API 날짜 정규화
function normalizeDate(value) {
  const text = String(value ?? '').trim();

  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  return text;
}

// 채용공고 데이터 정리
function normalizeJob(item) {
  const categoryMap = {
    g01: '국가공무원 채용',
    g02: '지방공무원 채용',
    g03: '공공기관 채용',
    g04: '교육청 채용'
  };

  return {
    id: String(item.idx ?? ''),
    title: String(item.title ?? ''),
    company: String(item.insttname ?? ''),
    regionCode: String(item.areacode ?? ''),

    startDate: normalizeDate(item.regdate),
    endDate: normalizeDate(item.enddate),
    modifiedDate: normalizeDate(item.moddate),

    category: categoryMap[item.type02] || '기타',
    categoryCode: String(item.type02 ?? ''),
    recruitmentType: String(item.type01 ?? '')
  };
}

// ==========================================
// 채용정보 검색 API
// ==========================================

app.get('/api/jobs', async (req, res) => {
  try {
    const { apiKey, apiUrl } = getJobApiConfig();

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message:
          'WORK_API_KEY 또는 WORK_API_LIST_URL 환경변수가 없습니다.'
      });
    }

    // 검색 조건
    const keyword = String(req.query.keyword || '').trim();
    const page = Number(req.query.page ?? 1);
    const size = Number(req.query.size ?? 10);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'page는 1 이상, size는 1~100의 정수여야 합니다.'
      });
    }

    // 기본 최근 30일
    const beginDate = String(
      req.query.beginDate || daysAgoYmd(30)
    );

    const endDate = String(
      req.query.endDate || dateToYmd(new Date())
    );

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (
      !datePattern.test(beginDate) ||
      !datePattern.test(endDate) ||
      beginDate > endDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          '날짜는 YYYY-MM-DD 형식이며 시작일은 종료일 이전이어야 합니다.'
      });
    }

    // 인사혁신처 API 요청
    const url = createUrl(apiUrl, apiKey, {
      pageNo: page,
      numOfRows: size,

      // 등록일 검색
      Begin_de: beginDate,
      End_de: endDate,

      // 키워드 검색
      ...(keyword
        ? { Kwrd: keyword }
        : {}),

      // 기관 유형
      ...(req.query.insttSe
        ? { Instt_se: req.query.insttSe }
        : {}),

      // 채용 유형
      ...(req.query.pblancTy
        ? { Pblanc_ty: req.query.pblancTy }
        : {}),

      // 기관명
      ...(req.query.insttNm
        ? { Instt_nm: req.query.insttNm }
        : {})
    });

    const parsed = await fetchXml(url);

    const body = checkApiResponse(
      parsed,
      '인사혁신처'
    );

    const rawItems = getItems(body);

    // 오늘 날짜
    const today = dateToYmd(new Date());

    // 마감된 공고 제외
    const activeOnly = req.query.activeOnly !== 'false';

    const jobs = rawItems
      .map(normalizeJob)
      .filter(job =>
        !activeOnly ||
        !job.endDate ||
        job.endDate >= today
      );

    const totalCount = Number(body.totalCount || 0);

    // React로 응답 전달
    res.json({
      success: true,
      page,
      size,
      beginDate,
      endDate,
      activeOnly,

      // API 전체 검색 건수
      // 마감 공고 제외 전 기준
      totalCount,

      // 현재 페이지 결과
      count: jobs.length,

      // 다음 페이지 여부
      hasNext: totalCount > 0
        ? page * size < totalCount
        : rawItems.length === size,

      items: jobs
    });

  } catch (error) {
    console.error(
      '인사혁신처 채용 API 오류:',
      error.message
    );

    res.status(502).json({
      success: false,
      message: '채용공고 조회 실패',
      error: error.message
    });
  }
});

// ==========================================
// 5. 서버 실행
// ==========================================

// ==========================================
// 5. 사기업 채용공고 API
// ==========================================


 // ==========================================
 // 5. 해외 사기업 채용공고 API
 // ==========================================

 const { refreshJobs, getJobs } = require('./jobSources');

 app.get('/api/private-jobs', (req, res) => {
   const { jobs, lastUpdated } = getJobs();

   const keyword = String(req.query.keyword || '')
     .trim()
     .toLowerCase();

   const filtered = jobs.filter(job =>
     `${job.company || ''} ${job.title || ''} ${job.location || ''}`
       .toLowerCase()
       .includes(keyword)
   );

   res.json({
     success: true,
     total: filtered.length,
     lastUpdated,
     jobs: filtered
   });
 });

 // ==========================================
 // 6. 국내 사기업 채용공고 API
 // ==========================================

 const fs = require('fs');
 const path = require('path');

 function readJobsFile(filename) {
   const filePath = path.join(__dirname, filename);

   if (!fs.existsSync(filePath)) {
     console.warn(`${filename} 파일이 없습니다.`);
     return [];
   }

   const data = JSON.parse(
     fs.readFileSync(filePath, 'utf8')
   );

   if (!Array.isArray(data)) {
     throw new Error(`${filename}은 배열 형식이어야 합니다.`);
   }

   return data;
 }

 app.get('/api/korean-jobs', (req, res) => {
   try {
     // 기존 삼성 채용공고
     const samsungJobs = readJobsFile('samsungJobs.json');

     // 추가 국내기업 채용공고
     const koreanJobs = readJobsFile('koreanJobs.json');

     // 두 파일 통합
     const allJobs = [...samsungJobs, ...koreanJobs];

     // 중복 공고 제거
     const uniqueJobs = Array.from(
       new Map(
         allJobs.map(job => [
           `${job.company || ''}|${job.id || job.title || ''}`,
           job
         ])
       ).values()
     );

     const keyword = String(req.query.keyword || '')
       .trim()
       .toLowerCase();

     const company = String(req.query.company || '')
       .trim()
       .toLowerCase();

     const activeOnly = req.query.activeOnly === 'true';

     const today = dateToYmd(new Date());

     const filtered = uniqueJobs.filter(job => {
       const searchText = [
         job.company,
         job.title,
         job.location,
         ...(Array.isArray(job.positions)
           ? job.positions.map(position => position.name)
           : [])
       ].join(' ').toLowerCase();

       const matchesKeyword = searchText.includes(keyword);

       const matchesCompany = String(job.company || '')
         .toLowerCase()
         .includes(company);

       const matchesActive =
         !activeOnly ||
         !job.endDate ||
         job.endDate >= today;

       return matchesKeyword &&
         matchesCompany &&
         matchesActive;
     });

     // 마감일이 빠른 공고부터 정렬
     filtered.sort((a, b) => {
       const dateA = a.endDate || '9999-12-31';
       const dateB = b.endDate || '9999-12-31';

       return dateA.localeCompare(dateB);
     });

     res.json({
       success: true,
       total: filtered.length,
       jobs: filtered
     });

   } catch (error) {
     console.error('국내기업 채용정보 오류:', error);

     res.status(500).json({
       success: false,
       message: '국내기업 채용정보 조회 실패',
       error: error.message
     });
   }
 });

 // ==========================================
 // 7. 서버 실행
 // ==========================================

 app.listen(PORT, () => {
   console.log(`서버 실행 성공: http://localhost:${PORT}`);

   // 해외 사기업 채용공고 최초 수집
   refreshJobs().catch(console.error);

   // 1시간마다 자동 갱신
   setInterval(() => {
     refreshJobs().catch(console.error);
   }, 60 * 60 * 1000);
 });
