
/**
 * collectCjJobs.js
 * CJ그룹 공식 채용공고 목록 수집
 * Node.js 18 이상
 */

const fs = require('fs');
const path = require('path');

const API_URL =
  'https://recruit.cj.net/recruit/ko/recruit/recruit/searchNewGonggoList.fo';

const OUTPUT_FILE = path.join(__dirname, 'cjJobs.json');

const PAGE_SIZE = 10;
const MAX_PAGES = 100;
const REQUEST_DELAY = 800;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function toDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) {
    return text.replace(/\./g, '-');
  }

  return text;
}

function isActive(job) {
  if (job.zz_open_yn !== 'Y') return false;
  if (job.zz_close_yn === 'Y') return false;

  // 상시채용은 마감일이 없을 수 있음
  if (job.zz_till_hire === 'Y') return true;

  const endDate = toDate(job.zz_end_dt_str);

  if (!endDate) return true;

  const endHour = /^\d{1,2}$/.test(
    String(job.zz_end_hh || '').trim()
  )
    ? String(job.zz_end_hh).padStart(2, '0')
    : '23';

  const endMinute = /^\d{1,2}$/.test(
    String(job.zz_end_mi || '').trim()
  )
    ? String(job.zz_end_mi).padStart(2, '0')
    : '59';

  const deadline = new Date(
    `${endDate}T${endHour}:${endMinute}:59+09:00`
  );

  if (Number.isNaN(deadline.getTime())) {
    return true;
  }

  return deadline.getTime() >= Date.now();
}

async function fetchPage(page) {
  const payload = {
    pageVal: String(page),
    pageIndex: String(PAGE_SIZE),
    orderDesc: '1',
    sch_title: '',
    arrGubun: '',
    arrRecBu: '',
    arrRecArea: '',
    arrRecJob: '',
    schArea: 'N'
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Ajaxtype': 'FrameOne'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.ErrorCode != null &&
          Number(data.ErrorCode) !== 0) {
        throw new Error(
          data.SVC_ERR_MSG_TEXT || 'CJ API 응답 오류'
        );
      }

      if (!Array.isArray(data.ds_newRecruitList)) {
        throw new Error('채용공고 배열이 없습니다.');
      }

      return data.ds_newRecruitList;

    } catch (error) {
      console.error(
        `${page}페이지 ${attempt}차 시도 실패:`,
        error.message
      );

      if (attempt === 3) throw error;

      await sleep(1500 * attempt);
    }
  }
}

function normalizeJob(job) {
  const id = String(job.zz_jo_num);

  return {
    id: `CJ-${id}`,
    originalId: id,

    group: 'CJ',
    sourceCompany: 'CJ',

    company: job.compnm || 'CJ그룹',
    companySize: '대기업',

    title: job.zz_title || '채용공고',

    position: job.job_cd_nm || '',
    location: job.location_cd_nm || '',

    startDate: toDate(job.zz_str_dt_str),
    endDate: job.zz_till_hire === 'Y'
      ? null
      : toDate(job.zz_end_dt_str),

    endTime: job.zz_till_hire === 'Y'
      ? null
      : (
          /^\d{1,2}$/.test(String(job.zz_end_hh || '').trim())
            ? String(job.zz_end_hh).padStart(2, '0')
            : '23'
        ) + ':' + (
          /^\d{1,2}$/.test(String(job.zz_end_mi || '').trim())
            ? String(job.zz_end_mi).padStart(2, '0')
            : '59'
        ),

    recruitmentType: job.zz_till_hire === 'Y'
      ? '상시채용'
      : '기간제 공고',

    jobCode: job.job_cd || '',
    jobFamily: job.job_family_new || '',

    isActive: true,
    isRolling: job.zz_till_hire === 'Y',

    positions: [
      {
        name: job.job_cd_nm || job.zz_title || '',
        location: job.location_cd_nm || ''
      }
    ],

    requiredCertificates: [],
    preferredCertificates: [],

    url: 'https://recruit.cj.net/',

    source: 'CJ 공식 채용사이트',
    collectedAt: new Date().toISOString()
  };
}

async function main() {
  console.log('CJ 채용공고 수집 시작');

  const allJobs = [];
  const seenIds = new Set();

  let expectedTotal = null;
  let completed = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const jobs = await fetchPage(page);

    if (page === 1) {
      expectedTotal = Number(jobs[0]?.tot_cnt);

      console.log('전체 검색 결과:', expectedTotal);
    }

    if (jobs.length === 0) {
      completed = true;
      break;
    }

    let newCount = 0;

    for (const job of jobs) {
      const id = String(job.zz_jo_num || '');

      if (!id || seenIds.has(id)) continue;

      seenIds.add(id);
      allJobs.push(job);
      newCount++;
    }

    console.log(
      `${page}페이지: ${jobs.length}건 조회 / 누적 ${allJobs.length}건`
    );

    if (newCount === 0) {
      throw new Error(
        '새 공고가 없습니다. 페이지 번호가 적용되지 않았을 수 있습니다.'
      );
    }

    if (
      jobs.length < PAGE_SIZE ||
      (Number.isFinite(expectedTotal) &&
        allJobs.length >= expectedTotal)
    ) {
      completed = true;
      break;
    }

    await sleep(REQUEST_DELAY);
  }

  if (!completed) {
    throw new Error(
      '최대 페이지에 도달했습니다. 저장 전에 페이지 수를 확인하세요.'
    );
  }

  const activeJobs = allJobs
    .filter(isActive)
    .map(normalizeJob);

  // 최신 등록 공고 우선
  activeJobs.sort((a, b) =>
    String(b.startDate || '').localeCompare(
      String(a.startDate || '')
    )
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(activeJobs, null, 2),
    'utf8'
  );

  const companies = [
    ...new Set(activeJobs.map(job => job.company))
  ];

  console.log('\n========== 수집 결과 ==========');
  console.log('전체 조회:', allJobs.length);
  console.log('모집 중 공고:', activeJobs.length);
  console.log('계열사 수:', companies.length);
  console.log('계열사:', companies.join(', '));
  console.log('저장 파일:', OUTPUT_FILE);
}

main().catch(error => {
  console.error('CJ 수집 실패:', error.message);
  process.exitCode = 1;
});
