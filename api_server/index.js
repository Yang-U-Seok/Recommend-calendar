const express = require('express');
const cors = require('cors');
const { XMLParser } = require('fast-xml-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// 1. 기본 서버 설정
// ==========================================

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174'
  ],
  credentials: true
}));

app.use(express.json({ limit: '100kb' }));

if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 32
) {
  throw new Error(
    'SESSION_SECRET을 32자 이상의 값으로 설정하세요.'
  );
}

app.use(session({
  name: 'recommender.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// 로그인 및 학습계획
app.use('/api/auth', require('./auth'));
app.use('/api/study', require('./studyPlanner'));

// ==========================================
// 2. Q-Net 공통 함수
// ==========================================

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// 여러 가지 XML 응답 구조 처리
function getItems(body) {
  const candidates = [
    body?.items?.item,
    body?.items,
    body?.item,
    body?.data?.items?.item,
    body?.data?.items,
    body?.data?.item
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === 'object') {
      if (Array.isArray(candidate.item)) {
        return candidate.item;
      }

      if (
        candidate.item &&
        typeof candidate.item === 'object'
      ) {
        return [candidate.item];
      }

      return [candidate];
    }
  }

  return [];
}

function checkApiResponse(parsed, serviceName) {
  const response = parsed?.response;

  if (!response) {
    throw new Error(
      `${serviceName} 응답 형식이 올바르지 않습니다.`
    );
  }

  const code = response.header?.resultCode;

  if (
    code != null &&
    !['0', '00'].includes(String(code))
  ) {
    throw new Error(
      `${serviceName}: ${
        response.header?.resultMsg || code
      }`
    );
  }

  return response.body || {};
}

// API 오류 발생 시 재시도
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

      if (
        parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader
      ) {
        const header =
          parsed.OpenAPI_ServiceResponse.cmmMsgHeader;

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
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

// Q-Net 전체 페이지 수집
async function fetchAllQnetItems(
  apiUrl,
  apiKey,
  params
) {
  const allItems = [];
  const pageSize = 100;
  let totalCount = 0;

  for (let page = 1; page <= 100; page++) {
    const url = createUrl(apiUrl, apiKey, {
      ...params,
      pageNo: page,
      numOfRows: pageSize
    });

    let body;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const parsed = await fetchXml(url, 3);
        body = checkApiResponse(parsed, 'Q-Net');
        lastError = null;
        break;

      } catch (error) {
        lastError = error;

        console.warn(
          `Q-Net 페이지 ${page} 재시도 ${attempt}/3:`,
          error.message
        );

        if (attempt < 3) {
          await sleep(attempt * 1500);
        }
      }
    }

    if (lastError) throw lastError;

    totalCount = Number(body.totalCount || 0);

    const items = getItems(body);

    allItems.push(...items);

    if (
      items.length === 0 ||
      (
        totalCount > 0 &&
        allItems.length >= totalCount
      ) ||
      (
        totalCount === 0 &&
        items.length < pageSize
      )
    ) {
      break;
    }

    await sleep(300);
  }

  if (
    totalCount > 0 &&
    allItems.length < totalCount
  ) {
    throw new Error(
      `전체 데이터 조회 미완료: ${
        allItems.length
      }/${totalCount}`
    );
  }

  return { allItems, totalCount };
}

// 자격증 이름 정규화
function normalizeCertificateName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

// 자격증 이름 필드 확인
function getCertificateName(item) {
  const candidates = [
    item.jmNm,
    item.jmFldNm,
    item.qualName,
    item.qualificationName,
    item.certificateName,
    item.name
  ];

  return String(
    candidates.find(
      value =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ''
    ) ?? ''
  ).trim();
}

// ==========================================
// 3. 서버 확인
// ==========================================

app.get('/', (req, res) => {
  res.send('Recommender Calendar 서버 실행 성공!');
});

// ==========================================
// 4. Q-Net 합격률 조회
// ==========================================

app.get('/api/qnet/pass-rate', async (req, res) => {
  try {
    const apiKey = process.env.QNET_API_KEY;
    const apiUrl = process.env.QNET_API_URL;

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message: 'Q-Net API 환경변수가 없습니다.'
      });
    }

    const year = String(req.query.year || '2020');
    const grade = String(req.query.grade || '30');
    const keyword = String(
      req.query.keyword || ''
    ).trim();

    const validGrades = [
      '10', '20', '30', '31', '32', '33', '40'
    ];

    if (
      !/^\d{4}$/.test(year) ||
      !validGrades.includes(grade)
    ) {
      return res.status(400).json({
        success: false,
        message: '연도 또는 등급이 올바르지 않습니다.'
      });
    }

    const { allItems, totalCount } =
      await fetchAllQnetItems(
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

      const examType = String(
        item.examTypCcd || ''
      );

      const itemYear = String(
        item.implYy || year
      );

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

    const integrated = Object.values(grouped)
      .map(item => ({
        ...item,
        round: `${item.rounds}개 회차 통합`,
        passRate: item.applicants > 0
          ? `${
              (
                item.passed /
                item.applicants *
                100
              ).toFixed(2)
            }%`
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
// 5. Q-Net 자격증 목록
// ==========================================

let certificateCache = {
  expiresAt: 0,
  year: null,
  items: [],
  failedGrades: []
};

app.get('/api/qnet/certificates', async (req, res) => {
  try {
    const keyword = String(
      req.query.keyword || ''
    ).trim();

    const year = String(
      req.query.year || '2025'
    );

    const apiKey = process.env.QNET_API_KEY;
    const apiUrl = process.env.QNET_API_URL;

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message: 'Q-Net API 환경변수가 없습니다.'
      });
    }

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
          const { allItems } =
            await fetchAllQnetItems(
              apiUrl,
              apiKey,
              {
                grdCd: grade,
                baseYY: year
              }
            );

          for (const item of allItems) {
            const name = String(
              item.jmFldNm || ''
            ).trim();

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
          console.error(
            `등급 ${grade} 조회 실패:`,
            error
          );

          errors.push(grade);
        }
      }

      certificateCache = {
        year,
        items: [...certificates.values()].sort(
          (a, b) =>
            a.name.localeCompare(b.name, 'ko')
        ),
        expiresAt: Date.now() + (
          errors.length > 0
            ? 5 * 60 * 1000
            : 24 * 60 * 60 * 1000
        ),
        failedGrades: errors
      };
    }

    const filtered = certificateCache.items.filter(
      cert => cert.name.includes(keyword)
    );

    res.json({
      success: true,
      source: 'Q-Net 합격률 API',
      year,
      totalCount: certificateCache.items.length,
      count: filtered.length,
      failedGrades:
        certificateCache.failedGrades,
      partial:
        certificateCache.failedGrades.length > 0,
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
// 6. Q-Net 취득소요기간 조회 (수정)
// ==========================================

// 여러 후보 필드 중 실제 값이 있는 필드를 찾음
function firstPresent(item, names) {
  for (const name of names) {
    const value = item?.[name];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      return value;
    }
  }

  return null;
}

// 취득소요기간 API 자격증 이름 추출
function termCertificateName(item) {
  const direct = getCertificateName(item);

  if (direct) return direct;

  return String(firstPresent(item, [
    'jmFldName',
    'jmName',
    'qualNm',
    'qfNm',
    'certNm',
    'certName',
    'itemNm',
    'jmfldnm'
  ]) ?? '').trim();
}

// 취득소요기간 데이터 구조 통일
function normalizeTermItem(item, fallbackYear) {
  return {
    name: termCertificateName(item),

    grade: firstPresent(item, [
      'grdNm',
      'gradeNm',
      'gradeName'
    ]),

    year: firstPresent(item, [
      'statisYy',
      'baseYY',
      'baseYy',
      'implYy',
      'year'
    ]) ?? fallbackYear,

    averageDays: firstPresent(item, [
      'accumAcquAvgTermDays',
      'acquAvgTermDays',
      'avgAcquTermDays',
      'averageDays',
      'avgDays'
    ]),

    year1Days: firstPresent(item, [
      'yy1AcquAvgTermDays',
      'year1Days'
    ]),

    year2Days: firstPresent(item, [
      'yy2AcquAvgTermDays',
      'year2Days'
    ]),

    year3Days: firstPresent(item, [
      'yy3AcquAvgTermDays',
      'year3Days'
    ])
  };
}

// 취득소요기간 API
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
    const keyword = String(
      req.query.keyword || ''
    ).trim();

    const debug = req.query.debug === '1';

    const validGrades = [
      '10', '20', '30', '31', '32', '33', '40'
    ];

    if (
      !/^\d{4}$/.test(year) ||
      !validGrades.includes(grade)
    ) {
      return res.status(400).json({
        success: false,
        message: '연도 또는 등급이 올바르지 않습니다.'
      });
    }

    // Q-Net 데이터 조회
    const { allItems, totalCount } =
      await fetchAllQnetItems(
        apiUrl,
        apiKey,
        {
          baseYY: year,
          grdCd: grade
        }
      );

    // 응답 데이터 정규화
    const normalized = allItems.map(
      item => normalizeTermItem(item, year)
    );

    // 검색어 정규화
    const normalizedKeyword =
      normalizeCertificateName(keyword);

    // 자격증명 검색
    const items = normalized.filter(item =>
      normalizeCertificateName(item.name)
        .includes(normalizedKeyword)
    );

    // 데이터 조회 진단
    const diagnostics = {
      year,
      grade,
      keyword,
      reportedTotalCount: totalCount,
      receivedCount: allItems.length,

      namedCount: normalized.filter(
        item => item.name
      ).length,

      matchedCount: items.length,

      averageDaysCount: normalized.filter(
        item => item.averageDays !== null
      ).length,

      sampleKeys: allItems.length
        ? Object.keys(allItems[0])
        : [],

      sampleRawItem: allItems.length
        ? allItems[0]
        : null
    };

    console.log(
      '[취득소요기간 진단]',
      JSON.stringify(diagnostics, null, 2)
    );

    // 원본 데이터가 있지만 자격증명을 찾지 못한 경우
    if (
      allItems.length > 0 &&
      diagnostics.namedCount === 0
    ) {
      return res.status(502).json({
        success: false,
        message:
          '취득소요기간 API의 자격증 이름 필드를 인식하지 못했습니다.',
        ...(debug ? { debug: diagnostics } : {})
      });
    }

    // 평균 취득소요기간 필드 확인
    if (
      !keyword &&
      allItems.length > 0 &&
      diagnostics.averageDaysCount === 0
    ) {
      console.warn(
        '취득소요기간 평균 일수 필드 미확인: debug=1로 원본 필드 확인 필요'
      );
    }

    // 결과 반환
    res.json({
      success: true,
      totalCount,
      count: items.length,
      items,
      ...(debug ? { debug: diagnostics } : {})
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
// 7. Q-Net 시험일정
// ==========================================

app.use('/api/qnet', require('./examSchedule'));

// ==========================================
// 8. 공공기관 채용정보
// ==========================================

function getJobApiConfig() {
  return {
    apiKey: process.env.WORK_API_KEY,

    apiUrl:
      process.env.WORK_API_LIST_URL ||
      (
        process.env.WORK_API_URL
          ? `${
              process.env.WORK_API_URL
                .replace(/\/$/, '')
            }/getList`
          : ''
      )
  };
}

function dateToYmd(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function daysAgoYmd(days) {
  return dateToYmd(
    new Date(
      Date.now() - days * 86400000
    )
  );
}

function normalizeDate(value) {
  const text = String(
    value ?? ''
  ).trim();

  if (/^\d{8}$/.test(text)) {
    return `${
      text.slice(0, 4)
    }-${
      text.slice(4, 6)
    }-${
      text.slice(6, 8)
    }`;
  }

  return text;
}

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
    category:
      categoryMap[item.type02] || '기타',
    categoryCode:
      String(item.type02 ?? ''),
    recruitmentType:
      String(item.type01 ?? '')
  };
}

app.get('/api/jobs', async (req, res) => {
  try {
    const { apiKey, apiUrl } =
      getJobApiConfig();

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message:
          'WORK_API_KEY 또는 WORK_API_LIST_URL이 없습니다.'
      });
    }

    const keyword = String(
      req.query.keyword || ''
    ).trim();

    const page = Number(
      req.query.page ?? 1
    );

    const size = Number(
      req.query.size ?? 10
    );

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          'page는 1 이상, size는 1~100이어야 합니다.'
      });
    }

    const beginDate = String(
      req.query.beginDate ||
      daysAgoYmd(30)
    );

    const endDate = String(
      req.query.endDate ||
      dateToYmd(new Date())
    );

    const datePattern =
      /^\d{4}-\d{2}-\d{2}$/;

    if (
      !datePattern.test(beginDate) ||
      !datePattern.test(endDate) ||
      beginDate > endDate
    ) {
      return res.status(400).json({
        success: false,
        message: '날짜 형식이 올바르지 않습니다.'
      });
    }

    const url = createUrl(
      apiUrl,
      apiKey,
      {
        pageNo: page,
        numOfRows: size,
        Begin_de: beginDate,
        End_de: endDate,

        ...(keyword
          ? { Kwrd: keyword }
          : {}),

        ...(req.query.insttSe
          ? { Instt_se: req.query.insttSe }
          : {}),

        ...(req.query.pblancTy
          ? { Pblanc_ty: req.query.pblancTy }
          : {}),

        ...(req.query.insttNm
          ? { Instt_nm: req.query.insttNm }
          : {})
      }
    );

    const parsed = await fetchXml(url);

    const body = checkApiResponse(
      parsed,
      '인사혁신처'
    );

    const rawItems = getItems(body);

    const today = dateToYmd(
      new Date()
    );

    const activeOnly =
      req.query.activeOnly !== 'false';

    const jobs = rawItems
      .map(normalizeJob)
      .filter(job =>
        !activeOnly ||
        !job.endDate ||
        job.endDate >= today
      );

    const totalCount = Number(
      body.totalCount || 0
    );

    res.json({
      success: true,
      page,
      size,
      beginDate,
      endDate,
      activeOnly,
      totalCount,
      count: jobs.length,
      hasNext: totalCount > 0
        ? page * size < totalCount
        : rawItems.length === size,
      items: jobs
    });

  } catch (error) {
    console.error(
      '공공기관 채용 API 오류:',
      error
    );

    res.status(502).json({
      success: false,
      message: '채용공고 조회 실패',
      error: error.message
    });
  }
});

