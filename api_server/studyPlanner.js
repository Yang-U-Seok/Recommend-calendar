
/**
 * studyPlanner.js
 *
 * 합격률이 있는 자격증:
 *   기존 합격률 기반 알고리즘 사용
 *
 * 합격률이 없는 자격증:
 *   저장된 모의고사 점수 기반 알고리즘 사용
 *
 * 모의고사도 없는 경우:
 *   기본 학습계획 생성
 */

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const {
  calculateStudyPlan,
  estimatePreparation
} = require('./studyAlgorithm');

const {
  findPassRate,
  normalizeName
} = require('./studyData');

const router = express.Router();

const db = new Database(
  path.join(__dirname, 'users.db')
);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ==========================================
// 1. 데이터베이스
// ==========================================

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

  CREATE INDEX IF NOT EXISTS idx_study_plan_user
    ON study_plans(user_id);

  CREATE INDEX IF NOT EXISTS idx_study_task_plan
    ON study_tasks(plan_id);

  CREATE INDEX IF NOT EXISTS idx_mock_user
    ON mock_results(user_id);
`);

// 기존 DB를 삭제하지 않고 컬럼 추가
const planColumns = db
  .prepare('PRAGMA table_info(study_plans)')
  .all()
  .map(column => column.name);

if (!planColumns.includes('algorithm_type')) {
  db.exec(`
    ALTER TABLE study_plans
    ADD COLUMN algorithm_type TEXT
  `);
}

// ==========================================
// 2. 로그인 검사
// ==========================================

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

// ==========================================
// 3. 공통 함수
// ==========================================

const normalize = normalizeName;

function numeric(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const number = Number(
    String(value).replace(/[%,\s]/g, '')
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function validRate(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

function isValidDate(value) {
  const text = String(value || '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const [year, month, day] = text
    .split('-')
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validStudyDays(days) {
  return (
    Array.isArray(days) &&
    days.length > 0 &&
    days.every(
      day =>
        Number.isInteger(day) &&
        day >= 0 &&
        day <= 6
    )
  );
}

function safeSubjects(value) {
  try {
    const parsed = JSON.parse(value || '[]');

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

// Q-Net에서 조회하지 않을 별도 시행기관 자격증
// 추가할 자격증이 생기면 이 목록에 등록
const EXTERNAL_CERTIFICATES = new Set([
  '정보보안기사',
  '정보보안산업기사'
]);

function isExternalCertificate(name) {
  return EXTERNAL_CERTIFICATES.has(
    normalize(name)
  );
}

// ==========================================
// 4. 내부 API 호출
// ==========================================

async function internalGet(route, params) {
  const port = process.env.PORT || 3001;

  const url = new URL(
    `http://127.0.0.1:${port}${route}`
  );

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  });

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
      data.error ||
      `${route} 조회 실패`
    );
  }

  return data;
}

// ==========================================
// 5. 합격률 및 취득소요기간 조회
// ==========================================

async function loadStageStatistics(
  certificateName,
  grade
) {
  const currentYear = new Date().getFullYear();

  let writtenPassRate = null;
  let practicalPassRate = null;
  let averageDays = null;

  const warnings = [];

  // 정보보안기사 등 별도 시행기관 자격증은
  // Q-Net 조회를 생략하고 모의고사 기반으로 처리
  if (isExternalCertificate(certificateName)) {
    return {
      writtenPassRate: null,
      practicalPassRate: null,
      averageDays: null,
      passRateSource: 'NONE',
      acquisitionSource: null,
      warnings: [
        '별도 시행기관 자격증: Q-Net 통계 조회 생략'
      ]
    };
  }

  const years = [
    currentYear - 1,
    currentYear - 2,
    currentYear - 3
  ];

  for (const year of years) {
    try {
      const data = await internalGet(
        '/api/qnet/pass-rate',
        {
          year,
          grade,
          keyword: certificateName
        }
      );

      const rows = Array.isArray(data.items)
        ? data.items
        : [];

      const written = numeric(
        findPassRate(
          rows,
          certificateName,
          '필기'
        )?.passRate
      );

      const practical = numeric(
        findPassRate(
          rows,
          certificateName,
          '실기'
        )?.passRate
      );

      if (
        writtenPassRate === null &&
        validRate(written)
      ) {
        writtenPassRate = written;
      }

      if (
        practicalPassRate === null &&
        validRate(practical)
      ) {
        practicalPassRate = practical;
      }

      if (
        writtenPassRate !== null &&
        practicalPassRate !== null
      ) {
        break;
      }

    } catch (error) {
      warnings.push(
        `${year} 합격률 조회 실패: ${error.message}`
      );
    }
  }

  const termYears = [
    ...new Set([...years, 2023])
  ];

  for (const year of termYears) {
    try {
      const data = await internalGet(
        '/api/qnet/acquisition-term',
        {
          year,
          grade,
          keyword: certificateName
        }
      );

      const rows = Array.isArray(data.items)
        ? data.items
        : [];

      const match = rows.find(row =>
        normalize(
          row.name ??
          row.jmNm ??
          row.qualName ??
          ''
        ) === normalize(certificateName)
      );

      const value = numeric(
        match?.averageDays ??
        match?.accumAcquAvgTermDays
      );

      if (value !== null && value > 0) {
        averageDays = value;
        break;
      }

    } catch (error) {
      warnings.push(
        `${year} 취득소요기간 조회 실패: ${error.message}`
      );
    }
  }

  return {
    writtenPassRate,
    practicalPassRate,
    averageDays,

    passRateSource:
      writtenPassRate !== null ||
      practicalPassRate !== null
        ? 'QNET'
        : 'NONE',

    acquisitionSource:
      averageDays !== null
        ? 'QNET'
        : null,

    warnings
  };
}

