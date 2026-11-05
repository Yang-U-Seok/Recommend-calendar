
import { useState, useEffect, useRef } from 'react';
import './JobSearch.css';

const API_BASE = 'http://localhost:3001';
const PAGE_SIZE = 10;

const SAMSUNG_URL = 'https://www.samsungcareers.com/hr/?ty=B';

// 공공기관 유형
const categories = [
  { value: '', label: '전체 기관' },
  { value: 'g01', label: '국가공무원' },
  { value: 'g02', label: '지방공무원' },
  { value: 'g03', label: '공공기관' },
  { value: 'g04', label: '교육청' }
];

// 공공기관 채용 유형
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

function JobSearch() {
  // 채용정보 종류
  const [jobType, setJobType] = useState('public');

  // 검색 조건
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [recruitmentType, setRecruitmentType] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [company, setCompany] = useState('');
  const [companySize, setCompanySize] = useState('');

  // 검색 결과
  const [jobs, setJobs] = useState([]);
  const [privateJobs, setPrivateJobs] = useState([]);
  const [koreanJobs, setKoreanJobs] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  // 페이지 정보
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  // 국내기업 상세보기
  const [selectedJob, setSelectedJob] = useState(null);

  // 마지막 검색 조건 보관
  const appliedFilters = useRef(initialFilters);

  // 이전 요청 무효화
  const requestId = useRef(0);

  // 공공기관 채용공고 검색
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

    } catch (err) {
      if (id !== requestId.current) return;

      setJobs([]);
      setHasNext(false);
      setError(err.message);

    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  // 해외 사기업 채용공고 검색
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
          data.message || '사기업 채용정보 조회 실패'
        );
      }

      if (id !== requestId.current) return;

      const allJobs = Array.isArray(data.jobs)
        ? data.jobs
        : [];

      const searchKeyword = filters.keyword.trim().toLowerCase();

      let filtered = allJobs.filter(job => {
        const searchableText = [
          job.company,
          job.title,
          job.location
        ].join(' ').toLowerCase();

        const matchesKeyword =
          !searchKeyword ||
          searchableText.includes(searchKeyword);

        const matchesCompany =
          !filters.company ||
          job.company === filters.company;

        return matchesKeyword && matchesCompany;
      });

      filtered = [...filtered].sort((a, b) => {
        const dateA = Date.parse(a.updatedAt || '') || 0;
        const dateB = Date.parse(b.updatedAt || '') || 0;

        return dateB - dateA;
      });

      const startIndex = (nextPage - 1) * PAGE_SIZE;

      const pageJobs = filtered.slice(
        startIndex,
        startIndex + PAGE_SIZE
      );

      setPrivateJobs(allJobs);
      setJobs(pageJobs);
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
      setError(err.message);

    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  // 국내기업 채용공고 검색
  const searchKoreanJobs = async (
    nextPage = 1,
    filters = appliedFilters.current
  ) => {
    const id = ++requestId.current;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
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

      const allJobs = Array.isArray(data.jobs)
        ? data.jobs
        : [];

      const searchKeyword = filters.keyword.trim().toLowerCase();

      let filtered = allJobs.filter(job => {
        const searchableText = [
          job.company,
          job.title,
          ...(job.positions || []).map(position =>
            [
              position.name,
              position.location
            ].join(' ')
          )
        ].join(' ').toLowerCase();

        const matchesKeyword =
          !searchKeyword ||
          searchableText.includes(searchKeyword);

        const matchesCompany =
          !filters.company ||
          job.company === filters.company;

        const matchesSize =
          !filters.companySize ||
          job.companySize === filters.companySize;

        let matchesActive = true;

        if (filters.activeOnly && job.endDate) {
          const endDate = new Date(
            String(job.endDate).replace(' ', 'T') +
            '+09:00'
          );

          if (!Number.isNaN(endDate.getTime())) {
            matchesActive = endDate >= new Date();
          }
        }

        return (
          matchesKeyword &&
          matchesCompany &&
          matchesSize &&
          matchesActive
        );
      });

      filtered = [...filtered].sort((a, b) =>
        String(b.startDate || '').localeCompare(
          String(a.startDate || '')
        )
      );

      const startIndex = (nextPage - 1) * PAGE_SIZE;

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

      setJobs([]);
      setHasNext(false);
      setError(err.message);

    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  // 검색 실행
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

  // 최초 진입 시 공공기관 자동 검색
  useEffect(() => {
    appliedFilters.current = { ...initialFilters };

    searchPublicJobs(1, initialFilters);

    return () => {
      requestId.current++;
    };
  }, []);

  // 탭 전환
  const changeJobType = (type) => {
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

    const filters = { ...initialFilters };
    appliedFilters.current = filters;

    searchJobs(1, filters, type);
  };

  // 검색 버튼
  const handleSearch = (e) => {
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

  // 페이지 이동
  const changePage = (nextPage) => {
    if (nextPage < 1 || loading) return;

    if (
      jobType !== 'public' &&
      nextPage > Math.ceil(totalCount / PAGE_SIZE)
    ) {
      return;
    }

    searchJobs(nextPage, appliedFilters.current);
  };

  // 날짜 표시
  const displayDate = (date) => {
    if (!date) return '정보 없음';

    if (/^\d{8}$/.test(String(date))) {
      const value = String(date);

      return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    }

    if (String(date).includes('T')) {
      const parsed = new Date(date);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('ko-KR', {
          timeZone: 'Asia/Seoul'
        });
      }
    }

    return String(date);
  };

  // 기업 선택 목록
  const companies = [...new Set(
    (
      jobType === 'korean'
        ? koreanJobs
        : privateJobs
    ).map(job => job.company).filter(Boolean)
  )].sort();

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

      {/* 채용정보 종류 */}
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

      {/* 검색 영역 */}
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
          onChange={(e) => setKeyword(e.target.value)}
        />

        {jobType === 'public' ? (
          <>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={recruitmentType}
              onChange={(e) =>
                setRecruitmentType(e.target.value)
              }
            >
              {recruitmentTypes.map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
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
                onChange={(e) =>
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

      {/* 모집 상태 필터 */}
      {(jobType === 'public' || jobType === 'korean') && (
        <div className="job-filter-options">
          <label>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) =>
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
              마지막 갱신: {displayDate(lastUpdated)}
            </span>
          )}
        </div>
      )}

      {/* 국내기업 안내 */}
      {jobType === 'korean' && (
        <div className="job-source-info">
          <span>
            삼성커리어스 채용공고 로컬 테스트 데이터
          </span>
          <span>
            실제 모집 여부는 공식 사이트에서 확인하세요.
          </span>
        </div>
      )}

      {/* 검색 결과 요약 */}
      {searched && !loading && !error && (
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

      {/* 검색 결과 없음 */}
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
                    {displayDate(job.endDate)}
                  </p>

                  <p>
                    <strong>모집 직무:</strong>{' '}
                    {(job.positions || [])
                      .map(position => position.name)
                      .filter(Boolean)
                      .join(', ') || '정보 없음'}
                  </p>
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
                      href={SAMSUNG_URL}
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

      {/* 페이지 이동 */}
      {searched && !loading && !error && totalCount > 0 && (
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
            {page} / {jobType === 'public' && hasNext
              ? '...'
              : jobType === 'public'
                ? page
                : totalPages} 페이지
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

      {/* 국내기업 상세보기 팝업 */}
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
            onClick={(e) => e.stopPropagation()}
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
              {displayDate(selectedJob.endDate)}
            </p>

            <h3>공통 지원자격</h3>

            <p className="job-detail-text">
              {selectedJob.qualifications || '정보 없음'}
            </p>

            <h3>모집 직무</h3>

            {(selectedJob.positions || []).map(
              (position, index) => (
                <div className="job-position" key={index}>
                  <h4>{position.name}</h4>

                  <p>
                    <strong>근무지역:</strong>{' '}
                    {position.location || '정보 없음'}
                  </p>

                  <strong>담당 업무</strong>
                  <p className="job-detail-text">
                    {position.description || '정보 없음'}
                  </p>

                  <strong>지원자격</strong>
                  <p className="job-detail-text">
                    {position.qualifications || '정보 없음'}
                  </p>

                  <strong>우대사항</strong>
                  <p className="job-detail-text">
                    {position.preferences || '정보 없음'}
                  </p>
                </div>
              )
            )}

            <h3>지원 방법</h3>

            <p className="job-detail-text">
              {selectedJob.applicationProcess || '정보 없음'}
            </p>

            <a
              className="job-official-link"
              href={SAMSUNG_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              삼성커리어스에서 확인하기
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobSearch;
