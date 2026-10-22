const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../js/model.js');
const Perms = require('../js/permissions.js');
const Score = require('../js/score.js');

const admin = { id: 'admin-1', role: 'admin', name: 'Local admin', email: 'admin@local.test' };
const onboarder = { id: 'onboarder-1', role: 'onboarder', name: 'Local onboarder', email: 'onboarder@local.test' };
const qa = { id: 'qa-1', role: 'qa', name: 'Local QA', email: 'qa@local.test' };
const viewer = { id: 'viewer-1', role: 'viewer', name: 'Local viewer', email: 'viewer@local.test' };

function fresh() {
  return Model.createState({ users: [admin, onboarder, qa, viewer] });
}

function must(result) {
  assert.equal(result.ok, true, result.error || 'expected success');
  return result;
}

test('roles match the database matrix', () => {
  Object.keys(Perms.ACTIONS).forEach((action) => {
    assert.equal(Perms.can('viewer', action), action === 'view');
  });
  assert.equal(Perms.can('qa', 'qa'), true);
  assert.equal(Perms.can('qa', 'attendance'), false);
  assert.equal(Perms.can('qa', 'evaluations'), false);
  assert.equal(Perms.can('onboarder', 'qa'), false);
  assert.equal(Perms.can('onboarder', 'endorse'), false);
  assert.equal(Perms.can('onboarder', 'settings'), false);
  assert.equal(Perms.can('admin', 'endorse'), true);
  assert.equal(Perms.can('admin', 'users'), true);
  assert.equal(Perms.can('admin', 'undo_attendance'), true);
  assert.equal(Perms.can('onboarder', 'undo_attendance'), false);
});

