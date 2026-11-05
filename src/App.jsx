
import { useEffect, useState } from 'react'
import './App.css'
import Calendar from './Calendar'
import QnetSearch from './QnetSearch'
import JobSearch from './JobSearch'

// 개발용 가상 채용공고 데이터
const sampleJobs = [
  {
    company: '가상기업 A',
    field: 'IT·소프트웨어',
    size: '대기업',
    required: ['정보처리기사'],
    preferred: ['SQLD']
  },
  {
    company: '가상기업 B',
    field: 'IT·소프트웨어',
    size: '중견기업',
    required: [],
    preferred: ['정보처리기사', 'SQLD']
  },
  {
    company: '가상기업 C',
    field: 'IT·소프트웨어',
    size: '중소기업',
    required: [],
    preferred: ['정보처리기사']
  },
  {
    company: '가상기업 D',
    field: '네트워크·통신·클라우드',
    size: '대기업',
    required: ['정보통신기사'],
    preferred: ['네트워크관리사']
  },
  {
    company: '가상기업 E',
    field: '네트워크·통신·클라우드',
    size: '중견기업',
    required: [],
    preferred: ['정보통신기사', '리눅스마스터']
  },
  {
    company: '가상기업 F',
    field: '네트워크·통신·클라우드',
    size: '중소기업',
    required: [],
    preferred: ['네트워크관리사', '리눅스마스터']
  },
  {
    company: '가상기업 G',
    field: '정보보안',
    size: '대기업',
    required: [],
    preferred: ['정보보안기사', '정보처리기사']
  },
  {
    company: '가상기업 H',
    field: '정보보안',
    size: '중견기업',
    required: [],
    preferred: ['정보보안기사']
  },
  {
    company: '가상기업 I',
    field: '정보보안',
    size: '중소기업',
    required: [],
    preferred: ['정보보안기사', '네트워크관리사']
  },
  {
    company: '가상기업 J',
    field: '경영·회계·금융',
    size: '대기업',
    required: [],
    preferred: ['재경관리사', '전산회계 1급']
  },
  {
    company: '가상기업 K',
    field: '경영·회계·금융',
    size: '중견기업',
    required: [],
    preferred: ['전산회계 1급']
  },
  {
    company: '가상기업 L',
    field: '경영·회계·금융',
    size: '중소기업',
    required: [],
    preferred: ['전산회계 1급', '전산회계 2급']
  }
]

