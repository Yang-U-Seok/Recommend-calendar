
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

const PASS_SORTS = {
  name: {
    label: '가나다순',
    type: 'text',
    get: (item) => item.name
  },
  passRate: {
    label: '합격률',
    type: 'number',
    get: (item) => parseFloat(item.passRate)
  },
  applicants: {
    label: '응시자 수',
    type: 'number',
    get: (item) => Number(item.applicants)
  },
  passed: {
    label: '합격자 수',
    type: 'number',
    get: (item) => Number(item.passed)
  }
};

const TERM_SORTS = {
  name: {
    label: '가나다순',
    type: 'text',
    get: (item) => item.name
  },
  averageDays: {
    label: '취득소요기간',
    type: 'number',
    get: (item) =>
      item.averageDays == null || item.averageDays === ''
        ? NaN
        : Number(item.averageDays)
  }
};

const TECH_STEPS = [
  { key: 'docReg', label: '필기 접수', start: 'docRegStart', end: 'docRegEnd' },
  { key: 'docExam', label: '필기 시험', start: 'docExamStart', end: 'docExamEnd' },
  { key: 'docPass', label: '필기 발표', start: 'docPass', end: 'docPass' },
  { key: 'pracReg', label: '실기 접수', start: 'pracRegStart', end: 'pracRegEnd' },
  { key: 'pracExam', label: '실기 시험', start: 'pracExamStart', end: 'pracExamEnd' },
  { key: 'pracPass', label: '최종 발표', start: 'pracPass', end: 'pracPass' }
];

const PROFESSIONAL_STEPS = [
  { key: 'reg', label: '원서접수', start: 'regStart', end: 'regEnd' },
  { key: 'exam', label: '시험', start: 'examStart', end: 'examEnd' },
  { key: 'pass', label: '합격자 발표', start: 'passStart', end: 'passEnd' }
];

function sortItems(items, definition, direction) {
  const sign = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const av = definition.get(a);
    const bv = definition.get(b);

    if (definition.type === 'number') {
      const aMissing = !Number.isFinite(av);
      const bMissing = !Number.isFinite(bv);

      if (aMissing !== bMissing) {
        return aMissing ? 1 : -1;
      }

      if (!aMissing && av !== bv) {
        return (av - bv) * sign;
      }
    } else {
      const diff = String(av ?? '').localeCompare(
        String(bv ?? ''),
        'ko'
      );

      if (diff !== 0) return diff * sign;
    }

    return String(a.name ?? '').localeCompare(
      String(b.name ?? ''),
      'ko'
    );
  });
}

function formatNumber(value) {
  if (value == null || value === '') return '-';

  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString('ko-KR')
    : '-';
}

function formatDays(value) {
  if (value == null || value === '') return '-';

  const number = Number(value);

  return Number.isFinite(number)
    ? `${number.toLocaleString('ko-KR', {
        maximumFractionDigits: 1
      })}일`
    : '-';
}

function formatDate(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  if (digits.length !== 8) return '';

  return (
    digits.slice(0, 4) + '-' +
    digits.slice(4, 6) + '-' +
    digits.slice(6, 8)
  );
}

function shortDate(value) {
  return value ? value.slice(5).replace('-', '.') : '-';
}

function rangeText(start, end) {
  if (!start) return '-';

  if (!end || start === end) {
    return shortDate(start);
  }

  return `${shortDate(start)} ~ ${shortDate(end)}`;
}

function todayString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  return (
    `${now.getFullYear()}-` +
    `${pad(now.getMonth() + 1)}-` +
    pad(now.getDate())
  );
}

function daysBetween(from, to) {
  return Math.round(
    (new Date(to) - new Date(from)) / 86400000
  );
}

function getScheduleSteps(round) {
  return round.qualType === '국가전문자격'
    ? PROFESSIONAL_STEPS
    : TECH_STEPS;
}

