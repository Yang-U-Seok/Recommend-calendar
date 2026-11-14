
import { useEffect, useMemo, useState } from 'react';
import './Calendar.css';
import './CalendarPolish.css';

const API_BASE = 'http://localhost:3001';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const FIELDS = [
  ['docRegStartDt', 'docRegEndDt', '필기 원서접수', 'registration'],
  ['docExamStartDt', 'docExamEndDt', '필기시험', 'exam'],
  ['docPassDt', 'docPassDt', '필기 합격 발표', 'result'],
  ['pracRegStartDt', 'pracRegEndDt', '실기 원서접수', 'registration'],
  ['pracExamStartDt', 'pracExamEndDt', '실기시험', 'exam'],
  ['pracPassDt', 'pracPassDt', '최종 합격 발표', 'result']
];

const COLOR = {
  registration: '#2563eb',
  exam: '#7c3aed',
  result: '#059669',
  study: '#16a34a'
};

const EXTERNAL_CERTIFICATES = [
  '정보보안기사',
  '정보보안산업기사'
];

const panelStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 18,
  padding: 24,
  margin: '22px 0'
};

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: 11,
  marginTop: 6,
  border: '1px solid #cbd5e1',
  borderRadius: 9,
  boxSizing: 'border-box'
};

const btnStyle = {
  padding: '8px 14px',
  borderRadius: 9,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer'
};

function dateKey(year, month, day) {
  return (
    `${year}-` +
    `${String(month + 1).padStart(2, '0')}-` +
    `${String(day).padStart(2, '0')}`
  );
}

function todayKey() {
  const d = new Date();
  return dateKey(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );
}

function ymd(raw) {
  const value = String(raw ?? '').replace(/\D/g, '');

  if (value.length < 8) return null;

  const key =
    `${value.slice(0, 4)}-` +
    `${value.slice(4, 6)}-` +
    `${value.slice(6, 8)}`;

  const d = new Date(`${key}T12:00:00`);

  if (Number.isNaN(d.getTime())) return null;

  const checked = dateKey(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );

  return checked === key ? key : null;
}

function addDays(key, count) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + count);

  return dateKey(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );
}

function normalizeName(name) {
  return String(name ?? '')
    .replace(/\s/g, '')
    .toLowerCase();
}

function isExternalCertificate(name) {
  return EXTERNAL_CERTIFICATES.some(
    item => normalizeName(item) === normalizeName(name)
  );
}

function algorithmName(type) {
  switch (type) {
    case 'PASS_RATE_BASED':
      return '합격률 기반';
    case 'MOCK_BASED':
      return '모의고사 기반';
    case 'BASIC_FALLBACK':
      return '기본 학습량 기반';
    default:
      return '기존 학습계획';
  }
}

function normalizeEvents(name, rows) {
  const unique = new Map();

  for (const row of rows) {
    const round = row.implSeq
      ? `제${row.implSeq}회`
      : '';

    for (const [
      startField,
      endField,
      label,
      kind
    ] of FIELDS) {
      const start = ymd(row[startField]);
      const end = ymd(row[endField]) || start;

      if (!start) continue;

      const safeEnd = end >= start ? end : start;
      const id = [
        name,
        round,
        label,
        start,
        safeEnd
      ].join('|');

      unique.set(id, {
        id,
        name,
        round,
        label,
        kind,
        start,
        end: safeEnd
      });
    }
  }

  return [...unique.values()].sort(
    (a, b) => a.start.localeCompare(b.start)
  );
}

async function apiRequest(route, options = {}) {
  const response = await fetch(
    `${API_BASE}${route}`,
    {
      credentials: 'include',
      ...options
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message || '요청 처리에 실패했습니다.'
    );
  }

  return data;
}

