import { useState } from 'react';
import './QnetSearch.css';

const API_BASE = 'http://localhost:3001';

const GRADE_OPTIONS = [
  { value: '30', label: '기사' },
  { value: '31', label: '산업기사' },
  { value: '40', label: '기능사' },
  { value: '10', label: '기술사' },
  { value: '20', label: '기능장' },
  { value: '32', label: '1급' },
  { value: '33', label: '2급' }
];

const gradeLabel = (value) =>
  GRADE_OPTIONS.find((option) => option.value === value)?.label || '';

// 정렬 기준 정의 (type: text = 가나다, number = 숫자)
const PASS_SORTS = {
  name: { label: '가나다순', type: 'text', get: (item) => item.name },
  passRate: { label: '합격률', type: 'number', get: (item) => parseFloat(item.passRate) },
  applicants: { label: '응시자 수', type: 'number', get: (item) => Number(item.applicants) },
  passed: { label: '합격자 수', type: 'number', get: (item) => Number(item.passed) }
};

const TERM_SORTS = {
  name: { label: '가나다순', type: 'text', get: (item) => item.name },
  averageDays: {
    label: '취득소요기간',
    type: 'number',
    get: (item) =>
      item.averageDays === '' || item.averageDays == null ? NaN : Number(item.averageDays)
  }
};

// 정렬: 값이 없는 항목(N/A 등)은 방향과 관계없이 항상 맨 뒤
function sortItems(items, sortDef, direction) {
  const sign = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const va = sortDef.get(a);
    const vb = sortDef.get(b);

    if (sortDef.type === 'number') {
      const aMissing = !Number.isFinite(va);
      const bMissing = !Number.isFinite(vb);
      if (aMissing || bMissing) return aMissing - bMissing;
      if (va !== vb) return (va - vb) * sign;
    } else {
      const diff = String(va || '').localeCompare(String(vb || ''), 'ko');
      if (diff !== 0) return diff * sign;
    }

    // 같으면 이름순
    return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  });
}

const formatNumber = (value) => {
  const number = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(number)
    ? number.toLocaleString('ko-KR')
    : '-';
};

const formatDays = (value) => {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
    return '-';
  }
  return `${number.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}일`;
};

// ---------------- 시험일정 상태 계산 ----------------

const SCHEDULE_STEPS = [
  { key: 'docReg', label: '필기 접수', start: 'docRegStart', end: 'docRegEnd' },
  { key: 'docExam', label: '필기 시험', start: 'docExamStart', end: 'docExamEnd' },
  { key: 'docPass', label: '필기 발표', start: 'docPass', end: 'docPass' },
  { key: 'pracReg', label: '실기 접수', start: 'pracRegStart', end: 'pracRegEnd' },
  { key: 'pracExam', label: '실기 시험', start: 'pracExamStart', end: 'pracExamEnd' },
  { key: 'pracPass', label: '최종 발표', start: 'pracPass', end: 'pracPass' }
];

const todayString = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const daysBetween = (from, to) =>
  Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24));

const shortDate = (value) => (value ? value.slice(5).replace('-', '.') : '-');

const rangeText = (start, end) =>
  !start ? '-' : !end || start === end ? shortDate(start) : `${shortDate(start)} ~ ${shortDate(end)}`;

function getRoundStatus(round, today) {
  const steps = SCHEDULE_STEPS.filter((step) => round[step.start]);

  for (const step of steps) {
    const start = round[step.start];
    const end = round[step.end] || start;

    if (today >= start && today <= end) {
      return { type: 'now', stepKey: step.key, text: `${step.label} 진행 중` };
    }
    if (today < start) {
      return {
        type: 'next',
        stepKey: step.key,
        text: `${step.label} D-${daysBetween(today, start)}`
      };
    }
  }

  return { type: 'done', stepKey: null, text: '일정 종료' };
}

// ---------------- 공통 화면 조각 ----------------

