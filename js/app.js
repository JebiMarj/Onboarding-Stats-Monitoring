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
      return summaryCard(key, item[1], value, sub, tone, focus === key);
    }).join('');
    return profileHead(va, ev) + '<div class="scards">' + cards + '</div><div id="detail">' + detailFor(va, ev, span, focus) + '</div>' + await kpiSection(va, ev);
  }

  function detailFor(va, ev, span, focus) {
    if (focus === 'attendance') return attendanceDetail(va, span);
    if (focus === 'qa') return qaDetail(va, ev);
    if (focus === 'wbr') return wbrDetail(va, span);
    if (COMP_BY_FOCUS[focus]) return compDetail(va, ev, focus);
    if (focus === 'feedback') return coachTab(va);
    if (focus === 'history') return historyTab(va);
    return '';
  }

  function needWeek() {
    return '<div class="card"><p class="mu">Start the weekly evaluation below, then come back to this card.</p></div>';
  }

  function attendanceDetail(va, span) {
    var byDate = {};
    (va.attendance || []).forEach(function (row) { byDate[row.workDate] = row; });
    var editable = can('attendance');
    var days = weekDates(span.weekStart).map(function (date) {
      var row = byDate[date] || null;
      var locked = dayLocked(va, date) || !editable;
      var absent = row ? row.absent : false;
      var late = row ? field(row.lateMinutes) : '';
      var down = row ? field(row.downtimeMinutes) : '';
      var remarks = row ? row.remarks || '' : '';
      var shown = row ? pct(CNRScore.dailyAttendancePercent(row)) : '—';
      var save = locked ? '' : '<button type="submit" class="s">Save</button>';
      var remove = row && !locked ? '<button type="button" class="g s" data-action="delete-attendance" data-id="' + esc(row.id) + '">Remove</button>' : '';
      return '<form class="day" data-form="attendance" data-date="' + esc(date) + '" data-locked="' + (locked ? '1' : '0') + '" data-saved="' + (row ? '1' : '0') + '"><div><b>' + esc(CNRDates.formatWeekday(date)) + '</b><small>' + esc(CNRDates.formatLong(date)) + '</small></div><label>Absent <input type="checkbox" name="absent"' + (absent ? ' checked' : '') + (locked ? ' disabled' : '') + '></label><label class="field">Late min<input name="late" inputmode="numeric" value="' + esc(absent ? '0' : late) + '"' + (locked || absent ? ' disabled' : '') + '></label><label class="field">Downtime<input name="down" inputmode="numeric" value="' + esc(absent ? '0' : down) + '"' + (locked || absent ? ' disabled' : '') + '></label><label class="field">Remarks<input name="remarks" value="' + esc(remarks) + '" placeholder="Late, downtime, or absent"' + (locked ? ' disabled' : '') + '></label><b data-pct>' + esc(shown) + '</b><div class="actions">' + save + remove + '</div></form>';
    }).join('');
    return '<div class="card"><h2>Attendance</h2><p class="mu">Each day: absent, late minutes, downtime minutes, and a remark. Eight hours is 480 minutes and 100%. Late and downtime deduct in proportion. A full-day absence is 0%. The card averages the days in this week.</p></div><div class="days">' + days + '</div>';
  }

  function qaDetail(va, ev) {
    if (!ev) return needWeek();
    var qa = ev.qa || {};
    var locked = ev.status === 'closed' || !can('qa');
    var dis = locked ? ' disabled' : '';
    var save = locked ? '' : '<button type="submit">Save QA</button>';
    var remove = ev.qa && !locked ? '<button type="button" class="g" data-action="delete-qa" data-id="' + esc(ev.id) + '">Remove QA</button>' : '';
    var note = can('qa') ? '<p class="mu">80 or above passes and shows green. 79 or below fails and shows red.</p>' : '<p class="mu">QA enters the score and the links.</p>';
    if (ev.status === 'closed') note = '<p class="mu">This week is closed.</p>';
    var tone = qaClass(qa.score);
    var flag = tone === 'ok' ? '<p id="qa-flag" class="qa-pass">Pass · 80 or above</p>' : tone === 'bad' ? '<p id="qa-flag" class="qa-fail">Fail · below 80</p>' : '<p id="qa-flag" class="mu"></p>';
    return '<form id="qa-form" class="card"><h2>QA score</h2>' + note + '<div class="fields"><label>QA score<input id="qa-score" inputmode="decimal" value="' + esc(field(qa.score)) + '"' + dis + '></label><label>Evaluation form link<input id="qa-form-url" placeholder="https://" value="' + esc(qa.formUrl || '') + '"' + dis + '></label><label>Call recording link<input id="qa-recording" placeholder="https://" value="' + esc(qa.recordingUrl || '') + '"' + dis + '></label></div>' + flag + '<div class="actions">' + save + remove + '</div></form>';
  }

  function wbrDetail(va, span) {
    var byDate = {};
    (va.wbrDays || []).forEach(function (row) { byDate[row.workDate] = row; });
    var editable = can('wbr');
    var days = weekDates(span.weekStart).map(function (date) {
      var row = byDate[date] || null;
      var locked = dayLocked(va, date) || !editable;
      var dis = locked ? ' disabled' : '';
      var total = row ? field(row.totalLeads) : '';
      var converted = row ? field(row.convertedLeads) : '';
      var rate = row ? CNRScore.conversionRate(row.totalLeads, row.convertedLeads) : null;
      var save = locked ? '' : '<button type="submit" class="s">Save</button>';
      var remove = row && !locked ? '<button type="button" class="g s" data-action="delete-wbr" data-id="' + esc(row.id) + '">Remove</button>' : '';
      return '<form class="day wbr" data-form="wbr" data-date="' + esc(date) + '" data-locked="' + (locked ? '1' : '0') + '"><div><b>' + esc(CNRDates.formatWeekday(date)) + '</b><small>' + esc(CNRDates.formatLong(date)) + '</small></div><label class="field">Total leads<input name="total" inputmode="decimal" value="' + esc(total) + '"' + dis + '></label><label class="field">Converted<input name="converted" inputmode="decimal" value="' + esc(converted) + '"' + dis + '></label><b data-rate>' + esc(rate == null ? '—' : pct(rate)) + '</b><div class="actions">' + save + remove + '</div></form>';
    }).join('');
    return '<div class="card"><h2>WBR</h2><p class="mu">Each day stores total leads and converted leads. The rate is converted ÷ total, capped at 100. A blank or zero total is left out. The card shows the week rate.</p></div><div class="days">' + days + '</div>';
  }

  function compDetail(va, ev, focus) {
    if (!ev) return needWeek();
    var comp = ev.competencies || {};
    var selected = COMP_BY_FOCUS[focus];
    var locked = ev.status === 'closed' || !can('competencies');
    var dis = locked ? ' disabled' : '';
    var fields = COMPS.map(function (item) {
      if (item[0] !== selected[0]) {
        return '<input type="hidden" id="' + item[0] + '" value="' + esc(field(comp[item[0]])) + '"><input type="hidden" id="' + item[1] + '" value="' + esc(comp[item[1]] || '') + '">';
      }
      return '<label class="field">' + esc(item[2]) + '<input id="' + item[0] + '" inputmode="decimal" value="' + esc(field(comp[item[0]])) + '"' + dis + '></label><label class="field">Comment<textarea id="' + item[1] + '"' + dis + '>' + esc(comp[item[1]] || '') + '</textarea></label>';
    }).join('');
    var save = locked ? '' : '<div class="actions"><button type="submit">Save grade</button></div>';
    var note = ev.status === 'closed' ? 'This week is closed.' : 'Enter the grade for this week, from 0 to 100, and a comment. Leave the grade blank to keep it out of the score.';
    return '<form id="comp-form" class="card"><h2>' + esc(selected[2]) + '</h2><p class="mu">' + esc(note) + '</p>' + fields + save + '</form>';
  }

  function coachTab(va) {
    var form = '';
    if (can('coaching')) {
      form = '<form id="coach-form" class="card"><h2>New feedback session</h2><p class="mu">Add a session any day. It is not part of the weekly score, and a closed week does not freeze it.</p><div class="fields"><label>Date<input id="coach-date" type="date" required value="' + esc(CNRDates.todayISO()) + '"></label><label>Topic<input id="coach-topic" required></label></div><label class="field">What was discussed<textarea id="coach-discussion" required></textarea></label><label class="field">Action<textarea id="coach-action" required></textarea></label><div class="actions"><button type="submit">Save session</button></div></form>';
    }
    var rows = (va.coaching || []).map(function (item) {
      var remove = can('coaching') ? '<button type="button" class="g s" data-action="delete-coaching" data-id="' + esc(item.id) + '">Remove</button>' : '';
      return '<article class="card"><div class="bar"><b>' + esc(CNRDates.formatLong(item.sessionDate)) + '</b><span>' + esc(item.topic) + '</span><span class="sp"></span>' + remove + '</div><p>' + esc(item.discussion) + '</p><p><b>Action. </b>' + esc(item.action) + '</p></article>';
    }).join('');
    return form + (rows || '<div class="card"><p class="mu">No feedback sessions yet.</p></div>');
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

  function updateDayPercent(form) {
    if (!form || form.dataset.form !== 'attendance') return;
    var absent = !!(form.absent && form.absent.checked);
    var locked = form.dataset.locked === '1';
    if (form.late) form.late.disabled = locked || absent;
    if (form.down) form.down.disabled = locked || absent;
    var el = form.querySelector('[data-pct]');
    if (!el || locked && !form.late.value && !form.down.value && !absent && el.textContent === '—') return;
    var has = absent || (form.late && form.late.value !== '') || (form.down && form.down.value !== '') || el.textContent !== '—';
    if (!has) return;
    el.textContent = pct(CNRScore.dailyAttendancePercent({
      absent: absent,
      lateMinutes: absent ? 0 : form.late.value,
      downtimeMinutes: absent ? 0 : form.down.value
    }));
  }

  function refreshLive() {
    document.querySelectorAll('form.day').forEach(function (form) {
      if (form.dataset.form === 'attendance') updateDayPercent(form);
    });
    var attendance = [];
    document.querySelectorAll('form[data-form="attendance"]').forEach(function (form) {
      var absent = !!(form.absent && form.absent.checked);
      var late = form.late ? form.late.value : '';
      var down = form.down ? form.down.value : '';
      var remarks = form.remarks ? form.remarks.value.trim() : '';
      var saved = form.dataset.saved === '1';
      if (!(saved || absent || late !== '' || down !== '' || remarks)) return;
      attendance.push(CNRScore.dailyAttendancePercent({
        absent: absent,
        lateMinutes: absent ? 0 : late,
        downtimeMinutes: absent ? 0 : down
      }));
    });
    var attendanceCard = document.getElementById('card-attendance');
    if (attendanceCard && document.querySelector('form[data-form="attendance"]')) {
      attendanceCard.querySelector('b').textContent = pct(CNRScore.weeklyAttendance(attendance));
    }
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
    if (form && (form.dataset.form === 'attendance' || form.dataset.form === 'wbr')) refreshLive();
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
        var nextFocus = action.dataset.focus;
        var current = readRoute();
        return navigate(profileHash(current.vaId, current.focus === nextFocus ? '' : nextFocus, current.week));
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
      if (name === 'delete-attendance') {
        await CNRStore.deleteAttendance(action.dataset.id);
        return navigate(profileHash(route.vaId, 'attendance', route.week), 'Attendance removed.');
      }
      if (name === 'delete-qa') {
        await CNRStore.deleteQa(action.dataset.id);
        return navigate(profileHash(route.vaId, 'qa', route.week), 'QA removed.');
      }
      if (name === 'delete-wbr') {
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
      if (form.dataset.form === 'attendance') {
        await CNRStore.saveAttendance({
          vaId: route.vaId,
          workDate: form.dataset.date,
          absent: form.absent.checked,
          lateMinutes: form.late.value,
          downtimeMinutes: form.down.value,
          remarks: form.remarks.value
        });
        return navigate(profileHash(route.vaId, 'attendance', route.week), 'Attendance saved.');
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
        var current = pickEval(cache.current, route.week);
        var input = { evaluationId: current.id };
        COMPS.forEach(function (item) {
          input[item[0]] = document.getElementById(item[0]).value;
          input[item[1]] = document.getElementById(item[1]).value;
        });
        await CNRStore.saveCompetencies(input);
        return navigate(profileHash(route.vaId, route.focus, current.weekStart), 'Grade saved.');
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
    var mod = document.getElementById('mod');
    mod.style.display = 'none';
    mod.innerHTML = '';
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

  async function onModalSubmit(event) {
    var form = event.target;
    if (!form || (form.id !== 'va-form' && form.id !== 'import-form')) return;
    event.preventDefault();
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
