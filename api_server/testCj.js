
const API_URL =
  'https://recruit.cj.net/recruit/ko/recruit/recruit/searchNewGonggoList.fo';

async function testCJ() {
  try {
    const payload = {
      pageVal: '1',
      pageIndex: '10',
      orderDesc: '1',
      sch_title: '',
      arrGubun: '',
      arrRecBu: '',
      arrRecArea: '',
      arrRecJob: '',
      schArea: 'N'
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Ajaxtype': 'FrameOne'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    console.log('HTTP 상태:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const jobs = data.ds_newRecruitList || [];

    console.log('전체 공고 수:', jobs[0]?.tot_cnt ?? 0);
    console.log('현재 페이지 공고:', jobs.length);

    for (const job of jobs) {
      console.log({
        company: job.compnm,
        title: job.zz_title,
        jobId: job.zz_jo_num,
        startDate: job.zz_str_dt_str,
        endDate: job.zz_end_dt_str,
        location: job.location_cd_nm,
        open: job.zz_open_yn
      });
    }

  } catch (error) {
    console.error('CJ API 오류:', error.message);
  }
}

testCJ();