// ==========================================
// 9. 해외 사기업 채용공고
// ==========================================

const {
  refreshJobs,
  getJobs
} = require('./jobSources');

app.get('/api/private-jobs', (req, res) => {
  const { jobs, lastUpdated } = getJobs();

  const keyword = String(
    req.query.keyword || ''
  ).trim().toLowerCase();

  const filtered = jobs.filter(job =>
    `${
      job.company || ''
    } ${
      job.title || ''
    } ${
      job.location || ''
    }`
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
// 10. 국내 사기업 채용공고
// ==========================================

function readJobsFile(filename) {
  const filePath = path.join(
    __dirname,
    filename
  );

  if (!fs.existsSync(filePath)) {
    console.warn(
      `${filename} 파일이 없습니다.`
    );

    return [];
  }

  const data = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  );

  if (!Array.isArray(data)) {
    throw new Error(
      `${filename}은 배열 형식이어야 합니다.`
    );
  }

  return data;
}

app.get('/api/korean-jobs', (req, res) => {
  try {
    const samsungJobs =
      readJobsFile('samsungJobs.json');

    const koreanJobs =
      readJobsFile('koreanJobs.json');

    const allJobs = [
      ...samsungJobs,
      ...koreanJobs
    ];

    // 중복 제거
    const uniqueJobs = Array.from(
      new Map(
        allJobs.map(job => [
          `${
            job.company || ''
          }|${
            job.id || job.title || ''
          }`,
          job
        ])
      ).values()
    );

    const keyword = String(
      req.query.keyword || ''
    ).trim().toLowerCase();

    const company = String(
      req.query.company || ''
    ).trim().toLowerCase();

    const activeOnly =
      req.query.activeOnly === 'true';

    const today = dateToYmd(
      new Date()
    );

    const filtered = uniqueJobs.filter(job => {
      const searchText = [
        job.company,
        job.title,
        job.location,
        ...(
          Array.isArray(job.positions)
            ? job.positions.map(
                position => position.name
              )
            : []
        )
      ].join(' ').toLowerCase();

      const matchesKeyword =
        searchText.includes(keyword);

      const matchesCompany =
        String(job.company || '')
          .toLowerCase()
          .includes(company);

      const matchesActive =
        !activeOnly ||
        !job.endDate ||
        job.endDate >= today;

      return (
        matchesKeyword &&
        matchesCompany &&
        matchesActive
      );
    });

    filtered.sort((a, b) => {
      const dateA =
        a.endDate || '9999-12-31';

      const dateB =
        b.endDate || '9999-12-31';

      return dateA.localeCompare(dateB);
    });

    res.json({
      success: true,
      total: filtered.length,
      jobs: filtered
    });

  } catch (error) {
    console.error(
      '국내기업 채용정보 오류:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        '국내기업 채용정보 조회 실패',
      error: error.message
    });
  }
});

// ==========================================
// 11. 서버 실행
// ==========================================


// 삼성 채용공고 조회
app.get('/api/samsung-jobs', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'samsungJobs.json');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: '삼성 채용공고 JSON 파일이 없습니다.'
      });
    }

    const jobs = JSON.parse(
      fs.readFileSync(filePath, 'utf8')
    );

    const keyword = String(req.query.keyword || '')
      .trim()
      .toLowerCase();

    const filtered = jobs.filter(job => {
      if (!keyword) return true;

      return (
        String(job.company || '').toLowerCase().includes(keyword) ||
        String(job.title || '').toLowerCase().includes(keyword)
      );
    });

    res.json({
      success: true,
      totalCount: filtered.length,
      count: filtered.length,
      items: filtered
    });

  } catch (error) {
    console.error('삼성 채용공고 조회 오류:', error);

    res.status(500).json({
      success: false,
      message: '삼성 채용공고 조회에 실패했습니다.'
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `서버 실행 성공: http://localhost:${PORT}`
  );

  // 해외 사기업 채용공고 최초 수집
  refreshJobs().catch(console.error);

  // 1시간마다 자동 갱신
  setInterval(() => {
    refreshJobs().catch(console.error);
  }, 60 * 60 * 1000);
});