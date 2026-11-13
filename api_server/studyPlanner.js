const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { calculateStudyPlan, estimatePreparation } = require('./studyAlgorithm');
const { findPassRate, normalizeName } = require('./studyData');

const router = express.Router();
const db = new Database(path.join(__dirname, 'users.db'));

db.pragma('journal_mode = WAL');

// ==========================================
// 1. 데이터베이스 설정
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

const numeric = value => {
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
};

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

// 내부 Q-Net API 호출
async function internalGet(req, route, params) {
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
    signal: AbortSignal.timeout(90000)
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
// 4. 모의고사 성적 조회
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
        subjects: JSON.parse(row.subjects_json)
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
// 5. 모의고사 성적 저장
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
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      !Array.isArray(subjects) ||
      subjects.length > 30 ||
      subjects.some(subject =>
        !subject ||
        typeof subject.name !== 'string' ||
        !subject.name.trim() ||
        subject.name.length > 100 ||
        !Number.isFinite(subject.score) ||
        subject.score < 0 ||
        subject.score > 100
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

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 모의고사 성적 삭제
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
      WHERE id = ? AND user_id = ?
    `).run(id, req.session.userId);

    if (result.changes === 0) {
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
// 6. 사용자별 학습계획 목록
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
    feasibilityAssessed: plan.average_days !== null,
    passRate: plan.pass_rate,
    averageDays: plan.average_days,
    notice: plan.notice,

    tasks: getTasks.all(plan.id).map(task => ({
      ...task,
      completed: Boolean(task.completed)
    }))
  }));
}

// ==========================================
// 7. 학습계획 조회
// ==========================================

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

// 동일한 통계조회 함수를 미리보기와 실제 생성에서 사용한다.
async function loadStageStatistics(req,certificateName,grade) {
  const currentYear=new Date().getFullYear();
  let writtenPassRate=null,practicalPassRate=null,averageDays=null;
  const warnings=[];
  for(const year of [currentYear-1,currentYear-2,currentYear-3]) {
    try {
      const data=await internalGet(req,'/api/qnet/pass-rate',{year,grade,keyword:certificateName});
      const rows=Array.isArray(data.items)?data.items:[];
      const written=numeric(findPassRate(rows,certificateName,'필기')?.passRate);
      const practical=numeric(findPassRate(rows,certificateName,'실기')?.passRate);
      if(writtenPassRate===null && written!==null && written>=0 && written<=100)writtenPassRate=written;
      if(practicalPassRate===null && practical!==null && practical>=0 && practical<=100)practicalPassRate=practical;
      if(writtenPassRate!==null && practicalPassRate!==null)break;
    }catch(e){warnings.push(`${year} 합격률: ${e.message}`);}
  }
  for(const year of [...new Set([currentYear-1,currentYear-2,currentYear-3,2023])]) {
    try {
      const data=await internalGet(req,'/api/qnet/acquisition-term',{year,grade,keyword:certificateName});
      const rows=Array.isArray(data.items)?data.items:[];
      const match=rows.find(r=>normalize(r.name??r.jmNm??r.qualName??'')===normalize(certificateName));
      const value=numeric(match?.averageDays??match?.accumAcquAvgTermDays);
      if(value!==null && value>0){averageDays=value;break;}
    }catch(e){warnings.push(`${year} 취득소요기간: ${e.message}`);}
  }
  return {writtenPassRate,practicalPassRate,averageDays,warnings};
}

// 추천 학습기간 미리보기: 저장된 모의고사 점수를 기반으로 완료일 계산
router.post('/preview', async (req,res) => {
  try {
    const { certificateName, examType='written', level='beginner',
      dailyHours=4, studyDays=[1,2,3,4,5,6], grade='30' } = req.body || {};
    if (typeof certificateName !== 'string' || !certificateName.trim() ||
        !['written','practical'].includes(examType))
      return res.status(400).json({success:false,message:'자격증과 시험 유형을 확인하세요.'});
    const candidates = db.prepare(`SELECT * FROM mock_results WHERE user_id=? AND exam_type=? ORDER BY mock_date DESC,id DESC`)
      .all(req.session.userId,examType);
    const mock = candidates.find(r=>normalize(r.certificate_name)===normalize(certificateName));
    const stats=await loadStageStatistics(req,certificateName,grade);
    const passRate=examType==='written'?stats.writtenPassRate:stats.practicalPassRate;
    const estimate=estimatePreparation({level,dailyHours:Number(dailyHours),studyDays,
      examType,passRate,mockScore:mock?.score??null,...stats});
    res.json({success:true,estimate,mockScore:mock?.score??null,passRate,personalAdjustedRate:estimate.personalAdjustedRate,
      statistics:stats,notice:'Q-Net 공식 합격률로 필기·실기 기간을 배분하고 모의고사 점수는 목표 80점 대비 학습량에 한 번만 반영합니다. 65:35 지표는 참고용이며 실제 합격확률이 아닙니다. 화면의 개인별 지표는 참고용이며 실제 합격확률이 아닙니다. 목표 모의고사 점수는 80점이고 하루 공부시간 기본값은 4시간(선택 1~8시간)입니다. 통계 환산용 2시간과 활동일 비율 0.4는 검증된 평균이 아닌 가정값입니다.'});
  } catch(e) { res.status(400).json({success:false,message:e.message}); }
});

// ==========================================
// 8. 맞춤형 학습계획 생성
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

    // --------------------------------------
    // 8-1. 입력값 검증
    // --------------------------------------

    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: '자격증 이름이 올바르지 않습니다.'
      });
    }

    if (examDate && !isValidDate(examDate)) {
      return res.status(400).json({
        success: false,
        message: '올바른 시험일을 선택하세요.'
      });
    }

    if (!['written', 'practical'].includes(examType)) {
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

    if (
      !Number.isFinite(Number(dailyHours)) ||
      Number(dailyHours) < 1 ||
      Number(dailyHours) > 8
    ) {
      return res.status(400).json({
        success: false,
        message: '하루 학습시간은 0.5~12시간이어야 합니다.'
      });
    }

    if (
      !Array.isArray(studyDays) ||
      studyDays.length === 0 ||
      studyDays.some(day =>
        !Number.isInteger(day) ||
        day < 0 ||
        day > 6
      )
    ) {
      return res.status(400).json({
        success: false,
        message: '학습 요일이 올바르지 않습니다.'
      });
    }

    // --------------------------------------
    // 8-2. 조회 연도 설정
    // --------------------------------------

    const currentYear = new Date().getFullYear();

    const typeLabel =
      examType === 'written'
        ? '필기'
        : '실기';

    const passYears = [
      currentYear - 1,
      currentYear - 2,
      currentYear - 3
    ];

    const termYears = [
      ...new Set([
        currentYear - 1,
        currentYear - 2,
        currentYear - 3,
        2023
      ])
    ].filter(year => year >= 2020);

    const diagnostics = {
      passRate: [],
      acquisitionTerm: []
    };

    // --------------------------------------
    // 8-3. Q-Net 합격률 조회
    // --------------------------------------

    const stats=await loadStageStatistics(req,name,grade);
    let passRate=examType==='written'?stats.writtenPassRate:stats.practicalPassRate;
    let passRateYear=null;

    // --------------------------------------
    // 8-4. 수동 취득소요기간 확인
    // --------------------------------------

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

    let averageDays=manualAverageDays??stats.averageDays;
    let acquisitionYear=null;
    let acquisitionSource=manualAverageDays!==null?'user-provided':stats.averageDays!==null?'qnet':null;
    diagnostics.passRate.push({written:stats.writtenPassRate,practical:stats.practicalPassRate});
    diagnostics.acquisitionTerm.push({averageDays,source:acquisitionSource,warnings:stats.warnings});

    // --------------------------------------
    // 8-7. 데이터 누락 처리
    // --------------------------------------

    // 합격률은 기존 정책대로 필수
    if (passRate === null) {
      console.warn('[학습계획] 합격률 부재: 보정 없이 계획 생성');
    }

    // 핵심 수정:
    // 취득소요기간이 없어도 계획 생성 진행
    if (averageDays === null) {
      console.warn(
        `[학습계획] ${name}: 취득소요기간 통계 없음. 학습 가능 시간 기준으로 생성합니다.`
      );
    }

    // --------------------------------------
    // 8-8. 최근 모의고사 성적 조회
    // --------------------------------------

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
        normalize(item.certificate_name) ===
        normalize(name)
    ) || null;

    console.log(
      '[모의고사 조회 결과]',
      mock
        ? {
            score: mock.score,
            mockDate: mock.mock_date
          }
        : '저장된 모의고사 성적 없음'
    );

    // --------------------------------------
    // 8-9. 학습계획 알고리즘 실행
    // --------------------------------------

    // 시험일 미지정 시 모의고사 기반 추천 완료일 다음 날을 임시 목표일로 사용
    const suggested = estimatePreparation({level,dailyHours:Number(dailyHours),studyDays,
      passRate,averageDays,examType,mockScore:mock?.score ?? null,
      writtenPassRate:stats.writtenPassRate,practicalPassRate:stats.practicalPassRate});
    const targetExamDate = examDate || suggested.suggestedTargetDate;
    if (suggested.daysUntilExam > 730 && !examDate) {
      return res.status(400).json({success:false,message:'추천 기간이 730일을 초과합니다. 공부시간을 늘리거나 목표일을 직접 선택하세요.'});
    }
    const result = calculateStudyPlan({
      certificateName: name,
      examType,
      examDate: targetExamDate,
      level,
      dailyHours: Number(dailyHours),
      studyDays,
      passRate,
      averageDays,
      writtenPassRate:stats.writtenPassRate,
      practicalPassRate:stats.practicalPassRate,

      mockScore: mock
        ? mock.score
        : null,

      subjects: mock
        ? JSON.parse(mock.subjects_json)
        : []
    });

    // --------------------------------------
    // 8-10. 학습계획 DB 저장
    // --------------------------------------

    const insert = db.transaction(() => {
      const planResult = db.prepare(`
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

        `${result.notice} [합격률 기준연도: ${
          passRateYear ?? '미상'
        }, 취득소요기간 출처: ${
          acquisitionSource ?? '데이터 없음'
        }${
          acquisitionYear
            ? `(${acquisitionYear})`
            : ''
        }]${
          mock
            ? ` 최근 모의고사 ${mock.score}점 반영`
            : ' 모의고사 미입력: 기본 일정 사용'
        }`
      );

      // ------------------------------------
      // 8-11. 날짜별 학습일정 저장
      // ------------------------------------

      const insertTask = db.prepare(`
        INSERT INTO study_tasks
        (
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
    // 8-12. 최종 결과 반환
    // --------------------------------------

    res.status(201).json({
      success: true,

      plan: list(req).find(
        plan => plan.id === id
      ),

      dataSources: {
        passRateYear,
        acquisitionYear,
        acquisitionSource
      },

      estimationDetails:
        result.estimationDetails,
      suggestedCompletion: suggested,
      targetDateIsSuggested: !examDate,

      feasibilityAssessed:
        result.feasibilityAssessed,

      dataWarnings:
        result.warnings,

      diagnostics
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
// 9. 공부 완료 체크
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
// 10. 학습계획 삭제
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
// 11. 라우터 내보내기
// ==========================================

module.exports = router;