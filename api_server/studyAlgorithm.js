
/**
 * studyAlgorithm.js
 * 규칙 기반 개인 맞춤형 학습계획 생성
 *
 * 합격률 + 취득소요기간 있음:
 *   기존 통계 기반 학습량 계산
 *
 * 합격률만 있음:
 *   합격률과 모의고사 점수 기반 계산
 *
 * 합격률 없음 + 모의고사 있음:
 *   모의고사 점수와 사용자 수준 기반 계산
 *
 * 모두 없음:
 *   기본 학습시간과 사용자 수준으로 임시 계획 생성
 *
 * 통계적으로 검증된 합격 예측 모델이 아닙니다.
 */

const LEVEL = {
  beginner: 1.3,
  intermediate: 1,
  advanced: 0.7
};

const clamp = (x, lo, hi) =>
  Math.max(lo, Math.min(hi, x));

const dateKey = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return null;
  }

  const [y, m, d] = value.split('-').map(Number);
  const result = new Date(y, m - 1, d, 12);

  return dateKey(result) === value ? result : null;
}

// ==========================================
// 1. 학습시간 추정에 사용하는 가정값
// ==========================================

const STUDY_ASSUMPTIONS = Object.freeze({
  averageStudyHoursPerActiveDay: 2,
  activeStudyDayRatio: 0.4,
  fallbackHours: 120,
  minimumHours: 40,
  maximumHours: 400
});

// 모의고사 점수와 공식 합격률을 결합한 참고 지표.
// 실제 개인 합격 확률이 아님.
const MOCK_RATE_WEIGHT = 0.35;

function estimatePersonalRate(officialRate, mockScore) {
  const valid = n =>
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= 0 &&
    n <= 100;

  if (!valid(officialRate) || !valid(mockScore)) {
    return null;
  }

  return Number(
    (
      officialRate * (1 - MOCK_RATE_WEIGHT) +
      mockScore * MOCK_RATE_WEIGHT
    ).toFixed(2)
  );
}

// ==========================================
// 2. 합격률 유무에 따른 학습시간 추정
// ==========================================

