
/**
 * studyData.js
 * Q-Net 합격률 데이터와 자격증 이름 매칭
 */

function normalizeName(name) {
  return String(name ?? '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function parsePassRate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(
    String(value).replace('%', '').trim()
  );

  if (!Number.isFinite(number)) {
    return null;
  }

  if (number < 0 || number > 100) {
    return null;
  }

  return number;
}

function findPassRate(items, certificateName, examType) {
  if (!Array.isArray(items)) {
    return null;
  }

  const targetName = normalizeName(certificateName);

  const matched = items.find(item => {
    return (
      normalizeName(item.name) === targetName &&
      item.examType === examType
    );
  });

  if (!matched) {
    return null;
  }

  const applicants = Number(matched.applicants);
  const passed = Number(matched.passed);

  return {
    name: matched.name,
    examType: matched.examType,
    year: matched.year,
    applicants,
    passed,
    passRate: parsePassRate(matched.passRate)
  };
}

function getCertificatePassRates(
  items,
  certificateName
) {
  return {
    written: findPassRate(
      items,
      certificateName,
      '필기'
    ),
    practical: findPassRate(
      items,
      certificateName,
      '실기'
    )
  };
}

module.exports = {
  normalizeName,
  parsePassRate,
  findPassRate,
  getCertificatePassRates
};
