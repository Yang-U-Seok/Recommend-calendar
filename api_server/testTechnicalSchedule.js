
require('dotenv').config();

const { XMLParser } = require('fast-xml-parser');

async function main() {
  const key = process.env.QNET_TECH_SCHEDULE_API_KEY;

  if (!key) {
    throw new Error(
      '.env에 QNET_TECH_SCHEDULE_API_KEY를 설정하세요.'
    );
  }

  const url = new URL(
    'http://apis.data.go.kr/B490007/qualExamSchd/getQualExamSchdList'
  );

  url.searchParams.set('serviceKey', key);
  url.searchParams.set('implYy', '2026');
  url.searchParams.set('qualgbCd', 'T');
  url.searchParams.set('jmCd', '1320');
  url.searchParams.set('numOfRows', '50');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('dataFormat', 'xml');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`HTTP 오류: ${response.status}`);
  }

  const xml = await response.text();

  const parser = new XMLParser({
    parseTagValue: false
  });

  const data = parser.parse(xml);

  console.log(JSON.stringify(data, null, 2));
}

main().catch(error => {
  console.error('실행 오류:', error.message);
});