function SortControls({ sorts, sortKey, direction, onChange }) {
  return (
    <div className="qnet-sort">
      <label>
        <span className="sr-only">정렬 기준</span>
        <select value={sortKey} onChange={(e) => onChange(e.target.value, direction)}>
          {Object.entries(sorts).map(([key, def]) => (
            <option key={key} value={key}>
              {def.label}
            </option>
          ))}
        </select>
      </label>

      <div className="qnet-direction" role="group" aria-label="정렬 방향">
        <button
          type="button"
          className={direction === 'asc' ? 'active' : ''}
          aria-pressed={direction === 'asc'}
          onClick={() => onChange(sortKey, 'asc')}
        >
          오름차순 ↑
        </button>
        <button
          type="button"
          className={direction === 'desc' ? 'active' : ''}
          aria-pressed={direction === 'desc'}
          onClick={() => onChange(sortKey, 'desc')}
        >
          내림차순 ↓
        </button>
      </div>
    </div>
  );
}

// 표 머리글 클릭으로도 정렬 (같은 머리글을 다시 누르면 방향 전환)
function SortableTh({ label, columnKey, sortKey, direction, onChange }) {
  const active = sortKey === columnKey;
  const nextDirection = active && direction === 'asc' ? 'desc' : 'asc';

  return (
    <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`th-sort ${active ? 'active' : ''}`}
        onClick={() => onChange(columnKey, active ? nextDirection : 'asc')}
      >
        {label}
        <span aria-hidden="true">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

function StateMessage({ type = 'empty', children }) {
  return <div className={`qnet-state qnet-state-${type}`}>{children}</div>;
}

// ---------------- 메인 컴포넌트 ----------------

function QnetSearch() {
  const [keyword, setKeyword] = useState('');
  const [year, setYear] = useState('2020');
  const [grade, setGrade] = useState('30');
  const [examType, setExamType] = useState('all');

  const [items, setItems] = useState([]);
  const [termItems, setTermItems] = useState([]);

  const [loading, setLoading] = useState(false);
  const [passError, setPassError] = useState('');
  const [termError, setTermError] = useState('');
  const [searched, setSearched] = useState(false);
  const [searchedGrade, setSearchedGrade] = useState('30');

  const [tab, setTab] = useState('pass');
  const [passSort, setPassSort] = useState({ key: 'passRate', direction: 'asc' });
  const [termSort, setTermSort] = useState({ key: 'averageDays', direction: 'asc' });

  // 시험일정
  const [scheduleYear, setScheduleYear] = useState(String(new Date().getFullYear()));
  const [qualType, setQualType] = useState('T');
  const [scheduleGrade, setScheduleGrade] = useState('all');
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [schedule, setSchedule] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  const fetchJson = async (path, params) => {
    const response = await fetch(`${API_BASE}${path}?${new URLSearchParams(params)}`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || result.message || 'API 조회 실패');
    }
    return Array.isArray(result.items) ? result.items : [];
  };

  const searchCertificates = async (e) => {
    e.preventDefault();

    setLoading(true);
    setSearched(false);
    setPassError('');
    setTermError('');
    setItems([]);
    setTermItems([]);

    const params = { keyword, year, grade };

    try {
      // Q-Net 서버 부담을 줄이기 위해 합격률 -> 취득소요기간 순서로 요청
      const [passResult] = await Promise.allSettled([fetchJson('/api/qnet/pass-rate', params)]);
      const [termResult] = await Promise.allSettled([
        fetchJson('/api/qnet/acquisition-term', params)
      ]);

      if (passResult.status === 'fulfilled') setItems(passResult.value);
      else setPassError(passResult.reason.message);

      if (termResult.status === 'fulfilled') setTermItems(termResult.value);
      else setTermError(termResult.reason.message);

      setSearchedGrade(grade);
      setSearched(true);
      if (tab === 'schedule') setTab('pass');
    } catch (error) {
      setPassError(error.message);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedule = async (nextYear = scheduleYear, nextQualType = qualType) => {
    setScheduleLoading(true);
    setScheduleError('');

    try {
      const result = await fetchJson('/api/qnet/exam-schedule', {
        year: nextYear,
        qualgbCd: nextQualType
      });
      setSchedule(result);
    } catch (error) {
      setSchedule([]);
      setScheduleError(error.message);
    } finally {
      setScheduleLoaded(true);
      setScheduleLoading(false);
    }
  };

  const openTab = (nextTab) => {
    setTab(nextTab);
    if (nextTab === 'schedule' && !scheduleLoaded && !scheduleLoading) {
      loadSchedule();
    }
  };

  // 화면에 보여줄 목록
  const visibleItems = sortItems(
    items.filter((item) => examType === 'all' || item.examType === examType),
    PASS_SORTS[passSort.key],
    passSort.direction
  );

  const visibleTermItems = sortItems(termItems, TERM_SORTS[termSort.key], termSort.direction);

  const today = todayString();
  const scheduleWithStatus = schedule
    .filter((round) => scheduleGrade === 'all' || round.grade === scheduleGrade)
    .map((round) => ({ ...round, status: getRoundStatus(round, today) }))
    .filter((round) => !upcomingOnly || round.status.type !== 'done');

  const scheduleGrades = [...new Set(schedule.map((round) => round.grade))];

  const maxRate = Math.max(...visibleItems.map((item) => parseFloat(item.passRate) || 0), 1);

  return (
    <div className="qnet-search">
      <div className="qnet-hero">
        <span className="qnet-eyebrow">Q-Net 공공데이터</span>
        <h2>국가기술자격 정보</h2>
        <p>자격증별 합격률, 평균 취득소요기간, 시험일정을 한곳에서 확인하세요.</p>
      </div>

      <form onSubmit={searchCertificates} className="qnet-form">
        <label className="qnet-field qnet-field-wide">
          <span>자격증 이름</span>
          <input
            type="text"
            placeholder="예: 정보처리기사"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </label>

        <label className="qnet-field">
          <span>등급</span>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="qnet-field qnet-field-year">
          <span>조회 연도</span>
          <input
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>

        <button type="submit" className="qnet-submit" disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      <div className="qnet-tabs" role="tablist" aria-label="자격증 정보 종류">
        {[
          { key: 'pass', label: '합격률', count: searched ? visibleItems.length : null },
          { key: 'term', label: '취득소요기간', count: searched ? termItems.length : null },
          { key: 'schedule', label: '시험일정', count: null }
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? 'active' : ''}
            onClick={() => openTab(item.key)}
          >
            {item.label}
            {item.count !== null && <span className="qnet-count">{item.count}</span>}
          </button>
        ))}
      </div>

      {loading && tab !== 'schedule' && (
        <StateMessage type="loading">
          <span className="qnet-spinner" aria-hidden="true" />
          Q-Net 데이터를 조회하고 있습니다. 전체 데이터를 받아오느라 시간이 걸릴 수 있어요.
        </StateMessage>
      )}

      {/* 합격률 */}
      {tab === 'pass' && !loading && (
        <section role="tabpanel" className="qnet-panel">
          {!searched ? (
            <StateMessage>자격증 이름, 등급, 연도를 고르고 검색해 주세요.</StateMessage>
          ) : passError ? (
            <StateMessage type="error">합격률 조회 오류: {passError}</StateMessage>
          ) : (
            <>
              <div className="qnet-toolbar">
                <div className="qnet-toolbar-left">
                  <strong>
                    {gradeLabel(searchedGrade)} {visibleItems.length}건
                  </strong>
                  <div className="qnet-chips" role="group" aria-label="시험 구분">
                    {[
                      { value: 'all', label: '전체' },
                      { value: '필기', label: '필기' },
                      { value: '실기', label: '실기' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={examType === option.value ? 'active' : ''}
                        aria-pressed={examType === option.value}
                        onClick={() => setExamType(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <SortControls
                  sorts={PASS_SORTS}
                  sortKey={passSort.key}
                  direction={passSort.direction}
                  onChange={(key, direction) => setPassSort({ key, direction })}
                />
              </div>

              {visibleItems.length === 0 ? (
                <StateMessage>해당 조건의 합격률 데이터가 없습니다.</StateMessage>
              ) : (
                <div className="qnet-table-wrap">
                  <table className="qnet-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="자격증명"
                          columnKey="name"
                          sortKey={passSort.key}
                          direction={passSort.direction}
                          onChange={(key, direction) => setPassSort({ key, direction })}
                        />
                        <th>시험</th>
                        <th>연도</th>
                        <SortableTh
                          label="응시자"
                          columnKey="applicants"
                          sortKey={passSort.key}
                          direction={passSort.direction}
                          onChange={(key, direction) => setPassSort({ key, direction })}
                        />
                        <SortableTh
                          label="합격자"
                          columnKey="passed"
                          sortKey={passSort.key}
                          direction={passSort.direction}
                          onChange={(key, direction) => setPassSort({ key, direction })}
                        />
                        <SortableTh
                          label="합격률"
                          columnKey="passRate"
                          sortKey={passSort.key}
                          direction={passSort.direction}
                          onChange={(key, direction) => setPassSort({ key, direction })}
                        />
                      </tr>
                    </thead>

                    <tbody>
                      {visibleItems.map((item, index) => {
                        const rate = parseFloat(item.passRate);
                        return (
                          <tr key={`${item.name}-${item.examType}-${item.year}-${index}`}>
                            <td className="cell-name">{item.name}</td>
                            <td>
                              <span className={`exam-badge exam-${item.examType === '실기' ? 'prac' : 'doc'}`}>
                                {item.examType}
                              </span>
                            </td>
                            <td>{item.year}</td>
                            <td className="cell-num">{formatNumber(item.applicants)}</td>
                            <td className="cell-num">{formatNumber(item.passed)}</td>
                            <td className="cell-rate">
                              <div className="rate-wrap">
                                <div className="rate-bar" aria-hidden="true">
                                  <span
                                    style={{
                                      width: `${Number.isFinite(rate) ? (rate / maxRate) * 100 : 0}%`
                                    }}
                                  />
                                </div>
                                <strong>{item.passRate}</strong>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="qnet-note">※ 합격률은 해당 연도의 회차를 통합해 계산한 값입니다.</p>
            </>
          )}
        </section>
      )}

      {/* 취득소요기간 */}
      {tab === 'term' && !loading && (
        <section role="tabpanel" className="qnet-panel">
          {!searched ? (
            <StateMessage>자격증 이름, 등급, 연도를 고르고 검색해 주세요.</StateMessage>
          ) : termError ? (
            <StateMessage type="error">취득소요기간 조회 오류: {termError}</StateMessage>
          ) : (
            <>
              <div className="qnet-toolbar">
                <div className="qnet-toolbar-left">
                  <strong>
                    {gradeLabel(searchedGrade)} {visibleTermItems.length}건
                  </strong>
                </div>

                <SortControls
                  sorts={TERM_SORTS}
                  sortKey={termSort.key}
                  direction={termSort.direction}
                  onChange={(key, direction) => setTermSort({ key, direction })}
                />
              </div>

              {visibleTermItems.length === 0 ? (
                <StateMessage>해당 조건의 취득소요기간 데이터가 없습니다.</StateMessage>
              ) : (
                <div className="qnet-table-wrap">
                  <table className="qnet-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="자격증명"
                          columnKey="name"
                          sortKey={termSort.key}
                          direction={termSort.direction}
                          onChange={(key, direction) => setTermSort({ key, direction })}
                        />
                        <th>등급</th>
                        <th>통계연도</th>
                        <SortableTh
                          label="누계 평균 취득소요기간"
                          columnKey="averageDays"
                          sortKey={termSort.key}
                          direction={termSort.direction}
                          onChange={(key, direction) => setTermSort({ key, direction })}
                        />
                      </tr>
                    </thead>

                    <tbody>
                      {visibleTermItems.map((item, index) => (
                        <tr key={`${item.name}-${item.year}-${index}`}>
                          <td className="cell-name">{item.name}</td>
                          <td>{item.grade}</td>
                          <td>{item.year}</td>
                          <td className="cell-num">
                            <strong>{formatDays(item.averageDays)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="qnet-note">
                ※ 평균 취득소요기간은 Q-Net의 자격 취득 통계이며, 개인의 실제 공부 기간과는 다를 수 있습니다.
              </p>
            </>
          )}
        </section>
      )}

      {/* 시험일정 */}
      {tab === 'schedule' && (
        <section role="tabpanel" className="qnet-panel">
          <div className="qnet-toolbar">
            <div className="qnet-toolbar-left qnet-schedule-filters">
              <label className="qnet-inline-field">
                <span>시행 연도</span>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={scheduleYear}
                  onChange={(e) => setScheduleYear(e.target.value)}
                />
              </label>

              <label className="qnet-inline-field">
                <span>자격 구분</span>
                <select
                  value={qualType}
                  onChange={(e) => {
                    setQualType(e.target.value);
                    setScheduleGrade('all');
                    loadSchedule(scheduleYear, e.target.value);
                  }}
                >
                  <option value="T">국가기술자격</option>
                  <option value="S">국가전문자격</option>
                </select>
              </label>

              <button
                type="button"
                className="qnet-secondary"
                disabled={scheduleLoading}
                onClick={() => loadSchedule(scheduleYear, qualType)}
              >
                {scheduleLoading ? '불러오는 중...' : '일정 불러오기'}
              </button>
            </div>

            <label className="qnet-toggle">
              <input
                type="checkbox"
                checked={upcomingOnly}
                onChange={(e) => setUpcomingOnly(e.target.checked)}
              />
              끝난 일정 숨기기
            </label>
          </div>

          {scheduleGrades.length > 1 && (
            <div className="qnet-chips qnet-grade-chips" role="group" aria-label="등급">
              {['all', ...scheduleGrades].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={scheduleGrade === value ? 'active' : ''}
                  aria-pressed={scheduleGrade === value}
                  onClick={() => setScheduleGrade(value)}
                >
                  {value === 'all' ? '전체 등급' : value}
                </button>
              ))}
            </div>
          )}

          {scheduleLoading ? (
            <StateMessage type="loading">
              <span className="qnet-spinner" aria-hidden="true" />
              시험일정을 불러오고 있습니다...
            </StateMessage>
          ) : scheduleError ? (
            <StateMessage type="error">시험일정 조회 오류: {scheduleError}</StateMessage>
          ) : !scheduleLoaded ? (
            <StateMessage>연도를 고르고 일정을 불러와 주세요.</StateMessage>
          ) : scheduleWithStatus.length === 0 ? (
            <StateMessage>
              {upcomingOnly && schedule.length > 0
                ? '남은 일정이 없습니다. "끝난 일정 숨기기"를 해제하면 지난 일정도 볼 수 있어요.'
                : '해당 조건의 시험일정이 없습니다.'}
            </StateMessage>
          ) : (
            <div className="schedule-list">
              {scheduleWithStatus.map((round, index) => (
                <article
                  key={`${round.year}-${round.round}-${round.grade}-${index}`}
                  className={`schedule-card status-${round.status.type}`}
                >
                  <header className="schedule-card-head">
                    <div>
                      <span className="schedule-grade">{round.grade}</span>
                      <h3>{round.description || `${round.year}년 제${round.round}회`}</h3>
                    </div>
                    <span className={`schedule-status status-${round.status.type}`}>
                      {round.status.text}
                    </span>
                  </header>

                  <ol className="schedule-steps">
                    {SCHEDULE_STEPS.map((step) => {
                      const start = round[step.start];
                      const end = round[step.end] || start;
                      const state = !start
                        ? 'none'
                        : today > end
                          ? 'past'
                          : round.status.stepKey === step.key
                            ? 'current'
                            : 'future';

                      return (
                        <li key={step.key} className={`step-${state}`}>
                          <span className="step-label">{step.label}</span>
                          <span className="step-date">{rangeText(start, round[step.end])}</span>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              ))}
            </div>
          )}

          <p className="qnet-note">
            ※ 한국산업인력공단 국가자격 시험일정 조회 서비스 기준이며, 종목에 따라 실제 일정이 다를 수 있으니
            접수 전 Q-Net에서 꼭 확인하세요.
          </p>
        </section>
      )}
    </div>
  );
}

export default QnetSearch;