test('the weekly flow, batch ids, and role gates', () => {
  let state = fresh();
  assert.equal(Model.createVa(state, viewer, { fullName: 'Ava Cruz', onboardingStart: '2026-10-12', batchId: 'x' }).ok, false);

  state = must(Model.createBatch(state, onboarder, { name: 'October intake' })).state;
  const batchId = state.batches[0].id;
  state = must(Model.createVa(state, onboarder, {
    fullName: 'Ava Cruz',
    onboardingStart: '2026-10-01',
    onboarderName: 'Local onboarder',
    clientName: 'North Clinic',
    businessName: 'North Clinic LLC',
    sopOrPortfolio: 'https://example.com/sop',
    schedule: 'Mon–Fri, 9:00–18:00',
    status: 'Onboarding',
    batchId: batchId
  })).state;
  const vaId = state.vas[0].id;

  state = must(Model.renameBatch(state, onboarder, { id: batchId, name: 'October 2026' })).state;
  assert.equal(state.batches[0].id, batchId);
  assert.equal(Model.presentVa(state, vaId).batchName, 'October 2026');
  assert.equal(Model.renameBatch(state, qa, { id: batchId, name: 'Nope' }).error, 'Your role cannot do that.');

  state = must(Model.startEvaluation(state, onboarder, { vaId: vaId, weekStart: '2026-10-12' })).state;
  const week1 = state.evaluations[0].id;
  assert.equal(Model.saveAttendance(state, qa, { vaId: vaId, workDate: '2026-10-12', absent: true }).error, 'Your role cannot do that.');

  state = must(Model.saveAttendance(state, onboarder, {
    vaId: vaId, workDate: '2026-10-12', absent: true, lateMinutes: 30, downtimeMinutes: 10
  })).state;
  state = must(Model.saveAttendance(state, onboarder, {
    vaId: vaId, workDate: '2026-10-13', absent: false, lateMinutes: 48, downtimeMinutes: 0
  })).state;
  state = must(Model.saveAttendance(state, onboarder, {
    vaId: vaId, workDate: '2026-10-13', absent: false, lateMinutes: 48, downtimeMinutes: 12, remarks: 'Bus was late'
  })).state;
  const days = state.attendance.filter((row) => row.vaId === vaId);
  assert.equal(days.length, 2);
  const absent = days.find((row) => row.workDate === '2026-10-12');
  assert.equal(absent.absent, true);
  assert.equal(absent.lateMinutes, 0);
  assert.equal(Score.dailyAttendancePercent(absent), 0);
  const late = days.find((row) => row.workDate === '2026-10-13');
  assert.equal(late.remarks, 'Bus was late');
  assert.equal(Score.dailyAttendancePercent(late), Score.dailyAttendancePercent({ lateMinutes: 48, downtimeMinutes: 12 }));

  assert.equal(Model.saveQa(state, onboarder, { evaluationId: week1, score: 79.99 }).error, 'Your role cannot do that.');
  state = must(Model.saveQa(state, qa, {
    evaluationId: week1,
    score: 79.99,
    formUrl: 'https://example.com/form',
    recordingUrl: ''
  })).state;
  assert.equal(Model.saveQa(state, qa, { evaluationId: week1, score: 101 }).ok, false);

  const beforeCoaching = Model.computeSnapshot(state, week1).overall;
  state = must(Model.addCoaching(state, onboarder, {
    vaId: vaId,
    sessionDate: '2026-10-14',
    topic: 'Opening the call',
    discussion: 'The greeting skipped the client name.',
    action: 'Use the greeting script on the next five calls.'
  })).state;
  assert.equal(Model.computeSnapshot(state, week1).overall, beforeCoaching);
  assert.equal(state.coaching[0].topic, 'Opening the call');
  assert.equal(Model.addCoaching(state, qa, {
    vaId: vaId, sessionDate: '2026-10-14', topic: 'x', discussion: 'y', action: 'z'
  }).error, 'Your role cannot do that.');

  const blocked = Model.closeEvaluation(state, onboarder, { evaluationId: week1, gaps: '   ', coachingActions: '' });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Gaps and coaching actions/);
  assert.equal(state.evaluations[0].status, 'open');
  assert.equal(state.vas[0].status, 'Onboarding');

  state = must(Model.closeEvaluation(state, onboarder, {
    evaluationId: week1,
    gaps: 'QA is below the pass mark.',
    coachingActions: 'Review two recorded calls before Friday.'
  })).state;
  assert.equal(state.evaluations[0].status, 'closed');
  assert.equal(state.evaluations[0].outcome, 'continue_onboarding');
  assert.equal(state.vas[0].status, 'Continue onboarding');
  assert.equal(state.evaluations[0].scoreSnapshot.passed, false);
  assert.ok(state.evaluations[0].scoreSnapshot.overall < 80);
  assert.ok(state.history.some((row) => row.newStatus === 'Continue onboarding' && row.changedBy === onboarder.id));

  state = must(Model.nextEvaluation(state, onboarder, { vaId: vaId })).state;
  const week2 = state.evaluations.find((row) => row.weekStart === '2026-10-19');
  assert.ok(week2);
  assert.equal(week2.status, 'open');

  state = must(Model.saveQa(state, qa, { evaluationId: week2.id, score: 80, formUrl: 'https://example.com/form-2', recordingUrl: 'https://example.com/call' })).state;
  const passing = Model.computeSnapshot(state, week2.id);
  assert.equal(passing.passed, true);
  assert.ok(Math.abs(passing.overall - 80) < 1e-9);

  const closedPass = must(Model.closeEvaluation(state, onboarder, { evaluationId: week2.id, gaps: '', coachingActions: '' }));
  state = closedPass.state;
  assert.equal(state.vas[0].status, 'Ready for endorsement');
  assert.equal(Model.endorse(state, onboarder, { vaId: vaId }).error, 'Your role cannot do that.');
  assert.equal(Model.endorse(state, qa, { vaId: vaId }).error, 'Your role cannot do that.');
  state = must(Model.endorse(state, admin, { vaId: vaId })).state;
  assert.equal(state.vas[0].status, 'Endorsed');
  assert.equal(state.vas[0].endorsedBy, admin.id);
  assert.ok(state.vas[0].endorsedAt);
  const endorsement = state.history.find((row) => row.newStatus === 'Endorsed');
  assert.equal(endorsement.previousStatus, 'Ready for endorsement');
  assert.equal(endorsement.changedBy, admin.id);
  assert.equal(endorsement.note, 'Endorsed');
  assert.ok(endorsement.changedAt);
});

