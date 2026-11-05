
const cheerio = require('cheerio');

const BASE_URL = 'https://www.samsungcareers.com';

// 날짜 변환: 202611161700 -> 2026-11-16 17:00
function formatDate(value) {
  if (!value) return null;

  const str = String(value);

  if (str.length < 8) return null;

  const date =
    `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;

  if (str.length >= 12) {
    return `${date} ${str.slice(8, 10)}:${str.slice(10, 12)}`;
  }

  return date;
}

// 1. 채용공고 목록 조회
async function getSamsungJobs() {
  const params = new URLSearchParams({
    currentPageNo: '1',
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
    throw new Error(`목록 조회 실패: HTTP ${response.status}`);
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

// 2. 채용공고 상세정보 조회
async function getSamsungDetail(id) {
  const params = new URLSearchParams({
    seqno: String(id),
    strCode: ''
  });

  const url = `${BASE_URL}/recruit/detail.data?${params}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`상세 조회 실패: HTTP ${response.status}`);
  }

  const json = await response.json();

  if (!json.success || !json.data?.result) {
    throw new Error('상세정보가 없습니다.');
  }

  const result = json.data.result;
  const items = json.data.items || [];

  return {
    company: result.cmpNameKr,
    title: result.title,

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

// 3. 목록 + 상세정보 통합
async function main() {
  try {
    console.log('삼성 채용공고 목록 조회 중...');

    const jobs = await getSamsungJobs();

    console.log(`목록 조회 성공: ${jobs.length}건`);

    const results = [];

    // 서버 부담을 줄이기 위해 순차 조회
    for (const job of jobs) {
      try {
        console.log(`상세정보 조회: ${job.id}`);

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
        console.error(`${job.id} 상세조회 실패:`, error.message);

        // 상세조회 실패해도 목록 정보는 유지
        results.push({
          ...job,
          companySize: '미확인',
          detailError: error.message
        });
      }
    }

    console.log('\n===== 최종 통합 결과 =====');
    console.log(JSON.stringify(results, null, 2));
    const fs = require('fs');
    const path = require('path');

    const filePath = path.join(__dirname, 'samsungJobs.json');

    fs.writeFileSync(
        filePath,
        JSON.stringify(results, null, 2),
        'utf8'
    );

    console.log('JSON 파일 저장 완료:', filePath);

    console.log(`\n총 ${results.length}건 처리 완료`);

  } catch (error) {
    console.error('오류:', error.message);
  }
}

main();
