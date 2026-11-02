
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  parseTagValue: false,
  trimValues: true
});

async function main() {
  const key =
    process.env.QNET_LIST_API_KEY ||
    process.env.QNET_SERIES_API_KEY;

  if (!key) {
    throw new Error('종목 목록 API 인증키가 없습니다.');
  }

  const url = new URL(
    'http://openapi.q-net.or.kr/api/service/rest/InquiryListNationalQualifcationSVC/getList'
  );

  url.searchParams.set('ServiceKey', key);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const root = parsed.response;

  if (String(root?.header?.resultCode) !== '00') {
    throw new Error(
      root?.header?.resultMsg || 'Q-Net API 오류'
    );
  }

  const raw = root.body?.items?.item;
  const rows = raw == null
    ? []
    : Array.isArray(raw) ? raw : [raw];

  const unique = new Map();

  for (const item of rows) {
    const seriesCd = String(item.seriescd ?? '').trim();
    const jmCd = String(item.jmcd ?? '').trim();
    const name = String(item.jmfldnm ?? '').trim();

    // 기사 등급만 저장
    if (seriesCd !== '03' || !jmCd || !name) {
      continue;
    }

    unique.set(jmCd, {
      jmCd,
      name,
      seriesCd
    });
  }

  const items = [...unique.values()];

  console.log('API 반환 건수:', rows.length);
  console.log('기사 종목 수:', items.length);
  console.log('검색 예시:',
    items.filter(item => item.name.includes('정보처리'))
  );

  if (items.length === 0) {
    throw new Error(
      '기사 종목이 조회되지 않아 저장하지 않습니다.'
    );
  }

  await fs.writeFile(
    path.join(__dirname, 'technicalQualifications.json'),
    JSON.stringify({ count: items.length, items }, null, 2),
    'utf8'
  );

  console.log('technicalQualifications.json 저장 완료!');
}

main().catch(error => {
  console.error('실행 오류:', error.message);
});
