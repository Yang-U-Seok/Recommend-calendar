
const fs = require('fs');
const cheerio = require('cheerio');

const id = 'J20261113040628';

const url = new URL(
  'https://recruit.cj.net/recruit/ko/recruit/recruit/bestDetail.fo'
);

url.searchParams.set('direct', 'N');
url.searchParams.set('zz_jo_num', id);
url.searchParams.set('closeYn', '23');
url.searchParams.set('schVal0', '1');

async function main() {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9'
    }
  });

  const html = await response.text();
  const $ = cheerio.load(html);

  fs.writeFileSync(
    'cjDebug.html',
    html,
    'utf8'
  );

  console.log('HTTP 상태:', response.status);
  console.log('HTML 길이:', html.length);

  console.log(
    'detail-list 개수:',
    $('.detail-list').length
  );

  console.log(
    'detail-list > li 개수:',
    $('.detail-list > li').length
  );

  console.log(
    'contents 개수:',
    $('.contents').length
  );

  console.log(
    'h3 제목:',
    $('h3').map((_, el) =>
      $(el).text().trim()
    ).get().slice(0, 20)
  );

  console.log(
    '본문 미리보기:',
    $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500)
  );
console.log('\n===== 상세정보 항목 확인 =====');

$('.detail-list > li').each((index, li) => {
  const heading = $(li).find('h3').first().text().trim();
  const contents = $(li).find('.contents').first();

  console.log(`\n[${index + 1}] ${heading}`);
  console.log('contents 개수:', contents.length);
  console.log('텍스트 길이:', contents.text().trim().length);
  console.log(
    '내용:',
    contents.text().replace(/\s+/g, ' ').trim().slice(0, 500)
  );
  console.log(
    '이미지 개수:',
    contents.find('img').length
  );
  console.log(
    'iframe 개수:',
    contents.find('iframe').length
  );
});
  console.log('HTML 저장 완료: cjDebug.html');
}

main().catch(console.error);
