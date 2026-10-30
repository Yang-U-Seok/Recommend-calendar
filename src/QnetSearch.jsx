
import { useState } from 'react';

const API_BASE = 'http://localhost:3001';

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

  const searchCertificates = async (e) => {
    e.preventDefault();

    setLoading(true);
    setSearched(false);
    setPassError('');
    setTermError('');
    setItems([]);
    setTermItems([]);

    const params = new URLSearchParams({
      keyword,
      year,
      grade
    });

    const fetchApi = async (path) => {
      const response = await fetch(
        `${API_BASE}${path}?${params}`
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'API 조회 실패'
        );
      }

      return Array.isArray(result.items) ? result.items : [];
    };

    try {
      // 1. 합격률 API 먼저 요청
    const passResult = await Promise.allSettled([
     fetchApi('/api/qnet/pass-rate')
    ]).then((results) => results[0]);

// 2. 합격률 요청이 끝난 후 취득소요기간 API 요청
    const termResult = await Promise.allSettled([
    fetchApi('/api/qnet/acquisition-term')
    ]).then((results) => results[0]);

      if (passResult.status === 'fulfilled') {
        setItems(passResult.value);
      } else {
        setPassError(passResult.reason.message);
      }

      if (termResult.status === 'fulfilled') {
        setTermItems(termResult.value);
      } else {
        setTermError(termResult.reason.message);
      }

      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  // 백엔드에서 회차별 데이터가 이미 통합되어 있으므로
  // 프론트엔드에서는 다시 합산하지 않음
  const visibleItems = items.filter(
    (item) =>
      examType === 'all' || item.examType === examType
  );

  const formatNumber = (value) => {
    const number = Number(value);
    return value !== null &&
      value !== undefined &&
      value !== '' &&
      Number.isFinite(number)
      ? number.toLocaleString('ko-KR')
      : '-';
  };

  const formatDays = (value) => {
    const number = Number(value);

    if (
      value === null ||
      value === undefined ||
      value === '' ||
      !Number.isFinite(number)
    ) {
      return '-';
    }

    return `${number.toLocaleString('ko-KR', {
      maximumFractionDigits: 2
    })}일`;
  };

  return (
    <div className="qnet-search">
      <h2>국가기술자격 정보 검색</h2>
      <p>
        Q-Net 공공데이터를 이용해 자격증별 합격률과
        취득소요기간을 확인하세요.
      </p>

      <form
        onSubmit={searchCertificates}
        className="qnet-form"
      >
        <input
          type="text"
          placeholder="자격증 이름 (예: 정보처리기사)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="30">기사</option>
          <option value="31">산업기사</option>
          <option value="40">기능사</option>
          <option value="10">기술사</option>
          <option value="20">기능장</option>
          <option value="32">1급</option>
          <option value="33">2급</option>
        </select>

        <input
          type="number"
          min="2000"
          max="2100"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />

        <button type="submit" disabled={loading}>
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {loading && (
        <p>Q-Net 데이터를 조회하고 있습니다...</p>
      )}

      {searched && (
        <>
          {/* 첫 번째 API: 합격률 */}
          <div className="qnet-results-header">
            <h3>
              합격률 검색 결과: {visibleItems.length}건
            </h3>

            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
            >
              <option value="all">전체</option>
              <option value="필기">필기</option>
              <option value="실기">실기</option>
            </select>
          </div>

          {passError ? (
            <p style={{ color: 'red' }}>
              합격률 조회 오류: {passError}
            </p>
          ) : visibleItems.length === 0 ? (
            <p>해당 조건의 합격률 데이터가 없습니다.</p>
          ) : (
            <div className="qnet-table-wrap">
              <table className="qnet-table">
                <thead>
                  <tr>
                    <th>자격증명</th>
                    <th>시험</th>
                    <th>연도</th>
                    <th>응시자</th>
                    <th>합격자</th>
                    <th>합격률</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleItems.map((item, index) => (
                    <tr
                      key={`${item.name}-${item.examType}-${item.year}-${index}`}
                    >
                      <td>{item.name}</td>
                      <td>{item.examType}</td>
                      <td>{item.year}</td>
                      <td>{formatNumber(item.applicants)}</td>
                      <td>{formatNumber(item.passed)}</td>
                      <td>
                        <strong>{item.passRate}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 두 번째 API: 취득소요기간 */}
          <div
            className="qnet-results-header"
            style={{ marginTop: '32px' }}
          >
            <h3>
              평균 취득소요기간: {termItems.length}건
            </h3>
          </div>

          {termError ? (
            <p style={{ color: 'red' }}>
              취득소요기간 조회 오류: {termError}
            </p>
          ) : termItems.length === 0 ? (
            <p>해당 조건의 취득소요기간 데이터가 없습니다.</p>
          ) : (
            <div className="qnet-table-wrap">
              <table className="qnet-table">
                <thead>
                  <tr>
                    <th>자격증명</th>
                    <th>등급</th>
                    <th>통계연도</th>
                    <th>누계 평균 취득소요기간</th>
                  </tr>
                </thead>

                <tbody>
                  {termItems.map((item, index) => (
                    <tr key={`${item.name}-${item.year}-${index}`}>
                      <td>{item.name}</td>
                      <td>{item.grade}</td>
                      <td>{item.year}</td>
                      <td>
                        <strong>
                          {formatDays(item.averageDays)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p
            style={{
              fontSize: '13px',
              color: '#777',
              marginTop: '12px'
            }}
          >
            ※ 평균 취득소요기간은 Q-Net의 자격 취득
            통계이며, 개인의 실제 공부 기간과는 다를 수 있습니다.
          </p>
        </>
      )}
    </div>
  );
}

export default QnetSearch;
