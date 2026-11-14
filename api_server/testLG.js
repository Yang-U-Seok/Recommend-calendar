
/**
 * testLG.js
 * LG Careers 채용공고 수집
 *
 * 실행:
 * node testLG.js
 *
 * 저장:
 * api_server/lgJobs.json
 */

const fs = require('fs');
const path = require('path');

const API_URL =
  'https://api.careers.lg.com/rmk/job/retrieveJobNoticesList';

const OUTPUT_PATH = path.join(__dirname, 'lgJobs.json');

const REQUEST_BODY = {
  lnbSearch: '',
  hashTagText: '',
  recDate: 'CREATION_DATE',
  order: 'DESC',
  careerList: [],
  companyCodeList: [],
  desireLocList: [],
  jobGroupList: []
};

// LG API 날짜 형식:
// 2026.11.24 23:00
// → 2026-11-24
function formatDate(value) {
  if (!value) return null;

  const match = String(value).match(
    /(\d{4})[.-](\d{2})[.-](\d{2})/
  );

  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

// 2026.11.24 23:00 → 23:00
function formatTime(value) {
  if (!value) return null;

  const match = String(value).match(
    /(\d{2}):(\d{2})/
  );

  return match ? `${match[1]}:${match[2]}` : null;
}

function convertJob(job) {
  return {
    id: `lg-${job.jobNoticeId}`,

    company: job.companyName || 'LG 계열사',
    companySize: '대기업',

    title: job.jobNoticeName || '제목 없음',

    // 목록 API에 시작일이 없으면 임의로 만들지 않음
    startDate: null,
    endDate: formatDate(job.recEndDateTime),
    endTime: formatTime(job.recEndDateTime),

    location: job.workLocationName || '정보 없음',
    category: job.jobGroupName || '정보 없음',
    position: job.jobGroupName || '정보 없음',

    employmentType: job.careerTypeName || '정보 없음',
    recruitmentType: job.recruitTypeName || '정보 없음',

    companyCode: job.companyCode || null,
    jobNoticeId: job.jobNoticeId,

    noticeStatus: job.noticeStatus || null,
    noticeStatusName: job.noticeStatusName || null,

    careerType: job.careerTypeName || null,
    recruitType: job.recruitTypeName || null,

    source: 'LG Careers',

    // 개별 공고 URL은 아직 확인되지 않았으므로
    // 공식 채용사이트 주소 사용
    url: 'https://careers.lg.com/'
  };
}

async function fetchLGJobs() {
  console.log('====================================');
  console.log('LG Careers 채용공고 수집 시작');
  console.log('====================================');

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);

  let response;

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://careers.lg.com',
        Referer: 'https://careers.lg.com/'
      },
      body: JSON.stringify(REQUEST_BODY),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  console.log('HTTP 상태:', response.status);

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `LG API 요청 실패 (${response.status}): ` +
      errorText.slice(0, 300)
    );
  }

  const result = await response.json();

  if (result.status !== 'S') {
    throw new Error(
      `LG API 응답 오류: ${result.msg || '알 수 없는 오류'}`
    );
  }

  if (!Array.isArray(result.data?.jobNoticeList)) {
    throw new Error(
      'LG API 응답에 jobNoticeList 배열이 없습니다.'
    );
  }

  const rawJobs = result.data.jobNoticeList;
  const listCount = Number(result.data.listCount);

  console.log('API 전체 공고 수:', listCount);
  console.log('응답 배열 공고 수:', rawJobs.length);

  if (
    Number.isFinite(listCount) &&
    listCount !== rawJobs.length
  ) {
    console.warn(
      '주의: listCount와 응답 배열 길이가 다릅니다.'
    );

    console.warn(
      '페이지네이션 여부를 추가로 확인해야 합니다.'
    );
  }

  // 고유 공고번호 기준 중복 제거
  const uniqueJobs = Array.from(
    new Map(
      rawJobs
        .filter(job => job.jobNoticeId != null)
        .map(job => [
          String(job.jobNoticeId),
          convertJob(job)
        ])
    ).values()
  );

  console.log('중복 제거 후 공고 수:', uniqueJobs.length);

  // 기업별 공고 수 계산
  const companyCounts = {};

  for (const job of uniqueJobs) {
    companyCounts[job.company] =
      (companyCounts[job.company] || 0) + 1;
  }

  console.log('\n기업별 채용공고 수');

  Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([company, count]) => {
      console.log(`${company}: ${count}건`);
    });

  const output = {
    success: true,
    group: 'LG',
    totalCount: uniqueJobs.length,
    apiListCount: Number.isFinite(listCount)
      ? listCount
      : null,
    complete:
      Number.isFinite(listCount) &&
      listCount === uniqueJobs.length,
    updatedAt: new Date().toISOString(),
    companyCounts,
    jobs: uniqueJobs
  };

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log('\n====================================');
  console.log('LG 채용공고 수집 완료');
  console.log('====================================');
  console.log('수집 건수:', uniqueJobs.length);
  console.log('저장 파일:', OUTPUT_PATH);

  if (!output.complete) {
    console.warn(
      '전체 공고가 수집됐는지 추가 확인이 필요합니다.'
    );
  }

  console.log('\n샘플 공고');

  uniqueJobs.slice(0, 3).forEach((job, index) => {
    console.log(`\n[${index + 1}] ${job.company}`);
    console.log('제목:', job.title);
    console.log('마감일:', job.endDate);
    console.log('근무지역:', job.location);
  });
}

fetchLGJobs().catch(error => {
  console.error('\nLG 채용공고 수집 실패');
  console.error(error.message);
  process.exitCode = 1;
});
