
import { useState } from 'react'
import './App.css'

function App() {
  const [page, setPage] = useState('home')

  return (
    <div className="app">
      <header>
        <h1>Recommender Calendar</h1>
        <p>자격증 및 취업 준비를 위한 맞춤형 추천 서비스</p>
      </header>

      <nav>
        <button onClick={() => setPage('home')}>홈</button>
        <button onClick={() => setPage('certificate')}>자격증 추천</button>
        <button onClick={() => setPage('job')}>채용정보</button>
        <button onClick={() => setPage('calendar')}>캘린더</button>
      </nav>

      <main>
        {page === 'home' && <h2>환영합니다!</h2>}
        {page === 'certificate' && <h2>자격증 추천 페이지</h2>}
        {page === 'job' && <h2>채용정보 페이지</h2>}
        {page === 'calendar' && <h2>나의 학습 캘린더</h2>}
      </main>
    </div>
  )
}

export default App