// ==========================================
// 6. 최근 모의고사 조회
// ==========================================

function findLatestMock(
  userId,
  certificateName,
  examType
) {
  const rows = db.prepare(`
    SELECT *
    FROM mock_results
    WHERE user_id = ?
      AND exam_type = ?
    ORDER BY mock_date DESC, id DESC
  `).all(userId, examType);

  return rows.find(
    row =>
      normalize(row.certificate_name) ===
      normalize(certificateName)
  ) || null;
}

// ==========================================
// 7. 모의고사 목록
// ==========================================

router.get('/mock-results', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT *
      FROM mock_results
      WHERE user_id = ?
      ORDER BY mock_date DESC, id DESC
    `).all(req.session.userId);

    res.json({
      success: true,
      items: rows.map(row => ({
        id: row.id,
        certificateName: row.certificate_name,
        examType: row.exam_type,
        mockDate: row.mock_date,
        score: row.score,
        subjects: safeSubjects(row.subjects_json)
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 8. 모의고사 저장
// ==========================================

router.post('/mock-results', (req, res) => {
  try {
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
      !isValidDate(mockDate) ||
      !validRate(score) ||
      !Array.isArray(subjects) ||
      subjects.length > 30 ||
      subjects.some(subject =>
        !subject ||
        typeof subject.name !== 'string' ||
        !subject.name.trim() ||
        subject.name.length > 100 ||
        !validRate(subject.score)
      )
    ) {
      return res.status(400).json({
        success: false,
        message: '성적 입력값이 올바르지 않습니다.'
      });
    }

    const result = db.prepare(`
      INSERT INTO mock_results (
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

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 9. 모의고사 삭제
// ==========================================

router.delete('/mock-results/:id', (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: '올바르지 않은 성적 ID입니다.'
      });
    }

    const result = db.prepare(`
      DELETE FROM mock_results
      WHERE id = ?
        AND user_id = ?
    `).run(id, req.session.userId);

    if (!result.changes) {
      return res.status(404).json({
        success: false,
        message: '삭제할 성적을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '모의고사 성적이 삭제되었습니다.'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 10. 학습계획 목록
// ==========================================

function list(req) {
  const plans = db.prepare(`
    SELECT *
    FROM study_plans
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(req.session.userId);

  const getTasks = db.prepare(`
    SELECT
      id,
      date,
      title,
      hours,
      completed
    FROM study_tasks
    WHERE plan_id = ?
    ORDER BY date, id
  `);

  return plans.map(plan => ({
    id: plan.id,
    certificateName: plan.certificate_name,
    examType: plan.exam_type,
    examDate: plan.exam_date,

    estimatedHours: plan.estimated_hours,
    requiredDailyHours: plan.required_daily_hours,
    availableHours: plan.available_hours,

    feasible: Boolean(plan.feasible),
    feasibilityAssessed: true,

    passRate: plan.pass_rate,
    averageDays: plan.average_days,

    algorithmType:
      plan.algorithm_type ||
      'LEGACY',

    notice: plan.notice,

    tasks: getTasks.all(plan.id).map(task => ({
      ...task,
      completed: Boolean(task.completed)
    }))
  }));
}

router.get('/plans', (req, res) => {
  try {
    res.json({
      success: true,
      plans: list(req)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 11. 학습기간 미리보기
// ==========================================

router.post('/preview', async (req, res) => {
  try {
    const {
      certificateName,
      examType = 'written',
      level = 'beginner',
      dailyHours = 4,
      studyDays = [1, 2, 3, 4, 5, 6],
      grade = '30'
    } = req.body || {};

    if (
      typeof certificateName !== 'string' ||
      !certificateName.trim() ||
      !['written', 'practical'].includes(examType)
    ) {
      return res.status(400).json({
        success: false,
        message: '자격증과 시험 유형을 확인하세요.'
      });
    }

    const mock = findLatestMock(
      req.session.userId,
      certificateName,
      examType
    );

    const stats = await loadStageStatistics(
      certificateName,
      grade
    );

    const passRate =
      examType === 'written'
        ? stats.writtenPassRate
        : stats.practicalPassRate;

    const estimate = estimatePreparation({
      level,
      dailyHours: Number(dailyHours),
      studyDays,
      examType,
      passRate,
      mockScore: mock?.score ?? null,
      writtenPassRate: stats.writtenPassRate,
      practicalPassRate: stats.practicalPassRate,
      averageDays: stats.averageDays
    });

    const algorithmType = validRate(passRate)
      ? 'PASS_RATE_BASED'
      : mock
        ? 'MOCK_BASED'
        : 'BASIC_FALLBACK';

    res.json({
      success: true,

      algorithmType,
      estimate,

      mockScore: mock?.score ?? null,
      passRate,

      personalAdjustedRate:
        estimate.personalAdjustedRate,

      statistics: stats,

      notice:
        algorithmType === 'MOCK_BASED'
          ? '합격률이 없어 최근 모의고사 점수와 사용자 수준을 기준으로 학습기간을 추정했습니다.'
          : algorithmType === 'BASIC_FALLBACK'
            ? '합격률과 모의고사 점수가 없어 기본 학습량으로 임시 기간을 추정했습니다.'
            : '합격률 통계와 모의고사 점수를 활용해 학습기간을 추정했습니다.'
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 12. 학습계획 생성
// ==========================================

router.post('/plans', async (req, res) => {
  try {
    const {
      certificateName,
      grade = '30',
      examType = 'written',
      examDate,
      level = 'beginner',
      dailyHours = 4,
      studyDays = [1, 2, 3, 4, 5, 6]
    } = req.body || {};

    const name = String(
      certificateName || ''
    ).trim();

    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: '자격증 이름이 올바르지 않습니다.'
      });
    }

    if (
      examDate !== undefined &&
      examDate !== null &&
      examDate !== '' &&
      !isValidDate(examDate)
    ) {
      return res.status(400).json({
        success: false,
        message: '올바른 시험일을 선택하세요.'
      });
    }

    if (
      !['written', 'practical'].includes(examType)
    ) {
      return res.status(400).json({
        success: false,
        message: '시험 유형이 올바르지 않습니다.'
      });
    }

    if (
      !['beginner', 'intermediate', 'advanced']
        .includes(level)
    ) {
      return res.status(400).json({
        success: false,
        message: '학습 수준이 올바르지 않습니다.'
      });
    }

    const hours = Number(dailyHours);

    if (
      !Number.isFinite(hours) ||
      hours < 1 ||
      hours > 8
    ) {
      return res.status(400).json({
        success: false,
        message: '하루 공부시간은 1~8시간이어야 합니다.'
      });
    }

    if (!validStudyDays(studyDays)) {
      return res.status(400).json({
        success: false,
        message: '학습 요일이 올바르지 않습니다.'
      });
    }

    // --------------------------------------
    // 12-1. 자격증 통계 조회
    // --------------------------------------

    const stats = await loadStageStatistics(
      name,
      grade
    );

    const passRate =
      examType === 'written'
        ? stats.writtenPassRate
        : stats.practicalPassRate;

    // 수동 입력 취득기간 우선 적용
    const manualAverageDays = numeric(
      req.body?.averageDays
    );

    if (
      manualAverageDays !== null &&
      (
        manualAverageDays <= 0 ||
        manualAverageDays > 36500
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          '평균 취득소요기간은 1~36500일이어야 합니다.'
      });
    }

    const averageDays =
      manualAverageDays ??
      stats.averageDays;

    const acquisitionSource =
      manualAverageDays !== null
        ? 'user-provided'
        : stats.acquisitionSource;

    // --------------------------------------
    // 12-2. 모의고사 점수 조회
    // --------------------------------------

    const mock = findLatestMock(
      req.session.userId,
      name,
      examType
    );

    const mockScore = mock?.score ?? null;

    const subjects = mock
      ? safeSubjects(mock.subjects_json)
      : [];

    // --------------------------------------
    // 12-3. 알고리즘 자동 선택
    // --------------------------------------

    const algorithmType = validRate(passRate)
      ? 'PASS_RATE_BASED'
      : mock !== null
        ? 'MOCK_BASED'
        : 'BASIC_FALLBACK';

    console.log('[학습계획 알고리즘 선택]', {
      certificateName: name,
      algorithmType,
      passRate,
      mockScore,
      averageDays
    });

    // --------------------------------------
    // 12-4. 추천 시험일 계산
    // --------------------------------------

    const suggested = estimatePreparation({
      level,
      dailyHours: hours,
      studyDays,
      examType,
      passRate,
      averageDays,
      mockScore,

      writtenPassRate:
        stats.writtenPassRate,

      practicalPassRate:
        stats.practicalPassRate
    });

    const targetExamDate =
      examDate || suggested.suggestedTargetDate;

    if (
      !examDate &&
      suggested.daysUntilExam > 730
    ) {
      return res.status(400).json({
        success: false,
        message:
          '추천 기간이 730일을 초과합니다. 공부시간을 늘리거나 목표일을 직접 선택하세요.'
      });
    }

    // --------------------------------------
    // 12-5. 실제 학습계획 생성
    // --------------------------------------

    const result = calculateStudyPlan({
      certificateName: name,
      examType,
      examDate: targetExamDate,
      level,
      dailyHours: hours,
      studyDays,

      passRate,
      averageDays,
      mockScore,
      subjects,

      writtenPassRate:
        stats.writtenPassRate,

      practicalPassRate:
        stats.practicalPassRate
    });

    // --------------------------------------
    // 12-6. 데이터베이스 저장
    // --------------------------------------

    const insert = db.transaction(() => {
      const planResult = db.prepare(`
        INSERT INTO study_plans (
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
          notice,
          algorithm_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        `${result.notice} ${
          mock
            ? `최근 모의고사 ${mock.score}점 반영`
            : '모의고사 미입력'
        }`,

        algorithmType
      );

      const insertTask = db.prepare(`
        INSERT INTO study_tasks (
          plan_id,
          date,
          title,
          hours
        )
        VALUES (?, ?, ?, ?)
      `);

      for (const event of result.events) {
        insertTask.run(
          planResult.lastInsertRowid,
          event.date,
          event.title,
          event.hours
        );
      }

      return Number(
        planResult.lastInsertRowid
      );
    });

    const id = insert();

    // --------------------------------------
    // 12-7. 결과 반환
    // --------------------------------------

    res.status(201).json({
      success: true,

      algorithmType,

      plan: list(req).find(
        plan => plan.id === id
      ),

      dataSources: {
        passRateSource:
          stats.passRateSource,

        acquisitionSource,

        mockSource:
          mock ? 'USER_MOCK' : null
      },

      estimationDetails:
        result.estimationDetails,

      suggestedCompletion:
        suggested,

      targetDateIsSuggested:
        !examDate,

      feasibilityAssessed:
        result.feasibilityAssessed,

      dataWarnings: [
        ...stats.warnings,
        ...result.warnings
      ],

      diagnostics: {
        passRate: [{
          written: stats.writtenPassRate,
          practical: stats.practicalPassRate
        }],

        acquisitionTerm: [{
          averageDays,
          source: acquisitionSource
        }]
      }
    });

  } catch (error) {
    console.error(
      '학습계획 생성 오류:',
      error
    );

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 13. 공부 완료 체크
// ==========================================

router.patch('/tasks/:id', (req, res) => {
  try {
    const completed = req.body?.completed;

    if (typeof completed !== 'boolean') {
      return res.status(400).json({
        success: false,
        message:
          'completed는 boolean이어야 합니다.'
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

    res.json({
      success: true
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 14. 학습계획 삭제
// ==========================================

router.delete('/plans/:id', (req, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM study_plans
      WHERE id = ?
        AND user_id = ?
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

    res.json({
      success: true
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 15. 라우터 내보내기
// ==========================================

module.exports = router;
