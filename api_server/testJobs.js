
const SOURCES = [
  {
    company: 'Stripe',
    type: 'greenhouse',
    board: 'stripe'
  }
];

// 나중에 확인된 국내 기업을 SOURCES에 추가

async function testJobs() {
  for (const source of SOURCES) {
    let url = '';

    if (source.type === 'greenhouse') {
      url = `https://boards-api.greenhouse.io/v1/boards/${source.board}/jobs`;
    }

    if (source.type === 'lever') {
      url = `https://api.lever.co/v0/postings/${source.board}?mode=json`;
    }

    if (source.type === 'ashby') {
      url = `https://api.ashbyhq.com/posting-api/job-board/${source.board}`;
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const jobs = Array.isArray(data)
        ? data
        : data.jobs || [];

      console.log(`${source.company}: ${jobs.length}개`);
    } catch (error) {
      console.error(`${source.company} 오류:`, error.message);
    }
  }
}

testJobs();
