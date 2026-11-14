
/**
 * skCrawler.js
 * SK Careers 채용공고 목록 수집
 *
 * 실행:
 * node skCrawler.js
 *
 * 결과:
 * api_server/skJobs.json
 */

const fs = require('fs');
const path = require('path');

const API_URL =
  'https://www.skcareers.com/Recruit/GetRecruitList';

const OUTPUT_FILE = path.join(
  __dirname,
  'skJobs.json'
);

const PAYLOAD = {
  sort: '2',
  searchText: '',
  corpCode: '',
  jobRole: '0',
  recruitType: '',
  workingType: '',
  workingRegion: ''
};

function parseDate(value) {
  const match = String(value || '').match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/
  );

  if (!match) return null;

  return [
    match[1],
    match[2].padStart(2, '0'),
    match[3].padStart(2, '0')
  ].join('-');
}

function normalizeJob(item) {
  return {
    id: `SK_${item.jobNoticeNo}`,
    source: 'SK Careers',
    noticeID: item.noticeID || null,
    jobNoticeNo: item.jobNoticeNo,

    company: item.corpName || 'SK',
    companySize: '대기업',

    title: item.title?.trim() || '',
    jobRole: item.jobRole || '',
    recruitType: item.recruitType || '',
    workingType: item.workingType || '',
    workingArea: item.workingArea || '',

    startDate: parseDate(item.start),
    endDate: parseDate(item.end),

    positions: [
      {
        name: item.jobRole || item.title || '',
        requiredCertificates: [],
        preferredCertificates: []
      }
    ],

    requiredCertificates: [],
    preferredCertificates: [],

    // 상세 URL은 아직 검증하지 않았으므로
    // 임의로 만들어 넣지 않는다.
    url: null
  };
}

async function crawlSK() {
  console.log('=================================');
  console.log('SK Careers 채용공고 수집 시작');
  console.log('=================================');

  const body = new URLSearchParams(PAYLOAD);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':
        'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.skcareers.com',
      'Referer': 'https://www.skcareers.com/'
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(
      `SK API 요청 실패: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.success || !Array.isArray(data.list)) {
    throw new Error(
      'SK API 응답 형식이 예상과 다릅니다.'
    );
  }

  console.log(
    `API 전체 공고 수: ${data.totalCount}`
  );

  console.log(
    `실제 수신 공고 수: ${data.list.length}`
  );

  const jobs = data.list
    .filter(item => item.jobNoticeNo && item.title)
    .map(normalizeJob);

  const uniqueJobs = [
    ...new Map(
      jobs.map(job => [job.id, job])
    ).values()
  ];

  const output = {
    success: true,
    source: 'SK Careers',
    updatedAt: new Date().toISOString(),
    totalCount: uniqueJobs.length,
    jobs: uniqueJobs
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log('=================================');
  console.log(`저장 완료: ${OUTPUT_FILE}`);
  console.log(`저장된 공고: ${uniqueJobs.length}건`);

  if (data.totalCount !== data.list.length) {
    console.warn(
      '주의: API 전체 건수와 수신 건수가 다릅니다.'
    );
    console.warn(
      '추가 페이지 또는 요청 조건 확인이 필요합니다.'
    );
  }

  console.log('=================================');

  return output;
}

if (require.main === module) {
  crawlSK().catch(error => {
    console.error(
      'SK 채용공고 수집 실패:',
      error.message
    );

    process.exitCode = 1;
  });
}

module.exports = {
  crawlSK
};
