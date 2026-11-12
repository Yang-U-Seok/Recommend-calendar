
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.samsungcareers.com';
const OUTPUT_FILE = path.join(__dirname, 'samsungJobs.json');

// 처음에는 3페이지만 테스트
const MAX_PAGES = 3;
const REQUEST_DELAY = 1500;

// 날짜 변환
function formatDate(value) {
  if (!value) return null;

  const str = String(value).trim();

  if (str.length < 8) return null;

  const date =
    `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;

  if (str.length >= 12) {
    return `${date} ${str.slice(8, 10)}:${str.slice(10, 12)}`;
  }

  return date;
}

// 서버에 요청을 너무 빠르게 보내지 않도록 대기
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. 페이지별 채용공고 목록 조회
async function getSamsungJobs(page = 1) {
  const params = new URLSearchParams({
    currentPageNo: String(page),
    intNo: '0',
    strVal: '',
    strTxt: '',
    strKey: '',
    strCompany: '',
    strType: 'B',
    strOrderBy: '',
    strEntity: ''
  });

  const response = await fetch(`${BASE_URL}/hr/list.data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html'
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `${page}페이지 조회 실패: HTTP ${response.status}`
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const jobs = [];

  $('li').each((_, element) => {
    const item = $(element);

    const company = item.find('.company').first().text().trim();
    const title = item.find('.title').first().text().trim();

    const rawId = item.find('a[data-value]').first().attr('data-value');
    const id = rawId ? rawId.replace(/,/g, '') : '';

    if (!company || !title || !id) return;

    jobs.push({
      id,
      company,
      title,
      source: 'Samsung Careers'
    });
  });

  return jobs;
}

// 2. 상세정보 조회
async function getSamsungDetail(id) {
  const params = new URLSearchParams({
    seqno: String(id),
    strCode: ''
  });

  const response = await fetch(
    `${BASE_URL}/recruit/detail.data?${params}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `상세정보 조회 실패: HTTP ${response.status}`
    );
  }

  const json = await response.json();

  if (!json.success || !json.data?.result) {
    throw new Error('상세정보가 없습니다.');
  }

  const result = json.data.result;
  const items = json.data.items || [];

  return {
    company: result.cmpNameKr || '',
    title: result.title || '',
    startDate: formatDate(result.startdate),
    endDate: formatDate(result.enddate),
    qualifications: result.qlfctKr || '',
    applicationProcess: result.processKr || '',
    positions: items.map(item => ({
      name: item.titleKr || '',
      description: item.taskKr || '',
      qualifications: item.qlfctKr || '',
      preferences: item.favorKr || '',
      location: item.workPlaceKr || ''
    }))
  };
}

// 3. 전체 페이지 수집
async function collectAllJobs() {
  const allJobs = [];
  const seenIds = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    console.log(`\n[목록 조회] ${page}페이지`);

    let jobs;

    try {
      jobs = await getSamsungJobs(page);
    } catch (error) {
      console.error(error.message);
      break;
    }

    console.log(`${jobs.length}건 발견`);

    if (jobs.length === 0) {
      console.log('더 이상 공고가 없어 종료합니다.');
      break;
    }

    let newCount = 0;

    for (const job of jobs) {
      if (seenIds.has(job.id)) continue;

      seenIds.add(job.id);
      allJobs.push(job);
      newCount++;
    }

    console.log(`신규 공고 ${newCount}건`);

    if (newCount === 0) {
      console.log('중복 페이지 감지, 수집 종료');
      break;
    }

    await sleep(REQUEST_DELAY);
  }

  return allJobs;
}

// 4. 상세정보 수집 및 저장
async function main() {
  try {
    console.log('삼성 채용공고 수집 시작');

    const jobs = await collectAllJobs();

    console.log(`\n중복 제거 후 ${jobs.length}건`);

    const results = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      console.log(
        `[${i + 1}/${jobs.length}] ${job.company} - ${job.title}`
      );

      try {
        const detail = await getSamsungDetail(job.id);

        results.push({
          id: job.id,
          company: detail.company || job.company,
          companySize: '미확인',
          title: detail.title || job.title,
          startDate: detail.startDate,
          endDate: detail.endDate,
          qualifications: detail.qualifications,
          applicationProcess: detail.applicationProcess,
          positions: detail.positions,
          source: job.source
        });

      } catch (error) {
        console.error(
          `[상세 조회 실패] ${job.id}: ${error.message}`
        );

        results.push({
          ...job,
          companySize: '미확인',
          detailError: error.message
        });
      }

      await sleep(REQUEST_DELAY);
    }

    // 수집 실패로 기존 데이터를 덮어쓰지 않도록 보호
    if (results.length === 0) {
      console.log('수집된 공고가 없어 기존 파일을 유지합니다.');
      return;
    }

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(results, null, 2),
      'utf8'
    );

    console.log('\n===== 수집 완료 =====');
    console.log(`총 ${results.length}건`);
    console.log(`저장 위치: ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('수집 오류:', error.message);
    process.exitCode = 1;
  }
}

main();
