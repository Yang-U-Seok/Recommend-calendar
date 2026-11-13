import { useEffect, useState } from 'react'
import './App.css'
import Calendar from './Calendar'
import QnetSearch from './QnetSearch'
import JobSearch from './JobSearch'

// 프런트엔드 선택지는 백엔드 FIELD_CATEGORY_MAP에서 변환합니다.
const interestFields = [
  '전체 분야',
  'IT·소프트웨어',
  '데이터·AI',
  '네트워크·통신·클라우드',
  '정보보안',
  '전기·전자',
  '기계·자동화',
  '건설·토목·안전',
  '경영·회계·금융',
  '사무·무역·물류',
  '환경·보건·서비스'

]


// UI 전용 아이콘: 별도 라이브러리 설치 없이 사용
function Icon({ name, size = 20, className = '' }) {
  const icons = {
    logo: <><path d="M6 17V7a2 2 0 0 1 2-2h5a5 5 0 0 1 0 10H6" /><path d="m13 15 5 5" /><path d="M6 11h7" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9 21v-7h6v7" /></>,
    sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
    book: <><path d="M4 5.5c3-1.3 5.8-1.2 8 .2v15c-2.2-1.4-5-1.5-8-.2V5.5Z" /><path d="M20 5.5c-3-1.3-5.8-1.2-8 .2v15c2.2-1.4 5-1.5 8-.2V5.5Z" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13a22 22 0 0 0 18 0" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 15h3M8 18h3" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    chart: <><path d="M4 20V10m6 10V4m6 16v-7m4 7H2" /></>,
    shield: <><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" /><path d="m9 12 2 2 4-4" /></>,
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name] || icons.sparkles}
    </svg>
  )
}

const API_BASE = 'http://localhost:3001'

