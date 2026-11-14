import { useState, useEffect, useRef } from 'react';
import './JobSearch.css';

const API_BASE = 'http://localhost:3001';
const PAGE_SIZE = 10;

const SAMSUNG_URL = 'https://www.samsungcareers.com/hr/?ty=B';
const HYUNDAI_URL = 'https://talent.hyundai.com/';
const LG_URL = 'https://careers.lg.com/';
const SK_URL = 'https://www.skcareers.com/';
const HANWHA_URL = 'https://www.hanwhain.com/';
const CJ_URL = 'https://recruit.cj.net/';

const categories = [
  { value: '', label: '전체 기관' },
  { value: 'g01', label: '국가공무원' },
  { value: 'g02', label: '지방공무원' },
  { value: 'g03', label: '공공기관' },
  { value: 'g04', label: '교육청' }
];

const recruitmentTypes = [
  { value: '', label: '전체 채용유형' },
  { value: 'e01', label: '공개경쟁채용' },
  { value: 'e02', label: '경력경쟁채용' },
  { value: 'e03', label: '계약직' },
  { value: 'e04', label: '행정지원' },
  { value: 'e06', label: '개방형 직위' }
];

const initialFilters = {
  keyword: '',
  category: '',
  recruitmentType: '',
  activeOnly: true,
  company: '',
  companySize: ''
};

// ==========================================
// 날짜 관련 함수
// ==========================================

function displayDate(value) {
  if (!value) return '정보 없음';

  const text = String(value).trim();

  if (/^\d{8}$/.test(text)) {
    return (
      `${text.slice(0, 4)}-` +
      `${text.slice(4, 6)}-` +
      `${text.slice(6, 8)}`
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (text.includes('T')) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul'
      });
    }
  }

  return text;
}

function displayDeadline(job) {
  if (!job.endDate && !job.endDateTime) return '정보 없음';

  if (job.endDateTime && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(job.endDateTime)) {
    return job.endDateTime.slice(0, 16);
  }

  const date = displayDate(job.endDate);
  const time = String(job.endTime || '').trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    /^\d{2}:\d{2}$/.test(time)
  ) {
    return `${date} ${time}`;
  }

  return date;
}

