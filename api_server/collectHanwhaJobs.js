
/**
 * collectHanwhaJobs.js
 *
 * 한화그룹 현재 모집 중인 채용공고 + 상세정보 수집
 * - 목록 API 전체 페이지 순회
 * - 상세 API 조회
 * - 직무별 담당업무 / 지원자격 / 우대사항 저장
 * - 필수 / 우대 자격증 분리
 * - JSON 파일 자동 생성
 *
 * 실행: node collectHanwhaJobs.js
 * Node.js 18 이상
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL =
  'https://hwadm.hanwhain.com/new-backend/portal/api/rcRecruit';

const LIST_URL = `${BASE_URL}/search-rcrt`;
const DETAIL_URL = `${BASE_URL}/get-rcrt`;

const OUTPUT_FILE = path.join(
  __dirname,
  'hanwhaJobsDetail.json'
);

const PAGE_SIZE = 20;
const MAX_PAGES = 100;
const REQUEST_DELAY = 700;
const RETRY_COUNT = 3;
const TIMEOUT_MS = 15000;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const CERTIFICATE_NAMES = [
  '정보처리기사',
  '정보처리산업기사',
  '정보보안기사',
  '정보보안산업기사',
  '빅데이터분석기사',
  '전자기사',
  '전자산업기사',
  '전기기사',
  '전기산업기사',
  '전기공사기사',
  '전기공사산업기사',
  '무선설비기사',
  '무선설비산업기사',
  '정보통신기사',
  '정보통신산업기사',
  '방송통신기사',
  '통신선로산업기사',
  '산업안전기사',
  '산업안전산업기사',
  '건설안전기사',
  '건설안전산업기사',
  '위험물기능사',
  '위험물산업기사',
  '위험물기능장',
  '가스기능사',
  '가스산업기사',
  '가스기사',
  '가스기능장',
  '화공기사',
  '화학분석기사',
  '대기환경기사',
  '대기환경산업기사',
  '수질환경기사',
  '수질환경산업기사',
  '폐기물처리기사',
  '에너지관리기사',
  '에너지관리산업기사',
  '공조냉동기계기사',
  '공조냉동기계산업기사',
  '일반기계기사',
  '건설기계설비기사',
  '설비보전기사',
  '설비보전산업기사',
  '기계설계산업기사',
  '품질경영기사',
  '품질경영산업기사',
  '건축기사',
  '건축산업기사',
  '토목기사',
  '토목산업기사',
  '소방설비기사',
  '소방설비산업기사',
  '컴퓨터활용능력 1급',
  '컴퓨터활용능력 2급',
  '컴퓨터활용능력1급',
  '컴퓨터활용능력2급',
  '한국사능력검정시험',
  'SQLD',
  'SQLP',
  'ADsP',
  'ADP',
  'AWS Certified Solutions Architect',
  'AWS Certified Developer',
  'AWS Certified Cloud Practitioner',
  'CCNA',
  'CCNP',
  'CISSP',
  'CISA',
  'PMP',
  'CPA',
  'AICPA',
  'CFA',
  'FRM',
  'OPIc',
  'TOEIC',
  'TOEIC Speaking',
  'JLPT',
  'HSK'
];

const CERTIFICATE_ALIASES = {
  '위업물산업기사': '위험물산업기사',
  '컴퓨터활용능력1급': '컴퓨터활용능력 1급',
  '컴퓨터활용능력2급': '컴퓨터활용능력 2급'
};

function getKoreanNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return (
    `${values.year}-${values.month}-${values.day} ` +
    `${values.hour}:${values.minute}:${values.second}`
  );
}

function normalizeDateTime(value) {
  if (!value) return null;

  const match = String(value).match(
    /^(\d{4})[.-](\d{1,2})[.-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) return null;

  const [, y, m, d, h, min, sec = '00'] = match;

  return (
    `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ` +
    `${h.padStart(2, '0')}:${min}:${sec}`
  );
}

function isActiveJob(job, now) {
  const start = normalizeDateTime(job.rtAcptStrtDttm);
  const end = normalizeDateTime(job.rtAcptEndDttm);

  if (!start || !end) return false;

  return start <= now && now <= end;
}

async function requestApi(url, payload) {
  let lastError;

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'ko',
          Origin: 'https://www.hanwhain.com',
          Referer: 'https://www.hanwhain.com/'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();

      if (json.success !== true || !json.data) {
        throw new Error(
          json.message || 'API 응답 오류'
        );
      }

      return json.data;
    } catch (error) {
      lastError = error;

      console.warn(
        `요청 실패 ${attempt}/${RETRY_COUNT}: ${error.message}`
      );

      if (attempt < RETRY_COUNT) {
        await sleep(attempt * 1500);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

function makeListPayload(page) {
  return {
    langCd: 'ko',
    searchText: '',
    sdSeqList: null,
    rtNrcrtYn: '',
    rtCarrYn: '',
    rtIntnYn: '',
    rtPermanentWorkYn: '',
    rtTempWorkYn: '',
    rjSeqList: null,
    djSeqList: null,
    page,
    size: PAGE_SIZE
  };
}

async function collectList() {
  const allJobs = new Map();
  const now = getKoreanNow();

  let page = 0;
  let totalCount = 0;
  let completed = false;

  console.log('한화 채용공고 목록 수집 시작');

  while (page < MAX_PAGES) {
    const data = await requestApi(
      LIST_URL,
      makeListPayload(page)
    );

    if (!Array.isArray(data.list)) {
      throw new Error('목록 응답 형식이 올바르지 않습니다.');
    }

    if (page === 0) {
      totalCount = Number(
        data.filteredCount ?? data.totalCount ?? 0
      );

      console.log(`API 전체 조회: ${totalCount}건`);
    }

    for (const job of data.list) {
      if (
        job.rtSeq != null &&
        isActiveJob(job, now)
      ) {
        allJobs.set(String(job.rtSeq), job);
      }
    }

    console.log(
      `${page + 1}페이지 완료 / 모집 중 ${allJobs.size}건`
    );

    if (data.hasNext === false || data.list.length === 0) {
      completed = true;
      break;
    }

    page++;
    await sleep(REQUEST_DELAY);
  }

  if (!completed) {
    throw new Error(
      '최대 페이지 수에 도달했습니다. 목록 수집을 중단합니다.'
    );
  }

  console.log(
    `목록 수집 완료: 모집 중 ${allJobs.size}건`
  );

  return [...allJobs.values()];
}

async function fetchDetail(rtSeq) {
  const data = await requestApi(DETAIL_URL, {
    rtSeq: Number(rtSeq),
    hidnKey: null,
    langCd: 'ko'
  });

  if (!data.item || typeof data.item !== 'object') {
    throw new Error(
      `${rtSeq}번 상세정보가 없습니다.`
    );
  }

  return data.item;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function normalizeCertificateName(name) {
  return CERTIFICATE_ALIASES[name] || name;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCertificates(text) {
  const source = cleanText(text);
  const found = new Set();

  const sortedNames = [...CERTIFICATE_NAMES].sort(
    (a, b) => b.length - a.length
  );

  for (const name of sortedNames) {
    const regex = new RegExp(
      `(^|[^A-Za-z0-9가-힣])${escapeRegex(name)}(?=$|[^A-Za-z0-9가-힣])`,
      'gi'
    );

    if (regex.test(source)) {
      found.add(normalizeCertificateName(name));
    }
  }

  return [...found];
}

function extractSections(text) {
  const source = cleanText(text);
  const lines = source.split('\n');

  const sections = {
    duties: [],
    requirements: [],
    preferences: [],
    other: []
  };

  let current = 'other';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) continue;

    const header = line
      .replace(/^[\[\]【】■●•\s]+|[\[\]【】\s]+$/g, '')
      .replace(/[:：]$/, '')
      .trim();

    if (/^(담당\s*업무|주요\s*업무|수행\s*업무|업무\s*내용|직무\s*내용|담당\s*직무)$/.test(header)) {
      current = 'duties';
      continue;
    }

    if (/^(자격\s*요건|지원\s*자격|필수\s*요건|필수\s*자격|필요\s*역량|요구\s*역량|응시\s*자격)$/.test(header)) {
      current = 'requirements';
      continue;
    }

    if (/^(우대\s*사항|우대\s*조건|우대\s*요건|우대\s*자격|가점\s*사항)$/.test(header)) {
      current = 'preferences';
      continue;
    }

    if (/^(기타\s*사항|근무\s*조건|복리\s*후생|전형\s*절차|접수\s*방법)$/.test(header)) {
      current = 'other';
      continue;
    }

    sections[current].push(line);
  }

  return {
    duties: sections.duties.join('\n'),
    requirements: sections.requirements.join('\n'),
    preferences: sections.preferences.join('\n'),
    other: sections.other.join('\n')
  };
}

function classifyCertificates(sections, commonRequirements) {
  const required = new Set();
  const preferred = new Set();

  for (const name of findCertificates(sections.requirements)) {
    required.add(name);
  }

  for (const name of findCertificates(commonRequirements)) {
    required.add(name);
  }

  for (const name of findCertificates(sections.preferences)) {
    preferred.add(name);
  }

  // 자격요건 영역에 있더라도 '우대'라고 명시된 문장은
  // 우대 자격증으로 분류한다.
  const requirementLines = (
    sections.requirements + '\n' + commonRequirements
  ).split('\n');

  for (const line of requirementLines) {
    if (/우대|가점|preferred/i.test(line)) {
      for (const name of findCertificates(line)) {
        preferred.add(name);
        required.delete(name);
      }
    }
  }

  // 우대사항에 포함된 자격증이 필수에도 잡힌 경우,
  // 실제 문맥 검토가 필요하므로 양쪽에 남겨둔다.
  // 단순 중복 제거로 필수 조건을 지우지 않는다.

  return {
    requiredCertificates: [...required],
    preferredCertificates: [...preferred]
  };
}

function normalizePosition(unit, commonRequirements) {
  const rawDescription = cleanText(unit.ruDtlJob);
  const sections = extractSections(rawDescription);

  const certificates = classifyCertificates(
    sections,
    commonRequirements
  );

  return {
    id: unit.ruSeq ?? null,
    name: cleanText(unit.ruNm),
    location: cleanText(unit.ruWorkpl),
    recruitmentCount: cleanText(unit.ruRcrtPrsn),
    isClosed: unit.ruClsYn === 'Y',

    description: rawDescription,
    duties: sections.duties,
    requirements: sections.requirements,
    preferences: sections.preferences,

    requiredCertificates:
      certificates.requiredCertificates,

    preferredCertificates:
      certificates.preferredCertificates
  };
}

function normalizeJob(listItem, detail) {
  const commonRequirements = cleanText(detail.rtExmQlf);

  const positions = Array.isArray(detail.unitDt)
    ? detail.unitDt.map(unit =>
        normalizePosition(unit, commonRequirements)
      )
    : [];

  const requiredCertificates = new Set();
  const preferredCertificates = new Set();

  for (const position of positions) {
    for (const cert of position.requiredCertificates) {
      requiredCertificates.add(cert);
    }

    for (const cert of position.preferredCertificates) {
      preferredCertificates.add(cert);
    }
  }

  // 공통 지원자격에 직접 기재된 자격증
  for (const cert of findCertificates(commonRequirements)) {
    if (!preferredCertificates.has(cert)) {
      requiredCertificates.add(cert);
    }
  }

  const startDateTime = normalizeDateTime(
    detail.rtAcptStrtDttm ||
    listItem.rtAcptStrtDttm
  );

  const endDateTime = normalizeDateTime(
    detail.rtAcptEndDttm ||
    listItem.rtAcptEndDttm
  );

  return {
    id: `hanwha-${detail.rtSeq}`,
    sourceId: detail.rtSeq,

    group: '한화',
    company: cleanText(
      detail.sdNm || listItem.sdNm || '한화'
    ),
    companySize: '대기업',

    title: cleanText(
      detail.rtNm || listItem.rtNm
    ),

    startDate: startDateTime?.slice(0, 10) || null,
    endDate: endDateTime?.slice(0, 10) || null,

    startDateTime,
    endDateTime,

    location: [
      ...new Set(
        positions
          .map(position => position.location)
          .filter(Boolean)
      )
    ].join(', '),

    tags: Array.isArray(detail.tagList)
      ? detail.tagList
          .map(tag => tag.rttgNm)
          .filter(Boolean)
      : [],

    commonRequirements,

    recruitmentProcess: cleanText(detail.rtExmProc),
    applicationGuide: cleanText(detail.rtRctPrd),
    additionalNotes: cleanText(detail.rtEct),

    positions,

    requiredCertificates: [...requiredCertificates],
    preferredCertificates: [...preferredCertificates],

    // 상세 공고의 정확한 웹 URL 형식은 별도 확인 필요
    url: 'https://www.hanwhain.com/',

    source: '한화인 공식 채용공고 API',
    collectedAt: new Date().toISOString()
  };
}

async function main() {
  console.log('=================================');
  console.log('한화 채용공고 상세 수집 시작');
  console.log('=================================');

  const list = await collectList();

  const jobs = [];
  const failures = [];

  for (let i = 0; i < list.length; i++) {
    const listItem = list[i];

    try {
      const detail = await fetchDetail(listItem.rtSeq);

      const job = normalizeJob(listItem, detail);

      // 상세정보 기준으로 모집 상태 재확인
      if (!job.startDateTime ||
          !job.endDateTime ||
          job.startDateTime > getKoreanNow() ||
          job.endDateTime < getKoreanNow()) {
        console.log(
          `[${i + 1}/${list.length}] 모집기간 외 제외`
        );
        continue;
      }

      jobs.push(job);

      console.log(
        `[${i + 1}/${list.length}] ${job.company} | ` +
        `${job.title} | 직무 ${job.positions.length}개 | ` +
        `필수 자격증 ${job.requiredCertificates.length}개 | ` +
        `우대 자격증 ${job.preferredCertificates.length}개`
      );
    } catch (error) {
      failures.push({
        rtSeq: listItem.rtSeq,
        title: listItem.rtNm,
        error: error.message
      });

      console.error(
        `[${i + 1}/${list.length}] 상세 수집 실패: ` +
        `${listItem.rtSeq} - ${error.message}`
      );
    }

    await sleep(REQUEST_DELAY);
  }

  // 일부 요청이 실패했으면 기존 파일을 덮어쓰지 않는다.
  if (failures.length > 0) {
    const failurePath = path.join(
      __dirname,
      'hanwhaFailedJobs.json'
    );

    await fs.writeFile(
      failurePath,
      JSON.stringify(failures, null, 2),
      'utf8'
    );

    console.error(
      `상세정보 수집 실패 ${failures.length}건. ` +
      '기존 JSON 파일을 유지합니다.'
    );
    console.error(`실패 목록: ${failurePath}`);

    process.exitCode = 1;
    return;
  }

  jobs.sort((a, b) =>
    String(a.endDateTime).localeCompare(
      String(b.endDateTime)
    )
  );

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(jobs, null, 2),
    'utf8'
  );

  const allRequired = new Set();
  const allPreferred = new Set();

  for (const job of jobs) {
    job.requiredCertificates.forEach(cert =>
      allRequired.add(cert)
    );

    job.preferredCertificates.forEach(cert =>
      allPreferred.add(cert)
    );
  }

  console.log('\n=================================');
  console.log('한화 채용공고 상세 수집 완료');
  console.log('=================================');

  console.log(`현재 모집 중 공고: ${jobs.length}건`);
  console.log(`필수 자격증 종류: ${allRequired.size}개`);
  console.log(`우대 자격증 종류: ${allPreferred.size}개`);

  console.log(
    '필수 자격증:',
    [...allRequired].join(', ') || '없음'
  );

  console.log(
    '우대 자격증:',
    [...allPreferred].join(', ') || '없음'
  );

  console.log(`저장 파일: ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error('수집 실패:', error.message);
  process.exitCode = 1;
});
