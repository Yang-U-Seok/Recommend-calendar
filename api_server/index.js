
const express = require('express');
const cors = require('cors');
const { XMLParser } = require('fast-xml-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const parser = new XMLParser({
  ignoreAttributes: false
});

app.get('/', (req, res) => {
  res.send('Recommender Calendar 서버 실행 성공!');
});

app.get('/api/qnet/pass-rate', async (req, res) => {
  try {
    const apiKey = process.env.QNET_API_KEY;
    const apiUrl = process.env.QNET_API_URL;

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message: 'API 환경변수가 설정되지 않았습니다.'
      });
    }

    const year = String(req.query.year || '2020');
    const grade = String(req.query.grade || '30');
    const keyword = String(req.query.keyword || '').trim();

    const validGrades = ['10', '20', '30', '31', '32', '33', '40'];

    if (!/^\d{4}$/.test(year) || !validGrades.includes(grade)) {
      return res.status(400).json({
        success: false,
        message: '연도 또는 등급이 올바르지 않습니다.'
      });
    }

    const allItems = [];
    const pageSize = 100;
    let totalCount = 0;

    for (let page = 1; page <= 100; page++) {
      const url = new URL(apiUrl);

      url.searchParams.set('serviceKey', apiKey);
      url.searchParams.set('grdCd', grade);
      url.searchParams.set('baseYY', year);
      url.searchParams.set('pageNo', String(page));
      url.searchParams.set('numOfRows', String(pageSize));

      
let response;

for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`Q-Net HTTP ${response.status}`);
    }

    break;
  } catch (error) {
    console.error(
      `Q-Net ${page}페이지 요청 실패 (${attempt}/5):`,
      error.message
    );

    if (attempt === 5) {
      throw error;
    }

    await new Promise(resolve =>
      setTimeout(resolve, attempt * 1500)
    );
  }
}


      if (!response.ok) {
        throw new Error(`Q-Net HTTP ${response.status}`);
      }

      const xml = await response.text();
      const parsed = parser.parse(xml);
      const result = parsed.response;

      if (!result) {
        throw new Error('Q-Net 응답 형식이 올바르지 않습니다.');
      }

      if (Number(result.header?.resultCode) !== 0) {
        throw new Error(
          result.header?.resultMsg || 'Q-Net 서비스 오류'
        );
      }

      const body = result.body || {};
      totalCount = Number(body.totalCount || 0);

      const rawItems = body.items?.item;
      const items = rawItems
        ? Array.isArray(rawItems) ? rawItems : [rawItems]
        : [];

      allItems.push(...items);
      await new Promise(resolve => setTimeout(resolve, 300));

      if (items.length === 0 || allItems.length >= totalCount) {
        break;
      }
    }
if (allItems.length < totalCount) {
  throw new Error(
    `전체 데이터 조회 미완료: ${allItems.length}/${totalCount}`
  );
}
    const filtered = allItems
      .filter(item =>
        String(item.jmFldNm || '').includes(keyword)
      )
      .map(item => ({
        name: item.jmFldNm,
        grade: item.grdNm,
        examType: item.examTypCcd,
        year: item.implYy,
        round: item.implSeq,
        passRate: item.passRate,
        applicants: item.recptNoCnt,
        passed: item.examPassCnt
      }))
      .sort((a, b) =>
        parseFloat(a.passRate) - parseFloat(b.passRate)
      );

    
    // 자격증명 + 시험유형 + 연도별로 통합
    const grouped = {};

    for (const item of filtered) {
      const key = `${item.name}_${item.examType}_${item.year}`;

      if (!grouped[key]) {
        grouped[key] = {
          name: item.name,
          grade: item.grade,
          examType: item.examType,
          year: item.year,
          rounds: 0,
          applicants: 0,
          passed: 0
        };
      }

      grouped[key].rounds += 1;
      grouped[key].applicants += Number(item.applicants) || 0;
      grouped[key].passed += Number(item.passed) || 0;
    }

    // 통합 합격률 계산
    const integrated = Object.values(grouped).map(item => ({
      ...item,
      round: `${item.rounds}개 회차 통합`,
      passRate: item.applicants > 0
        ? `${((item.passed / item.applicants) * 100).toFixed(2)}%`
        : 'N/A'
    }));

    // 합격률이 낮은 순서로 정렬
    integrated.sort((a, b) =>
      parseFloat(a.passRate) - parseFloat(b.passRate)
    );

    res.json({
      success: true,
      totalCount,
      count: integrated.length,
      items: integrated
    });


  } catch (error) {
  console.error('Q-Net API 오류:', error);
  console.error('상세 원인:', error.cause);

    res.status(502).json({
      success: false,
      message: 'Q-Net 데이터 조회 실패',
      error: error.message
    });
  }
});

app.get('/api/qnet/acquisition-term', async (req, res) => {
  try {
    const apiKey = process.env.QNET_API_KEY;
    const apiUrl = process.env.QNET_TERM_API_URL;

    const year = String(req.query.year || '2023');
    const grade = String(req.query.grade || '30');
    const keyword = String(req.query.keyword || '').trim();

    if (!apiKey || !apiUrl) {
      return res.status(500).json({
        success: false,
        message: 'API 환경변수가 설정되지 않았습니다.'
      });
    }

    if (!/^\d{4}$/.test(year) ||
        !['10', '20', '30', '31', '40'].includes(grade)) {
      return res.status(400).json({
        success: false,
        message: '연도 또는 등급이 올바르지 않습니다.'
      });
    }

    const allItems = [];
    const pageSize = 100;
    let totalCount = 0;

    for (let page = 1; page <= 100; page++) {
      const url = new URL(apiUrl);

      url.searchParams.set('serviceKey', apiKey);
      url.searchParams.set('baseYY', year);
      url.searchParams.set('grdCd', grade);
      url.searchParams.set('pageNo', String(page));
      url.searchParams.set('numOfRows', String(pageSize));

      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`Q-Net HTTP ${response.status}`);
      }

      const xml = await response.text();
      const parsed = parser.parse(xml);

      if (String(parsed.response?.header?.resultCode) !== '0' &&
          String(parsed.response?.header?.resultCode) !== '00') {
        throw new Error(
          parsed.response?.header?.resultMsg || 'Q-Net API 오류'
        );
      }

      const body = parsed.response?.body || {};
      totalCount = Number(body.totalCount || 0);

      const rawItems = body.items?.item;
      const pageItems = rawItems
        ? (Array.isArray(rawItems) ? rawItems : [rawItems])
        : [];

      allItems.push(...pageItems);

      if (pageItems.length === 0 || allItems.length >= totalCount) {
        break;
      }
    }

    if (allItems.length < totalCount) {
      throw new Error(
        `전체 데이터 조회 미완료: ${allItems.length}/${totalCount}`
      );
    }

    const items = allItems
      .filter(item =>
        String(item.jmNm || '').includes(keyword)
      )
      .map(item => ({
        name: item.jmNm,
        grade: item.grdNm,
        year: item.statisYy,
        averageDays: item.accumAcquAvgTermDays,
        year1Days: item.yy1AcquAvgTermDays,
        year2Days: item.yy2AcquAvgTermDays,
        year3Days: item.yy3AcquAvgTermDays
      }));

    res.json({
      success: true,
      totalCount,
      count: items.length,
      items
    });

  } catch (error) {
    console.error('취득소요기간 API 오류:', error.message);

    res.status(502).json({
      success: false,
      message: '취득소요기간 조회 실패',
      error: error.message
    });
  }
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`서버 실행 성공: http://localhost:${PORT}`);
});
