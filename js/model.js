// In-memory rules for the local preview and the node tests.
// Supabase RLS and triggers enforce the same limits in production.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./score.js'), require('./dates.js'), require('./permissions.js'), require('./labels.js'));
  } else {
    root.CNRModel = factory(root.CNRScore, root.CNRDates, root.CNRPermissions, root.CNRLabels);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Score, Dates, Perms, Labels) {
  var MANUAL_ONBOARDER = ['Onboarding', 'Resigned', 'EOC'];
  var MANUAL_ADMIN = ['Onboarding', 'Continue onboarding', 'Ready for endorsement', 'Endorsed', 'Resigned', 'EOC'];
  var ACTIVE = ['Onboarding', 'Continue onboarding', 'Ready for endorsement'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createState(extra) {
    var state = {
      users: [],
      batches: [],
      vas: [],
      attendance: [],
      evaluations: [],
      qa: [],
      wbrDays: [],
      competencies: [],
      competencyEntries: [],
      coaching: [],
      history: [],
      settings: {
        passMark: Score.DEFAULT_PASS_MARK,
        weights: clone(Score.DEFAULT_WEIGHTS)
      }
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) { state[key] = extra[key]; });
    }
    return state;
  }

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function fail(message) {
    return { ok: false, error: message };
  }

  function gate(actor, action) {
    if (!actor || !actor.role) return 'Sign in required.';
    if (!Perms.can(actor.role, action)) return 'Your role cannot do that.';
    return '';
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function cleanUrl(value) {
    var raw = text(value);
    if (!raw) return { ok: true, url: '' };
    try {
      var url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false };
      return { ok: true, url: url.href };
    } catch (err) {
      return { ok: false };
    }
  }

  function wholeMinutes(value, label) {
    if (value == null || value === '') return { ok: true, n: 0 };
    var n = Number(value);
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: label };
    return { ok: true, n: n };
  }

  function scoreOrNull(value) {
    if (value == null || value === '') return { ok: true, n: null };
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false };
    return { ok: true, n: n };
  }

  function findVa(state, id) {
    return state.vas.find(function (va) { return va.id === id; }) || null;
  }

  function findEval(state, id) {
    return state.evaluations.find(function (ev) { return ev.id === id; }) || null;
  }

  function batchById(state, id) {
    return state.batches.find(function (batch) { return batch.id === id; }) || null;
  }

  function personName(state, id) {
    if (!id) return '';
    var user = state.users.find(function (row) { return row.id === id; });
    if (!user) return 'Unknown user';
    return user.name || user.email || 'Unknown user';
  }

  function weekEnd(weekStart) {
    return Dates.addDays(weekStart, 6);
  }

  function inWeek(date, weekStart) {
    return date >= weekStart && date <= weekEnd(weekStart);
  }

  function closedWeekCovers(state, vaId, workDate) {
    return state.evaluations.some(function (ev) {
      return ev.vaId === vaId && ev.status === 'closed' && inWeek(workDate, ev.weekStart);
    });
  }

  function pushHistory(state, vaId, previousStatus, newStatus, note, actor) {
    state.history.push({
      id: uid(),
      vaId: vaId,
      previousStatus: previousStatus,
      newStatus: newStatus,
      note: note || '',
      changedBy: actor.id,
      changedAt: new Date().toISOString()
    });
  }

  function latestEval(state, vaId) {
    var rows = state.evaluations.filter(function (ev) { return ev.vaId === vaId; });
    rows.sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : -1; });
    return rows[0] || null;
  }

  function aggregateWbr(days) {
    var counted = (days || []).filter(function (row) {
      return row.totalLeads != null && row.totalLeads !== '' && Number(row.totalLeads) > 0;
    });
    if (!counted.length) return null;
    var total = 0;
    var converted = 0;
    counted.forEach(function (row) {
      total += Number(row.totalLeads);
      var won = row.convertedLeads == null || row.convertedLeads === '' ? 0 : Number(row.convertedLeads);
      converted += won;
    });
    return { totalLeads: total, convertedLeads: converted };
  }

  function weekWbrDays(state, vaId, weekStart) {
    return (state.wbrDays || []).filter(function (row) {
      return row.vaId === vaId && inWeek(row.workDate, weekStart);
    });
  }

  var COMPETENCY_COMMENT = {
    toolNavigation: 'toolNavigationComment',
    communication: 'communicationComment',
    criticalThinking: 'criticalThinkingComment',
    coreValues: 'coreValuesComment'
  };

  function newestEntry(a, b) {
    if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? 1 : -1;
    var as = a.updatedAt || a.createdAt || '';
    var bs = b.updatedAt || b.createdAt || '';
    if (as !== bs) return as < bs ? 1 : -1;
    if ((a.id || '') !== (b.id || '')) return a.id < b.id ? 1 : -1;
    return 0;
  }

  function competencyScore(state, ev, key, fallback) {
    var entries = (state.competencyEntries || []).filter(function (row) {
      return row.vaId === ev.vaId && row.competency === key && inWeek(row.entryDate, ev.weekStart);
    });
    if (!entries.length) return fallback;
    entries.sort(newestEntry);
    return entries[0].score;
  }

  function computeSnapshot(state, evaluationId) {
    var ev = findEval(state, evaluationId);
    if (!ev) return null;
    var days = state.attendance.filter(function (row) {
      return row.vaId === ev.vaId && inWeek(row.workDate, ev.weekStart);
    });
    var daily = days.map(function (row) {
      return Score.dailyAttendancePercent(row);
    });
    var qa = state.qa.find(function (row) { return row.evaluationId === ev.id; });
    var wbr = aggregateWbr(weekWbrDays(state, ev.vaId, ev.weekStart));
    var comp = state.competencies.find(function (row) { return row.evaluationId === ev.id; });
    var scores = {
      attendance: Score.weeklyAttendance(daily),
      conversion: wbr ? Score.conversionRate(wbr.totalLeads, wbr.convertedLeads) : null,
      qa: qa ? qa.score : null,
      tool_navigation: competencyScore(state, ev, 'toolNavigation', comp ? comp.toolNavigation : null),
      communication: competencyScore(state, ev, 'communication', comp ? comp.communication : null),
      critical_thinking: competencyScore(state, ev, 'criticalThinking', comp ? comp.criticalThinking : null),
      core_values: competencyScore(state, ev, 'coreValues', comp ? comp.coreValues : null)
    };
    return Score.scoreEvaluation({
      scores: scores,
      weights: state.settings.weights,
      passMark: state.settings.passMark
    });
  }

  function presentEvaluation(state, ev) {
    var preview = computeSnapshot(state, ev.id);
    var recorded = ev.status === 'closed' && ev.scoreSnapshot ? ev.scoreSnapshot : preview;
    return {
      id: ev.id,
      vaId: ev.vaId,
      weekStart: ev.weekStart,
      weekEnd: weekEnd(ev.weekStart),
      status: ev.status,
      outcome: ev.outcome,
      gaps: ev.gaps || '',
      coachingActions: ev.coachingActions || '',
      closedBy: ev.closedBy || '',
      closedAt: ev.closedAt || '',
      closedByName: personName(state, ev.closedBy),
      qa: state.qa.find(function (row) { return row.evaluationId === ev.id; }) || null,
      wbr: aggregateWbr(weekWbrDays(state, ev.vaId, ev.weekStart)),
      competencies: state.competencies.find(function (row) { return row.evaluationId === ev.id; }) || null,
      preview: preview,
      score: recorded
    };
  }

  function presentVa(state, id) {
    var va = findVa(state, id);
    if (!va) return null;
    var evaluations = state.evaluations
      .filter(function (ev) { return ev.vaId === va.id; })
      .sort(function (a, b) { return a.weekStart < b.weekStart ? -1 : 1; })
      .map(function (ev) { return presentEvaluation(state, ev); });
    return {
      id: va.id,
      fullName: va.fullName,
      onboardingStart: va.onboardingStart,
      onboarderName: va.onboarderName || '',
      clientName: va.clientName || '',
      businessName: va.businessName || '',
      sopOrPortfolio: va.sopOrPortfolio || '',
      status: va.status,
      schedule: va.schedule || '',
      batchId: va.batchId,
      batchName: (batchById(state, va.batchId) || {}).name || '',
      endorsedBy: va.endorsedBy || '',
      endorsedAt: va.endorsedAt || '',
      endorsedByName: personName(state, va.endorsedBy),
      attendanceFinalizedAt: va.attendanceFinalizedAt || '',
      attendanceFinalizedBy: va.attendanceFinalizedBy || '',
      attendanceFinalizedByName: personName(state, va.attendanceFinalizedBy),
      attendance: state.attendance
        .filter(function (row) { return row.vaId === va.id; })
        .sort(function (a, b) { return a.workDate < b.workDate ? -1 : 1; }),
      wbrDays: (state.wbrDays || [])
        .filter(function (row) { return row.vaId === va.id; })
        .sort(function (a, b) { return a.workDate < b.workDate ? -1 : 1; }),
      evaluations: evaluations,
      competencyEntries: (state.competencyEntries || [])
        .filter(function (row) { return row.vaId === va.id; })
        .sort(newestEntry),
      coaching: state.coaching
        .filter(function (row) { return row.vaId === va.id; })
        .sort(function (a, b) { return (a.sessionDate + a.createdAt) < (b.sessionDate + b.createdAt) ? 1 : -1; }),
      history: state.history
        .filter(function (row) { return row.vaId === va.id; })
        .sort(function (a, b) { return a.changedAt < b.changedAt ? 1 : -1; })
        .map(function (row) {
          return {
            id: row.id,
            previousStatus: row.previousStatus,
            newStatus: row.newStatus,
            note: row.note || '',
            changedBy: row.changedBy,
            changedByName: personName(state, row.changedBy),
            changedAt: row.changedAt
          };
        })
    };
  }

  function listVas(state) {
    return state.vas.map(function (va) {
      return {
        id: va.id,
        fullName: va.fullName,
        clientName: va.clientName || '',
        businessName: va.businessName || '',
        status: va.status,
        onboarderName: va.onboarderName || '',
        onboardingStart: va.onboardingStart,
        schedule: va.schedule || '',
        batchId: va.batchId,
        batchName: (batchById(state, va.batchId) || {}).name || ''
      };
    }).sort(function (a, b) { return a.fullName.localeCompare(b.fullName); });
  }

  function createBatch(state, actor, input) {
    var denied = gate(actor, 'batches');
    if (denied) return fail(denied);
    var name = text(input && input.name);
    if (!name) return fail('Batch name is required.');
    var taken = state.batches.some(function (batch) {
      return batch.name.toLowerCase() === name.toLowerCase();
    });
    if (taken) return fail('A batch with that name already exists.');
    var next = clone(state);
    var batch = { id: uid(), name: name, createdBy: actor.id, createdAt: new Date().toISOString() };
    next.batches.push(batch);
    return { ok: true, state: next, batch: batch };
  }

  function renameBatch(state, actor, input) {
    var denied = gate(actor, 'batches');
    if (denied) return fail(denied);
    var name = text(input && input.name);
    if (!name) return fail('Batch name is required.');
    var next = clone(state);
    var batch = batchById(next, input.id);
    if (!batch) return fail('Batch not found.');
    var taken = next.batches.some(function (row) {
      return row.id !== batch.id && row.name.toLowerCase() === name.toLowerCase();
    });
    if (taken) return fail('A batch with that name already exists.');
    batch.name = name;
    return { ok: true, state: next, batch: batch };
  }

  function createVa(state, actor, input) {
    var denied = gate(actor, 'manage_va');
    if (denied) return fail(denied);
    var src = input || {};
    var fullName = text(src.fullName);
    if (!fullName) return fail('Enter the complete name.');
    if (!Dates.isRealDate(src.onboardingStart)) return fail('Enter the onboarding start date.');
    if (!batchById(state, src.batchId)) return fail('Choose a batch.');
    var status = src.status || 'Onboarding';
    if (Labels.CREATE_STATUSES.indexOf(status) === -1) {
      return fail('That status is not available when adding a VA.');
    }
    var next = clone(state);
    var va = {
      id: uid(),
      fullName: fullName,
      onboardingStart: src.onboardingStart,
      onboarderName: text(src.onboarderName),
      clientName: text(src.clientName),
      businessName: text(src.businessName),
      sopOrPortfolio: text(src.sopOrPortfolio),
      status: status,
      schedule: text(src.schedule),
      batchId: src.batchId,
      endorsedBy: '',
      endorsedAt: '',
      attendanceFinalizedAt: '',
      attendanceFinalizedBy: '',
      createdBy: actor.id,
      createdAt: new Date().toISOString()
    };
    next.vas.push(va);
    pushHistory(next, va.id, '', status, 'Added to the monitoring sheet', actor);
    return { ok: true, state: next, va: va };
  }

  function updateVa(state, actor, input) {
    var denied = gate(actor, 'manage_va');
    if (denied) return fail(denied);
    var next = clone(state);
    var va = findVa(next, input && input.id);
    if (!va) return fail('VA not found.');
    var fullName = text(input.fullName);
    if (!fullName) return fail('Enter the complete name.');
    if (!Dates.isRealDate(input.onboardingStart)) return fail('Enter the onboarding start date.');
    if (!batchById(next, input.batchId)) return fail('Choose a batch.');
    va.fullName = fullName;
    va.onboardingStart = input.onboardingStart;
    va.onboarderName = text(input.onboarderName);
    va.clientName = text(input.clientName);
    va.businessName = text(input.businessName);
    va.sopOrPortfolio = text(input.sopOrPortfolio);
    va.schedule = text(input.schedule);
    va.batchId = input.batchId;
    return { ok: true, state: next, va: va };
  }

  function deleteVa(state, actor, input) {
    var denied = gate(actor, 'delete_va');
    if (denied) return fail(denied);
    var id = input && input.id;
    var next = clone(state);
    var va = findVa(next, id);
    if (!va) return fail('VA not found.');
    var evalIds = {};
    next.evaluations.forEach(function (ev) {
      if (ev.vaId === id) evalIds[ev.id] = true;
    });
    next.vas = next.vas.filter(function (row) { return row.id !== id; });
    next.attendance = (next.attendance || []).filter(function (row) { return row.vaId !== id; });
    next.evaluations = (next.evaluations || []).filter(function (row) { return row.vaId !== id; });
    next.qa = (next.qa || []).filter(function (row) { return !evalIds[row.evaluationId]; });
    next.competencies = (next.competencies || []).filter(function (row) { return !evalIds[row.evaluationId]; });
    next.wbrDays = (next.wbrDays || []).filter(function (row) { return row.vaId !== id; });
    next.competencyEntries = (next.competencyEntries || []).filter(function (row) { return row.vaId !== id; });
    next.coaching = (next.coaching || []).filter(function (row) { return row.vaId !== id; });
    next.history = (next.history || []).filter(function (row) { return row.vaId !== id; });
    return { ok: true, state: next };
  }

  function setManualStatus(state, actor, input) {
    var denied = gate(actor, 'manage_va');
    if (denied) return fail(denied);
    var status = input && input.status;
    var allowed = actor.role === 'admin' ? MANUAL_ADMIN : MANUAL_ONBOARDER;
    if (allowed.indexOf(status) === -1) {
      if (status === 'Endorsed') return fail('Your role cannot do that.');
      return fail('That status is set by closing a weekly evaluation.');
    }
    var next = clone(state);
    var va = findVa(next, input.id);
    if (!va) return fail('VA not found.');
    if (status === 'Endorsed' && va.status !== 'Ready for endorsement' && va.status !== 'Endorsed') {
      return fail('Only a VA who is ready for endorsement can be endorsed.');
    }
    if (va.status === status) return { ok: true, state: next, va: va };
    var previous = va.status;
    va.status = status;
    if (status === 'Endorsed') {
      va.endorsedBy = actor.id;
      va.endorsedAt = new Date().toISOString();
    } else {
      va.endorsedBy = '';
      va.endorsedAt = '';
    }
    pushHistory(next, va.id, previous, status, 'Status updated', actor);
    return { ok: true, state: next, va: va };
  }

  function saveAttendance(state, actor, input) {
    var denied = gate(actor, 'attendance');
    if (denied) return fail(denied);
    var src = input || {};
    var va = findVa(state, src.vaId);
    if (!va) return fail('VA not found.');
    if (va.attendanceFinalizedAt) return fail('Attendance is finalized.');
    if (!Dates.isRealDate(src.workDate)) return fail('Enter a work day.');
    if (closedWeekCovers(state, src.vaId, src.workDate)) return fail('That day is in a closed week.');
    var absent = src.absent === true || src.absent === 'true' || src.absent === 'on' || src.absent === 1;
    var late = wholeMinutes(absent ? 0 : src.lateMinutes, 'Late minutes must be a whole number, zero or more.');
    if (!late.ok) return fail(late.error);
    var down = wholeMinutes(absent ? 0 : src.downtimeMinutes, 'Downtime minutes must be a whole number, zero or more.');
    if (!down.ok) return fail(down.error);
    var next = clone(state);
    var existing = null;
    if (src.id) {
      existing = next.attendance.find(function (row) { return row.id === src.id; });
      if (!existing || existing.vaId !== src.vaId) return fail('Attendance record not found.');
      if (closedWeekCovers(next, existing.vaId, existing.workDate)) return fail('That day is in a closed week.');
      var clash = next.attendance.some(function (row) {
        return row.id !== existing.id && row.vaId === src.vaId && row.workDate === src.workDate;
      });
      if (clash) return fail('That day already has an attendance record.');
    } else {
      existing = next.attendance.find(function (row) {
        return row.vaId === src.vaId && row.workDate === src.workDate;
      });
    }
    var row = existing || {
      id: uid(),
      vaId: src.vaId,
      workDate: src.workDate,
      createdBy: actor.id
    };
    row.workDate = src.workDate;
    row.absent = absent;
    row.lateMinutes = absent ? 0 : late.n;
    row.downtimeMinutes = absent ? 0 : down.n;
    row.remarks = text(src.remarks);
    row.updatedBy = actor.id;
    if (!existing) next.attendance.push(row);
    return { ok: true, state: next, attendance: row };
  }

  function deleteAttendance(state, actor, input) {
    var denied = gate(actor, 'attendance');
    if (denied) return fail(denied);
    var next = clone(state);
    var row = next.attendance.find(function (item) { return item.id === (input && input.id); });
    if (!row) return fail('Attendance record not found.');
    var owner = findVa(next, row.vaId);
    if (owner && owner.attendanceFinalizedAt) return fail('Attendance is finalized.');
    if (closedWeekCovers(next, row.vaId, row.workDate)) return fail('That day is in a closed week.');
    next.attendance = next.attendance.filter(function (item) { return item.id !== row.id; });
    return { ok: true, state: next };
  }

  function finalizeAttendance(state, actor, input) {
    var denied = gate(actor, 'attendance');
    if (denied) return fail(denied);
    var next = clone(state);
    var va = findVa(next, input && input.vaId);
    if (!va) return fail('VA not found.');
    if (va.attendanceFinalizedAt) return fail('Attendance is already finalized.');
    va.attendanceFinalizedAt = new Date().toISOString();
    va.attendanceFinalizedBy = actor.id;
    return { ok: true, state: next, va: va };
  }

  function undoFinalizeAttendance(state, actor, input) {
    var denied = gate(actor, 'undo_attendance');
    if (denied) return fail(denied);
    var next = clone(state);
    var va = findVa(next, input && input.vaId);
    if (!va) return fail('VA not found.');
    if (!va.attendanceFinalizedAt) return fail('Attendance is not finalized.');
    va.attendanceFinalizedAt = '';
    va.attendanceFinalizedBy = '';
    return { ok: true, state: next, va: va };
  }

  function startEvaluation(state, actor, input) {
    var denied = gate(actor, 'evaluations');
    if (denied) return fail(denied);
    var src = input || {};
    if (!findVa(state, src.vaId)) return fail('VA not found.');
    if (!Dates.isMonday(src.weekStart)) return fail('Weeks start on Monday.');
    if (state.evaluations.some(function (ev) { return ev.vaId === src.vaId && ev.status === 'open'; })) {
      return fail('This VA already has an open week.');
    }
    if (state.evaluations.some(function (ev) { return ev.vaId === src.vaId && ev.weekStart === src.weekStart; })) {
      return fail('That week already exists.');
    }
    var next = clone(state);
    var ev = {
      id: uid(),
      vaId: src.vaId,
      weekStart: src.weekStart,
      status: 'open',
      outcome: '',
      gaps: '',
      coachingActions: '',
      scoreSnapshot: null,
      closedBy: '',
      closedAt: '',
      createdBy: actor.id,
      createdAt: new Date().toISOString()
    };
    next.evaluations.push(ev);
    return { ok: true, state: next, evaluation: ev };
  }

  function nextEvaluation(state, actor, input) {
    var denied = gate(actor, 'evaluations');
    if (denied) return fail(denied);
    var vaId = input && input.vaId;
    if (!findVa(state, vaId)) return fail('VA not found.');
    var latest = latestEval(state, vaId);
    if (!latest) return fail('Start the first weekly evaluation with a Monday.');
    if (latest.status !== 'closed') return fail('This VA already has an open week.');
    return startEvaluation(state, actor, { vaId: vaId, weekStart: Dates.addDays(latest.weekStart, 7) });
  }

  function requireOpen(state, evaluationId) {
    var ev = findEval(state, evaluationId);
    if (!ev) return { error: 'Evaluation not found.' };
    if (ev.status === 'closed') return { error: 'This week is closed and its scores cannot be changed.' };
    return { ev: ev };
  }

  function recordOpenWeek(state, actor, input) {
    if (!Perms.can(actor.role, 'qa') && !Perms.can(actor.role, 'evaluations') && !Perms.can(actor.role, 'competencies')) {
      return fail('Your role cannot do that.');
    }
    var src = input || {};
    if (!findVa(state, src.vaId)) return fail('VA not found.');
    var weekStart = Dates.mondayOf(src.weekStart);
    if (!weekStart) return fail('Weeks start on Monday.');
    var existing = state.evaluations.find(function (ev) {
      return ev.vaId === src.vaId && ev.weekStart === weekStart;
    });
    if (existing) {
      if (existing.status === 'closed') return fail('This week is closed and its scores cannot be changed.');
      return { ok: true, state: state, evaluation: existing };
    }
    if (!Perms.can(actor.role, 'evaluations') && !Perms.can(actor.role, 'competencies')) {
      return fail('An onboarder needs to start this week before a QA score can be saved.');
    }
    var next = clone(state);
    var ev = {
      id: uid(),
      vaId: src.vaId,
      weekStart: weekStart,
      status: 'open',
      outcome: '',
      gaps: '',
      coachingActions: '',
      scoreSnapshot: null,
      closedBy: '',
      closedAt: '',
      createdBy: actor.id,
      createdAt: new Date().toISOString()
    };
    next.evaluations.push(ev);
    return { ok: true, state: next, evaluation: ev };
  }

  function applyQaPeriod(row, input) {
    var hasStart = Object.prototype.hasOwnProperty.call(input, 'periodStart');
    var hasEnd = Object.prototype.hasOwnProperty.call(input, 'periodEnd');
    if (!hasStart && !hasEnd) return '';
    if (hasStart) {
      var start = text(input.periodStart);
      if (!Dates.isRealDate(start)) return 'Enter a From date.';
      row.periodStart = start;
    }
    if (hasEnd) {
      var end = text(input.periodEnd);
      if (end && !Dates.isRealDate(end)) return 'Enter a To date, or leave it blank.';
      row.periodEnd = end;
    }
    if (row.periodStart && row.periodEnd && row.periodEnd < row.periodStart) return 'To is earlier than From.';
    return '';
  }

  function saveQa(state, actor, input) {
    var denied = gate(actor, 'qa');
    if (denied) return fail(denied);
    var src = input || {};
    var open = requireOpen(state, src.evaluationId);
    if (open.error) return fail(open.error);
    var score = scoreOrNull(src.score);
    if (!score.ok || score.n == null) return fail('Enter a QA score from 0 to 100.');
    var form = cleanUrl(src.formUrl);
    var recording = cleanUrl(src.recordingUrl);
    if (!form.ok || !recording.ok) return fail('Use an http or https link, or leave the link blank.');
    var next = clone(state);
    var row = null;
    if (src.qaId) {
      row = next.qa.find(function (item) { return item.id === src.qaId; });
      if (!row) return fail('QA score not found.');
      var oldOpen = requireOpen(next, row.evaluationId);
      if (oldOpen.error) return fail(oldOpen.error);
      if (row.evaluationId !== src.evaluationId) {
        var moving = next.qa.find(function (item) {
          return item.evaluationId === src.evaluationId && item.id !== row.id;
        });
        if (moving) return fail('A QA score already exists for the week of that From date.');
        row.evaluationId = src.evaluationId;
      }
    } else {
      row = next.qa.find(function (item) { return item.evaluationId === src.evaluationId; });
      if (!row) {
        row = { id: uid(), evaluationId: src.evaluationId };
        next.qa.push(row);
      }
    }
    var periodError = applyQaPeriod(row, src);
    if (periodError) return fail(periodError);
    row.score = score.n;
    row.formUrl = form.url;
    row.recordingUrl = recording.url;
    row.updatedBy = actor.id;
    return { ok: true, state: next, qa: row };
  }

  function saveQaForWeek(state, actor, input) {
    var denied = gate(actor, 'qa');
    if (denied) return fail(denied);
    var src = input || {};
    var dated = Object.prototype.hasOwnProperty.call(src, 'periodStart');
    var from = dated ? text(src.periodStart) : src.weekStart;
    if (dated && !Dates.isRealDate(from)) return fail('Enter a From date.');
    var to = text(src.periodEnd);
    if (to && !Dates.isRealDate(to)) return fail('Enter a To date, or leave it blank.');
    if (dated && to && to < from) return fail('To is earlier than From.');
    var weekStart = Dates.mondayOf(from);
    if (!weekStart) return fail(dated ? 'Enter a From date.' : 'Weeks start on Monday.');
    var opened = recordOpenWeek(state, actor, { vaId: src.vaId, weekStart: weekStart });
    if (!opened.ok) return opened;
    if (src.asNew) {
      var taken = (opened.state.qa || []).find(function (row) {
        return row.evaluationId === opened.evaluation.id;
      });
      if (taken) return fail('A QA score already exists for the week of that From date.');
    }
    if (src.id) {
      var current = (opened.state.qa || []).find(function (row) { return row.id === src.id; });
      if (!current) return fail('QA score not found.');
      if (current.evaluationId !== opened.evaluation.id) {
        var clash = (opened.state.qa || []).find(function (row) {
          return row.evaluationId === opened.evaluation.id && row.id !== current.id;
        });
        if (clash) return fail('A QA score already exists for the week of that From date.');
      }
    }
    var payload = {
      evaluationId: opened.evaluation.id,
      qaId: src.id || '',
      score: src.score,
      formUrl: src.formUrl,
      recordingUrl: src.recordingUrl
    };
    if (dated) {
      payload.periodStart = from;
      payload.periodEnd = to;
    }
    return saveQa(opened.state, actor, payload);
  }

  function deleteQa(state, actor, input) {
    var denied = gate(actor, 'qa');
    if (denied) return fail(denied);
    var open = requireOpen(state, input && input.evaluationId);
    if (open.error) return fail(open.error);
    var next = clone(state);
    next.qa = next.qa.filter(function (row) { return row.evaluationId !== input.evaluationId; });
    return { ok: true, state: next };
  }

  function leadCount(value, label) {
    if (value == null || value === '') return { ok: true, n: null };
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: label };
    return { ok: true, n: n };
  }

  function saveWbrDay(state, actor, input) {
    var denied = gate(actor, 'wbr');
    if (denied) return fail(denied);
    var src = input || {};
    if (!findVa(state, src.vaId)) return fail('VA not found.');
    if (!Dates.isRealDate(src.workDate)) return fail('Enter a work day.');
    if (closedWeekCovers(state, src.vaId, src.workDate)) return fail('That day is in a closed week.');
    var total = leadCount(src.totalLeads, 'Enter total leads as zero or more, or leave them blank.');
    if (!total.ok) return fail(total.error);
    var converted = leadCount(src.convertedLeads, 'Enter converted leads as zero or more, or leave them blank.');
    if (!converted.ok) return fail(converted.error);
    var next = clone(state);
    if (!next.wbrDays) next.wbrDays = [];
    if (total.n == null && converted.n == null) {
      if (src.asNew || src.id) return fail('Enter total leads or converted leads.');
      next.wbrDays = next.wbrDays.filter(function (row) {
        return !(row.vaId === src.vaId && row.workDate === src.workDate);
      });
      return { ok: true, state: next };
    }
    var sameDate = next.wbrDays.find(function (row) {
      return row.vaId === src.vaId && row.workDate === src.workDate;
    });
    if (src.id) {
      var editing = next.wbrDays.find(function (row) { return row.id === src.id; });
      if (!editing || editing.vaId !== src.vaId) return fail('WBR record not found.');
      if (closedWeekCovers(next, editing.vaId, editing.workDate)) return fail('That day is in a closed week.');
      if (sameDate && sameDate.id !== editing.id) return fail('That date already has a WBR record.');
      editing.workDate = src.workDate;
      editing.totalLeads = total.n;
      editing.convertedLeads = converted.n;
      editing.updatedBy = actor.id;
      return { ok: true, state: next, wbrDay: editing };
    }
    if (src.asNew && sameDate) return fail('That date already has a WBR record.');
    var row = sameDate || {
      id: uid(),
      vaId: src.vaId,
      workDate: src.workDate,
      createdBy: actor.id
    };
    row.totalLeads = total.n;
    row.convertedLeads = converted.n;
    row.updatedBy = actor.id;
    if (!sameDate) next.wbrDays.push(row);
    return { ok: true, state: next, wbrDay: row };
  }

  function deleteWbrDay(state, actor, input) {
    var denied = gate(actor, 'wbr');
    if (denied) return fail(denied);
    var next = clone(state);
    var row = (next.wbrDays || []).find(function (item) { return item.id === (input && input.id); });
    if (!row) return fail('WBR record not found.');
    if (closedWeekCovers(next, row.vaId, row.workDate)) return fail('That day is in a closed week.');
    next.wbrDays = next.wbrDays.filter(function (item) { return item.id !== row.id; });
    return { ok: true, state: next };
  }

  function saveCompetencies(state, actor, input) {
    var denied = gate(actor, 'competencies');
    if (denied) return fail(denied);
    var open = requireOpen(state, input && input.evaluationId);
    if (open.error) return fail(open.error);
    var fields = [
      ['toolNavigation', 'toolNavigationComment'],
      ['communication', 'communicationComment'],
      ['criticalThinking', 'criticalThinkingComment'],
      ['coreValues', 'coreValuesComment']
    ];
    var stored = { id: uid(), evaluationId: input.evaluationId, updatedBy: actor.id };
    var any = false;
    for (var i = 0; i < fields.length; i++) {
      var parsed = scoreOrNull(input[fields[i][0]]);
      if (!parsed.ok) return fail('Enter each competency from 0 to 100, or leave it blank.');
      var comment = text(input[fields[i][1]]);
      stored[fields[i][0]] = parsed.n;
      stored[fields[i][1]] = comment;
      if (parsed.n != null || comment) any = true;
    }
    if (!any) return fail('Enter a competency score or a comment.');
    var next = clone(state);
    next.competencies = next.competencies.filter(function (row) {
      return row.evaluationId !== input.evaluationId;
    });
    var existing = state.competencies.find(function (row) { return row.evaluationId === input.evaluationId; });
    if (existing) stored.id = existing.id;
    next.competencies.push(stored);
    return { ok: true, state: next, competencies: stored };
  }

  function saveCompetenciesForWeek(state, actor, input) {
    var denied = gate(actor, 'competencies');
    if (denied) return fail(denied);
    var opened = recordOpenWeek(state, actor, input);
    if (!opened.ok) return opened;
    var payload = Object.assign({}, input, { evaluationId: opened.evaluation.id });
    return saveCompetencies(opened.state, actor, payload);
  }

  function deleteCompetencies(state, actor, input) {
    var denied = gate(actor, 'competencies');
    if (denied) return fail(denied);
    var open = requireOpen(state, input && input.evaluationId);
    if (open.error) return fail(open.error);
    var next = clone(state);
    next.competencies = next.competencies.filter(function (row) {
      return row.evaluationId !== input.evaluationId;
    });
    return { ok: true, state: next };
  }

  function blankCompetency(evaluationId, actor) {
    return {
      id: uid(),
      evaluationId: evaluationId,
      toolNavigation: null,
      toolNavigationComment: '',
      communication: null,
      communicationComment: '',
      criticalThinking: null,
      criticalThinkingComment: '',
      coreValues: null,
      coreValuesComment: '',
      updatedBy: actor.id
    };
  }

  function syncWeeklyCompetency(state, vaId, key, weekStart, actor) {
    if (!weekStart || !COMPETENCY_COMMENT[key]) return;
    var ev = state.evaluations.find(function (item) {
      return item.vaId === vaId && item.weekStart === weekStart;
    });
    if (!ev || ev.status === 'closed') return;
    var latest = (state.competencyEntries || []).filter(function (row) {
      return row.vaId === vaId && row.competency === key && inWeek(row.entryDate, weekStart);
    }).sort(newestEntry)[0] || null;
    var comp = state.competencies.find(function (row) { return row.evaluationId === ev.id; });
    if (!latest && !comp) return;
    if (!comp) {
      comp = blankCompetency(ev.id, actor);
      state.competencies.push(comp);
    }
    comp[key] = latest ? latest.score : null;
    comp[COMPETENCY_COMMENT[key]] = latest ? (latest.comment || '') : '';
    comp.updatedBy = actor.id;
  }

  function saveCompetencyEntry(state, actor, input) {
    var denied = gate(actor, 'competencies');
    if (denied) return fail(denied);
    var src = input || {};
    if (!findVa(state, src.vaId)) return fail('VA not found.');
    if (!COMPETENCY_COMMENT[src.competency]) return fail('Choose a competency.');
    if (!Dates.isRealDate(src.entryDate)) return fail('Enter a date.');
    var score = scoreOrNull(src.score);
    if (!score.ok || score.n == null) return fail('Enter a score from 0 to 100.');
    if (closedWeekCovers(state, src.vaId, src.entryDate)) return fail('That day is in a closed week.');
    var opened = recordOpenWeek(state, actor, { vaId: src.vaId, weekStart: Dates.mondayOf(src.entryDate) });
    if (!opened.ok) return opened;
    var next = clone(opened.state);
    if (!next.competencyEntries) next.competencyEntries = [];
    var row = null;
    var previousDate = '';
    if (src.id) {
      row = next.competencyEntries.find(function (item) { return item.id === src.id; });
      if (!row || row.vaId !== src.vaId || row.competency !== src.competency) return fail('Competency entry not found.');
      if (closedWeekCovers(next, row.vaId, row.entryDate)) return fail('That day is in a closed week.');
      previousDate = row.entryDate;
      row.entryDate = src.entryDate;
      row.score = score.n;
      row.comment = text(src.comment);
      row.updatedAt = new Date().toISOString();
      row.updatedBy = actor.id;
    } else {
      var stamp = new Date().toISOString();
      row = {
        id: uid(),
        vaId: src.vaId,
        competency: src.competency,
        entryDate: src.entryDate,
        score: score.n,
        comment: text(src.comment),
        createdBy: actor.id,
        createdAt: stamp,
        updatedAt: stamp,
        updatedBy: actor.id
      };
      next.competencyEntries.push(row);
    }
    syncWeeklyCompetency(next, src.vaId, src.competency, Dates.mondayOf(src.entryDate), actor);
    if (previousDate && Dates.mondayOf(previousDate) !== Dates.mondayOf(src.entryDate)) {
      syncWeeklyCompetency(next, src.vaId, src.competency, Dates.mondayOf(previousDate), actor);
    }
    return { ok: true, state: next, entry: row };
  }

  function deleteCompetencyEntry(state, actor, input) {
    var denied = gate(actor, 'competencies');
    if (denied) return fail(denied);
    var next = clone(state);
    var row = (next.competencyEntries || []).find(function (item) { return item.id === (input && input.id); });
    if (!row) return fail('Competency entry not found.');
    if (closedWeekCovers(next, row.vaId, row.entryDate)) return fail('That day is in a closed week.');
    var weekStart = Dates.mondayOf(row.entryDate);
    var key = row.competency;
    var vaId = row.vaId;
    next.competencyEntries = next.competencyEntries.filter(function (item) { return item.id !== row.id; });
    syncWeeklyCompetency(next, vaId, key, weekStart, actor);
    return { ok: true, state: next };
  }

  function addCoaching(state, actor, input) {
    var denied = gate(actor, 'coaching');
    if (denied) return fail(denied);
    var src = input || {};
    if (!findVa(state, src.vaId)) return fail('VA not found.');
    if (!Dates.isRealDate(src.sessionDate) || !text(src.topic) || !text(src.discussion) || !text(src.action)) {
      return fail('Enter the coaching date, topic, discussion, and action.');
    }
    var next = clone(state);
    if (src.id) {
      var existing = next.coaching.find(function (row) { return row.id === src.id; });
      if (!existing || existing.vaId !== src.vaId) return fail('Coaching session not found.');
      existing.sessionDate = src.sessionDate;
      existing.topic = text(src.topic);
      existing.discussion = text(src.discussion);
      existing.action = text(src.action);
      existing.updatedBy = actor.id;
      return { ok: true, state: next, coaching: existing };
    }
    var row = {
      id: uid(),
      vaId: src.vaId,
      sessionDate: src.sessionDate,
      topic: text(src.topic),
      discussion: text(src.discussion),
      action: text(src.action),
      createdBy: actor.id,
      createdAt: new Date().toISOString()
    };
    next.coaching.push(row);
    return { ok: true, state: next, coaching: row };
  }

  function deleteCoaching(state, actor, input) {
    var denied = gate(actor, 'coaching');
    if (denied) return fail(denied);
    var next = clone(state);
    var before = next.coaching.length;
    next.coaching = next.coaching.filter(function (row) { return row.id !== (input && input.id); });
    if (next.coaching.length === before) return fail('Coaching session not found.');
    return { ok: true, state: next };
  }

  function closeEvaluation(state, actor, input) {
    var denied = gate(actor, 'evaluations');
    if (denied) return fail(denied);
    var ev = findEval(state, input && input.evaluationId);
    if (!ev) return fail('Evaluation not found.');
    if (ev.status === 'closed') return fail('This week is already closed.');
    var snapshot = computeSnapshot(state, ev.id);
    if (snapshot.overall == null) return fail('Enter at least one scored section before closing this week.');
    var gaps = text(input.gaps);
    var actions = text(input.coachingActions);
    if (!snapshot.passed && (!gaps || !actions)) {
      return fail('Gaps and coaching actions are required when the score is below the pass mark.');
    }
    var next = clone(state);
    var row = findEval(next, ev.id);
    var va = findVa(next, row.vaId);
    row.status = 'closed';
    row.outcome = snapshot.passed ? 'ready_for_endorsement' : 'continue_onboarding';
    row.gaps = gaps;
    row.coachingActions = actions;
    row.scoreSnapshot = snapshot;
    row.closedBy = actor.id;
    row.closedAt = new Date().toISOString();
    var newStatus = snapshot.passed ? 'Ready for endorsement' : 'Continue onboarding';
    var statusApplied = false;
    if (va && ACTIVE.indexOf(va.status) !== -1 && va.status !== newStatus) {
      var previous = va.status;
      va.status = newStatus;
      va.endorsedBy = '';
      va.endorsedAt = '';
      pushHistory(next, va.id, previous, newStatus, 'Closed week of ' + row.weekStart, actor);
      statusApplied = true;
    } else if (va && va.status === newStatus) {
      statusApplied = true;
    }
    return {
      ok: true,
      state: next,
      snapshot: snapshot,
      statusApplied: statusApplied,
      vaStatus: va ? va.status : ''
    };
  }

  function endorse(state, actor, input) {
    var denied = gate(actor, 'endorse');
    if (denied) return fail(denied);
    var next = clone(state);
    var va = findVa(next, input && input.vaId);
    if (!va) return fail('VA not found.');
    if (va.status !== 'Ready for endorsement') {
      return fail('Only a VA who is ready for endorsement can be endorsed.');
    }
    var previous = va.status;
    va.status = 'Endorsed';
    va.endorsedBy = actor.id;
    va.endorsedAt = new Date().toISOString();
    pushHistory(next, va.id, previous, 'Endorsed', 'Endorsed', actor);
    return { ok: true, state: next, va: va };
  }

  function saveSettings(state, actor, input) {
    var denied = gate(actor, 'settings');
    if (denied) return fail(denied);
    var src = input || {};
    var passMark = Number(src.passMark);
    if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
      return fail('Pass mark must be between 0 and 100.');
    }
    if (!Score.weightsValid(src.weights)) return fail('Weights must sum to 100.');
    var next = clone(state);
    var weights = {};
    Score.SECTION_KEYS.forEach(function (key) { weights[key] = Number(src.weights[key]); });
    next.settings = { passMark: passMark, weights: weights };
    return { ok: true, state: next, settings: next.settings };
  }

  function listUsers(state, actor) {
    var denied = gate(actor, 'view');
    if (denied) return fail(denied);
    if (!Perms.can(actor.role, 'users') && actor.role !== 'admin') {
      return {
        ok: true,
        users: state.users.filter(function (user) { return user.id === actor.id; }).map(publicUser)
      };
    }
    return { ok: true, users: state.users.map(publicUser) };
  }

  function publicUser(user) {
    return { id: user.id, email: user.email, name: user.name || '', role: user.role };
  }

  function setUserRole(state, actor, input) {
    var denied = gate(actor, 'users');
    if (denied) return fail(denied);
    var role = input && input.role;
    var known = Labels.ROLES.some(function (item) { return item.id === role; });
    if (!known) return fail('Choose a role.');
    var next = clone(state);
    var user = next.users.find(function (row) { return row.id === input.userId; });
    if (!user) return fail('User not found.');
    if (user.role === 'admin' && role !== 'admin') {
      var otherAdmins = next.users.filter(function (row) {
        return row.role === 'admin' && row.id !== user.id;
      });
      if (!otherAdmins.length) return fail('The last admin cannot be demoted.');
    }
    user.role = role;
    return { ok: true, state: next, user: publicUser(user) };
  }

  return {
    createState: createState,
    listVas: listVas,
    presentVa: presentVa,
    computeSnapshot: computeSnapshot,
    createBatch: createBatch,
    renameBatch: renameBatch,
    createVa: createVa,
    updateVa: updateVa,
    deleteVa: deleteVa,
    setManualStatus: setManualStatus,
    saveAttendance: saveAttendance,
    deleteAttendance: deleteAttendance,
    finalizeAttendance: finalizeAttendance,
    undoFinalizeAttendance: undoFinalizeAttendance,
    startEvaluation: startEvaluation,
    nextEvaluation: nextEvaluation,
    saveQa: saveQa,
    saveQaForWeek: saveQaForWeek,
    deleteQa: deleteQa,
    saveWbrDay: saveWbrDay,
    deleteWbrDay: deleteWbrDay,
    saveCompetencies: saveCompetencies,
    saveCompetenciesForWeek: saveCompetenciesForWeek,
    deleteCompetencies: deleteCompetencies,
    saveCompetencyEntry: saveCompetencyEntry,
    deleteCompetencyEntry: deleteCompetencyEntry,
    addCoaching: addCoaching,
    deleteCoaching: deleteCoaching,
    closeEvaluation: closeEvaluation,
    endorse: endorse,
    saveSettings: saveSettings,
    listUsers: listUsers,
    setUserRole: setUserRole,
    MANUAL_ONBOARDER: MANUAL_ONBOARDER,
    MANUAL_ADMIN: MANUAL_ADMIN
  };
});
