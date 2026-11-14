
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_FILE = path.join(
  __dirname,
  'companyCertificates.json'
);

const SIZE_FILE = path.join(
  __dirname,
  'companySizes.json'
);

const SK_FILE = path.join(
  __dirname,
  'skJobsDetail.json'
);

const DEFAULT_SIZES = {
  '삼성전자 DX부문': '대기업',
  '삼성E&A': '대기업',
  '삼성물산 건설부문': '대기업',
  'LG CNS': '대기업',
  'LG유플러스': '대기업',
  'LG전자': '대기업',
  'LG화학': '대기업',
  'LG에너지솔루션': '대기업',
  'LG이노텍': '대기업'
};

const CATEGORIES = {
  전체: [],
  IT: [
    '소프트웨어', 'SW', '개발', '프로그래밍',
    '데이터', '클라우드', '인공지능', 'AI',
    '시스템', '플랫폼'
  ],
  보안: [
    '보안', '정보보호', '사이버',
    '침해대응', '취약점', 'Security'
  ],
  전기: [
    '전기', '전력', '변전', '배전',
    '전기설비', '전력설비'
  ],
  전자통신: [
    '전자', '통신', '네트워크',
    '무선', '회로', 'RF', '5G', '6G'
  ],
  기계: [
    '기계', '설비', '공조', '냉동',
    '장비', '기구'
  ],
  안전: [
    '안전', '보건', 'EHS',
    '위험', '산업안전'
  ],
  건설: [
    '건설', '건축', '토목',
    '시공', '플랜트'
  ],
  환경: [
    '환경', '수질', '폐수',
    '대기', '수처리'
  ],
  품질: [
    '품질', '검사', 'QMS',
    '품질관리', '품질보증'
  ]
};

const FIELD_CATEGORY_MAP = {
  '전체 분야': '전체',
  'IT·소프트웨어': 'IT',
  '네트워크·통신·클라우드': '전자통신',
  '정보보안': '보안',
  '전기·전력': '전기',
  '전자·통신': '전자통신',
  '기계·설비': '기계',
  '안전·보건': '안전',
  '건설·건축': '건설',
  '환경·수질': '환경',
  '품질관리': '품질'
};

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) {
    return fallback;
  }

  return JSON.parse(
    fs.readFileSync(file, 'utf8')
  );
}

// 문자열 또는 {name: ...} 객체 지원
function normalizeCertificates(values) {
  if (!Array.isArray(values)) return [];

  const result = new Map();

  for (const value of values) {
    const name = typeof value === 'string'
      ? value
      : value?.name;

    const text = String(name || '').trim();
    const key = normalize(text);

    if (key && !result.has(key)) {
      result.set(key, { name: text });
    }
  }

  return [...result.values()];
}

// 기업명으로 대기업 분류
function getCompanySize(company, sizes, group) {
  if (sizes[company]) return sizes[company];

  const name = normalize(company);

  const largeGroups = [
    '삼성', '현대', 'LG', 'SK'
  ];

  if (
    largeGroups.includes(group) ||
    largeGroups.some(prefix =>
      name.startsWith(normalize(prefix))
    )
  ) {
    return '대기업';
  }

  return '미분류';
}

// 기존 기업 자격증 데이터 읽기
function loadExistingPositions() {
  const data = readJson(DATA_FILE);

  if (!data) {
    console.warn(
      'companyCertificates.json 파일이 없습니다.'
    );

    return {
      positions: [],
      updatedAt: null
    };
  }

  if (!Array.isArray(data.positions)) {
    throw new Error(
      'companyCertificates.json에 positions 배열이 없습니다.'
    );
  }

  const positions = data.positions.map(position => ({
    ...position,
    company: String(position.company || ''),
    positionName: String(
      position.positionName ||
      position.title ||
      ''
    ),
    jobNoticeId: String(
      position.jobNoticeId ||
      position.noticeID ||
      position.id ||
      ''
    ),
    requiredCertificates: normalizeCertificates(
      position.requiredCertificates
    ),
    preferredCertificates: normalizeCertificates(
      position.preferredCertificates
    ),
    group: position.group || '',
    source: 'companyCertificates.json'
  }));

  return {
    positions,
    updatedAt: data.updatedAt || null
  };
}

// SK 자격증 데이터 읽기
function loadSkPositions() {
  const data = readJson(SK_FILE);

  if (!data) {
    console.warn(
      'skJobsDetail.json 파일이 없습니다.'
    );
    return [];
  }

  if (!Array.isArray(data.jobs)) {
    throw new Error(
      'skJobsDetail.json에 jobs 배열이 없습니다.'
    );
  }

  const positions = [];

  for (const job of data.jobs) {
    const requiredCertificates =
      normalizeCertificates(
        job.requiredCertificates
      );

    const preferredCertificates =
      normalizeCertificates(
        job.preferredCertificates
      );

    // 상세정보가 없는 공고도 직무 수에는 포함
    // 단, 확인되지 않은 자격증은 추천에 사용하지 않음
    positions.push({
      company: String(job.company || 'SK'),
      positionName: String(
        job.title || job.jobRole || ''
      ),
      jobNoticeId: String(
        job.noticeID || job.id || ''
      ),
      requiredCertificates,
      preferredCertificates,
      mentionedCertificates:
        job.mentionedCertificates || [],
      group: 'SK',
      source: 'skJobsDetail.json',
      url: job.url || null,
      detailCollected:
        job.detailCollected === true
    });
  }

  return positions;
}