const interestFields = [
  'IT·소프트웨어',
  '네트워크·통신·클라우드',
  '정보보안',
  '경영·회계·금융'
]

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

  // CBT 진단
  const [selectedCertificate, setSelectedCertificate] = useState('')
  const [scoreInputType, setScoreInputType] = useState('score')
  const [cbtScore, setCbtScore] = useState('')
  const [cbtMaxScore, setCbtMaxScore] = useState('')
  const [diagnosisResult, setDiagnosisResult] = useState(null)

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
    if (selectedFields.includes(field)) {
      setSelectedFields(prev =>
        prev.filter(item => item !== field)
      )
    } else if (selectedFields.length < 3) {
      setSelectedFields(prev => [...prev, field])
    } else {
      alert('관심 분야는 최대 3개까지 선택할 수 있습니다.')
    }

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

  const checkSelection = () => {
    if (selectedFields.length === 0) {
      alert('관심 분야를 하나 이상 선택해주세요.')
      return
    }

    const filteredJobs = sampleJobs.filter(job => {
      const fieldMatch = selectedFields.includes(job.field)

      const sizeMatch =
        selectedCompanySizes.length === 0 ||
        selectedCompanySizes.includes(job.size)

      return fieldMatch && sizeMatch
    })

    setMatchedJobCount(filteredJobs.length)

    const stats = {}

    filteredJobs.forEach(job => {
      const certificates = new Set([
        ...job.required,
        ...job.preferred
      ])

      certificates.forEach(cert => {
        if (!stats[cert]) {
          stats[cert] = {
            certificate: cert,
            count: 0,
            required: 0,
            preferred: 0,
            score: 0
          }
        }

        stats[cert].count += 1

        if (job.required.includes(cert)) {
          stats[cert].required += 1
          stats[cert].score += 2
        } else {
          stats[cert].preferred += 1
          stats[cert].score += 1
        }
      })
    })

    const sortedResult = Object.values(stats).sort(
      (a, b) =>
        b.score - a.score ||
        b.count - a.count ||
        a.certificate.localeCompare(b.certificate, 'ko')
    )

    setRecommendations(sortedResult)
    setHasRecommended(true)
  }

  // ==========================================
  // 5. CBT 점수 계산
  // ==========================================

  const calculateCbtScore = () => {
    if (!selectedCertificate) {
      alert('준비할 자격증을 선택해주세요.')
      return
    }

    if (cbtScore.trim() === '' || cbtMaxScore.trim() === '') {
      alert('획득 점수와 만점을 입력해주세요.')
      return
    }

    const score = Number(cbtScore)
    const maxScore = Number(cbtMaxScore)

    if (
      !Number.isFinite(score) ||
      !Number.isFinite(maxScore) ||
      maxScore <= 0 ||
      score < 0 ||
      score > maxScore
    ) {
      alert('점수를 올바르게 입력해주세요.')
      return
    }

    if (
      scoreInputType === 'count' &&
      (!Number.isInteger(score) || !Number.isInteger(maxScore))
    ) {
      alert('문항 수는 정수로 입력해주세요.')
      return
    }

    const normalizedScore = (score / maxScore) * 100

    setDiagnosisResult({
      certificate: selectedCertificate,
      score: normalizedScore.toFixed(1)
    })
  }

  // ==========================================
  // 6. 화면
  // ==========================================

  return (
    <div className="app">

      {/* 상단 헤더 */}
      <header className="header">
        <div className="header-content">

          <div className="header-title">
            <h1>Recommender Calendar</h1>
            <p>
              자격증 및 취업 준비를 위한 맞춤형 추천 서비스
            </p>
          </div>

          <div className="auth-buttons">
            {authChecking ? (
              <span className="username">로그인 확인 중...</span>
            ) : user ? (
              <>
                <span className="username">
                  {user.name}님
                </span>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={authLoading}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPage('login')}
                >
                  로그인
                </button>

                <button
                  type="button"
                  onClick={() => setPage('signup')}
                >
                  회원가입
                </button>
              </>
            )}
          </div>

        </div>
      </header>

      {/* 상단 메뉴 */}
      <nav className="navbar">

        <button
          className={page === 'home' ? 'active' : ''}
          onClick={() => movePage('home')}
        >
          홈
        </button>

        <button
          className={
            page === 'certificate' || page === 'diagnosis'
              ? 'active'
              : ''
          }
          onClick={() => movePage('certificate')}
        >
          자격증 추천
        </button>

        <button
          className={page === 'qnet' ? 'active' : ''}
          onClick={() => movePage('qnet')}
        >
          자격증 정보
        </button>

        <button
          className={page === 'job' ? 'active' : ''}
          onClick={() => movePage('job')}
        >
          채용정보
        </button>

        <button
          className={page === 'calendar' ? 'active' : ''}
          onClick={() => movePage('calendar')}
        >
          캘린더
        </button>

      </nav>

      <main>

        {/* =====================================
            홈
        ===================================== */}

        {page === 'home' && (
          <div className="home-page">

            <section className="home-hero">
              <h2>
                취업 목표에 맞는 자격증부터
                <br />
                공부 일정까지 한 번에
              </h2>

              <p>
                관심 분야와 희망 기업 규모를 고르면
                채용공고를 분석해 자격증을 추천하고,
                현재 실력에 맞춘 학습 캘린더를 만들어 드립니다.
              </p>

              <button
                type="button"
                className="home-cta"
                onClick={() => movePage('certificate')}
              >
                자격증 추천 시작하기 →
              </button>
            </section>

            <div className="home-features">
              {[
                {
                  step: 'STEP 1',
                  title: '맞춤형 자격증 추천',
                  text: '관심 분야·기업 규모에 맞는 채용공고의 필수·우대 자격증을 분석해요.',
                  target: 'certificate'
                },
                {
                  step: 'STEP 2',
                  title: '자격증 정보 확인',
                  text: '합격률, 평균 취득소요기간, 시험일정을 Q-Net 데이터로 확인해요.',
                  target: 'qnet'
                },
                {
                  step: 'STEP 3',
                  title: '나의 학습 캘린더',
                  text: '진단 결과와 시험일까지 남은 기간으로 학습 일정을 관리해요.',
                  target: 'calendar'
                }
              ].map(feature => (
                <button
                  key={feature.target}
                  type="button"
                  className="home-feature"
                  onClick={() => movePage(feature.target)}
                >
                  <span className="home-feature-step">
                    {feature.step}
                  </span>

                  <strong>{feature.title}</strong>
                  <span>{feature.text}</span>
                </button>
              ))}
            </div>

          </div>
        )}

        {/* =====================================
            자격증 추천
        ===================================== */}

        {page === 'certificate' && (
          <div className="recommend-page">

            <h2>맞춤형 자격증 추천</h2>
            <p>관심 분야와 희망 기업 규모를 선택해주세요.</p>

            <section className="selection-box">
              <h3>1. 관심 분야 선택</h3>

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

              <p>선택한 분야: {selectedFields.length}/3</p>
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
            >
              자격증 추천받기
            </button>

            {hasRecommended && (
              <section className="selection-box">

                <h3>3. 맞춤형 자격증 추천 결과</h3>

                <p>
                  분석한 샘플 채용공고: {matchedJobCount}건
                </p>

                {recommendations.length === 0 ? (
                  <p>조건에 맞는 자격증이 없습니다.</p>
                ) : (
                  <div className="recommend-results">

                    {recommendations.slice(0, 5).map((item, index) => (
                      <div
                        className="recommend-result-item"
                        key={item.certificate}
                      >
                        <h4>
                          {index + 1}위 · {item.certificate}
                        </h4>

                        <p>등장 공고: {item.count}건</p>
                        <p>필수: {item.required}건</p>
                        <p>우대: {item.preferred}건</p>

                        <strong>
                          추천 점수: {item.score}점
                        </strong>

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
                  ※ 개발용 가상 채용공고를 활용한 추천 결과입니다.
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

            <h2>학습 진단</h2>

            <p>
              선택한 자격증: {selectedCertificate}
            </p>

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
                      <option value="count">
                        맞힌 문항 수로 입력
                      </option>
                    </select>
                  </label>

                  <label className="cbt-field">
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
                  </label>

                  <label className="cbt-field">
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
                  </label>

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
                      현재는 CBT 점수 환산 결과만 지원하며,
                      학습 부담도 계산은 추후 추가될 예정입니다.
                    </p>

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
          <Calendar user={user} />
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

      </main>
    </div>
  )
}

export default App
