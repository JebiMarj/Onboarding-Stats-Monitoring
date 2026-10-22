// Browser data access. ?mock=1 stays in this browser and never calls Supabase.
(function (root) {
  var MOCK_DB = 'cnr-onboarding-qa-mock-db';
  var MOCK_SESSION = 'cnr-onboarding-qa-mock-session';
  var MOCK_FLAG = 'cnr-mock';
  var USERS = [
    { id: '00000000-0000-4000-8000-000000000001', email: 'admin@local.test', name: 'Local admin', role: 'admin', password: 'admin' },
    { id: '00000000-0000-4000-8000-000000000002', email: 'onboarder@local.test', name: 'Local onboarder', role: 'onboarder', password: 'onboarder' },
    { id: '00000000-0000-4000-8000-000000000003', email: 'qa@local.test', name: 'Local QA', role: 'qa', password: 'qa' },
    { id: '00000000-0000-4000-8000-000000000004', email: 'viewer@local.test', name: 'Local viewer', role: 'viewer', password: 'viewer' }
  ];
  var mock = false;
  var session = null;
  var state = null;
  var client = null;

  function sb() {
    var cfg = root.CNR_CONFIG;
    if (!root.supabase || !cfg || !cfg.url || !cfg.key) {
      throw new Error('Add the Supabase project URL and anon key to config.js. Never put the service-role key in this file.');
    }
    if (!client) {
      client = root.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    }
    return client;
  }

  function raise(error) {
    var message = (error && error.message) || 'Something went wrong.';
    if (/batches_name_lower_idx|duplicate key value violates unique constraint "batches_name_lower/i.test(message)) {
      message = 'A batch with that name already exists.';
    }
    throw new Error(message);
  }

  function num(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function one(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
  }

  function loadMock() {
    try {
      var saved = JSON.parse(localStorage.getItem(MOCK_DB) || 'null');
      if (saved && Array.isArray(saved.vas) && saved.settings) {
        state = saved;
        if (!state.users || !state.users.length) state.users = USERS;
        if (!root.CNRScore.weightsValid(state.settings.weights)) {
          state.settings = {
            passMark: root.CNRScore.DEFAULT_PASS_MARK,
            weights: Object.assign({}, root.CNRScore.DEFAULT_WEIGHTS)
          };
        }
        return;
      }
    } catch (err) { /* start fresh */ }
    state = root.CNRModel.createState({ users: USERS });
  }

  function persist() {
    localStorage.setItem(MOCK_DB, JSON.stringify(state));
  }

  function apply(fn) {
    var result = fn(state, session);
    if (!result.ok) throw new Error(result.error);
    if (result.state) {
      state = result.state;
      persist();
    }
    return result;
  }

  async function loadProfile() {
    var res = await sb().rpc('ensure_profile');
    if (res.error) raise(res.error);
    var row = res.data;
    session = {
      id: row.id,
      email: row.email,
      name: row.full_name || row.email,
      role: row.role
    };
    return session;
  }

  function mapQa(row) {
    row = one(row);
    if (!row) return null;
    return {
      id: row.id,
      evaluationId: row.evaluation_id,
      score: num(row.score),
      formUrl: row.form_url || '',
      recordingUrl: row.recording_url || ''
    };
  }

  function mapWbr(row) {
    row = one(row);
    if (!row) return null;
    return {
      id: row.id,
      evaluationId: row.evaluation_id,
      totalLeads: num(row.total_leads),
      convertedLeads: num(row.converted_leads)
    };
  }

  function mapComp(row) {
    row = one(row);
    if (!row) return null;
    return {
      id: row.id,
      evaluationId: row.evaluation_id,
      toolNavigation: num(row.tool_navigation),
      toolNavigationComment: row.tool_navigation_comment || '',
      communication: num(row.communication),
      communicationComment: row.communication_comment || '',
      criticalThinking: num(row.critical_thinking),
      criticalThinkingComment: row.critical_thinking_comment || '',
      coreValues: num(row.core_values),
      coreValuesComment: row.core_values_comment || ''
    };
  }

  function peopleMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      map[row.id] = row.full_name || row.email || 'Unknown user';
    });
    return map;
  }

  function mapVa(row, names) {
    var batch = one(row.batches);
    var evaluations = (row.weekly_evaluations || []).map(function (ev) {
      var recorded = ev.score_snapshot || null;
      return {
        id: ev.id,
        vaId: ev.va_id,
        weekStart: ev.week_start,
        weekEnd: root.CNRDates.addDays(ev.week_start, 6),
        status: ev.status,
        outcome: ev.outcome || '',
        gaps: ev.gaps || '',
        coachingActions: ev.coaching_actions || '',
        closedBy: ev.closed_by || '',
        closedAt: ev.closed_at || '',
        closedByName: names[ev.closed_by] || '',
        qa: mapQa(ev.weekly_qa),
        wbr: mapWbr(ev.weekly_wbr),
        competencies: mapComp(ev.weekly_competencies),
        preview: recorded,
        score: recorded
      };
    }).sort(function (a, b) { return a.weekStart < b.weekStart ? -1 : 1; });
    return {
      id: row.id,
      fullName: row.full_name,
      onboardingStart: row.onboarding_start,
      onboarderName: row.onboarder_name || '',
      clientName: row.client_name || '',
      businessName: row.business_name || '',
      sopOrPortfolio: row.sop_or_portfolio || '',
      status: row.status,
      schedule: row.schedule || '',
      batchId: row.batch_id,
      batchName: batch ? batch.name : '',
      endorsedBy: row.endorsed_by || '',
      endorsedAt: row.endorsed_at || '',
      endorsedByName: names[row.endorsed_by] || '',
      attendance: (row.attendance_days || []).map(function (day) {
        return {
          id: day.id,
          vaId: day.va_id,
          workDate: day.work_date,
          absent: !!day.absent,
          lateMinutes: day.late_minutes,
          downtimeMinutes: day.downtime_minutes
        };
      }).sort(function (a, b) { return a.workDate < b.workDate ? -1 : 1; }),
      evaluations: evaluations,
      coaching: (row.coaching_sessions || []).map(function (item) {
        return {
          id: item.id,
          vaId: item.va_id,
          sessionDate: item.session_date,
          topic: item.topic,
          discussion: item.discussion,
          action: item.action,
          createdBy: item.created_by,
          createdAt: item.created_at
        };
      }).sort(function (a, b) { return (a.sessionDate + a.createdAt) < (b.sessionDate + b.createdAt) ? 1 : -1; }),
      history: (row.status_history || []).map(function (item) {
        return {
          id: item.id,
          previousStatus: item.previous_status,
          newStatus: item.new_status,
          note: item.note || '',
          changedBy: item.changed_by,
          changedByName: names[item.changed_by] || 'Unknown user',
          changedAt: item.changed_at
        };
      }).sort(function (a, b) { return a.changedAt < b.changedAt ? 1 : -1; })
    };
  }

  async function fillOpenScores(va) {
    for (var i = 0; i < va.evaluations.length; i++) {
      var ev = va.evaluations[i];
      if (ev.status === 'closed' && ev.score) continue;
      var res = await sb().rpc('compute_kpi_snapshot', { p_evaluation_id: ev.id });
      if (!res.error && res.data) {
        ev.preview = res.data;
        ev.score = ev.status === 'closed' && ev.score ? ev.score : res.data;
      }
    }
    return va;
  }

  var api = {
    mode: function () { return mock ? 'mock' : 'supabase'; },
    current: function () { return session; },
    async restore() {
      mock = sessionStorage.getItem(MOCK_FLAG) === '1';
      if (mock) {
        loadMock();
        var id = sessionStorage.getItem(MOCK_SESSION);
        var user = (state.users || []).find(function (row) { return row.id === id; });
        session = user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
        return session;
      }
      var existing = await sb().auth.getSession();
      if (existing.error || !existing.data.session) {
        session = null;
        return null;
      }
      return loadProfile();
    },
    async signIn(email, password) {
      if (mock) {
        loadMock();
        var user = state.users.find(function (row) {
          return row.email.toLowerCase() === String(email || '').trim().toLowerCase() && row.password === password;
        });
        if (!user) throw new Error('Email or password is incorrect.');
        session = { id: user.id, email: user.email, name: user.name, role: user.role };
        sessionStorage.setItem(MOCK_SESSION, user.id);
        return session;
      }
      var res = await sb().auth.signInWithPassword({
        email: String(email || '').trim(),
        password: password
      });
      if (res.error) throw new Error('Email or password is incorrect.');
      return loadProfile();
    },
    async signOut() {
      session = null;
      if (mock) {
        sessionStorage.removeItem(MOCK_SESSION);
        return;
      }
      await sb().auth.signOut();
    },
    resetMock() {
      state = root.CNRModel.createState({ users: USERS });
      persist();
    },
    async listVas() {
      if (mock) return root.CNRModel.listVas(state);
      var res = await sb().from('va_profiles').select('id, full_name, client_name, business_name, status, onboarder_name, onboarding_start, schedule, batch_id, batches(name)').order('full_name');
      if (res.error) raise(res.error);
      return (res.data || []).map(function (row) {
        var batch = one(row.batches);
        return {
          id: row.id,
          fullName: row.full_name,
          clientName: row.client_name || '',
          businessName: row.business_name || '',
          status: row.status,
          onboarderName: row.onboarder_name || '',
          onboardingStart: row.onboarding_start,
          schedule: row.schedule || '',
          batchId: row.batch_id,
          batchName: batch ? batch.name : ''
        };
      });
    },
    async getVa(id) {
      if (mock) {
        var va = root.CNRModel.presentVa(state, id);
        if (!va) throw new Error('VA not found.');
        return va;
      }
      var res = await sb().from('va_profiles').select('*, batches(id, name), attendance_days(*), weekly_evaluations(*, weekly_qa(*), weekly_wbr(*), weekly_competencies(*)), coaching_sessions(*), status_history(*)').eq('id', id).maybeSingle();
      if (res.error) raise(res.error);
      if (!res.data) throw new Error('VA not found.');
      var people = await sb().from('profiles').select('id, full_name, email');
      if (people.error) raise(people.error);
      return fillOpenScores(mapVa(res.data, peopleMap(people.data)));
    },
    async listBatches() {
      if (mock) {
        return state.batches.map(function (batch) {
          return { id: batch.id, name: batch.name };
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      }
      var res = await sb().from('batches').select('id, name').order('name');
      if (res.error) raise(res.error);
      return res.data || [];
    },
    async createBatch(name) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.createBatch(current, actor, { name: name }); }).batch;
      var res = await sb().from('batches').insert({ name: name }).select('id, name').single();
      if (res.error) raise(res.error);
      return res.data;
    },
    async renameBatch(id, name) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.renameBatch(current, actor, { id: id, name: name }); }).batch;
      var res = await sb().from('batches').update({ name: name }).eq('id', id).select('id, name').single();
      if (res.error) raise(res.error);
      return res.data;
    },
    async createVa(input) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.createVa(current, actor, input); }).va;
      var res = await sb().from('va_profiles').insert({
        full_name: input.fullName,
        onboarding_start: input.onboardingStart,
        onboarder_name: input.onboarderName || null,
        client_name: input.clientName || null,
        business_name: input.businessName || null,
        sop_or_portfolio: input.sopOrPortfolio || null,
        status: input.status || 'Onboarding',
        schedule: input.schedule || null,
        batch_id: input.batchId
      }).select('id').single();
      if (res.error) raise(res.error);
      return res.data;
    },
    async updateVa(input) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.updateVa(current, actor, input); }).va;
      var res = await sb().from('va_profiles').update({
        full_name: input.fullName,
        onboarding_start: input.onboardingStart,
        onboarder_name: input.onboarderName || null,
        client_name: input.clientName || null,
        business_name: input.businessName || null,
        sop_or_portfolio: input.sopOrPortfolio || null,
        schedule: input.schedule || null,
        batch_id: input.batchId
      }).eq('id', input.id);
      if (res.error) raise(res.error);
      return { id: input.id };
    },
    async setManualStatus(id, status) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.setManualStatus(current, actor, { id: id, status: status }); });
      var res = await sb().from('va_profiles').update({ status: status }).eq('id', id);
      if (res.error) raise(res.error);
    },
    async saveAttendance(input) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.saveAttendance(current, actor, input); });
      var res = await sb().from('attendance_days').upsert({
        va_id: input.vaId,
        work_date: input.workDate,
        absent: !!input.absent,
        late_minutes: input.absent ? 0 : Number(input.lateMinutes || 0),
        downtime_minutes: input.absent ? 0 : Number(input.downtimeMinutes || 0)
      }, { onConflict: 'va_id,work_date' });
      if (res.error) raise(res.error);
    },
    async deleteAttendance(id) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.deleteAttendance(current, actor, { id: id }); });
      var res = await sb().from('attendance_days').delete().eq('id', id);
      if (res.error) raise(res.error);
    },
    async startEvaluation(vaId, weekStart) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.startEvaluation(current, actor, { vaId: vaId, weekStart: weekStart }); }).evaluation;
      var res = await sb().from('weekly_evaluations').insert({ va_id: vaId, week_start: weekStart, status: 'open' }).select('id, week_start').single();
      if (res.error) raise(res.error);
      return { id: res.data.id, weekStart: res.data.week_start };
    },
    async nextEvaluation(vaId) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.nextEvaluation(current, actor, { vaId: vaId }); }).evaluation;
      var va = await api.getVa(vaId);
      var latest = va.evaluations[va.evaluations.length - 1];
      if (!latest) throw new Error('Start the first weekly evaluation with a Monday.');
      if (latest.status !== 'closed') throw new Error('This VA already has an open week.');
      return api.startEvaluation(vaId, root.CNRDates.addDays(latest.weekStart, 7));
    },
    async saveQa(input) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.saveQa(current, actor, input); });
      var res = await sb().from('weekly_qa').upsert({
        evaluation_id: input.evaluationId,
        score: input.score,
        form_url: input.formUrl || null,
        recording_url: input.recordingUrl || null
      }, { onConflict: 'evaluation_id' });
      if (res.error) raise(res.error);
    },
    async deleteQa(evaluationId) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.deleteQa(current, actor, { evaluationId: evaluationId }); });
      var res = await sb().from('weekly_qa').delete().eq('evaluation_id', evaluationId);
      if (res.error) raise(res.error);
    },
    async saveWbr(input) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.saveWbr(current, actor, input); });
      var res = await sb().from('weekly_wbr').upsert({
        evaluation_id: input.evaluationId,
        total_leads: input.totalLeads === '' || input.totalLeads == null ? null : input.totalLeads,
        converted_leads: input.convertedLeads === '' || input.convertedLeads == null ? null : input.convertedLeads
      }, { onConflict: 'evaluation_id' });
      if (res.error) raise(res.error);
    },
    async deleteWbr(evaluationId) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.deleteWbr(current, actor, { evaluationId: evaluationId }); });
      var res = await sb().from('weekly_wbr').delete().eq('evaluation_id', evaluationId);
      if (res.error) raise(res.error);
    },
    async saveCompetencies(input) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.saveCompetencies(current, actor, input); });
      var res = await sb().from('weekly_competencies').upsert({
        evaluation_id: input.evaluationId,
        tool_navigation: blankNum(input.toolNavigation),
        tool_navigation_comment: input.toolNavigationComment || null,
        communication: blankNum(input.communication),
        communication_comment: input.communicationComment || null,
        critical_thinking: blankNum(input.criticalThinking),
        critical_thinking_comment: input.criticalThinkingComment || null,
        core_values: blankNum(input.coreValues),
        core_values_comment: input.coreValuesComment || null
      }, { onConflict: 'evaluation_id' });
      if (res.error) raise(res.error);
    },
    async deleteCompetencies(evaluationId) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.deleteCompetencies(current, actor, { evaluationId: evaluationId }); });
      var res = await sb().from('weekly_competencies').delete().eq('evaluation_id', evaluationId);
      if (res.error) raise(res.error);
    },
    async addCoaching(input) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.addCoaching(current, actor, input); });
      var res = await sb().from('coaching_sessions').insert({
        va_id: input.vaId,
        session_date: input.sessionDate,
        topic: input.topic,
        discussion: input.discussion,
        action: input.action
      });
      if (res.error) raise(res.error);
    },
    async deleteCoaching(id) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.deleteCoaching(current, actor, { id: id }); });
      var res = await sb().from('coaching_sessions').delete().eq('id', id);
      if (res.error) raise(res.error);
    },
    async closeEvaluation(evaluationId, gaps, actions) {
      if (mock) {
        var result = apply(function (current, actor) {
          return root.CNRModel.closeEvaluation(current, actor, {
            evaluationId: evaluationId, gaps: gaps, coachingActions: actions
          });
        });
        return { snapshot: result.snapshot, statusApplied: result.statusApplied, vaStatus: result.vaStatus };
      }
      var res = await sb().rpc('close_weekly_evaluation', {
        p_evaluation_id: evaluationId,
        p_gaps: gaps || '',
        p_coaching_actions: actions || ''
      });
      if (res.error) raise(res.error);
      return {
        snapshot: res.data,
        statusApplied: !!(res.data && res.data.statusApplied),
        vaStatus: res.data ? res.data.vaStatus : ''
      };
    },
    async endorse(vaId) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.endorse(current, actor, { vaId: vaId }); });
      var res = await sb().rpc('endorse_va', { p_va_id: vaId });
      if (res.error) raise(res.error);
    },
    async getSettings() {
      if (mock) return JSON.parse(JSON.stringify(state.settings));
      var res = await sb().from('app_settings').select('value').eq('key', 'kpi').single();
      if (res.error) raise(res.error);
      return {
        passMark: Number(res.data.value.passMark),
        weights: res.data.value.weights
      };
    },
    async saveSettings(settings) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.saveSettings(current, actor, settings); }).settings;
      var res = await sb().from('app_settings').update({
        value: { passMark: Number(settings.passMark), weights: settings.weights }
      }).eq('key', 'kpi');
      if (res.error) raise(res.error);
      return settings;
    },
    async listUsers() {
      if (mock) {
        var result = root.CNRModel.listUsers(state, session);
        if (!result.ok) throw new Error(result.error);
        return result.users;
      }
      var res = await sb().from('profiles').select('id, email, full_name, role').order('email');
      if (res.error) raise(res.error);
      return (res.data || []).map(function (row) {
        return { id: row.id, email: row.email, name: row.full_name || '', role: row.role };
      });
    },
    async setUserRole(userId, role) {
      if (mock) return apply(function (current, actor) { return root.CNRModel.setUserRole(current, actor, { userId: userId, role: role }); });
      var res = await sb().from('profiles').update({ role: role }).eq('id', userId);
      if (res.error) raise(res.error);
    }
  };

  function blankNum(value) {
    if (value == null || value === '') return null;
    return Number(value);
  }

  function vaBrief(row) {
    var va = one(row);
    if (!va) return { vaName: '', clientName: '', businessName: '', vaStatus: '', batchId: '', batchName: '' };
    var batch = one(va.batches);
    return {
      vaName: va.full_name || '',
      clientName: va.client_name || '',
      businessName: va.business_name || '',
      vaStatus: va.status || '',
      batchId: va.batch_id || '',
      batchName: batch ? batch.name : ''
    };
  }

  api.listAttendance = async function () {
    if (mock) {
      var names = {};
      state.vas.forEach(function (va) { names[va.id] = va.fullName; });
      return state.attendance.map(function (row) {
        return {
          id: row.id,
          vaId: row.vaId,
          vaName: names[row.vaId] || '',
          workDate: row.workDate,
          absent: !!row.absent,
          lateMinutes: row.lateMinutes,
          downtimeMinutes: row.downtimeMinutes
        };
      }).sort(function (a, b) { return a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0; });
    }
    var res = await sb().from('attendance_days').select('id, va_id, work_date, absent, late_minutes, downtime_minutes, va_profiles(full_name)').order('work_date', { ascending: false });
    if (res.error) raise(res.error);
    return (res.data || []).map(function (row) {
      var va = one(row.va_profiles);
      return {
        id: row.id,
        vaId: row.va_id,
        vaName: va ? va.full_name : '',
        workDate: row.work_date,
        absent: !!row.absent,
        lateMinutes: row.late_minutes,
        downtimeMinutes: row.downtime_minutes
      };
    });
  };

  api.listCoaching = async function () {
    if (mock) {
      var names = {};
      state.vas.forEach(function (va) { names[va.id] = va.fullName; });
      return state.coaching.map(function (row) {
        return {
          id: row.id,
          vaId: row.vaId,
          vaName: names[row.vaId] || '',
          sessionDate: row.sessionDate,
          topic: row.topic,
          discussion: row.discussion,
          action: row.action,
          createdAt: row.createdAt
        };
      }).sort(function (a, b) { return (a.sessionDate + a.createdAt) < (b.sessionDate + b.createdAt) ? 1 : -1; });
    }
    var res = await sb().from('coaching_sessions').select('id, va_id, session_date, topic, discussion, action, created_at, va_profiles(full_name)').order('session_date', { ascending: false });
    if (res.error) raise(res.error);
    return (res.data || []).map(function (row) {
      var va = one(row.va_profiles);
      return {
        id: row.id,
        vaId: row.va_id,
        vaName: va ? va.full_name : '',
        sessionDate: row.session_date,
        topic: row.topic,
        discussion: row.discussion,
        action: row.action,
        createdAt: row.created_at
      };
    });
  };

  api.listEvaluations = async function () {
    if (mock) {
      var byVa = {};
      state.vas.forEach(function (va) {
        byVa[va.id] = root.CNRModel.presentVa(state, va.id);
      });
      return state.evaluations.map(function (ev) {
        var presented = byVa[ev.vaId];
        var full = presented ? presented.evaluations.find(function (row) { return row.id === ev.id; }) : null;
        var batch = presented ? state.batches.find(function (row) { return row.id === presented.batchId; }) : null;
        return {
          id: ev.id,
          vaId: ev.vaId,
          vaName: presented ? presented.fullName : '',
          clientName: presented ? presented.clientName : '',
          businessName: presented ? presented.businessName : '',
          vaStatus: presented ? presented.status : '',
          batchId: presented ? presented.batchId : '',
          batchName: batch ? batch.name : (presented ? presented.batchName : ''),
          weekStart: ev.weekStart,
          status: ev.status,
          outcome: ev.outcome || '',
          overall: full && full.score ? full.score.overall : null,
          passed: full && full.score ? full.score.passed : null,
          qaScore: full && full.qa ? full.qa.score : null
        };
      }).sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0; });
    }
    var res = await sb().from('weekly_evaluations').select('id, va_id, week_start, status, outcome, score_snapshot, weekly_qa(score), va_profiles(full_name, client_name, business_name, status, batch_id, batches(name))').order('week_start', { ascending: false });
    if (res.error) raise(res.error);
    return (res.data || []).map(function (row) {
      var brief = vaBrief(row.va_profiles);
      var snap = row.score_snapshot || null;
      var qa = one(row.weekly_qa);
      return {
        id: row.id,
        vaId: row.va_id,
        vaName: brief.vaName,
        clientName: brief.clientName,
        businessName: brief.businessName,
        vaStatus: brief.vaStatus,
        batchId: brief.batchId,
        batchName: brief.batchName,
        weekStart: row.week_start,
        status: row.status,
        outcome: row.outcome || '',
        overall: snap && snap.overall != null ? Number(snap.overall) : null,
        passed: snap ? snap.passed : null,
        qaScore: qa ? num(qa.score) : null
      };
    });
  };

  root.CNRStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