function getRoundStatus(round, today) {
  const steps = getScheduleSteps(round)
    .filter((step) => round[step.start]);

  for (const step of steps) {
    const start = round[step.start];
    const end = round[step.end] || start;

    if (today >= start && today <= end) {
      return {
        type: 'now',
        stepKey: step.key,
        text: `${step.label} 진행 중`
      };
    }

    if (today < start) {
      return {
        type: 'next',
        stepKey: step.key,
        text: `${step.label} D-${daysBetween(today, start)}`
      };
    }
  }

  return {
    type: 'done',
    stepKey: null,
    text: '일정 종료'
  };
}

function mergeScheduleRounds(items, qualificationType) {
  // 국가전문자격은 1차/2차 구분을 유지
  if (qualificationType !== 'technical') {
    return items;
  }

  const grouped = new Map();

  for (const item of items) {
    // 같은 연도 + 같은 회차만 통합
    const key = `${item.year}-${item.round}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...item,
        docRegPeriods: []
      });
    }

    const target = grouped.get(key);

    // 필기 접수기간은 서로 다르면 모두 저장
    if (item.docRegStart) {
      const exists = target.docRegPeriods.some(
        (period) =>
          period.start === item.docRegStart &&
          period.end === item.docRegEnd
      );

      if (!exists) {
        target.docRegPeriods.push({
          start: item.docRegStart,
          end: item.docRegEnd
        });
      }
    }
  }

  return [...grouped.values()].map((item) => ({
    ...item,
    docRegPeriods: item.docRegPeriods.sort(
      (a, b) => a.start.localeCompare(b.start)
    )
  }));
}

// API 원본 데이터를 기존 일정 카드 형식으로 변환
function normalizeScheduleItem(item, result) {
  const date = formatDate;
  const professional =
    result.qualificationType === 'professional';

  if (professional) {
    return {
      ...item,
      name: result.qualification,
      qualType: '국가전문자격',
      year: result.year,
      round: item.description || '',
      regStart: date(item.examregstartdt),
      regEnd: date(item.examregenddt),
      examStart: date(item.examstartdt),
      examEnd: date(item.examenddt),
      passStart: date(item.passstartdt),
      passEnd: date(item.passenddt)
    };
  }

  return {
    ...item,
    name: result.qualification,
    qualType: '국가기술자격',
    year: result.year,
    round: item.implSeq || '',
    docRegStart: date(item.docRegStartDt),
    docRegEnd: date(item.docRegEndDt),
    docExamStart: date(item.docExamStartDt),
    docExamEnd: date(item.docExamEndDt),
    docPass: date(item.docPassDt),
    pracRegStart: date(item.pracRegStartDt),
    pracRegEnd: date(item.pracRegEndDt),
    pracExamStart: date(item.pracExamStartDt),
    pracExamEnd: date(item.pracExamEndDt),
    pracPass: date(item.pracPassDt)
  };
}

function StateMessage({ type = 'empty', children }) {
  return (
    <div className={`qnet-state qnet-state-${type}`}>
      {children}
    </div>
  );
}

function SortControls({
  sorts,
  sortKey,
  direction,
  onChange
}) {
  return (
    <div className="qnet-sort">
      <label>
        <span className="sr-only">정렬 기준</span>
        <select
          value={sortKey}
          onChange={(e) =>
            onChange(e.target.value, direction)
          }
        >
          {Object.entries(sorts).map(([key, def]) => (
            <option key={key} value={key}>
              {def.label}
            </option>
          ))}
        </select>
      </label>

      <div className="qnet-direction">
        {[
          { value: 'asc', label: '오름차순 ↑' },
          { value: 'desc', label: '내림차순 ↓' }
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              direction === option.value ? 'active' : ''
            }
            onClick={() =>
              onChange(sortKey, option.value)
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  columnKey,
  sortKey,
  direction,
  onChange
}) {
  const active = sortKey === columnKey;

  return (
    <th>
      <button
        type="button"
        className={`th-sort ${active ? 'active' : ''}`}
        onClick={() =>
          onChange(
            columnKey,
            active && direction === 'asc'
              ? 'desc'
              : 'asc'
          )
        }
      >
        {label}
        <span>
          {active
            ? direction === 'asc' ? '▲' : '▼'
            : '↕'}
        </span>
      </button>
    </th>
  );
}

function QnetSearch() {
  // 합격률 및 취득소요기간
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

  const [passSort, setPassSort] = useState({
    key: 'passRate',
    direction: 'asc'
  });

  const [termSort, setTermSort] = useState({
    key: 'averageDays',
    direction: 'asc'
  });

  // 시험일정
  const [scheduleYear, setScheduleYear] = useState(
    String(new Date().getFullYear())
  );

  const [scheduleKeyword, setScheduleKeyword] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  const [schedule, setSchedule] = useState([]);
  const [scheduleMatches, setScheduleMatches] = useState([]);

  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  // 합격률/취득소요기간 API
  async function fetchJson(path, params) {
    const query = new URLSearchParams(params);

    const response = await fetch(
      `${API_BASE}${path}?${query}`
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || result.error || 'API 조회 실패'
      );
    }

    return Array.isArray(result.items)
      ? result.items
      : [];
  }

  async function searchCertificates(e) {
    e.preventDefault();

    setLoading(true);
    setSearched(false);
    setPassError('');
    setTermError('');
    setItems([]);
    setTermItems([]);

    const params = { keyword, year, grade };

    try {
      const passResult = await Promise.allSettled([
        fetchJson('/api/qnet/pass-rate', params)
      ]);

      const termResult = await Promise.allSettled([
        fetchJson('/api/qnet/acquisition-term', params)
      ]);

      if (passResult[0].status === 'fulfilled') {
        setItems(passResult[0].value);
      } else {
        setPassError(passResult[0].reason.message);
      }

      if (termResult[0].status === 'fulfilled') {
        setTermItems(termResult[0].value);
      } else {
        setTermError(termResult[0].reason.message);
      }

      setSearchedGrade(grade);
      setSearched(true);
    } catch (error) {
      setPassError(error.message);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  // 시험일정 부분 검색 + 후보 선택
  async function loadSchedule(
    nextYear = scheduleYear,
    nextKeyword = scheduleKeyword
  ) {
    const search = String(nextKeyword).trim();

    if (!/^\d{4}$/.test(String(nextYear))) {
      setScheduleError('연도는 네 자리로 입력해주세요.');
      setScheduleLoaded(true);
      return;
    }

    if (!search) {
      setScheduleError('자격증 이름을 입력해주세요.');
      setScheduleLoaded(true);
      return;
    }

    setScheduleLoading(true);
    setScheduleError('');
    setSchedule([]);
    setScheduleMatches([]);
    setScheduleLoaded(false);

    try {
      const params = new URLSearchParams({
        year: String(nextYear),
        keyword: search
      });

      const response = await fetch(
        `${API_BASE}/api/qnet/exam-schedule?${params}`
      );

      // 시험일정은 items와 matches를 함께 확인해야 함
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
          result.error ||
          '시험일정 조회 실패'
        );
      }

      // 검색 결과가 여러 개면 선택 버튼 표시
      if (result.selectionRequired) {
        setScheduleMatches(
          Array.isArray(result.matches)
            ? result.matches
            : []
        );
        return;
      }

      // 정확히 일치하거나 후보 선택 후 일정 조회
      const rawItems = Array.isArray(result.items)
        ? result.items
        : [];

      const normalized = rawItems.map((item) =>
  normalizeScheduleItem(item, result)
);

const merged = mergeScheduleRounds(
  normalized,
  result.qualificationType
);

setSchedule(merged);
    } catch (error) {
      setScheduleError(error.message);
    } finally {
      setScheduleLoaded(true);
      setScheduleLoading(false);
    }
  }

  const visibleItems = sortItems(
    items.filter(
      (item) =>
        examType === 'all' ||
        item.examType === examType
    ),
    PASS_SORTS[passSort.key],
    passSort.direction
  );

  const visibleTermItems = sortItems(
    termItems,
    TERM_SORTS[termSort.key],
    termSort.direction
  );

  const today = todayString();

  const scheduleWithStatus = schedule
    .map((round) => ({
      ...round,
      status: getRoundStatus(round, today)
    }))
    .filter(
      (round) =>
        !upcomingOnly ||
        round.status.type !== 'done'
    );

  const maxRate = Math.max(
    ...visibleItems.map(
      (item) => parseFloat(item.passRate) || 0
    ),
    1
  );

  return (
    <div className="qnet-search">
      <div className="qnet-hero">
        <span className="qnet-eyebrow">
          Q-Net 공공데이터
        </span>
        <h2>국가자격 정보</h2>
        <p>
          자격증별 합격률, 평균 취득소요기간,
          시험일정을 한곳에서 확인하세요.
        </p>
      </div>

      {/* 합격률 및 취득소요기간 검색 */}
      <form
        onSubmit={searchCertificates}
        className="qnet-form"
      >
        <label className="qnet-field qnet-field-wide">
          <span>자격증 이름</span>
          <input
            type="text"
            placeholder="예: 정보처리기사"
            value={keyword}
            onChange={(e) =>
              setKeyword(e.target.value)
            }
          />
        </label>

        <label className="qnet-field">
          <span>등급</span>
          <select
            value={grade}
            onChange={(e) =>
              setGrade(e.target.value)
            }
          >
            {GRADE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
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
            onChange={(e) =>
              setYear(e.target.value)
            }
          />
        </label>

        <button
          type="submit"
          className="qnet-submit"
          disabled={loading}
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {/* 탭 */}
      <div
        className="qnet-tabs"
        role="tablist"
        aria-label="자격증 정보 종류"
      >
        {[
          {
            key: 'pass',
            label: '합격률',
            count: searched ? visibleItems.length : null
          },
          {
            key: 'term',
            label: '취득소요기간',
            count: searched ? termItems.length : null
          },
          {
            key: 'schedule',
            label: '시험일정',
            count: null
          }
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? 'active' : ''}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.count !== null && (
              <span className="qnet-count">
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && tab !== 'schedule' && (
        <StateMessage type="loading">
          <span
            className="qnet-spinner"
            aria-hidden="true"
          />
          Q-Net 데이터를 조회하고 있습니다...
        </StateMessage>
      )}

      {/* 합격률 탭 */}
      {tab === 'pass' && !loading && (
        <section
          role="tabpanel"
          className="qnet-panel"
        >
          {!searched ? (
            <StateMessage>
              자격증 이름, 등급, 연도를 고르고
              검색해 주세요.
            </StateMessage>
          ) : passError ? (
            <StateMessage type="error">
              합격률 조회 오류: {passError}
            </StateMessage>
          ) : (
            <>
              <div className="qnet-toolbar">
                <div className="qnet-toolbar-left">
                  <strong>
                    {GRADE_OPTIONS.find(
                      (g) => g.value === searchedGrade
                    )?.label} {visibleItems.length}건
                  </strong>

                  <div className="qnet-chips">
                    {[
                      { value: 'all', label: '전체' },
                      { value: '필기', label: '필기' },
                      { value: '실기', label: '실기' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          examType === option.value
                            ? 'active'
                            : ''
                        }
                        onClick={() =>
                          setExamType(option.value)
                        }
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
                  onChange={(key, direction) =>
                    setPassSort({ key, direction })
                  }
                />
              </div>

              {visibleItems.length === 0 ? (
                <StateMessage>
                  해당 조건의 합격률 데이터가 없습니다.
                </StateMessage>
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
                          onChange={(key, direction) =>
                            setPassSort({ key, direction })
                          }
                        />
                        <th>시험</th>
                        <th>연도</th>
                        {[
                          ['applicants', '응시자'],
                          ['passed', '합격자'],
                          ['passRate', '합격률']
                        ].map(([key, label]) => (
                          <SortableTh
                            key={key}
                            label={label}
                            columnKey={key}
                            sortKey={passSort.key}
                            direction={passSort.direction}
                            onChange={(k, direction) =>
                              setPassSort({
                                key: k,
                                direction
                              })
                            }
                          />
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {visibleItems.map((item, index) => {
                        const rate = parseFloat(
                          item.passRate
                        );

                        return (
                          <tr
                            key={`${item.name}-${item.examType}-${index}`}
                          >
                            <td className="cell-name">
                              {item.name}
                            </td>
                            <td>
                              <span
                                className={`exam-badge exam-${
                                  item.examType === '실기'
                                    ? 'prac'
                                    : 'doc'
                                }`}
                              >
                                {item.examType}
                              </span>
                            </td>
                            <td>{item.year}</td>
                            <td className="cell-num">
                              {formatNumber(item.applicants)}
                            </td>
                            <td className="cell-num">
                              {formatNumber(item.passed)}
                            </td>
                            <td className="cell-rate">
                              <div className="rate-wrap">
                                <div className="rate-bar">
                                  <span
                                    style={{
                                      width: `${
                                        Number.isFinite(rate)
                                          ? (rate / maxRate) * 100
                                          : 0
                                      }%`
                                    }}
                                  />
                                </div>
                                <strong>
                                  {item.passRate}
                                </strong>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="qnet-note">
                ※ 합격률은 해당 연도의 회차를
                통합해 계산한 값입니다.
              </p>
            </>
          )}
        </section>
      )}

      {/* 취득소요기간 탭 */}
      {tab === 'term' && !loading && (
        <section
          role="tabpanel"
          className="qnet-panel"
        >
          {!searched ? (
            <StateMessage>
              자격증 이름, 등급, 연도를 고르고
              검색해 주세요.
            </StateMessage>
          ) : termError ? (
            <StateMessage type="error">
              취득소요기간 조회 오류: {termError}
            </StateMessage>
          ) : (
            <>
              <div className="qnet-toolbar">
                <div className="qnet-toolbar-left">
                  <strong>
                    {GRADE_OPTIONS.find(
                      (g) => g.value === searchedGrade
                    )?.label} {visibleTermItems.length}건
                  </strong>
                </div>

                <SortControls
                  sorts={TERM_SORTS}
                  sortKey={termSort.key}
                  direction={termSort.direction}
                  onChange={(key, direction) =>
                    setTermSort({ key, direction })
                  }
                />
              </div>

              {visibleTermItems.length === 0 ? (
                <StateMessage>
                  해당 조건의 취득소요기간 데이터가
                  없습니다.
                </StateMessage>
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
                          onChange={(key, direction) =>
                            setTermSort({ key, direction })
                          }
                        />
                        <th>등급</th>
                        <th>통계연도</th>
                        <SortableTh
                          label="누계 평균 취득소요기간"
                          columnKey="averageDays"
                          sortKey={termSort.key}
                          direction={termSort.direction}
                          onChange={(key, direction) =>
                            setTermSort({ key, direction })
                          }
                        />
                      </tr>
                    </thead>

                    <tbody>
                      {visibleTermItems.map(
                        (item, index) => (
                          <tr
                            key={`${item.name}-${item.year}-${index}`}
                          >
                            <td className="cell-name">
                              {item.name}
                            </td>
                            <td>{item.grade}</td>
                            <td>{item.year}</td>
                            <td className="cell-num">
                              <strong>
                                {formatDays(
                                  item.averageDays
                                )}
                              </strong>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="qnet-note">
                ※ 평균 취득소요기간은 Q-Net의
                자격 취득 통계이며, 개인의 실제
                공부 기간과 다를 수 있습니다.
              </p>
            </>
          )}
        </section>
      )}

      {/* 시험일정 탭 */}
      {tab === 'schedule' && (
        <section
          role="tabpanel"
          className="qnet-panel"
        >
          <div className="qnet-toolbar">
            <div className="qnet-toolbar-left qnet-schedule-filters">

              <label className="qnet-inline-field">
                <span>시행 연도</span>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={scheduleYear}
                  onChange={(e) =>
                    setScheduleYear(e.target.value)
                  }
                />
              </label>

              <label className="qnet-inline-field">
                <span>자격증명 검색</span>
                <input
                  type="search"
                  value={scheduleKeyword}
                  onChange={(e) =>
                    setScheduleKeyword(e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadSchedule();
                    }
                  }}
                  placeholder="예: 정보, 전기, 공인중개"
                />
              </label>

              <button
                type="button"
                className="qnet-secondary"
                disabled={scheduleLoading}
                onClick={() =>
                  loadSchedule(
                    scheduleYear,
                    scheduleKeyword
                  )
                }
              >
                {scheduleLoading
                  ? '불러오는 중...'
                  : '일정 불러오기'}
              </button>
            </div>

            <label className="qnet-toggle">
              <input
                type="checkbox"
                checked={upcomingOnly}
                onChange={(e) =>
                  setUpcomingOnly(e.target.checked)
                }
              />
              끝난 일정 숨기기
            </label>
          </div>

          {/* 부분 검색 결과 후보 */}
          {!scheduleLoading &&
            scheduleMatches.length > 0 && (
              <div
                className="qnet-schedule-matches"
                style={{ marginBottom: 20 }}
              >
                <strong>
                  검색된 자격증을 선택하세요
                  ({scheduleMatches.length}개)
                </strong>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 12
                  }}
                >
                  {scheduleMatches.map((match) => (
                    <button
                      key={`${match.type}-${
                        match.jmCd ||
                        match.seriesCd ||
                        match.name
                      }`}
                      type="button"
                      className="qnet-secondary"
                      onClick={() => {
                        setScheduleKeyword(match.name);
                        loadSchedule(
                          scheduleYear,
                          match.name
                        );
                      }}
                    >
                      {match.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* 조회 상태 */}
          {scheduleLoading ? (
            <StateMessage type="loading">
              <span
                className="qnet-spinner"
                aria-hidden="true"
              />
              시험일정을 불러오고 있습니다...
            </StateMessage>
          ) : scheduleError ? (
            <StateMessage type="error">
              시험일정 조회 오류: {scheduleError}
            </StateMessage>
          ) : scheduleMatches.length > 0 ? (
            null
          ) : !scheduleLoaded ? (
            <StateMessage>
              연도를 고르고 일정을 불러와 주세요.
            </StateMessage>
          ) : scheduleWithStatus.length === 0 ? (
            <StateMessage>
              {upcomingOnly && schedule.length > 0
                ? '남은 일정이 없습니다. "끝난 일정 숨기기"를 해제하면 지난 일정도 볼 수 있어요.'
                : '검색어에 해당하는 시험일정이 없습니다. 자격증명과 조회 연도를 확인해주세요.'}
            </StateMessage>
          ) : (
            <div className="schedule-list">
              {scheduleWithStatus.map(
                (round, index) => (
                  <article
                    key={`${round.year}-${round.round}-${index}`}
                    className={`schedule-card status-${round.status.type}`}
                  >
                    <header className="schedule-card-head">
                      <div>
                        <span className="schedule-grade">
                          {round.name ||
                            round.grade ||
                            '국가자격'}
                        </span>

                        <h3>
                          {round.description ||
                            `${round.year}년 제${round.round}회`}
                        </h3>
                      </div>

                      <span
                        className={`schedule-status status-${round.status.type}`}
                      >
                        {round.status.text}
                      </span>
                    </header>

                    <ol className="schedule-steps">
                      {getScheduleSteps(round).map(
                        (step) => {
                          const start =
                            round[step.start];

                          const end =
                            round[step.end] || start;

                          const state = !start
                            ? 'none'
                            : today > end
                              ? 'past'
                              : round.status.stepKey ===
                                  step.key
                                ? 'current'
                                : 'future';

                          return (
                            <li
                              key={step.key}
                              className={`step-${state}`}
                            >
                              <span className="step-label">
                                {step.label}
                              </span>

                             
<span className="step-date">
  {step.key === 'docReg' &&
  round.docRegPeriods?.length > 0 ? (
    <span
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}
    >
      {round.docRegPeriods.map((period, index) => (
        <span key={`${period.start}-${period.end}-${index}`}>
          {rangeText(period.start, period.end)}
        </span>
      ))}
    </span>
  ) : (
    rangeText(start, round[step.end])
  )}
</span>

                            </li>
                          );
                        }
                      )}
                    </ol>
                  </article>
                )
              )}
            </div>
          )}

          <p className="qnet-note">
            ※ 한국산업인력공단 국가자격 시험일정
            조회 서비스 기준이며, 종목에 따라
            실제 일정이 다를 수 있으니 접수 전
            Q-Net에서 꼭 확인하세요.
          </p>
        </section>
      )}
    </div>
  );
}

export default QnetSearch;
