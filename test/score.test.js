const test = require('node:test');
const assert = require('node:assert/strict');
const Score = require('../js/score.js');
const Labels = require('../js/labels.js');
const Dates = require('../js/dates.js');

function near(actual, expected, eps) {
  assert.ok(Math.abs(actual - expected) < (eps || 1e-9), actual + ' is not near ' + expected);
}

function weights(overrides) {
  return Object.assign({}, Score.DEFAULT_WEIGHTS, overrides || {});
}

function scores(overrides) {
  const base = {
    attendance: null,
    conversion: null,
    qa: null,
    tool_navigation: null,
    communication: null,
    critical_thinking: null,
    core_values: null
  };
  return Object.assign(base, overrides || {});
}

test('a full day with no lost minutes is 100%', () => {
  assert.equal(Score.dailyAttendancePercent({ absent: false, lateMinutes: 0, downtimeMinutes: 0 }), 100);
  assert.equal(Score.dailyAttendancePercent({ lateMinutes: 60, downtimeMinutes: 0 }), 87.5);
});

test('lost minutes reduce the day from 480', () => {
  near(Score.dailyAttendancePercent({ lateMinutes: 48, downtimeMinutes: 0 }), 90);
  near(Score.dailyAttendancePercent({ lateMinutes: 24, downtimeMinutes: 24 }), 90);
  assert.equal(Score.dailyAttendancePercent({ lateMinutes: 240, downtimeMinutes: 240 }), 0);
  assert.equal(Score.dailyAttendancePercent({ lateMinutes: 500, downtimeMinutes: 0 }), 0);
});

test('a full-day absence is 0% even when minutes are filled in', () => {
  assert.equal(Score.dailyAttendancePercent({ absent: true, lateMinutes: 15, downtimeMinutes: 20 }), 0);
});

test('weekly attendance is the average of recorded days only', () => {
  assert.equal(Score.weeklyAttendance([]), null);
  assert.equal(Score.weeklyAttendance([100, 50, 0]), 50);
  assert.equal(Score.weeklyAttendance([100, 0]), 50);
});

test('conversion rate caps at 100 and is N/A when total is blank or zero', () => {
  assert.equal(Score.conversionRate(10, 4), 40);
  assert.equal(Score.conversionRate(10, 15), 100);
  assert.equal(Score.conversionRate(0, 0), null);
  assert.equal(Score.conversionRate('', 3), null);
  assert.equal(Score.conversionRate(null, 3), null);
  assert.equal(Score.conversionRate(5, null), 0);
  assert.equal(Score.conversionRate(5, ''), 0);
});

test('default weights sum to 100 and other totals are rejected', () => {
  assert.equal(Score.weightsSum(Score.DEFAULT_WEIGHTS), 100);
  assert.equal(Score.weightsValid(Score.DEFAULT_WEIGHTS), true);
  const low = weights({ attendance: 0 });
  assert.equal(Score.weightsSum(low), 90);
  assert.equal(Score.weightsValid(low), false);
  assert.equal(Score.weightsValid(weights({ qa: -1, attendance: 31 })), false);
  assert.equal(Score.weightsValid({ attendance: 100 }), false);
});

test('a missing section is rescaled and a zero is kept', () => {
  const missingQa = Score.scoreEvaluation({
    scores: scores({
      attendance: 100,
      conversion: 100,
      tool_navigation: 100,
      communication: 100,
      critical_thinking: 100,
      core_values: 100
    }),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80
  });
  assert.equal(missingQa.rescaled, true);
  assert.equal(missingQa.passed, true);
  near(missingQa.overall, 100);
  const attendance = missingQa.breakdown.find((row) => row.key === 'attendance');
  const qa = missingQa.breakdown.find((row) => row.key === 'qa');
  near(attendance.effectiveWeight, 12.5);
  assert.equal(qa.included, false);
  assert.equal(qa.score, null);

  const zero = Score.scoreEvaluation({
    scores: scores({ attendance: 0 }),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80
  });
  assert.equal(zero.overall, 0);
  assert.equal(zero.passed, false);
  assert.equal(zero.rescaled, true);
  assert.equal(zero.breakdown.find((row) => row.key === 'attendance').included, true);
});

test('pass mark boundaries are 80 pass and 79.99 fail', () => {
  const pass = Score.scoreEvaluation({
    scores: scores({ qa: 80 }),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80
  });
  const fail = Score.scoreEvaluation({
    scores: scores({ qa: 79.99 }),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80
  });
  near(pass.overall, 80);
  assert.equal(pass.passed, true);
  near(fail.overall, 79.99);
  assert.equal(fail.passed, false);
});

test('an empty week has no overall score', () => {
  const result = Score.scoreEvaluation({
    scores: scores(),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80
  });
  assert.equal(result.overall, null);
  assert.equal(result.passed, null);
  assert.equal(result.rescaled, false);
});

test('the rescale rule can be swapped without changing the rest of the formula', () => {
  const result = Score.scoreEvaluation({
    scores: scores({ attendance: 100 }),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80,
    rescale: function () {
      return Score.SECTION_KEYS.map((key) => ({
        key: key,
        label: Score.SECTION_LABELS[key],
        configuredWeight: Score.DEFAULT_WEIGHTS[key],
        effectiveWeight: key === 'attendance' ? 50 : 0,
        included: key === 'attendance'
      }));
    }
  });
  near(result.overall, 50);
});

test('the formula text names weights, the pass mark, and rescaling', () => {
  const full = Score.scoreEvaluation({
    scores: scores({
      attendance: 100, conversion: 100, qa: 100, tool_navigation: 100,
      communication: 100, critical_thinking: 100, core_values: 100
    }),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80
  });
  const text = Score.describeScore(full);
  assert.match(text, /Attendance × 10%/);
  assert.match(text, /WBR × 30%/);
  assert.match(text, /Pass mark: 80/);
  const partial = Score.describeScore(Score.scoreEvaluation({
    scores: scores({ attendance: 90 }),
    weights: Score.DEFAULT_WEIGHTS,
    passMark: 80
  }));
  assert.match(partial, /scaled up to 100%/);
  assert.match(partial, /QA score/);
  assert.match(partial, /were not entered/);
});

test('section labels stay aligned with the score module', () => {
  Score.SECTION_KEYS.forEach((key) => {
    assert.equal(Labels.SECTION_LABELS[key], Score.SECTION_LABELS[key]);
  });
});

test('weeks start on Monday', () => {
  assert.equal(Dates.mondayOf('2026-10-19'), '2026-10-19');
  assert.equal(Dates.mondayOf('2026-10-20'), '2026-10-19');
  assert.equal(Dates.mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(Dates.isMonday('2026-10-12'), true);
  assert.equal(Dates.isMonday('2026-10-13'), false);
  assert.equal(Dates.addDays('2026-10-12', 7), '2026-10-19');
});