function App() {
  // 현재 페이지
  const [page, setPage] = useState('home')

  // 로그인 사용자
  const [user, setUser] = useState(null)

  // 서버 인증 요청 중 중복 제출 방지
  const [authLoading, setAuthLoading] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)

  // 로그인 및 회원가입 입력값
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // 관심 분야
  const [selectedFields, setSelectedFields] = useState([])
  const [fieldSearch, setFieldSearch] = useState('')

  const filteredInterestFields = interestFields.filter(field =>
    field.toLowerCase().includes(
      fieldSearch.trim().toLowerCase()
    )
  )

  // 기업 규모 및 추천 결과
  const [selectedCompanySizes, setSelectedCompanySizes] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [matchedJobCount, setMatchedJobCount] = useState(0)
  const [hasRecommended, setHasRecommended] = useState(false)
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [recommendError, setRecommendError] = useState('')
  const [recommendNotice, setRecommendNotice] = useState('')

  // CBT 진단
  const [selectedCertificate, setSelectedCertificate] = useState('')
  const [scoreInputType, setScoreInputType] = useState('score')
  const [cbtScore, setCbtScore] = useState('')
  const [cbtMaxScore, setCbtMaxScore] = useState('')
  const [diagnosisResult, setDiagnosisResult] = useState(null)
  const [subjectScores, setSubjectScores] = useState([{ name: '', score: '' }])
  const [examType, setExamType] = useState('written')
  const [mockDate, setMockDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const [mockSaving, setMockSaving] = useState(false)
  const [mockError, setMockError] = useState('')

  // ==========================================
  // 1. 페이지 이동
  // ==========================================

  const movePage = nextPage => {
    // 로그인 여부와 관계없이 모든 페이지 접근 가능
    setPage(nextPage)
  }

  // ==========================================
  // 2. 로그인 / 회원가입
  // ==========================================

  // 새로고침 후에도 서버 세션을 통해 로그인 상태 복원
  useEffect(() => {
    let active = true

    fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include'
    })
      .then(async response => {
        if (!response.ok) throw new Error('로그인 상태 조회 실패')
        return response.json()
      })
      .then(data => {
        if (active) setUser(data.user || null)
      })
      .catch(error => {
        console.error('로그인 상태 확인 오류:', error)
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setAuthChecking(false)
      })

    return () => { active = false }
  }, [])

  const handleSignup = async e => {
    e.preventDefault()
    if (authLoading) return

    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedName || !trimmedEmail || password.length < 8) {
      alert('이름, 이메일, 8자 이상의 비밀번호를 입력해주세요.')
      return
    }

    setAuthLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || '회원가입에 실패했습니다.')
      }

      setUser(data.user)
      setPassword('')
      setPage('calendar')
      alert('회원가입이 완료되었습니다.')
    } catch (error) {
      alert(error.message || '서버 연결에 실패했습니다.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogin = async e => {
    e.preventDefault()
    if (authLoading) return

    setAuthLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || '로그인에 실패했습니다.')
      }

      setUser(data.user)
      setPassword('')
      setPage('calendar')
      alert('로그인 성공!')
    } catch (error) {
      alert(error.message || '서버 연결에 실패했습니다.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    if (authLoading) return
    setAuthLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || '로그아웃에 실패했습니다.')
      }

      setUser(null)
      setEmail('')
      setPassword('')
      setPage('calendar')
    } catch (error) {
      alert(error.message || '서버 연결에 실패했습니다.')
    } finally {
      setAuthLoading(false)
    }
  }

  // ==========================================
  // 3. 관심 분야 선택
  // ==========================================

  const toggleField = field => {
    setSelectedFields(prev => {
      if (field === '전체 분야') {
        return prev.includes('전체 분야') ? [] : ['전체 분야']
      }
      if (prev.includes(field)) return prev.filter(item => item !== field)
      const withoutAll = prev.filter(item => item !== '전체 분야')
      if (withoutAll.length >= 3) {
        alert('관심 분야는 최대 3개까지 선택할 수 있습니다.')
        return prev
      }
      return [...withoutAll, field]
    })
    setHasRecommended(false)
  }

  const toggleCompanySize = size => {
    setSelectedCompanySizes(prev =>
      prev.includes(size)
        ? prev.filter(item => item !== size)
        : [...prev, size]
    )

    setHasRecommended(false)
  }

  // ==========================================
  // 4. 자격증 추천
  // ==========================================

  const checkSelection = async () => {
    if (selectedFields.length === 0) {
      alert('관심 분야를 하나 이상 선택해주세요.')
      return
    }

    setRecommendLoading(true)
    setRecommendError('')
    setRecommendNotice('')
    setHasRecommended(false)

    try {
      const categories = selectedFields.includes('전체 분야')
        ? '전체'
        : selectedFields.join(',')
      const sizes = selectedCompanySizes.length
        ? selectedCompanySizes
        : ['전체']

      // 백엔드는 복수 분야를 한 번에 필터링하여 동일 직무 중복을 방지합니다.
      const responses = await Promise.all(sizes.map(async companySize => {
        const params = new URLSearchParams({ categories, companySize })
        const response = await fetch(
          `${API_BASE}/api/certificate-recommendations?${params.toString()}`
        )
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.message || '추천 API 조회에 실패했습니다.')
        }
        return data
      }))

      // 기업 규모 복수 선택 시에도 동일 직무는 중복 계산하지 않습니다.
      const certMap = new Map()
      const matchedPositions = new Set()
      for (const data of responses) {
        for (const cert of data.recommendations || []) {
          if (!certMap.has(cert.name)) {
            certMap.set(cert.name, { certificate: cert.name, positionMap: new Map() })
          }
          const entry = certMap.get(cert.name)
          for (const position of cert.positions || []) {
            const key = JSON.stringify([
              position.company, position.jobNoticeId, position.positionName
            ])
            matchedPositions.add(key)
            const previous = entry.positionMap.get(key)
            entry.positionMap.set(key, {
              ...position,
              required: Boolean(position.required || previous?.required),
              preferred: Boolean(position.preferred || previous?.preferred)
            })
          }
        }
      }

      const sortedResult = [...certMap.values()].map(entry => {
        const positions = [...entry.positionMap.values()]
        return {
          certificate: entry.certificate,
          count: positions.length,
          required: positions.filter(p => p.required).length,
          preferred: positions.filter(p => p.preferred).length,
          companies: [...new Set(positions.map(p => p.company))],
          positions
        }
      }).sort((a, b) =>
        b.count - a.count ||
        b.companies.length - a.companies.length ||
        a.certificate.localeCompare(b.certificate, 'ko')
      )

      setRecommendations(sortedResult)
      setMatchedJobCount(matchedPositions.size)
      setHasRecommended(true)
      if (!sortedResult.length) {
        setRecommendNotice('선택한 분야에 자격증이 명시된 직무가 없을 수 있습니다. 전체 분야로도 확인해 보세요.')
      }
    } catch (error) {
      setRecommendError(error.message || '추천 결과를 가져오지 못했습니다.')
      setRecommendations([])
      setMatchedJobCount(0)
      setHasRecommended(true)
    } finally {
      setRecommendLoading(false)
    }
  }

  // ==========================================
  // 5. CBT 점수 계산
  // ==========================================

  const calculateCbtScore = () => {
    if (!selectedCertificate) { alert('자격증을 선택해주세요.'); return }
    let normalizedScore, subjects = []
    if (scoreInputType === 'subject') {
      if (subjectScores.length > 30) {
        alert('과목은 최대 30개까지 입력할 수 있습니다.')
        return
      }
      if (!subjectScores.length || subjectScores.some(s => !s.name.trim() || s.score === '' || !Number.isFinite(Number(s.score)) || Number(s.score) < 0 || Number(s.score) > 100)) {
        alert('모든 과목의 이름과 0~100점 성적을 입력해주세요.'); return
      }
      if (new Set(subjectScores.map(s => s.name.trim())).size !== subjectScores.length) {
        alert('과목명이 중복되었습니다.'); return
      }
      subjects = subjectScores.map(s => ({ name: s.name.trim(), score: Number(s.score) }))
      normalizedScore = subjects.reduce((sum, s) => sum + s.score, 0) / subjects.length
    } else {
      if (cbtScore.trim() === '' || cbtMaxScore.trim() === '') { alert('점수와 만점을 입력해주세요.'); return }
      const score = Number(cbtScore), maxScore = Number(cbtMaxScore)
      if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore ||
        (scoreInputType === 'count' && (!Number.isInteger(score) || !Number.isInteger(maxScore)))) {
        alert('점수를 올바르게 입력해주세요.'); return
      }
      normalizedScore = score / maxScore * 100
    }
    setMockError('')
    setDiagnosisResult({ certificate: selectedCertificate, score: normalizedScore.toFixed(1), subjects, examType, mockDate })
  }

  const saveMockAndGoCalendar = async () => {
    if (!user?.id) { alert('성적을 저장하려면 로그인해주세요.'); setPage('login'); return }
    if (!diagnosisResult) return
    setMockSaving(true); setMockError('')
    try {
      const response = await fetch(`${API_BASE}/api/study/mock-results`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificateName: diagnosisResult.certificate, examType: diagnosisResult.examType,
          mockDate: diagnosisResult.mockDate, score: Number(diagnosisResult.score), subjects: diagnosisResult.subjects
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || '성적 저장 실패')
      setPage('calendar')
    } catch (error) { setMockError(error.message) }
    finally { setMockSaving(false) }
  }

  // ==========================================
  // 6. 화면
  // ==========================================

  return (
    <div className="app">

      {/* 상단 브랜드 바 */}
      <header className="header">
        <div className="header-content">
          <button type="button" className="brand" onClick={() => movePage('home')} aria-label="Recommender Calendar 홈으로 이동">
            <span className="brand-mark">
              <img src="/recommender-logo-1.png" alt="" />
            </span>
            <span className="brand-copy">
              <strong>Recommender <span>Calendar</span></strong>
              <small>나에게 맞는 자격증 로드맵</small>
            </span>
          </button>
          <div className="header-right">
            <div className="auth-buttons">
              {authChecking ? (
                <span className="username">로그인 확인 중...</span>
              ) : user ? (
                <>
                  <span className="username"><span className="user-avatar">{(user.name || 'U').slice(0, 1)}</span>{user.name}님</span>
                  <button type="button" className="button-ghost" onClick={handleLogout} disabled={authLoading}>로그아웃</button>
                </>
              ) : (
                <>
                  <button type="button" className="button-ghost" onClick={() => setPage('login')}>로그인</button>
                  <button type="button" className="button-primary" onClick={() => setPage('signup')}>시작하기 <Icon name="arrow" size={16} /></button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 좌측 네비게이션: 모바일에서는 가로 스크롤 메뉴 */}
      <nav className="navbar" aria-label="주요 메뉴">
        <div className="sidebar-caption">WORKSPACE</div>
        <button type="button" className={page === 'home' ? 'active' : ''} aria-current={page === 'home' ? 'page' : undefined} onClick={() => movePage('home')}>
          <Icon name="home" /><span className="nav-label">홈</span>
        </button>
        <button type="button" className={page === 'certificate' || page === 'diagnosis' ? 'active' : ''} aria-current={page === 'certificate' || page === 'diagnosis' ? 'page' : undefined} onClick={() => movePage('certificate')}>
          <Icon name="sparkles" /><span className="nav-label">자격증 추천</span>
        </button>
        <button type="button" className={page === 'qnet' ? 'active' : ''} aria-current={page === 'qnet' ? 'page' : undefined} onClick={() => movePage('qnet')}>
          <Icon name="book" /><span className="nav-label">자격증 정보</span>
        </button>
        <button type="button" className={page === 'job' ? 'active' : ''} aria-current={page === 'job' ? 'page' : undefined} onClick={() => movePage('job')}>
          <Icon name="briefcase" /><span className="nav-label">채용정보</span>
        </button>
        <button type="button" className={page === 'calendar' ? 'active' : ''} aria-current={page === 'calendar' ? 'page' : undefined} onClick={() => movePage('calendar')}>
          <Icon name="calendar" /><span className="nav-label">학습 캘린더</span>
        </button>
        <div className="sidebar-note">
          <span className="sidebar-note-icon"><Icon name="sparkles" size={19} /></span>
          <strong>작은 학습이 큰 변화를 만들어요.</strong>
          <span>자격증 탐색부터 공부 계획까지, 한곳에서 관리하세요.</span>
        </div>
      </nav>

      <main className="main-content">

        {/* =====================================
            홈
        ===================================== */}

        {page === 'home' && (
          <div className="home-page">
            <div className="page-eyebrow"><span className="eyebrow-dot" /> YOUR CERTIFICATION ROADMAP</div>
            <section className="home-hero">
              <div className="hero-content">
                <span className="hero-kicker"><Icon name="sparkles" size={15} /> 당신의 가능성을 계획으로</span>
                <h2>자격증 준비,<br /><em>막막함 대신 계획으로.</em></h2>
                <p>관심 분야에 맞는 자격증을 찾고, 시험 정보와 학습 수준을 바탕으로 나만의 공부 일정을 만들어 보세요.</p>
                <div className="hero-actions">
                  <button type="button" className="home-cta" onClick={() => movePage('certificate')}>
                    자격증 추천받기 <Icon name="arrow" size={18} />
                  </button>
                  <button type="button" className="home-secondary" onClick={() => movePage('calendar')}>내 캘린더 보기</button>
                </div>
                <div className="hero-footnote"><Icon name="check" size={15} /> Q-Net 자격증 정보 및 개인별 학습 관리 지원</div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="hero-card">
                  <div className="hero-card-heading"><span className="hero-card-icon"><Icon name="calendar" size={19} /></span><span>나의 학습 로드맵</span><span className="hero-live-dot" /></div>
                  <div className="hero-card-line"><span className="hero-step-number">01</span><div><strong>자격증 탐색</strong><small>관심 분야 · 기업 규모</small></div><span className="hero-step-check"><Icon name="check" size={14} /></span></div>
                  <div className="hero-card-line"><span className="hero-step-number">02</span><div><strong>학습 수준 진단</strong><small>CBT 점수 · 취약 과목</small></div><span className="hero-step-check"><Icon name="check" size={14} /></span></div>
                  <div className="hero-card-line"><span className="hero-step-number">03</span><div><strong>학습 일정 관리</strong><small>시험일 · 공부 가능 요일</small></div><span className="hero-step-calendar"><Icon name="calendar" size={15} /></span></div>
                  <div className="hero-card-bottom"><span>계획을 세우는 가장 쉬운 방법</span><Icon name="arrow" size={16} /></div>
                </div>
              </div>
            </section>

            <div className="section-heading">
              <div><span className="section-kicker">HOW IT WORKS</span><h3>이렇게 시작해 보세요</h3><p>목표 선택부터 학습 일정까지, 필요한 기능을 순서대로 이용할 수 있어요.</p></div>
              <span className="section-side-label">3 STEPS TO YOUR GOAL</span>
            </div>
            <div className="home-features">
              {[
                { step: '01', icon: 'sparkles', title: '나에게 맞는 자격증', text: '관심 분야와 기업 규모를 선택하고 관련 자격증을 추천받아요.', target: 'certificate', tag: '추천' },
                { step: '02', icon: 'chart', title: '시험 정보 한눈에', text: 'Q-Net 합격률과 취득 소요 기간 등 자격증 정보를 확인해요.', target: 'qnet', tag: '탐색' },
                { step: '03', icon: 'calendar', title: '맞춤형 학습 캘린더', text: 'CBT 결과와 시험 일정에 맞춰 개인별 학습 계획을 관리해요.', target: 'calendar', tag: '계획' },
              ].map(feature => (
                <button key={feature.target} type="button" className="home-feature" onClick={() => movePage(feature.target)}>
                  <span className="feature-top"><span className="feature-icon"><Icon name={feature.icon} size={22} /></span><span className="feature-step">STEP {feature.step}</span></span>
                  <strong>{feature.title}</strong>
                  <span className="feature-desc">{feature.text}</span>
                  <span className="feature-bottom">{feature.tag} 시작하기 <Icon name="arrow" size={17} /></span>
                </button>
              ))}
            </div>
            <p className="home-disclaimer">※ 자격증 추천 결과는 현재 개발용 가상 채용 공고 데이터를 바탕으로 제공됩니다.</p>
          </div>
        )}

        {/* =====================================
            자격증 추천
        ===================================== */}

        {page === 'certificate' && (
          <div className="recommend-page">

            <div className="page-heading"><span className="section-kicker">CERTIFICATE RECOMMENDATION</span><h2>맞춤형 자격증 추천</h2><p>관심 분야와 희망 기업 규모를 선택해 나에게 맞는 자격증을 찾아보세요.</p></div>

            <section className="selection-box">
              <div className="field-section-header">
                <h3>1. 관심 분야 선택</h3>

                <span className="field-selected-count">
                  선택한 분야: {selectedFields.length}/3
                </span>
              </div>

              <p>
                관심 분야를 검색하고 최소 1개,
                최대 3개까지 선택하세요.
              </p>

              <input
                type="search"
                className="field-search"
                placeholder="관심 분야 검색 (예: IT, 보안, 금융)"
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
              />

              <div className="option-group field-option-group">
                {filteredInterestFields.map(field => (
                  <label
                    key={field}
                    className="option-item"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field)}
                      onChange={() => toggleField(field)}
                    />
                    {field}
                  </label>
                ))}
              </div>

              {filteredInterestFields.length === 0 && (
                <p>검색 결과가 없습니다.</p>
              )}


            </section>

            <section className="selection-box">
              <h3>2. 희망 기업 규모 선택</h3>

              <p>
                복수 선택 가능하며,
                선택하지 않으면 전체 기업입니다.
              </p>

              <div className="option-group">
                {['대기업', '중견기업', '중소기업'].map(size => (
                  <label
                    key={size}
                    className="option-item"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCompanySizes.includes(size)}
                      onChange={() => toggleCompanySize(size)}
                    />
                    {size}
                  </label>
                ))}
              </div>
            </section>

            <button
              type="button"
              className="recommend-btn"
              onClick={checkSelection}
              disabled={recommendLoading}
            >
              {recommendLoading ? '추천 결과 불러오는 중...' : '자격증 추천받기'}
            </button>

            {hasRecommended && (
              <section className="selection-box">

                <h3>3. 맞춤형 자격증 추천 결과</h3>

                <p>
                  자격증이 명시된 분석 직무: {matchedJobCount}개
                </p>

                {recommendError && <p role="alert" style={{ color: '#dc2626' }}>{recommendError}</p>}
                {recommendNotice && <p>{recommendNotice}</p>}

                {recommendations.length === 0 ? (
                  <p>조건에 맞는 자격증이 없습니다.</p>
                ) : (
                  <div className="recommend-results">

                    {recommendations.slice(0, 5).map((item, index) => (
                      <div
                        className="recommend-result-item"
                        key={item.certificate}
                      >
                        <span className="result-rank">TOP {index + 1}</span>
                        <h4>{item.certificate}</h4>

                        <p>등장 직무: {item.count}개</p>
                        <p>필수자격란: {item.required}개</p>
                        <p>우대사항: {item.preferred}개</p>

                        <strong>등장 횟수 기준 {index + 1}위</strong>
                        <p>언급 기업: {item.companies.join(', ')}</p>

                        <button
                          type="button"
                          className="diagnosis-start-btn"
                          onClick={() => {
                            setSelectedCertificate(item.certificate)
                            setDiagnosisResult(null)
                            setPage('diagnosis')
                          }}
                        >
                          학습 진단 시작하기
                          <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    ))}

                  </div>
                )}

                <p className="sample-notice">
                  ※ 실제 수집한 삼성·LG 채용공고의 자격증 언급 직무를 기준으로 집계했습니다. 같은 직무에서 같은 자격증이 중복 언급되면 1회로 계산합니다. 기업 규모 미분류 기업은 규모 필터에서 제외될 수 있습니다.
                </p>

              </section>
            )}

          </div>
        )}

        {/* =====================================
            자격증 정보 (기존 Q-Net)
        ===================================== */}

        {page === 'qnet' && (
          <div className="qnet-page">
            <QnetSearch />
          </div>
        )}

        {/* =====================================
            학습 진단
        ===================================== */}

        {page === 'diagnosis' && (
          <div className="recommend-page">

            <div className="page-heading"><span className="section-kicker">LEARNING DIAGNOSIS</span><h2>학습 진단</h2><p>선택한 자격증: <strong>{selectedCertificate}</strong></p></div>

            {hasRecommended && recommendations.length > 0 && (
              <section className="selection-box">

                <h3>외부 CBT / 모의고사 점수 입력</h3>

                <p>
                  준비할 자격증을 선택하고
                  CBT 또는 모의고사 결과를 입력해주세요.
                </p>

                <div className="cbt-form">

                  <label className="cbt-field">
                    <span>준비할 자격증</span>

                    <select
                      value={selectedCertificate}
                      onChange={e => {
                        setSelectedCertificate(e.target.value)
                        setDiagnosisResult(null)
                      }}
                    >
                      <option value="">
                        자격증을 선택하세요
                      </option>

                      {recommendations.slice(0, 5).map(item => (
                        <option
                          key={item.certificate}
                          value={item.certificate}
                        >
                          {item.certificate}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="cbt-field">
                    <span>입력 방식</span>

                    <select
                      value={scoreInputType}
                      onChange={e => {
                        setScoreInputType(e.target.value)
                        setCbtScore('')
                        setCbtMaxScore('')
                        setDiagnosisResult(null)
                      }}
                    >
                      <option value="score">
                        점수로 입력
                      </option>
                      <option value="count">맞힌 문항 수로 입력</option>
                      <option value="subject">과목별 점수로 입력</option>
                    </select>
                  </label>

                  <label className="cbt-field"><span>시험 유형</span>
                    <select value={examType} onChange={e => { setExamType(e.target.value); setDiagnosisResult(null) }}>
                      <option value="written">필기</option><option value="practical">실기</option>
                    </select>
                  </label>
                  <label className="cbt-field"><span>모의고사 응시일</span>
                    <input type="date" value={mockDate} onChange={e => { setMockDate(e.target.value); setDiagnosisResult(null) }} />
                  </label>
                  {scoreInputType !== 'subject' && <label className="cbt-field">
                    <span>
                      {scoreInputType === 'score'
                        ? '획득 점수'
                        : '맞힌 문항 수'}
                    </span>

                    <input
                      type="number"
                      min="0"
                      step={scoreInputType === 'score' ? 'any' : '1'}
                      placeholder={
                        scoreInputType === 'score'
                          ? '예: 70'
                          : '예: 42'
                      }
                      value={cbtScore}
                      onChange={e => {
                        setCbtScore(e.target.value)
                        setDiagnosisResult(null)
                      }}
                    />
                  </label>}

                  {scoreInputType !== 'subject' && <label className="cbt-field">
                    <span>
                      {scoreInputType === 'score'
                        ? '만점'
                        : '전체 문항 수'}
                    </span>

                    <input
                      type="number"
                      min="1"
                      step={scoreInputType === 'score' ? 'any' : '1'}
                      placeholder={
                        scoreInputType === 'score'
                          ? '예: 100'
                          : '예: 60'
                      }
                      value={cbtMaxScore}
                      onChange={e => {
                        setCbtMaxScore(e.target.value)
                        setDiagnosisResult(null)
                      }}
                    />
                  </label>}
                  {scoreInputType === 'subject' && <div className="cbt-subjects">
                    <strong>외부 모의고사 과목별 점수 (100점 환산)</strong>
                    {subjectScores.map((s, i) => <div className="cbt-subject-row" key={i}>
                      <input aria-label={`과목 ${i + 1} 이름`} placeholder="과목명" value={s.name}
                        onChange={e => { setSubjectScores(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); setDiagnosisResult(null) }} />
                      <input aria-label={`과목 ${i + 1} 점수`} type="number" min="0" max="100" placeholder="점수" value={s.score}
                        onChange={e => { setSubjectScores(prev => prev.map((x, j) => j === i ? { ...x, score: e.target.value } : x)); setDiagnosisResult(null) }} />
                      <button type="button" disabled={subjectScores.length === 1} onClick={() => { setSubjectScores(prev => prev.filter((_, j) => j !== i)); setDiagnosisResult(null) }}>삭제</button>
                    </div>)}
                    <button type="button" onClick={() => { setSubjectScores(prev => [...prev, { name: '', score: '' }]); setDiagnosisResult(null) }}>+ 과목 추가</button>
                    <p>과목별 점수가 없는 자격증은 총점 입력을 이용하세요.</p>
                  </div>}

                </div>

                <button
                  type="button"
                  className="cbt-calculate-btn"
                  onClick={calculateCbtScore}
                >
                  CBT 점수 확인하기
                </button>

                {diagnosisResult && (
                  <div className="cbt-score-result">

                    <h3>CBT 점수 확인 결과</h3>

                    <p>
                      준비 자격증: {diagnosisResult.certificate}
                    </p>

                    <div className="cbt-normalized-score">
                      100점 환산: {diagnosisResult.score}점
                    </div>

                    <p>
                      과목별 점수가 있으면 취약 과목을 우선 배정합니다. 총점만 입력하면 전체 학습량을 보정합니다.
                    </p>

                    {diagnosisResult.subjects.length > 0 && <p>우선 보완 과목: {[...diagnosisResult.subjects].sort((a, b) => a.score - b.score)[0].name}</p>}
                    <button type="button" className="cbt-calculate-btn" onClick={saveMockAndGoCalendar} disabled={mockSaving}>
                      {mockSaving ? '저장 중...' : '성적 저장하고 캘린더로 이동'}
                    </button>
                    {mockError && <p style={{ color: '#dc2626' }}>{mockError}</p>}
                  </div>
                )}

              </section>
            )}

            <button
              type="button"
              className="diagnosis-back-btn"
              onClick={() => setPage('certificate')}
            >
              <span aria-hidden="true">←</span>
              자격증 추천으로 돌아가기
            </button>

          </div>
        )}

        {/* =====================================
            채용정보 (기존 기능 유지)
        ===================================== */}

        {page === 'job' && (
          <JobSearch />
        )}

        {/* =====================================
            캘린더 (수정된 핵심 부분)
        ===================================== */}

        {page === 'calendar' && (
          <Calendar user={user} initialDiagnosis={diagnosisResult} />
        )}

        {/* =====================================
            로그인
        ===================================== */}

        {page === 'login' && (
          <div className="auth-container">

            <h2>로그인</h2>

            <p>
              맞춤형 캘린더 서비스를 시작하세요.
            </p>

            <form onSubmit={handleLogin}>

              <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                type="submit"
                className="submit-btn"
              >
                {authLoading ? '로그인 중...' : '로그인'}
              </button>

            </form>

            <p className="auth-switch">
              계정이 없으신가요?{' '}

              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setPassword('')
                  setPage('signup')
                }}
              >
                회원가입
              </button>
            </p>

          </div>
        )}

        {/* =====================================
            회원가입
        ===================================== */}

        {page === 'signup' && (
          <div className="auth-container">

            <h2>회원가입</h2>

            <p>
              나만의 맞춤형 캘린더를 만들어보세요.
            </p>

            <form onSubmit={handleSignup}>

              <input
                type="text"
                placeholder="이름"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                required
              />

              <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <input
                type="password"
                placeholder="비밀번호 (8자 이상)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />

              <button
                type="submit"
                className="submit-btn"
              >
                {authLoading ? '가입 처리 중...' : '회원가입'}
              </button>

            </form>

            <p className="auth-switch">
              이미 계정이 있으신가요?{' '}

              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setPassword('')
                  setPage('login')
                }}
              >
                로그인
              </button>
            </p>

          </div>
        )}

        <footer className="site-footer"><span>© Recommender Calendar</span><span>학습 목표를 현실로 만드는 작은 시작</span></footer>
      </main>
    </div>
  )
}

export default App