// 한국시간 기준 모집 여부 확인
function isActiveJob(job) {
  if (!job.endDate && !job.endDateTime) return true;

  const raw = String(job.endDateTime || job.endDate).trim();
  let normalized = raw;

  if (/^\d{8}$/.test(raw)) {
    normalized =
      `${raw.slice(0, 4)}-` +
      `${raw.slice(4, 6)}-` +
      `${raw.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const endTime =
      /^\d{2}:\d{2}$/.test(String(job.endTime || ''))
        ? `${job.endTime}:00`
        : '23:59:59';

    normalized = `${normalized}T${endTime}+09:00`;
  } else {
    normalized = normalized.replace(' ', 'T');

    const hasTimezone =
      /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);

    if (!hasTimezone) {
      normalized += '+09:00';
    }
  }

  const date = new Date(normalized);

  // 날짜를 해석할 수 없는 경우 임의로 마감 처리하지 않음
  if (Number.isNaN(date.getTime())) return true;

  return date.getTime() >= Date.now();
}

// ==========================================
// 기업 공식 사이트 관련 함수
// ==========================================

function getOfficialUrl(job) {
  const url = String(job.url || '').trim();

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const group = String(
    job.sourceCompany || job.group || ''
  );
  if (
  group === 'CJ' ||
  String(job.company || '').startsWith('CJ')
) {
  return CJ_URL;
}

  if (group === '한화' || String(job.company || '').includes('한화')) {
    return HANWHA_URL;
  }

  if (
    group === 'SK' ||
    String(job.company || '').startsWith('SK')
  ) {
    return SK_URL;
  }

  if (
    group === 'LG' ||
    String(job.company || '').startsWith('LG')
  ) {
    return LG_URL;
  }

  if (
    group === '현대' ||
    group === '현대자동차' ||
    job.company === '현대자동차'
  ) {
    return HYUNDAI_URL;
  }

  return SAMSUNG_URL;
}

function getOfficialLinkText(job) {
  const group = String(
    job.sourceCompany || job.group || ''
  );

  if (group === '한화') {
    return '한화인에서 확인하기';
  }
  if (group === 'CJ') {
  return 'CJ 채용사이트에서 확인하기';
}

  if (group === 'SK') {
    return 'SK Careers에서 확인하기';
  }

  if (group === 'LG') {
    return 'LG Careers에서 확인하기';
  }

  if (
    group === '현대' ||
    group === '현대자동차'
  ) {
    return '현대자동차 채용사이트에서 확인하기';
  }

  return '삼성커리어스에서 확인하기';
}

// ==========================================
// 채용공고 데이터 표시 관련 함수
// ==========================================

function getPositionNames(job) {
  if (
    Array.isArray(job.positions) &&
    job.positions.length > 0
  ) {
    const names = job.positions
      .map(position => {
        if (typeof position === 'string') {
          return position;
        }

        return (
          position.name ||
          position.positionName ||
          position.title ||
          position.jobRole ||
          ''
        );
      })
      .filter(Boolean);

    if (names.length > 0) {
      return [...new Set(names)].join(', ');
    }
  }

  return (
    job.position ||
    job.positionName ||
    job.jobRole ||
    '정보 없음'
  );
}

function getLocation(job) {
  if (job.location) return job.location;

  if (job.workingArea) return job.workingArea;

  if (Array.isArray(job.positions)) {
    const locations = job.positions
      .filter(position => typeof position === 'object')
      .map(position =>
        position.location || position.workingArea
      )
      .filter(Boolean);

    if (locations.length > 0) {
      return [...new Set(locations)].join(', ');
    }
  }

  return '정보 없음';
}

// 문자열, 배열, 객체 형태의 상세 내용을 표시 가능한 문자열로 변환
function displayDetail(value) {
  if (value == null || value === '') {
    return '정보 없음';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const result = value
      .map(displayDetail)
      .filter(text => text !== '정보 없음')
      .join('\n');

    return result || '정보 없음';
  }

  if (typeof value === 'object') {
    const result = Object.entries(value)
      .map(([key, item]) => {
        const text = displayDetail(item);

        return text === '정보 없음'
          ? ''
          : `${key}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');

    return result || '정보 없음';
  }

  return '정보 없음';
}

// ==========================================
// 국내기업 데이터 정규화
// ==========================================

function normalizeKoreanJob(job, index) {
  const group = String(
    job.group || job.sourceCompany || ''
  );

  const company = String(
    job.company || group || '기업명 미확인'
  );

  const id = String(
    job.id ||
    job.jobNoticeId ||
    job.noticeID ||
    `${group}-${index}`
  );

  const positions = Array.isArray(job.positions)
    ? job.positions
    : [];

  return {
    ...job,
    id,
    group,
    sourceCompany: group,
    company,
    companySize: job.companySize || '대기업',
    title:
      job.title ||
      job.positionName ||
      job.jobRole ||
      '채용공고',
    location:
      job.location ||
      job.workingArea ||
      '',
    startDate: job.startDate || null,
    endDate: job.endDate || null,
    positions,
    url: job.url || null
  };
}