test('finalizing attendance locks every row until an admin undoes it', () => {
  let state = fresh();
  state = must(Model.createBatch(state, admin, { name: 'Batch A' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Ada Cruz',
    onboardingStart: '2026-10-12',
    batchId: state.batches[0].id
  })).state;
  const vaId = state.vas[0].id;
  state = must(Model.saveAttendance(state, onboarder, {
    vaId, workDate: '2026-10-12', absent: false, lateMinutes: 0, downtimeMinutes: 0, remarks: 'On time'
  })).state;
  const rowId = state.attendance[0].id;
  assert.equal(state.attendance[0].remarks, 'On time');
  assert.equal(Model.finalizeAttendance(state, qa, { vaId }).error, 'Your role cannot do that.');
  state = must(Model.finalizeAttendance(state, onboarder, { vaId })).state;
  const shown = Model.presentVa(state, vaId);
  assert.equal(shown.attendanceFinalizedBy, onboarder.id);
  assert.equal(shown.attendanceFinalizedByName, 'Local onboarder');
  assert.match(shown.attendanceFinalizedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(Model.saveAttendance(state, admin, {
    vaId, workDate: '2026-10-13', lateMinutes: 0, downtimeMinutes: 0
  }).error, 'Attendance is finalized.');
  assert.equal(Model.deleteAttendance(state, admin, { id: rowId }).error, 'Attendance is finalized.');
  assert.equal(Model.finalizeAttendance(state, admin, { vaId }).error, 'Attendance is already finalized.');
  assert.equal(Model.undoFinalizeAttendance(state, onboarder, { vaId }).error, 'Your role cannot do that.');
  state = must(Model.undoFinalizeAttendance(state, admin, { vaId })).state;
  assert.equal(Model.presentVa(state, vaId).attendanceFinalizedAt, '');
  state = must(Model.saveAttendance(state, onboarder, {
    vaId, workDate: '2026-10-13', lateMinutes: 60, downtimeMinutes: 0, remarks: 'Traffic'
  })).state;
  assert.equal(state.attendance.find((row) => row.workDate === '2026-10-13').remarks, 'Traffic');
  assert.equal(Score.dailyAttendancePercent(state.attendance.find((row) => row.workDate === '2026-10-13')), 87.5);
});

test('WBR, competencies, and comments feed the score and coaching does not', () => {
  let state = fresh();
  state = must(Model.createBatch(state, admin, { name: 'Batch A' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Ben Santos',
    onboardingStart: '2026-10-12',
    batchId: state.batches[0].id
  })).state;
  const vaId = state.vas[0].id;
  state = must(Model.startEvaluation(state, admin, { vaId: vaId, weekStart: '2026-10-12' })).state;
  const evaluationId = state.evaluations[0].id;
  state = must(Model.saveAttendance(state, admin, { vaId: vaId, workDate: '2026-10-12', lateMinutes: 0, downtimeMinutes: 0 })).state;
  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-10-12', totalLeads: 8, convertedLeads: 12 })).state;
  assert.equal(Score.conversionRate(8, 12), 100);
  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-10-12', totalLeads: 0, convertedLeads: 3 })).state;
  assert.equal(Model.computeSnapshot(state, evaluationId).breakdown.find((row) => row.key === 'conversion').score, null);
  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-10-12', totalLeads: 10, convertedLeads: 4 })).state;
  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-10-13', totalLeads: 10, convertedLeads: 6 })).state;
  assert.equal(Model.computeSnapshot(state, evaluationId).breakdown.find((row) => row.key === 'conversion').score, 50);
  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-10-13', totalLeads: '', convertedLeads: '' })).state;
  state = must(Model.saveQa(state, qa, { evaluationId: evaluationId, score: 90 })).state;
  state = must(Model.saveCompetencies(state, onboarder, {
    evaluationId: evaluationId,
    toolNavigation: 80,
    toolNavigationComment: 'Knows the dialer.',
    communication: 70,
    communicationComment: 'Rushes the close.',
    criticalThinking: 75,
    criticalThinkingComment: 'Missed a pricing objection.',
    coreValues: 88,
    coreValuesComment: 'Respectful with the client.'
  })).state;
  const comp = state.competencies[0];
  assert.equal(comp.communicationComment, 'Rushes the close.');
  assert.equal(comp.criticalThinkingComment, 'Missed a pricing objection.');
  const snapshot = Model.computeSnapshot(state, evaluationId);
  assert.equal(snapshot.rescaled, false);
  assert.equal(snapshot.breakdown.find((row) => row.key === 'conversion').score, 40);
  assert.equal(snapshot.breakdown.find((row) => row.key === 'tool_navigation').score, 80);
  const overall = snapshot.overall;
  state = must(Model.addCoaching(state, onboarder, {
    vaId: vaId, sessionDate: '2026-10-15', topic: 'Pricing', discussion: 'Walk the rate sheet.', action: 'Role-play one call.'
  })).state;
  assert.equal(Model.computeSnapshot(state, evaluationId).overall, overall);
  assert.equal(Model.saveCompetencies(state, qa, { evaluationId: evaluationId, toolNavigation: 10 }).error, 'Your role cannot do that.');
});

test('settings reject a bad weight total and the pass mark changes the boundary', () => {
  let state = fresh();
  assert.equal(Model.saveSettings(state, onboarder, { passMark: 80, weights: Score.DEFAULT_WEIGHTS }).error, 'Your role cannot do that.');
  assert.equal(Model.saveSettings(state, qa, { passMark: 80, weights: Score.DEFAULT_WEIGHTS }).error, 'Your role cannot do that.');
  const bad = Model.saveSettings(state, admin, {
    passMark: 80,
    weights: Object.assign({}, Score.DEFAULT_WEIGHTS, { attendance: 0 })
  });
  assert.equal(bad.ok, false);
  assert.equal(state.settings.weights.attendance, 10);
  assert.equal(Model.saveSettings(state, admin, { passMark: 101, weights: Score.DEFAULT_WEIGHTS }).ok, false);

  state = must(Model.saveSettings(state, admin, { passMark: 79.99, weights: Score.DEFAULT_WEIGHTS })).state;
  state = must(Model.createBatch(state, admin, { name: 'Batch B' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Cara Diaz', onboardingStart: '2026-10-12', batchId: state.batches[0].id
  })).state;
  state = must(Model.startEvaluation(state, admin, { vaId: state.vas[0].id, weekStart: '2026-10-12' })).state;
  state = must(Model.saveQa(state, qa, { evaluationId: state.evaluations[0].id, score: 79.99 })).state;
  const closed = must(Model.closeEvaluation(state, admin, { evaluationId: state.evaluations[0].id }));
  assert.equal(closed.state.vas[0].status, 'Ready for endorsement');
});

test('the last admin cannot be demoted and a closed week is frozen', () => {
  let state = fresh();
  assert.match(Model.setUserRole(state, admin, { userId: admin.id, role: 'viewer' }).error, /last admin/);
  state = must(Model.setUserRole(state, admin, { userId: qa.id, role: 'viewer' })).state;
  assert.equal(state.users.find((user) => user.id === qa.id).role, 'viewer');

  state = must(Model.createBatch(state, admin, { name: 'Batch C' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Dan Ellis', onboardingStart: '2026-10-12', batchId: state.batches[0].id
  })).state;
  const vaId = state.vas[0].id;
  state = must(Model.startEvaluation(state, admin, { vaId: vaId, weekStart: '2026-10-12' })).state;
  const evaluationId = state.evaluations[0].id;
  state = must(Model.saveAttendance(state, admin, { vaId: vaId, workDate: '2026-10-12' })).state;
  state = must(Model.saveQa(state, { id: qa.id, role: 'qa', name: 'Local QA', email: qa.email }, { evaluationId: evaluationId, score: 10 })).state;
  state = must(Model.closeEvaluation(state, admin, {
    evaluationId: evaluationId, gaps: 'Score is low.', coachingActions: 'Shadow a senior VA.'
  })).state;
  assert.equal(Model.saveAttendance(state, admin, { vaId: vaId, workDate: '2026-10-12', lateMinutes: 5 }).error, 'That day is in a closed week.');
  assert.equal(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-10-12', totalLeads: 1, convertedLeads: 1 }).error, 'That day is in a closed week.');
  assert.equal(Model.saveQa(state, qa, { evaluationId: evaluationId, score: 99 }).error, 'This week is closed and its scores cannot be changed.');
  assert.equal(Model.setManualStatus(state, onboarder, { id: vaId, status: 'Ready for endorsement' }).error, 'That status is set by closing a weekly evaluation.');
  state = must(Model.setManualStatus(state, onboarder, { id: vaId, status: 'Resigned' })).state;
  assert.equal(state.vas[0].status, 'Resigned');
  assert.equal(Model.endorse(state, admin, { vaId: vaId }).error, 'Only a VA who is ready for endorsement can be endorsed.');
});

test('the status menu can set Endorsed only from Ready for endorsement', () => {
  let state = fresh();
  state = must(Model.createBatch(state, admin, { name: 'Batch E' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Faye Gomez',
    onboardingStart: '2026-10-12',
    batchId: state.batches[0].id
  })).state;
  const vaId = state.vas[0].id;
  assert.equal(Model.setManualStatus(state, onboarder, { id: vaId, status: 'Endorsed' }).error, 'Your role cannot do that.');
  assert.equal(Model.setManualStatus(state, admin, { id: vaId, status: 'Endorsed' }).error, 'Only a VA who is ready for endorsement can be endorsed.');
  state = must(Model.setManualStatus(state, onboarder, { id: vaId, status: 'Resigned' })).state;
  assert.equal(state.vas[0].status, 'Resigned');
  state = must(Model.setManualStatus(state, onboarder, { id: vaId, status: 'EOC' })).state;
  assert.equal(state.vas[0].status, 'EOC');
  state = must(Model.setManualStatus(state, admin, { id: vaId, status: 'Ready for endorsement' })).state;
  state = must(Model.setManualStatus(state, admin, { id: vaId, status: 'Endorsed' })).state;
  assert.equal(state.vas[0].status, 'Endorsed');
  assert.equal(state.vas[0].endorsedBy, admin.id);
  assert.ok(state.vas[0].endorsedAt);
});

test('QA can be saved on a second open week and a new WBR date cannot repeat', () => {
  let state = fresh();
  state = must(Model.createBatch(state, admin, { name: 'Batch D' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Eva Flores',
    onboardingStart: '2026-01-05',
    batchId: state.batches[0].id
  })).state;
  const vaId = state.vas[0].id;
  state = must(Model.startEvaluation(state, admin, { vaId: vaId, weekStart: '2026-01-05' })).state;
  assert.equal(Model.saveQaForWeek(state, qa, {
    vaId: vaId,
    weekStart: '2026-01-12',
    score: 79,
    formUrl: 'https://example.com/form',
    recordingUrl: 'https://example.com/call'
  }).error, 'An onboarder needs to start this week before a QA score can be saved.');
  state = must(Model.saveQaForWeek(state, admin, {
    vaId: vaId,
    weekStart: '2026-01-12',
    score: 79,
    formUrl: 'https://example.com/form',
    recordingUrl: 'https://example.com/call'
  })).state;
  assert.equal(state.evaluations.filter((ev) => ev.status === 'open').length, 2);
  const second = state.evaluations.find((ev) => ev.weekStart === '2026-01-12');
  assert.equal(state.qa.find((row) => row.evaluationId === second.id).score, 79);
  assert.equal(Model.startEvaluation(state, admin, { vaId: vaId, weekStart: '2026-01-19' }).error, 'This VA already has an open week.');
  state = must(Model.saveQaForWeek(state, qa, { vaId: vaId, weekStart: '2026-01-05', score: 90 })).state;
  assert.equal(state.evaluations.length, 2);
  const first = state.evaluations.find((ev) => ev.weekStart === '2026-01-05');
  assert.equal(state.qa.find((row) => row.evaluationId === first.id).score, 90);
  state = must(Model.saveCompetenciesForWeek(state, onboarder, {
    vaId: vaId,
    weekStart: '2026-01-19',
    toolNavigation: 80,
    toolNavigationComment: 'Knows the dialer.'
  })).state;
  assert.equal(state.evaluations.filter((ev) => ev.weekStart === '2026-01-19').length, 1);

  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-01-06', totalLeads: 10, convertedLeads: 4 })).state;
  const row = state.wbrDays.find((item) => item.workDate === '2026-01-06');
  assert.equal(Model.saveWbrDay(state, admin, {
    vaId: vaId, asNew: true, workDate: '2026-01-06', totalLeads: 8, convertedLeads: 2
  }).error, 'That date already has a WBR record.');
  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, workDate: '2026-01-06', totalLeads: 8, convertedLeads: 2 })).state;
  assert.equal(state.wbrDays.find((item) => item.workDate === '2026-01-06').totalLeads, 8);
  state = must(Model.saveWbrDay(state, admin, { vaId: vaId, asNew: true, workDate: '2026-01-07', totalLeads: 5, convertedLeads: 1 })).state;
  assert.equal(Model.saveWbrDay(state, admin, {
    id: row.id, vaId: vaId, workDate: '2026-01-07', totalLeads: 5, convertedLeads: 1
  }).error, 'That date already has a WBR record.');
  assert.equal(Model.saveWbrDay(state, admin, {
    asNew: true, vaId: vaId, workDate: '2026-01-08', totalLeads: '', convertedLeads: ''
  }).error, 'Enter total leads or converted leads.');
});

