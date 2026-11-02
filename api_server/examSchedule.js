// 국가자격 시험일정 API 연결
// 공공데이터포털: 한국산업인력공단_국가자격 시험일정 조회 서비스 (qualExamSchd)
// GET /api/qnet/exam-schedule?year=2026&qualgbCd=T
//   year     : 시행년도 (기본값: 올해)
//   qualgbCd : 자격구분 T=국가기술자격, S=국가전문자격, C=과정평가형, W=일학습병행 (기본값: T)
//   jmCd     : 종목코드 (선택, 예: 1320 정보처리기사)

const express = require('express');
const { XMLParser } = require('fast-xml-parser');

const router = express.Router();

const DEFAULT_SCHEDULE_URL =
  'https://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList';

// 숫자처럼 보이는 날짜(20260107)도 문자열 그대로 받기 위해 값 변환을 끔
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

// 같은 조건은 10분 동안 다시 호출하지 않음 (API 호출 수 절약)
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

const VALID_QUAL_CODES = ['T', 'S', 'C', 'W'];

// 등급 이름 추출 (산업기사를 기사보다 먼저 확인)
const GRADE_NAMES = ['기술사', '기능장', '산업기사', '기사', '기능사'];

function inferGrade(description) {
  const text = String(description || '');
  return GRADE_NAMES.find((name) => text.includes(name)) || '기타';
}

// 20260107 -> 2026-01-07
function formatDate(value) {
  const text = String(value ?? '').replace(/\D/g, '');
  if (text.length !== 8) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

// JSON / XML 응답을 모두 처리
function parseResponse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) return parser.parse(trimmed);
  return JSON.parse(trimmed);
}

function toArray(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (Array.isArray(items.item)) return items.item;
  if (items.item) return [items.item];
  return [];
}

async function fetchPage(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  });

  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`시험일정 API HTTP ${response.status}`);
  }

  const data = parseResponse(text);

  // 공공데이터포털 인증 오류 형식 (예: SERVICE_KEY_IS_NOT_REGISTERED_ERROR)
  const gatewayError = data?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gatewayError) {
    throw new Error(gatewayError.returnAuthMsg || gatewayError.errMsg || '인증 오류');
  }

  const root = data?.response ?? data;
  const header = root?.header ?? {};
  const body = root?.body ?? {};
  const code = String(header.resultCode ?? '00');

  if (code !== '00' && code !== '0') {
    throw new Error(header.resultMsg || `시험일정 API 오류 (${code})`);
  }

  return {
    items: toArray(body.items),
    totalCount: Number(body.totalCount || 0)
  };
}

router.get('/exam-schedule', async (req, res) => {
  const apiKey = process.env.QNET_SCHEDULE_API_KEY || process.env.QNET_API_KEY;
  // 주소 끝에 기능 이름(/getQualExamSchdList)이 빠져 있어도 동작하도록 보정
  let apiUrl = (process.env.QNET_SCHEDULE_API_URL || DEFAULT_SCHEDULE_URL).trim();
  if (/\/qualExamSchd\/?$/.test(apiUrl)) {
    apiUrl = apiUrl.replace(/\/?$/, '/getQualExamSchdList');
  }

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: 'API 환경변수(QNET_API_KEY)가 설정되지 않았습니다.'
    });
  }

  const year = String(req.query.year || new Date().getFullYear());
  const qualgbCd = String(req.query.qualgbCd || 'T').toUpperCase();
  const jmCd = String(req.query.jmCd || '').trim();

  if (!/^\d{4}$/.test(year) || !VALID_QUAL_CODES.includes(qualgbCd) ||
      (jmCd && !/^\d{1,4}$/.test(jmCd))) {
    return res.status(400).json({
      success: false,
      message: '연도, 자격구분 또는 종목코드가 올바르지 않습니다.'
    });
  }

  const cacheKey = `${year}_${qualgbCd}_${jmCd}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return res.json(cached.payload);
  }

  try {
    const allItems = [];
    const pageSize = 50;
    let totalCount = 0;

    for (let page = 1; page <= 40; page++) {
      const result = await fetchPage(apiUrl, {
        serviceKey: apiKey,
        numOfRows: String(pageSize),
        pageNo: String(page),
        dataFormat: 'json',
        implYy: year,
        qualgbCd,
        jmCd
      });

      totalCount = result.totalCount;
      allItems.push(...result.items);

      if (result.items.length === 0 || allItems.length >= totalCount) break;
    }

    const items = allItems
      .map((item) => ({
        year: String(item.implYy ?? year),
        round: String(item.implSeq ?? ''),
        qualType: item.qualgbNm || '',
        grade: inferGrade(item.description),
        description: item.description || '',
        docRegStart: formatDate(item.docRegStartDt),
        docRegEnd: formatDate(item.docRegEndDt),
        docExamStart: formatDate(item.docExamStartDt),
        docExamEnd: formatDate(item.docExamEndDt),
        docPass: formatDate(item.docPassDt),
        pracRegStart: formatDate(item.pracRegStartDt),
        pracRegEnd: formatDate(item.pracRegEndDt),
        pracExamStart: formatDate(item.pracExamStartDt),
        pracExamEnd: formatDate(item.pracExamEndDt),
        pracPass: formatDate(item.pracPassDt)
      }))
      .sort((a, b) =>
        String(a.docRegStart || a.pracRegStart || '').localeCompare(
          String(b.docRegStart || b.pracRegStart || '')
        )
      );

    const payload = { success: true, totalCount, count: items.length, items };
    cache.set(cacheKey, { time: Date.now(), payload });
    res.json(payload);
  } catch (error) {
    console.error('시험일정 API 오류:', error.message);
    res.status(502).json({
      success: false,
      message: '시험일정 조회 실패',
      error: error.message
    });
  }
});

module.exports = router;
