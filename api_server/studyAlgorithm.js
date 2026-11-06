
/**
 * studyAlgorithm.js
 * 규칙 기반 개인 맞춤형 학습계획 생성
 * 통계적으로 검증된 합격 예측 모델은 아닙니다.
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
  subjects = []
}) {

  // 1. 입력값 검사
  if (!Object.hasOwn(LEVEL, level)) {
    throw new Error('학습 수준이 올바르지 않습니다.');
  }

  if (!['written', 'practical'].includes(examType)) {
    throw new Error('시험 유형이 올바르지 않습니다.');
  }

  if (
    !Number.isFinite(dailyHours) ||
    dailyHours < 0.5 ||
    dailyHours > 12
  ) {
    throw new Error('하루 공부시간은 0.5~12시간이어야 합니다.');
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

  // 2. 시험일 검사
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

  // 3. 데이터 유효성 검사
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

  // 4. 학습량 보정계수
  const durationFactor = validDuration
    ? clamp((averageDays / 450) ** 0.25, 0.75, 1.35)
    : 1;

  const passFactor = validRate
    ? clamp(
        (40 / Math.max(passRate, 1)) ** 0.25,
        0.75,
        1.4
      )
    : 1;

  const scoreFactor = validScore
    ? clamp(
        1 + (65 - mockScore) / 120,
        0.7,
        1.5
      )
    : 1;

  // 5. 예상 필요 학습시간
  const estimatedHours = Math.ceil(
    160 *
    durationFactor *
    passFactor *
    LEVEL[level] *
    (examType === 'practical' ? 1.15 : 1) *
    scoreFactor
  );

  // 6. 시험일 이전의 공부 가능한 날짜
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
    throw new Error('시험 전 공부 가능한 날짜가 없습니다.');
  }

  const availableHours = Number(
    (dates.length * dailyHours).toFixed(1)
  );

  const feasible = availableHours >= estimatedHours;

  const plannedHours = Math.min(
    estimatedHours,
    availableHours
  );

  // 7. 과목별 CBT 점수 검사
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

  // 8. 취약 과목별 학습시간 배분
  const weights = validSubjects.map(
    s => Math.max(5, 100 - s.score)
  );

  const weightSum = weights.reduce(
    (a, b) => a + b,
    0
  );

  const subjectHours = validSubjects.map((s, i) => ({
    name: s.name,
    score: s.score,
    weight: Number(
      (weights[i] / weightSum).toFixed(4)
    ),
    targetHours: Number(
      (plannedHours * weights[i] / weightSum).toFixed(2)
    )
  }));

  const remaining = subjectHours.map(
    s => s.targetHours
  );

  // 9. 학습 진행 단계
  const phaseDefs = [
    { name: '기초 이론 학습', end: 0.4 },
    { name: '핵심 개념 및 문제풀이', end: 0.7 },
    { name: '기출문제 및 오답 정리', end: 0.9 },
    { name: '모의고사 및 최종 복습', end: 1 }
  ];

  // 10. 날짜별 학습 일정 생성
  const events = [];

  let remainingHours = plannedHours;

  for (let i = 0; i < dates.length; i++) {
    if (remainingHours <= 0) {
      break;
    }

    const remainingDays = dates.length - i;

    const hours = Math.min(
      dailyHours,
      Math.ceil(
        (remainingHours / remainingDays) * 100
      ) / 100
    );

    const actualHours = Number(
      Math.min(hours, remainingHours).toFixed(2)
    );

    if (actualHours <= 0) {
      break;
    }

    const progress = (i + 0.5) / dates.length;

    const phase =
      phaseDefs.find(p => progress <= p.end) ||
      phaseDefs[3];

    let focus = '';

    if (subjectHours.length > 0) {
      const candidates = remaining
        .map((value, index) => ({
          index,
          value
        }))
        .filter(item => item.value > 0);

      if (candidates.length > 0) {
        const selected = candidates.reduce(
          (best, item) =>
            item.value > best.value ? item : best
        );

        focus = subjectHours[selected.index].name;

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
      (remainingHours - actualHours).toFixed(2)
    );
  }

  // 11. 경고 메시지
  const warnings = [];

  if (!validRate) {
    warnings.push(
      '합격률 데이터 없음: 합격률 보정 없이 계산'
    );
  }

  if (!validDuration) {
    warnings.push(
      '평균 취득소요기간 데이터 없음: 기간 보정 없이 계산'
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
      '시험일까지 확보 가능한 공부시간이 추정 필요시간보다 부족함'
    );
  }

  // 12. 최종 결과 반환
  return {
    certificateName,
    examType,
    examDate: dateKey(target),
    estimatedHours,
    availableHours,
    availableStudyDays: dates.length,
    requiredDailyHours: Number(
      (estimatedHours / dates.length).toFixed(2)
    ),
    feasible,
    passRate: validRate ? passRate : null,
    averageDays: validDuration ? averageDays : null,
    subjectHours,
    events,
    warnings,
    inputsUsed: {
      passRate: validRate,
      averageDays: validDuration,
      mockScore: validScore,
      subjectScores: validSubjects.length > 0
    },
    notice:
      '규칙 기반 초기 추정치이며 평균 취득기간은 실제 순공부시간과 다릅니다. 합격 가능성을 예측하거나 보장하지 않습니다.'
  };
}

module.exports = { calculateStudyPlan };