export default function Calendar({
  user,
  initialDiagnosis = null
}) {
  const [currentDate, setCurrentDate] = useState(
    new Date()
  );

  const [selectedDate, setSelectedDate] = useState(null);

  const [certificates, setCertificates] = useState([]);
  const [
    selectedCertificates,
    setSelectedCertificates
  ] = useState([]);

  const [keyword, setKeyword] = useState('');
  const [grade, setGrade] = useState('all');

  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [partial, setPartial] = useState(false);
  const [failedGrades, setFailedGrades] = useState([]);

  const [scheduleState, setScheduleState] = useState({
    loading: false,
    errors: [],
    events: [],
    missing: [],
    unsupported: []
  });

  const [plans, setPlans] = useState([]);
  const [mockResults, setMockResults] = useState([]);

  const [plannerCertId, setPlannerCertId] = useState('');
  const [plannerType, setPlannerType] = useState('written');
  const [plannerLevel, setPlannerLevel] = useState('beginner');
  const [plannerHours, setPlannerHours] = useState(4);

  const [plannerDays, setPlannerDays] = useState([
    1, 2, 3, 4, 5, 6
  ]);

  const [plannerExamDate, setPlannerExamDate] = useState('');
  const [manualExamDate, setManualExamDate] = useState('');

  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState('');
  const [plannerNotice, setPlannerNotice] = useState('');

  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const userId = user?.id;
  const isLoggedIn = Boolean(userId);

  const storageKey = userId
    ? `recommender_certificates_${userId}`
    : null;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // ==========================================
  // 1. 관심 자격증 불러오기
  // ==========================================

  useEffect(() => {
    if (!storageKey) {
      setSelectedCertificates([]);
      return;
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem(storageKey) || '[]'
      );

      setSelectedCertificates(
        Array.isArray(saved) ? saved : []
      );
    } catch {
      setSelectedCertificates([]);
    }
  }, [storageKey]);

  // ==========================================
  // 2. 자격증 목록 조회
  // ==========================================

  useEffect(() => {
    if (!isLoggedIn) {
      setCertificates([]);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setListError('');

    fetch(
      `${API_BASE}/api/qnet/certificates?year=2025`,
      {
        credentials: 'include',
        signal: controller.signal
      }
    )
      .then(async response => {
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || '자격증 목록 조회 실패'
          );
        }

        if (controller.signal.aborted) return;

        setCertificates(
          Array.isArray(data.items) ? data.items : []
        );

        setPartial(Boolean(data.partial));

        setFailedGrades(
          Array.isArray(data.failedGrades)
            ? data.failedGrades
            : []
        );
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setListError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [isLoggedIn]);

  // ==========================================
  // 3. 관심 자격증 시험일정 조회
  // ==========================================

  const selectedKey = selectedCertificates
    .map(cert => String(cert.id))
    .sort()
    .join('|');

  useEffect(() => {
    if (
      !isLoggedIn ||
      selectedCertificates.length === 0
    ) {
      setScheduleState({
        loading: false,
        errors: [],
        events: [],
        missing: [],
        unsupported: []
      });
      return;
    }

    const controller = new AbortController();

    setScheduleState({
      loading: true,
      errors: [],
      events: [],
      missing: [],
      unsupported: []
    });

    Promise.all(
      selectedCertificates.map(async cert => {
        if (
          cert.scheduleSupported === false ||
          isExternalCertificate(cert.name)
        ) {
          return {
            name: cert.name,
            unsupported: true,
            events: []
          };
        }

        try {
          const url =
            `/api/qnet/exam-schedule` +
            `?keyword=${encodeURIComponent(cert.name)}` +
            `&year=${year}`;

          const response = await fetch(
            `${API_BASE}${url}`,
            {
              credentials: 'include',
              signal: controller.signal
            }
          );

          const data = await response.json();

          if (
            !response.ok ||
            !data.success ||
            data.selectionRequired
          ) {
            throw new Error(
              data.message || '시험일정 조회 실패'
            );
          }

          const rows = Array.isArray(data.items)
            ? data.items
            : [];

          return {
            name: cert.name,
            events: normalizeEvents(cert.name, rows),
            empty: rows.length === 0
          };
        } catch (error) {
          if (error.name === 'AbortError') {
            return null;
          }

          return {
            name: cert.name,
            error: error.message
          };
        }
      })
    ).then(results => {
      if (controller.signal.aborted) return;

      setScheduleState({
        loading: false,

        errors: results
          .filter(item => item?.error)
          .map(item => `${item.name}: ${item.error}`),

        missing: results
          .filter(item => item?.empty)
          .map(item => item.name),

        unsupported: results
          .filter(item => item?.unsupported)
          .map(item => item.name),

        events: results.flatMap(
          item => item?.events || []
        )
      });
    });

    return () => controller.abort();
  }, [isLoggedIn, userId, year, selectedKey]);

  // ==========================================
  // 4. 자격증 필터링
  // ==========================================

  const grades = useMemo(() => [
    ...new Set(
      certificates
        .map(cert => cert.grade)
        .filter(Boolean)
    )
  ], [certificates]);

  const filtered = useMemo(
    () => certificates.filter(cert => {
      const matchesKeyword = cert.name
        .toLowerCase()
        .includes(keyword.trim().toLowerCase());

      const matchesGrade =
        grade === 'all' || cert.grade === grade;

      return matchesKeyword && matchesGrade;
    }),
    [certificates, keyword, grade]
  );

  function toggleCertificate(cert) {
    if (!storageKey) return;

    setSelectedCertificates(prev => {
      const exists = prev.some(
        item => String(item.id) === String(cert.id)
      );

      const next = exists
        ? prev.filter(
            item => String(item.id) !== String(cert.id)
          )
        : [...prev, cert];

      localStorage.setItem(
        storageKey,
        JSON.stringify(next)
      );

      return next;
    });
  }

  // ==========================================
  // 5. 모의고사 및 학습계획 조회
  // ==========================================

  useEffect(() => {
    if (!isLoggedIn) {
      setMockResults([]);
      setPlans([]);
      return;
    }

    const controller = new AbortController();

    fetch(`${API_BASE}/api/study/mock-results`, {
      credentials: 'include',
      signal: controller.signal
    })
      .then(response => response.json())
      .then(data => {
        if (
          !controller.signal.aborted &&
          data.success
        ) {
          setMockResults(data.items || []);
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setPlannerError(error.message);
        }
      });

    fetch(`${API_BASE}/api/study/plans`, {
      credentials: 'include',
      signal: controller.signal
    })
      .then(response => response.json())
      .then(data => {
        if (
          !controller.signal.aborted &&
          data.success
        ) {
          setPlans(data.plans || []);
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setPlannerError(error.message);
        }
      });

    return () => controller.abort();
  }, [isLoggedIn, userId]);

  // ==========================================
  // 6. 학습 진단 결과 자동 선택
  // ==========================================

  useEffect(() => {
    if (
      !initialDiagnosis?.certificate ||
      !certificates.length ||
      !storageKey
    ) {
      return;
    }

    const match = certificates.find(
      cert =>
        normalizeName(cert.name) ===
        normalizeName(initialDiagnosis.certificate)
    );

    if (!match) return;

    setSelectedCertificates(prev => {
      if (
        prev.some(
          cert => String(cert.id) === String(match.id)
        )
      ) {
        return prev;
      }

      const next = [...prev, match];

      localStorage.setItem(
        storageKey,
        JSON.stringify(next)
      );

      return next;
    });

    setPlannerCertId(String(match.id));

    setPlannerType(
      initialDiagnosis.examType || 'written'
    );
  }, [
    initialDiagnosis?.certificate,
    initialDiagnosis?.examType,
    certificates,
    storageKey
  ]);

  // ==========================================
  // 7. 학습계획 대상 자격증
  // ==========================================

  const plannerCert = selectedCertificates.find(
    cert =>
      String(cert.id) === String(plannerCertId)
  );

  const availableExamDates = useMemo(() => {
    if (!plannerCert) return [];

    const label = plannerType === 'written'
      ? '필기시험'
      : '실기시험';

    return [
      ...new Set(
        scheduleState.events
          .filter(event =>
            event.name === plannerCert.name &&
            event.label === label &&
            event.start > todayKey()
          )
          .map(event => event.start)
      )
    ].sort();
  }, [
    plannerCertId,
    plannerType,
    scheduleState.events,
    selectedKey
  ]);

  useEffect(() => {
    setPlannerExamDate(prev => {
      if (availableExamDates.includes(prev)) {
        return prev;
      }

      return availableExamDates[0] || '';
    });
  }, [
    plannerCertId,
    plannerType,
    availableExamDates.join('|')
  ]);

  // ==========================================
  // 8. 학습기간 미리보기
  // ==========================================

  async function previewStudyPlan() {
    if (!plannerCert || !plannerDays.length) {
      setPlannerError(
        '자격증과 공부 요일을 선택하세요.'
      );
      return;
    }

    setPreviewBusy(true);
    setPlannerError('');
    setPreview(null);

    try {
      const data = await apiRequest(
        '/api/study/preview',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            certificateName: plannerCert.name,
            grade: plannerCert.gradeCode || '30',
            examType: plannerType,
            level: plannerLevel,
            dailyHours: Number(plannerHours),
            studyDays: plannerDays
          })
        }
      );

      setPreview(data);
    } catch (error) {
      setPlannerError(error.message);
    } finally {
      setPreviewBusy(false);
    }
  }

  // ==========================================
  // 9. 모의고사 삭제
  // ==========================================

  async function deleteMockResult(id) {
    if (
      !window.confirm(
        '이 모의고사 성적을 삭제할까요?'
      )
    ) {
      return;
    }

    try {
      setPlannerError('');

      await apiRequest(
        `/api/study/mock-results/${id}`,
        { method: 'DELETE' }
      );

      setMockResults(prev =>
        prev.filter(item => item.id !== id)
      );
    } catch (error) {
      setPlannerError(error.message);
    }
  }

  // ==========================================
  // 10. 학습계획 생성
  // ==========================================

  async function createStudyPlan(event) {
    event.preventDefault();

    if (!plannerCert) {
      setPlannerError('자격증을 선택하세요.');
      return;
    }

    if (!plannerDays.length) {
      setPlannerError('공부할 요일을 선택하세요.');
      return;
    }

    // 직접 입력 날짜 우선
    // 없으면 Q-Net에서 선택한 날짜
    // 둘 다 없으면 백엔드 추천 목표일 사용
    const targetExamDate =
      manualExamDate ||
      plannerExamDate ||
      '';

    setPlannerBusy(true);
    setPlannerError('');
    setPlannerNotice('');

    try {
      const data = await apiRequest(
        '/api/study/plans',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            certificateName: plannerCert.name,
            grade: plannerCert.gradeCode || '30',
            examType: plannerType,
            examDate: targetExamDate,
            level: plannerLevel,
            dailyHours: Number(plannerHours),
            studyDays: plannerDays
          })
        }
      );

      setPlans(prev => [
        data.plan,
        ...prev
      ]);

      setPlannerNotice(
        `학습계획 생성 완료! ` +
        `(${algorithmName(data.algorithmType)}) ` +
        `${data.plan.tasks.length}일의 ` +
        `학습 일정을 저장했습니다.`
      );

      const firstDate =
        data.plan.tasks[0]?.date ||
        data.plan.examDate;

      if (firstDate) {
        setCurrentDate(
          new Date(`${firstDate}T12:00:00`)
        );
      }

      setSelectedDate(null);

    } catch (error) {
      setPlannerError(error.message);
    } finally {
      setPlannerBusy(false);
    }
  }

  // ==========================================
  // 11. 공부 완료 체크
  // ==========================================

  async function toggleStudyTask(task) {
    const nextCompleted = !task.completed;

    try {
      setPlannerError('');

      await apiRequest(
        `/api/study/tasks/${task.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            completed: nextCompleted
          })
        }
      );

      setPlans(prev =>
        prev.map(plan => ({
          ...plan,
          tasks: plan.tasks.map(item =>
            item.id === task.id
              ? {
                  ...item,
                  completed: nextCompleted
                }
              : item
          )
        }))
      );
    } catch (error) {
      setPlannerError(error.message);
    }
  }

  // ==========================================
  // 12. 학습계획 삭제
  // ==========================================

  async function deleteStudyPlan(planId) {
    if (
      !window.confirm(
        '이 학습계획과 공부 일정을 삭제할까요?'
      )
    ) {
      return;
    }

    try {
      await apiRequest(
        `/api/study/plans/${planId}`,
        { method: 'DELETE' }
      );

      setPlans(prev =>
        prev.filter(plan => plan.id !== planId)
      );
    } catch (error) {
      setPlannerError(error.message);
    }
  }

  // ==========================================
  // 13. 달력 날짜 계산
  // ==========================================

  const firstWeekday = new Date(
    year,
    month,
    1
  ).getDay();

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => index + 1
    )
  ];

  while (cells.length % 7) {
    cells.push(null);
  }

  const today = todayKey();

  const eventsByDate = useMemo(() => {
    const map = new Map();

    const studyEvents = plans.flatMap(
      plan => plan.tasks.map(task => ({
        id: `study-${task.id}`,
        name: plan.certificateName,
        round: '',
        label: task.title,
        kind: 'study',
        start: task.date,
        end: task.date,
        task
      }))
    );

    for (
      const event of [
        ...scheduleState.events,
        ...studyEvents
      ]
    ) {
      let date = event.start;

      for (
        let i = 0;
        i < 90 && date <= event.end;
        i++
      ) {
        if (!map.has(date)) {
          map.set(date, []);
        }

        map.get(date).push(event);
        date = addDays(date, 1);
      }
    }

    return map;
  }, [scheduleState.events, plans]);

  const selectedEvents = selectedDate
    ? eventsByDate.get(selectedDate) || []
    : [];

  // ==========================================
  // 14. 화면
  // ==========================================

  return (
    <div
      className="calendar-page"
      style={{
        width: '100%',
        minWidth: 0
      }}
    >
      <div
        className="calendar-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h2>나의 캘린더</h2>
          <p>
            관심 자격증의 시험일정과
            맞춤형 공부 일정을 확인하세요.
          </p>
        </div>

        <span
          className={
            `calendar-status ${
              isLoggedIn ? 'active' : ''
            }`
          }
        >
          {isLoggedIn
            ? '맞춤형 캘린더'
            : '기본 캘린더'}
        </span>
      </div>

      {/* ==================================
          관심 자격증 선택
      ================================== */}

      {isLoggedIn && (
        <section
          className="certificate-selector"
          style={panelStyle}
        >
          <h3>관심 자격증 선택</h3>

          <p style={{ color: '#64748b' }}>
            Q-Net 및 별도 시행기관 자격증을
            검색하고 선택하세요.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              margin: '14px 0'
            }}
          >
            <input
              type="search"
              value={keyword}
              onChange={e =>
                setKeyword(e.target.value)
              }
              placeholder="자격증 검색 (예: 정보처리기사)"
              style={{
                flex: '1 1 240px',
                minWidth: 0,
                padding: '12px 14px',
                border: '1px solid #cbd5e1',
                borderRadius: 10
              }}
            />

            <select
              value={grade}
              onChange={e =>
                setGrade(e.target.value)
              }
              style={{
                padding: 12,
                border: '1px solid #cbd5e1',
                borderRadius: 10
              }}
            >
              <option value="all">
                전체 등급
              </option>

              {grades.map(item => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <p>
              자격증 목록을 불러오는 중...
            </p>
          )}

          {listError && (
            <p style={{ color: '#dc2626' }}>
              자격증 조회 오류: {listError}
            </p>
          )}

          {!loading && !listError && (
            <>
              <p style={{ color: '#475569' }}>
                전체 {certificates.length}개 중{' '}
                {filtered.length}개 표시
              </p>

              {partial && (
                <p style={{ color: '#b45309' }}>
                  일부 등급 조회 실패:{' '}
                  {failedGrades.join(', ')}
                  {' '}— 전체 목록이 아닐 수 있습니다.
                </p>
              )}

              <div
                className="certificate-options"
                style={{
                  maxHeight: 250,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 8
                }}
              >
                {filtered.length === 0 && (
                  <p>
                    검색 결과가 없습니다.
                  </p>
                )}

                {filtered.map(cert => (
                  <label
                    className="certificate-option"
                    key={cert.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      padding: 9
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedCertificates.some(
                          item =>
                            String(item.id) ===
                            String(cert.id)
                        )
                      }
                      onChange={() =>
                        toggleCertificate(cert)
                      }
                    />

                    <span>{cert.name}</span>

                    <span
                      style={{
                        color: '#64748b',
                        fontSize: 13
                      }}
                    >
                      {cert.grade}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <h3 style={{ marginTop: 22 }}>
            내 관심 자격증
            ({selectedCertificates.length}개)
          </h3>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 10
            }}
          >
            {selectedCertificates.length === 0 && (
              <p style={{ color: '#64748b' }}>
                자격증을 선택하면 시험일정을
                자동 조회합니다.
              </p>
            )}

            {selectedCertificates.map(cert => (
              <button
                key={cert.id}
                type="button"
                onClick={() =>
                  toggleCertificate(cert)
                }
                style={{
                  ...btnStyle,
                  color: '#1d4ed8',
                  background: '#eff6ff',
                  borderColor: '#bfdbfe'
                }}
              >
                {cert.name} ×
              </button>
            ))}
          </div>

          {scheduleState.loading && (
            <p style={{ color: '#475569' }}>
              선택한 자격증의 {year}년
              시험일정을 조회 중...
            </p>
          )}

          {scheduleState.errors.map(error => (
            <p
              key={error}
              style={{ color: '#dc2626' }}
            >
              일정 조회 실패 — {error}
            </p>
          ))}

          {scheduleState.unsupported.map(name => (
            <p
              key={name}
              style={{ color: '#b45309' }}
            >
              {name}: Q-Net 시험일정이
              제공되지 않습니다.
              실제 응시일을 직접 입력해 주세요.
            </p>
          ))}

          {scheduleState.missing.map(name => (
            <p
              key={name}
              style={{ color: '#b45309' }}
            >
              {name}: {year}년 일정이
              반환되지 않았습니다.
            </p>
          ))}

          {!scheduleState.loading &&
            scheduleState.events.length > 0 && (
              <p style={{ color: '#059669' }}>
                실제 Q-Net 일정{' '}
                {scheduleState.events.length}개
                구간을 달력에 표시합니다.
              </p>
            )}
        </section>
      )}

      {/* ==================================
          맞춤형 학습계획
      ================================== */}

      {isLoggedIn && (
        <section
          className="study-planner-panel"
          style={panelStyle}
        >
          <h3>
            맞춤형 공부 일정 자동 생성
          </h3>

          <p style={{ color: '#475569' }}>
            합격률 데이터가 있으면 합격률 기반,
            없으면 저장된 모의고사 점수 기반으로
            학습계획을 생성합니다.
          </p>

          {/* 저장된 모의고사 */}

          {mockResults.length > 0 && (
            <div
              style={{
                padding: 12,
                background: '#eff6ff',
                borderRadius: 10,
                marginBottom: 12
              }}
            >
              <strong>
                저장된 모의고사 성적
              </strong>

              {mockResults.slice(0, 5).map(mock => (
                <div
                  key={mock.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    margin: '8px 0'
                  }}
                >
                  <span>
                    {mock.certificateName} ·{' '}
                    {mock.examType === 'written'
                      ? '필기'
                      : '실기'} ·{' '}
                    {mock.score}점
                    ({mock.mockDate})
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      deleteMockResult(mock.id)
                    }
                    style={{
                      ...btnStyle,
                      color: '#dc2626',
                      borderColor: '#fecaca'
                    }}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 학습계획 입력 폼 */}

          <form
            onSubmit={createStudyPlan}
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(190px,1fr))',
              gap: 14,
              marginTop: 16
            }}
          >
            <label>
              목표 자격증

              <select
                value={plannerCertId}
                onChange={e => {
                  setPlannerCertId(e.target.value);
                  setPreview(null);
                }}
                required
                style={inputStyle}
              >
                <option value="">
                  자격증 선택
                </option>

                {selectedCertificates.map(cert => (
                  <option
                    key={cert.id}
                    value={cert.id}
                  >
                    {cert.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              시험 유형

              <select
                value={plannerType}
                onChange={e => {
                  setPlannerType(e.target.value);
                  setPreview(null);
                }}
                style={inputStyle}
              >
                <option value="written">
                  필기
                </option>

                <option value="practical">
                  실기
                </option>
              </select>
            </label>

            <label>
              목표 시험일

              <select
                value={plannerExamDate}
                onChange={e =>
                  setPlannerExamDate(e.target.value)
                }
                style={inputStyle}
              >
                <option value="">
                  {scheduleState.loading
                    ? '시험일정 조회 중'
                    : '시험 시작일 선택'}
                </option>

                {availableExamDates.map(date => (
                  <option
                    key={date}
                    value={date}
                  >
                    {date}
                  </option>
                ))}
              </select>
            </label>

            <label>
              실제 응시일 직접 입력 (선택)

              <input
                type="date"
                value={manualExamDate}
                min={addDays(todayKey(), 1)}
                onChange={e =>
                  setManualExamDate(e.target.value)
                }
                style={inputStyle}
              />
            </label>

            <label>
              현재 학습 수준

              <select
                value={plannerLevel}
                onChange={e => {
                  setPlannerLevel(e.target.value);
                  setPreview(null);
                }}
                style={inputStyle}
              >
                <option value="beginner">
                  초급
                </option>

                <option value="intermediate">
                  중급
                </option>

                <option value="advanced">
                  상급
                </option>
              </select>
            </label>

            <label>
              하루 공부 가능 시간

              <input
                type="number"
                min="1"
                max="8"
                step="0.5"
                value={plannerHours}
                onChange={e => {
                  setPlannerHours(
                    Number(e.target.value)
                  );
                  setPreview(null);
                }}
                required
                style={inputStyle}
              />
            </label>

            <fieldset
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: 10
              }}
            >
              <legend>
                공부 가능한 요일
              </legend>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                {WEEKDAYS.map((day, index) => (
                  <label
                    key={day}
                    style={{
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        plannerDays.includes(index)
                      }
                      onChange={e => {
                        setPlannerDays(prev =>
                          e.target.checked
                            ? [...prev, index]
                            : prev.filter(
                                item => item !== index
                              )
                        );
                        setPreview(null);
                      }}
                    />
                    {' '}{day}
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={
                plannerBusy ||
                !plannerDays.length
              }
              style={{
                padding: 12,
                background: '#2563eb',
                color: '#fff',
                border: 0,
                borderRadius: 10,
                cursor: 'pointer'
              }}
            >
              {plannerBusy
                ? '학습계획 생성 중...'
                : '학습계획 생성'}
            </button>
          </form>

          {/* 미리보기 버튼 */}

          <button
            type="button"
            disabled={
              previewBusy ||
              !plannerCert ||
              !plannerDays.length
            }
            onClick={previewStudyPlan}
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 9,
              border: '1px solid #2563eb',
              background: '#eff6ff',
              color: '#1d4ed8',
              cursor: 'pointer'
            }}
          >
            {previewBusy
              ? '분석 중...'
              : '추천 학습기간 분석'}
          </button>

          {/* 미리보기 결과 */}

          {preview && (
            <div
              style={{
                padding: 14,
                marginTop: 12,
                borderRadius: 10,
                background: '#f0fdf4'
              }}
            >
              <strong>
                예상 학습 완료일:{' '}
                {preview.estimate?.completionDate}
              </strong>

              <p>
                적용 알고리즘:{' '}
                <strong>
                  {algorithmName(
                    preview.algorithmType
                  )}
                </strong>
              </p>

              <p>
                예상 학습시간{' '}
                {preview.estimate?.estimatedHours}시간
                {' '}· 학습일{' '}
                {preview.estimate?.studyDaysNeeded}일
              </p>

              <p>
                모의고사 점수:{' '}
                {preview.mockScore ?? '미입력'}
              </p>

              <p>
                필기 합격률:{' '}
                {preview.statistics?.writtenPassRate == null
                  ? '자료 없음'
                  : `${preview.statistics.writtenPassRate}%`}
              </p>

              <p>
                실기 합격률:{' '}
                {preview.statistics?.practicalPassRate == null
                  ? '자료 없음'
                  : `${preview.statistics.practicalPassRate}%`}
              </p>

              <p>
                평균 취득소요기간:{' '}
                {preview.statistics?.averageDays == null
                  ? '자료 없음'
                  : `${preview.statistics.averageDays}일`}
              </p>

              <p>
                개인별 보정 합격률 참고 지표:{' '}
                {preview.estimate?.personalAdjustedRate == null
                  ? '산출 불가'
                  : `${preview.estimate.personalAdjustedRate}%`}
              </p>

              <p>
                임시 목표일:{' '}
                {preview.estimate?.suggestedTargetDate}
              </p>

              <small>
                {preview.notice}
              </small>

              <p
                style={{
                  fontSize: 12,
                  color: '#64748b'
                }}
              >
                추정 학습량과 개인별 지표는
                규칙 기반 참고값이며,
                실제 합격확률을 의미하지 않습니다.
              </p>
            </div>
          )}

          {/* 시험일 미지정 안내 */}

          {!plannerExamDate &&
            !manualExamDate &&
            plannerCert &&
            !scheduleState.loading && (
              <p style={{ color: '#b45309' }}>
                시험일을 선택하지 않으면
                추천 학습기간을 바탕으로
                임시 목표일을 생성합니다.
                실제 확정 시험일은 아닙니다.
              </p>
            )}

          {plannerError && (
            <p style={{ color: '#dc2626' }}>
              {plannerError}
            </p>
          )}

          {plannerNotice && (
            <p style={{ color: '#059669' }}>
              {plannerNotice}
            </p>
          )}

          {/* 생성된 학습계획 */}

          {plans.map(plan => {
            const tasks = plan.tasks || [];

            const done = tasks.filter(
              task => task.completed
            ).length;

            const progress = tasks.length
              ? Math.round(
                  done / tasks.length * 100
                )
              : 0;

            return (
              <div
                key={plan.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 16,
                  marginTop: 14
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap'
                  }}
                >
                  <strong>
                    {plan.certificateName}
                    {' '}·{' '}
                    {plan.examType === 'written'
                      ? '필기'
                      : '실기'}
                    {' '}· {plan.examDate}
                  </strong>

                  <button
                    type="button"
                    onClick={() =>
                      deleteStudyPlan(plan.id)
                    }
                    style={{
                      ...btnStyle,
                      color: '#b91c1c',
                      borderColor: '#fecaca'
                    }}
                  >
                    계획 삭제
                  </button>
                </div>

                <p style={{ color: '#2563eb' }}>
                  적용 알고리즘:{' '}
                  <strong>
                    {algorithmName(
                      plan.algorithmType
                    )}
                  </strong>
                </p>

                <p style={{ color: '#475569' }}>
                  추정 학습량{' '}
                  {plan.estimatedHours}시간
                  {' '}· 권장 하루{' '}
                  {plan.requiredDailyHours}시간
                  {' '}· 확보 가능{' '}
                  {plan.availableHours}시간
                </p>

                <p
                  style={{
                    color: plan.feasible
                      ? '#059669'
                      : '#b45309'
                  }}
                >
                  {plan.feasible
                    ? '현재 설정으로 추정 학습량 확보 가능'
                    : '학습시간 부족 — 공부시간 또는 시험일 조정 권장'}
                </p>

                <p>
                  학습 진도 {done}/{tasks.length}일
                  {' '}({progress}%)
                </p>

                <div
                  style={{
                    height: 8,
                    background: '#e2e8f0',
                    borderRadius: 20,
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: '#16a34a'
                    }}
                  />
                </div>

                <small
                  style={{
                    display: 'block',
                    color: '#64748b',
                    marginTop: 10
                  }}
                >
                  {plan.notice}
                </small>
              </div>
            );
          })}
        </section>
      )}

      {/* ==================================
          달력
      ================================== */}

      <section
        className="calendar-container"
        style={{
          ...panelStyle,
          padding: 20
        }}
      >
        <div
          className="calendar-navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            marginBottom: 20
          }}
        >
          <button
            type="button"
            onClick={() => {
              setCurrentDate(
                new Date(year, month - 1, 1)
              );
              setSelectedDate(null);
            }}
            style={btnStyle}
          >
            ‹
          </button>

          <h3 style={{ margin: 0 }}>
            {year}년 {month + 1}월
          </h3>

          <button
            type="button"
            onClick={() => {
              setCurrentDate(
                new Date(year, month + 1, 1)
              );
              setSelectedDate(null);
            }}
            style={btnStyle}
          >
            ›
          </button>

          <button
            type="button"
            onClick={() => {
              const d = new Date();

              setCurrentDate(d);

              setSelectedDate(
                dateKey(
                  d.getFullYear(),
                  d.getMonth(),
                  d.getDate()
                )
              );
            }}
            style={btnStyle}
          >
            오늘
          </button>
        </div>

        <div
          className="calendar-grid"
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(7, minmax(0, 1fr))',
            gap: 5
          }}
        >
          {WEEKDAYS.map((day, index) => (
            <div
              className="calendar-weekday"
              key={day}
              style={{
                textAlign: 'center',
                padding: '10px 0',
                color:
                  index === 0
                    ? '#dc2626'
                    : index === 6
                      ? '#2563eb'
                      : '#475569',
                fontWeight: 700
              }}
            >
              {day}
            </div>
          ))}

          {cells.map((day, index) => {
            if (!day) {
              return (
                <div
                  className="calendar-cell empty"
                  key={`empty-${index}`}
                />
              );
            }

            const key = dateKey(
              year,
              month,
              day
            );

            const events =
              eventsByDate.get(key) || [];

            return (
              <button
                type="button"
                key={key}
                onClick={() =>
                  setSelectedDate(key)
                }
                className={[
                  'calendar-cell',
                  key === today ? 'today' : '',
                  key === selectedDate
                    ? 'selected'
                    : ''
                ].join(' ')}
                style={{
                  minWidth: 0,
                  minHeight: 108,
                  textAlign: 'left',
                  padding: 8,
                  borderRadius: 10,
                  border:
                    key === selectedDate
                      ? '2px solid #2563eb'
                      : '1px solid #e2e8f0',
                  background:
                    key === today
                      ? '#eff6ff'
                      : '#fff',
                  cursor: 'pointer',
                  overflow: 'hidden'
                }}
              >
                <span
                  className="calendar-day-number"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 27,
                    height: 27,
                    borderRadius: '50%',
                    background:
                      key === today
                        ? '#2563eb'
                        : 'transparent',
                    color:
                      key === today
                        ? '#fff'
                        : '#334155',
                    fontWeight: 700
                  }}
                >
                  {day}
                </span>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    marginTop: 6
                  }}
                >
                  {events.slice(0, 2).map(event => (
                    <span
                      key={event.id}
                      title={
                        `${event.name} ${event.round || ''} ` +
                        `${event.label}: ` +
                        `${event.start} ~ ${event.end}`
                      }
                      style={{
                        fontSize: 11,
                        color: COLOR[event.kind],
                        background:
                          `${COLOR[event.kind]}12`,
                        borderLeft:
                          `3px solid ${COLOR[event.kind]}`,
                        padding: '3px 4px',
                        borderRadius: 4,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {event.name} {event.label}
                    </span>
                  ))}

                  {events.length > 2 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#64748b'
                      }}
                    >
                      +{events.length - 2}개 더보기
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ==================================
          선택한 날짜의 상세 일정
      ================================== */}

      <section
        className="calendar-detail"
        style={panelStyle}
      >
        <h3>
          {selectedDate
            ? `${selectedDate} 일정 (${selectedEvents.length}개)`
            : '날짜를 선택해 일정을 확인하세요'}
        </h3>

        {selectedDate &&
          selectedEvents.length === 0 && (
            <p style={{ color: '#64748b' }}>
              이 날짜에 조회된 일정이 없습니다.
            </p>
          )}

        {selectedEvents.map(event => (
          <div
            key={event.id}
            style={{
              padding: '12px 14px',
              borderLeft:
                `4px solid ${COLOR[event.kind]}`,
              background: '#f8fafc',
              borderRadius: 8,
              marginTop: 8
            }}
          >
            <strong>
              {event.name}{' '}
              {event.round || ''}
              {' '}— {event.label}
            </strong>

            {event.kind === 'study' && (
              <label
                style={{
                  display: 'block',
                  marginTop: 8,
                  color: '#166534'
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    Boolean(event.task.completed)
                  }
                  onChange={() =>
                    toggleStudyTask(event.task)
                  }
                />

                {' '}공부 완료 · 권장{' '}
                {event.task.hours}시간
              </label>
            )}

            <div
              style={{
                fontSize: 13,
                color: '#64748b',
                marginTop: 4
              }}
            >
              {event.start}
              {event.end !== event.start
                ? ` ~ ${event.end}`
                : ''}
            </div>
          </div>
        ))}

        <p
          style={{
            fontSize: 12,
            color: '#94a3b8',
            marginTop: 16
          }}
        >
          시험일정은 Q-Net API를 기반으로 표시하며,
          초록색 공부 일정은 사용자 입력과
          규칙 기반 알고리즘으로 생성한
          추정 학습계획입니다.
          실제 시험일과 접수기간은
          해당 시험 시행기관의 공고를 확인하세요.
        </p>
      </section>
    </div>
  );
}
