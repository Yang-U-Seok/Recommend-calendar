
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { calculateStudyPlan } = require('./studyAlgorithm');
const { findPassRate, normalizeName } = require('./studyData');

const router = express.Router();
const db = new Database(path.join(__dirname, 'users.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    certificate_name TEXT NOT NULL,
    exam_type TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    estimated_hours REAL NOT NULL,
    required_daily_hours REAL NOT NULL,
    available_hours REAL NOT NULL,
    feasible INTEGER NOT NULL,
    pass_rate REAL,
    average_days REAL,
    notice TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS study_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    hours REAL NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(plan_id)
      REFERENCES study_plans(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_study_plan_user
    ON study_plans(user_id);

  CREATE INDEX IF NOT EXISTS idx_study_task_plan
    ON study_tasks(plan_id);
`);

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS mock_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    certificate_name TEXT NOT NULL,
    exam_type TEXT NOT NULL,
    mock_date TEXT NOT NULL,
    score REAL NOT NULL,
    subjects_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_mock_user
    ON mock_results(user_id);
`);

// 로그인 검사
function auth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({
      success: false,
      message: '로그인이 필요합니다.'
    });
  }

  next();
}

router.use(auth);

// 저장된 모의고사 성적 조회
router.get('/mock-results', (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM mock_results
    WHERE user_id = ?
    ORDER BY mock_date DESC, id DESC
  `).all(req.session.userId);

  res.json({
    success: true,
    items: rows.map(r => ({
      id: r.id,
      certificateName: r.certificate_name,
      examType: r.exam_type,
      mockDate: r.mock_date,
      score: r.score,
      subjects: JSON.parse(r.subjects_json)
    }))
  });
});

// 외부 CBT 성적 저장
router.post('/mock-results', (req, res) => {
  const {
    certificateName,
    examType,
    mockDate,
    score,
    subjects = []
  } = req.body || {};

  if (
    typeof certificateName !== 'string' ||
    !certificateName.trim() ||
    certificateName.length > 100 ||
    !['written', 'practical'].includes(examType) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(mockDate)) ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100 ||
    !Array.isArray(subjects) ||
    subjects.length > 30 ||
    subjects.some(s =>
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 100 ||
      !Number.isFinite(s.score) ||
      s.score < 0 ||
      s.score > 100
    )
  ) {
    return res.status(400).json({
      success: false,
      message: '성적 입력값이 올바르지 않습니다.'
    });
  }

  const result = db.prepare(`
    INSERT INTO mock_results
    (
      user_id,
      certificate_name,
      exam_type,
      mock_date,
      score,
      subjects_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.session.userId,
    certificateName.trim(),
    examType,
    mockDate,
    score,
    JSON.stringify(subjects)
  );

  res.status(201).json({
    success: true,
    id: Number(result.lastInsertRowid)
  });
});

const normalize = normalizeName;

const numeric = v => {
  const n = Number(
    String(v ?? '').replace('%', '').trim()
  );

  return Number.isFinite(n) ? n : null;
};

// 기존 Q-Net API 호출
async function internalGet(req, route, params) {
  const url = new URL(
    `http://127.0.0.1:${process.env.PORT || 3001}${route}`
  );

  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, String(v));
  });

  const response = await fetch(url, {
    signal: AbortSignal.timeout(90000)
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || `${route} 조회 실패`);
  }

  return data;
}

