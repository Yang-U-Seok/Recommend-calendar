
import { useState, useEffect, useRef } from 'react';
import './JobSearch.css';

const API_BASE = 'http://localhost:3001';
const PAGE_SIZE = 10;

const SAMSUNG_URL = 'https://www.samsungcareers.com/hr/?ty=B';
const HYUNDAI_URL = 'https://talent.hyundai.com/';
const LG_URL = 'https://careers.lg.com/';

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

// 국내기업 마감일 및 마감시간 표시
function displayDeadline(job) {
  if (!job.endDate) return '정보 없음';

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

// 한국시간 기준 모집 중인지 확인
function isActiveJob(job) {
  if (!job.endDate) return true;

  const raw = String(job.endDate).trim();
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

  if (Number.isNaN(date.getTime())) return true;

  return date.getTime() >= Date.now();
}

// 기업별 공식 채용사이트
function getOfficialUrl(job) {
  if (job.sourceCompany === 'LG') {
    return job.url || LG_URL;
  }

  if (
    job.sourceCompany === '현대자동차' ||
    job.company === '현대자동차'
  ) {
    return job.url || HYUNDAI_URL;
  }

  return job.url || SAMSUNG_URL;
}

function getOfficialLinkText(job) {
  if (job.sourceCompany === 'LG') {
    return 'LG Careers에서 확인하기';
  }

  if (
    job.sourceCompany === '현대자동차' ||
    job.company === '현대자동차'
  ) {
    return '현대자동차 채용사이트에서 확인하기';
  }

  return '삼성커리어스에서 확인하기';
}

function getPositionNames(job) {
  if (
    Array.isArray(job.positions) &&
    job.positions.length > 0
  ) {
    return (
      job.positions
        .map(position => position.name)
        .filter(Boolean)
        .join(', ') || '정보 없음'
    );
  }

  return job.position || '정보 없음';
}

function getLocation(job) {
  if (job.location) return job.location;

  if (Array.isArray(job.positions)) {
    return (
      job.positions
        .map(position => position.location)
        .filter(Boolean)
        .join(', ') || '정보 없음'
    );
  }

  return '정보 없음';
}

// 국내기업 API 응답을 동일한 구조로 변환
function normalizeKoreanJobs(result) {
  const { name, data } = result;

  if (name === '삼성') {
    const items = Array.isArray(data.items)
      ? data.items
      : [];

    return items.map(job => ({
      ...job,
      companySize: job.companySize || '대기업',
      sourceCompany: '삼성',
      url: job.url || SAMSUNG_URL
    }));
  }

  if (name === '현대자동차') {
    const items = Array.isArray(data.jobs)
      ? data.jobs
      : [];

    return items.map(job => ({
      ...job,
      company: '현대자동차',
      companySize: '대기업',
      sourceCompany: '현대자동차',
      url: job.url || HYUNDAI_URL
    }));
  }

  if (name === 'LG') {
    const items = Array.isArray(data.jobs)
      ? data.jobs
      : [];

    return items.map(job => ({
      ...job,
      company: job.company || 'LG 계열사',
      companySize: job.companySize || '대기업',
      sourceCompany: 'LG',
      url: job.url || LG_URL
    }));
  }

  return [];
}

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

  // 공공기관 채용정보
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

  // 해외기업 채용정보
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
        const dateA = Date.parse(a.updatedAt || '') || 0;
        const dateB = Date.parse(b.updatedAt || '') || 0;

        return dateB - dateA;
      });

      const startIndex = (nextPage - 1) * PAGE_SIZE;

      setPrivateJobs(allJobs);
      setJobs(
        filtered.slice(startIndex, startIndex + PAGE_SIZE)
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

  // 국내기업: 삼성 + 현대자동차 + LG
  const searchKoreanJobs = async (
    nextPage = 1,
    filters = appliedFilters.current
  ) => {
    const id = ++requestId.current;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const endpoints = [
        {
          name: '삼성',
          url: `${API_BASE}/api/samsung-jobs`
        },
        {
          name: '현대자동차',
          url: `${API_BASE}/api/hyundai-jobs`
        },
        {
          name: 'LG',
          url: `${API_BASE}/api/lg-jobs`
        }
      ];

      // 한 기업 API에 오류가 발생해도
      // 나머지 기업의 공고는 표시
      const results = await Promise.allSettled(
        endpoints.map(async endpoint => {
          const response = await fetch(endpoint.url);
          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(
              data.message || `${endpoint.name} 조회 실패`
            );
          }

          return {
            name: endpoint.name,
            data
          };
        })
      );

      if (id !== requestId.current) return;

      const successful = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);

      const failed = results
        .filter(result => result.status === 'rejected')
        .map(result =>
          result.reason?.message || '알 수 없는 오류'
        );

      if (successful.length === 0) {
        throw new Error(
          failed.join(' / ') ||
          '국내기업 채용공고 조회 실패'
        );
      }

      let allJobs = successful.flatMap(
        normalizeKoreanJobs
      );

      // 기업별 ID를 사용해 중복 제거
      allJobs = Array.from(
        new Map(
          allJobs.map((job, index) => [
            `${job.sourceCompany}-${job.id ?? index}`,
            job
          ])
        ).values()
      );

      const searchKeyword =
        filters.keyword.trim().toLowerCase();

      const filtered = allJobs.filter(job => {
        const positions = Array.isArray(job.positions)
          ? job.positions
          : [];

        const searchableText = [
          job.company,
          job.title,
          job.location,
          job.category,
          job.position,
          job.employmentType,
          job.recruitmentType,
          ...positions.flatMap(position => [
            position.name,
            position.location,
            position.description
          ])
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matchesKeyword =
          !searchKeyword ||
          searchableText.includes(searchKeyword);

        const matchesCompany =
          !filters.company ||
          job.company === filters.company;

        const matchesSize =
          !filters.companySize ||
          (job.companySize || '미확인') ===
            filters.companySize;

        const matchesActive =
          !filters.activeOnly || isActiveJob(job);

        return (
          matchesKeyword &&
          matchesCompany &&
          matchesSize &&
          matchesActive
        );
      });

      // 시작일이 없는 LG 공고도 고려해 정렬
      filtered.sort((a, b) => {
        const dateA = String(
          a.startDate || a.endDate || ''
        );

        const dateB = String(
          b.startDate || b.endDate || ''
        );

        return dateB.localeCompare(dateA);
      });

      const startIndex = (nextPage - 1) * PAGE_SIZE;

      setKoreanJobs(allJobs);
      setJobs(
        filtered.slice(startIndex, startIndex + PAGE_SIZE)
      );
      setPage(nextPage);
      setTotalCount(filtered.length);
      setHasNext(
        startIndex + PAGE_SIZE < filtered.length
      );
      setLastUpdated(null);

      if (failed.length > 0) {
        setError(
          '일부 기업의 채용공고를 가져오지 못했습니다: ' +
          failed.join(' / ')
        );
      }
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
    appliedFilters.current = { ...initialFilters };
    searchPublicJobs(1, initialFilters);

    return () => {
      requestId.current++;
    };
  }, []);

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

    const filters = { ...initialFilters };
    appliedFilters.current = filters;

    searchJobs(1, filters, type);
  };

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

  const changePage = nextPage => {
    if (nextPage < 1 || loading) return;

    if (
      jobType !== 'public' &&
      nextPage > Math.ceil(totalCount / PAGE_SIZE)
    ) {
      return;
    }

    searchJobs(nextPage, appliedFilters.current);
  };

  const companies = [
    ...new Set(
      (jobType === 'korean' ? koreanJobs : privateJobs)
        .map(job => job.company)
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, 'ko'));

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / PAGE_SIZE)
  );

  return (
    <div className="job-page">
      <h1>채용정보 검색</h1>

      <p>
        공공기관 및 국내외 기업의 채용공고를 검색하고
        상세 채용정보를 확인할 수 있습니다.
      </p>

      <div className="job-type-tabs">
        <button
          type="button"
          className={jobType === 'public' ? 'active' : ''}
          onClick={() => changeJobType('public')}
        >
          공공기관
        </button>

        <button
          type="button"
          className={jobType === 'private' ? 'active' : ''}
          onClick={() => changeJobType('private')}
        >
          해외기업
        </button>

        <button
          type="button"
          className={jobType === 'korean' ? 'active' : ''}
          onClick={() => changeJobType('korean')}
        >
          국내기업
        </button>
      </div>

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
              onChange={e => setCategory(e.target.value)}
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
              onChange={e => setCompany(e.target.value)}
            >
              <option value="">전체 기업</option>

              {companies.map(name => (
                <option key={name} value={name}>
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
                <option value="">전체 규모</option>
                <option value="대기업">대기업</option>
                <option value="중견기업">중견기업</option>
                <option value="중소기업">중소기업</option>
                <option value="미확인">분류 미확인</option>
              </select>
            )}
          </>
        )}

        <button type="submit" disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {(jobType === 'public' || jobType === 'korean') && (
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

      {jobType === 'private' && (
        <div className="job-source-info">
          <span>Greenhouse 공개 채용정보 기반</span>

          {lastUpdated && (
            <span>
              마지막 갱신: {displayDate(lastUpdated)}
            </span>
          )}
        </div>
      )}

      {jobType === 'korean' && (
        <div className="job-source-info">
          <span>
            삼성커리어스, 현대자동차, LG Careers
            공식 채용사이트 수집 데이터
          </span>

          <span>
            LG전자, LG CNS, LG화학, LG유플러스 등
            LG 계열사 채용공고 포함
          </span>

          <span>
            새로운 공고는 서버에서 수집 데이터를
            갱신한 후 반영됩니다.
          </span>

          <span>
            실제 모집 여부는 공식 채용사이트에서
            확인하세요.
          </span>
        </div>
      )}

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

      {error && (
        <p className="job-error">
          {error}
        </p>
      )}

      {loading && (
        <p className="job-loading">
          채용공고를 불러오는 중입니다...
        </p>
      )}

      {!loading &&
        searched &&
        jobs.length === 0 &&
        !error && (
          <p className="job-empty">
            검색 조건에 맞는 채용공고가 없습니다.
          </p>
        )}

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

              <h3>{job.title || '제목 없음'}</h3>

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

                  {job.sourceCompany === 'LG' &&
                    job.recruitmentType && (
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

              <div className="job-card-actions">
                {jobType === 'korean' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedJob(job)}
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
                  <span>상세정보 없음</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {searched &&
        !loading &&
        totalCount > 0 && (
          <div className="job-pagination">
            <button
              type="button"
              className="job-page-btn"
              disabled={page <= 1}
              onClick={() => changePage(page - 1)}
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
              onClick={() => changePage(page + 1)}
            >
              다음 →
            </button>
          </div>
        )}

      {selectedJob && (
        <div
          className="job-modal-overlay"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="job-modal"
            role="dialog"
            aria-modal="true"
            aria-label="채용공고 상세정보"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="job-modal-close"
              onClick={() => setSelectedJob(null)}
            >
              ✕ 닫기
            </button>

            <h2>{selectedJob.title}</h2>

            <p>
              <strong>기업명:</strong>{' '}
              {selectedJob.company}
            </p>

            <p>
              <strong>접수기간:</strong>{' '}
              {displayDate(selectedJob.startDate)}
              {' ~ '}
              {displayDeadline(selectedJob)}
            </p>

            {selectedJob.sourceCompany === 'LG' ? (
              <>
                <h3>LG 채용공고 정보</h3>

                <p>
                  <strong>모집 직무:</strong>{' '}
                  {getPositionNames(selectedJob)}
                </p>

                <p>
                  <strong>근무지역:</strong>{' '}
                  {getLocation(selectedJob)}
                </p>

                <p>
                  <strong>직무 분야:</strong>{' '}
                  {selectedJob.category || '정보 없음'}
                </p>

                <p>
                  <strong>채용 유형:</strong>{' '}
                  {selectedJob.employmentType ||
                    '정보 없음'}
                </p>

                <p>
                  <strong>모집 방식:</strong>{' '}
                  {selectedJob.recruitmentType ||
                    '정보 없음'}
                </p>

                <p>
                  <strong>접수 마감시간:</strong>{' '}
                  {selectedJob.endTime || '정보 없음'}
                </p>

                <p className="job-detail-text">
                  담당 업무, 지원자격, 우대사항 등
                  상세 내용은 LG Careers 공식
                  채용사이트에서 확인하세요.
                </p>
              </>
            ) : selectedJob.company ===
              '현대자동차' ? (
              <>
                <h3>채용공고 정보</h3>

                <p>
                  <strong>모집 직무:</strong>{' '}
                  {selectedJob.position || '정보 없음'}
                </p>

                <p>
                  <strong>근무지역:</strong>{' '}
                  {selectedJob.location || '정보 없음'}
                </p>

                <p>
                  <strong>직무 분야:</strong>{' '}
                  {selectedJob.category || '정보 없음'}
                </p>

                <p>
                  <strong>채용 유형:</strong>{' '}
                  {selectedJob.employmentType ||
                    '정보 없음'}
                </p>

                <p>
                  <strong>접수 마감시간:</strong>{' '}
                  {selectedJob.endTime || '정보 없음'}
                </p>

                <p className="job-detail-text">
                  담당 업무와 지원자격의 상세 내용은
                  현대자동차 공식 채용사이트에서
                  확인하세요.
                </p>
              </>
            ) : (
              <>
                <h3>공통 지원자격</h3>

                <p className="job-detail-text">
                  {selectedJob.qualifications ||
                    '정보 없음'}
                </p>

                <h3>모집 직무</h3>

                {(selectedJob.positions || []).map(
                  (position, index) => (
                    <div
                      className="job-position"
                      key={index}
                    >
                      <h4>
                        {position.name || '직무명 없음'}
                      </h4>

                      <p>
                        <strong>근무지역:</strong>{' '}
                        {position.location ||
                          '정보 없음'}
                      </p>

                      <strong>담당 업무</strong>

                      <p className="job-detail-text">
                        {position.description ||
                          '정보 없음'}
                      </p>

                      <strong>지원자격</strong>

                      <p className="job-detail-text">
                        {position.qualifications ||
                          '정보 없음'}
                      </p>

                      <strong>우대사항</strong>

                      <p className="job-detail-text">
                        {position.preferences ||
                          '정보 없음'}
                      </p>
                    </div>
                  )
                )}

                <h3>지원 방법</h3>

                <p className="job-detail-text">
                  {selectedJob.applicationProcess ||
                    '정보 없음'}
                </p>
              </>
            )}

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
