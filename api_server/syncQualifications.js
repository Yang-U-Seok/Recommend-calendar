
require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

// XML 파서
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true
});

// Q-Net 계열정보 API
const API_URL =
  process.env.QNET_SERIES_RULE_API_URL ||
  'http://openapi.q-net.or.kr/api/service/rest/InquirySeriesSVC/getRule';

// 저장 파일 경로
const OUTPUT_FILE = path.join(
  __dirname,
  'qualifications.json'
);

// 페이지 설정
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

// 대기 함수
const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// 배열 변환
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// 문자열 변환
function toString(value) {
  return value == null ? '' : String(value).trim();
}

// API 인증키 정리
function normalizeKey(key) {
  try {
    return decodeURIComponent(toString(key));
  } catch {
    return toString(key);
  }
}

// Q-Net API 페이지 요청
async function fetchPage(pageNo, apiKey) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const url = new URL(API_URL);

      url.searchParams.set(
        'serviceKey',
        normalizeKey(apiKey)
      );

      url.searchParams.set(
        'numOfRows',
        String(PAGE_SIZE)
      );

      url.searchParams.set(
        'pageNo',
        String(pageNo)
      );

      const response = await fetch(url, {
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      const parsed = parser.parse(xml);

      const root = parsed.response;

      if (!root) {
        throw new Error('Q-Net XML 응답 형식 오류');
      }

      const resultCode = toString(
        root.header?.resultCode
      );

      if (resultCode !== '00') {
        throw new Error(
          `Q-Net 오류 ${resultCode}: ` +
          toString(root.header?.resultMsg)
        );
      }

      return root.body || {};
    } catch (error) {
      const retryable =
        /오류 99|HTTP 429|HTTP 50[0234]|fetch failed|timeout|abort/i
          .test(error.message);

      if (!retryable || attempt === 4) {
        throw new Error(
          `${pageNo}페이지 조회 실패: ${error.message}`
        );
      }

      console.warn(
        `${pageNo}페이지 재시도 ${attempt}/3: ${error.message}`
      );

      await wait(2000 * attempt);
    }
  }
}

