
/**
 * Recommender Calendar
 * 자격증 맞춤형 학습량 추정 알고리즘 v1
 *
 * 주의:
 * 아래 기준시간과 보정계수는 초기 설계 가정값이다.
 * Q-Net의 취득소요기간을 실제 공부시간으로 해석하지 않는다.
 */

// 사용자 실력별 학습량 보정
const LEVEL_FACTORS = {
  beginner: 1.3,
  intermediate: 1.0,
  advanced: 0.7
};

// 초기 가정: 기준 학습시간
const BASE_STUDY_HOURS = 160;

// 비정상적인 값 방지
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {Object} params
 * @param {string} params.certificateName
 * @param {number|null} params.averageDays
 * @param {number|null} params.passRate
 * @param {string} params.level
 * @param {number} params.dailyHours
 * @param {number} params.remainingDays
 * @param {number} params.studyDaysPerWeek
 */
function calculateStudyPlan(params) {
  const {
    certificateName,
    averageDays = null,
    passRate = null,
    level = 'beginner',
    dailyHours = 2,
    remainingDays = 90,
    studyDaysPerWeek = 6
  } = params;

  if (!certificateName) {
    throw new Error('자격증 이름이 필요합니다.');
  }

  if (!LEVEL_FACTORS[level]) {
    throw new Error('올바르지 않은 학습 수준입니다.');
  }

  if (
    !Number.isFinite(dailyHours) ||
    dailyHours <= 0 ||
    dailyHours > 24
  ) {
    throw new Error('하루 공부시간이 올바르지 않습니다.');
  }

  if (
    !Number.isInteger(remainingDays) ||
    remainingDays <= 0
  ) {
    throw new Error('시험까지 남은 일수가 올바르지 않습니다.');
  }

  if (
    !Number.isInteger(studyDaysPerWeek) ||
    studyDaysPerWeek < 1 ||
    studyDaysPerWeek > 7
  ) {
    throw new Error('주간 공부 가능 일수는 1~7일이어야 합니다.');
  }

  // 1. 취득소요기간 보정
  // 450일을 비교 기준으로 사용하며, 과도한 영향을 제한한다.
  const durationFactor =
    Number.isFinite(averageDays) && averageDays > 0
      ? clamp(
          Math.pow(averageDays / 450, 0.25),
          0.75,
          1.35
        )
      : 1.0;

  // 2. 합격률 보정
  // 합격률 40%를 비교 기준으로 사용한다.
  const passRateFactor =
    Number.isFinite(passRate) &&
    passRate > 0 &&
    passRate <= 100
      ? clamp(
          Math.pow(40 / passRate, 0.25),
          0.75,
          1.4
        )
      : 1.0;

  // 3. 사용자 수준 보정
  const levelFactor = LEVEL_FACTORS[level];

  // 4. 추정 총 학습시간
  const estimatedHours = Math.ceil(
    BASE_STUDY_HOURS *
    durationFactor *
    passRateFactor *
    levelFactor
  );

  // 5. 시험까지 공부 가능한 일수
  const availableStudyDays = Math.max(
    1,
    Math.floor(
      remainingDays / 7
    ) * studyDaysPerWeek +
    Math.min(
      remainingDays % 7,
      studyDaysPerWeek
    )
  );

  // 6. 확보 가능한 총 학습시간
  const availableHours =
    availableStudyDays * dailyHours;

  // 7. 필요한 하루 학습시간
  const requiredDailyHours =
    Math.ceil(
      (estimatedHours / availableStudyDays) * 10
    ) / 10;

  // 8. 계획 충족률
  const feasibilityRate = Math.round(
    (availableHours / estimatedHours) * 100
  );

  // 9. 학습 단계별 시간 배분
  const phases = [
    {
      name: '기초 이론 학습',
      ratio: 0.4
    },
    {
      name: '핵심 개념 및 문제풀이',
      ratio: 0.3
    },
    {
      name: '기출문제 및 오답 정리',
      ratio: 0.2
    },
    {
      name: '모의고사 및 최종 복습',
      ratio: 0.1
    }
  ];

  const studyPhases = phases.map(phase => ({
    name: phase.name,
    ratio: phase.ratio,
    hours: Math.round(
      estimatedHours * phase.ratio * 10
    ) / 10
  }));

  return {
    certificateName,
    estimatedHours,
    availableStudyDays,
    availableHours,
    requiredDailyHours,
    feasibilityRate,
    feasible: availableHours >= estimatedHours,
    studyPhases,
    factors: {
      durationFactor,
      passRateFactor,
      levelFactor
    },
    dataAvailability: {
      hasDuration:
        Number.isFinite(averageDays) && averageDays > 0,
      hasPassRate:
        Number.isFinite(passRate) &&
        passRate > 0 &&
        passRate <= 100
    },
    notice:
      '초기 가정 기반 학습량 추정치이며, 실제 합격을 보장하지 않습니다.'
  };
}

module.exports = {
  calculateStudyPlan
};
