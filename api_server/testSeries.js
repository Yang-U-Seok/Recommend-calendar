
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false
});

async function main() {
  const key = process.env.QNET_SERIES_API_KEY;

  if (!key) {
    throw new Error('QNET_SERIES_API_KEY가 없습니다.');
  }

  const url = new URL(
    'http://openapi.q-net.or.kr/api/service/rest/InquirySeriesSVC/getRule'
  );

  url.searchParams.set('serviceKey', key);
  url.searchParams.set('numOfRows', '3000');
  url.searchParams.set('pageNo', '1');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`HTTP 오류: ${response.status}`);
  }

  const xml = await response.text();
  const data = parser.parse(xml);

  const resultCode = String(
    data.response?.header?.resultCode ?? ''
  );

  if (resultCode !== '00') {
    throw new Error(
      data.response?.header?.resultMsg || 'Q-Net API 오류'
    );
  }

  const body = data.response?.body ?? {};
  const raw = body.items?.item;

  const rows = raw == null
    ? []
    : Array.isArray(raw) ? raw : [raw];

  const unique = new Map();

  for (const item of rows) {
    const code = String(item.seriesCd ?? '').trim();
    const name = String(item.seriesNm ?? '').trim();

    if (code && name) {
      unique.set(code, name);
    }
  }

  console.log('반환 데이터:', rows.length);
  console.log('고유 계열:', unique.size);

  for (const [code, name] of unique) {
    console.log(`${code} - ${name}`);
  }

  // 기사 및 국가전문자격 중심으로 필터링
  const excluded = new Set([
    '01', // 기술사
    '02', // 기능장
    '04', // 기능사
    '11', // 직원공채
    '14', // 노동부 승진시험
    '98'  // 안전보건공단
  ]);

  const items = [...unique.entries()]
    .filter(([code]) => !excluded.has(code))
    .map(([code, name]) => ({
      seriesCd: code,
      name
    }));

  if (items.length < 10) {
    throw new Error(
      '계열 데이터가 부족하여 기존 JSON을 유지합니다.'
    );
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'InquirySeriesSVC/getRule',
    count: items.length,
    items
  };

  await fs.writeFile(
    path.join(__dirname, 'qualifications.json'),
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log('==========================');
  console.log('qualifications.json 저장 완료!');
  console.log('저장된 계열:', items.length);
  console.log('==========================');
}

main().catch(error => {
  console.error('실행 오류:', error.message);
});
