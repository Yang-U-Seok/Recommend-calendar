
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_FILE = path.join(__dirname, 'companyCertificates.json');
const SIZE_FILE = path.join(__dirname, 'companySizes.json');

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

// 직무 분야별 키워드
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

// 프런트엔드 관심 분야와 백엔드 분류 연결
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

// 자격증 추천 API
router.get('/', (req, res) => {
  try {
    // 복수 관심 분야 처리
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
        requestedCategories.map(
          value => FIELD_CATEGORY_MAP[value] || value
        )
      )
    ];

    if (categories.includes('전체') || categories.length === 0) {
      categories = ['전체'];
    }

    if (categories.some(
      value => !Object.hasOwn(CATEGORIES, value)
    )) {
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
      '전체', '대기업', '중견기업',
      '중소기업', '미분류'
    ];

    if (!validSizes.includes(companySize)) {
      return res.status(400).json({
        success: false,
        message: '지원하지 않는 기업 규모입니다.'
      });
    }

    // 자격증 추출 데이터 확인
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(404).json({
        success: false,
        message: 'companyCertificates.json 파일이 없습니다.'
      });
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

    if (!Array.isArray(data.positions)) {
      throw new Error('positions 배열이 없습니다.');
    }

    // 기업 규모 매핑
    const customSizes = fs.existsSync(SIZE_FILE)
      ? JSON.parse(fs.readFileSync(SIZE_FILE, 'utf8'))
      : {};

    const sizes = {
      ...DEFAULT_SIZES,
      ...customSizes
    };

    // 조건에 맞는 직무 필터링
    const filtered = data.positions.filter(position => {
      const size = sizes[position.company] || '미분류';
      const positionName = normalize(position.positionName);

      const matchesSize =
        companySize === '전체' ||
        companySize === size;

      const matchesCompany =
        !company ||
        position.company === company;

      const matchesCategory =
        categories.includes('전체') ||
        categories.some(category =>
          CATEGORIES[category].some(keyword =>
            positionName.includes(normalize(keyword))
          )
        );

      return (
        matchesSize &&
        matchesCompany &&
        matchesCategory
      );
    });

    // 자격증 등장 횟수 계산
    const counts = new Map();

    for (const position of filtered) {
      const required = new Set(
        (position.requiredCertificates || [])
          .map(c => c.name)
      );

      const preferred = new Set(
        (position.preferredCertificates || [])
          .map(c => c.name)
      );

      // 같은 직무에서 같은 자격증 중복 계산 방지
      const names = new Set([
        ...required,
        ...preferred
      ]);

      for (const name of names) {
        if (!counts.has(name)) {
          counts.set(name, {
            name,
            mentionCount: 0,
            requiredCount: 0,
            preferredCount: 0,
            companies: new Set(),
            positions: []
          });
        }

        const item = counts.get(name);

        item.mentionCount++;

        if (required.has(name)) {
          item.requiredCount++;
        }

        if (preferred.has(name)) {
          item.preferredCount++;
        }

        item.companies.add(position.company);

        item.positions.push({
          company: position.company,
          positionName: position.positionName,
          jobNoticeId: position.jobNoticeId,
          required: required.has(name),
          preferred: preferred.has(name)
        });
      }
    }

    // 등장 횟수 기준 정렬
    const recommendations = [...counts.values()]
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
      totalCertificates: recommendations.length,
      recommendations,
      updatedAt: data.updatedAt || null,
      note: '동일 직무의 동일 자격증은 1회만 집계합니다.'
    });

  } catch (error) {
    console.error('자격증 추천 오류:', error);

    res.status(500).json({
      success: false,
      message: '자격증 추천 조회 실패',
      error: error.message
    });
  }
});

module.exports = router;
