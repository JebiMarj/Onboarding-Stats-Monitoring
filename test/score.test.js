'use strict';
const assert = require('node:assert/strict');
const S = require('../score.js');

assert.equal(S.weightsSum(S.DEFAULT_WEIGHTS), 100);
assert.equal(S.weightsValid(S.DEFAULT_WEIGHTS), true);

assert.equal(S.outcomeFor(80), 'Ready for endorsement');
assert.equal(S.outcomeFor(80.0), 'Ready for endorsement');
assert.equal(S.outcomeFor(79.99), 'Continue onboarding');
assert.equal(S.outcomeFor(0), 'Continue onboarding');
assert.equal(S.outcomeFor(100), 'Ready for endorsement');
assert.equal(S.outcomeFor(null), null);

assert.equal(S.conversionPercent(25, 100), 25);
assert.equal(S.conversionPercent(8, 20), 40);
assert.equal(S.conversionPercent(150, 100), 100);
assert.equal(S.conversionPercent(0, 10), 0);
assert.equal(S.conversionPercent(5, 0), null);
assert.equal(S.conversionPercent(null, 10), null);

const floored = S.attendancePercent({
  scheduledHours: 8,
  absenceDays: 2,
  lateMinutes: 0,
  downtimeMinutes: 0
});
assert.equal(floored, 0);

const partial = S.attendancePercent({
  scheduledHours: 40,
  absenceDays: 1,
  lateMinutes: 30,
  downtimeMinutes: 30
});
assert.ok(Math.abs(partial - 77.5) < 1e-9, 'expected 77.5, got ' + partial);

assert.equal(S.attendancePercent({ scheduledHours: 40, absenceDays: 0, lateMinutes: 0, downtimeMinutes: 0 }), 100);
assert.equal(S.attendancePercent({ scheduledHours: 0, absenceDays: 0, lateMinutes: 0, downtimeMinutes: 0 }), null);
assert.equal(S.attendancePercent({}), null);

const rescaled = S.overallScore({
  attendance: 100,
  conversion: 50,
  qa: null,
  tool: 100,
  communication: 100,
  thinking: 100,
  core: 100
}, S.DEFAULT_WEIGHTS, 'rescale');
assert.ok(Math.abs(rescaled - 81.25) < 1e-9, 'expected 81.25, got ' + rescaled);

assert.equal(S.overallScore({
  attendance: 100,
  conversion: null,
  qa: null,
  tool: null,
  communication: null,
  thinking: null,
  core: null
}, S.DEFAULT_WEIGHTS, 'rescale'), null);

const full = S.overallScore({
  attendance: 100,
  conversion: 40,
  qa: 88,
  tool: 90,
  communication: 85,
  thinking: 80,
  core: 92
}, S.DEFAULT_WEIGHTS, 'rescale');
const expected = 10 + 12 + 17.6 + 9 + 8.5 + 8 + 9.2;
assert.ok(Math.abs(full - expected) < 1e-9, 'expected ' + expected + ', got ' + full);
assert.equal(S.outcomeFor(full), 'Continue onboarding');

assert.equal(S.overallScore({
  attendance: 100,
  conversion: 100,
  qa: 100,
  tool: 100,
  communication: 100,
  thinking: 100,
  core: 100
}, {
  attendance: 10,
  conversion: 10,
  qa: 10,
  tool: 10,
  communication: 10,
  thinking: 10,
  core: 10
}, 'rescale'), null);

assert.throws(() => S.overallScore({ attendance: 100, qa: 100 }, S.DEFAULT_WEIGHTS, 'zero'));

console.log('score tests passed');