test('QA stores the typed date range on the week that contains From', () => {
  let state = fresh();
  state = must(Model.createBatch(state, admin, { name: 'Batch F' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Gina Ramos',
    onboardingStart: '2026-01-05',
    batchId: state.batches[0].id
  })).state;
  const vaId = state.vas[0].id;
  const before = state.evaluations.length;
  assert.equal(Model.saveQaForWeek(state, admin, {
    vaId: vaId,
    asNew: true,
    periodStart: '2026-01-20',
    periodEnd: '2026-01-19',
    score: 70
  }).error, 'To is earlier than From.');
  assert.equal(state.evaluations.length, before);

  assert.equal(Model.saveQaForWeek(state, qa, {
    vaId: vaId,
    asNew: true,
    periodStart: '2026-02-02',
    score: 90
  }).error, 'An onboarder needs to start this week before a QA score can be saved.');

  state = must(Model.saveQaForWeek(state, admin, {
    vaId: vaId,
    asNew: true,
    periodStart: '2026-01-07',
    periodEnd: '2026-01-09',
    score: 81,
    formUrl: 'https://example.com/form',
    recordingUrl: 'https://example.com/call'
  })).state;
  const firstWeek = state.evaluations.find((ev) => ev.weekStart === '2026-01-05');
  assert.ok(firstWeek);
  let first = state.qa.find((row) => row.evaluationId === firstWeek.id);
  assert.equal(first.periodStart, '2026-01-07');
  assert.equal(first.periodEnd, '2026-01-09');
  assert.equal(first.score, 81);

  state = must(Model.saveQaForWeek(state, admin, {
    vaId: vaId,
    asNew: true,
    periodStart: '2026-01-21',
    periodEnd: '',
    score: 79
  })).state;
  const secondWeek = state.evaluations.find((ev) => ev.weekStart === '2026-01-19');
  const second = state.qa.find((row) => row.evaluationId === secondWeek.id);
  assert.equal(second.periodStart, '2026-01-21');
  assert.equal(second.periodEnd, '');
  assert.equal(Model.saveQaForWeek(state, admin, {
    vaId: vaId,
    asNew: true,
    periodStart: '2026-01-22',
    score: 70
  }).error, 'A QA score already exists for the week of that From date.');

  state = must(Model.saveQaForWeek(state, qa, {
    vaId: vaId,
    id: first.id,
    periodStart: '2026-01-08',
    periodEnd: '2026-01-10',
    score: 88
  })).state;
  first = state.qa.find((row) => row.id === first.id);
  assert.equal(first.score, 88);
  assert.equal(first.periodStart, '2026-01-08');
  assert.equal(first.evaluationId, firstWeek.id);

  state = must(Model.saveQaForWeek(state, qa, {
    vaId: vaId,
    weekStart: '2026-01-05',
    score: 86
  })).state;
  first = state.qa.find((row) => row.id === first.id);
  assert.equal(first.score, 86);
  assert.equal(first.periodStart, '2026-01-08');
  assert.equal(first.periodEnd, '2026-01-10');

  assert.equal(Model.saveQaForWeek(state, admin, {
    vaId: vaId,
    id: first.id,
    periodStart: '2026-01-22',
    score: 86
  }).error, 'A QA score already exists for the week of that From date.');

  const presented = Model.presentVa(state, vaId);
  const listed = presented.evaluations.filter((ev) => ev.qa).sort((a, b) => {
    return (a.qa.periodStart || a.weekStart) < (b.qa.periodStart || b.weekStart) ? 1 : -1;
  });
  assert.equal(listed[0].qa.periodStart, '2026-01-21');
  assert.equal(listed[1].qa.periodStart, '2026-01-08');
});

