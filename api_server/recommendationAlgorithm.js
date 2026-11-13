
/**
 * recommendationAlgorithm.js
 * 채용공고에 자격증명이 등장한 '직무 수'로 추천 순위 계산
 *
 * 실행:
 *   node recommendationAlgorithm.js
 *   node recommendationAlgorithm.js 전체 대기업
 *   node recommendationAlgorithm.js 보안 전체
 *   node recommendationAlgorithm.js 전체 중견기업
 *
 * 기업 규모는 companySizes.json에서 지정 가능:
 * { "비즈테크아이": "중견기업", "회사명": "대기업" }
 * 미분류 기업은 규모 필터에서 제외하되 전체 검색에는 포함.
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'companyCertificates.json');
const OUTPUT = path.join(__dirname, 'recommendations.json');
const SIZE_FILE = path.join(__dirname, 'companySizes.json');

// 서비스 운영용 기본 기업 규모 분류.
// 공식 법적 기업 규모 판정과는 다를 수 있음.
const DEFAULT_SIZES = {
  '삼성전자 DX부문': '대기업',
  '삼성E&A': '대기업',
  '삼성물산 건설부문': '대기업',
  '삼성바이오에피스': '대기업',
  '삼성증권': '대기업',
  'LG전자': '대기업',
  'LG CNS': '대기업',
  'LG유플러스': '대기업',
  'LG화학': '대기업',
  'LG에너지솔루션': '대기업',
  'LG이노텍': '대기업',
  'LG생활건강': '대기업'
};

const CATEGORY_KEYWORDS = {
  보안: ['보안', '정보보호', '사이버', '침해대응', '취약점'],
  IT: [
    '소프트웨어', '정보시스템', '정보기술',
    '데이터', '클라우드', '프로그래밍',
    '플랫폼', '인공지능', 'AI'
  ],
  전기: ['전기', '전력', '변전', '배전'],
  전자통신: [
    '전자', '통신', '네트워크', '무선', '회로', 'RF'
  ],
  기계: ['기계', '설비', '공조', '냉동', '장비'],
  안전: ['안전', '보건', 'EHS', '위험'],
  건설: ['건설', '건축', '토목', '시공', '플랜트'],
  환경: ['환경', '수질', '폐수', '대기', '수처리'],
  품질: ['품질', '검사', 'QMS']
};

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function getCompanySizes() {
  if (!fs.existsSync(SIZE_FILE)) {
    return DEFAULT_SIZES;
  }

  const custom = loadJSON(SIZE_FILE);

  if (
    !custom ||
    typeof custom !== 'object' ||
    Array.isArray(custom)
  ) {
    throw new Error(
      'companySizes.json은 {"기업명":"대기업"} 형태여야 합니다.'
    );
  }

  return {
    ...DEFAULT_SIZES,
    ...custom
  };
}

function relevantPosition(position, category) {
  if (category === '전체') {
    return true;
  }

  const keywords = CATEGORY_KEYWORDS[category];

  if (!keywords) {
    throw new Error(
      `지원하지 않는 직무 분야: ${category}`
    );
  }

  // 공고 제목이 아닌 직무명 기준으로 검색
  const name = normalized(position.positionName);

  return keywords.some(keyword =>
    name.includes(normalized(keyword))
  );
}

function getRecommendations(data, category, companySize) {
  const sizes = getCompanySizes();
  const allPositions = data.positions;

  const filtered = allPositions.filter(position => {
    const size = sizes[position.company] || '미분류';

    return (
      (companySize === '전체' || size === companySize) &&
      relevantPosition(position, category)
    );
  });

  const map = new Map();

  for (const p of filtered) {
    const required = new Set(
      (p.requiredCertificates || []).map(c => c.name)
    );

    const preferred = new Set(
      (p.preferredCertificates || []).map(c => c.name)
    );

    // 같은 직무에서 같은 자격증은 한 번만 계산
    const names = new Set([
      ...required,
      ...preferred
    ]);

    for (const name of names) {
      if (!map.has(name)) {
        map.set(name, {
          name,
          mentionCount: 0,
          requiredCount: 0,
          preferredCount: 0,
          companies: new Set(),
          positions: []
        });
      }

      const entry = map.get(name);

      entry.mentionCount += 1;

      if (required.has(name)) {
        entry.requiredCount += 1;
      }

      if (preferred.has(name)) {
        entry.preferredCount += 1;
      }

      entry.companies.add(p.company);

      entry.positions.push({
        company: p.company,
        companySize: sizes[p.company] || '미분류',
        positionName: p.positionName,
        jobNoticeId: p.jobNoticeId,
        type:
          required.has(name) && preferred.has(name)
            ? '필수자격란 및 우대사항'
            : required.has(name)
              ? '필수자격란'
              : '우대사항',
        evidence: [
          ...(p.requiredCertificates || []),
          ...(p.preferredCertificates || [])
        ]
          .filter(c => c.name === name)
          .map(c => c.evidence)
          .filter(Boolean)
      });
    }
  }

  const recommendations = [...map.values()]
    .map(entry => ({
      ...entry,
      companyCount: entry.companies.size,
      companies: [...entry.companies]
    }))
    .sort((a, b) =>
      b.mentionCount - a.mentionCount ||
      b.companyCount - a.companyCount ||
      a.name.localeCompare(b.name, 'ko')
    )
    .map((entry, index) => ({
      rank: index + 1,
      ...entry
    }));

  return {
    category,
    companySize,
    totalPositionsConsidered: filtered.length,
    recommendations,
    unknownCompanySizes: [
      ...new Set(allPositions.map(p => p.company))
    ]
      .filter(name => !sizes[name])
      .sort(),
    note:
      '등장 횟수는 자격증명이 명시된 직무 수입니다. ' +
      '동일 직무 중복 언급은 1건으로 계산합니다. ' +
      '필수자격란 표기는 해당 자격증이 단독 필수라는 뜻은 아닙니다.'
  };
}

function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error(
      'companyCertificates.json 파일이 없습니다.'
    );
  }

  const data = loadJSON(INPUT);

  if (!Array.isArray(data.positions)) {
    throw new Error(
      'positions 배열이 없습니다.'
    );
  }

  const category = process.argv[2] || '전체';
  const companySize = process.argv[3] || '전체';

  if (
    !['전체', '대기업', '중견기업'].includes(companySize)
  ) {
    throw new Error(
      '기업 규모는 전체, 대기업, 중견기업 중 하나여야 합니다.'
    );
  }

  const result = getRecommendations(
    data,
    category,
    companySize
  );

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        method: 'mention-count',
        ...result
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    `\n=== 자격증 등장 횟수 순위 (${category} / ${companySize}) ===`
  );

  console.log(
    `검색 대상 직무: ${result.totalPositionsConsidered}개`
  );

  for (const c of result.recommendations.slice(0, 20)) {
    console.log(
      `${c.rank}. ${c.name}: ${c.mentionCount}개 직무 ` +
      `(필수자격란 ${c.requiredCount}, 우대 ${c.preferredCount})`
    );

    console.log(
      `   기업: ${c.companies.join(', ')}`
    );
  }

  if (!result.recommendations.length) {
    console.log('명시된 자격증이 없습니다.');
  }

  if (
    companySize !== '전체' &&
    result.unknownCompanySizes.length
  ) {
    console.log(
      `\n[참고] 규모 미분류 기업 ` +
      `${result.unknownCompanySizes.length}곳은 필터 결과에서 제외됨.`
    );

    console.log(
      'companySizes.json에 기업명과 규모를 추가하면 포함할 수 있습니다.'
    );
  }

  console.log(`\n저장: ${OUTPUT}`);
}

try {
  main();
} catch (error) {
  console.error('오류:', error.message);
  process.exitCode = 1;
}
