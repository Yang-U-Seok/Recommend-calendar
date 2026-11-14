
/**
 * certificateExtractor.js
 * 삼성·LG 채용공고에서 명시된 자격증명 통합 추출
 *
 * 실행: node certificateExtractor.js
 *
 * 입력:
 * - samsungJobs.json
 * - lgJobsDetail.json
 * - certificateNames.json (선택)
 *
 * 출력:
 * - companyCertificates.json
 *
 * 주의: 규칙 기반 추출이며 Q-Net 공식 명칭 검증 전입니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const LG_INPUT = path.join(ROOT, 'lgJobsDetail.json');
const SAMSUNG_INPUT = path.join(ROOT, 'samsungJobs.json');
const HYUNDAI_INPUT = path.join(ROOT, 'hyundaiJobs.json');
const OUTPUT = path.join(ROOT, 'companyCertificates.json');
const DICTIONARY = path.join(ROOT, 'certificateNames.json');

// 시작용 자격증 목록
const STARTER_CERTIFICATES = [
  '정보처리기사',
  '정보처리산업기사',
  '정보처리기능사',
  '정보보안기사',
  '정보보안산업기사',
  '빅데이터분석기사',
  '전자기사',
  '전자산업기사',
  '전기기사',
  '전기산업기사',
  '전기기능사',
  '전기공사기사',
  '전기공사산업기사',
  '산업안전기사',
  '산업안전산업기사',
  '건설안전기사',
  '건설안전산업기사',
  '산업위생관리기사',
  '산업위생관리산업기사',
  '소방설비기사',
  '소방설비산업기사',
  '위험물산업기사',
  '위험물기능사',
  '가스기사',
  '가스산업기사',
  '가스기능사',
  '화공기사',
  '화학분석기사',
  '화학분석기능사',
  '환경기능사',
  '대기환경기사',
  '대기환경산업기사',
  '수질환경기사',
  '수질환경산업기사',
  '폐기물처리기사',
  '폐기물처리산업기사',
  '토양환경기사',
  '에너지관리기사',
  '에너지관리산업기사',
  '에너지관리기능사',
  '공조냉동기계기사',
  '공조냉동기계산업기사',
  '공조냉동기계기능사',
  '일반기계기사',
  '기계설계기사',
  '기계설계산업기사',
  '설비보전기사',
  '설비보전기능사',
  '건축기사',
  '건축산업기사',
  '건축설비기사',
  '건축설비산업기사',
  '토목기사',
  '토목산업기사',
  '품질경영기사',
  '품질경영산업기사',
  '자동차정비기사',
  '자동차정비산업기사',
  '자동차정비기능사',
  '용접기사',
  '용접산업기사',
  '용접기능사',
  '컴퓨터응용가공산업기사',
  '컴퓨터응용선반기능사',
  '컴퓨터응용밀링기능사',
  '생산자동화산업기사',
  '생산자동화기능사',
  '무선설비기사',
  '무선설비산업기사',
  '통신선로산업기사',
  '방송통신기사',
  '방송통신산업기사',
  '정보통신기사',
  '정보통신산업기사',
  '전파전자통신기사',
  '식품기사',
  '식품산업기사',
  '식품가공기능사',
  '지게차운전기능사',
  '굴착기운전기능사',
  '물류관리사',
  '유통관리사',
  '직업상담사2급',
  '직업상담사1급',
  '컴퓨터활용능력1급',
  '컴퓨터활용능력2급',
  '워드프로세서',
  '한국사능력검정시험'
];

// 자격증 사전 읽기
function readDictionary() {
  if (!fs.existsSync(DICTIONARY)) {
    return {
      names: STARTER_CERTIFICATES,
      source: 'starter'
    };
  }

  const data = JSON.parse(fs.readFileSync(DICTIONARY, 'utf8'));

  const names = Array.isArray(data)
    ? data
    : data.certificates;

  if (
    !Array.isArray(names) ||
    !names.every(x => typeof x === 'string')
  ) {
    throw new Error(
      'certificateNames.json은 문자열 배열이어야 합니다.'
    );
  }

  return {
    names,
    source: 'certificateNames.json'
  };
}

// 문자열 정규화
function compact(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

// 자격증명 앞뒤 문자 확인
function validBoundary(s, start, end) {
  const char = /[가-힣A-Za-z0-9]/;

  return (
    (start === 0 || !char.test(s[start - 1])) &&
    (end === s.length || !char.test(s[end]))
  );
}

// 실제 자격증명 추출
function findCertificates(text, dictionary) {
  const original = String(text || '').normalize('NFKC');
  const normalized = original.replace(/\s+/g, ' ');

  const results = [];
  const seen = new Set();

  for (const name of dictionary) {
    const pattern = name
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s*');

    const re = new RegExp(pattern, 'gi');

    for (const match of normalized.matchAll(re)) {
      const start = match.index;
      const end = start + match[0].length;

      if (!validBoundary(normalized, start, end)) {
        continue;
      }

      const key = compact(name);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      results.push({
        name,
        evidence: normalized
          .slice(
            Math.max(0, start - 35),
            Math.min(normalized.length, end + 35)
          )
          .trim()
      });
    }
  }

  return results.sort((a, b) =>
    a.name.localeCompare(b.name, 'ko')
  );
}

// 구체적인 자격증명이 없는 일반 표현 추출
function genericMentions(text) {
  const lines = String(text || '')
    .split(/\n|(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  return [
    ...new Set(
      lines.filter(line =>
        /자격증|자격증명|자격증소지|관련\s*자격|자격증\s*우대|기사\s*이상|기능사\s*이상|산업기사\s*이상/.test(line)
      )
    )
  ].slice(0, 15);
}

// 기업별 채용공고 읽기
function readJobs(filePath, group) {
  if (!fs.existsSync(filePath)) {
    console.log(
      `[안내] ${group} 입력 파일 없음: ${path.basename(filePath)}`
    );

    return [];
  }

  const data = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  );

  const jobs = Array.isArray(data)
    ? data
    : data.jobs;

  if (!Array.isArray(jobs)) {
    throw new Error(
      `${group} 파일에 채용공고 배열이 없습니다.`
    );
  }

  return jobs.map(job => ({
    ...job,
    _sourceGroup: group
  }));
}

// 메인 알고리즘
function main() {
  const jobs = [
    ...readJobs(SAMSUNG_INPUT, 'Samsung'),
    ...readJobs(LG_INPUT, 'LG'),
    ...readJobs(HYUNDAI_INPUT, 'Hyundai')
  ];

 if (!jobs.length) {
  throw new Error(
    '삼성·LG·현대 채용공고 입력 파일이 없습니다.'
  );
}

  const { names, source } = readDictionary();

  const dictionary = [
    ...new Map(
      names.map(s => [compact(s), s.trim()])
    ).values()
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const rows = [];

  // 삼성과 LG의 필드 구조 통합
  for (const job of jobs) {
    for (const [index, position] of (job.positions || []).entries()) {
      let requiredText = '';
let preferredText = '';

switch (job._sourceGroup) {
  case 'Samsung':
    requiredText = position.qualifications || '';
    preferredText = position.preferences || '';
    break;

  case 'LG':
    requiredText = position.requiredQualifications || '';
    preferredText = position.preferredQualifications || '';
    break;

  case 'Hyundai':
    requiredText = position.qualifications || '';
    preferredText = position.preferences || '';
    break;

  default:
    requiredText = '';
    preferredText = '';
}

      const required = findCertificates(
        requiredText,
        dictionary
      );

      const preferred = findCertificates(
        preferredText,
        dictionary
      );

      rows.push({
        group: job._sourceGroup,
        jobNoticeId: job.jobNoticeId ?? job.id,
        company: job.company,
        title: job.title,
        positionIndex: index,
        positionName: position.name || '',
        requiredCertificates: required,
        preferredCertificates: preferred,
        genericRequiredMentions: genericMentions(requiredText),
        genericPreferredMentions: genericMentions(preferredText),
        requiredQualifications: requiredText,
        preferredQualifications: preferredText
      });
    }
  }

  // 자격증명이 발견된 직무
  const matched = rows.filter(x =>
    x.requiredCertificates.length ||
    x.preferredCertificates.length
  );

  // 중복 제거한 자격증명
  const namesFound = [
    ...new Set(
      rows.flatMap(x =>
        [
          ...x.requiredCertificates,
          ...x.preferredCertificates
        ].map(c => c.name)
      )
    )
  ].sort((a, b) => a.localeCompare(b, 'ko'));

  // 자격증별 기업 및 직무 통계
  const byCertificate = namesFound.map(name => {
    const mentions = rows.filter(r =>
      [
        ...r.requiredCertificates,
        ...r.preferredCertificates
      ].some(c => c.name === name)
    );

    return {
      name,
      positionCount: mentions.length,
      companyCount: new Set(
        mentions.map(r => r.company)
      ).size,
      companies: [
        ...new Set(mentions.map(r => r.company))
      ].sort(),
      requiredPositionCount: mentions.filter(r =>
        r.requiredCertificates.some(c => c.name === name)
      ).length,
      preferredPositionCount: mentions.filter(r =>
        r.preferredCertificates.some(c => c.name === name)
      ).length
    };
  }).sort(
    (a, b) =>
      b.positionCount - a.positionCount ||
      a.name.localeCompare(b.name, 'ko')
  );

  const output = {
    groups: [
      ...new Set(jobs.map(j => j._sourceGroup))
    ],
    updatedAt: new Date().toISOString(),
    dictionarySource: source,
    warning:
      '사전 기반 문자열 추출이며 Q-Net 공식 명칭 검증 전입니다. 포괄적 표현은 특정 자격증으로 변환하지 않습니다.',
    summary: {
      jobs: jobs.length,
      positions: rows.length,
      positionsWithNamedCertificates: matched.length,
      uniqueNamedCertificates: namesFound.length,
      positionsWithGenericMentions: rows.filter(x =>
        x.genericRequiredMentions.length ||
        x.genericPreferredMentions.length
      ).length,
      byGroup: Object.fromEntries(
        [
          ...new Set(jobs.map(j => j._sourceGroup))
        ].map(group => [
          group,
          {
            jobs: jobs.filter(
              j => j._sourceGroup === group
            ).length,
            positions: rows.filter(
              r => r.group === group
            ).length
          }
        ])
      )
    },
    certificates: byCertificate,
    positions: rows
  };

  // 결과 JSON 저장
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(output, null, 2),
    'utf8'
  );

 console.log('=== 삼성·LG·현대 자격증 통합 추출 ===');
  console.log(
    '공고:',
    jobs.length,
    '/ 직무:',
    rows.length
  );
  console.log(
    '자격증명 발견 직무:',
    matched.length,
    '/ 서로 다른 명칭:',
    namesFound.length
  );
  console.log(
    '기업별:',
    JSON.stringify(output.summary.byGroup)
  );
  console.log(
    '자격증:',
    byCertificate
      .map(c => `${c.name}(${c.positionCount})`)
      .join(', ') || '(없음)'
  );
  console.log('저장:', OUTPUT);
}

try {
  main();
} catch (err) {
  console.error('오류:', err.message);
  process.exitCode = 1;
}