// 기업 데이터 통합
function loadAllPositions() {
  const existing = loadExistingPositions();
  const skPositions = loadSkPositions();

  const merged = new Map();

  for (const position of existing.positions) {
    const key = [
      normalize(position.company),
      normalize(position.jobNoticeId ||
        position.positionName)
    ].join('|');

    merged.set(key, position);
  }

  // SK 최신 분석 데이터 우선
  for (const position of skPositions) {
    const key = [
      normalize(position.company),
      normalize(position.jobNoticeId ||
        position.positionName)
    ].join('|');

    merged.set(key, position);
  }

  return {
    positions: [...merged.values()],
    updatedAt: existing.updatedAt
  };
}

// 추천 API
router.get('/', (req, res) => {
  try {
    const requestedCategories = String(
      req.query.categories ||
      req.query.category ||
      '전체'
    )
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    let categories = [
      ...new Set(
        requestedCategories.map(value =>
          FIELD_CATEGORY_MAP[value] || value
        )
      )
    ];

    if (
      categories.includes('전체') ||
      categories.length === 0
    ) {
      categories = ['전체'];
    }

    if (
      categories.some(category =>
        !Object.hasOwn(CATEGORIES, category)
      )
    ) {
      return res.status(400).json({
        success: false,
        message: '지원하지 않는 직무 분야입니다.'
      });
    }

    const companySize = String(
      req.query.companySize || '전체'
    );

    const company = String(
      req.query.company || ''
    ).trim();

    const validSizes = [
      '전체',
      '대기업',
      '중견기업',
      '중소기업',
      '미분류'
    ];

    if (!validSizes.includes(companySize)) {
      return res.status(400).json({
        success: false,
        message: '지원하지 않는 기업 규모입니다.'
      });
    }

    const customSizes = readJson(SIZE_FILE, {});
    const sizes = {
      ...DEFAULT_SIZES,
      ...customSizes
    };

    const data = loadAllPositions();

    const filtered = data.positions.filter(position => {
      const size = getCompanySize(
        position.company,
        sizes,
        position.group
      );

      const positionName = normalize([
        position.positionName,
        position.title
      ].filter(Boolean).join(' '));

      const matchesSize =
        companySize === '전체' ||
        companySize === size;

      const matchesCompany =
        !company ||
        normalize(position.company)
          .includes(normalize(company));

      const matchesCategory =
        categories.includes('전체') ||
        categories.some(category =>
          CATEGORIES[category].some(keyword =>
            positionName.includes(
              normalize(keyword)
            )
          )
        );

      return (
        matchesSize &&
        matchesCompany &&
        matchesCategory
      );
    });

    // 자격증 등장 횟수 집계
    const counts = new Map();

    for (const position of filtered) {
      const required = new Map(
        position.requiredCertificates.map(cert => [
          normalize(cert.name),
          cert.name
        ])
      );

      const preferred = new Map(
        position.preferredCertificates.map(cert => [
          normalize(cert.name),
          cert.name
        ])
      );

      const names = new Set([
        ...required.keys(),
        ...preferred.keys()
      ]);

      for (const key of names) {
        const name =
          required.get(key) ||
          preferred.get(key);

        if (!counts.has(key)) {
          counts.set(key, {
            name,
            mentionCount: 0,
            requiredCount: 0,
            preferredCount: 0,
            companies: new Set(),
            positions: []
          });
        }

        const item = counts.get(key);

        item.mentionCount++;

        if (required.has(key)) {
          item.requiredCount++;
        }

        if (preferred.has(key)) {
          item.preferredCount++;
        }

        item.companies.add(
          position.company
        );

        item.positions.push({
          company: position.company,
          positionName: position.positionName,
          jobNoticeId: position.jobNoticeId,
          required: required.has(key),
          preferred: preferred.has(key),
          source: position.source,
          url: position.url || null
        });
      }
    }

    const recommendations = [
      ...counts.values()
    ]
      .map(item => ({
        ...item,
        companyCount: item.companies.size,
        companies: [...item.companies]
      }))
      .sort((a, b) =>
        b.mentionCount - a.mentionCount ||
        b.companyCount - a.companyCount ||
        a.name.localeCompare(b.name, 'ko')
      )
      .map((item, index) => ({
        rank: index + 1,
        ...item
      }));

    // 기업별 분석 직무 수
    const sourceCounts = {};

    for (const position of filtered) {
      sourceCounts[position.source] =
        (sourceCounts[position.source] || 0) + 1;
    }

    res.json({
      success: true,
      method: 'mention-count',
      categories,
      category: categories.length === 1
        ? categories[0]
        : '복수 분야',
      companySize,
      company,
      totalPositions: filtered.length,
      totalCertificates:
        recommendations.length,
      sourceCounts,
      recommendations,
      updatedAt: data.updatedAt,
      note:
        '채용공고에 언급된 필수·우대 자격증의 등장 횟수를 집계합니다. 통계적 합격 가능성이나 채용 필수 조건을 보장하지 않습니다.'
    });

  } catch (error) {
    console.error(
      '자격증 추천 오류:',
      error
    );

    res.status(500).json({
      success: false,
      message: '자격증 추천 조회 실패',
      error: error.message
    });
  }
});

module.exports = router;
