
/**
 * testLGDetail.js
 * LG Careers 채용공고 전체 상세정보 수집
 *
 * 실행:
 * node testLGDetail.js
 *
 * 입력:
 * lgJobs.json
 *
 * 출력:
 * lgJobsDetail.json
 */

const fs = require('fs');
const path = require('path');

const API_URL =
  'https://api.careers.lg.com/rmk/job/retrieveJobNoticesDetail';

const INPUT_PATH = path.join(__dirname, 'lgJobs.json');
const OUTPUT_PATH = path.join(__dirname, 'lgJobsDetail.json');

const DELAY_MS = 1000;
const MAX_RETRIES = 2;
const TIMEOUT_MS = 20000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    );
}

function htmlToText(html) {
  if (!html) return '';

  return decodeHtml(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<img\b[^>]*>/gi, ' [이미지] ')
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function fetchLGDetail(jobNoticeId) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();

      const timer = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
      );

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
          body: JSON.stringify({ jobNoticeId }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const result = await response.json();

      if (result.status !== 'S') {
        throw new Error(
          result.msg || 'LG 상세정보 응답 오류'
        );
      }

      const detail = result.data?.jobNoticesDetail;

      if (!detail?.jobNoticesDetail) {
        throw new Error('상세정보가 비어 있습니다.');
      }

      return detail;

    } catch (error) {
      if (
        error.status &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        throw error;
      }

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      console.log(
        `  재시도 ${attempt + 1}/${MAX_RETRIES}: ${error.message}`
      );

      await sleep(2000 * (attempt + 1));
    }
  }
}


function normalizeDetail(listJob, detail) {
  const job = detail.jobNoticesDetail || {};

  const positions = (detail.recList || []).map(item => {
    const html = item.detailContext || '';
    const hasImage = /<img\b/i.test(html);

    return {
      name: item.jobGroupName || '',
      organization: item.orgName || '',
      jobCodeName: item.jobCodeName || '',

      // 담당업무
      mainTask: htmlToText(item.mainTask || ''),

      // 필수 지원자격
      requiredQualifications: htmlToText(
        item.requiredItem || ''
      ),

      // 우대사항
      preferredQualifications: htmlToText(
        item.preferredItem || ''
      ),

      // 기타 직무 상세정보
      detailText: htmlToText(html),

      // 관련 전공
      major: htmlToText(item.majorCodeName || ''),

      // 이미지 포함 여부
      hasImage
    };
  });

  return {
    ...listJob,

    jobNoticeId: job.jobNoticeId,

    company: job.companyName || listJob.company,
    title: job.jobNoticeName || listJob.title,

    startDate: job.recStartDate || listJob.startDate,
    endDateTime: job.recEndDate || null,

    location: job.workLocation || listJob.location,
    category: job.jobGroupSh || listJob.category,

    qualifications: job.qualForAppInfo || '',

    recruitmentProcess: job.recProcessInfo || '',
    submitMethod: job.submitMethodInfo || '',
    otherInfo: job.otherInfo || '',

    positions,

    detailCollected: true,
    detailCollectedAt: new Date().toISOString()
  };
}

async function main() {
  console.log('====================================');
  console.log('LG 전체 채용공고 상세정보 수집 시작');
  console.log('====================================');

  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(
      'lgJobs.json 파일이 없습니다. 먼저 node testLG.js를 실행하세요.'
    );
  }

  const listData = JSON.parse(
    fs.readFileSync(INPUT_PATH, 'utf8')
  );

  const jobs = listData.jobs || [];

  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error('수집할 LG 채용공고가 없습니다.');
  }

  console.log('수집 대상:', jobs.length, '건');

  const collectedJobs = [];
  const failedJobs = [];

  for (let i = 0; i < jobs.length; i++) {
    const listJob = jobs[i];

    const jobNoticeId = Number(listJob.jobNoticeId);

    console.log(
      `\n[${i + 1}/${jobs.length}] ${listJob.company} - ${listJob.title}`
    );

    if (!Number.isSafeInteger(jobNoticeId)) {
      failedJobs.push({
        jobNoticeId: listJob.jobNoticeId,
        title: listJob.title,
        error: '유효하지 않은 공고 ID'
      });
      continue;
    }

    try {
      const detail = await fetchLGDetail(jobNoticeId);

      const normalized = normalizeDetail(
        listJob,
        detail
      );

      collectedJobs.push(normalized);

      console.log(
        `  성공 | 모집 직무 ${normalized.positions.length}개`
      );

      const imageCount = normalized.positions.filter(
        position => position.hasImage
      ).length;

      if (imageCount > 0) {
        console.log(
          `  이미지 포함 직무 ${imageCount}개`
        );
      }

    } catch (error) {
      failedJobs.push({
        jobNoticeId,
        company: listJob.company,
        title: listJob.title,
        error: error.message
      });

      console.log('  실패:', error.message);
    }

    if (i < jobs.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const output = {
    success: failedJobs.length === 0,
    group: 'LG',

    totalCount: jobs.length,
    collectedCount: collectedJobs.length,
    failedCount: failedJobs.length,

    updatedAt: new Date().toISOString(),

    jobs: collectedJobs,
    failedJobs
  };

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log('\n====================================');
  console.log('LG 상세정보 수집 완료');
  console.log('====================================');

  console.log('전체 공고:', jobs.length);
  console.log('수집 성공:', collectedJobs.length);
  console.log('수집 실패:', failedJobs.length);
  console.log('저장 파일:', OUTPUT_PATH);

  if (failedJobs.length > 0) {
    console.log('\n실패한 공고:');

    failedJobs.forEach(job => {
      console.log(
        `${job.jobNoticeId} - ${job.error}`
      );
    });
  }
}

main().catch(error => {
  console.error(
    '\nLG 상세정보 수집 실패:',
    error.message
  );

  process.exitCode = 1;
});
