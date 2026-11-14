
/**
 * collectCjJobsPlaywright.js
 *
 * CJ 채용공고 상세정보 재수집
 *
 * 1. 기존 성공한 54건 유지
 * 2. 실패한 72건만 Playwright로 재수집
 * 3. 동적으로 표시되는 HTML 내용 추출
 * 4. 필수/우대 자격증 후보 분류
 * 5. 성공한 공고 병합 저장
 * 6. 실패 공고 별도 저장
 *
 * npm install playwright
 * npx playwright install chromium
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_DIR = __dirname;

const JOBS_FILE = path.join(BASE_DIR, 'cjJobs.json');
const DETAIL_FILE = path.join(BASE_DIR, 'cjJobsDetail.json');
const FAILED_FILE = path.join(BASE_DIR, 'cjFailedJobs.json');
const BACKUP_FILE = path.join(BASE_DIR, 'cjJobsDetail.backup.json');

const BASE_URL =
  'https://recruit.cj.net/recruit/ko/recruit/recruit/bestDetail.fo';

const DELAY_MS = 1000;
const MAX_RETRIES = 2;

const CERTIFICATES = [
  '정보처리기사',
  '정보처리산업기사',
  '정보보안기사',
  '정보보안산업기사',
  '정보통신기사',
  '정보통신산업기사',
  '무선설비기사',
  '무선설비산업기사',
  '전기기사',
  '전기산업기사',
  '전기공사기사',
  '전자기사',
  '산업안전기사',
  '산업안전산업기사',
  '건설안전기사',
  '건설안전산업기사',
  '소방설비기사',
  '소방설비산업기사',
  '위험물산업기사',
  '가스기사',
  '가스산업기사',
  '대기환경기사',
  '수질환경기사',
  '폐기물처리기사',
  '에너지관리기사',
  '공조냉동기계기사',
  '일반기계기사',
  '설비보전기사',
  '품질경영기사',
  '식품기사',
  '식품산업기사',
  '영양사',
  '위생사',
  '물류관리사',
  '유통관리사',
  '국제무역사',
  '관세사',
  '공인회계사',
  '세무사',
  '공인노무사',
  '사회조사분석사',
  '빅데이터분석기사',
  'SQLD',
  'SQLP',
  'ADsP',
  'ADP',
  'CISSP',
  'CISA',
  'PMP',
  'CPA',
  'CFA',
  'FRM',
  'CCNA',
  'CCNP',
  '컴퓨터활용능력 1급',
  '컴퓨터활용능력 2급'
];

const LANGUAGE_TESTS = [
  'TOEIC Speaking',
  'TOEIC',
  'TOEFL',
  'OPIc',
  'IELTS',
  'TEPS',
  'JLPT',
  'JPT',
  'HSK'
];

const CERT_ALIASES = {
  'SQL 개발자': 'SQLD',
  'SQL 전문가': 'SQLP',
  '데이터분석 준전문가': 'ADsP',
  '데이터분석 전문가': 'ADP'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJson(file, fallback = []) {
  if (!fs.existsSync(file)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveJson(file, data) {
  const tempFile = `${file}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(data, null, 2),
    'utf8'
  );

  fs.renameSync(tempFile, file);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTerms(text, terms) {
  const source = normalizeText(text);
  const found = [];

  for (const term of terms) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9가-힣])${escapeRegex(term)}(?=$|[^A-Za-z0-9가-힣])`,
      'i'
    );

    if (pattern.test(source)) {
      found.push(term);
    }
  }

  return unique(found);
}

function findCertificates(text) {
  const result = findTerms(text, CERTIFICATES);

  for (const [alias, name] of Object.entries(CERT_ALIASES)) {
    if (text.includes(alias)) {
      result.push(name);
    }
  }

  return unique(result);
}

function extractCredentials(requirements, preferences) {
  const requiredCertificates = [];
  const preferredCertificates = [];
  const requiredLanguageTests = [];
  const preferredLanguageTests = [];

  const requiredLines = requirements.split('\n');
  const preferredLines = preferences.split('\n');

  for (const line of requiredLines) {
    if (/무관|불필요|필요\s*없|미소지|없어도/i.test(line)) {
      continue;
    }

    const isPreferred = /우대|가점|preferred/i.test(line);

    const certs = findCertificates(line);
    const languages = findTerms(line, LANGUAGE_TESTS);

    if (isPreferred) {
      preferredCertificates.push(...certs);
      preferredLanguageTests.push(...languages);
    } else {
      requiredCertificates.push(...certs);
      requiredLanguageTests.push(...languages);
    }
  }

  for (const line of preferredLines) {
    preferredCertificates.push(...findCertificates(line));
    preferredLanguageTests.push(
      ...findTerms(line, LANGUAGE_TESTS)
    );
  }

  return {
    requiredCertificates: unique(requiredCertificates),
    preferredCertificates: unique(preferredCertificates),
    requiredLanguageTests: unique(requiredLanguageTests),
    preferredLanguageTests: unique(preferredLanguageTests)
  };
}

function buildUrl(originalId) {
  const url = new URL(BASE_URL);

  url.searchParams.set('direct', 'N');
  url.searchParams.set('zz_jo_num', originalId);
  url.searchParams.set('closeYn', '23');
  url.searchParams.set('schVal0', '1');

  for (let i = 1; i <= 5; i++) {
    url.searchParams.set(`schVal${i}`, '');
  }

  return url.toString();
}

async function extractPageDetail(page) {
  return await page.evaluate(() => {
    function clean(value) {
      return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }

    const result = {
      title: '',
      company: '',
      duties: '',
      requirements: '',
      preferences: '',
      other: '',
      sections: {},
      images: []
    };

    const title = document.querySelector(
      '.tit-wrap.view .title'
    );

    const company = document.querySelector(
      '.tit-wrap.view .company'
    );

    result.title = clean(title?.textContent);
    result.company = clean(company?.textContent);

    const items = document.querySelectorAll(
      '.detail-list > li'
    );

    for (const item of items) {
      const heading = clean(
        item.querySelector('h3.tit')?.textContent
      );

      if (!heading) continue;

      const content = item.querySelector('.contents');

      if (!content) continue;

      const text = clean(content.innerText || content.textContent);

      result.sections[heading] = text;

      const images = [...content.querySelectorAll('img')]
        .map(img => img.currentSrc || img.src)
        .filter(Boolean);

      result.images.push(...images);

      if (heading.includes('직무소개')) {
        result.duties = text;
      } else if (heading.includes('지원자격')) {
        result.requirements = text;
      } else if (heading.includes('우대사항')) {
        result.preferences = text;
      } else if (heading.includes('기타 안내')) {
        result.other = text;
      }
    }

    return result;
  });
}

async function waitForDetail(page) {
  // JS가 상세정보를 채울 시간을 최대 12초까지 기다림
  try {
    await page.waitForFunction(() => {
      const items = document.querySelectorAll(
        '.detail-list > li'
      );

      return [...items].some(item => {
        const heading = item.querySelector('h3.tit');
        const content = item.querySelector('.contents');

        if (!heading || !content) return false;

        const title = heading.textContent.trim();

        if (
          !/직무소개|지원자격|우대사항/.test(title)
        ) {
          return false;
        }

        return (content.innerText || content.textContent || '')
          .trim().length > 0;
      });
    }, { timeout: 12000 });
  } catch {
    // 대기 시간이 지나도 아래에서 다른 방식으로 확인
  }
}

async function collectDetail(browser, job) {
  const originalId = String(job.originalId || '').trim();

  if (!originalId) {
    throw new Error('공고 원본 ID 없음');
  }

  const url = buildUrl(originalId);
  const page = await browser.newPage();

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.locator('.detail-list').waitFor({
      state: 'attached',
      timeout: 15000
    });

    await waitForDetail(page);

    let detail = await extractPageDetail(page);

    // 일부 사이트는 뒤늦게 렌더링하므로 한 번 더 확인
    if (
      !detail.duties &&
      !detail.requirements &&
      !detail.preferences
    ) {
      await sleep(2000);
      detail = await extractPageDetail(page);
    }

    const hasText = Boolean(
      detail.duties ||
      detail.requirements ||
      detail.preferences
    );

    if (!hasText) {
      if (detail.images.length > 0) {
        throw new Error(
          '이미지형 공고: 별도 분석 필요'
        );
      }

      throw new Error(
        '브라우저 렌더링 후에도 상세정보가 비어 있습니다.'
      );
    }

    const credentials = extractCredentials(
      detail.requirements,
      detail.preferences
    );

    const positions = [{
      name: job.title,
      location: job.location || '',
      duties: detail.duties,
      requirements: detail.requirements,
      preferences: detail.preferences,
      ...credentials
    }];

    return {
      ...job,
      group: 'CJ',
      sourceCompany: 'CJ',
      company: job.company || detail.company,
      title: job.title || detail.title,

      duties: detail.duties,
      requirements: detail.requirements,
      preferences: detail.preferences,
      other: detail.other,

      requiredCertificates: credentials.requiredCertificates,
      preferredCertificates: credentials.preferredCertificates,

      requiredLanguageTests: credentials.requiredLanguageTests,
      preferredLanguageTests: credentials.preferredLanguageTests,

      positions,

      url,
      detailUrl: url,

      detailCollected: true,
      detailCollectedAt: new Date().toISOString(),
      collectionMethod: 'playwright'
    };

  } finally {
    await page.close();
  }
}

async function main() {
  const allJobs = readJson(JOBS_FILE);
  const existingDetails = readJson(DETAIL_FILE);
  const previousFailures = readJson(FAILED_FILE);

  if (!Array.isArray(allJobs)) {
    throw new Error('cjJobs.json 형식 오류');
  }

  if (!Array.isArray(existingDetails)) {
    throw new Error('cjJobsDetail.json 형식 오류');
  }

  if (!Array.isArray(previousFailures)) {
    throw new Error('cjFailedJobs.json 형식 오류');
  }

  // 기존 상세정보 백업
  if (fs.existsSync(DETAIL_FILE)) {
    fs.copyFileSync(DETAIL_FILE, BACKUP_FILE);
  }

  const detailsMap = new Map();

  for (const job of existingDetails) {
    detailsMap.set(job.id, job);
  }

  // 실패 목록에 있고 아직 성공 데이터가 없는 공고만 재시도
  const failedIds = new Set(
    previousFailures.map(job => job.id)
  );

  const targets = allJobs.filter(job =>
    failedIds.has(job.id) &&
    !detailsMap.has(job.id)
  );

  console.log('\n========== CJ 재수집 시작 ==========');
  console.log('전체 공고:', allJobs.length);
  console.log('기존 성공:', detailsMap.size);
  console.log('재수집 대상:', targets.length);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true
});

browser.on('disconnected', () => {
  console.error('브라우저 연결이 종료되었습니다.');
});

  const failures = [];
  let newSuccess = 0;

  try {
    for (let i = 0; i < targets.length; i++) {
      const job = targets[i];

      console.log(
        `\n[${i + 1}/${targets.length}] ${job.company} - ${job.title}`
      );

      let success = false;
      let lastError = '';

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await collectDetail(browser, job);

          detailsMap.set(job.id, result);

          newSuccess++;
          success = true;

          console.log('  수집 성공');
          console.log(
            '  직무소개:',
            result.duties.length,
            '자'
          );
          console.log(
            '  지원자격:',
            result.requirements.length,
            '자'
          );
          console.log(
            '  우대사항:',
            result.preferences.length,
            '자'
          );

          break;
        } catch (error) {
          lastError = error.message;

          console.log(
            `  ${attempt}차 실패: ${lastError}`
          );

          if (attempt < MAX_RETRIES) {
            await sleep(1500);
          }
        }
      }

      if (!success) {
        failures.push({
          id: job.id,
          originalId: job.originalId,
          company: job.company,
          title: job.title,
          url: buildUrl(job.originalId),
          error: lastError
        });
      }

      // 중간 종료되어도 성공한 데이터 보존
      if ((i + 1) % 10 === 0) {
        saveJson(
          DETAIL_FILE,
          [...detailsMap.values()]
        );

        console.log('  중간 저장 완료');
      }

      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const finalJobs = allJobs
    .map(job => detailsMap.get(job.id))
    .filter(Boolean);

  saveJson(DETAIL_FILE, finalJobs);
  saveJson(FAILED_FILE, failures);

  const allRequired = unique(
    finalJobs.flatMap(
      job => job.requiredCertificates || []
    )
  );

  const allPreferred = unique(
    finalJobs.flatMap(
      job => job.preferredCertificates || []
    )
  );

  console.log('\n========== 최종 수집 결과 ==========');
  console.log('전체 공고:', allJobs.length);
  console.log('기존 성공:', existingDetails.length);
  console.log('추가 성공:', newSuccess);
  console.log('최종 성공:', finalJobs.length);
  console.log('최종 실패:', failures.length);

  console.log(
    '필수 자격증:',
    allRequired.join(', ') || '없음'
  );

  console.log(
    '우대 자격증:',
    allPreferred.join(', ') || '없음'
  );

  console.log('상세정보:', DETAIL_FILE);
  console.log('실패 목록:', FAILED_FILE);
  console.log('기존 백업:', BACKUP_FILE);
}

main().catch(error => {
  console.error('실행 오류:', error.message);
  process.exitCode = 1;
});