// 페이지 데이터 지문 생성
// 데이터 순서가 달라도 동일한 목록이면 같은 값이 나옴
function makeSignature(rows) {
  const normalized = rows
    .map((item) =>
      JSON.stringify([
        toString(item.seriesCd),
        toString(item.seriesNm),
        toString(item.gunNm),
        toString(item.mjrKmNm)
      ])
    )
    .sort();

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

// 메인 실행 함수
async function main() {
  const apiKey = process.env.QNET_SERIES_API_KEY;

  if (!apiKey) {
    throw new Error(
      '.env에 QNET_SERIES_API_KEY가 없습니다.'
    );
  }

  console.log('================================');
  console.log('Q-Net 국가자격 계열정보 수집 시작');
  console.log('================================');

  const entries = new Map();

  let totalCount = null;
  let completed = false;
  let repeatedPage = false;
  let previousSignature = null;
  let processedRows = 0;

  // 페이지 반복
  for (let page = 1; page <= MAX_PAGES; page++) {

    // 1. API 요청
    const body = await fetchPage(page, apiKey);

    // 2. rows 선언 (반드시 먼저!)
    const rows = toArray(body.items?.item);

    // 3. 전체 데이터 개수 확인
    const rawTotal = body.totalCount;

    if (
      rawTotal !== undefined &&
      rawTotal !== null &&
      rawTotal !== ''
    ) {
      const parsedTotal = Number(rawTotal);

      if (
        Number.isFinite(parsedTotal) &&
        parsedTotal >= 0
      ) {
        totalCount = parsedTotal;
      }
    }

    console.log('');
    console.log(`페이지 번호: ${page}`);
    console.log(`반환 데이터 개수: ${rows.length}`);
    console.log(
      `전체 데이터 수: ${totalCount ?? '미확인'}`
    );

    if (rows.length > 0) {
      console.log(
        '첫 번째 데이터:',
        JSON.stringify(rows[0], null, 2)
      );
    }

    // 4. 데이터가 없으면 종료
    if (rows.length === 0) {
      console.log('더 이상 데이터가 없습니다.');
      completed = true;
      break;
    }

    // 5. 중복 페이지 감지
    const currentSignature = makeSignature(rows);

    if (
      previousSignature !== null &&
      previousSignature === currentSignature
    ) {
      console.warn('');
      console.warn('중복 페이지 감지!');
      console.warn(
        `${page}페이지가 이전 페이지와 동일합니다.`
      );
      console.warn(
        'Q-Net API가 페이지 번호를 무시하거나 ' +
        '동일한 데이터를 반환하고 있습니다.'
      );

      repeatedPage = true;
      break;
    }

    previousSignature = currentSignature;

    // 6. 계열별 데이터 저장
    for (const item of rows) {
      const seriesCd = toString(item.seriesCd);
      const seriesNm = toString(item.seriesNm);
      const subject = toString(item.mjrKmNm);

      if (!seriesCd || !seriesNm) {
        continue;
      }

      if (!entries.has(seriesCd)) {
        entries.set(seriesCd, {
          seriesCd,
          name: seriesNm,
          subjects: new Set()
        });
      }

      if (subject) {
        entries.get(seriesCd).subjects.add(subject);
      }
    }

    processedRows += rows.length;

    console.log(
      `페이지 ${page} 완료 / ` +
      `이번 페이지 ${rows.length}건 / ` +
      `누적 ${processedRows}건 / ` +
      `고유 계열 ${entries.size}개`
    );

    // 7. 전체 데이터 조회 완료 여부 확인
    if (
      totalCount !== null &&
      processedRows >= totalCount
    ) {
      completed = true;
      break;
    }

    // 페이지당 반환 데이터가 요청 수보다 적으면 종료
    if (rows.length < PAGE_SIZE) {
      completed = true;
      break;
    }

    // API 서버 부하 방지
    await wait(1200);
  }

  // 결과 출력
  console.log('');
  console.log('================================');
  console.log('수집 결과');
  console.log('================================');

  console.log(`누적 데이터: ${processedRows}건`);
  console.log(`고유 계열: ${entries.size}개`);

  for (const item of entries.values()) {
    console.log(
      `${item.seriesCd} - ${item.name}`
    );
  }

  // 동일한 페이지 반복 시 저장 금지
  if (repeatedPage) {
    throw new Error(
      '동일한 데이터가 반복 반환되어 수집을 중단했습니다. ' +
      '전체 국가전문자격 목록이 확인되지 않아 저장하지 않습니다.'
    );
  }

  // 정상 종료 여부 확인
  if (!completed) {
    throw new Error(
      '최대 페이지에 도달했습니다. ' +
      '전체 수집 여부가 확인되지 않아 저장하지 않습니다.'
    );
  }

  if (entries.size === 0) {
    throw new Error(
      '수집된 계열정보가 없습니다.'
    );
  }

  // JSON 변환
  const items = [...entries.values()]
    .map((item) => ({
      seriesCd: item.seriesCd,
      name: item.name,
      subjects: [...item.subjects]
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'ko')
    );

  const result = {
    updatedAt: new Date().toISOString(),
    source: 'InquirySeriesSVC/getRule',
    count: items.length,
    items
  };

  // 임시 파일에 저장 후 이름 변경
  const tempFile = OUTPUT_FILE + '.tmp';

  await fs.writeFile(
    tempFile,
    JSON.stringify(result, null, 2),
    'utf8'
  );

  await fs.rename(
    tempFile,
    OUTPUT_FILE
  );

  console.log('');
  console.log(
    `저장 완료! ${items.length}개 계열`
  );

  console.log(
    `파일 위치: ${OUTPUT_FILE}`
  );
}

// 실행 및 오류 처리
main().catch((error) => {
  console.error('');
  console.error('수집 중단:', error.stack);
  console.error(
    '기존 qualifications.json은 유지됩니다.'
  );

  process.exitCode = 1;
});
