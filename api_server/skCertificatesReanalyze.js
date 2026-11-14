
/**
 * skCertificatesReanalyze.js
 * 저장된 SK 채용공고의 자격증 재분석
 * 실행: node skCertificatesReanalyze.js
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'skJobsDetail.json');

const BACKUP = path.join(
  __dirname,
  `skJobsDetail_backup_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.json`
);

const clean = v =>
  String(v ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

// 자격증 인식 규칙
const RULES = [
  {
    category: '국가기술자격',
    regex: /(?:정보처리|정보보안|정보통신|무선설비|방송통신|전파전자통신|빅데이터분석|전기|전기공사|전자|산업안전|건설안전|건축|건축설비|토목|일반기계|기계설계|공조냉동기계|소방설비\s*\(?\s*(?:전기|기계)\s*\)?|가스|위험물|화공|품질경영|에너지관리|대기환경|수질환경|폐기물처리|산림|조경|식품|자동차정비|전산응용건축제도|컴퓨터응용가공)(?:기술사|기능장|산업기사|기사|기능사)/g
  },
  {
    category: '국가기술자격',
    regex: /컴퓨터활용능력\s*[12]급|워드프로세서(?:\s*[12]급)?/g
  },
  {
    category: '한국사',
    regex: /한국사능력검정(?:시험)?(?:\s*(?:심화|기본))?(?:\s*[1-6]급)?/g
  },
  {
    category: 'IT·데이터',
    regex: /\b(?:SQLD|SQLP|ADsP|ADP|DAsP|DAP|CISSP|CISA|CISM|PMP|CAPM|CCNA|CCNP|CCIE|RHCSA|RHCE|CKA|CKAD|CKS|OCJP|OCP|LPIC|ITIL|MOS)\b/gi
  },
  {
    category: 'IT·클라우드',
    regex: /\bAWS\s+Certified(?:\s+[A-Za-z0-9+ -]+)?|\b(?:AWS\s+SAA|AWS\s+SAP|AZ-900|AZ-104|AZ-204|AZ-305|DP-900|DP-203|AI-900|AI-102|PL-300|GCP\s+ACE|GCP\s+PCA)\b/gi
  },
  {
    category: '어학시험',
    regex: /\b(?:TOEIC\s*Speaking|TOEIC|TOEFL(?:\s+iBT)?|OPIc|IELTS|TEPS|NEW\s+TEPS|G-TELP|JLPT\s*N?[1-5]?|JPT|HSK\s*[1-6]?|HSKK)\b/gi
  },
  {
    category: '전문자격',
    regex: /(?:국내\s*)?변호사\s*자격(?:증)?|(?:공인)?회계사\s*자격(?:증)?|공인노무사\s*자격(?:증)?|세무사\s*자격(?:증)?|변리사\s*자격(?:증)?|감정평가사\s*자격(?:증)?|법무사\s*자격(?:증)?|관세사\s*자격(?:증)?|건축사\s*자격(?:증)?/g
  }
];

// 문장에서 자격증 찾기
function findCertificates(lines) {
  const found = new Map();

  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;

    for (const rule of RULES) {
      const regex = new RegExp(
        rule.regex.source,
        rule.regex.flags
      );

      for (const match of line.matchAll(regex)) {
        let name = clean(match[0]);

        if (/^AWS Certified/i.test(name)) {
          name = name.replace(
            /\s+(?:자격증|보유|우대|필수|이상|취득|경험).*$/i,
            ''
          ).trim();
        }

        const key = name
          .replace(/\s+/g, '')
          .toLowerCase();

        if (!found.has(key)) {
          found.set(key, {
            name,
            category: rule.category,
            evidence: line
          });
        }
      }
    }
  }

  return [...found.values()];
}

// 기존 상세정보에서 항목 추출
function extractFields(job) {
  const fields = [];

  for (const section of
    Array.isArray(job.sections) ? job.sections : []) {

    for (const field of
      Array.isArray(section.fields) ? section.fields : []) {

      const lines = [];

      for (const asset of
        Array.isArray(field.assets) ? field.assets : []) {

        if (asset.title) {
          lines.push(asset.title);
        }

        for (const item of
          Array.isArray(asset.items) ? asset.items : []) {
          lines.push(item);
        }
      }

      fields.push({
        label: clean(field.label),
        lines
      });
    }
  }

  return fields;
}

// 중복 문자열 제거
function uniqueStrings(values) {
  return [
    ...new Map(
      values
        .filter(Boolean)
        .map(x => [
          clean(x).toLowerCase(),
          clean(x)
        ])
    ).values()
  ];
}

// 채용공고 하나 분석
function analyze(job) {
  const fields = extractFields(job);

  const requiredLines = [];
  const preferredLines = [];
  const otherLines = [];

  const requiredLabel =
    /자격\s*요건|지원\s*자격|필수\s*(?:요건|사항|자격)|핵심\s*역량/;

  const preferredLabel = /우대|우선/;

  for (const field of fields) {
    if (preferredLabel.test(field.label)) {
      preferredLines.push(...field.lines);
    } else if (requiredLabel.test(field.label)) {
      requiredLines.push(...field.lines);
    } else {
      otherLines.push(...field.lines);
    }
  }

  // 기존에 추출한 자격요건도 함께 분석
  requiredLines.push(
    ...(Array.isArray(job.requiredQualifications)
      ? job.requiredQualifications
      : [])
  );

  preferredLines.push(
    ...(Array.isArray(job.preferredQualifications)
      ? job.preferredQualifications
      : [])
  );

  const requiredMatches = findCertificates(
    uniqueStrings(requiredLines)
  );

  const preferredMatches = findCertificates(
    uniqueStrings(preferredLines)
  );

  const otherMatches = findCertificates(
    uniqueStrings(otherLines)
  );

  const requiredCertificates =
    requiredMatches.map(x => x.name);

  const preferredCertificates =
    preferredMatches.map(x => x.name);

  const known = new Set(
    [...requiredCertificates, ...preferredCertificates]
      .map(x =>
        x.replace(/\s+/g, '').toLowerCase()
      )
  );

  const mentionedCertificates = otherMatches
    .filter(x =>
      !known.has(
        x.name.replace(/\s+/g, '').toLowerCase()
      )
    )
    .map(x => x.name);

  const positions = Array.isArray(job.positions)
    ? job.positions.map(p => ({
        ...p,
        requiredCertificates,
        preferredCertificates,
        mentionedCertificates
      }))
    : [];

  return {
    ...job,
    requiredCertificates,
    preferredCertificates,
    mentionedCertificates,
    certificateEvidence: {
      required: requiredMatches,
      preferred: preferredMatches,
      other: otherMatches
    },
    certificateExtractionMethod: 'regex_v2',
    certificateReviewNeeded: !job.detailCollected,
    positions
  };
}

// 전체 JSON 재분석
function main() {
  if (!fs.existsSync(FILE)) {
    throw new Error(
      'skJobsDetail.json 파일이 없습니다.'
    );
  }

  const data = JSON.parse(
    fs.readFileSync(FILE, 'utf8')
  );

  if (!Array.isArray(data.jobs)) {
    throw new Error(
      'jobs 배열을 찾지 못했습니다.'
    );
  }

  const jobs = data.jobs.map(analyze);

  const stats = {
    total: jobs.length,
    required: jobs.filter(
      j => j.requiredCertificates.length > 0
    ).length,
    preferred: jobs.filter(
      j => j.preferredCertificates.length > 0
    ).length,
    other: jobs.filter(
      j => j.mentionedCertificates.length > 0
    ).length,
    detailMissing: jobs.filter(
      j => !j.detailCollected
    ).length
  };

  // 원본 백업
  fs.copyFileSync(FILE, BACKUP);

  const tmp = `${FILE}.tmp`;

  fs.writeFileSync(
    tmp,
    JSON.stringify({
      ...data,
      certificateUpdatedAt:
        new Date().toISOString(),
      jobs
    }, null, 2),
    'utf8'
  );

  fs.renameSync(tmp, FILE);

  console.log('==============================');
  console.log('SK 자격증 재분석 완료');
  console.log('전체 공고:', stats.total);
  console.log('필수 자격증 포함 공고:', stats.required);
  console.log('우대 자격증 포함 공고:', stats.preferred);
  console.log('기타 자격증 언급 공고:', stats.other);
  console.log('상세정보 없는 공고:', stats.detailMissing);
  console.log('백업:', BACKUP);
  console.log('저장:', FILE);
  console.log('==============================');
}

main();