// 검색어에 사용할 텍스트
function getKoreanSearchText(job) {
  const positionTexts = (job.positions || [])
    .flatMap(position => {
      if (typeof position === 'string') {
        return [position];
      }

      return [
        position.name,
        position.positionName,
        position.title,
        position.jobRole,
        position.description,
        position.location,
        position.qualifications,
        position.requirements,
        position.preferences,
        ...(Array.isArray(position.requiredCertificates) ? position.requiredCertificates : []),
        ...(Array.isArray(position.preferredCertificates) ? position.preferredCertificates : [])
      ];
    });

  return [
    job.company,
    job.group,
    job.title,
    job.location,
    job.category,
    job.position,
    job.positionName,
    job.jobRole,
    job.employmentType,
    job.recruitmentType,
    job.commonRequirements,
    job.recruitmentProcess,
    ...positionTexts,
    ...(Array.isArray(job.requiredCertificates)
      ? job.requiredCertificates
      : []),
    ...(Array.isArray(job.preferredCertificates)
      ? job.preferredCertificates
      : [])
  ]
    .filter(Boolean)
    .map(value => String(value))
    .join(' ')
    .toLowerCase();
}

// ==========================================
// 메인 컴포넌트
// ==========================================

function JobSearch() {
  const [jobType, setJobType] = useState('public');

  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [recruitmentType, setRecruitmentType] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [company, setCompany] = useState('');
  const [companySize, setCompanySize] = useState('');

  const [jobs, setJobs] = useState([]);
  const [privateJobs, setPrivateJobs] = useState([]);
  const [koreanJobs, setKoreanJobs] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [selectedJob, setSelectedJob] = useState(null);

  const appliedFilters = useRef(initialFilters);
  const requestId = useRef(0);

  // ==========================================
  // 1. 공공기관 채용공고
  // ==========================================

  const searchPublicJobs = async (
    nextPage = 1,
    filters = appliedFilters.current
  ) => {
    const id = ++requestId.current;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        size: String(PAGE_SIZE),
        activeOnly: String(filters.activeOnly)
      });

      if (filters.keyword.trim()) {
        params.set('keyword', filters.keyword.trim());
      }

      if (filters.category) {
        params.set('insttSe', filters.category);
      }

      if (filters.recruitmentType) {
        params.set('pblancTy', filters.recruitmentType);
      }

      const response = await fetch(
        `${API_BASE}/api/jobs?${params.toString()}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || '공공기관 채용정보 조회 실패'
        );
      }

      if (id !== requestId.current) return;

      const items = Array.isArray(data.items)
        ? data.items
        : [];

      const sortedJobs = [...items].sort((a, b) =>
        String(b.startDate || '').localeCompare(
          String(a.startDate || '')
        )
      );

      setJobs(sortedJobs);
      setPage(nextPage);
      setHasNext(Boolean(data.hasNext));
      setTotalCount(Number(data.totalCount || 0));
      setLastUpdated(null);

    } catch (err) {
      if (id !== requestId.current) return;

      setJobs([]);
      setHasNext(false);
      setTotalCount(0);
      setError(err.message);

    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  // ==========================================
  // 2. 해외기업 채용공고
  // ==========================================

  const searchPrivateJobs = async (
    nextPage = 1,
    filters = appliedFilters.current
  ) => {
    const id = ++requestId.current;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/private-jobs`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || '해외기업 채용정보 조회 실패'
        );
      }

      if (id !== requestId.current) return;

      const allJobs = Array.isArray(data.jobs)
        ? data.jobs
        : [];

      const searchKeyword =
        filters.keyword.trim().toLowerCase();

      const filtered = allJobs.filter(job => {
        const searchableText = [
          job.company,
          job.title,
          job.location
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return (
          (!searchKeyword ||
            searchableText.includes(searchKeyword)) &&
          (!filters.company ||
            job.company === filters.company)
        );
      });

      filtered.sort((a, b) => {
        const dateA =
          Date.parse(a.updatedAt || '') || 0;

        const dateB =
          Date.parse(b.updatedAt || '') || 0;

        return dateB - dateA;
      });

      const startIndex =
        (nextPage - 1) * PAGE_SIZE;

      setPrivateJobs(allJobs);

      setJobs(
        filtered.slice(
          startIndex,
          startIndex + PAGE_SIZE
        )
      );

      setPage(nextPage);
      setTotalCount(filtered.length);

      setHasNext(
        startIndex + PAGE_SIZE < filtered.length
      );

      setLastUpdated(data.lastUpdated || null);

    } catch (err) {
      if (id !== requestId.current) return;

      setJobs([]);
      setHasNext(false);
      setTotalCount(0);
      setError(err.message);

    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  // ==========================================
  // 3. 국내기업 통합 채용공고
  // 삼성 + 현대 + LG + SK + 한화
  // ==========================================

  const searchKoreanJobs = async (
    nextPage = 1,
    filters = appliedFilters.current
  ) => {
    const id = ++requestId.current;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      // 백엔드 index.js의 통합 API 사용
      const response = await fetch(
        `${API_BASE}/api/korean-jobs`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || '국내기업 채용정보 조회 실패'
        );
      }

      if (id !== requestId.current) return;

      // 통합 API는 jobs 또는 items 배열 반환
      const rawJobs = Array.isArray(data.jobs)
        ? data.jobs
        : Array.isArray(data.items)
          ? data.items
          : [];

      const allJobs = rawJobs.map(
        (job, index) => normalizeKoreanJob(job, index)
      );

      // 그룹별 데이터 수 확인
      console.log(
        '[국내기업 채용공고]',
        data.groupCounts || {}
      );

      const searchKeyword =
        filters.keyword.trim().toLowerCase();

      const filtered = allJobs.filter(job => {
        const searchableText =
          getKoreanSearchText(job);

        const matchesKeyword =
          !searchKeyword ||
          searchableText.includes(searchKeyword);

        const matchesCompany =
          !filters.company ||
          job.company === filters.company;

        const matchesSize =
          !filters.companySize ||
          job.companySize === filters.companySize;

        const matchesActive =
          !filters.activeOnly ||
          isActiveJob(job);

        return (
          matchesKeyword &&
          matchesCompany &&
          matchesSize &&
          matchesActive
        );
      });

      // 최신 공고 우선
      filtered.sort((a, b) => {
        const dateA = String(
          a.startDate || a.endDate || ''
        );

        const dateB = String(
          b.startDate || b.endDate || ''
        );

        return dateB.localeCompare(dateA);
      });

      const startIndex =
        (nextPage - 1) * PAGE_SIZE;

      setKoreanJobs(allJobs);

      setJobs(
        filtered.slice(
          startIndex,
          startIndex + PAGE_SIZE
        )
      );

      setPage(nextPage);
      setTotalCount(filtered.length);

      setHasNext(
        startIndex + PAGE_SIZE < filtered.length
      );

      setLastUpdated(null);

    } catch (err) {
      if (id !== requestId.current) return;

      console.error(
        '국내기업 채용공고 조회 오류:',
        err
      );

      setJobs([]);
      setHasNext(false);
      setTotalCount(0);
      setError(err.message);

    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  // ==========================================
  // 4. 채용 유형별 검색 실행
  // ==========================================

  const searchJobs = (
    nextPage = 1,
    filters = appliedFilters.current,
    type = jobType
  ) => {
    if (type === 'private') {
      return searchPrivateJobs(nextPage, filters);
    }

    if (type === 'korean') {
      return searchKoreanJobs(nextPage, filters);
    }

    return searchPublicJobs(nextPage, filters);
  };

  useEffect(() => {
    appliedFilters.current = {
      ...initialFilters
    };

    searchPublicJobs(1, initialFilters);

    return () => {
      requestId.current++;
    };
  }, []);

  // ==========================================
  // 5. 탭 변경
  // ==========================================

  const changeJobType = type => {
    if (type === jobType) return;

    requestId.current++;

    setJobType(type);
    setKeyword('');
    setCategory('');
    setRecruitmentType('');
    setActiveOnly(true);
    setCompany('');
    setCompanySize('');
    setSelectedJob(null);

    setJobs([]);
    setPage(1);
    setHasNext(false);
    setTotalCount(0);
    setError('');
    setLastUpdated(null);
    setSearched(false);

    const filters = {
      ...initialFilters
    };

    appliedFilters.current = filters;

    searchJobs(1, filters, type);
  };

  // ==========================================
  // 6. 검색
  // ==========================================

  const handleSearch = e => {
    e.preventDefault();

    const filters = {
      keyword,
      category,
      recruitmentType,
      activeOnly,
      company,
      companySize
    };

    appliedFilters.current = filters;

    searchJobs(1, filters);
  };

  // ==========================================
  // 7. 페이지 이동
  // ==========================================

  const changePage = nextPage => {
    if (nextPage < 1 || loading) return;

    if (
      jobType !== 'public' &&
      nextPage > Math.ceil(totalCount / PAGE_SIZE)
    ) {
      return;
    }

    searchJobs(
      nextPage,
      appliedFilters.current
    );
  };

  // ==========================================
  // 8. 기업 선택 목록
  // ==========================================

  const companies = [
    ...new Set(
      (
        jobType === 'korean'
          ? koreanJobs
          : privateJobs
      )
        .map(job => job.company)
        .filter(Boolean)
    )
  ].sort((a, b) =>
    a.localeCompare(b, 'ko')
  );

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / PAGE_SIZE)
  );

  // ==========================================
  // 9. 화면
  // ==========================================

  return (
    <div className="job-page">
      <h1>채용정보 검색</h1>

      <p>
        공공기관 및 국내외 기업의 채용공고를 검색하고
        상세 채용정보를 확인할 수 있습니다.
      </p>

      {/* 채용 유형 탭 */}
      <div className="job-type-tabs">
        <button
          type="button"
          className={
            jobType === 'public' ? 'active' : ''
          }
          onClick={() => changeJobType('public')}
        >
          공공기관
        </button>

        <button
          type="button"
          className={
            jobType === 'private' ? 'active' : ''
          }
          onClick={() => changeJobType('private')}
        >
          해외기업
        </button>

        <button
          type="button"
          className={
            jobType === 'korean' ? 'active' : ''
          }
          onClick={() => changeJobType('korean')}
        >
          국내기업
        </button>
      </div>

      {/* 검색창 */}
      <form
        className="job-search-bar"
        onSubmit={handleSearch}
      >
        <input
          type="text"
          placeholder={
            jobType === 'public'
              ? '직무, 기관명, 채용공고 검색'
              : '직무, 기업명, 근무지역 검색'
          }
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />

        {jobType === 'public' ? (
          <>
            <select
              value={category}
              onChange={e =>
                setCategory(e.target.value)
              }
            >
              {categories.map(item => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={recruitmentType}
              onChange={e =>
                setRecruitmentType(e.target.value)
              }
            >
              {recruitmentTypes.map(item => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <select
              value={company}
              onChange={e =>
                setCompany(e.target.value)
              }
            >
              <option value="">
                전체 기업
              </option>

              {companies.map(name => (
                <option
                  key={name}
                  value={name}
                >
                  {name}
                </option>
              ))}
            </select>

            {jobType === 'korean' && (
              <select
                value={companySize}
                onChange={e =>
                  setCompanySize(e.target.value)
                }
              >
                <option value="">
                  전체 규모
                </option>

                <option value="대기업">
                  대기업
                </option>

                <option value="중견기업">
                  중견기업
                </option>

                <option value="중소기업">
                  중소기업
                </option>

                <option value="미확인">
                  분류 미확인
                </option>
              </select>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={loading}
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {/* 모집 중 필터 */}
      {(jobType === 'public' ||
        jobType === 'korean') && (
        <div className="job-filter-options">
          <label>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={e =>
                setActiveOnly(e.target.checked)
              }
            />
            모집 중인 공고만 표시
          </label>
        </div>
      )}

      {/* 해외기업 안내 */}
      {jobType === 'private' && (
        <div className="job-source-info">
          <span>
            Greenhouse 공개 채용정보 기반
          </span>

          {lastUpdated && (
            <span>
              마지막 갱신:{' '}
              {displayDate(lastUpdated)}
            </span>
          )}
        </div>
      )}

      {/* 국내기업 안내 */}
      {jobType === 'korean' && (
        <div className="job-source-info">
          <span>
           삼성커리어스, 현대자동차, LG Careers,
           SK Careers, 한화인, CJ 채용사이트
             수집 데이터
          </span>

          <span>
            삼성·현대·LG·SK·한화 그룹 및
            계열사 채용공고 포함
          </span>

          <span>
            새로운 공고는 서버에서
            수집 데이터를 갱신한 후
            반영됩니다.
          </span>

          <span>
            실제 모집 여부는 공식
            채용사이트에서 확인하세요.
          </span>
        </div>
      )}

      {/* 검색 결과 개수 */}
      {searched && !loading && (
        <div className="job-result-summary">
          <strong>검색 결과</strong>

          <span>
            총 {totalCount.toLocaleString()}건
            {' · '}
            현재 페이지 {jobs.length}건 표시
          </span>
        </div>
      )}

      {/* 오류 */}
      {error && (
        <p className="job-error">
          {error}
        </p>
      )}

      {/* 로딩 */}
      {loading && (
        <p className="job-loading">
          채용공고를 불러오는 중입니다...
        </p>
      )}

      {/* 결과 없음 */}
      {!loading &&
        searched &&
        jobs.length === 0 &&
        !error && (
          <p className="job-empty">
            검색 조건에 맞는 채용공고가 없습니다.
          </p>
        )}

      {/* 채용공고 목록 */}
      {!loading && (
        <div className="job-list">
          {jobs.map((job, index) => (
            <div
              className="job-card"
              key={`${jobType}-${job.id}-${index}`}
            >
              <div className="job-card-header">
                <span className="job-category">
                  {jobType === 'korean'
                    ? job.companySize || '미확인'
                    : jobType === 'private'
                      ? '해외기업'
                      : job.category || '공공채용'}
                </span>

                <span className="job-deadline">
                  {jobType === 'private'
                    ? '공고 업데이트: ' +
                      displayDate(job.updatedAt)
                    : jobType === 'korean'
                      ? '마감일: ' +
                        displayDeadline(job)
                      : '마감일: ' +
                        displayDate(job.endDate)}
                </span>
              </div>

              <h3>
                {job.title || '제목 없음'}
              </h3>

              <p>
                <strong>
                  {jobType === 'public'
                    ? '채용기관:'
                    : '기업명:'}
                </strong>{' '}
                {job.company || '정보 없음'}
              </p>

              {jobType === 'private' ? (
                <>
                  <p>
                    <strong>근무지역:</strong>{' '}
                    {job.location || '정보 없음'}
                  </p>

                  <p>
                    <strong>업데이트:</strong>{' '}
                    {displayDate(job.updatedAt)}
                  </p>

                  <p>
                    <strong>마감일:</strong>{' '}
                    {job.deadline
                      ? displayDate(job.deadline)
                      : '별도 확인 필요'}
                  </p>
                </>
              ) : jobType === 'korean' ? (
                <>
                  <p>
                    <strong>접수 시작:</strong>{' '}
                    {displayDate(job.startDate)}
                  </p>

                  <p>
                    <strong>접수 마감:</strong>{' '}
                    {displayDeadline(job)}
                  </p>

                  <p>
                    <strong>모집 직무:</strong>{' '}
                    {getPositionNames(job)}
                  </p>

                  <p>
                    <strong>근무지역:</strong>{' '}
                    {getLocation(job)}
                  </p>

                  {job.employmentType && (
                    <p>
                      <strong>채용 유형:</strong>{' '}
                      {job.employmentType}
                    </p>
                  )}

                  {job.recruitmentType && (
                    <p>
                      <strong>모집 방식:</strong>{' '}
                      {job.recruitmentType}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>
                    <strong>등록일:</strong>{' '}
                    {displayDate(job.startDate)}
                  </p>

                  <p>
                    <strong>마감일:</strong>{' '}
                    {displayDate(job.endDate)}
                  </p>
                </>
              )}

              {/* 카드 하단 버튼 */}
              <div className="job-card-actions">
                {jobType === 'korean' ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedJob(job)
                      }
                    >
                      상세보기
                    </button>

                    <a
                      href={getOfficialUrl(job)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      공식 채용 사이트
                    </a>
                  </>
                ) : job.url ? (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {jobType === 'private'
                      ? '지원 페이지 이동'
                      : '공고 상세보기'}
                  </a>
                ) : (
                  <span>
                    상세정보 없음
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 페이지 이동 */}
      {searched &&
        !loading &&
        totalCount > 0 && (
          <div className="job-pagination">
            <button
              type="button"
              className="job-page-btn"
              disabled={page <= 1}
              onClick={() =>
                changePage(page - 1)
              }
            >
              ← 이전
            </button>

            <span className="job-page-number">
              {page} /{' '}
              {jobType === 'public' && hasNext
                ? '...'
                : jobType === 'public'
                  ? page
                  : totalPages}{' '}
              페이지
            </span>

            <button
              type="button"
              className="job-page-btn"
              disabled={!hasNext}
              onClick={() =>
                changePage(page + 1)
              }
            >
              다음 →
            </button>
          </div>
        )}

      {/* ======================================
          국내기업 채용공고 상세보기
      ====================================== */}

      {selectedJob && (
        <div
          className="job-modal-overlay"
          onClick={() =>
            setSelectedJob(null)
          }
        >
          <div
            className="job-modal"
            role="dialog"
            aria-modal="true"
            aria-label="채용공고 상세정보"
            onClick={e =>
              e.stopPropagation()
            }
          >
            <button
              type="button"
              className="job-modal-close"
              onClick={() =>
                setSelectedJob(null)
              }
            >
              ✕ 닫기
            </button>

            <h2>
              {selectedJob.title}
            </h2>

            <p>
              <strong>기업명:</strong>{' '}
              {selectedJob.company}
            </p>

            <p>
              <strong>기업 그룹:</strong>{' '}
              {selectedJob.group ||
                selectedJob.sourceCompany ||
                '정보 없음'}
            </p>

            <p>
              <strong>접수기간:</strong>{' '}
              {displayDate(
                selectedJob.startDate
              )}
              {' ~ '}
              {displayDeadline(selectedJob)}
            </p>

            <p>
              <strong>모집 직무:</strong>{' '}
              {getPositionNames(selectedJob)}
            </p>

            <p>
              <strong>근무지역:</strong>{' '}
              {getLocation(selectedJob)}
            </p>

            {selectedJob.category && (
              <p>
                <strong>직무 분야:</strong>{' '}
                {selectedJob.category}
              </p>
            )}

            {selectedJob.employmentType && (
              <p>
                <strong>채용 유형:</strong>{' '}
                {selectedJob.employmentType}
              </p>
            )}

            {selectedJob.recruitmentType && (
              <p>
                <strong>모집 방식:</strong>{' '}
                {selectedJob.recruitmentType}
              </p>
            )}
            {/* CJ 상세 채용정보 */}
{selectedJob.jobDescription && (
  <>
    <h3>직무소개</h3>
    <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
      {displayDetail(selectedJob.jobDescription)}
    </p>
  </>
)}

{selectedJob.requirements && (
  <>
    <h3>지원자격</h3>
    <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
      {displayDetail(selectedJob.requirements)}
    </p>
  </>
)}

{selectedJob.otherInformation && (
  <>
    <h3>기타 안내사항</h3>
    <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
      {displayDetail(selectedJob.otherInformation)}
    </p>
  </>
)}

            {/* 공통 지원자격 */}
            {(selectedJob.commonRequirements || selectedJob.qualifications) && (
              <>
                <h3>공통 지원자격</h3>

                <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {displayDetail(
                    selectedJob.commonRequirements || selectedJob.qualifications
                  )}
                </p>
              </>
            )}

            {/* 공통 우대사항 */}
            {selectedJob.preferences && (
              <>
                <h3>공통 우대사항</h3>

                <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {displayDetail(
                    selectedJob.preferences
                  )}
                </p>
              </>
            )}

            {/* 자격증 정보 */}
            {Array.isArray(
              selectedJob.requiredCertificates
            ) &&
              selectedJob.requiredCertificates.length > 0 && (
                <>
                  <h3>필수 자격증</h3>

                  <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                    {displayDetail(
                      selectedJob.requiredCertificates
                    )}
                  </p>
                </>
              )}

            {Array.isArray(
              selectedJob.preferredCertificates
            ) &&
              selectedJob.preferredCertificates.length > 0 && (
                <>
                  <h3>우대 자격증</h3>

                  <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                    {displayDetail(
                      selectedJob.preferredCertificates
                    )}
                  </p>
                </>
              )}

            {/* 직무별 상세정보 */}
            {Array.isArray(selectedJob.positions) &&
              selectedJob.positions.length > 0 && (
                <>
                  <h3>모집 직무 상세정보</h3>

                  {selectedJob.positions.map(
                    (position, index) => {
                      const item =
                        typeof position === 'string'
                          ? { name: position }
                          : position || {};

                      return (
                        <div
                          className="job-position"
                          key={index}
                        >
                          <h4>
                            {item.name ||
                              item.positionName ||
                              item.title ||
                              item.jobRole ||
                              '직무명 없음'}
                          </h4>

                          <p>
                            <strong>
                              근무지역:
                            </strong>{' '}
                            {item.location ||
                              item.workingArea ||
                              '정보 없음'}
                          </p>

                          <strong>
                            담당 업무
                          </strong>

                          <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                            {displayDetail(
                              item.description ||
                              item.duties ||
                              item.jobDescription
                            )}
                          </p>

                          <strong>
                            지원자격
                          </strong>

                          <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                            {displayDetail(
                              item.qualifications ||
                              item.requirements
                            )}
                          </p>

                          <strong>
                            우대사항
                          </strong>

                          <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                            {displayDetail(
                              item.preferences ||
                              item.preferredQualifications
                            )}
                          </p>

                          {item.requiredCertificates && (
                            <>
                              <strong>
                                필수 자격증
                              </strong>

                              <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                                {displayDetail(
                                  item.requiredCertificates
                                )}
                              </p>
                            </>
                          )}

                          {item.preferredCertificates && (
                            <>
                              <strong>
                                우대 자격증
                              </strong>

                              <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                                {displayDetail(
                                  item.preferredCertificates
                                )}
                              </p>
                            </>
                          )}
                        </div>
                      );
                    }
                  )}
                </>
              )}

            {/* 한화 상세 수집 데이터: 전형 절차 및 기타 안내 */}
            {selectedJob.recruitmentProcess && (
              <>
                <h3>전형 절차</h3>
                <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {displayDetail(selectedJob.recruitmentProcess)}
                </p>
              </>
            )}

            {selectedJob.additionalNotes && (
              <>
                <h3>기타 안내사항</h3>
                <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {displayDetail(selectedJob.additionalNotes)}
                </p>
              </>
            )}

            {/* 지원 방법 */}
            {(selectedJob.applicationGuide || selectedJob.applicationProcess) && (
              <>
                <h3>지원 방법</h3>

                <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {displayDetail(
                    selectedJob.applicationGuide || selectedJob.applicationProcess
                  )}
                </p>
              </>
            )}

            <p className="job-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
              수집된 데이터에 없는 상세 조건과
              실제 모집 상태는 공식 채용사이트에서
              확인하세요.
            </p>

            <a
              className="job-official-link"
              href={getOfficialUrl(selectedJob)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {getOfficialLinkText(selectedJob)}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobSearch;