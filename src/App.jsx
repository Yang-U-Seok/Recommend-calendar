
import { useState } from 'react'
import './App.css'
import QnetSearch from './QnetSearch'

function App() {
  // 현재 페이지
  const [page, setPage] = useState('home')

  // 로그인 사용자 (실제 인증 연결 전)
  const [user, setUser] = useState(null)

  // 입력값
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // 페이지 이동
  const movePage = (nextPage) => {
    if (nextPage === 'calendar' && !user) {
      alert('캘린더를 이용하려면 로그인이 필요합니다.')
      setPage('login')
      return
    }

    setPage(nextPage)
  }

  // 로그인 (화면 테스트)
  const handleLogin = (e) => {
    e.preventDefault()

    if (!email.trim() || !password) {
      alert('이메일과 비밀번호를 입력해주세요.')
      return
    }

    alert('로그인 화면 테스트 성공! 실제 로그인 기능은 아직 연결되지 않았습니다.')
  }

  // 회원가입 (화면 테스트)
  const handleSignup = (e) => {
    e.preventDefault()

    if (!name.trim() || !email.trim() || !password) {
      alert('모든 항목을 입력해주세요.')
      return
    }

    if (password.length < 8) {
      alert('비밀번호는 8자 이상 입력해주세요.')
      return
    }

    alert('회원가입 화면 테스트 성공! 실제 계정은 아직 생성되지 않았습니다.')
  }

  // 로그아웃
  const handleLogout = () => {
    setUser(null)
    setEmail('')
    setPassword('')
    setPage('home')
  }

  return (
    <div className="app">

      {/* 홈페이지 상단 */}
      <header className="header">
        <div className="header-content">

          <div className="header-title">
            <h1>Recommender Calendar</h1>
            <p>자격증 및 취업 준비를 위한 맞춤형 추천 서비스</p>
          </div>

          {/* 오른쪽 로그인 / 회원가입 */}
          <div className="auth-buttons">
            {user ? (
              <>
                <span className="username">
                  {user.name}님
                </span>

                <button onClick={handleLogout}>
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setPage('login')}>
                  로그인
                </button>

                <button onClick={() => setPage('signup')}>
                  회원가입
                </button>
              </>
            )}
          </div>

        </div>
      </header>

      {/* 메뉴 */}
      <nav className="navbar">
        <button onClick={() => movePage('home')}>
          홈
        </button>

        <button onClick={() => movePage('certificate')}>
          자격증 추천
        </button>

        <button onClick={() => movePage('job')}>
          채용정보
        </button>

        <button onClick={() => movePage('calendar')}>
          캘린더
        </button>
      </nav>

      {/* 메인 콘텐츠 */}
      <main>

        {/* 홈 */}
        {page === 'home' && (
          <div className="home-page">
            <h2>환영합니다!</h2>
            <p>
              나에게 맞는 자격증과 취업 정보를 추천받고
              맞춤형 학습 캘린더를 만들어보세요.
            </p>
          </div>
        )}

        {/* 자격증 추천 */}
        {page === 'certificate' && (
          <div>
            <h2>자격증 추천 페이지</h2>
            <p>관심 분야에 맞는 자격증을 추천합니다.</p>
            <QnetSearch />
          </div>
        )}

        {/* 채용정보 */}
        {page === 'job' && (
          <div>
            <h2>채용정보 페이지</h2>
            <p>관심 직무와 관련된 채용정보를 확인하세요.</p>
          </div>
        )}

        {/* 개인 캘린더 */}
        {page === 'calendar' && user && (
          <div>
            <h2>나의 학습 캘린더</h2>
            <p>{user.name}님의 맞춤형 학습 일정입니다.</p>
          </div>
        )}

        {/* 로그인 */}
        {page === 'login' && (
          <div className="auth-container">
            <h2>로그인</h2>
            <p>맞춤형 캘린더 서비스를 시작하세요.</p>

            <form onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              <button type="submit" className="submit-btn">
                로그인
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

        {/* 회원가입 */}
        {page === 'signup' && (
          <div className="auth-container">
            <h2>회원가입</h2>
            <p>나만의 맞춤형 캘린더를 만들어보세요.</p>

            <form onSubmit={handleSignup}>
              <input
                type="text"
                placeholder="이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />

              <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <input
                type="password"
                placeholder="비밀번호 (8자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />

              <button type="submit" className="submit-btn">
                회원가입
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