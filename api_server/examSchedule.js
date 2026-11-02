
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const router = express.Router();

const parser = new XMLParser({
  parseTagValue: false,
  trimValues: true
});

const PROFESSIONAL_URL =
  process.env.QNET_SCHEDULE_API_URL ||
  'http://openapi.q-net.or.kr/api/service/rest/InquiryTestDatesNationalProfessionalQualificationSVC/getList';

const TECHNICAL_URL =
  'http://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList';

function loadItems(filename) {
  const filePath = path.join(__dirname, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`${filename} 파일이 없습니다.`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(data.items) ? data.items : [];
}

function normalize(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function findQualification(keyword) {
  const search = normalize(keyword);

  const technical = loadItems('technicalQualifications.json')
    .filter(item => item.name.endsWith('기사'))
    .map(item => ({ ...item, type: 'technical' }));

  const professional = loadItems('qualifications.json')
    .filter(item => item.seriesCd !== '03')
    .map(item => ({ ...item, type: 'professional' }));

  const all = [...technical, ...professional];

  const exact = all.find(item =>
    normalize(item.name) === search
  );

  if (exact) return { qualification: exact, matches: [exact] };

  const matches = all.filter(item =>
    normalize(item.name).includes(search)
  );

  return {
    qualification: matches.length === 1 ? matches[0] : null,
    matches
  };
}

async function fetchQnet(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`Q-Net HTTP 오류: ${response.status}`);
  }

  const raw = await response.text();
  const data = parser.parse(raw);

  const root = data.response;

  if (!root) {
    throw new Error('Q-Net 응답 형식이 올바르지 않습니다.');
  }

  const code = String(root.header?.resultCode ?? '');

  if (code !== '00') {
    throw new Error(
      `Q-Net 오류 ${code}: ${root.header?.resultMsg ?? ''}`
    );
  }

  const item = root.body?.items?.item;

  return {
    items: item == null ? [] : Array.isArray(item) ? item : [item],
    totalCount: Number(root.body?.totalCount ?? 0)
  };
}

async function getTechnicalSchedule(qualification, year) {
  const key = process.env.QNET_TECH_SCHEDULE_API_KEY;

  if (!key) {
    throw new Error('QNET_TECH_SCHEDULE_API_KEY가 없습니다.');
  }

  const results = [];
  const pageSize = 50;

  for (let page = 1; page <= 20; page++) {
    const url = new URL(TECHNICAL_URL);

    url.searchParams.set('serviceKey', key);
    url.searchParams.set('implYy', year);
    url.searchParams.set('qualgbCd', 'T');
    url.searchParams.set('jmCd', qualification.jmCd);
    url.searchParams.set('numOfRows', String(pageSize));
    url.searchParams.set('pageNo', String(page));
    url.searchParams.set('dataFormat', 'xml');

    const result = await fetchQnet(url);
    results.push(...result.items);

    if (result.items.length === 0) break;
    if (result.totalCount && results.length >= result.totalCount) break;
    if (result.items.length < pageSize) break;

    if (page === 20) {
      throw new Error('시험일정 페이지 조회 한도를 초과했습니다.');
    }
  }

  return results;
}

async function getProfessionalSchedule(qualification, year) {
  const key = process.env.QNET_SCHEDULE_API_KEY;

  if (!key) {
    throw new Error('QNET_SCHEDULE_API_KEY가 없습니다.');
  }

  const url = new URL(PROFESSIONAL_URL);

  url.searchParams.set('serviceKey', key);
  url.searchParams.set('seriesCd', qualification.seriesCd);

  const result = await fetchQnet(url);

  return result.items.filter(item => {
    const date = String(
      item.examstartdt ?? item.examregstartdt ?? ''
    );
    return date.startsWith(year);
  });
}

router.get('/exam-schedule', async (req, res) => {
  try {
    const keyword = String(req.query.keyword ?? '').trim();
    const year = String(req.query.year ?? '2026');

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: '자격증 이름을 입력하세요.'
      });
    }

    if (!/^\d{4}$/.test(year)) {
      return res.status(400).json({
        success: false,
        message: '연도를 올바르게 입력하세요.'
      });
    }

    if (normalize(keyword).endsWith('기능사')) {
      return res.json({
        success: false,
        message: '기능사 자격증은 지원하지 않습니다.',
        items: []
      });
    }

    const { qualification, matches } =
      findQualification(keyword);

    if (matches.length === 0) {
      return res.json({
        success: false,
        message: '검색된 자격증이 없습니다.',
        items: []
      });
    }

    // 검색 후보가 여러 개면 임의로 선택하지 않음
    if (!qualification) {
      return res.json({
        success: true,
        selectionRequired: true,
        message: '검색된 자격증 중 하나를 선택하세요.',
        matches,
        items: []
      });
    }

    const isTechnical = qualification.type === 'technical';

    const items = isTechnical
      ? await getTechnicalSchedule(qualification, year)
      : await getProfessionalSchedule(qualification, year);

    return res.json({
      success: true,
      selectionRequired: false,
      qualification: qualification.name,
      qualificationType: qualification.type,
      code: isTechnical
        ? qualification.jmCd
        : qualification.seriesCd,
      year,
      count: items.length,
      items
    });

  } catch (error) {
    console.error('시험일정 조회 오류:', error.message);

    return res.status(502).json({
      success: false,
      message: error.message,
      items: []
    });
  }
});

module.exports = router;
