// Weekly KPI. The missing-section rule is rescaleWeights and can be replaced
// by passing another function as scoreEvaluation({ rescale }).
// Keep the math aligned with public.compute_kpi_snapshot in supabase/schema.sql.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CNRScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var WORK_MINUTES = 480;
  var SECTION_KEYS = [
    'attendance',
    'conversion',
    'qa',
    'tool_navigation',
    'communication',
    'critical_thinking',
    'core_values'
  ];
  var SECTION_LABELS = {
    attendance: 'Attendance',
    conversion: 'Sales conversion',
    qa: 'QA score',
    tool_navigation: 'Tool navigation',
    communication: 'Communication',
    critical_thinking: 'Critical thinking',
    core_values: 'Core values'
  };
  var DEFAULT_WEIGHTS = {
    attendance: 10,
    conversion: 30,
    qa: 20,
    tool_navigation: 10,
    communication: 10,
    critical_thinking: 10,
    core_values: 10
  };
  var DEFAULT_PASS_MARK = 80;
  var SUM_TOLERANCE = 0.001;

  function isBlank(value) {
    return value == null || value === '';
  }

  function dailyAttendancePercent(input) {
    var src = input || {};
    if (src.absent === true || src.absent === 1 || src.absent === 'true') return 0;
    var late = Number(src.lateMinutes || 0);
    var down = Number(src.downtimeMinutes || 0);
    if (!Number.isFinite(late)) late = 0;
    if (!Number.isFinite(down)) down = 0;
    var pct = (WORK_MINUTES - late - down) / WORK_MINUTES * 100;
    return pct < 0 ? 0 : pct;
  }

  function weeklyAttendance(dailyPercents) {
    if (!dailyPercents || !dailyPercents.length) return null;
    var sum = 0;
    for (var i = 0; i < dailyPercents.length; i++) sum += Number(dailyPercents[i]);
    return sum / dailyPercents.length;
  }

  function conversionRate(total, converted) {
    if (isBlank(total)) return null;
    var leads = Number(total);
    if (!Number.isFinite(leads) || leads <= 0) return null;
    var won = isBlank(converted) ? 0 : Number(converted);
    if (!Number.isFinite(won) || won < 0) return null;
    var rate = (won / leads) * 100;
    return rate > 100 ? 100 : rate;
  }

  function weightsSum(weights) {
    return SECTION_KEYS.reduce(function (sum, key) {
      return sum + Number(weights ? weights[key] : NaN);
    }, 0);
  }

  function weightsValid(weights) {
    if (!weights || typeof weights !== 'object') return false;
    var sum = 0;
    for (var i = 0; i < SECTION_KEYS.length; i++) {
      var n = Number(weights[SECTION_KEYS[i]]);
      if (!Number.isFinite(n) || n < 0) return false;
      sum += n;
    }
    return Math.abs(sum - 100) < SUM_TOLERANCE;
  }

  function rescaleWeights(weights, includedKeys) {
    var included = {};
    (includedKeys || []).forEach(function (key) { included[key] = true; });
    var rows = SECTION_KEYS.map(function (key) {
      return { key: key, configuredWeight: Number(weights && weights[key] || 0) };
    });
    var sum = 0;
    rows.forEach(function (row) {
      if (included[row.key] && row.configuredWeight > 0) sum += row.configuredWeight;
    });
    return rows.map(function (row) {
      var isIn = !!(included[row.key] && row.configuredWeight > 0 && sum > 0);
      return {
        key: row.key,
        label: SECTION_LABELS[row.key],
        configuredWeight: row.configuredWeight,
        effectiveWeight: isIn ? (row.configuredWeight / sum) * 100 : 0,
        included: isIn
      };
    });
  }

  function scoreEvaluation(options) {
    var opts = options || {};
    var scores = opts.scores || {};
    var weights = opts.weights || DEFAULT_WEIGHTS;
    var passMark = opts.passMark == null ? DEFAULT_PASS_MARK : Number(opts.passMark);
    var rescale = typeof opts.rescale === 'function' ? opts.rescale : rescaleWeights;
    var includedKeys = SECTION_KEYS.filter(function (key) {
      return !isBlank(scores[key]) && Number.isFinite(Number(scores[key]));
    });
    var scaled = rescale(weights, includedKeys);
    var breakdown = scaled.map(function (row) {
      var raw = scores[row.key];
      var score = isBlank(raw) || !Number.isFinite(Number(raw)) ? null : Number(raw);
      var included = !!(row.included && score != null);
      var effective = included ? Number(row.effectiveWeight) || 0 : 0;
      return {
        key: row.key,
        label: row.label || SECTION_LABELS[row.key],
        score: score,
        configuredWeight: Number(row.configuredWeight || 0),
        effectiveWeight: effective,
        contribution: included ? score * effective / 100 : 0,
        included: included
      };
    });
    var any = breakdown.some(function (row) { return row.included; });
    var overall = any
      ? breakdown.reduce(function (sum, row) { return sum + row.contribution; }, 0)
      : null;
    var missingWeighted = breakdown.some(function (row) {
      return row.score == null && row.configuredWeight > 0;
    });
    return {
      overall: overall,
      passed: overall == null || !Number.isFinite(passMark) ? null : overall >= passMark,
      passMark: passMark,
      rescaled: !!(any && missingWeighted),
      breakdown: breakdown
    };
  }

  function formatWeight(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '0';
    var rounded = Math.round(n * 100) / 100;
    return String(rounded);
  }

  function describeScore(result) {
    var breakdown = (result && result.breakdown) || [];
    var parts = breakdown.filter(function (row) { return row.included; }).map(function (row) {
      return row.label + ' × ' + formatWeight(row.effectiveWeight) + '%';
    });
    var configured = breakdown.map(function (row) {
      return row.label + ' ' + formatWeight(row.configuredWeight) + '%';
    }).join(', ');
    var missing = breakdown.filter(function (row) {
      return row.score == null && Number(row.configuredWeight) > 0;
    }).map(function (row) { return row.label; });
    var text = 'Overall = ' + (parts.length ? parts.join(' + ') : 'no scored sections') + '.';
    if (configured) text += ' Configured weights: ' + configured + '.';
    if (result && result.rescaled && missing.length) {
      text += ' ' + missing.join(', ') + (missing.length === 1 ? ' was' : ' were');
      text += ' not entered, so the remaining weights were scaled up to 100%.';
    }
    if (result && result.passMark != null) text += ' Pass mark: ' + formatWeight(result.passMark) + '.';
    return text;
  }

  return {
    WORK_MINUTES: WORK_MINUTES,
    SECTION_KEYS: SECTION_KEYS,
    SECTION_LABELS: SECTION_LABELS,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    DEFAULT_PASS_MARK: DEFAULT_PASS_MARK,
    SUM_TOLERANCE: SUM_TOLERANCE,
    dailyAttendancePercent: dailyAttendancePercent,
    weeklyAttendance: weeklyAttendance,
    conversionRate: conversionRate,
    weightsSum: weightsSum,
    weightsValid: weightsValid,
    rescaleWeights: rescaleWeights,
    scoreEvaluation: scoreEvaluation,
    describeScore: describeScore,
    formatWeight: formatWeight
  };
});
