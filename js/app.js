// Top navigation for the restored palette, wired to the current store.
(function () {
  var MENUS = [
    {
      id: 'onboarding',
      label: 'Onboarding',
      icon: 'board',
      items: [
        ['dash', 'Board', '#/board'],
        ['bat', 'Batches', '#/batches']
      ]
    }
  ];
  var ICONS = {
    board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.2-3.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
    moon: '<path d="M20 14.8A8.2 8.2 0 1 1 9.2 4 6.4 6.4 0 0 0 20 14.8z"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    collapse: '<path d="M5 8h14M5 12h14M8 16h8"/>',
    expand: '<path d="M5 7h14M5 12h14M5 17h14"/>'
  };
  var CARDS = [
    ['attendance', 'Attendance'],
    ['qa', 'QA score'],
    ['wbr', 'WBR'],
    ['tool', 'Tool navigation'],
    ['critical', 'Critical thinking'],
    ['communication', 'Communication'],
    ['values', 'Core values'],
    ['feedback', 'Feedback sessions']
  ];
  var COMP_BY_FOCUS = {
    tool: ['toolNavigation', 'toolNavigationComment', 'Tool navigation'],
    critical: ['criticalThinking', 'criticalThinkingComment', 'Critical thinking'],
    communication: ['communication', 'communicationComment', 'Communication'],
    values: ['coreValues', 'coreValuesComment', 'Core values']
  };
  var LEGACY_FOCUS = {
    attendance: 'attendance',
    qa: 'qa',
    wbr: 'wbr',
    competencies: 'tool',
    coaching: 'feedback',
    history: 'history'
  };
  var CSV_HEADERS = ['full_name', 'onboarding_start', 'onboarder_name', 'client_name', 'business_name', 'schedule', 'status', 'batch', 'sop_or_portfolio'];
  var COMPS = [
    ['toolNavigation', 'toolNavigationComment', 'Tool navigation'],
    ['communication', 'communicationComment', 'Communication'],
    ['criticalThinking', 'criticalThinkingComment', 'Critical thinking'],
    ['coreValues', 'coreValuesComment', 'Core values']
  ];

  var BOARD_GROUPS = [
    { id: 'roster', label: 'On the Roster' },
    { id: 'batches', label: 'Number of Batches', href: '#/batches' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'endorsed', label: 'Endorsed to Operations' },
    { id: 'resigned', label: 'Resigned/Terminated' }
  ];
  var state = { flash: '', error: '', keepFlash: false, status: 'All', dirQuery: '', boardFilter: 'onboarding', renaming: '', renameError: '', renameDraft: '' };
  var cache = { vas: [] };
  var renderSeq = 0;
  var listening = false;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function me() { return CNRStore.current(); }

  function can(action) {
    var user = me();
    return !!(user && CNRPermissions.can(user.role, action));
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }

  function points(value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    return (Math.round(Number(value) * 100) / 100).toFixed(2);
  }

  function pct(value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    return (Math.round(Number(value) * 10) / 10).toFixed(1) + '%';
  }

  function field(value) {
    return value == null ? '' : String(value);
  }

  function badge(status) {
    var cls = 'b';
    if (status === 'Endorsed' || status === 'Ready for endorsement') cls += ' ok';
    else if (status === 'Continue onboarding') cls += ' wn';
    else if (status === 'Resigned' || status === 'EOC') cls += ' bad';
    return '<span class="' + cls + '">' + esc(status || '—') + '</span>';
  }

  function outcomeLabel(outcome) {
    if (outcome === 'ready_for_endorsement') return 'Ready for endorsement';
    if (outcome === 'continue_onboarding') return 'Continue onboarding';
    return outcome || '—';
  }

  function banner() {
    return '<p id="flash" class="note">' + esc(state.flash) + '</p><p id="page-error" class="rename-err">' + esc(state.error) + '</p>';
  }

  function readRoute() {
    var raw = location.hash || '#/board';
    var q = raw.indexOf('?');
    var path = (q === -1 ? raw : raw.slice(0, q)).replace(/^#\/?/, '');
    var params = new URLSearchParams(q === -1 ? '' : raw.slice(q + 1));
    var segs = path.split('/').filter(Boolean);
    var routes = { board: 'dash', batches: 'bat', settings: 'set' };
    var retired = { attendance: 1, coaching: 1, reports: 1, training: 1, 'reports-training': 1, qa: 1 };
    if (segs[0] === 'vas' && segs[1]) {
      var focus = params.get('focus') || LEGACY_FOCUS[params.get('tab') || ''] || '';
      return {
        key: 'prof',
        vaId: decodeURIComponent(segs[1]),
        focus: focus,
        week: params.get('week') || ''
      };
    }
    if (segs[0] === 'vas' || retired[segs[0]]) return { key: 'board-redirect', vaId: '', focus: '', week: '' };
    return { key: routes[segs[0]] || 'dash', vaId: '', focus: '', week: '' };
  }

  function profileHash(id, focus, week) {
    var hash = '#/vas/' + encodeURIComponent(id);
    var parts = [];
    if (focus) parts.push('focus=' + encodeURIComponent(focus));
    if (week) parts.push('week=' + encodeURIComponent(week));
    if (parts.length) hash += '?' + parts.join('&');
    return hash;
  }

  function navigate(hash, flash) {
    state.flash = flash || '';
    state.error = '';
    state.keepFlash = !!flash;
    if ((location.hash || '#/board') === hash) render();
    else location.hash = hash;
  }

  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('cnr_theme', theme);
      localStorage.setItem('cnr-theme', theme);
    } catch (err) { /* private mode */ }
    var btn = document.getElementById('theme-btn');
    if (!btn) return;
    var dark = theme === 'dark';
    btn.innerHTML = dark ? icon('sun') : icon('moon');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = btn.getAttribute('aria-label');
  }

  function storedNavMode() {
    try { return localStorage.getItem('cnr-nav') === 'compact' ? 'compact' : 'full'; }
    catch (err) { return 'full'; }
  }

  function applyNavMode(mode) {
    var nav = document.getElementById('nav');
    if (!nav) return;
    var compact = mode === 'compact';
    nav.dataset.compact = compact ? '1' : '0';
    var btn = document.getElementById('nav-compact');
    if (btn) {
      btn.setAttribute('aria-pressed', compact ? 'true' : 'false');
      btn.setAttribute('aria-label', compact ? 'Expand navigation' : 'Minimize navigation');
      btn.title = btn.getAttribute('aria-label');
      btn.innerHTML = compact ? icon('expand') : icon('collapse');
    }
    try { localStorage.setItem('cnr-nav', compact ? 'compact' : 'full'); }
    catch (err) { /* private mode */ }
  }

  function menuHtml(menu) {
    var items = menu.items.map(function (item) {
      return '<a href="' + item[2] + '" data-nav="' + item[0] + '">' + esc(item[1]) + '</a>';
    }).join('');
    return '<div class="menu" data-menu="' + menu.id + '"><button type="button" class="nav-btn" data-menu-btn="' + menu.id + '" aria-haspopup="true" aria-expanded="false">'
      + icon(menu.icon) + '<span class="nav-label">' + esc(menu.label) + '</span>' + icon('caret', 'caret')
      + '</button><div class="menu-panel" role="menu">' + items + '</div></div>';
  }

  function shell(user) {
    var preview = CNRStore.mode() === 'mock' ? '<p class="menu-note">Preview in this browser</p>' : '';
    return ''
      + '<header id="nav" data-compact="0"><a class="brand" href="#/board"><img src="logo.png" alt="">'
      + '<span class="brand-name">Create &amp; Reach<small>Onboarding QA</small></span></a>'
      + '<nav class="nav-links" aria-label="Main">' + MENUS.map(menuHtml).join('') + '</nav>'
      + '<div class="nav-tools"><button type="button" class="sbtn" id="open-pal" aria-label="Search VAs">' + icon('search')
      + '<span class="nav-label">Search</span><kbd>/</kbd></button>'
      + '<button type="button" class="icon-btn" id="theme-btn" aria-label="Switch to dark mode"></button>'
      + '<div class="menu user" data-menu="user"><button type="button" class="nav-btn" id="user-menu" data-menu-btn="user" aria-haspopup="true" aria-expanded="false">'
      + '<span class="av s">' + esc(initials(user.name)) + '</span><span class="user-meta"><span class="user-name">' + esc(user.name) + '</span>'
      + '<span class="b" id="signed-role">' + esc(CNRLabels.roleLabel(user.role)) + '</span></span></button>'
      + '<div class="menu-panel" role="menu"><div class="menu-who"><b>' + esc(user.name) + '</b><span>' + esc(user.email || '') + '</span></div>'
      + preview + '<a href="#/settings" data-nav="set">Settings</a><button type="button" class="menu-item" id="sign-out">Sign out</button></div></div>'
      + '<button type="button" class="icon-btn" id="nav-compact" aria-pressed="false" aria-label="Minimize navigation"></button>'
      + '<button type="button" class="icon-btn" id="nav-burger" aria-expanded="false" aria-label="Open menu">' + icon('menu') + '</button>'
      + '</div></header><div id="main"><div id="page"></div></div>';
  }

  function closeMenus() {
    document.querySelectorAll('#nav .menu.open').forEach(function (menu) {
      menu.classList.remove('open');
      var btn = menu.querySelector('[data-menu-btn]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function closeDrawer() {
    var nav = document.getElementById('nav');
    var burger = document.getElementById('nav-burger');
    if (nav) nav.classList.remove('open');
    if (burger) {
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      burger.innerHTML = icon('menu');
    }
  }

  function toggleMenu(id) {
    var menu = document.querySelector('#nav .menu[data-menu="' + id + '"]');
    if (!menu) return;
    var willOpen = !menu.classList.contains('open');
    closeMenus();
    if (!willOpen) return;
    menu.classList.add('open');
    var btn = menu.querySelector('[data-menu-btn]');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function onNavClick(event) {
    if (event.target.closest('#nav-compact')) {
      var nav = document.getElementById('nav');
      applyNavMode(nav && nav.dataset.compact === '1' ? 'full' : 'compact');
      return;
    }
    var burger = event.target.closest('#nav-burger');
    if (burger) {
      var bar = document.getElementById('nav');
      var open = bar.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      burger.innerHTML = open ? icon('close') : icon('menu');
      return;
    }
    var menuBtn = event.target.closest('[data-menu-btn]');
    if (menuBtn) {
      var drawer = menuBtn.closest('.nav-links') && document.getElementById('nav').classList.contains('open');
      if (!drawer) toggleMenu(menuBtn.getAttribute('data-menu-btn'));
      return;
    }
    if (event.target.closest('#theme-btn')) {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
      return;
    }
    if (event.target.closest('#open-pal')) {
      closeMenus();
      openPalette();
      return;
    }
    if (event.target.closest('#sign-out')) {
      CNRStore.signOut().then(showLogin);
      return;
    }
    if (event.target.closest('a[href^="#"]')) {
      closeMenus();
      closeDrawer();
    }
  }

  function markNav(route) {
    var active = { dash: 'dash', prof: 'dash', bat: 'bat', set: 'set' }[route.key];
    document.querySelectorAll('#nav a[data-nav]').forEach(function (link) {
      var on = link.dataset.nav === active;
      link.classList.toggle('on', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('#nav .menu').forEach(function (menu) {
      menu.classList.toggle('on', !!menu.querySelector('a[data-nav].on'));
    });
    closeMenus();
    closeDrawer();
  }

  function showLogin(message) {
    document.getElementById('app').hidden = true;
    var login = document.getElementById('login');
    login.hidden = false;
    var hint = CNRStore.mode() === 'mock'
      ? '<p class="mu sm">Preview accounts stay in this browser: admin@local.test / admin, onboarder@local.test / onboarder, qa@local.test / qa, viewer@local.test / viewer.</p>'
      : '';
    login.innerHTML = ''
      + '<div class="l"><img src="logo.png" alt=""><h2>VA onboarding and performance, in one place</h2><p>Create &amp; Reach VA Services</p></div>'
      + '<div class="r"><form id="signin"><h1>Sign in</h1>'
      + '<label for="email">Email</label><input id="email" type="email" autocomplete="username" required>'
      + '<label for="password">Password</label><div class="pw"><input id="password" type="password" autocomplete="current-password" required>'
      + '<button type="button" id="toggle-pw">Show</button></div>'
      + '<p id="le"></p><button class="go" type="submit">Sign in</button>' + hint + '</form></div>';
    if (message) document.getElementById('le').textContent = message;
    document.getElementById('toggle-pw').addEventListener('click', function () {
      var input = document.getElementById('password');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show';
    });
    document.getElementById('signin').addEventListener('submit', async function (event) {
      event.preventDefault();
      var err = document.getElementById('le');
      err.textContent = '';
      try {
        await CNRStore.signIn(document.getElementById('email').value, document.getElementById('password').value);
        showApp();
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
  }

  function showApp() {
    var login = document.getElementById('login');
    login.hidden = true;
    login.innerHTML = '';
    var app = document.getElementById('app');
    app.hidden = false;
    app.innerHTML = shell(me());
    applyNavMode(storedNavMode());
    document.getElementById('nav').addEventListener('click', onNavClick);
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    var page = document.getElementById('page');
    page.addEventListener('click', onClick);
    page.addEventListener('submit', onSubmit);
    page.addEventListener('input', onInput);
    page.addEventListener('change', onChange);
    page.addEventListener('focusout', onFocusOut);
    page.addEventListener('keydown', onPageKey);
    if (!listening) {
      listening = true;
      window.addEventListener('hashchange', function () {
        if (!state.keepFlash) {
          state.flash = '';
          state.error = '';
        }
        state.keepFlash = false;
        render();
      });
      document.addEventListener('keydown', function (event) {
        var tag = event.target && event.target.tagName;
        var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        if (event.key === '/' && !typing) {
          event.preventDefault();
          openPalette();
        }
        if (event.key === 'Escape') {
          closeMenus();
          closeDrawer();
          closeModal();
          closePalette();
          closeFloaters();
        }
      });
      document.addEventListener('click', function (event) {
        var nav = document.getElementById('nav');
        if (nav && !nav.contains(event.target)) {
          closeMenus();
          closeDrawer();
        }
        if (!event.target.closest || !event.target.closest('#addbox, #statuspop')) closeFloaters();
      });
      document.getElementById('mod').addEventListener('click', function (event) {
        if (event.target.closest && event.target.closest('[data-action="csv-template"]')) {
          event.preventDefault();
          downloadTemplate();
          return;
        }
        if (event.target.id === 'mod' || (event.target.closest && event.target.closest('[data-action="cancel-modal"]'))) closeModal();
      });
      document.getElementById('mod').addEventListener('change', function (event) {
        if (event.target.id === 'batchId') toggleNewBatch();
        if (event.target.id === 'csv-file' && event.target.files && event.target.files[0]) readCsvFile(event.target.files[0]);
        if (event.target.id === 'att-status' || event.target.id === 'att-date') refreshAttendanceDraft();
      });
      document.getElementById('mod').addEventListener('input', function (event) {
        if (event.target.closest && event.target.closest('#att-form')) refreshAttendanceDraft();
        if (event.target.closest && event.target.closest('#wbr-form')) refreshWbrDraft();
      });
      document.getElementById('mod').addEventListener('submit', onModalSubmit);
      document.getElementById('pal').addEventListener('click', function (event) {
        if (event.target.id === 'pal') closePalette();
        var item = event.target.closest && event.target.closest('[data-pal]');
        if (item) {
          closePalette();
          navigate('#/vas/' + encodeURIComponent(item.dataset.pal));
        }
      });
    }
    if (!location.hash) location.hash = '#/board';
    else render();
  }

  async function render() {
    var page = document.getElementById('page');
    if (!page || !me()) return;
    var route = readRoute();
    if (route.key === 'board-redirect') {
      location.replace('#/board');
      return;
    }
    markNav(route);
    var seq = ++renderSeq;
    page.innerHTML = banner() + '<p class="mu">Loading</p>';
    try {
      cache.vas = await CNRStore.listVas();
      if (seq !== renderSeq) return;
      var html = '';
      if (route.key === 'dash') html = await viewBoard();
      else if (route.key === 'prof') html = await viewProfile(route);
      else if (route.key === 'bat') html = await viewBatches();
      else html = await viewSettings();
      if (seq !== renderSeq) return;
      page.innerHTML = banner() + html;
      if (route.key === 'set') weightSumText();
      refreshLive();
      var renaming = document.querySelector('input[data-batch]');
      if (renaming) renaming.focus();
    } catch (err) {
      if (seq !== renderSeq) return;
      state.error = err.message || 'Something went wrong.';
      page.innerHTML = banner();
    }
  }

  function closeFloaters() {
    var pop = document.getElementById('add-pop');
    if (pop) pop.hidden = true;
    var panel = document.getElementById('status-panel');
    if (panel) panel.hidden = true;
  }

  function inBoardGroup(va, group) {
    if (group === 'roster') return true;
    if (group === 'onboarding') {
      return va.status === 'Onboarding' || va.status === 'Continue onboarding' || va.status === 'Ready for endorsement';
    }
    if (group === 'endorsed') return va.status === 'Endorsed';
    if (group === 'resigned') return va.status === 'Resigned' || va.status === 'EOC';
    return false;
  }

  async function viewBoard() {
    var batches = await CNRStore.listBatches();
    var filter = state.boardFilter || 'onboarding';
    if (!BOARD_GROUPS.some(function (group) { return group.id === filter && !group.href; })) filter = 'onboarding';
    var counts = {
      roster: cache.vas.length,
      batches: batches.length,
      onboarding: cache.vas.filter(function (va) { return inBoardGroup(va, 'onboarding'); }).length,
      endorsed: cache.vas.filter(function (va) { return inBoardGroup(va, 'endorsed'); }).length,
      resigned: cache.vas.filter(function (va) { return inBoardGroup(va, 'resigned'); }).length
    };
    var chips = BOARD_GROUPS.map(function (group) {
      if (group.href) return kpiLink(group.href, group.label, counts.batches);
      return kpiButton(group.id, group.label, counts[group.id], filter === group.id);
    }).join('');
    var add = '';
    if (can('manage_va')) {
      add = '<div class="addbox" id="addbox"><button type="button" class="plus" id="board-add" data-action="add-menu" aria-label="Add VAs" aria-haspopup="menu" aria-controls="add-pop">+</button>'
        + '<div class="pop" id="add-pop" role="menu" hidden>'
        + '<button type="button" data-action="add-va">Add one VA</button>'
        + '<button type="button" data-action="import-csv">Import CSV</button>'
        + '<button type="button" data-action="csv-template">Download template</button>'
        + '</div></div>';
    }
    var empty = cache.vas.length ? '' : '<div class="card emptyqa"><h2>No VAs yet</h2><p>' + (can('manage_va') ? 'Use + to add one VA, or import a CSV. The board starts empty.' : 'The board starts empty.') + '</p></div>';
    var active = BOARD_GROUPS.filter(function (group) { return group.id === filter; })[0];
    var shown = cache.vas.filter(function (va) { return inBoardGroup(va, filter); });
    var column = '<section class="col" id="board-list"><h3>' + esc(active.label) + ' <i class="b">' + shown.length + '</i></h3>'
      + (shown.length ? shown.map(card).join('') : '<p class="mu sm">No one in this group</p>') + '</section>';
    return '<div class="boardhead"><div><h1>Onboarding Board</h1><p class="lead">Open a card to see that VA.</p></div>' + add + '</div><div class="kpis" id="board-counts">' + chips + '</div>' + empty + '<div class="board">' + column + '</div>';
  }

  function kpiButton(id, label, value, selected) {
    return '<button type="button" class="kpi' + (selected ? ' on' : '') + '" data-action="board-filter" data-filter="' + esc(id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></button>';
  }

  function kpiLink(href, label, value) {
    return '<a class="kpi" href="' + href + '"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></a>';
  }

  function card(va) {
    var sub = [va.clientName, va.businessName].filter(Boolean).join(' · ');
    return '<a class="pc" href="#/vas/' + encodeURIComponent(va.id) + '"><b>' + esc(va.fullName) + '</b><div class="mu sm">' + esc(sub || 'No client yet') + '</div><div class="sm">' + badge(va.status) + ' ' + esc(va.batchName || '') + '</div></a>';
  }

  function pickEval(va, week) {
    var list = va.evaluations || [];
    if (week) {
      var found = list.filter(function (ev) { return ev.weekStart === week; })[0];
      if (found) return found;
    }
    var open = list.filter(function (ev) { return ev.status === 'open'; })[0];
    if (open) return open;
    return list.length ? list[list.length - 1] : null;
  }

  function weekDates(monday) {
    var days = [];
    for (var i = 0; i < 7; i++) days.push(CNRDates.addDays(monday, i));
    return days;
  }

  function spanFor(va, week) {
    var ev = pickEval(va, week);
    if (ev) return ev;
    var monday = CNRDates.mondayOf(week) || CNRDates.mondayOf(va.onboardingStart) || CNRDates.mondayOf(CNRDates.todayISO());
    return { id: '', weekStart: monday, weekEnd: CNRDates.addDays(monday, 6), status: '' };
  }

  function dayLocked(va, date) {
    return (va.evaluations || []).some(function (ev) {
      return ev.status === 'closed' && date >= ev.weekStart && date <= ev.weekEnd;
    });
  }

  function weekAttendance(va, span) {
    if (!span) return null;
    var days = (va.attendance || []).filter(function (row) {
      return row.workDate >= span.weekStart && row.workDate <= span.weekEnd;
    });
    if (!days.length) return null;
    return CNRScore.weeklyAttendance(days.map(CNRScore.dailyAttendancePercent));
  }

  function weekConversion(va, span) {
    var days = (va.wbrDays || []).filter(function (row) {
      return row.workDate >= span.weekStart && row.workDate <= span.weekEnd;
    });
    var total = 0;
    var converted = 0;
    var any = false;
    days.forEach(function (row) {
      if (row.totalLeads == null || Number(row.totalLeads) <= 0) return;
      any = true;
      total += Number(row.totalLeads);
      converted += row.convertedLeads == null ? 0 : Number(row.convertedLeads);
    });
    if (!any) return null;
    return CNRScore.conversionRate(total, converted);
  }

  function compValue(ev, key) {
    if (!ev || !ev.competencies) return null;
    var value = ev.competencies[key];
    return value == null || value === '' ? null : value;
  }

  function feedbackBits(va) {
    var list = va.coaching || [];
    if (!list.length) return { value: '0', sub: 'No sessions' };
    return { value: String(list.length), sub: CNRDates.formatLong(list[0].sessionDate) };
  }

  function qaClass(score) {
    if (score == null || score === '' || !Number.isFinite(Number(score))) return '';
    return Number(score) >= 80 ? 'ok' : 'bad';
  }

  function summaryCard(focus, label, value, sub, tone, selected) {
    return '<button type="button" class="scard' + (selected ? ' on' : '') + (tone ? ' ' + tone : '') + '" id="card-' + focus + '" data-focus="' + focus + '" data-action="open-card" aria-pressed="' + (selected ? 'true' : 'false') + '"><small>' + esc(label) + '</small><b>' + esc(value) + '</b>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</button>';
  }

  function weekPicker(va, ev) {
    if (!va.evaluations.length) return '';
    var options = va.evaluations.map(function (item) {
      var label = CNRDates.formatLong(item.weekStart) + ' – ' + CNRDates.formatLong(item.weekEnd) + (item.status === 'open' ? ' · open' : ' · closed');
      return '<option value="' + esc(item.weekStart) + '"' + (ev && item.id === ev.id ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    return '<label class="weekpick">Week<select id="week-select">' + options + '</select></label>';
  }

  function startForm(monday) {
    if (!can('evaluations')) return '<div class="card"><p>An onboarder starts the weekly evaluation.</p></div>';
    return '<form id="start-week" class="card"><h2>Start weekly evaluation</h2><p class="mu">Weeks run Monday through Sunday. A date mid-week snaps back to that Monday.</p><label class="field">Week of<input id="week-start" type="date" required value="' + esc(monday) + '"></label><div class="actions"><button type="submit">Start weekly evaluation</button></div></form>';
  }

  function statusForm(va) {
    var allowed = me().role === 'admin' ? CNRModel.MANUAL_ADMIN : CNRModel.MANUAL_ONBOARDER;
    var options = allowed.map(function (status) {
      return '<option' + (status === va.status ? ' selected' : '') + '>' + esc(status) + '</option>';
    }).join('');
    return '<form id="status-form"><label class="field">Status<select id="manual-status">' + options + '</select></label><button type="submit" class="g">Update status</button><p class="mu sm">Ready for endorsement and Continue onboarding come from closing a week. Endorsed comes only from Endorse.</p></form>';
  }

  function sectionChrome(va, route) {
    var back = profileHash(va.id, '', route.week || '');
    return '<p class="backs"><a href="' + back + '">← Back</a><a href="#/board">← Board</a></p>';
  }

  function profileHead(va, ev) {
    var edit = can('manage_va') ? '<button type="button" class="g s" data-action="edit-va">Edit</button>' : '';
    var menu = '';
    if (can('manage_va')) {
      menu = '<div class="statuspop" id="statuspop"><button type="button" class="g" id="status-menu" data-action="toggle-status" aria-haspopup="true" aria-expanded="false">Status</button><div class="pop" id="status-panel" hidden>' + statusForm(va) + '<button type="button" class="g" data-action="show-history">Movement history</button></div></div>';
    }
    return '<p class="back"><a href="#/board">← Board</a></p><div class="sheethead"><div class="headrow"><h1><span class="av">' + esc(initials(va.fullName)) + '</span>' + esc(va.fullName) + ' ' + badge(va.status) + '</h1><div class="head-actions">' + edit + menu + '</div></div><p class="lead">' + esc([va.clientName, va.businessName, va.batchName].filter(Boolean).join(' · ') || 'No client yet') + '</p>' + weekPicker(va, ev) + '</div>';
  }

  async function viewProfile(route) {
    var va = await CNRStore.getVa(route.vaId);
    cache.current = va;
    var ev = pickEval(va, route.week);
    var span = spanFor(va, route.week);
    var focus = route.focus;
    var qaScore = ev && ev.qa ? ev.qa.score : null;
    var bits = feedbackBits(va);
    var cards = CARDS.map(function (item) {
      var key = item[0];
      var value = '—';
      var sub = '';
      var tone = '';
      if (key === 'attendance') value = pct(weekAttendance(va, span));
      else if (key === 'qa') {
        value = points(qaScore);
        tone = qaClass(qaScore);
      } else if (key === 'wbr') value = pct(weekConversion(va, span));
      else if (key === 'feedback') {
        value = bits.value;
        sub = bits.sub;
      } else if (COMP_BY_FOCUS[key]) value = points(compValue(ev, COMP_BY_FOCUS[key][0]));
      return summaryCard(key, item[1], value, sub, tone, false);
    }).join('');
    if (focus) return sectionChrome(va, route) + detailFor(va, ev, span, focus);
    return profileHead(va, ev) + '<div class="scards">' + cards + '</div>' + await kpiSection(va, ev);
  }

  function detailFor(va, ev, span, focus) {
    if (focus === 'attendance') return attendanceDetail(va, span);
    if (focus === 'qa') return qaDetail(va, ev);
    if (focus === 'wbr') return wbrDetail(va, span);
    if (COMP_BY_FOCUS[focus]) return compDetail(va, ev, focus, span);
    if (focus === 'feedback') return coachTab(va);
    if (focus === 'history') return historyTab(va);
    return '';
  }

  function scoreText(value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    return (Math.round(Number(value) * 100) / 100).toFixed(2) + '%';
  }

  function attendanceFinalized(va) {
    return !!(va && va.attendanceFinalizedAt);
  }

  function finalizedLine(va) {
    var day = String(va.attendanceFinalizedAt || '').slice(0, 10);
    var when = CNRDates.formatLong(day) || day;
    var who = va.attendanceFinalizedByName || 'Unknown user';
    return 'on ' + when + ' by ' + who + '.';
  }

  function attendanceDetail(va, span) {
    var finalized = attendanceFinalized(va);
    var editable = can('attendance') && !finalized;
    var lock = '<div class="card att-lock"><p>Finalize only when all training attendance days have been recorded.</p>';
    if (finalized) {
      lock += '<p class="att-done"><b>Finalized</b> ' + esc(finalizedLine(va)) + '</p>';
      if (can('undo_attendance')) lock += '<button type="button" class="g" data-action="undo-finalize">Undo finalize</button>';
    } else if (can('attendance')) {
      lock += '<button type="button" class="att-finalize" data-action="finalize-attendance">Finalize attendance</button>';
    }
    lock += '</div>';
    var addDisabled = finalized || !can('attendance');
    var add = '<div class="att-addwrap"><button type="button" class="att-add" data-action="add-attendance"' + (addDisabled ? ' disabled' : '') + '>+ Add record</button>';
    if (finalized) add += '<p class="att-hint">Attendance is finalized</p>';
    add += '</div>';
    var rows = (va.attendance || []).slice().sort(function (a, b) {
      return a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0;
    });
    var body = rows.length ? rows.map(function (row) {
      var status = CNRScore.attendanceStatus(row);
      var tone = status === 'Late' ? 'late' : status === 'Absent' ? 'absent' : 'present';
      var score = CNRScore.dailyAttendancePercent(row);
      var notes = row.remarks ? esc(row.remarks) : '—';
      var weekLocked = dayLocked(va, row.workDate);
      var change = editable && !weekLocked;
      var actions = '<button type="button" class="att-link" data-action="view-attendance" data-id="' + esc(row.id) + '">View</button>';
      if (change) {
        actions += '<span class="sep">/</span><button type="button" class="att-link" data-action="edit-attendance" data-id="' + esc(row.id) + '">Edit</button>'
          + '<button type="button" class="att-trash" data-action="delete-attendance" data-id="' + esc(row.id) + '" aria-label="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"/></svg></button>';
      }
      return '<tr data-id="' + esc(row.id) + '" data-date="' + esc(row.workDate) + '" data-score="' + esc(score) + '"><td>' + esc(CNRDates.formatLong(row.workDate)) + '</td><td><span class="att-pill ' + tone + '">' + esc(status) + '</span></td><td>' + esc(row.lateMinutes) + '</td><td>' + esc(row.downtimeMinutes) + '</td><td><span class="att-score">' + esc(scoreText(score)) + '</span></td><td>' + notes + '</td><td><div class="att-actions">' + actions + '</div></td></tr>';
    }).join('') : '';
    var weekValue = pct(weekAttendance(va, span));
    return lock + '<div class="card att-card" id="attendance-panel" data-week-start="' + esc(span.weekStart) + '" data-week-end="' + esc(span.weekEnd) + '" data-week-pct="' + esc(weekValue) + '"><div class="att-head"><div><h2>Attendance</h2></div>' + add + '</div><div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Status</th><th>Late (min)</th><th>Downtime (min)</th><th>Daily score</th><th>Reason / notes</th><th>Actions</th></tr></thead><tbody id="att-rows">' + body + '</tbody></table></div></div>';
  }

  function qaAnchor(va) {
    if (va.onboardingStart) return va.onboardingStart;
    var starts = (va.evaluations || []).map(function (ev) { return ev.weekStart; }).filter(Boolean).sort();
    return starts[0] || CNRDates.todayISO();
  }

  function qaWeekChoices(va) {
    var anchorDate = qaAnchor(va);
    var anchor = CNRDates.mondayOf(anchorDate) || CNRDates.mondayOf(CNRDates.todayISO());
    var today = CNRDates.mondayOf(CNRDates.todayISO());
    var last = anchor;
    if (today && today > last) last = today;
    (va.evaluations || []).forEach(function (ev) {
      if (ev.weekStart && ev.weekStart > last) last = ev.weekStart;
    });
    var weeks = [];
    var seen = {};
    var cursor = anchor;
    var guard = 0;
    while (cursor && cursor <= last && guard < 260) {
      weeks.push(cursor);
      seen[cursor] = true;
      cursor = CNRDates.addDays(cursor, 7);
      guard++;
    }
    (va.evaluations || []).forEach(function (ev) {
      if (ev.weekStart && !seen[ev.weekStart]) weeks.push(ev.weekStart);
    });
    weeks.sort();
    return {
      anchor: anchorDate,
      weeks: weeks,
      preferred: today && today >= anchor ? today : anchor
    };
  }

  function qaPill(score) {
    if (score == null || score === '' || !Number.isFinite(Number(score))) return '—';
    var ok = Number(score) >= 80;
    return '<span class="qa-pill ' + (ok ? 'ok' : 'bad') + '">' + esc(points(score)) + '</span>';
  }

  function qaLink(url) {
    if (!url) return '—';
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>';
  }

  function qaDetail(va) {
    var anchor = qaAnchor(va);
    var rows = (va.evaluations || []).filter(function (ev) { return ev.qa && ev.qa.score != null; }).slice().sort(function (a, b) {
      return a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0;
    });
    var body = rows.map(function (ev) {
      var qa = ev.qa;
      var change = ev.status !== 'closed' && can('qa');
      var actions = '';
      if (change) {
        actions = '<button type="button" class="att-link" data-action="edit-qa" data-week="' + esc(ev.weekStart) + '">Edit</button>'
          + '<button type="button" class="att-trash" data-action="delete-qa" data-id="' + esc(ev.id) + '" aria-label="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"/></svg></button>';
      }
      var number = CNRDates.trainingWeekNumber(anchor, ev.weekStart);
      var dates = CNRDates.formatMonthDay(ev.weekStart) + ' – ' + CNRDates.formatMonthDay(ev.weekEnd);
      return '<tr><td>Week ' + esc(number) + '</td><td>' + esc(dates) + '</td><td>' + qaPill(qa.score) + '</td><td>' + qaLink(qa.formUrl) + '</td><td>' + qaLink(qa.recordingUrl) + '</td><td><div class="att-actions">' + actions + '</div></td></tr>';
    }).join('');
    var add = can('qa') ? '<button type="button" class="att-add" data-action="add-qa">+ Add QA</button>' : '';
    return '<div class="card att-card" id="qa-panel"><div class="att-head"><div><h2>QA score</h2></div>' + add + '</div><div class="att-wrap"><table class="att-table"><thead><tr><th>Week</th><th>Dates</th><th>Score</th><th>Evaluation form</th><th>Call recording</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function wbrDetail(va) {
    var editable = can('wbr');
    var rows = (va.wbrDays || []).slice().sort(function (a, b) {
      return a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0;
    });
    var body = rows.map(function (row) {
      var rate = CNRScore.conversionRate(row.totalLeads, row.convertedLeads);
      var change = editable && !dayLocked(va, row.workDate);
      var actions = '';
      if (change) {
        actions = '<button type="button" class="att-link" data-action="edit-wbr" data-id="' + esc(row.id) + '">Edit</button>'
          + '<button type="button" class="att-trash" data-action="delete-wbr" data-id="' + esc(row.id) + '" aria-label="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"/></svg></button>';
      }
      return '<tr><td>' + esc(CNRDates.formatLong(row.workDate)) + '</td><td>' + esc(field(row.totalLeads)) + '</td><td>' + esc(field(row.convertedLeads)) + '</td><td>' + esc(rate == null ? '—' : pct(rate)) + '</td><td><div class="att-actions">' + actions + '</div></td></tr>';
    }).join('');
    var add = editable ? '<button type="button" class="att-add" data-action="add-wbr">+ Add WBR</button>' : '';
    return '<div class="card att-card" id="wbr-panel"><div class="att-head"><div><h2>WBR</h2></div>' + add + '</div><div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Total leads</th><th>Converted leads</th><th>Conversion rate</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function compDetail(va, ev, focus, span) {
    var comp = (ev && ev.competencies) || {};
    var selected = COMP_BY_FOCUS[focus];
    var locked = (ev && ev.status === 'closed') || !can('competencies');
    var week = (ev && ev.weekStart) || (span && span.weekStart) || '';
    var dis = locked ? ' disabled' : '';
    var fields = COMPS.map(function (item) {
      if (item[0] !== selected[0]) {
        return '<input type="hidden" id="' + item[0] + '" value="' + esc(field(comp[item[0]])) + '"><input type="hidden" id="' + item[1] + '" value="' + esc(comp[item[1]] || '') + '">';
      }
      return '<label class="field">' + esc(item[2]) + '<input id="' + item[0] + '" inputmode="decimal" value="' + esc(field(comp[item[0]])) + '"' + dis + '></label><label class="field">Comment<textarea id="' + item[1] + '"' + dis + '>' + esc(comp[item[1]] || '') + '</textarea></label>';
    }).join('');
    var save = locked ? '' : '<div class="actions"><button type="submit">Save</button></div>';
    return '<form id="comp-form" class="card" data-week="' + esc(week) + '"><h2>' + esc(selected[2]) + '</h2>' + fields + save + '</form>';
  }

  function coachTab(va) {
    var form = '';
    if (can('coaching')) {
      form = '<form id="coach-form" class="card"><h2>Feedback sessions</h2><div class="fields"><label>Date<input id="coach-date" type="date" required value="' + esc(CNRDates.todayISO()) + '"></label><label>Topic<input id="coach-topic" required></label></div><label class="field">What was discussed<textarea id="coach-discussion" required></textarea></label><label class="field">Action<textarea id="coach-action" required></textarea></label><div class="actions"><button type="submit">Save</button></div></form>';
    }
    var rows = (va.coaching || []).map(function (item) {
      var remove = can('coaching') ? '<button type="button" class="g s" data-action="delete-coaching" data-id="' + esc(item.id) + '">Remove</button>' : '';
      return '<article class="card"><div class="bar"><b>' + esc(CNRDates.formatLong(item.sessionDate)) + '</b><span>' + esc(item.topic) + '</span><span class="sp"></span>' + remove + '</div><p>' + esc(item.discussion) + '</p><p><b>Action. </b>' + esc(item.action) + '</p></article>';
    }).join('');
    return form + rows;
  }

  function formulaHtml(score) {
    var items = (score.breakdown || []).map(function (row) {
      var weight = row.included ? row.effectiveWeight : row.configuredWeight;
      var text = row.label + ' × ' + CNRScore.formatWeight(weight) + '%';
      if (!row.included) text += ' · not entered';
      return '<li>' + esc(text) + '</li>';
    });
    if (score.rescaled) items.push('<li>Remaining weights scaled to 100%</li>');
    items.push('<li>Pass mark: ' + esc(CNRScore.formatWeight(score.passMark)) + '</li>');
    return '<ul class="formula">' + items.join('') + '</ul>';
  }

  function scoreTable(score) {
    var rows = (score.breakdown || []).map(function (row) {
      return '<tr><th scope="row">' + esc(row.label) + '</th><td>' + esc(points(row.score)) + '</td><td>' + esc(CNRScore.formatWeight(row.configuredWeight)) + '</td><td>' + esc(CNRScore.formatWeight(row.effectiveWeight)) + '</td><td>' + esc(row.included ? points(row.contribution) : '—') + '</td></tr>';
    }).join('');
    return '<div class="scorewrap"><table><thead><tr><th>Section</th><th>Score</th><th>Weight</th><th>Eff. %</th><th>Pts</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  async function kpiSection(va, ev) {
    if (!ev) return '<div id="kpi-section">' + startForm(CNRDates.mondayOf(va.onboardingStart) || CNRDates.mondayOf(CNRDates.todayISO())) + '</div>';
    var score = ev.score && ev.score.breakdown ? ev.score : CNRScore.scoreEvaluation(await blankScore());
    var line = score.overall == null ? 'No score yet' : points(score.overall);
    var verdict = score.passed == null ? '' : (score.passed ? '<span class="b ok">Meets the pass mark</span>' : '<span class="b bad">Below the pass mark</span>');
    var close = '';
    if (ev.status === 'open' && can('evaluations')) {
      if (score.overall == null) {
        close = '<div class="card"><h2>Close week</h2><p>Enter at least one scored section before closing this week.</p></div>';
      } else if (score.passed) {
        close = '<form id="close-form" class="card" data-evaluation="' + esc(ev.id) + '"><h2>Close week</h2><p>This score meets the pass mark. Closing sets Ready for endorsement when the current status allows it. Endorse is a separate step.</p><div class="actions"><button type="submit" id="close-week">Close week</button></div></form>';
      } else {
        close = '<form id="close-form" class="card" data-evaluation="' + esc(ev.id) + '"><h2>Close week</h2><p>Gaps and coaching actions are required before this week can close. Closing then sets Continue onboarding when the current status allows it.</p><label class="field">Gaps<textarea id="gaps" required>' + esc(ev.gaps || '') + '</textarea></label><label class="field">Coaching actions<textarea id="actions" required>' + esc(ev.coachingActions || '') + '</textarea></label><div class="actions"><button type="submit" id="close-week">Close week</button></div></form>';
      }
    } else if (ev.status === 'closed') {
      close = '<div class="card"><h2>Closed week</h2><p>' + esc(outcomeLabel(ev.outcome)) + (ev.closedByName ? ' · ' + esc(ev.closedByName) : '') + '</p>' + (ev.gaps ? '<p><b>Gaps. </b>' + esc(ev.gaps) + '</p>' : '') + (ev.coachingActions ? '<p><b>Coaching actions. </b>' + esc(ev.coachingActions) + '</p>' : '') + '</div>';
    }
    var latest = va.evaluations[va.evaluations.length - 1];
    var next = latest && latest.status === 'closed' && can('evaluations') ? '<button type="button" data-action="next-week">Next weekly evaluation</button>' : '';
    var endorse = '';
    if (va.status === 'Ready for endorsement' && can('endorse')) endorse = '<button type="button" id="endorse" data-action="endorse">Endorse</button>';
    else if (va.status === 'Ready for endorsement') endorse = '<p class="mu">An admin endorses this VA.</p>';
    else if (va.status === 'Endorsed') endorse = '<p>Endorsed' + (va.endorsedByName ? ' by ' + esc(va.endorsedByName) : '') + (va.endorsedAt ? ' on ' + esc(String(va.endorsedAt).slice(0, 10)) : '') + '.</p>';
    else endorse = '<p class="mu">Endorse appears after a passing week is closed.</p>';
    var note = score.rescaled ? '<p class="note">Blank sections were left out and the remaining weights were scaled to 100%.</p>' : '';
    return '<div id="kpi-section" class="split"><section class="card" id="kpi-card"><h2>Weekly KPI</h2>' + formulaHtml(score) + '<p class="scoreline" id="overall">' + esc(line) + ' ' + verdict + '</p>' + note + scoreTable(score) + '</section><div><div class="card"><h2>Endorse</h2>' + endorse + '<div class="actions">' + next + '</div></div>' + close + '</div></div>';
  }

  async function blankScore() {
    var settings = await CNRStore.getSettings();
    return { scores: {}, weights: settings.weights, passMark: settings.passMark };
  }

  function historyTab(va) {
    if (!va.history.length) return '<div class="card"><p class="mu">No movement yet.</p></div>';
    var rows = va.history.map(function (item) {
      return '<tr><td>' + esc(String(item.changedAt || '').replace('T', ' ').slice(0, 16)) + '</td><td>' + esc(item.previousStatus || '—') + '</td><td>' + badge(item.newStatus) + '</td><td>' + esc(item.note || '') + '</td><td>' + esc(item.changedByName || '') + '</td></tr>';
    }).join('');
    return '<div class="card tw"><h2>Movement history</h2><table><thead><tr><th>When</th><th>From</th><th>To</th><th>Note</th><th>By</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function latestByVa(evals) {
    var map = {};
    evals.forEach(function (ev) {
      if (!map[ev.vaId] || ev.weekStart > map[ev.vaId].weekStart) map[ev.vaId] = ev;
    });
    return map;
  }

  async function viewBatches() {
    var packs = await Promise.all([CNRStore.listBatches(), CNRStore.listAttendance(), CNRStore.listEvaluations()]);
    var batches = packs[0];
    var attendance = packs[1];
    var evals = packs[2];
    var form = can('batches') ? '<form id="batch-form" class="bar"><input id="batch-name" placeholder="New batch name" required><button type="submit">Add batch</button></form>' : '';
    if (!batches.length) return '<h1>Batches</h1><p class="lead">Names can change. The id on each VA stays put.</p>' + form + '<div class="card"><p class="mu">No batches yet.</p></div>';
    var cards = batches.map(function (batch) {
      var vas = cache.vas.filter(function (va) { return va.batchId === batch.id; });
      var ids = {};
      vas.forEach(function (va) { ids[va.id] = true; });
      var days = attendance.filter(function (row) { return ids[row.vaId]; });
      var att = days.length ? CNRScore.weeklyAttendance(days.map(CNRScore.dailyAttendancePercent)) : null;
      var mine = evals.filter(function (ev) { return ids[ev.vaId]; });
      var latest = latestByVa(mine);
      var kpis = Object.keys(latest).map(function (id) { return latest[id].overall; }).filter(function (n) { return n != null; });
      var qas = Object.keys(latest).map(function (id) { return latest[id].qaScore; }).filter(function (n) { return n != null; });
      var avg = function (list) {
        if (!list.length) return null;
        return list.reduce(function (sum, n) { return sum + Number(n); }, 0) / list.length;
      };
      var title = state.renaming === batch.id
        ? '<div class="inline-rename"><input data-batch="' + esc(batch.id) + '" value="' + esc(state.renameDraft || batch.name) + '" aria-label="Batch name"></div>'
        : '<h2>' + esc(batch.name) + '</h2>' + (can('batches') ? '<button type="button" class="g s" data-action="rename" data-id="' + esc(batch.id) + '">Rename</button>' : '');
      var err = state.renaming === batch.id && state.renameError ? '<p class="rename-err">' + esc(state.renameError) + '</p>' : '';
      return '<article class="bc"><div class="batchline">' + title + '</div><p class="idtag">' + esc(batch.id) + '</p><p>' + vas.length + ' VAs</p><p class="sm">Attendance ' + esc(pct(att)) + ' · QA ' + esc(points(avg(qas))) + ' · KPI ' + esc(points(avg(kpis))) + '</p>' + err + '</article>';
    }).join('');
    return '<h1>Batches</h1><p class="lead">Rename a batch in place. VA cards pick up the new name. The id does not change.</p>' + form + '<div class="g3">' + cards + '</div>';
  }

  async function viewSettings() {
    var settings = await CNRStore.getSettings();
    var locked = can('settings') ? '' : ' disabled';
    var fields = CNRScore.SECTION_KEYS.map(function (key) {
      var id = 'weight-' + key.replace(/_/g, '-');
      return '<label>' + esc(CNRScore.SECTION_LABELS[key]) + '<input id="' + id + '" inputmode="decimal" value="' + esc(field(settings.weights[key])) + '"' + locked + '></label>';
    }).join('');
    var users = '';
    if (can('users')) {
      var people = await CNRStore.listUsers();
      users = '<div class="card"><h2>People</h2><p class="mu">The last admin cannot be demoted. A new account starts as a viewer until you change it here.</p>' + people.map(function (user) {
        var options = CNRLabels.ROLES.map(function (role) {
          return '<option value="' + role.id + '"' + (role.id === user.role ? ' selected' : '') + '>' + esc(role.label) + '</option>';
        }).join('');
        return '<form data-user="' + esc(user.id) + '" class="bar"><b>' + esc(user.email) + '</b><span class="mu">' + esc(user.name || '') + '</span><select name="role">' + options + '</select><button type="submit" class="g s">Save role</button></form>';
      }).join('') + '</div>';
    }
    var clear = CNRStore.mode() === 'mock' && can('settings') ? '<div class="card"><h2>Preview data</h2><p class="mu">This removes the VAs stored in this browser. It does not touch the hosted database.</p><button type="button" class="o" data-action="clear-mock">Clear preview data</button></div>' : '';
    var save = can('settings') ? '<button type="submit" id="save-settings">Save</button>' : '<p>Only an admin can change weights, the pass mark, and roles.</p>';
    return '<h1>Settings</h1><p class="lead">Onboarders can update every VA. QA enters the QA score and links. Endorse, weights, and roles are admin only. The database enforces that.</p><form id="settings-form" class="card"><h2>KPI weights</h2><p class="mu">The seven weights must sum to 100.</p><div class="fields">' + fields + '<label>Pass mark<input id="pass-mark" inputmode="decimal" value="' + esc(field(settings.passMark)) + '"' + locked + '></label></div><p id="weight-sum"></p><div class="actions">' + save + '</div></form>' + users + clear;
  }

  function weightSumText() {
    var weights = {};
    CNRScore.SECTION_KEYS.forEach(function (key) {
      var el = document.getElementById('weight-' + key.replace(/_/g, '-'));
      weights[key] = el ? el.value : '';
    });
    var pass = document.getElementById('pass-mark');
    var ok = CNRScore.weightsValid(weights);
    var passOk = pass && pass.value !== '' && Number(pass.value) >= 0 && Number(pass.value) <= 100;
    var btn = document.getElementById('save-settings');
    if (btn) btn.disabled = !(ok && passOk);
    var label = document.getElementById('weight-sum');
    if (label) {
      label.textContent = 'Total ' + CNRScore.formatWeight(CNRScore.weightsSum(weights));
      label.className = ok ? 'mu' : 'rename-err';
    }
  }

  function refreshAttendanceDraft() {
    var form = document.getElementById('att-form');
    if (!form || form.dataset.mode === 'view') return;
    var statusEl = document.getElementById('att-status');
    var lateEl = document.getElementById('att-late');
    var downEl = document.getElementById('att-down');
    var dateEl = document.getElementById('att-date');
    if (!statusEl || !lateEl || !downEl || !dateEl) return;
    var status = statusEl.value;
    var absent = status === 'Absent';
    var lateOff = absent || status === 'Present';
    if (status !== 'Late') lateEl.value = '0';
    if (absent) downEl.value = '0';
    lateEl.disabled = lateOff;
    downEl.disabled = absent;
    var described = CNRScore.describeDailyAttendance({
      absent: absent,
      lateMinutes: lateOff ? 0 : lateEl.value,
      downtimeMinutes: absent ? 0 : downEl.value
    });
    var scoreEl = document.getElementById('att-score');
    var formulaEl = document.getElementById('att-formula');
    if (scoreEl) scoreEl.textContent = scoreText(described.percent);
    if (formulaEl) formulaEl.textContent = described.formula;
    var panel = document.getElementById('attendance-panel');
    var card = document.getElementById('card-attendance');
    if (!panel || !card) return;
    var date = dateEl.value;
    var start = panel.dataset.weekStart;
    var end = panel.dataset.weekEnd;
    var exclude = form.dataset.id || '';
    var scores = [];
    document.querySelectorAll('#att-rows tr[data-date]').forEach(function (row) {
      if (exclude && row.dataset.id === exclude) return;
      if (row.dataset.date < start || row.dataset.date > end) return;
      scores.push(Number(row.dataset.score));
    });
    if (date && date >= start && date <= end) scores.push(described.percent);
    card.querySelector('b').textContent = scores.length ? pct(CNRScore.weeklyAttendance(scores)) : '—';
  }

  function refreshLive() {
    refreshAttendanceDraft();
    var total = 0;
    var converted = 0;
    var any = false;
    document.querySelectorAll('form[data-form="wbr"]').forEach(function (form) {
      var leads = form.total.value;
      var won = form.converted.value;
      var rate = CNRScore.conversionRate(leads === '' ? null : Number(leads), won === '' ? null : Number(won));
      var label = form.querySelector('[data-rate]');
      if (label) label.textContent = rate == null ? '—' : pct(rate);
      if (leads !== '' && Number(leads) > 0) {
        any = true;
        total += Number(leads);
        converted += won === '' ? 0 : Number(won);
      }
    });
    var wbrCard = document.getElementById('card-wbr');
    if (wbrCard && document.querySelector('form[data-form="wbr"]')) {
      wbrCard.querySelector('b').textContent = any ? pct(CNRScore.conversionRate(total, converted)) : '—';
    }
    var qaInput = document.getElementById('qa-score');
    var qaCard = document.getElementById('card-qa');
    var flag = document.getElementById('qa-flag');
    if (qaInput && qaCard) {
      var raw = qaInput.value.trim();
      var score = raw === '' ? null : Number(raw);
      var known = score != null && Number.isFinite(score);
      var tone = known ? qaClass(score) : '';
      qaCard.classList.toggle('ok', tone === 'ok');
      qaCard.classList.toggle('bad', tone === 'bad');
      qaCard.querySelector('b').textContent = known ? points(score) : '—';
      if (flag) {
        flag.className = tone === 'ok' ? 'qa-pass' : tone === 'bad' ? 'qa-fail' : 'mu';
        flag.textContent = tone === 'ok' ? 'Pass · 80 or above' : tone === 'bad' ? 'Fail · below 80' : '';
      }
    }
    Object.keys(COMP_BY_FOCUS).forEach(function (focus) {
      var fieldName = COMP_BY_FOCUS[focus][0];
      var input = document.getElementById(fieldName);
      var card = document.getElementById('card-' + focus);
      if (!input || !card || input.type === 'hidden') return;
      card.querySelector('b').textContent = input.value.trim() === '' ? '—' : points(input.value);
    });
  }

  function onInput(event) {
    if (event.target.id && event.target.id.indexOf('weight-') === 0 || event.target.id === 'pass-mark') weightSumText();
    var form = event.target.form;
    if (form && form.dataset.form === 'wbr') refreshLive();
    if (event.target.closest && event.target.closest('#att-form')) refreshAttendanceDraft();
    if (event.target.id === 'qa-score') refreshLive();
    if (event.target.id && COMPS.some(function (item) { return item[0] === event.target.id; })) refreshLive();
  }

  function onChange(event) {
    if (event.target.id === 'week-select') {
      var route = readRoute();
      navigate(profileHash(route.vaId, route.focus, event.target.value));
    }
    if (event.target.name === 'absent') refreshLive();
  }

  function onClick(event) {
    var action = event.target.closest && event.target.closest('[data-action]');
    if (action) {
      event.preventDefault();
      runAction(action);
      return;
    }
    var row = event.target.closest && event.target.closest('[data-href]');
    if (row && !(event.target.closest && event.target.closest('button, a, input, select, textarea'))) {
      navigate(row.dataset.href);
    }
  }

  async function runAction(action) {
    var name = action.dataset.action;
    var route = readRoute();
    try {
      if (name === 'board-filter') {
        state.boardFilter = action.dataset.filter || 'onboarding';
        return render();
      }
      if (name === 'add-menu') {
        var pop = document.getElementById('add-pop');
        if (pop) pop.hidden = !pop.hidden;
        action.setAttribute('aria-expanded', pop && !pop.hidden ? 'true' : 'false');
        return;
      }
      if (name === 'add-va') {
        closeFloaters();
        return openVaModal(null);
      }
      if (name === 'import-csv') {
        closeFloaters();
        return openImportModal();
      }
      if (name === 'csv-template') return downloadTemplate();
      if (name === 'open-card') {
        var current = readRoute();
        return navigate(profileHash(current.vaId, action.dataset.focus, current.week));
      }
      if (name === 'toggle-status') {
        var panel = document.getElementById('status-panel');
        if (panel) panel.hidden = !panel.hidden;
        action.setAttribute('aria-expanded', panel && !panel.hidden ? 'true' : 'false');
        return;
      }
      if (name === 'show-history') return navigate(profileHash(route.vaId, 'history', route.week));
      if (name === 'edit-va') return openVaModal(cache.current);
      if (name === 'rename') {
        state.renaming = action.dataset.id;
        state.renameError = '';
        state.renameDraft = '';
        return render();
      }
      if (name === 'add-attendance') return openAttendanceModal(cache.current, null, 'add');
      if (name === 'view-attendance' || name === 'edit-attendance') {
        var record = (cache.current.attendance || []).filter(function (row) { return row.id === action.dataset.id; })[0];
        if (!record) return;
        return openAttendanceModal(cache.current, record, name === 'view-attendance' ? 'view' : 'edit');
      }
      if (name === 'finalize-attendance') {
        if (!window.confirm('Finalize attendance? Records cannot be added, edited, or deleted until an admin undoes this.')) return;
        await CNRStore.finalizeAttendance(route.vaId);
        return navigate(profileHash(route.vaId, 'attendance', route.week), 'Attendance finalized.');
      }
      if (name === 'undo-finalize') {
        if (!window.confirm('Undo finalized attendance? Records can be edited again.')) return;
        await CNRStore.undoFinalizeAttendance(route.vaId);
        return navigate(profileHash(route.vaId, 'attendance', route.week), 'Attendance can be edited again.');
      }
      if (name === 'delete-attendance') {
        if (!window.confirm('Delete this attendance record?')) return;
        await CNRStore.deleteAttendance(action.dataset.id);
        return navigate(profileHash(route.vaId, 'attendance', route.week), 'Attendance removed.');
      }
      if (name === 'add-qa') return openQaModal(cache.current, '');
      if (name === 'edit-qa') return openQaModal(cache.current, action.dataset.week);
      if (name === 'add-wbr') return openWbrModal(cache.current, null);
      if (name === 'edit-wbr') {
        var wbrRow = (cache.current.wbrDays || []).filter(function (row) { return row.id === action.dataset.id; })[0];
        if (!wbrRow) return;
        return openWbrModal(cache.current, wbrRow);
      }
      if (name === 'delete-qa') {
        if (!window.confirm('Delete this QA score?')) return;
        await CNRStore.deleteQa(action.dataset.id);
        return navigate(profileHash(route.vaId, 'qa', route.week), 'QA removed.');
      }
      if (name === 'delete-wbr') {
        if (!window.confirm('Delete this WBR record?')) return;
        await CNRStore.deleteWbrDay(action.dataset.id);
        return navigate(profileHash(route.vaId, 'wbr', route.week), 'WBR removed.');
      }
      if (name === 'delete-coaching') {
        await CNRStore.deleteCoaching(action.dataset.id);
        return navigate(profileHash(route.vaId, 'feedback', ''), 'Session removed.');
      }
      if (name === 'endorse') {
        await CNRStore.endorse(route.vaId);
        return navigate(profileHash(route.vaId, route.focus, route.week), 'Endorsed.');
      }
      if (name === 'next-week') {
        var created = await CNRStore.nextEvaluation(route.vaId);
        return navigate(profileHash(route.vaId, route.focus, created.weekStart), 'Next week is open.');
      }
      if (name === 'clear-mock') {
        if (!window.confirm('Clear the preview data in this browser?')) return;
        CNRStore.resetMock();
        cache.vas = [];
        return navigate('#/board', 'Preview data cleared.');
      }
    } catch (err) {
      state.error = err.message || 'Something went wrong.';
      state.keepFlash = true;
      render();
    }
  }

  function onSubmit(event) {
    var form = event.target;
    if (!form || !form.tagName || form.tagName !== 'FORM') return;
    event.preventDefault();
    submitPage(form);
  }

  async function submitPage(form) {
    var route = readRoute();
    try {
      if (form.id === 'start-week') {
        var monday = CNRDates.mondayOf(form.querySelector('#week-start').value);
        if (!monday) throw new Error('Enter a week.');
        await CNRStore.startEvaluation(route.vaId, monday);
        return navigate(profileHash(route.vaId, route.focus, monday), 'Week started.');
      }
      if (form.dataset.form === 'wbr') {
        await CNRStore.saveWbrDay({
          vaId: route.vaId,
          workDate: form.dataset.date,
          totalLeads: form.total.value,
          convertedLeads: form.converted.value
        });
        return navigate(profileHash(route.vaId, 'wbr', route.week), 'WBR saved.');
      }
      if (form.id === 'qa-form') {
        var ev = pickEval(cache.current, route.week);
        await CNRStore.saveQa({
          evaluationId: ev.id,
          score: document.getElementById('qa-score').value,
          formUrl: document.getElementById('qa-form-url').value,
          recordingUrl: document.getElementById('qa-recording').value
        });
        return navigate(profileHash(route.vaId, 'qa', ev.weekStart), 'QA saved.');
      }
      if (form.id === 'comp-form') {
        var weekStart = form.dataset.week;
        var current = (cache.current.evaluations || []).filter(function (ev) { return ev.weekStart === weekStart; })[0];
        var input = { vaId: route.vaId, weekStart: weekStart };
        COMPS.forEach(function (item) {
          input[item[0]] = document.getElementById(item[0]).value;
          input[item[1]] = document.getElementById(item[1]).value;
        });
        if (current) {
          input.evaluationId = current.id;
          await CNRStore.saveCompetencies(input);
        } else {
          await CNRStore.saveCompetenciesForWeek(input);
        }
        return navigate(profileHash(route.vaId, route.focus, weekStart), 'Grade saved.');
      }
      if (form.id === 'coach-form') {
        await CNRStore.addCoaching({
          vaId: route.vaId,
          sessionDate: document.getElementById('coach-date').value,
          topic: document.getElementById('coach-topic').value,
          discussion: document.getElementById('coach-discussion').value,
          action: document.getElementById('coach-action').value
        });
        return navigate(profileHash(route.vaId, 'feedback', ''), 'Session saved.');
      }
      if (form.id === 'close-form') {
        var gaps = document.getElementById('gaps');
        var actions = document.getElementById('actions');
        await CNRStore.closeEvaluation(form.dataset.evaluation, gaps ? gaps.value : '', actions ? actions.value : '');
        return navigate(profileHash(route.vaId, route.focus, route.week), 'Week closed.');
      }
      if (form.id === 'status-form') {
        await CNRStore.setManualStatus(route.vaId, document.getElementById('manual-status').value);
        return navigate(profileHash(route.vaId, route.focus, route.week), 'Status updated.');
      }
      if (form.id === 'batch-form') {
        await CNRStore.createBatch(document.getElementById('batch-name').value);
        return navigate('#/batches', 'Batch added.');
      }
      if (form.id === 'settings-form') {
        var weights = {};
        CNRScore.SECTION_KEYS.forEach(function (key) {
          weights[key] = document.getElementById('weight-' + key.replace(/_/g, '-')).value;
        });
        await CNRStore.saveSettings({ passMark: document.getElementById('pass-mark').value, weights: weights });
        return navigate('#/settings', 'Settings saved.');
      }
      if (form.dataset.user) {
        await CNRStore.setUserRole(form.dataset.user, form.querySelector('[name=role]').value);
        return navigate('#/settings', 'Role saved.');
      }
    } catch (err) {
      state.error = err.message || 'Something went wrong.';
      state.keepFlash = true;
      render();
    }
  }

  function onFocusOut(event) {
    var input = event.target;
    if (!input || !input.dataset || !input.dataset.batch) return;
    if (event.relatedTarget && event.relatedTarget.dataset && event.relatedTarget.dataset.batch === input.dataset.batch) return;
    commitRename(input);
  }

  function onPageKey(event) {
    var input = event.target;
    if (!input || !input.dataset || !input.dataset.batch) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename(input);
    }
    if (event.key === 'Escape') {
      state.renaming = '';
      state.renameError = '';
      render();
    }
  }

  var renameLock = false;

  async function commitRename(input) {
    var id = input.dataset.batch;
    if (renameLock || state.renaming !== id) return;
    renameLock = true;
    var next = input.value;
    try {
      var known = (await CNRStore.listBatches()).filter(function (batch) { return batch.id === id; })[0];
      if (known && known.name === next.trim()) {
        state.renaming = '';
        state.renameError = '';
        render();
        return;
      }
      await CNRStore.renameBatch(id, next);
      state.renaming = '';
      state.renameError = '';
      state.renameDraft = '';
      navigate('#/batches', 'Batch renamed.');
    } catch (err) {
      state.renaming = id;
      state.renameDraft = next;
      state.renameError = err.message;
      render();
    } finally {
      renameLock = false;
    }
  }

  async function openVaModal(va) {
    var batches = await CNRStore.listBatches();
    var editing = !!va;
    var options = '<option value="">Choose a batch</option>' + batches.map(function (batch) {
      return '<option value="' + esc(batch.id) + '"' + (va && va.batchId === batch.id ? ' selected' : '') + '>' + esc(batch.name) + '</option>';
    }).join('') + '<option value="__new">New batch…</option>';
    var status = editing ? '' : '<label class="field">Status<select id="va-status">' + CNRLabels.CREATE_STATUSES.map(function (item) {
      return '<option' + (item === 'Onboarding' ? ' selected' : '') + '>' + esc(item) + '</option>';
    }).join('') + '</select></label>';
    var mod = document.getElementById('mod');
    mod.innerHTML = '<form class="box" id="va-form" data-id="' + (editing ? esc(va.id) : '') + '"><h2>' + (editing ? 'Edit VA' : 'Add VA') + '</h2><div class="fields"><label class="field">Complete name<input id="fullName" required value="' + esc(editing ? va.fullName : '') + '"></label><label class="field">Onboarding start<input id="onboardingStart" type="date" required value="' + esc(editing ? va.onboardingStart : CNRDates.todayISO()) + '"></label><label class="field">Onboarder<input id="onboarderName" value="' + esc(editing ? va.onboarderName : '') + '"></label><label class="field">Client<input id="clientName" value="' + esc(editing ? va.clientName : '') + '"></label><label class="field">Business<input id="businessName" value="' + esc(editing ? va.businessName : '') + '"></label><label class="field">Schedule<input id="schedule" value="' + esc(editing ? va.schedule : '') + '"></label><label class="field">Batch<select id="batchId" required>' + options + '</select></label><label class="field">New batch name<input id="newBatch" hidden></label>' + status + '</div><label class="field">SOP or portfolio<textarea id="sopOrPortfolio">' + esc(editing ? va.sopOrPortfolio : '') + '</textarea></label><p id="mod-err" class="rename-err"></p><div class="actions"><button type="submit">Save</button><button type="button" class="g" data-action="cancel-modal">Cancel</button></div></form>';
    mod.style.display = 'flex';
    document.getElementById('fullName').focus();
  }

  function toggleNewBatch() {
    var select = document.getElementById('batchId');
    var extra = document.getElementById('newBatch');
    if (!select || !extra) return;
    var fresh = select.value === '__new';
    extra.hidden = !fresh;
    extra.required = fresh;
  }

  function closeModal() {
    var panel = document.getElementById('attendance-panel');
    var card = document.getElementById('card-attendance');
    if (panel && card && panel.dataset.weekPct) card.querySelector('b').textContent = panel.dataset.weekPct;
    var mod = document.getElementById('mod');
    mod.style.display = 'none';
    mod.innerHTML = '';
  }

  function openAttendanceModal(va, row, mode) {
    if (!va) return;
    var viewing = mode === 'view';
    var editing = mode === 'edit';
    var status = row ? CNRScore.attendanceStatus(row) : 'Present';
    var title = viewing ? 'View Attendance' : editing ? 'Edit Attendance' : 'Add Attendance';
    var sub = esc(va.fullName) + ' · ' + (row ? 'Evaluation record' : 'New evaluation record');
    var dis = viewing ? ' disabled' : '';
    var options = ['Present', 'Late', 'Absent'].map(function (item) {
      return '<option' + (item === status ? ' selected' : '') + '>' + item + '</option>';
    }).join('');
    var late = row && !row.absent ? field(row.lateMinutes) : '0';
    var down = row && !row.absent ? field(row.downtimeMinutes) : '0';
    var notes = row ? row.remarks || '' : '';
    var date = row ? row.workDate : CNRDates.todayISO();
    var save = viewing ? '' : '<button type="submit">Save record</button>';
    var mod = document.getElementById('mod');
    mod.innerHTML = '<form class="box att-box" id="att-form" data-mode="' + mode + '" data-id="' + (row ? esc(row.id) : '') + '"><h2>' + title + '</h2><p class="mu">' + sub + '</p><div class="fields"><label class="field">Date<input id="att-date" type="date" required value="' + esc(date) + '"' + dis + '></label><label class="field">Attendance status<select id="att-status"' + dis + '>' + options + '</select></label><label class="field">Late minutes<input id="att-late" inputmode="numeric" value="' + esc(late) + '"' + dis + '></label><label class="field">Downtime minutes<input id="att-down" inputmode="numeric" value="' + esc(down) + '"' + dis + '></label></div><label class="field">Notes<textarea id="att-notes"' + dis + '>' + esc(notes) + '</textarea></label><div class="att-scorebox"><span>Daily score</span><b id="att-score"></b><p id="att-formula"></p><p class="mu">' + esc(CNRScore.ATTENDANCE_FLOOR_NOTE) + '</p></div><p id="mod-err" class="rename-err"></p><div class="actions"><button type="button" class="g" data-action="cancel-modal">Cancel</button>' + save + '</div></form>';
    mod.style.display = 'flex';
    if (viewing) {
      var described = CNRScore.describeDailyAttendance(row);
      document.getElementById('att-score').textContent = scoreText(described.percent);
      document.getElementById('att-formula').textContent = described.formula;
    } else {
      refreshAttendanceDraft();
      document.getElementById('att-date').focus();
    }
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var quote = false;
    var source = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < source.length; i++) {
      var ch = source.charAt(i);
      if (quote) {
        if (ch === '"') {
          if (source.charAt(i + 1) === '"') { cell += '"'; i++; }
          else quote = false;
        } else cell += ch;
      } else if (ch === '"') quote = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && source.charAt(i + 1) === '\n') i++;
        row.push(cell);
        cell = '';
        if (row.some(function (item) { return String(item).trim() !== ''; })) rows.push(row);
        row = [];
      } else cell += ch;
    }
    if (cell.length || row.length) {
      row.push(cell);
      if (row.some(function (item) { return String(item).trim() !== ''; })) rows.push(row);
    }
    return rows;
  }

  function validateImport(matrix) {
    if (!matrix.length) return { error: 'The file is empty.', items: [] };
    var header = matrix[0].map(function (item) { return String(item).trim().toLowerCase(); });
    var missing = CSV_HEADERS.filter(function (name) { return header.indexOf(name) === -1; });
    if (missing.length) return { error: 'Missing columns: ' + missing.join(', ') + '.', items: [] };
    var index = {};
    CSV_HEADERS.forEach(function (name) { index[name] = header.indexOf(name); });
    var items = matrix.slice(1).map(function (cols, number) {
      function get(name) { return String(cols[index[name]] || '').trim(); }
      var errors = [];
      var status = get('status') || 'Onboarding';
      if (!get('full_name')) errors.push('Name is required.');
      if (!CNRDates.isRealDate(get('onboarding_start'))) errors.push('Start date must be YYYY-MM-DD.');
      if (CNRLabels.CREATE_STATUSES.indexOf(status) === -1) errors.push('Status is not allowed when adding a VA.');
      if (!get('batch')) errors.push('Batch is required.');
      return {
        line: number + 2,
        fullName: get('full_name'),
        onboardingStart: get('onboarding_start'),
        onboarderName: get('onboarder_name'),
        clientName: get('client_name'),
        businessName: get('business_name'),
        schedule: get('schedule'),
        status: status,
        batch: get('batch'),
        sopOrPortfolio: get('sop_or_portfolio'),
        errors: errors
      };
    });
    if (!items.length) return { error: 'Add at least one VA under the header row.', items: [] };
    return { error: '', items: items };
  }

  function paintImport(parsed) {
    var host = document.getElementById('csv-preview');
    var save = document.getElementById('csv-save');
    if (!host) return;
    if (parsed.error) {
      host.innerHTML = '<p class="rename-err">' + esc(parsed.error) + '</p>';
      if (save) save.disabled = true;
      state.importItems = [];
      return;
    }
    var blocked = parsed.items.some(function (item) { return item.errors.length; });
    host.innerHTML = '<table><thead><tr><th>Line</th><th>Name</th><th>Start</th><th>Batch</th><th>Status</th><th>Check</th></tr></thead><tbody>'
      + parsed.items.map(function (item) {
        return '<tr' + (item.errors.length ? ' class="badrow"' : '') + '><td>' + item.line + '</td><td>' + esc(item.fullName) + '</td><td>' + esc(item.onboardingStart) + '</td><td>' + esc(item.batch) + '</td><td>' + esc(item.status) + '</td><td>' + esc(item.errors.join(' ') || 'Ready') + '</td></tr>';
      }).join('') + '</tbody></table>';
    if (save) save.disabled = blocked;
    state.importItems = blocked ? [] : parsed.items;
  }

  function readCsvFile(file) {
    var reader = new FileReader();
    reader.onload = function () { paintImport(validateImport(parseCsv(String(reader.result || '')))); };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    var blob = new Blob([CSV_HEADERS.join(',') + '\n'], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'va-import-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
  }

  function openImportModal() {
    state.importItems = [];
    var mod = document.getElementById('mod');
    mod.innerHTML = '<form class="box import-box" id="import-form"><h2>Import VAs</h2><p class="mu">The template has a header row and no sample people. Every row is checked before anything is saved.</p><div class="actions"><button type="button" class="g" data-action="csv-template">Download template</button></div><label class="field">CSV file<input id="csv-file" type="file" accept=".csv,text/csv"></label><div id="csv-preview" class="tw"></div><p id="mod-err" class="rename-err"></p><div class="actions"><button type="submit" id="csv-save" disabled>Save import</button><button type="button" class="g" data-action="cancel-modal">Cancel</button></div></form>';
    mod.style.display = 'flex';
  }

  async function saveAttendanceModal(form) {
    var err = document.getElementById('mod-err');
    err.textContent = '';
    var route = readRoute();
    var status = document.getElementById('att-status').value;
    var absent = status === 'Absent';
    var late = document.getElementById('att-late').value;
    var down = document.getElementById('att-down').value;
    if (status === 'Present') late = '0';
    if (status === 'Late' && !(Number(late) > 0)) {
      err.textContent = 'Enter the late minutes.';
      return;
    }
    try {
      await CNRStore.saveAttendance({
        id: form.dataset.id || '',
        vaId: route.vaId,
        workDate: document.getElementById('att-date').value,
        absent: absent,
        lateMinutes: absent ? 0 : late,
        downtimeMinutes: absent ? 0 : down,
        remarks: document.getElementById('att-notes').value
      });
      closeModal();
      navigate(profileHash(route.vaId, 'attendance', route.week), 'Attendance saved.');
    } catch (ex) {
      err.textContent = ex.message || 'Something went wrong.';
    }
  }

  function openQaModal(va, weekStart) {
    if (!va) return;
    var choices = qaWeekChoices(va);
    var selected = weekStart || choices.preferred;
    var editing = !!weekStart;
    var ev = (va.evaluations || []).filter(function (item) { return item.weekStart === selected; })[0];
    var qa = ev && ev.qa ? ev.qa : {};
    var options = choices.weeks.map(function (week) {
      return '<option value="' + esc(week) + '"' + (week === selected ? ' selected' : '') + '>' + esc(CNRDates.weekRangeLabel(choices.anchor, week)) + '</option>';
    }).join('');
    var dis = editing ? ' disabled' : '';
    var mod = document.getElementById('mod');
    mod.innerHTML = '<form class="box" id="qa-modal" data-week="' + esc(selected) + '"><h2>' + (editing ? 'Edit QA' : 'Add QA') + '</h2><label class="field">Week<select id="qa-week"' + dis + '>' + options + '</select></label><label class="field">QA score<input id="qa-score" inputmode="decimal" required value="' + esc(qa.score == null ? '' : qa.score) + '"></label><label class="field">Evaluation form link<input id="qa-form-url" value="' + esc(qa.formUrl || '') + '"></label><label class="field">Call recording link<input id="qa-recording" value="' + esc(qa.recordingUrl || '') + '"></label><p id="mod-err" class="rename-err"></p><div class="actions"><button type="button" class="g" data-action="cancel-modal">Cancel</button><button type="submit">Save</button></div></form>';
    mod.style.display = 'flex';
    (editing ? document.getElementById('qa-score') : document.getElementById('qa-week')).focus();
  }

  function openWbrModal(va, row) {
    if (!va) return;
    var editing = !!row;
    var mod = document.getElementById('mod');
    mod.innerHTML = '<form class="box" id="wbr-form" data-id="' + (row ? esc(row.id) : '') + '" data-new="' + (editing ? '0' : '1') + '"><h2>' + (editing ? 'Edit WBR' : 'Add WBR') + '</h2><label class="field">Date<input id="wbr-date" type="date" required value="' + esc(row ? row.workDate : CNRDates.todayISO()) + '"></label><label class="field">Total leads<input id="wbr-total" inputmode="decimal" value="' + esc(row ? field(row.totalLeads) : '') + '"></label><label class="field">Converted leads<input id="wbr-converted" inputmode="decimal" value="' + esc(row ? field(row.convertedLeads) : '') + '"></label><div class="att-scorebox"><span>Conversion rate</span><b id="wbr-rate">—</b></div><p id="mod-err" class="rename-err"></p><div class="actions"><button type="button" class="g" data-action="cancel-modal">Cancel</button><button type="submit">Save</button></div></form>';
    mod.style.display = 'flex';
    refreshWbrDraft();
    document.getElementById('wbr-date').focus();
  }

  function refreshWbrDraft() {
    var totalEl = document.getElementById('wbr-total');
    var convertedEl = document.getElementById('wbr-converted');
    var rateEl = document.getElementById('wbr-rate');
    if (!totalEl || !convertedEl || !rateEl) return;
    var rate = CNRScore.conversionRate(totalEl.value === '' ? null : Number(totalEl.value), convertedEl.value === '' ? null : Number(convertedEl.value));
    rateEl.textContent = rate == null ? '—' : pct(rate);
  }

  async function saveQaModal(form) {
    var err = document.getElementById('mod-err');
    err.textContent = '';
    var route = readRoute();
    var weekEl = document.getElementById('qa-week');
    var week = (weekEl && weekEl.value) || form.dataset.week;
    try {
      await CNRStore.saveQaForWeek({
        vaId: route.vaId,
        weekStart: week,
        score: document.getElementById('qa-score').value,
        formUrl: document.getElementById('qa-form-url').value,
        recordingUrl: document.getElementById('qa-recording').value
      });
      closeModal();
      navigate(profileHash(route.vaId, 'qa', week), 'QA saved.');
    } catch (ex) {
      err.textContent = ex.message || 'Something went wrong.';
    }
  }

  async function saveWbrModal(form) {
    var err = document.getElementById('mod-err');
    err.textContent = '';
    var route = readRoute();
    try {
      await CNRStore.saveWbrDay({
        id: form.dataset.id || '',
        asNew: form.dataset.new === '1',
        vaId: route.vaId,
        workDate: document.getElementById('wbr-date').value,
        totalLeads: document.getElementById('wbr-total').value,
        convertedLeads: document.getElementById('wbr-converted').value
      });
      closeModal();
      navigate(profileHash(route.vaId, 'wbr', route.week), 'WBR saved.');
    } catch (ex) {
      err.textContent = ex.message || 'Something went wrong.';
    }
  }

  async function onModalSubmit(event) {
    var form = event.target;
    if (!form || (form.id !== 'va-form' && form.id !== 'import-form' && form.id !== 'att-form' && form.id !== 'qa-modal' && form.id !== 'wbr-form')) return;
    event.preventDefault();
    if (form.id === 'att-form') return saveAttendanceModal(form);
    if (form.id === 'qa-modal') return saveQaModal(form);
    if (form.id === 'wbr-form') return saveWbrModal(form);
    if (form.id === 'import-form') {
      var importErr = document.getElementById('mod-err');
      importErr.textContent = '';
      var items = state.importItems || [];
      if (!items.length) {
        importErr.textContent = 'Choose a CSV and fix every row before saving.';
        return;
      }
      try {
        var known = await CNRStore.listBatches();
        var byName = {};
        known.forEach(function (batch) { byName[batch.name.toLowerCase()] = batch.id; });
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var key = item.batch.toLowerCase();
          if (!byName[key]) {
            var batch = await CNRStore.createBatch(item.batch);
            byName[key] = batch.id;
          }
          await CNRStore.createVa({
            fullName: item.fullName,
            onboardingStart: item.onboardingStart,
            onboarderName: item.onboarderName,
            clientName: item.clientName,
            businessName: item.businessName,
            schedule: item.schedule,
            status: item.status,
            batchId: byName[key],
            sopOrPortfolio: item.sopOrPortfolio
          });
        }
        closeModal();
        navigate('#/board', items.length + (items.length === 1 ? ' VA imported.' : ' VAs imported.'));
      } catch (ex) {
        importErr.textContent = ex.message;
      }
      return;
    }
    var err = document.getElementById('mod-err');
    err.textContent = '';
    try {
      var batchId = document.getElementById('batchId').value;
      if (batchId === '__new') {
        var created = await CNRStore.createBatch(document.getElementById('newBatch').value);
        batchId = created.id;
      }
      var input = {
        fullName: document.getElementById('fullName').value,
        onboardingStart: document.getElementById('onboardingStart').value,
        onboarderName: document.getElementById('onboarderName').value,
        clientName: document.getElementById('clientName').value,
        businessName: document.getElementById('businessName').value,
        sopOrPortfolio: document.getElementById('sopOrPortfolio').value,
        schedule: document.getElementById('schedule').value,
        batchId: batchId
      };
      if (form.dataset.id) {
        input.id = form.dataset.id;
        await CNRStore.updateVa(input);
        closeModal();
        navigate(profileHash(input.id, readRoute().focus, readRoute().week), 'Profile saved.');
      } else {
        var status = document.getElementById('va-status');
        input.status = status ? status.value : 'Onboarding';
        var va = await CNRStore.createVa(input);
        closeModal();
        navigate('#/vas/' + encodeURIComponent(va.id), 'VA added.');
      }
    } catch (ex) {
      err.textContent = ex.message;
    }
  }

  function openPalette() {
    if (!me()) return;
    var pal = document.getElementById('pal');
    pal.style.display = 'flex';
    pal.innerHTML = '<div class="box"><input id="pal-q" placeholder="Search VAs" autocomplete="off"><div id="pl"></div></div>';
    var input = document.getElementById('pal-q');
    function paint() {
      var q = input.value.trim().toLowerCase();
      var rows = cache.vas.filter(function (va) {
        return !q || (va.fullName + ' ' + va.clientName + ' ' + va.businessName).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 20);
      var list = document.getElementById('pl');
      if (!list) return;
      list.innerHTML = rows.length ? rows.map(function (va) {
        return '<div class="pi" data-pal="' + esc(va.id) + '"><span><b>' + esc(va.fullName) + '</b><br><small>' + esc(va.clientName || va.businessName || 'No client') + '</small></span>' + badge(va.status) + '</div>';
      }).join('') : '<div class="ph">' + (cache.vas.length ? 'No matching VAs' : 'No VAs yet') + '</div>';
    }
    paint();
    input.addEventListener('input', paint);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        var first = document.querySelector('#pl .pi');
        if (first) {
          closePalette();
          navigate('#/vas/' + encodeURIComponent(first.dataset.pal));
        }
      }
    });
    input.focus();
  }

  function closePalette() {
    var pal = document.getElementById('pal');
    pal.style.display = 'none';
    pal.innerHTML = '';
  }

  async function boot() {
    if (new URLSearchParams(location.search).get('mock') === '1') sessionStorage.setItem('cnr-mock', '1');
    try {
      await CNRStore.restore();
    } catch (err) {
      showLogin(err.message);
      return;
    }
    if (CNRStore.current()) showApp();
    else showLogin();
  }

  boot();
})();