function estimateHours({
  averageDays = null,
  writtenPassRate = null,
  practicalPassRate = null,
  passRate = null,
  examType = 'written',
  level = 'beginner',
  mockScore = null
}) {
  if (!Object.hasOwn(LEVEL, level)) {
    throw new Error('학습 수준이 올바르지 않습니다.');
  }

  if (!['written', 'practical'].includes(examType)) {
    throw new Error('시험 유형이 올바르지 않습니다.');
  }

  const valid = n =>
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= 0 &&
    n <= 100;

  const validDuration =
    typeof averageDays === 'number' &&
    Number.isFinite(averageDays) &&
    averageDays > 0;

  const hasBothRates =
    valid(writtenPassRate) &&
    valid(practicalPassRate);

  const stageRate =
    examType === 'written'
      ? writtenPassRate
      : practicalPassRate;

  const officialRate = valid(stageRate)
    ? stageRate
    : valid(passRate)
      ? passRate
      : null;

  const hasRate = valid(officialRate);
  const hasMock = valid(mockScore);

  const personalRate = estimatePersonalRate(
    officialRate,
    mockScore
  );

  // 필기·실기 합격률이 모두 있을 때
  // 시험별 학습기간 비중 계산
  const writtenWeight = hasBothRates
    ? Math.max(0.05, 1 - writtenPassRate / 100)
    : null;

  const practicalWeight = hasBothRates
    ? Math.max(0.05, 1 - practicalPassRate / 100)
    : null;

  const stageShare = hasBothRates
    ? (
        examType === 'written'
          ? writtenWeight
          : practicalWeight
      ) / (writtenWeight + practicalWeight)
    : null;

  const hasStatistics =
    validDuration && hasBothRates;

  const allocatedDays = hasStatistics
    ? averageDays * stageShare
    : null;

  // 통계 기반 학습시간 또는 기본 학습시간
  const rawBaseHours = hasStatistics
    ? allocatedDays *
      STUDY_ASSUMPTIONS.activeStudyDayRatio *
      STUDY_ASSUMPTIONS.averageStudyHoursPerActiveDay
    : STUDY_ASSUMPTIONS.fallbackHours;

  const baseHours = clamp(
    rawBaseHours,
    STUDY_ASSUMPTIONS.minimumHours,
    STUDY_ASSUMPTIONS.maximumHours
  );

  // 모의고사 점수 보정
  const scoreFactor = hasMock
    ? (
        mockScore >= 80
          ? 1
          : clamp(
              1 + (80 - mockScore) / 120,
              1,
              1.5
            )
      )
    : 1;

  // 통계 기반 기간 배분을 사용하는 경우에는
  // 합격률을 다시 곱하지 않아 중복 반영 방지
  const passFactor = hasRate && !hasStatistics
    ? clamp(
        (40 / Math.max(officialRate, 1)) ** 0.25,
        0.75,
        1.4
      )
    : 1;

  let method;

  if (hasStatistics) {
    method = 'qnet-weighted-assumption';
  } else if (hasRate) {
    method = 'pass-rate-assumption';
  } else if (hasMock) {
    method = 'mock-based-assumption';
  } else {
    method = 'fallback-assumption';
  }

  const estimatedHours = Math.max(
    1,
    Math.ceil(
      baseHours *
      LEVEL[level] *
      scoreFactor *
      passFactor
    )
  );

  const warnings = [];

  if (!hasStatistics && hasRate) {
    warnings.push(
      '취득소요기간 또는 양쪽 시험 합격률 누락: 120시간 가정값에 합격률 보정 적용'
    );
  }

  if (!hasRate && hasMock) {
    warnings.push(
      '합격률 데이터 없음: 모의고사 점수와 사용자 수준으로 학습시간 추정'
    );
  }

  if (!hasRate && !hasMock) {
    warnings.push(
      '합격률·모의고사 점수 없음: 120시간 가정값과 사용자 수준으로 임시 계획 생성'
    );
  }

  if (rawBaseHours !== baseHours) {
    warnings.push(
      '기준 학습시간 안전범위(40~400시간) 적용'
    );
  }

  if (!hasMock) {
    warnings.push(
      '모의고사 점수 미입력: 점수 보정 생략'
    );
  }

  return {
    estimatedHours,
    baseHours,
    rawBaseHours,
    allocatedDays,
    stageShare,

    personalAdjustedRate: personalRate,
    officialPassRate: hasRate ? officialRate : null,
    mockRateWeight: MOCK_RATE_WEIGHT,

    writtenPassRate: valid(writtenPassRate)
      ? writtenPassRate
      : null,

    practicalPassRate: valid(practicalPassRate)
      ? practicalPassRate
      : null,

    scoreFactor,
    passFactor,
    levelFactor: LEVEL[level],
    method,

    hasPassRate: hasRate,
    hasMockScore: hasMock,

    assumptions: STUDY_ASSUMPTIONS,
    warnings
  };
}

// ==========================================
// 3. 예상 학습기간 계산
// ==========================================

function estimatePreparation({
  level = 'beginner',
  dailyHours = 4,
  studyDays = [1, 2, 3, 4, 5, 6],
  examType = 'written',
  passRate = null,
  writtenPassRate = null,
  practicalPassRate = null,
  averageDays = null,
  mockScore = null,
  startDate = new Date()
}) {
  if (
    !Number.isFinite(Number(dailyHours)) ||
    Number(dailyHours) < 1 ||
    Number(dailyHours) > 8
  ) {
    throw new Error('하루 공부시간은 1~8시간이어야 합니다.');
  }

  if (
    !Array.isArray(studyDays) ||
    !studyDays.length ||
    studyDays.some(
      d => !Number.isInteger(d) || d < 0 || d > 6
    )
  ) {
    throw new Error('공부 요일이 올바르지 않습니다.');
  }

  const result = estimateHours({
    level,
    examType,
    averageDays,
    mockScore,

    writtenPassRate:
      writtenPassRate ??
      (examType === 'written' ? passRate : null),

    practicalPassRate:
      practicalPassRate ??
      (examType === 'practical' ? passRate : null),

    passRate
  });

  const studyDaysNeeded = Math.ceil(
    result.estimatedHours / Number(dailyHours)
  );

  const today = new Date(startDate);
  today.setHours(12, 0, 0, 0);

  const cursor = new Date(today);
  let counted = 0;

  for (
    let i = 0;
    i < 3650 && counted < studyDaysNeeded;
    i++
  ) {
    if (studyDays.includes(cursor.getDay())) {
      counted++;
    }

    if (counted < studyDaysNeeded) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  if (counted < studyDaysNeeded) {
    throw new Error('추천 학습기간이 너무 깁니다.');
  }

  const exam = new Date(cursor);
  exam.setDate(exam.getDate() + 1);

  const daysUntilExam = Math.round(
    (
      Date.UTC(
        exam.getFullYear(),
        exam.getMonth(),
        exam.getDate()
      ) -
      Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      )
    ) / 86400000
  );

  return {
    ...result,

    studyDaysNeeded,
    completionDate: dateKey(cursor),
    suggestedTargetDate: dateKey(exam),
    daysUntilExam,

    assumption:
      '취득기간×시험별 불합격률 비중×활동일 비율(가정 0.4)×활동일 평균 2시간(가정). 실제 평균 조사값 아님.'
  };
}