// 사용자별 학습계획 목록
function list(req) {
  const plans = db.prepare(`
    SELECT *
    FROM study_plans
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(req.session.userId);

  const getTasks = db.prepare(`
    SELECT id, date, title, hours, completed
    FROM study_tasks
    WHERE plan_id = ?
    ORDER BY date, id
  `);

  return plans.map(p => ({
    id: p.id,
    certificateName: p.certificate_name,
    examType: p.exam_type,
    examDate: p.exam_date,
    estimatedHours: p.estimated_hours,
    requiredDailyHours: p.required_daily_hours,
    availableHours: p.available_hours,
    feasible: Boolean(p.feasible),
    passRate: p.pass_rate,
    averageDays: p.average_days,
    notice: p.notice,
    tasks: getTasks.all(p.id).map(t => ({
      ...t,
      completed: Boolean(t.completed)
    }))
  }));
}

// 학습계획 조회
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: list(req)
  });
});

// 맞춤형 학습계획 생성
router.post('/plans', async (req, res) => {
  try {
    const {
      certificateName,
      grade = '30',
      examType = 'written',
      examDate,
      level = 'beginner',
      dailyHours = 2,
      studyDays = [1, 2, 3, 4, 5, 6]
    } = req.body || {};

    const name = String(certificateName || '').trim();

    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: '자격증 이름이 올바르지 않습니다.'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(examDate || ''))) {
      return res.status(400).json({
        success: false,
        message: '시험일을 선택하세요.'
      });
    }

    // Q-Net 합격률 및 평균 취득기간 조회
    const [rates, terms] = await Promise.allSettled([
      internalGet(req, '/api/qnet/pass-rate', {
        year: new Date().getFullYear() - 1,
        grade,
        keyword: name
      }),

      internalGet(req, '/api/qnet/acquisition-term', {
        year: 2023,
        grade,
        keyword: name
      })
    ]);

    const rateRows =
      rates.status === 'fulfilled'
        ? rates.value.items
        : [];

    const termRows =
      terms.status === 'fulfilled'
        ? terms.value.items
        : [];

    const typeLabel =
      examType === 'written' ? '필기' : '실기';

    const matching = findPassRate(
      rateRows,
      name,
      typeLabel
    );

    const passRate = matching?.passRate ?? null;

    const term = termRows.find(
      x => normalize(x.name) === normalize(name)
    );

    const averageDays = numeric(term?.averageDays);

    // 해당 자격증의 가장 최근 CBT 성적
    
const mockCandidates = db.prepare(`
  SELECT *
  FROM mock_results
  WHERE user_id = ?
    AND exam_type = ?
  ORDER BY mock_date DESC, id DESC
`).all(
  req.session.userId,
  examType
);

const mock = mockCandidates.find(
  item =>
    normalize(item.certificate_name) === normalize(name)
) || null;


    const result = calculateStudyPlan({
      certificateName: name,
      examType,
      examDate,
      level,
      dailyHours: Number(dailyHours),
      studyDays,
      passRate,
      averageDays,
      mockScore: mock ? mock.score : null,
      subjects: mock
        ? JSON.parse(mock.subjects_json)
        : []
    });

    // 학습계획과 날짜별 일정 저장
    const insert = db.transaction(() => {
      const p = db.prepare(`
        INSERT INTO study_plans
        (
          user_id,
          certificate_name,
          exam_type,
          exam_date,
          estimated_hours,
          required_daily_hours,
          available_hours,
          feasible,
          pass_rate,
          average_days,
          notice
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.session.userId,
        name,
        examType,
        result.examDate,
        result.estimatedHours,
        result.requiredDailyHours,
        result.availableHours,
        Number(result.feasible),
        passRate,
        averageDays,
        `${result.notice}${
          mock
            ? ` 최근 모의고사 ${mock.score}점 반영`
            : ' 모의고사 미입력: 기본 추정 사용'
        }`
      );

      const task = db.prepare(`
        INSERT INTO study_tasks
        (plan_id, date, title, hours)
        VALUES (?, ?, ?, ?)
      `);

      for (const e of result.events) {
        task.run(
          p.lastInsertRowid,
          e.date,
          e.title,
          e.hours
        );
      }

      return Number(p.lastInsertRowid);
    });

    const id = insert();

    res.status(201).json({
      success: true,
      plan: list(req).find(p => p.id === id),
      dataWarnings: [
        ...result.warnings,
        ...(
          rates.status === 'rejected'
            ? ['합격률 API 조회 실패']
            : []
        ),
        ...(
          terms.status === 'rejected'
            ? ['취득소요기간 API 조회 실패']
            : []
        )
      ]
    });

  } catch (error) {
    console.error('학습계획 생성 오류:', error);

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// 공부 완료 체크
router.patch('/tasks/:id', (req, res) => {
  const completed = req.body?.completed;

  if (typeof completed !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'completed는 boolean이어야 합니다.'
    });
  }

  const result = db.prepare(`
    UPDATE study_tasks
    SET completed = ?
    WHERE id = ?
      AND plan_id IN (
        SELECT id
        FROM study_plans
        WHERE user_id = ?
      )
  `).run(
    Number(completed),
    req.params.id,
    req.session.userId
  );

  if (!result.changes) {
    return res.status(404).json({
      success: false,
      message: '일정을 찾지 못했습니다.'
    });
  }

  res.json({ success: true });
});

// 학습계획 삭제
router.delete('/plans/:id', (req, res) => {
  const result = db.prepare(`
    DELETE FROM study_plans
    WHERE id = ? AND user_id = ?
  `).run(
    req.params.id,
    req.session.userId
  );

  if (!result.changes) {
    return res.status(404).json({
      success: false,
      message: '계획을 찾지 못했습니다.'
    });
  }

  res.json({ success: true });
});

module.exports = router;
