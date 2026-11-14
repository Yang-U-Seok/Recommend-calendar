
/**
 * testHyundai.js
 * 현대자동차 채용공고 목록 + 상세정보 수집
 *
 * 실행: node testHyundai.js
 * Node.js 18 이상
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://talent.hyundai.com';
const LIST_API = `${BASE_URL}/api/rec/AP-HM-FO-02700`;
const DETAIL_API = `${BASE_URL}/api/rec/AP-HM-FO-02800`;

const OUTPUT_FILE = path.join(__dirname, 'hyundaiJobs.json');

const PAGE_SIZE = 10;
const MAX_PAGES = 30;
const REQUEST_DELAY = 700;
const MAX_RETRIES = 3;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function formatDate(value) {
  const str = String(value ?? '').replace(/\D/g, '');
  if (str.length !== 8) return null;

  return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
}

function formatTime(value) {
  if (value == null || value === '') return null;

  const str = String(value).padStart(4, '0');
  if (!/^\d{4}$/.test(str)) return null;

  return `${str.slice(0, 2)}:${str.slice(2, 4)}`;
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}


async function fetchJson(url) {
  const parsedUrl = new URL(url);

  const isDetail = parsedUrl.pathname.includes('02800');

  const referer = isDetail
    ? `${BASE_URL}/apply/applyView.hc?${parsedUrl.searchParams.toString()}`
    : `${BASE_URL}/`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
          Referer: referer,
          'x-hkmc-service': 'HM',
          'x-hkmc-token': 'null'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `HTTP ${response.status}: ${body.slice(0, 200)}`
        );
      }

      const json = await response.json();

      if (Number(json.status) !== 200) {
        throw new Error(
          `API 오류: ${json.message || json.status}`
        );
      }

      return json;
    } catch (error) {
      console.warn(
        `요청 실패 (${attempt}/${MAX_RETRIES}): ${error.message}`
      );

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      await sleep(1000 * attempt);
    }
  }
}


async function fetchHyundaiPage(page) {
  const params = new URLSearchParams({
    hgrCd: '1',
    lang: 'ko',
    page: String(page),
    pageblock: String(PAGE_SIZE),
    searchFieldList: '',
    searchOccupList: '',
    searchPlaceList: '',
    searchSectorList: '',
    searchText: '',
    jdSec: '',
    srcOrd: ''
  });

  const json = await fetchJson(
    `${LIST_API}?${params.toString()}`
  );

  if (!Array.isArray(json.data?.list)) {
    throw new Error('채용공고 목록 데이터가 없습니다.');
  }

  return {
    totalCount: Number(json.data.listCnt),
    list: json.data.list
  };
}

async function fetchHyundaiDetail(job) {
  const params = new URLSearchParams({
    hgrCd: '1',
    lang: 'ko',
    recuYy: String(job.recuYy),
    recuType: String(job.recuType),
    recuCls: String(job.recuCls)
  });

  const json = await fetchJson(
    `${DETAIL_API}?${params.toString()}`
  );

  const detail = json.data?.applyInfo;

  if (!detail || typeof detail !== 'object') {
    throw new Error('상세 채용공고 데이터가 없습니다.');
  }

  if (
    String(detail.recuYy) !== String(job.recuYy) ||
    String(detail.recuType) !== String(job.recuType) ||
    String(detail.recuCls) !== String(job.recuCls)
  ) {
    throw new Error('상세 공고 식별자가 일치하지 않습니다.');
  }

  return detail;
}

function convertJob(job, detail) {
  const qualifications = cleanText(detail.privMustReq);
  const preferences = cleanText(detail.prefReq);
  const description = cleanText(detail.privJdDtl);

  const positionName =
    cleanText(detail.fldCodeNm) ||
    cleanText(job.fldCodeNm) ||
    cleanText(job.recuNoticeNm) ||
    '직무 미확인';

  return {
    id: `hyundai-${job.recuYy}-${job.recuType}-${job.recuCls}`,

    company: '현대자동차',
    companySize: '대기업',
    title: cleanText(job.recuNoticeNm) || '제목 없음',

    startDate: formatDate(job.applyStartDt),
    endDate: formatDate(job.applyEndDt),
    startTime: formatTime(job.applyStartTm),
    endTime: formatTime(job.applyEndTm),

    location: cleanText(job.workPlaceCodeNm),
    category: cleanText(job.secCodeNm),
    position: positionName,
    employmentType: cleanText(job.channelCodeNm),

    description,
    qualifications,
    preferences,

    positions: [
      {
        name: positionName,
        description,
        qualifications,
        preferences,
        location: cleanText(job.workPlaceCodeNm),

        // 실제 공고에서 확인된 자격증만 추후 추출
        requiredCertificates: [],
        preferredCertificates: []
      }
    ],

    recuYy: String(job.recuYy),
    recuType: String(job.recuType),
    recuCls: job.recuCls,

    source: '현대자동차 채용 홈페이지',
    url: `${BASE_URL}/`
  };
}

async function collectHyundaiJobs() {
  console.log('현대자동차 채용공고 수집 시작');

  const allJobs = [];
  let expectedCount = null;

  // 1. 목록 수집
  for (let page = 1; page <= MAX_PAGES; page++) {
    console.log(`\n${page}페이지 조회 중...`);

    const result = await fetchHyundaiPage(page);

    if (!Number.isFinite(result.totalCount)) {
      throw new Error('전체 공고 수 확인 실패');
    }

    if (expectedCount === null) {
      expectedCount = result.totalCount;
      console.log(`전체 채용공고: ${expectedCount}건`);
    }

    if (result.list.length === 0) break;

    allJobs.push(...result.list);

    console.log(
      `${result.list.length}건 / 누적 ${allJobs.length}건`
    );

    if (allJobs.length >= expectedCount) break;

    await sleep(REQUEST_DELAY);
  }

  const uniqueList = Array.from(
    new Map(
      allJobs.map((job) => [
        `${job.recuYy}-${job.recuType}-${job.recuCls}`,
        job
      ])
    ).values()
  );

  if (uniqueList.length !== expectedCount) {
    throw new Error(
      `목록 수집 불완전: ${uniqueList.length}/${expectedCount}`
    );
  }

  console.log('\n상세 채용공고 수집 시작');

  const detailedJobs = [];
  const failures = [];

  // 2. 상세정보 수집
  for (let i = 0; i < uniqueList.length; i++) {
    const job = uniqueList[i];

    console.log(
      `[${i + 1}/${uniqueList.length}] ${job.recuNoticeNm}`
    );

    try {
      const detail = await fetchHyundaiDetail(job);
      const converted = convertJob(job, detail);

      detailedJobs.push(converted);

      console.log(
        `  필수요건: ${converted.qualifications ? '있음' : '없음'}`
      );
      console.log(
        `  우대사항: ${converted.preferences ? '있음' : '없음'}`
      );
    } catch (error) {
      console.error(`  상세 조회 실패: ${error.message}`);
      failures.push({
        id: `${job.recuYy}-${job.recuType}-${job.recuCls}`,
        error: error.message
      });
    }

    if (i < uniqueList.length - 1) {
      await sleep(REQUEST_DELAY);
    }
  }

  if (failures.length > 0) {
    console.error('\n상세 조회 실패 목록:');
    console.error(JSON.stringify(failures, null, 2));

    throw new Error(
      `${failures.length}건 상세 조회 실패. 기존 파일을 유지합니다.`
    );
  }

  // 3. 기존 추천 시스템에서 사용하기 쉬운 배열 형식
  const output = detailedJobs;

  const tempFile = `${OUTPUT_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  fs.renameSync(tempFile, OUTPUT_FILE);

  const qualificationCount = output.filter(
    (job) => job.qualifications
  ).length;

  const preferenceCount = output.filter(
    (job) => job.preferences
  ).length;

  console.log('\n현대자동차 상세 크롤링 완료!');
  console.log(`전체 공고: ${output.length}건`);
  console.log(`필수요건 있는 공고: ${qualificationCount}건`);
  console.log(`우대사항 있는 공고: ${preferenceCount}건`);
  console.log(`저장 위치: ${OUTPUT_FILE}`);
}

collectHyundaiJobs().catch((error) => {
  console.error('\n수집 실패:', error.message);
  process.exitCode = 1;
});
