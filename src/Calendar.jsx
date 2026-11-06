
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
  ['pracPassDt', 'pracPassDt', '최종 합격 발표', 'result'],
];

const COLOR = {
  registration: '#2563eb',
  exam: '#7c3aed',
  result: '#059669',
  study: '#16a34a'
};

function ymd(raw) {
  const value = String(raw ?? '').replace(/\D/g, '');
  if (value.length < 8) return null;

  const key = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const d = new Date(`${key}T12:00:00`);

  const valid =
    !Number.isNaN(d.getTime()) &&
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === key;

  return valid ? key : null;
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(key, count) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + count);

  return dateKey(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function normalizeEvents(name, rows) {
  const unique = new Map();

  for (const row of rows) {
    const round = row.implSeq ? `제${row.implSeq}회` : '';

    for (const [startField, endField, label, kind] of FIELDS) {
      const start = ymd(row[startField]);
      const end = ymd(row[endField]) || start;

      if (!start) continue;

      const safeEnd = end >= start ? end : start;
      const id = [name, round, label, start, safeEnd].join('|');

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

export default function Calendar({ user }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const [certificates, setCertificates] = useState([]);
  const [selectedCertificates, setSelectedCertificates] = useState([]);

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
    missing: []
  });

  const [plans, setPlans] = useState([]);
  const [mockResults, setMockResults] = useState([]);
  const [plannerCertId, setPlannerCertId] = useState('');
  const [plannerType, setPlannerType] = useState('written');
  const [plannerLevel, setPlannerLevel] = useState('beginner');
  const [plannerHours, setPlannerHours] = useState(2);
  const [plannerDays, setPlannerDays] = useState([1, 2, 3, 4, 5, 6]);
  const [plannerExamDate, setPlannerExamDate] = useState('');
  const [manualExamDate, setManualExamDate] = useState('');
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState('');
  const [plannerNotice, setPlannerNotice] = useState('');

  const userId = user?.id;
  const isLoggedIn = Boolean(userId);

  const storageKey = userId
    ? `recommender_certificates_${userId}`
    : null;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 사용자별 관심 자격증 불러오기
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

  // Q-Net 자격증 목록 조회
  useEffect(() => {
    if (!isLoggedIn) {
      setCertificates([]);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setListError('');

    fetch(`${API_BASE}/api/qnet/certificates?year=2025`, {
      signal: controller.signal,
      credentials: 'include'
    })
      .then(async response => {
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message || '자격증 목록 조회 실패'
          );
        }

        if (!controller.signal.aborted) {
          setCertificates(
            Array.isArray(data.items) ? data.items : []
          );

          setPartial(Boolean(data.partial));

          setFailedGrades(
            Array.isArray(data.failedGrades)
              ? data.failedGrades
              : []
          );
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setListError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [isLoggedIn]);

  // 선택한 자격증의 실제 시험일정 조회
  const selectedKey = selectedCertificates
    .map(cert => cert.id)
    .sort()
    .join('|');

  useEffect(() => {
    if (!isLoggedIn || selectedCertificates.length === 0) {
      setScheduleState({
        loading: false,
        errors: [],
        events: [],
        missing: []
      });
      return;
    }

    const controller = new AbortController();

    setScheduleState({
      loading: true,
      errors: [],
      events: [],
      missing: []
    });

    Promise.all(
      selectedCertificates.map(async cert => {
        try {
          const url =
            `${API_BASE}/api/qnet/exam-schedule` +
            `?keyword=${encodeURIComponent(cert.name)}` +
            `&year=${year}`;

          const response = await fetch(url, {
            signal: controller.signal,
            credentials: 'include'
          });

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
        } catch (err) {
          if (err.name === 'AbortError') return null;

          return {
            name: cert.name,
            error: err.message
          };
        }
      })
    ).then(results => {
      if (controller.signal.aborted) return;

      setScheduleState({
        loading: false,
        errors: results
          .filter(result => result?.error)
          .map(result => `${result.name}: ${result.error}`),
        missing: results
          .filter(result => result?.empty)
          .map(result => result.name),
        events: results.flatMap(
          result => result?.events || []
        )
      });
    });

    return () => controller.abort();
  }, [isLoggedIn, userId, year, selectedKey]);

  const grades = useMemo(
    () => [
      ...new Set(
        certificates.map(cert => cert.grade).filter(Boolean)
      )
    ],
    [certificates]
  );

  const filtered = useMemo(
    () =>
      certificates.filter(cert => {
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
        item => item.id === cert.id
      );

      const next = exists
        ? prev.filter(item => item.id !== cert.id)
        : [...prev, cert];

      localStorage.setItem(
        storageKey,
        JSON.stringify(next)
      );

      return next;
    });
  }

  // 학습 진단에서 입력한 외부 모의고사 성적 조회
  useEffect(() => {
    if (!isLoggedIn) { setMockResults([]); return; }
    const controller = new AbortController();
    fetch(`${API_BASE}/api/study/mock-results`, { credentials:'include', signal:controller.signal })
      .then(r=>r.json()).then(data=>{ if (!controller.signal.aborted && data.success) setMockResults(data.items || []); })
      .catch(err=>{if(err.name!=='AbortError')setPlannerError(err.message)});
    return ()=>controller.abort();
  }, [isLoggedIn,userId]);

  // 로그인한 사용자의 학습계획 불러오기
  useEffect(() => {
    if (!isLoggedIn) { setPlans([]); return; }
    const controller = new AbortController();
    fetch(`${API_BASE}/api/study/plans`, { credentials: 'include', signal: controller.signal })
      .then(r => r.json()).then(data => {
        if (!controller.signal.aborted && data.success) setPlans(data.plans || []);
      }).catch(error => { if (error.name !== 'AbortError') setPlannerError(error.message); });
    return () => controller.abort();
  }, [isLoggedIn, userId]);

  const plannerCert = selectedCertificates.find(c => String(c.id) === String(plannerCertId));
  const availableExamDates = useMemo(() => {
    if (!plannerCert) return [];
    const label = plannerType === 'written' ? '필기시험' : '실기시험';
    return [...new Set(scheduleState.events
      .filter(e => e.name === plannerCert.name && e.label === label && e.start > new Date().toLocaleDateString('sv-SE'))
      .map(e => e.start))].sort();
  }, [plannerCertId, plannerType, scheduleState.events, selectedKey]);


useEffect(() => {
  setPlannerExamDate(prev => {
    if (availableExamDates.includes(prev)) {
      return prev;
    }

    return availableExamDates[0] || '';
  });
}, [plannerCertId, plannerType, availableExamDates.join('|')]);


  async function createStudyPlan(event) {
    event.preventDefault();
    const targetExamDate = manualExamDate || plannerExamDate;
    if (!plannerCert || !targetExamDate) { setPlannerError('자격증과 미래 시험일을 선택하세요.'); return; }
    setPlannerBusy(true); setPlannerError(''); setPlannerNotice('');
    try {
      const response = await fetch(`${API_BASE}/api/study/plans`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateName: plannerCert.name, grade: plannerCert.gradeCode || '30',
          examType: plannerType, examDate: targetExamDate, level: plannerLevel,
          dailyHours: Number(plannerHours), studyDays: plannerDays })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '학습계획 생성 실패');
      setPlans(prev => [data.plan, ...prev]);
      setPlannerNotice(`학습계획 생성 완료! ${data.plan.tasks.length}일의 학습 일정을 저장했습니다.${data.dataWarnings?.length ? ' (' + data.dataWarnings.join(', ') + ')' : ''}`);
      setCurrentDate(new Date(`${data.plan.tasks[0]?.date || data.plan.examDate}T12:00:00`));
    } catch (error) { setPlannerError(error.message); }
    finally { setPlannerBusy(false); }
  }

 
async function toggleStudyTask(task) {
  const nextCompleted = !task.completed;

  try {
    setPlannerError('');

    const response = await fetch(
      `${API_BASE}/api/study/tasks/${task.id}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          completed: nextCompleted
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message || '공부 완료 상태 저장 실패'
      );
    }

    setPlans(prev =>
      prev.map(plan => ({
        ...plan,
        tasks: plan.tasks.map(item =>
          item.id === task.id
            ? { ...item, completed: nextCompleted }
            : item
        )
      }))
    );

  } catch (error) {
    setPlannerError(error.message);
  }
}


  async function deleteStudyPlan(planId) {
    if (!window.confirm('이 학습계획과 공부 일정을 삭제할까요?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/study/plans/${planId}`, { method: 'DELETE', credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '삭제 실패');
      setPlans(prev => prev.filter(p => p.id !== planId));
    } catch (error) { setPlannerError(error.message); }
  }

  // 달력 날짜 계산
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

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

  const today = new Date();

  const todayKey = dateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  // 시험일정의 시작일부터 종료일까지 날짜에 매핑
  const eventsByDate = useMemo(() => {
    const map = new Map();

    const studyEvents = plans.flatMap(plan => plan.tasks.map(task => ({
      id: `study-${task.id}`, name: plan.certificateName, label: task.title,
      kind: 'study', start: task.date, end: task.date, task
    })));
    for (const event of [...scheduleState.events, ...studyEvents]) {
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

  const btnStyle = {
    padding: '8px 14px',
    borderRadius: 9,
    border: '1px solid #cbd5e1',
    background: '#fff',
    cursor: 'pointer'
  };

  return (
    <div
      className="calendar-page"
      style={{ width: '100%', minWidth: 0 }}
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
            관심 자격증의 실제 Q-Net 시험일정을 확인하세요.
          </p>
        </div>

        <span
          className={`calendar-status ${
            isLoggedIn ? 'active' : ''
          }`}
        >
          {isLoggedIn
            ? '맞춤형 캘린더'
            : '기본 캘린더'}
        </span>
      </div>

      {isLoggedIn && (
        <section
          className="certificate-selector"
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 18,
            padding: 24,
            margin: '22px 0'
          }}
        >
          <h3>관심 자격증 선택</h3>

          <p style={{ color: '#64748b' }}>
            Q-Net 실제 자격증을 검색하고 선택하세요.
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
              onChange={e => setKeyword(e.target.value)}
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
              onChange={e => setGrade(e.target.value)}
              style={{
                padding: 12,
                border: '1px solid #cbd5e1',
                borderRadius: 10
              }}
            >
              <option value="all">전체 등급</option>

              {grades.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <p>Q-Net 자격증 목록을 불러오는 중...</p>
          )}

          {listError && (
            <p style={{ color: '#dc2626' }}>
              자격증 조회 오류: {listError}
            </p>
          )}

          {!loading && !listError && (
            <>
              <p style={{ color: '#475569' }}>
                전체 {certificates.length}개 중
                {' '}{filtered.length}개 표시
              </p>

              {partial && (
                <p style={{ color: '#b45309' }}>
                  일부 등급 조회 실패:
                  {' '}{failedGrades.join(', ')}
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
                  <p>검색 결과가 없습니다.</p>
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
                      checked={selectedCertificates.some(
                        item => item.id === cert.id
                      )}
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
                자격증을 선택하면 시험일정을 자동 조회합니다.
              </p>
            )}

            {selectedCertificates.map(cert => (
              <button
                key={cert.id}
                type="button"
                onClick={() => toggleCertificate(cert)}
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
            <p
              style={{
                marginTop: 12,
                color: '#475569'
              }}
            >
              선택한 자격증의 {year}년 실제 시험일정을
              조회 중...
            </p>
          )}

          {scheduleState.errors.map(error => (
            <p
              key={error}
              style={{
                color: '#dc2626',
                marginTop: 10
              }}
            >
              일정 조회 실패 — {error}
            </p>
          ))}

          {scheduleState.missing.map(name => (
            <p
              key={name}
              style={{
                color: '#b45309',
                marginTop: 10
              }}
            >
              {name}: {year}년 일정이 반환되지 않았습니다.
            </p>
          ))}

          {!scheduleState.loading &&
            scheduleState.events.length > 0 && (
              <p
                style={{
                  color: '#059669',
                  marginTop: 12
                }}
              >
                실제 Q-Net 일정
                {' '}{scheduleState.events.length}개 구간을
                달력에 표시합니다.
              </p>
            )}
        </section>
      )}

      {isLoggedIn && (
        <section className="study-planner-panel" style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:18, padding:24, margin:'22px 0' }}>
          <h3>맞춤형 공부 일정 자동 생성</h3>
          <p style={{color:'#475569'}}>학습 진단에서 입력한 최근 외부 CBT 점수와 과목별 취약도를 자동 반영합니다.</p>
          {mockResults.length > 0 && <div style={{padding:12,background:'#eff6ff',borderRadius:10,marginBottom:12}}>
            <strong>저장된 모의고사 성적</strong>
            {mockResults.slice(0,5).map(m=><p key={m.id} style={{margin:'6px 0'}}>{m.certificateName} · {m.examType==='written'?'필기':'실기'} · {m.score}점 ({m.mockDate})</p>)}
          </div>}
          <p style={{color:'#64748b'}}>Q-Net 시험일정과 합격률·취득소요기간을 참고해 공부 일정을 만듭니다.</p>
          <form onSubmit={createStudyPlan} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14,marginTop:16}}>
            <label>목표 자격증
              <select value={plannerCertId} onChange={e=>setPlannerCertId(e.target.value)} required style={{display:'block',width:'100%',padding:11,marginTop:6}}>
                <option value="">자격증 선택</option>
                {selectedCertificates.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>시험 유형
              <select value={plannerType} onChange={e=>setPlannerType(e.target.value)} style={{display:'block',width:'100%',padding:11,marginTop:6}}>
                <option value="written">필기</option><option value="practical">실기</option>
              </select>
            </label>
            <label>목표 시험일
              <select value={plannerExamDate} onChange={e=>setPlannerExamDate(e.target.value)} style={{display:'block',width:'100%',padding:11,marginTop:6}}>
                <option value="">{scheduleState.loading?'시험일정 조회 중':'시험 시작일 선택'}</option>
                {availableExamDates.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>실제 응시일 직접 입력 (선택 가능)
              <input type="date" value={manualExamDate} min={new Date(Date.now()+86400000).toLocaleDateString('sv-SE')} onChange={e=>setManualExamDate(e.target.value)} style={{display:'block',width:'100%',padding:11,marginTop:6}} />
            </label>
            <label>현재 학습 수준
              <select value={plannerLevel} onChange={e=>setPlannerLevel(e.target.value)} style={{display:'block',width:'100%',padding:11,marginTop:6}}>
                <option value="beginner">초급</option><option value="intermediate">중급</option><option value="advanced">상급</option>
              </select>
            </label>
            <label>하루 공부 가능 시간
              <input type="number" min="0.5" max="12" step="0.5" value={plannerHours} onChange={e=>setPlannerHours(Number(e.target.value))} required style={{display:'block',width:'100%',padding:11,marginTop:6}} />
            </label>
            <fieldset style={{border:'1px solid #e2e8f0',borderRadius:10,padding:10}}>
              <legend>공부 가능한 요일</legend>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {WEEKDAYS.map((day,i)=><label key={day} style={{whiteSpace:'nowrap'}}>
                  <input type="checkbox" checked={plannerDays.includes(i)} onChange={e=>setPlannerDays(prev=>e.target.checked?[...prev,i]:prev.filter(x=>x!==i))} /> {day}
                </label>)}
              </div>
            </fieldset>
            <button type="submit" disabled={plannerBusy || !(plannerExamDate || manualExamDate) || !plannerDays.length} style={{padding:12,background:'#2563eb',color:'#fff',border:0,borderRadius:10,cursor:'pointer'}}>
              {plannerBusy?'학습계획 생성 중...':'학습계획 생성'}
            </button>
          </form>
          {!plannerExamDate && plannerCert && !scheduleState.loading && <p style={{color:'#b45309'}}>선택한 자격증의 {year}년 미래 시험 시작일이 없습니다. 달력을 다음 연도로 이동하거나, 아직 일정이 발표되지 않았다면 임시 목표일을 직접 입력하세요. 직접 입력한 날짜는 Q-Net 확정 일정이 아닙니다.</p>}
          {plannerError && <p style={{color:'#dc2626'}}>{plannerError}</p>}
          {plannerNotice && <p style={{color:'#059669'}}>{plannerNotice}</p>}
          {plans.map(plan=>{
            const done=plan.tasks.filter(t=>t.completed).length;
            return <div key={plan.id} style={{border:'1px solid #e2e8f0',borderRadius:12,padding:16,marginTop:14}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                <strong>{plan.certificateName} · {plan.examType==='written'?'필기':'실기'} · {plan.examDate}</strong>
                <button type="button" onClick={()=>deleteStudyPlan(plan.id)} style={{border:'1px solid #fecaca',background:'#fff',color:'#b91c1c',borderRadius:8,padding:'5px 10px',cursor:'pointer'}}>계획 삭제</button>
              </div>
              <p style={{margin:'8px 0',color:'#475569'}}>추정 학습량 {plan.estimatedHours}시간 · 권장 하루 {plan.requiredDailyHours}시간 · 설정한 기간의 확보 가능 시간 {plan.availableHours}시간</p>
              <p style={{margin:'8px 0',color:plan.feasible?'#059669':'#b45309'}}>{plan.feasible?'현재 설정으로 추정 학습량 확보 가능':'현재 설정으로 추정 학습량 부족 — 공부시간 또는 시험일 조정 권장'}</p>
              <p style={{margin:'8px 0'}}>학습 진도 {done}/{plan.tasks.length}일 ({plan.tasks.length?Math.round(done/plan.tasks.length*100):0}%)</p>
              <div style={{height:8,background:'#e2e8f0',borderRadius:20,overflow:'hidden'}}><div style={{width:`${plan.tasks.length?done/plan.tasks.length*100:0}%`,height:'100%',background:'#16a34a'}} /></div>
              <small style={{color:'#64748b'}}>{plan.notice}</small>
            </div>;
          })}
        </section>
      )}

      <section
        className="calendar-container"
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: 20,
          marginTop: 20
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
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
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

            const key = dateKey(year, month, day);
            const events = eventsByDate.get(key) || [];

            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelectedDate(key)}
                className={[
                  'calendar-cell',
                  key === todayKey ? 'today' : '',
                  key === selectedDate ? 'selected' : ''
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
                    key === todayKey
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
                      key === todayKey
                        ? '#2563eb'
                        : 'transparent',
                    color:
                      key === todayKey
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
                        `${event.name} ${event.round} ` +
                        `${event.label}: ${event.start} ~ ${event.end}`
                      }
                      style={{
                        fontSize: 11,
                        color: COLOR[event.kind],
                        background: `${COLOR[event.kind]}12`,
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

      <section
        className="calendar-detail"
        style={{
          marginTop: 18,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: 22
        }}
      >
        <h3>
          {selectedDate
            ? `${selectedDate} 일정 (${selectedEvents.length}개)`
            : '날짜를 선택해 일정을 확인하세요'}
        </h3>

        {selectedDate && selectedEvents.length === 0 && (
          <p style={{ color: '#64748b' }}>
            이 날짜에 조회된 시험일정이 없습니다.
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
              {event.name} {event.round} — {event.label}
            </strong>

            {event.kind === 'study' && (
              <label style={{display:'block',marginTop:8,color:'#166534'}}>
                <input type="checkbox" checked={event.task.completed} onChange={()=>toggleStudyTask(event.task)} />
                {' '}공부 완료 · 권장 {event.task.hours}시간
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
          시험 일정은 Q-Net API 기반이며, 초록색 공부 일정은 사용자 입력에 따라 생성한 추정 학습계획입니다.
          실제 개인별 시험일·접수 가능 기간은
          Q-Net 공고에서 다시 확인하세요.
        </p>
      </section>
    </div>
  );
}
