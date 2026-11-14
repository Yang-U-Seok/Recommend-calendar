
/**
 * collectCjJobsDetail.js
 * CJ 채용공고 상세정보 재수집
 *
 * 입력:
 *  - cjJobs.json
 *  - cjJobsDetail.json (기존 성공 데이터)
 *
 * 출력:
 *  - cjJobsDetail.json
 *  - cjFailedJobs.json
 *
 * Node.js 18 이상
 * npm install cheerio
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://recruit.cj.net';

const JOBS_FILE = path.join(__dirname, 'cjJobs.json');
const DETAIL_FILE = path.join(__dirname, 'cjJobsDetail.json');
const FAILED_FILE = path.join(__dirname, 'cjFailedJobs.json');

const DELAY_MS = 1200;
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJson(file, fallback = []) {
  if (!fs.existsSync(file)) return fallback;

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (!Array.isArray(data)) {
    throw new Error(`${path.basename(file)}은 JSON 배열이어야 합니다.`);
  }

  return data;
}

function saveJson(file, data) {
  const tempFile = file + '.tmp';

  fs.writeFileSync(
    tempFile,
    JSON.stringify(data, null, 2),
    'utf8'
  );

  fs.renameSync(tempFile, file);
}

function getJobId(job) {
  const value = String(
    job.originalId ||
    job.zz_jo_num ||
    job.id ||
    ''
  );

  const match = value.match(/J\d{8,}/);

  return match ? match[0] : '';
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getSectionText($, li) {
  const element = $(li).clone();

  // 제목과 SVG 제거
  element.find('h3.tit, svg, script, style').remove();

  // 줄바꿈 보존
  element.find('br').replaceWith('\n');

  element.find('p, div, li').each((_, node) => {
    $(node).append('\n');
  });

  return normalizeText(element.text());
}

function parseDetail(html) {
  const $ = cheerio.load(html);

  const result = {
    jobDescription: '',
    requirements: '',
    preferences: '',
    otherInformation: ''
  };

  $('.detail-list > li').each((_, li) => {
    const heading = normalizeText(
      $(li).find('h3.tit').first().text()
    );

    const content = getSectionText($, li);

    if (!content) return;

    if (heading.includes('직무소개')) {
      result.jobDescription = content;
    } else if (heading.includes('지원자격')) {
      result.requirements = content;
    } else if (heading.includes('우대사항')) {
      result.preferences = content;
    } else if (
      heading.includes('기타 안내') ||
      heading.includes('기타사항')
    ) {
      result.otherInformation = content;
    }
  });

  return result;
}

function buildDetailUrl(jobId) {
  const params = new URLSearchParams({
    direct: 'N',
    zz_jo_num: jobId,
    closeYn: '23',
    schVal0: '1',
    schVal1: '',
    schVal2: '',
    schVal3: '',
    schVal4: '',
    schVal5: ''
  });

  return (
    BASE_URL +
    '/recruit/ko/recruit/recruit/bestDetail.fo?' +
    params.toString()
  );
}

async function requestDetail(jobId) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    const response = await fetch(buildDetailUrl(jobId), {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer':
          BASE_URL + '/recruit/ko/recruit/recruit/list.fo'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const detail = parseDetail(html);

    const hasContent = [
      detail.jobDescription,
      detail.requirements,
      detail.preferences,
      detail.otherInformation
    ].some(Boolean);

    if (!hasContent) {
      throw new Error(
        '상세정보가 비어 있습니다. 서버 응답 또는 세션 확인 필요'
      );
    }

    return {
      ...detail,
      detailUrl: buildDetailUrl(jobId),
      detailCollected: true
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function collectWithRetry(jobId) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestDetail(jobId);
    } catch (error) {
      lastError = error;

      console.log(
        `  ${attempt}차 실패: ${error.message}`
      );

      if (attempt < MAX_RETRIES) {
        await sleep(1500);
      }
    }
  }

  throw lastError;
}

function hasDetail(job) {
  return Boolean(
    job.jobDescription ||
    job.requirements ||
    job.preferences ||
    job.otherInformation
  );
}

async function main() {
  const jobs = readJson(JOBS_FILE);
  const existingDetails = readJson(DETAIL_FILE);

  // 기존 성공 데이터 백업
  if (fs.existsSync(DETAIL_FILE)) {
    const backupFile = path.join(
      __dirname,
      'cjJobsDetail.backup.json'
    );

    if (!fs.existsSync(backupFile)) {
      fs.copyFileSync(DETAIL_FILE, backupFile);
      console.log('기존 상세정보 백업 완료');
    }
  }

  const detailMap = new Map();

  for (const job of existingDetails) {
    const id = getJobId(job);
    if (id) detailMap.set(id, job);
  }

  const failedMap = new Map();

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  const targets = jobs.filter(job => {
    const id = getJobId(job);
    return id && !hasDetail(detailMap.get(id) || {});
  });

  console.log('==============================');
  console.log('CJ 상세정보 수집 시작');
  console.log('전체 공고:', jobs.length);
  console.log('기존 상세정보:', existingDetails.length);
  console.log('재수집 대상:', targets.length);
  console.log('==============================');

  // 기존 실패 파일이 있다면 재수집 대상의 실패 상태 보존
  for (const item of readJson(FAILED_FILE)) {
    const id = getJobId(item);
    if (id && targets.some(job => getJobId(job) === id)) {
      failedMap.set(id, item);
    }
  }

  function saveProgress() {
    const merged = [...detailMap.values()];
    saveJson(DETAIL_FILE, merged);
    saveJson(FAILED_FILE, [...failedMap.values()]);
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobId = getJobId(job);

    if (!jobId) {
      console.log('공고 ID 없음:', job.title);
      continue;
    }

    const existing = detailMap.get(jobId);

    if (hasDetail(existing || {})) {
      skippedCount++;
      failedMap.delete(jobId);
      continue;
    }

    const targetNumber =
      targets.findIndex(item => getJobId(item) === jobId) + 1;

    console.log(
      `\n[${targetNumber}/${targets.length}] ` +
      `${job.company} - ${job.title}`
    );

    try {
      const detail = await collectWithRetry(jobId);

      detailMap.set(jobId, {
        ...job,
        ...(existing || {}),
        ...detail
      });

      failedMap.delete(jobId);
      successCount++;

      console.log('  상세정보 수집 성공');
      console.log(
        '  직무소개:',
        detail.jobDescription.length,
        '자'
      );
      console.log(
        '  지원자격:',
        detail.requirements.length,
        '자'
      );
      console.log(
        '  우대사항:',
        detail.preferences.length,
        '자'
      );
    } catch (error) {
      failedCount++;

      failedMap.set(jobId, {
        ...job,
        error: error.message
      });

      console.log('  최종 실패:', error.message);
    }

    // 공고마다 저장하므로 중간 종료해도 진행 상황 보존
    saveProgress();

    await sleep(DELAY_MS);
  }

  saveProgress();

  console.log('\n==============================');
  console.log('CJ 상세정보 수집 완료');
  console.log('기존 성공 건너뜀:', skippedCount);
  console.log('이번 성공:', successCount);
  console.log('이번 실패:', failedCount);
  console.log('총 상세정보:', detailMap.size);
  console.log('남은 실패:', failedMap.size);
  console.log('==============================');
}

main().catch(error => {
  console.error('실행 오류:', error);
  process.exitCode = 1;
});