test('dated competency entries keep the latest score and feedback can be edited', () => {
  let state = fresh();
  state = must(Model.createBatch(state, admin, { name: 'Batch G' })).state;
  state = must(Model.createVa(state, admin, {
    fullName: 'Hugo Tan',
    onboardingStart: '2026-01-05',
    batchId: state.batches[0].id
  })).state;
  const vaId = state.vas[0].id;
  assert.equal(Model.saveCompetencyEntry(state, qa, {
    vaId: vaId,
    competency: 'toolNavigation',
    entryDate: '2026-01-06',
    score: 70
  }).error, 'Your role cannot do that.');
  assert.equal(Model.saveCompetencyEntry(state, onboarder, {
    vaId: vaId,
    competency: 'toolNavigation',
    entryDate: '2026-01-06',
    score: ''
  }).error, 'Enter a score from 0 to 100.');

  state = must(Model.saveCompetencyEntry(state, onboarder, {
    vaId: vaId,
    competency: 'toolNavigation',
    entryDate: '2026-01-06',
    score: 70,
    comment: ''
  })).state;
  state = must(Model.saveCompetencyEntry(state, onboarder, {
    vaId: vaId,
    competency: 'toolNavigation',
    entryDate: '2026-01-08',
    score: 95,
    comment: 'Knows the dialer.'
  })).state;
  const week = state.evaluations.find((ev) => ev.weekStart === '2026-01-05');
  assert.ok(week);
  const weekly = state.competencies.find((row) => row.evaluationId === week.id);
  assert.equal(weekly.toolNavigation, 95);
  assert.equal(weekly.toolNavigationComment, 'Knows the dialer.');
  weekly.toolNavigation = 1;
  assert.equal(Model.computeSnapshot(state, week.id).breakdown.find((row) => row.key === 'tool_navigation').score, 95);
  const shown = Model.presentVa(state, vaId).competencyEntries;
  assert.equal(shown[0].score, 95);
  assert.equal(shown[0].entryDate, '2026-01-08');
  assert.equal(shown[1].comment, '');

  const sameDay = shown.filter((row) => row.entryDate === '2026-01-08' || row.entryDate === '2026-01-06');
  sameDay[0].entryDate = '2026-01-08';
  sameDay[1].entryDate = '2026-01-08';
  const low = state.competencyEntries.find((row) => row.score === 70);
  const high = state.competencyEntries.find((row) => row.score === 95);
  low.updatedAt = '2026-01-08T00:00:00.000Z';
  high.updatedAt = '2026-01-08T01:00:00.000Z';
  assert.equal(Model.presentVa(state, vaId).competencyEntries[0].score, 95);

  const latestId = high.id;
  state = must(Model.deleteCompetencyEntry(state, onboarder, { id: latestId })).state;
  assert.equal(state.competencies.find((row) => row.evaluationId === week.id).toolNavigation, 70);
  assert.equal(Model.computeSnapshot(state, week.id).breakdown.find((row) => row.key === 'tool_navigation').score, 70);
  const remaining = state.competencyEntries[0].id;
  state = must(Model.deleteCompetencyEntry(state, onboarder, { id: remaining })).state;
  assert.equal(state.competencies.find((row) => row.evaluationId === week.id).toolNavigation, null);
  state = must(Model.saveCompetencies(state, onboarder, {
    evaluationId: week.id,
    toolNavigation: 80,
    toolNavigationComment: 'Weekly note.'
  })).state;
  assert.equal(Model.computeSnapshot(state, week.id).breakdown.find((row) => row.key === 'tool_navigation').score, 80);

  state = must(Model.saveQa(state, qa, { evaluationId: week.id, score: 90 })).state;
  state = must(Model.closeEvaluation(state, onboarder, { evaluationId: week.id, gaps: '', coachingActions: '' })).state;
  assert.equal(Model.saveCompetencyEntry(state, onboarder, {
    vaId: vaId,
    competency: 'communication',
    entryDate: '2026-01-07',
    score: 60
  }).error, 'That day is in a closed week.');
  assert.equal(Model.saveQaForWeek(state, qa, {
    vaId: vaId,
    id: state.qa[0].id,
    periodStart: '2026-01-08',
    score: 91
  }).error, 'This week is closed and its scores cannot be changed.');

  state = must(Model.addCoaching(state, onboarder, {
    vaId: vaId,
    sessionDate: '2026-01-15',
    topic: 'Opening',
    discussion: 'Skipped the client name.',
    action: 'Use the script.'
  })).state;
  const sessionId = state.coaching[0].id;
  state = must(Model.addCoaching(state, onboarder, {
    id: sessionId,
    vaId: vaId,
    sessionDate: '2026-01-16',
    topic: 'Follow-up',
    discussion: 'The script landed.',
    action: 'Keep it.'
  })).state;
  assert.equal(state.coaching.length, 1);
  assert.equal(state.coaching[0].topic, 'Follow-up');
  assert.equal(state.coaching[0].sessionDate, '2026-01-16');
});
