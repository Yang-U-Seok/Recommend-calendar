
const cheerio = require('cheerio');

// 실제 채용사이트 대신 테스트용 HTML
const html = `
  <div class="job">
    <h2 class="title">소프트웨어 개발자 채용</h2>
    <span class="company">테스트기업 A</span>
    <span class="deadline">2026-11-30</span>
    <a href="https://example.com/job/1">지원하기</a>
  </div>

  <div class="job">
    <h2 class="title">AI 엔지니어 채용</h2>
    <span class="company">테스트기업 B</span>
    <span class="deadline">2026-12-10</span>
    <a href="https://example.com/job/2">지원하기</a>
  </div>
`;

const $ = cheerio.load(html);

const jobs = [];

$('.job').each((index, element) => {
  const job = $(element);

  jobs.push({
    company: job.find('.company').text().trim(),
    title: job.find('.title').text().trim(),
    endDate: job.find('.deadline').text().trim(),
    url: job.find('a').attr('href')
  });
});

console.log(JSON.stringify(jobs, null, 2));
