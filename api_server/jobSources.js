// ==========================================
// 사기업 채용공고 자동 수집
// Greenhouse Job Board API
// ==========================================

// 실제 기업의 공개 채용 게시판 토큰 등록
const SOURCES = [
  { company: 'Stripe', board: 'stripe' },
  { company: 'Cloudflare', board: 'cloudflare' }
];

let cache = [];
let lastUpdated = null;

async function refreshJobs() {
  const results = [];
  let successCount = 0;

  for (const source of SOURCES) {
    try {
      const url =
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.board)}/jobs`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      successCount++;

      for (const job of data.jobs || []) {
        results.push({
          id: `greenhouse-${source.board}-${job.id}`,
          company: source.company,
          title: job.title || '',
          location: job.location?.name || '미정',
          updatedAt: job.updated_at || null,
          deadline: null,
          url: job.absolute_url || '',
          source: 'Greenhouse'
        });
      }

      console.log(
        `${source.company}: ${data.jobs?.length || 0}개 수집`
      );

    } catch (error) {
      console.error(
        `${source.company} 채용공고 수집 실패:`,
        error.message
      );
    }
  }

  // 모든 요청이 실패했다면 기존 캐시 유지
  if (successCount > 0) {
    cache = [...new Map(
      results.map(job => [job.id, job])
    ).values()];

    lastUpdated = new Date().toISOString();

    console.log(
      `사기업 채용공고 업데이트 완료: ${cache.length}개`
    );
  }

  return cache;
}

function getJobs() {
  return {
    jobs: cache,
    lastUpdated
  };
}

module.exports = {
  refreshJobs,
  getJobs
};
