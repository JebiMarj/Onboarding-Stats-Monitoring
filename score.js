// Weekly QA KPI. Loaded by index.html and by node tests.
// The missing-section rule is isolated in MISSING_RULES so it can be swapped
// without touching attendance, conversion, or the pass/fail cutoff.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CNRScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var WEIGHT_KEYS = ['attendance', 'conversion', 'qa', 'tool', 'communication', 'thinking', 'core'];
  var WEIGHT_LABELS = {
    attendance: 'Attendance',
    conversion: 'Sales conversion',
    qa: 'QA score',
    tool: 'Tool navigation',
    communication: 'Communication',
    thinking: 'Critical thinking',
    core: 'Core values'
  };
  var DEFAULT_WEIGHTS = {
    attendance: 10,
    conversion: 30,
    qa: 20,
    tool: 10,
    communication: 10,
    thinking: 10,
    core: 10
  };
  var HOURS_PER_DAY = 8;
  var DEFAULT_PASS = 80;

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function weightsSum(weights) {
    return WEIGHT_KEYS.reduce(function (sum, key) {
      return sum + Number(weights && weights[key] || 0);
    }, 0);
  }

  function normalizeWeights(weights) {
    var src = weights && typeof weights === 'object' ? weights : {};
    var out = {};
    WEIGHT_KEYS.forEach(function (key) { out[key] = Number(src[key]); });
    return out;
  }

  function weightsValid(weights) {
    var w = normalizeWeights(weights);
    return WEIGHT_KEYS.every(function (key) { return Number.isFinite(w[key]) && w[key] >= 0; })
      && Math.abs(weightsSum(w) - 100) < 1e-6;
  }

  // 8 hours in a scheduled day is 100%. Absence, lateness, and downtime
  // come off as lost hours. Result is floored at 0. No scheduled hours
  // means the section is empty.
  function attendancePercent(input) {
    input = input || {};
    var scheduled = num(input.scheduledHours);
    if (scheduled == null || scheduled <= 0) return null;
    var lost = Number(input.absenceDays || 0) * HOURS_PER_DAY
      + Number(input.lateMinutes || 0) / 60
      + Number(input.downtimeMinutes || 0) / 60;
    return Math.max(0, ((scheduled - lost) / scheduled) * 100);
  }

  // Actual conversion rate, 0-based, capped at 100. 25 converted of 100 is 25.
  // No total leads means the section is empty.
  function conversionPercent(converted, total) {
    var t = num(total);
    var c = num(converted);
    if (t == null || t <= 0 || c == null) return null;
    return Math.min(100, Math.max(0, (c / t) * 100));
  }

  // Drop empty sections and divide by the weights that remain.
  // At least two scored sections are required, same as the previous training rollup.
  function rescale(components, weights) {
    var present = WEIGHT_KEYS.filter(function (key) { return num(components[key]) != null; });
    if (present.length < 2) return null;
    var weightSum = present.reduce(function (sum, key) {
      return sum + Number(weights[key] || 0);
    }, 0);
    if (!(weightSum > 0)) return null;
    var total = present.reduce(function (sum, key) {
      return sum + Number(weights[key] || 0) * num(components[key]);
    }, 0);
    return total / weightSum;
  }

  var MISSING_RULES = { rescale: rescale };

  function overallScore(components, weights, ruleName) {
    var name = ruleName || 'rescale';
    var rule = MISSING_RULES[name];
    if (!rule) throw new Error('Unknown missing-score rule: ' + name);
    var w = normalizeWeights(weights);
    if (!weightsValid(w)) return null;
    return rule(components || {}, w);
  }

  function outcomeFor(score, passMark) {
    if (num(score) == null) return null;
    var mark = num(passMark);
    if (mark == null) mark = DEFAULT_PASS;
    return Number(score) >= mark ? 'Ready for endorsement' : 'Continue onboarding';
  }

  function componentsFromInput(input) {
    input = input || {};
    return {
      attendance: attendancePercent(input),
      conversion: conversionPercent(input.convertedLeads, input.totalLeads),
      qa: num(input.qaScore),
      tool: num(input.toolNavigation),
      communication: num(input.communication),
      thinking: num(input.criticalThinking),
      core: num(input.coreValues)
    };
  }

  return {
    WEIGHT_KEYS: WEIGHT_KEYS,
    WEIGHT_LABELS: WEIGHT_LABELS,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    HOURS_PER_DAY: HOURS_PER_DAY,
    DEFAULT_PASS: DEFAULT_PASS,
    MISSING_RULES: MISSING_RULES,
    num: num,
    weightsSum: weightsSum,
    normalizeWeights: normalizeWeights,
    weightsValid: weightsValid,
    attendancePercent: attendancePercent,
    conversionPercent: conversionPercent,
    rescale: rescale,
    overallScore: overallScore,
    outcomeFor: outcomeFor,
    componentsFromInput: componentsFromInput
  };
});
