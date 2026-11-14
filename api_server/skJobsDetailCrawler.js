
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const INPUT = path.join(__dirname, 'skJobs.json');
const OUTPUT = path.join(__dirname, 'skJobsDetail.json');

const BASE_URL = 'https://www.skcareers.com';

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const clean = value =>
  String(value || '').replace(/\s+/g, ' ').trim();

function extractSections($) {
  const sections = [];

  $('.detail-content-item').each((_, element) => {
    const section = $(element);
    const title = clean(
      section.find('.detail-content-title').first().text()
    );

    const fields = [];

    section.find('.item-column').each((_, column) => {
      const label = clean(
        $(column).find('.item-label').first().text()
      );

      const assets = [];

      $(column).find('.item-asset').each((_, asset) => {
        const assetTitle = clean(
          $(asset).find('.asset-title').first().text()
        );

        const items = $(asset)
          .find('li')
          .map((_, li) => clean($(li).text()))
          .get()
          .filter(Boolean);

        if (assetTitle || items.length) {
          assets.push({ title: assetTitle, items });
        }
      });

      if (label || assets.length) {
        fields.push({ label, assets });
      }
    });

    if (title || fields.length) {
      sections.push({ title, fields });
    }
  });

  return sections;
}

function collectByLabel(sections, pattern) {
  const results = [];

  for (const section of sections) {
    for (const field of section.fields) {
      if (!pattern.test(field.label)) continue;

      for (const asset of field.assets) {
        if (asset.title) results.push(asset.title);
        results.push(...asset.items);
      }
    }
  }

  return [...new Set(results)];
}

function extractCertificates(lines) {
  const patterns = [
    /(?:정보처리|정보보안|빅데이터분석|전기|전자|산업안전|건축|토목|기계|소방설비|무선설비|정보통신)(?:산업기사|기사|기능사|기술사)/g,
    /SQLD|SQLP|ADsP|ADP|AWS Certified|CISSP|CISA|PMP/gi,
    /(?:국내\s*)?변호사\s*자격증/g
  ];

  const certificates = new Set();

  for (const line of lines) {
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        certificates.add(clean(match[0]));
      }
    }
  }

  return [...certificates];
}

function extractMetadata($) {
  const metadata = {};

  $('.box-detail-item').each((_, element) => {
    const label = clean(
      $(element).find('.label').first().text()
    );

    const value = clean(
      $(element).find('.value').first().text()
    );

    if (label && value) metadata[label] = value;
  });

  return metadata;
}

function extractDates(text) {
  const matches = [...String(text || '').matchAll(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g
  )];

  const dates = matches.map(match =>
    `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  );

  return {
    startDate: dates[0] || null,
    endDate: dates[1] || null
  };
}

async function fetchDetail(job) {
  const noticeID = String(job.noticeID || '').trim();

  if (!/^R\d+$/.test(noticeID)) {
    throw new Error('유효하지 않은 noticeID');
  }

  const url =
    `${BASE_URL}/Recruit/Detail/${encodeURIComponent(noticeID)}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0',
      Referer: `${BASE_URL}/Recruit`
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const sections = extractSections($);
  const metadata = extractMetadata($);

if (!sections.length) {
  console.warn(
    `[상세내용 없음] ${job.title} (${noticeID})`
  );
}

  const requiredQualifications = collectByLabel(
    sections,
    /자격\s*요건|지원\s*자격|필수|핵심\s*역량/
  );

  const preferredQualifications = collectByLabel(
    sections,
    /우대|우선/
  );

  const responsibilities = collectByLabel(
    sections,
    /담당\s*업무|역할|수행\s*업무/
  );

  const dates = extractDates(metadata['지원 기간']);

  const requiredCertificates =
    extractCertificates(requiredQualifications);

  const preferredCertificates =
    extractCertificates(preferredQualifications);

  const positions = Array.isArray(job.positions)
    ? job.positions.map(position => ({
        ...position,
        requiredCertificates,
        preferredCertificates
      }))
    : [];

  return {
    ...job,
    title: clean($('.box-title').first().text()) || job.title,
    company: metadata['회사'] || job.company,
    jobRole: metadata['직무'] || job.jobRole,
    recruitType: metadata['구분'] || job.recruitType,
    workingType: metadata['유형'] || job.workingType,
    workingArea: metadata['지역'] || job.workingArea,
    startDate: dates.startDate || job.startDate,
    endDate: dates.endDate || job.endDate,
    url,
    responsibilities,
    requiredQualifications,
    preferredQualifications,
    requiredCertificates,
    preferredCertificates,
    positions,
    sections,
    detailCollected: sections.length > 0,
detailStatus: sections.length > 0
  ? 'complete'
  : 'metadata_only'
  };
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error('skJobs.json 파일이 없습니다.');
  }

  const input = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const jobs = input.jobs;

  if (!Array.isArray(jobs)) {
    throw new Error('skJobs.json의 jobs 배열이 없습니다.');
  }

  console.log(`SK 상세정보 수집 시작: ${jobs.length}건`);

  const results = [];
  let successCount = 0;
  let partialCount = 0;
  let failureCount = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    try {
      const detail = await fetchDetail(job);
results.push(detail);

if (detail.detailCollected) {
  successCount++;
  console.log(
    `[${i + 1}/${jobs.length}] 상세 수집 성공: ${detail.title}`
  );
} else {
  partialCount++;
  console.log(
    `[${i + 1}/${jobs.length}] 기본정보만 수집: ${detail.title}`
  );
}

    } catch (error) {
      failureCount++;

      results.push({
        ...job,
        detailCollected: false,
        detailError: error.message
      });

      console.error(
        `[${i + 1}/${jobs.length}] 실패: ${job.title} - ${error.message}`
      );
    }

    // 서버에 과도한 요청을 보내지 않도록 순차 실행
    if (i < jobs.length - 1) {
      await sleep(1000);
    }
  }

 const output = {
  success: failureCount === 0,
  source: 'SK Careers',
  updatedAt: new Date().toISOString(),
  totalCount: results.length,
  successCount,
  partialCount,
  failureCount,
  jobs: results
};

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(output, null, 2),
    'utf8'
  );

 console.log('================================');
console.log(`전체 공고: ${results.length}`);
console.log(`상세 수집 성공: ${successCount}`);
console.log(`기본정보만 수집: ${partialCount}`);
console.log(`수집 실패: ${failureCount}`);
console.log(`저장 파일: ${OUTPUT}`);
console.log('================================');

} // main() 함수 종료

main().catch(error => {
  console.error('크롤링 오류:', error.message);
  process.exitCode = 1;
});
