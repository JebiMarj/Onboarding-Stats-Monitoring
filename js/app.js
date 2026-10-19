(function () {
  var Score = window.CNRScore;
  var Dates = window.CNRDates;
  var Labels = window.CNRLabels;
  var Perms = window.CNRPermissions;
  var Store = window.CNRStore;
  var THEME_KEY = 'cnr-theme';
  var flash = '';
  var loginError = '';
  var lastEmail = '';
  var askEndorse = false;
  var busy = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function can(action) {
    var user = Store.current();
    return !!(user && Perms.can(user.role, action));
  }

  function formatScore(value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    var rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  function safeUrl(value) {
    try {
      var url = new URL(String(value || '').trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (err) { /* not a url */ }
    return '';
  }

  function linkOrText(value, empty) {
    if (!value) return '<span class="hint">' + esc(empty || 'None yet') + '</span>';
    var href = safeUrl(value);
    if (href) return '<a href="' + esc(href) + '" rel="noopener noreferrer">' + esc(value) + '</a>';
    return '<span class="pre">' + esc(value) + '</span>';
  }

  function badge(status) {
    var kind = {
      'Onboarding': 'info',
      'Continue onboarding': 'warn',
      'Ready for endorsement': 'ok',
      'Endorsed': 'ok'
    }[status] || '';
    return '<span class="badge ' + kind + '">' + esc(status) + '</span>';
  }

  function parseRoute() {
    var raw = (location.hash || '#/vas').replace(/^#/, '');
    var bits = raw.split('?');
    var path = bits[0].split('/').filter(Boolean);
    var params = new URLSearchParams(bits[1] || '');
    if (path[0] === 'batches') return { name: 'batches' };
    if (path[0] === 'settings') return { name: 'settings' };
    if (path[0] === 'vas' && path[1] === 'new') return { name: 'va-form', id: '' };
    if (path[0] === 'vas' && path[1] && path[2] === 'edit') return { name: 'va-form', id: path[1] };
    if (path[0] === 'vas' && path[1]) return { name: 'va', id: path[1], week: params.get('week') || '' };
    return { name: 'vas' };
  }

  function themeNow() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    var theme = themeNow();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  function draw(html) {
    document.getElementById('app').innerHTML = html;
    var title = document.getElementById('page-title');
    if (title) document.title = title.textContent + ' — Create & Reach';
  }

  function takeFlash() {
    var message = flash;
    flash = '';
    return message;
  }

  function shell(title, body) {
    var user = Store.current();
    var route = parseRoute();
    var theme = themeNow();
    var message = takeFlash();
    var nav = [
      ['vas', 'VAs', '#/vas'],
      ['batches', 'Batches', '#/batches'],
      ['settings', 'Settings', '#/settings']
    ].map(function (item) {
      var on = route.name === item[0] || (item[0] === 'vas' && (route.name === 'va' || route.name === 'va-form'));
      return '<a href="' + item[2] + '"' + (on ? ' aria-current="page"' : '') + '>' + item[1] + '</a>';
    }).join('');
    return '<a class="skip" href="#main">Skip to content</a>' +
      '<header class="topbar"><div class="wrap topbar-row">' +
      '<a class="brand" href="#/vas"><b>Create &amp; Reach</b><span>Onboarding QA</span></a>' +
      '<nav class="nav" aria-label="Primary">' + nav + '</nav>' +
      '<div class="row-actions"><span class="who">' + esc(user.name) + ' · ' + esc(Labels.roleLabel(user.role)) + '</span>' +
      '<button type="button" class="btn secondary small" data-action="theme" aria-pressed="' + (theme === 'dark' ? 'true' : 'false') + '">' +
      (theme === 'dark' ? 'Light mode' : 'Dark mode') + '</button>' +
      '<button type="button" class="btn ghost small" data-action="sign-out">Sign out</button></div></div></header>' +
      '<main id="main" class="wrap">' +
      (Store.mode() === 'mock' ? '<p class="banner">Local preview. Nothing is sent to Supabase. Data stays in this browser.</p>' : '') +
      (message ? '<p class="flash" role="status">' + esc(message) + '</p>' : '') +
      '<p id="form-error" class="error" role="alert" tabindex="-1" hidden></p>' +
      body + '</main>';
  }

  function loginView() {
    var theme = themeNow();
    var accounts = '';
    if (sessionStorage.getItem('cnr-mock') === '1') {
      accounts = '<div class="accounts"><p><b>Local preview accounts</b></p><ul>' +
        '<li>admin@local.test / admin</li><li>onboarder@local.test / onboarder</li>' +
        '<li>qa@local.test / qa</li><li>viewer@local.test / viewer</li></ul></div>';
    }
    return '<div class="login"><div class="card login-card">' +
      '<button type="button" class="btn secondary small" data-action="theme">' + (theme === 'dark' ? 'Light mode' : 'Dark mode') + '</button>' +
      '<h1 id="page-title">Sign in</h1><p class="lede">Create &amp; Reach VA Services. Use the account John created in Supabase.</p>' +
      (sessionStorage.getItem('cnr-mock') === '1' ? '<p class="banner">Local preview. Nothing is sent to Supabase.</p>' : '') +
      (loginError ? '<p class="error" role="alert">' + esc(loginError) + '</p>' : '') +
      '<form data-form="sign-in" class="stack">' +
      '<div><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required value="' + esc(lastEmail) + '"></div>' +
      '<div><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn" type="submit">Sign in</button></form>' + accounts + '</div></div>';
  }

  function roleNote() {
    var role = Store.current().role;
    if (role === 'admin') return 'You can edit every section, settings, users, and endorsement.';
    if (role === 'onboarder') return 'You can edit profiles, attendance, WBR, competencies, coaching, and evaluations for every VA. QA scores and endorsement are outside this role.';
    if (role === 'qa') return 'You can edit QA scores and links for every VA. Other sections are view only.';
    return 'You can view records. Onboarders, QA, and admins make changes.';
  }

  function vasList(rows, batches) {
    var add = can('manage_va') && rows.length ? '<a class="btn" href="#/vas/new">Add VA</a>' : '';
    var head = '<div class="page-head"><div class="toolbar"><div><h1 id="page-title">Virtual assistants</h1>' +
      '<p class="lede">People who finished training and are on the monitoring sheet.</p></div>' + add + '</div></div>';
    if (!rows.length) {
      return head + '<section class="card empty"><h2>No VAs yet</h2><p class="lede">When someone finishes training, add them here.</p><p>' +
        (can('manage_va') ? '<a class="btn" href="#/vas/new">Add VA</a>' : 'An onboarder or admin can add the first VA.') + '</p></section>';
    }
    var statusOptions = '<option value="">All statuses</option>' + Labels.STATUSES.map(function (status) {
      return '<option>' + esc(status) + '</option>';
    }).join('');
    var batchOptions = '<option value="">All batches</option>' + batches.map(function (batch) {
      return '<option value="' + esc(batch.id) + '">' + esc(batch.name) + '</option>';
    }).join('');
    var body = rows.map(function (va) {
      var search = (va.fullName + ' ' + va.clientName + ' ' + va.businessName + ' ' + va.batchName).toLowerCase();
      return '<tr data-va-row data-search="' + esc(search) + '" data-status="' + esc(va.status) + '" data-batch="' + esc(va.batchId) + '">' +
        '<td><a class="name-link" href="#/vas/' + esc(va.id) + '">' + esc(va.fullName) + '</a></td>' +
        '<td>' + esc(va.clientName || '—') + '</td><td>' + esc(va.businessName || '—') + '</td>' +
        '<td>' + esc(va.batchName || '—') + '</td><td>' + badge(va.status) + '</td>' +
        '<td>' + esc(va.onboarderName || '—') + '</td><td>' + esc(Dates.formatLong(va.onboardingStart)) + '</td></tr>';
    }).join('');
    return head + '<div class="card"><div class="fields">' +
      '<div><label for="va-search">Search</label><input id="va-search" type="search" placeholder="Name, client, or business"></div>' +
      '<div><label for="va-status">Status</label><select id="va-status">' + statusOptions + '</select></div>' +
      '<div class="wide"><label for="va-batch">Batch</label><select id="va-batch">' + batchOptions + '</select></div></div>' +
      '<p id="filter-empty" class="hint" hidden>No VAs match.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Client</th><th>Business</th><th>Batch</th><th>Status</th><th>Onboarder</th><th>Started</th></tr></thead><tbody>' +
      body + '</tbody></table></div></div>';
  }

  function vaForm(va, batches) {
    var editing = !!va;
    if (!can('manage_va')) {
      return '<h1 id="page-title">Add VA</h1><p class="lede">Your role cannot add or edit a VA.</p>';
    }
    var batchChoices = '<option value="">Choose a batch</option>' + batches.map(function (batch) {
      return '<option value="' + esc(batch.id) + '"' + (va && va.batchId === batch.id ? ' selected' : '') + '>' + esc(batch.name) + '</option>';
    }).join('');
    var statuses = (editing ? [va.status].concat(Labels.CREATE_STATUSES.filter(function (status) { return status !== va.status; })) : Labels.CREATE_STATUSES);
    var statusField = editing
      ? '<p>' + badge(va.status) + '</p><p class="hint">Change Ready for endorsement and Endorsed from the monitoring page. Other statuses can be set there too.</p>'
      : '<label for="status">Status</label><select id="status" name="status">' + statuses.map(function (status) {
        return '<option' + (status === 'Onboarding' ? ' selected' : '') + '>' + esc(status) + '</option>';
      }).join('') + '</select>';
    return '<div class="page-head"><h1 id="page-title">' + (editing ? 'Edit profile' : 'Add VA') + '</h1>' +
      '<p class="lede">Add someone after training is complete. The name opens their monitoring page.</p></div>' +
      '<form class="card stack" data-form="' + (editing ? 'edit-va' : 'create-va') + '" data-id="' + esc(editing ? va.id : '') + '">' +
      '<div class="fields">' +
      '<div class="wide"><label for="fullName">Complete name</label><input id="fullName" name="fullName" required value="' + esc(editing ? va.fullName : '') + '"></div>' +
      '<div><label for="onboardingStart">Onboarding start date</label><input id="onboardingStart" name="onboardingStart" type="date" required value="' + esc(editing ? va.onboardingStart : Dates.todayISO()) + '"></div>' +
      '<div><label for="onboarderName">Onboarder</label><input id="onboarderName" name="onboarderName" value="' + esc(editing ? va.onboarderName : '') + '"></div>' +
      '<div><label for="clientName">Assigned client</label><input id="clientName" name="clientName" value="' + esc(editing ? va.clientName : '') + '"></div>' +
      '<div><label for="businessName">Business name</label><input id="businessName" name="businessName" value="' + esc(editing ? va.businessName : '') + '"></div>' +
      '<div class="wide"><label for="sop">SOP or portfolio</label><textarea id="sop" name="sopOrPortfolio" placeholder="A link or a short note">' + esc(editing ? va.sopOrPortfolio : '') + '</textarea></div>' +
      '<div><label for="schedule">Schedule</label><input id="schedule" name="schedule" placeholder="Mon–Fri, 9:00–18:00" value="' + esc(editing ? va.schedule : '') + '"></div>' +
      '<div>' + (editing ? statusField : statusField) + '</div>' +
      '<div><label for="batchId">Batch</label><select id="batchId" name="batchId">' + batchChoices + '</select></div>' +
      '<div><label for="newBatch">New batch name</label><input id="newBatch" name="newBatch" placeholder="Leave blank to use the batch above"></div>' +
      '</div><div class="row-actions"><button class="btn" type="submit">' + (editing ? 'Save profile' : 'Save VA') + '</button>' +
      '<a class="btn ghost" href="' + (editing ? '#/vas/' + esc(va.id) : '#/vas') + '">Cancel</a></div></form>';
  }

  function selectedWeek(va, route) {
    var found = va.evaluations.find(function (ev) { return ev.weekStart === route.week; });
    if (found) return found;
    return va.evaluations.find(function (ev) { return ev.status === 'open'; }) || va.evaluations[va.evaluations.length - 1] || null;
  }

  function scoreCard(ev) {
    var score = ev && ev.score;
    if (!score) {
      return '<section class="card"><h2>Weekly score</h2><p class="hint">Save at least one section to preview the score.</p></section>';
    }
    var rows = (score.breakdown || []).map(function (row) {
      return '<tr><td>' + esc(row.label) + '</td><td>' + (row.score == null ? 'Not entered' : formatScore(row.score)) + '</td>' +
        '<td>' + esc(Score.formatWeight(row.configuredWeight)) + '%</td><td>' + (row.included ? esc(Score.formatWeight(row.effectiveWeight)) + '%' : '—') + '</td>' +
        '<td>' + (row.included ? formatScore(row.contribution) : '—') + '</td></tr>';
    }).join('');
    var verdict = score.overall == null ? 'Not enough entries yet' : (score.passed ? 'Meets the pass mark' : 'Below the pass mark');
    var kind = score.overall == null ? '' : (score.passed ? 'ok' : 'warn');
    return '<section class="card"><p class="hint">' + (ev.status === 'closed' ? 'Recorded score' : 'Score preview') + '</p>' +
      '<p class="score-num">' + (score.overall == null ? '—' : formatScore(score.overall)) + '</p>' +
      '<p><span class="badge ' + kind + '">' + esc(verdict) + '</span></p>' +
      '<p class="formula">' + esc(Score.describeScore(score)) + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Section</th><th>Score</th><th>Weight</th><th>Effective</th><th>Points</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><p class="hint">A blank section is left out and the other weights are scaled to 100%. A zero stays in the formula. Coaching is not scored.</p></section>';
  }

  function locked(open) { return open ? '' : ' disabled'; }

  function monitoring(va, batches, route) {
    var ev = selectedWeek(va, route);
    var open = !!(ev && ev.status === 'open');
    var weeks = va.evaluations.map(function (item) {
      var label = Dates.formatLong(item.weekStart) + (item.status === 'open' ? ' · Open' : ' · Closed');
      return '<option value="' + esc(item.weekStart) + '"' + (ev && item.id === ev.id ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    var weekBar = va.evaluations.length
      ? '<label for="week-pick">Week</label><select id="week-pick" data-va="' + esc(va.id) + '">' + weeks + '</select>'
      : '';
    var start = '';
    if (can('evaluations') && !va.evaluations.some(function (item) { return item.status === 'open'; })) {
      if (!va.evaluations.length) {
        start = '<form data-form="start-week" data-va="' + esc(va.id) + '" class="card"><h2>Start weekly evaluation</h2>' +
          '<p class="hint" id="week-hint">Weeks start on Monday.</p><div class="row-actions">' +
          '<input id="week-start" name="weekStart" type="date" value="' + esc(Dates.mondayOf(Dates.todayISO())) + '" required aria-describedby="week-hint">' +
          '<button class="btn" type="submit">Start weekly evaluation</button></div></form>';
      }
    }
    var sections = ev ? attendanceCard(va, ev, open) + qaCard(ev, open) + wbrCard(ev, open) + competencyCard(ev, open) : '';
    var manual = manualStatus(va);
    return '<div class="page-head"><p><a href="#/vas">All VAs</a></p><div class="identity"><h1 id="page-title">' + esc(va.fullName) + '</h1>' + badge(va.status) + '</div>' +
      '<p class="lede">' + esc([va.clientName, va.businessName, va.batchName].filter(Boolean).join(' · ') || 'No client yet') +
      (va.schedule ? ' · ' + esc(va.schedule) : '') + '</p>' +
      '<p class="hint">' + roleNote() + ' Onboarders can update every VA, not only the ones they onboard.</p>' +
      '<div class="row-actions">' + (can('manage_va') ? '<a class="btn secondary small" href="#/vas/' + esc(va.id) + '/edit">Edit profile</a>' : '') +
      weekBar + '</div></div>' +
      '<div class="detail"><div>' + profileFacts(va) + start + sections + coachingCard(va) + historyCard(va) + '</div>' +
      '<aside class="side">' + (ev ? scoreCard(ev) : '') + closeCard(va, ev) + manual + '</aside></div>';
  }

  function profileFacts(va) {
    return '<section class="card"><h2>Profile</h2><div class="fields">' +
      '<div><p class="hint">Onboarder</p><p>' + esc(va.onboarderName || '—') + '</p></div>' +
      '<div><p class="hint">Started</p><p>' + esc(Dates.formatLong(va.onboardingStart)) + '</p></div>' +
      '<div class="wide"><p class="hint">SOP or portfolio</p><p>' + linkOrText(va.sopOrPortfolio, 'No SOP or portfolio yet') + '</p></div>' +
      (va.status === 'Endorsed' ? '<div class="wide"><p class="hint">Endorsed</p><p>' + esc(va.endorsedByName || 'Admin') + ' · ' + esc(va.endorsedAt ? new Date(va.endorsedAt).toLocaleString() : '') + '</p></div>' : '') +
      '</div></section>';
  }

  function attendanceCard(va, ev, open) {
    var byDate = {};
    va.attendance.forEach(function (row) { byDate[row.workDate] = row; });
    var days = '';
    for (var i = 0; i < 7; i++) {
      var date = Dates.addDays(ev.weekStart, i);
      var row = byDate[date];
      var absent = !!(row && row.absent);
      var pct = row ? formatScore(Score.dailyAttendancePercent(row)) + '%' : 'Not recorded';
      days += '<form data-form="attendance" data-date="' + esc(date) + '" data-va="' + esc(va.id) + '" class="day" data-day>' +
        '<div class="day-label"><strong>' + esc(Dates.formatWeekday(date)) + '</strong><span>' + esc(Dates.formatLong(date)) + '</span><span data-daily>' + esc(pct) + '</span></div>' +
        '<label class="check"><input type="checkbox" name="absent"' + (absent ? ' checked' : '') + locked(open && can('attendance')) + '> Absent</label>' +
        '<div><label for="late-' + date + '">Late minutes</label><input id="late-' + date + '" name="lateMinutes" type="number" min="0" step="1" value="' + (row && !absent ? esc(row.lateMinutes) : '') + '"' + ((absent || !open || !can('attendance')) ? ' disabled' : '') + '></div>' +
        '<div><label for="down-' + date + '">Downtime minutes</label><input id="down-' + date + '" name="downtimeMinutes" type="number" min="0" step="1" value="' + (row && !absent ? esc(row.downtimeMinutes) : '') + '"' + ((absent || !open || !can('attendance')) ? ' disabled' : '') + '></div>' +
        '<div class="row-actions">' + (open && can('attendance') ? '<button class="btn small" type="submit">Save day</button>' : '') +
        (row && open && can('attendance') ? '<button class="btn ghost small" type="button" data-action="remove-day" data-id="' + esc(row.id) + '">Remove</button>' : '') +
        '</div></form>';
    }
    var saved = va.attendance.filter(function (row) {
      return row.workDate >= ev.weekStart && row.workDate <= ev.weekEnd;
    });
    var avg = Score.weeklyAttendance(saved.map(function (row) { return Score.dailyAttendancePercent(row); }));
    return '<section class="card"><h2>Daily attendance</h2>' +
      '<p class="hint">One record per work day. 8 hours with no late time and no downtime is 100%. A full-day absence is 0%. Weekly attendance is the average of saved days. This week: ' +
      (avg == null ? 'no days saved yet' : formatScore(avg) + '%') + '.</p>' + days + '</section>';
  }

  function qaCard(ev, open) {
    var qa = ev.qa || {};
    var edit = open && can('qa');
    return '<section class="card"><h2>Weekly QA</h2><p class="hint">Score from 0 to 100. The evaluation form and call recording are links.</p>' +
      '<form data-form="qa" data-evaluation="' + esc(ev.id) + '" class="fields">' +
      '<div><label for="qa-score">QA score</label><input id="qa-score" name="score" type="number" min="0" max="100" step="0.01" value="' + esc(qa.score == null ? '' : qa.score) + '"' + (edit ? '' : ' disabled') + '></div>' +
      '<div><label for="qa-form">Evaluation form link</label><input id="qa-form" name="formUrl" type="url" value="' + esc(qa.formUrl || '') + '"' + (edit ? '' : ' disabled') + '></div>' +
      '<div class="wide"><label for="qa-recording">Call recording link</label><input id="qa-recording" name="recordingUrl" type="url" value="' + esc(qa.recordingUrl || '') + '"' + (edit ? '' : ' disabled') + '></div>' +
      (edit ? '<div class="row-actions wide"><button class="btn small" type="submit">Save QA</button>' +
        (ev.qa ? '<button class="btn ghost small" type="button" data-action="clear-qa" data-evaluation="' + esc(ev.id) + '">Clear QA</button>' : '') + '</div>' : '') +
      '</form></section>';
  }

  function wbrCard(ev, open) {
    var wbr = ev.wbr || {};
    var edit = open && can('wbr');
    var rate = ev.wbr ? Score.conversionRate(wbr.totalLeads, wbr.convertedLeads) : null;
    return '<section class="card"><h2>Weekly WBR</h2><p class="hint">Conversion rate is converted leads ÷ total leads × 100, capped at 100. Total leads of 0 or blank is N/A and drops out of the score.</p>' +
      '<form data-form="wbr" data-evaluation="' + esc(ev.id) + '" class="fields">' +
      '<div><label for="total-leads">Total leads</label><input id="total-leads" name="totalLeads" type="number" min="0" step="1" value="' + esc(wbr.totalLeads == null ? '' : wbr.totalLeads) + '"' + (edit ? '' : ' disabled') + '></div>' +
      '<div><label for="converted-leads">Converted leads</label><input id="converted-leads" name="convertedLeads" type="number" min="0" step="1" value="' + esc(wbr.convertedLeads == null ? '' : wbr.convertedLeads) + '"' + (edit ? '' : ' disabled') + '></div>' +
      '<div class="wide"><p>Conversion rate: <strong data-conversion>' + (rate == null ? 'N/A' : formatScore(rate) + '%') + '</strong></p></div>' +
      (edit ? '<div class="row-actions wide"><button class="btn small" type="submit">Save WBR</button>' +
        (ev.wbr ? '<button class="btn ghost small" type="button" data-action="clear-wbr" data-evaluation="' + esc(ev.id) + '">Clear WBR</button>' : '') + '</div>' : '') +
      '</form></section>';
  }

  function competencyCard(ev, open) {
    var comp = ev.competencies || {};
    var edit = open && can('competencies');
    var fields = [
      ['toolNavigation', 'toolNavigationComment', 'Tool navigation'],
      ['communication', 'communicationComment', 'Communication'],
      ['criticalThinking', 'criticalThinkingComment', 'Critical thinking'],
      ['coreValues', 'coreValuesComment', 'Core values']
    ];
    var html = fields.map(function (field) {
      return '<div><label for="' + field[0] + '">' + field[2] + '</label><input id="' + field[0] + '" name="' + field[0] + '" type="number" min="0" max="100" step="0.01" value="' +
        esc(comp[field[0]] == null ? '' : comp[field[0]]) + '"' + (edit ? '' : ' disabled') + '></div>' +
        '<div><label for="' + field[1] + '">' + field[2] + ' comment</label><textarea id="' + field[1] + '" name="' + field[1] + '"' + (edit ? '' : ' disabled') + '>' +
        esc(comp[field[1]] || '') + '</textarea></div>';
    }).join('');
    return '<section class="card"><h2>Competencies</h2><p class="hint">Entered by an onboarder. Each score is 0 to 100 and has its own comment.</p>' +
      '<form data-form="competencies" data-evaluation="' + esc(ev.id) + '" class="fields">' + html +
      (edit ? '<div class="row-actions wide"><button class="btn small" type="submit">Save competencies</button>' +
        (ev.competencies ? '<button class="btn ghost small" type="button" data-action="clear-competencies" data-evaluation="' + esc(ev.id) + '">Clear competencies</button>' : '') + '</div>' : '') +
      '</form></section>';
  }

  function coachingCard(va) {
    var edit = can('coaching');
    var items = va.coaching.map(function (item) {
      return '<li><strong>' + esc(Dates.formatLong(item.sessionDate)) + '</strong> · ' + esc(item.topic) +
        '<div class="hint">Discussion</div><p class="pre">' + esc(item.discussion) + '</p>' +
        '<div class="hint">Action</div><p class="pre">' + esc(item.action) + '</p>' +
        (edit ? '<button class="btn ghost small" type="button" data-action="remove-coaching" data-id="' + esc(item.id) + '">Remove</button>' : '') +
        '</li>';
    }).join('');
    var form = edit
      ? '<form data-form="coaching" data-va="' + esc(va.id) + '" class="fields">' +
        '<div><label for="coach-date">Date</label><input id="coach-date" name="sessionDate" type="date" required value="' + esc(Dates.todayISO()) + '"></div>' +
        '<div><label for="coach-topic">Topic</label><input id="coach-topic" name="topic" required></div>' +
        '<div class="wide"><label for="coach-discussion">Discussion</label><textarea id="coach-discussion" name="discussion" required></textarea></div>' +
        '<div class="wide"><label for="coach-action">Action</label><textarea id="coach-action" name="action" required></textarea></div>' +
        '<div class="wide"><button class="btn small" type="submit">Add coaching session</button></div></form>'
      : '';
    return '<section class="card"><h2>Coaching history</h2><p class="hint">Date, topic, discussion, and action. This history is not part of the weekly score.</p>' +
      (items ? '<ul class="timeline">' + items + '</ul>' : '<p class="hint">No coaching sessions yet.</p>') + form + '</section>';
  }

  function historyCard(va) {
    if (!va.history.length) return '<section class="card"><h2>Status history</h2><p class="hint">No status changes yet.</p></section>';
    var items = va.history.map(function (item) {
      var change = item.previousStatus ? esc(item.previousStatus) + ' → ' + esc(item.newStatus) : esc(item.newStatus);
      return '<li><strong>' + change + '</strong><div class="hint">' + esc(item.changedByName || 'Unknown user') +
        (item.changedAt ? ' · ' + esc(new Date(item.changedAt).toLocaleString()) : '') +
        (item.note ? ' · ' + esc(item.note) : '') + '</div></li>';
    }).join('');
    return '<section class="card"><h2>Status history</h2><ul class="timeline">' + items + '</ul></section>';
  }

  function closeCard(va, ev) {
    if (!ev) return '';
    var score = ev.score;
    if (ev.status === 'closed') {
      var next = '';
      var latest = va.evaluations[va.evaluations.length - 1];
      var hasOpen = va.evaluations.some(function (item) { return item.status === 'open'; });
      if (can('evaluations') && latest && latest.id === ev.id && !hasOpen) {
        next = '<button class="btn" type="button" data-action="next-week" data-va="' + esc(va.id) + '">Next weekly evaluation</button>';
      }
      var gaps = ev.outcome === 'continue_onboarding'
        ? '<p><b>Gaps.</b> ' + esc(ev.gaps || '—') + '</p><p><b>Coaching actions.</b> ' + esc(ev.coachingActions || '—') + '</p>'
        : '';
      var endorse = '';
      if (va.status === 'Ready for endorsement') {
        if (can('endorse')) {
          endorse = askEndorse
            ? '<p>This records your name and the time, and sets the status to Endorsed.</p><div class="row-actions"><button class="btn" type="button" data-action="endorse" data-va="' + esc(va.id) + '">Confirm endorsement</button><button class="btn ghost" type="button" data-action="endorse-cancel">Cancel</button></div>'
            : '<button class="btn" type="button" data-action="endorse-ask">Endorse VA</button>';
        } else {
          endorse = '<p class="hint">An admin endorses this VA. That step records who did it and when.</p>';
        }
      }
      return '<section class="card"><h2>Week closed</h2><p>' + (ev.outcome === 'ready_for_endorsement' ? 'Ready for endorsement' : 'Continue onboarding') + '</p>' + gaps + next + endorse + '</section>';
    }
    if (!can('evaluations')) return '<section class="card"><h2>Close week</h2><p class="hint">An onboarder or admin closes the week.</p></section>';
    if (!score || score.overall == null) {
      return '<section class="card"><h2>Close week</h2><p class="hint">Enter at least one scored section before closing this week.</p></section>';
    }
    if (score.passed) {
      return '<section class="card"><h2>Close week</h2><p>' + formatScore(score.overall) + ' meets the pass mark of ' + esc(Score.formatWeight(score.passMark)) + '.</p>' +
        '<p class="hint">Closing sets the status to Ready for endorsement. Endorsement is a separate step.</p>' +
        '<form data-form="close" data-evaluation="' + esc(ev.id) + '"><button class="btn" type="submit">Close week</button></form></section>';
    }
    return '<section class="card"><h2>Close week</h2><p>' + formatScore(score.overall) + ' is below the pass mark of ' + esc(Score.formatWeight(score.passMark)) + '.</p>' +
      '<p class="hint">Record the gaps and the coaching actions before this week can close. The status becomes Continue onboarding.</p>' +
      '<form data-form="close" data-evaluation="' + esc(ev.id) + '" data-need-gaps="yes" class="stack">' +
      '<div><label for="gaps">Gaps</label><textarea id="gaps" name="gaps" required></textarea></div>' +
      '<div><label for="coaching-actions">Coaching actions</label><textarea id="coaching-actions" name="coachingActions" required></textarea></div>' +
      '<button class="btn" type="submit" disabled>Close week</button></form></section>';
  }

  function manualStatus(va) {
    if (!can('manage_va')) return '';
    var allowed = Store.current().role === 'admin' ? window.CNRModel.MANUAL_ADMIN : window.CNRModel.MANUAL_ONBOARDER;
    var options = allowed.slice();
    if (options.indexOf(va.status) === -1) options.unshift(va.status);
    return '<section class="card"><h2>Other status</h2><p class="hint">Resigned and EOC sit alongside the weekly result. Endorsed is only available from the Endorse button.</p>' +
      '<form data-form="manual-status" data-va="' + esc(va.id) + '" class="stack"><label for="manual-status">Status</label><select id="manual-status" name="status">' +
      options.map(function (status) {
        return '<option' + (status === va.status ? ' selected' : '') + '>' + esc(status) + '</option>';
      }).join('') + '</select><button class="btn secondary" type="submit">Update status</button></form></section>';
  }

  function batchesPage(batches, counts) {
    var rows = batches.map(function (batch) {
      var count = counts[batch.id] || 0;
      return '<tr><td><label class="sr" for="batch-' + esc(batch.id) + '">Batch name</label>' +
        '<input id="batch-' + esc(batch.id) + '" data-batch-name="' + esc(batch.id) + '" data-original="' + esc(batch.name) + '" value="' + esc(batch.name) + '"' +
        (can('batches') ? '' : ' disabled') + '></td><td class="id" title="' + esc(batch.id) + '">' + esc(String(batch.id).slice(0, 8)) + '</td><td>' + count + '</td></tr>';
    }).join('');
    var empty = batches.length ? '' : '<p class="hint">No batches yet. Add one here, or create it while adding a VA.</p>';
    return '<div class="page-head"><h1 id="page-title">Batches</h1><p class="lede">Names can change. The id on each VA stays the same, and the new name shows everywhere.</p></div>' +
      (can('batches') ? '<form data-form="add-batch" class="card row-actions"><label class="sr" for="batch-new">New batch</label><input id="batch-new" name="name" placeholder="New batch name" required><button class="btn" type="submit">Add batch</button></form>' : '') +
      '<section class="card">' + empty + '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Id</th><th>VAs</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></section>';
  }

  function settingsPage(settings, users) {
    var edit = can('settings');
    var weights = Score.SECTION_KEYS.map(function (key) {
      return '<div><label for="weight-' + key + '">' + esc(Score.SECTION_LABELS[key]) + '</label>' +
        '<input id="weight-' + key + '" data-weight="' + key + '" name="' + key + '" type="number" min="0" step="0.1" value="' + esc(settings.weights[key]) + '"' + (edit ? '' : ' disabled') + '></div>';
    }).join('');
    var userRows = '';
    if (can('users')) {
      userRows = '<section class="card"><h2>People and roles</h2><p class="hint">Admin can change settings, roles, and endorsement. Onboarder edits every VA. QA edits QA scores and links. Viewer can read. The database enforces this, not only the screen. The last admin cannot be removed.</p>' +
        users.map(function (user) {
          return '<form data-form="role" data-user="' + esc(user.id) + '" class="row-actions"><span>' + esc(user.name || user.email) + ' · ' + esc(user.email) + '</span>' +
            '<label class="sr" for="role-' + esc(user.id) + '">Role</label><select id="role-' + esc(user.id) + '" name="role">' +
            Labels.ROLES.map(function (role) {
              return '<option value="' + role.id + '"' + (role.id === user.role ? ' selected' : '') + '>' + role.label + '</option>';
            }).join('') + '</select><button class="btn secondary small" type="submit">Update role</button></form>';
        }).join('') + '</section>';
    }
    var mockReset = Store.mode() === 'mock'
      ? '<section class="card"><h2>Local preview</h2><button class="btn secondary" type="button" data-action="reset-mock">Clear preview data</button></section>'
      : '';
    return '<div class="page-head"><h1 id="page-title">Settings</h1><p class="lede">Weights must sum to 100. A week with a blank section scales the remaining weights up to 100%.</p></div>' +
      '<form class="card" id="settings-form" data-form="settings"><h2>KPI</h2><div class="fields"><div><label for="pass-mark">Pass mark</label>' +
      '<input id="pass-mark" name="passMark" type="number" min="0" max="100" step="0.01" value="' + esc(settings.passMark) + '"' + (edit ? '' : ' disabled') + '></div>' +
      weights + '</div><p id="weight-sum" class="hint"></p>' +
      (edit ? '<button class="btn" id="save-settings" type="submit">Save settings</button>' : '<p class="hint">Only an admin can change weights, the pass mark, and roles.</p>') +
      '</form>' + userRows + mockReset;
  }

  function showError(message) {
    var el = document.getElementById('form-error');
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.focus();
  }

  async function run(work) {
    if (busy) return;
    busy = true;
    var hash = location.hash;
    try {
      await work();
      if (location.hash === hash) await render();
    } catch (err) {
      showError(err.message || 'Something went wrong.');
    } finally {
      busy = false;
    }
  }

  function formData(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'submit') return;
      data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
  }

  async function onSubmit(event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    var kind = form.getAttribute('data-form');
    if (!kind) return;
    event.preventDefault();
    var data = formData(form);
    if (kind === 'sign-in') {
      lastEmail = data.email;
      loginError = '';
      try {
        await Store.signIn(data.email, data.password);
        if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/vas';
        await render();
      } catch (err) {
        loginError = err.message;
        draw(loginView());
      }
      return;
    }
    await run(async function () {
      if (kind === 'create-va' || kind === 'edit-va') {
        var batchId = data.batchId;
        if (data.newBatch && data.newBatch.trim()) {
          var created = await Store.createBatch(data.newBatch.trim());
          batchId = created.id;
        }
        var payload = {
          id: form.getAttribute('data-id'),
          fullName: data.fullName,
          onboardingStart: data.onboardingStart,
          onboarderName: data.onboarderName,
          clientName: data.clientName,
          businessName: data.businessName,
          sopOrPortfolio: data.sopOrPortfolio,
          schedule: data.schedule,
          status: data.status || 'Onboarding',
          batchId: batchId
        };
        var saved = kind === 'edit-va' ? await Store.updateVa(payload) : await Store.createVa(payload);
        flash = kind === 'edit-va' ? 'Profile saved.' : 'VA added to the monitoring sheet.';
        location.hash = '#/vas/' + (payload.id || saved.id);
      } else if (kind === 'attendance') {
        await Store.saveAttendance({
          vaId: form.getAttribute('data-va'),
          workDate: form.getAttribute('data-date'),
          absent: data.absent,
          lateMinutes: data.lateMinutes,
          downtimeMinutes: data.downtimeMinutes
        });
        flash = 'Attendance saved.';
      } else if (kind === 'qa') {
        await Store.saveQa({
          evaluationId: form.getAttribute('data-evaluation'),
          score: data.score,
          formUrl: data.formUrl,
          recordingUrl: data.recordingUrl
        });
        flash = 'QA saved.';
      } else if (kind === 'wbr') {
        await Store.saveWbr({
          evaluationId: form.getAttribute('data-evaluation'),
          totalLeads: data.totalLeads,
          convertedLeads: data.convertedLeads
        });
        flash = 'WBR saved.';
      } else if (kind === 'competencies') {
        await Store.saveCompetencies(Object.assign({ evaluationId: form.getAttribute('data-evaluation') }, data));
        flash = 'Competencies saved.';
      } else if (kind === 'coaching') {
        await Store.addCoaching(Object.assign({ vaId: form.getAttribute('data-va') }, data));
        flash = 'Coaching session saved. It is not part of the score.';
      } else if (kind === 'close') {
        if (form.getAttribute('data-need-gaps') === 'yes' && (!data.gaps.trim() || !data.coachingActions.trim())) {
          throw new Error('Gaps and coaching actions are required when the score is below the pass mark.');
        }
        var closed = await Store.closeEvaluation(form.getAttribute('data-evaluation'), data.gaps || '', data.coachingActions || '');
        flash = closed.vaStatus === 'Ready for endorsement'
          ? 'Week closed. Status is Ready for endorsement. Endorsement is a separate step.'
          : closed.vaStatus === 'Continue onboarding'
            ? 'Week closed. Status is Continue onboarding.'
            : 'Week closed. The VA status was left as ' + closed.vaStatus + '.';
      } else if (kind === 'start-week') {
        var monday = Dates.mondayOf(data.weekStart);
        var started = await Store.startEvaluation(form.getAttribute('data-va'), monday);
        flash = 'Opened the week of ' + Dates.formatLong(started.weekStart || monday) + '.';
        location.hash = '#/vas/' + form.getAttribute('data-va') + '?week=' + (started.weekStart || monday);
      } else if (kind === 'manual-status') {
        await Store.setManualStatus(form.getAttribute('data-va'), data.status);
        flash = 'Status updated.';
      } else if (kind === 'add-batch') {
        await Store.createBatch(data.name);
        flash = 'Batch added.';
      } else if (kind === 'settings') {
        var weights = {};
        Score.SECTION_KEYS.forEach(function (key) { weights[key] = Number(data[key]); });
        if (!Score.weightsValid(weights)) throw new Error('Weights must sum to 100.');
        await Store.saveSettings({ passMark: Number(data.passMark), weights: weights });
        flash = 'Settings saved.';
      } else if (kind === 'role') {
        await Store.setUserRole(form.getAttribute('data-user'), data.role);
        flash = 'Role updated.';
      }
    });
  }

  async function onClick(event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
    if (action === 'theme') {
      localStorage.setItem(THEME_KEY, themeNow() === 'dark' ? 'light' : 'dark');
      applyTheme();
      await render();
      return;
    }
    if (action === 'sign-out') {
      await Store.signOut();
      askEndorse = false;
      await render();
      return;
    }
    if (action === 'endorse-ask') {
      askEndorse = true;
      await render();
      return;
    }
    if (action === 'endorse-cancel') {
      askEndorse = false;
      await render();
      return;
    }
    await run(async function () {
      if (action === 'remove-day') {
        await Store.deleteAttendance(button.getAttribute('data-id'));
        flash = 'Attendance day removed.';
      } else if (action === 'clear-qa') {
        await Store.deleteQa(button.getAttribute('data-evaluation'));
        flash = 'QA cleared. Its weight will be scaled out of this week.';
      } else if (action === 'clear-wbr') {
        await Store.deleteWbr(button.getAttribute('data-evaluation'));
        flash = 'WBR cleared.';
      } else if (action === 'clear-competencies') {
        await Store.deleteCompetencies(button.getAttribute('data-evaluation'));
        flash = 'Competencies cleared.';
      } else if (action === 'remove-coaching') {
        await Store.deleteCoaching(button.getAttribute('data-id'));
        flash = 'Coaching session removed.';
      } else if (action === 'next-week') {
        var opened = await Store.nextEvaluation(button.getAttribute('data-va'));
        flash = 'Next weekly evaluation is open.';
        location.hash = '#/vas/' + button.getAttribute('data-va') + '?week=' + opened.weekStart;
      } else if (action === 'endorse') {
        await Store.endorse(button.getAttribute('data-va'));
        askEndorse = false;
        flash = 'VA endorsed. The history records who endorsed them and when.';
      } else if (action === 'reset-mock') {
        Store.resetMock();
        flash = 'Local preview data cleared.';
        location.hash = '#/vas';
      }
    });
  }

  function onInput(event) {
    var day = event.target.closest('[data-day]');
    if (day) {
      var absent = day.querySelector('[name="absent"]').checked;
      var late = day.querySelector('[name="lateMinutes"]');
      var down = day.querySelector('[name="downtimeMinutes"]');
      if (day.querySelector('[type="submit"]')) {
        late.disabled = absent;
        down.disabled = absent;
      }
      var pct = Score.dailyAttendancePercent({
        absent: absent,
        lateMinutes: late.value,
        downtimeMinutes: down.value
      });
      day.querySelector('[data-daily]').textContent = formatScore(pct) + '%';
    }
    if (event.target.id === 'total-leads' || event.target.id === 'converted-leads') {
      var form = event.target.form;
      var rate = Score.conversionRate(form.totalLeads.value, form.convertedLeads.value);
      var slot = form.querySelector('[data-conversion]');
      if (slot) slot.textContent = rate == null ? 'N/A' : formatScore(rate) + '%';
    }
    if (event.target.name === 'gaps' || event.target.name === 'coachingActions') {
      var closeForm = event.target.form;
      if (closeForm && closeForm.getAttribute('data-need-gaps') === 'yes') {
        closeForm.querySelector('[type="submit"]').disabled = !closeForm.gaps.value.trim() || !closeForm.coachingActions.value.trim();
      }
    }
    if (event.target.hasAttribute('data-weight') || event.target.id === 'pass-mark') updateWeightSum();
    if (event.target.id === 'week-start') updateWeekHint();
    if (event.target.id === 'va-search') filterRows();
  }

  function onChange(event) {
    if (event.target.id === 'va-status' || event.target.id === 'va-batch') filterRows();
    if (event.target.id === 'week-pick') {
      var vaId = event.target.getAttribute('data-va');
      location.hash = '#/vas/' + vaId + '?week=' + event.target.value;
    }
    if (event.target.hasAttribute('data-batch-name')) {
      var input = event.target;
      var original = input.getAttribute('data-original');
      if (input.value.trim() === original) return;
      run(async function () {
        try {
          await Store.renameBatch(input.getAttribute('data-batch-name'), input.value);
          flash = 'Batch renamed. The id did not change.';
        } catch (err) {
          input.value = original;
          throw err;
        }
      });
    }
  }

  function updateWeekHint() {
    var input = document.getElementById('week-start');
    var hint = document.getElementById('week-hint');
    if (!input || !hint || !input.value) return;
    var monday = Dates.mondayOf(input.value);
    hint.textContent = monday === input.value
      ? 'Weeks start on Monday.'
      : 'Weeks start on Monday. This will open ' + Dates.formatLong(monday) + '.';
  }

  function updateWeightSum() {
    var slot = document.getElementById('weight-sum');
    if (!slot) return;
    var weights = {};
    var okNumbers = true;
    Score.SECTION_KEYS.forEach(function (key) {
      var input = document.getElementById('weight-' + key);
      var n = input ? Number(input.value) : NaN;
      weights[key] = n;
      if (!Number.isFinite(n) || n < 0) okNumbers = false;
    });
    var sum = Score.weightsSum(weights);
    var valid = okNumbers && Score.weightsValid(weights);
    var button = document.getElementById('save-settings');
    var pass = document.getElementById('pass-mark');
    var passOk = pass && pass.value !== '' && Number(pass.value) >= 0 && Number(pass.value) <= 100;
    if (!passOk) {
      slot.textContent = 'Pass mark must be between 0 and 100.';
      slot.className = 'error';
    } else if (!valid) {
      slot.textContent = 'Weights must sum to 100. They sum to ' + (Number.isFinite(sum) ? Math.round(sum * 100) / 100 : '—') + '.';
      slot.className = 'error';
    } else {
      slot.textContent = 'Weights sum to 100.';
      slot.className = 'hint';
    }
    if (button) button.disabled = !(valid && passOk);
  }

  function filterRows() {
    var q = (document.getElementById('va-search').value || '').toLowerCase();
    var status = document.getElementById('va-status').value;
    var batch = document.getElementById('va-batch').value;
    var visible = 0;
    document.querySelectorAll('[data-va-row]').forEach(function (row) {
      var show = (!q || row.getAttribute('data-search').indexOf(q) !== -1) &&
        (!status || row.getAttribute('data-status') === status) &&
        (!batch || row.getAttribute('data-batch') === batch);
      row.hidden = !show;
      if (show) visible += 1;
    });
    var empty = document.getElementById('filter-empty');
    if (empty) empty.hidden = visible !== 0;
  }

  var renderToken = 0;
  async function render() {
    var token = ++renderToken;
    applyTheme();
    if (!Store.current()) {
      document.title = 'Sign in — Create & Reach';
      draw(loginView());
      var email = document.getElementById('email');
      if (email) email.focus();
      return;
    }
    var route = parseRoute();
    if (route.name !== 'va') askEndorse = false;
    try {
      var html = '';
      if (route.name === 'vas') {
        var rows = await Store.listVas();
        var batches = await Store.listBatches();
        if (token !== renderToken) return;
        html = shell('Virtual assistants', vasList(rows, batches));
      } else if (route.name === 'va-form') {
        var existing = route.id ? await Store.getVa(route.id) : null;
        var formBatches = await Store.listBatches();
        if (token !== renderToken) return;
        html = shell(existing ? 'Edit profile' : 'Add VA', vaForm(existing, formBatches));
      } else if (route.name === 'va') {
        var va = await Store.getVa(route.id);
        var vaBatches = await Store.listBatches();
        if (token !== renderToken) return;
        html = shell(va.fullName, monitoring(va, vaBatches, route));
      } else if (route.name === 'batches') {
        var allBatches = await Store.listBatches();
        var allVas = await Store.listVas();
        var counts = {};
        allVas.forEach(function (va) { counts[va.batchId] = (counts[va.batchId] || 0) + 1; });
        if (token !== renderToken) return;
        html = shell('Batches', batchesPage(allBatches, counts));
      } else if (route.name === 'settings') {
        var settings = await Store.getSettings();
        var users = can('users') ? await Store.listUsers() : [];
        if (token !== renderToken) return;
        html = shell('Settings', settingsPage(settings, users));
      }
      draw(html);
      updateWeightSum();
      updateWeekHint();
    } catch (err) {
      if (token !== renderToken) return;
      draw(shell('Problem', '<h1 id="page-title">Something went wrong</h1><p class="lede">' + esc(err.message) + '</p>'));
    }
  }

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('mock') === '1') sessionStorage.setItem('cnr-mock', '1');
    applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme();
        render();
      }
    });
    document.body.addEventListener('submit', onSubmit);
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('input', onInput);
    document.body.addEventListener('change', onChange);
    window.addEventListener('hashchange', render);
    Store.restore().then(render).catch(function (err) {
      document.getElementById('app').innerHTML = '<main class="wrap"><h1>Cannot open the app</h1><p>' + esc(err.message) + '</p></main>';
    });
  }

  boot();
})();