// ==========================================
// 4. 날짜별 학습계획 생성
// ==========================================

function calculateStudyPlan({
  certificateName,
  examType,
  examDate,
  level,
  dailyHours,
  studyDays,
  averageDays = null,
  passRate = null,
  mockScore = null,
  subjects = [],
  writtenPassRate = null,
  practicalPassRate = null
}) {

  // ======================================
  // 4-1. 입력값 검사
  // ======================================

  if (!Object.hasOwn(LEVEL, level)) {
    throw new Error('학습 수준이 올바르지 않습니다.');
  }

  if (!['written', 'practical'].includes(examType)) {
    throw new Error('시험 유형이 올바르지 않습니다.');
  }

  if (
    !Number.isFinite(dailyHours) ||
    dailyHours < 1 ||
    dailyHours > 8
  ) {
    throw new Error('하루 공부시간은 1~8시간이어야 합니다.');
  }

  if (
    !Array.isArray(studyDays) ||
    !studyDays.length ||
    studyDays.some(
      d => !Number.isInteger(d) || d < 0 || d > 6
    )
  ) {
    throw new Error('공부 요일이 올바르지 않습니다.');
  }

  // ======================================
  // 4-2. 시험일 검사
  // ======================================

  const target = parseDate(examDate);

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (!target || target <= today) {
    throw new Error('오늘 이후의 시험일을 선택하세요.');
  }

  const daysUntilExam = Math.round(
    (
      Date.UTC(
        target.getFullYear(),
        target.getMonth(),
        target.getDate()
      ) -
      Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      )
    ) / 86400000
  );

  if (daysUntilExam > 730) {
    throw new Error('시험일은 730일 이내여야 합니다.');
  }

  // ======================================
  // 4-3. 데이터 유효성 검사
  // ======================================

  const validRate =
    typeof passRate === 'number' &&
    Number.isFinite(passRate) &&
    passRate >= 0 &&
    passRate <= 100;

  const validDuration =
    typeof averageDays === 'number' &&
    Number.isFinite(averageDays) &&
    averageDays > 0;

  const validScore =
    typeof mockScore === 'number' &&
    Number.isFinite(mockScore) &&
    mockScore >= 0 &&
    mockScore <= 100;

  // ======================================
  // 4-4. 공부 가능한 날짜 계산
  // ======================================

  const dates = [];

  for (
    const d = new Date(today);
    d < target;
    d.setDate(d.getDate() + 1)
  ) {
    if (studyDays.includes(d.getDay())) {
      dates.push(dateKey(d));
    }
  }

  if (!dates.length) {
    throw new Error(
      '시험 전 공부 가능한 날짜가 없습니다.'
    );
  }

  const studyDaysPerWeek =
    new Set(studyDays).size;

  const availableHours = Number(
    (dates.length * dailyHours).toFixed(2)
  );

  // ======================================
  // 4-5. 보정계수 계산
  // ======================================

  const levelFactor = LEVEL[level];

  const passFactor = validRate
    ? clamp(
        (40 / Math.max(passRate, 1)) ** 0.25,
        0.75,
        1.4
      )
    : 1;

  const scoreFactor = validScore
    ? (
        mockScore >= 80
          ? 1
          : clamp(
              1 + (80 - mockScore) / 120,
              1,
              1.5
            )
      )
    : 1;

  const examTypeFactor =
    examType === 'practical' ? 1.15 : 1;

  // ======================================
  // 4-6. 학습시간 계산
  // ======================================

  let estimatedHours;
  let durationStudyDays = null;
  let durationBasedHours = null;
  let calculationMethod;

  const warnings = [];

  const sharedEstimate = estimateHours({
    averageDays,
    examType,
    level,
    mockScore,
    writtenPassRate,
    practicalPassRate,
    passRate
  });

  estimatedHours = sharedEstimate.estimatedHours;
  calculationMethod = sharedEstimate.method;

  warnings.push(...sharedEstimate.warnings);

  if (sharedEstimate.allocatedDays !== null) {
    durationStudyDays = sharedEstimate.allocatedDays;
  }

  durationBasedHours = sharedEstimate.rawBaseHours;

  // ======================================
  // 4-7. 학습 가능 여부 계산
  // ======================================

  const feasibilityAssessed = true;

  const feasible =
    availableHours >= estimatedHours;

  // DB 호환성을 위해 feasible은 boolean 유지
  const plannedHours = Math.min(
    estimatedHours,
    availableHours
  );

  // ======================================
  // 4-8. 과목별 점수 분석
  // ======================================

  const validSubjects = Array.isArray(subjects)
    ? subjects.filter(
        s =>
          s &&
          typeof s.name === 'string' &&
          s.name.trim() &&
          typeof s.score === 'number' &&
          Number.isFinite(s.score) &&
          s.score >= 0 &&
          s.score <= 100
      )
    : [];

  // 40점 미만 과락 위험
  // 80점 미만 목표 미달 과목 우선 배분
  const weights = validSubjects.map(
    s =>
      Math.max(5, 80 - s.score) +
      (s.score < 40 ? 40 : 0)
  );

  const weightSum = weights.reduce(
    (a, b) => a + b,
    0
  );

  const subjectHours = validSubjects.map(
    (s, i) => ({
      name: s.name,
      score: s.score,

      weight: Number(
        (weights[i] / weightSum).toFixed(4)
      ),

      targetHours: Number(
        (
          plannedHours *
          weights[i] /
          weightSum
        ).toFixed(2)
      )
    })
  );

  const remaining = subjectHours.map(
    s => s.targetHours
  );

  // ======================================
  // 4-9. 학습 단계 설정
  // ======================================

  const maintenanceMode =
    validScore && mockScore >= 80;

  const phaseDefs = maintenanceMode
    ? [
        {
          name: '취약 과목 오답 복습',
          end: 0.35
        },
        {
          name: '기출문제 실전 연습',
          end: 0.7
        },
        {
          name: '모의고사 및 시간 관리',
          end: 0.9
        },
        {
          name: '최종 복습 및 실수 점검',
          end: 1
        }
      ]
    : [
        {
          name: '기초 이론 학습',
          end: 0.4
        },
        {
          name: '핵심 개념 및 문제풀이',
          end: 0.7
        },
        {
          name: '기출문제 및 오답 정리',
          end: 0.9
        },
        {
          name: '모의고사 및 최종 복습',
          end: 1
        }
      ];

  // ======================================
  // 4-10. 날짜별 일정 생성
  // ======================================

  const events = [];

  let remainingHours = plannedHours;

  for (let i = 0; i < dates.length; i++) {
    if (remainingHours <= 0) {
      break;
    }

    const remainingDays =
      dates.length - i;

    const hours = Math.min(
      dailyHours,
      Math.ceil(
        (remainingHours / remainingDays) * 100
      ) / 100
    );

    const actualHours = Number(
      Math.min(
        hours,
        remainingHours
      ).toFixed(2)
    );

    if (actualHours <= 0) {
      break;
    }

    const progress =
      (i + 0.5) / dates.length;

    const phase =
      phaseDefs.find(
        p => progress <= p.end
      ) || phaseDefs[3];

    let focus = '';

    if (subjectHours.length > 0) {
      const candidates = remaining
        .map((value, index) => ({
          index,
          value
        }))
        .filter(
          item => item.value > 0
        );

      if (candidates.length > 0) {
        const selected = candidates.reduce(
          (best, item) =>
            item.value > best.value
              ? item
              : best
        );

        focus =
          subjectHours[selected.index].name;

        remaining[selected.index] = Math.max(
          0,
          remaining[selected.index] - actualHours
        );
      }
    }

    events.push({
      date: dates[i],

      title: focus
        ? `${focus} · ${phase.name}`
        : phase.name,

      hours: actualHours,
      phase: phase.name
    });

    remainingHours = Number(
      (
        remainingHours -
        actualHours
      ).toFixed(2)
    );
  }

  // ======================================
  // 4-11. 경고 메시지
  // ======================================

  if (!sharedEstimate.hasPassRate) {
    warnings.push(
      '합격률 데이터 없음: 모의고사 점수 기반 또는 기본 학습량 추정 사용'
    );
  }

  if (!validScore) {
    warnings.push(
      '모의고사 점수 없음: CBT 보정 없이 계산'
    );
  }

  if (!validSubjects.length) {
    warnings.push(
      '과목별 점수 없음: 취약 과목별 배분 불가'
    );
  }

  if (!feasible) {
    warnings.push(
      '시험일까지 확보 가능한 공부시간이 추정 필요시간보다 부족합니다.'
    );
  }

  // ======================================
  // 4-12. 계산 근거
  // ======================================

  const estimationDetails = {
    method: calculationMethod,

    algorithmType: sharedEstimate.hasPassRate
      ? 'PASS_RATE_BASED'
      : sharedEstimate.hasMockScore
        ? 'MOCK_BASED'
        : 'BASIC_FALLBACK',

    averageDays:
      validDuration ? averageDays : null,

    studyDaysPerWeek,
    dailyHours,
    daysUntilExam,

    durationStudyDays:
      durationStudyDays === null
        ? null
        : Number(durationStudyDays.toFixed(2)),

    durationBasedHours:
      durationBasedHours === null
        ? null
        : Number(durationBasedHours.toFixed(2)),

    level,
    levelFactor,

    passRate:
      validRate ? passRate : null,

    passFactor: Number(
      sharedEstimate.passFactor.toFixed(4)
    ),

    examTypeFactor,

    mockScore:
      validScore ? mockScore : null,

    scoreFactor: Number(
      scoreFactor.toFixed(4)
    ),

    estimatedHours,
    availableHours,
    targetMockScore: 80,
    maintenanceMode,

    studyAssumptions:
      sharedEstimate.assumptions,

    stageShare:
      sharedEstimate.stageShare,

    personalAdjustedRate:
      sharedEstimate.personalAdjustedRate,

    officialPassRate:
      sharedEstimate.officialPassRate,

    mockRateWeight:
      sharedEstimate.mockRateWeight,

    writtenPassRate:
      sharedEstimate.writtenPassRate,

    practicalPassRate:
      sharedEstimate.practicalPassRate,

    feasibilityAssessed,
    statisticallyValidated: false
  };

  // ======================================
  // 4-13. 최종 결과 반환
  // ======================================

  return {
    certificateName,
    examType,
    examDate: dateKey(target),

    estimatedHours,

    algorithmType:
      estimationDetails.algorithmType,

    targetMockScore: 80,
    maintenanceMode,
    estimationDetails,

    availableHours,
    availableStudyDays: dates.length,

    requiredDailyHours: Number(
      (
        estimatedHours / dates.length
      ).toFixed(2)
    ),

    feasible,
    feasibilityAssessed,

    passRate:
      validRate ? passRate : null,

    averageDays:
      validDuration ? averageDays : null,

    subjectHours,
    events,
    warnings,

    inputsUsed: {
      passRate:
        sharedEstimate.hasPassRate,

      averageDays: validDuration,
      mockScore: validScore,

      subjectScores:
        validSubjects.length > 0
    },

    notice:
      '합격률·취득기간이 있으면 통계 기반 규칙을, 합격률이 없으면 모의고사 점수 기반 규칙을 사용합니다. 기본 학습시간 및 계수는 가정값이며 합격 확률 예측이나 합격 보장이 아닙니다.'
  };
}

module.exports = {
  calculateStudyPlan,
  estimatePreparation,
  estimateHours,
  STUDY_ASSUMPTIONS,
  estimatePersonalRate
};
