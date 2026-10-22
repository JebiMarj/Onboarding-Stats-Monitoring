// Top navigation for the restored palette, wired to the current store.
(function () {
  var MENUS = [
    {
      id: 'onboarding',
      label: 'Onboarding',
      icon: 'board',
      items: [
        ['dash', 'Board', '#/board'],
        ['va', 'VA Directory', '#/vas'],
        ['bat', 'Batches', '#/batches']
      ]
    },
    {
      id: 'performance',
      label: 'Performance',
      icon: 'pulse',
      items: [
        ['perf', 'Performance log', '#/attendance'],
        ['coach', 'Feedback sessions', '#/coaching'],
        ['qa', 'QA sheet', '#/qa']
      ]
    },
    {
      id: 'training',
      label: 'Training',
      icon: 'book',
      items: [
        ['tr', 'Results', '#/training'],
        ['trep', 'Reports', '#/reports-training']
      ]
    }
  ];
  var ICONS = {
    board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    pulse: '<path d="M3 12h4l2.2-6 3.6 12L15 12h6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.2-3.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
    moon: '<path d="M20 14.8A8.2 8.2 0 1 1 9.2 4 6.4 6.4 0 0 0 20 14.8z"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    collapse: '<path d="M5 8h14M5 12h14M8 16h8"/>',
    expand: '<path d="M5 7h14M5 12h14M5 17h14"/>'
  };
  var TABS = [
    ['overview', 'Overview'],
    ['attendance', 'Daily Performance'],
    ['qa', 'QA'],
    ['wbr', 'WBR'],
    ['competencies', 'Competencies'],
    ['coaching', 'Feedback Sessions'],
    ['kpi', 'Weekly KPI'],
    ['history', 'Movement History']
  ];
  var COLS = ['Onboarding', 'Continue onboarding', 'Ready for endorsement', 'Endorsed'];
  var COMPS = [
    ['toolNavigation', 'toolNavigationComment', 'Tool navigation'],
    ['communication', 'communicationComment', 'Communication'],
    ['criticalThinking', 'criticalThinkingComment', 'Critical thinking'],
    ['coreValues', 'coreValuesComment', 'Core values']
  ];

  var state = { flash: '', error: '', keepFlash: false, status: 'All', dirQuery: '', renaming: '', renameError: '', renameDraft: '' };
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
    var routes = {
      board: 'dash', vas: 'va', attendance: 'perf', coaching: 'coach', reports: 'rep',
      batches: 'bat', training: 'tr', 'reports-training': 'trep', qa: 'qa', settings: 'set'
    };
    if (segs[0] === 'vas' && segs[1]) {
      return {
        key: 'prof',
        vaId: decodeURIComponent(segs[1]),
        tab: params.get('tab') || 'overview',
        week: params.get('week') || ''
      };
    }
    return { key: routes[segs[0]] || 'dash', vaId: '', tab: 'overview', week: '' };
  }

  function profileHash(id, tab, week) {
    var hash = '#/vas/' + encodeURIComponent(id) + '?tab=' + encodeURIComponent(tab || 'overview');
    if (week) hash += '&week=' + encodeURIComponent(week);
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
      + '<nav class="nav-links" aria-label="Main">' + MENUS.map(menuHtml).join('')
      + '<a class="nav-btn" href="#/reports" data-nav="rep">' + icon('chart') + '<span class="nav-label">Reports</span></a></nav>'
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
    var active = { dash: 'dash', va: 'va', prof: 'va', perf: 'perf', coach: 'coach', rep: 'rep', bat: 'bat', tr: 'tr', trep: 'trep', qa: 'qa', set: 'set' }[route.key];
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
        }
      });
      document.addEventListener('click', function (event) {
        var nav = document.getElementById('nav');
        if (!nav || nav.contains(event.target)) return;
        closeMenus();
        closeDrawer();
      });
      document.getElementById('mod').addEventListener('click', function (event) {
        if (event.target.id === 'mod' || (event.target.closest && event.target.closest('[data-action="cancel-modal"]'))) closeModal();
      });
      document.getElementById('mod').addEventListener('change', function (event) {
        if (event.target.id === 'batchId') toggleNewBatch();
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
    markNav(route);
    var seq = ++renderSeq;
    page.innerHTML = banner() + '<p class="mu">Loading</p>';
    try {
      cache.vas = await CNRStore.listVas();
      if (seq !== renderSeq) return;
      var html = '';
      if (route.key === 'dash') html = viewBoard();
      else if (route.key === 'va') html = viewDirectory();
      else if (route.key === 'prof') html = await viewProfile(route);
      else if (route.key === 'perf') html = await viewAttendance();
      else if (route.key === 'coach') html = await viewCoaching();
      else if (route.key === 'rep') html = await viewReports();
      else if (route.key === 'bat') html = await viewBatches();
      else if (route.key === 'tr' || route.key === 'trep') html = await viewTraining(route.key === 'trep');
      else if (route.key === 'qa') html = await viewQa();
      else html = await viewSettings();
      if (seq !== renderSeq) return;
      page.innerHTML = banner() + html;
      if (route.key === 'va') filterRows();
      if (route.key === 'set') weightSumText();
      document.querySelectorAll('form.day').forEach(updateDayPercent);
      var renaming = document.querySelector('input[data-batch]');
      if (renaming) renaming.focus();
    } catch (err) {
      if (seq !== renderSeq) return;
      state.error = err.message || 'Something went wrong.';
      page.innerHTML = banner();
    }
  }

  function viewBoard() {
    var counts = { All: cache.vas.length };
    CNRLabels.STATUSES.forEach(function (status) { counts[status] = 0; });
    cache.vas.forEach(function (va) { counts[va.status] = (counts[va.status] || 0) + 1; });
    var chips = ''
      + kpi('On the roster', counts.All)
      + kpi('Onboarding', counts.Onboarding || 0)
      + kpi('Continue onboarding', counts['Continue onboarding'] || 0)
      + kpi('Ready for endorsement', counts['Ready for endorsement'] || 0)
      + kpi('Endorsed', counts.Endorsed || 0);
    var empty = cache.vas.length ? '' : '<div class="card emptyqa"><h2>No VAs yet</h2><p>Add a VA from the directory once training is complete. The board starts empty.</p><a class="btn" href="#/vas">Open VA Directory</a></div>';
    var cols = COLS.map(function (status) {
      var cards = cache.vas.filter(function (va) { return va.status === status; }).map(card).join('');
      return '<section class="col"><h3>' + esc(status) + ' <i class="b">' + (counts[status] || 0) + '</i></h3>'
        + (cards || '<p class="mu sm">No one in this stage</p>') + '</section>';
    }).join('');
    var parked = cache.vas.filter(function (va) { return va.status === 'Resigned' || va.status === 'EOC'; });
    var parkedHtml = '<h2>Resigned and EOC</h2>' + (parked.length ? '<div class="g3">' + parked.map(card).join('') + '</div>' : '<p class="mu">No one here.</p>');
    return '<h1>Onboarding Board</h1><p class="lead">Open a card to see that VA. Closing a week and Endorse update the stage. Dragging a card does not.</p><div class="kpis">' + chips + '</div>' + empty + '<div class="board">' + cols + '</div>' + parkedHtml;
  }

  function kpi(label, value) {
    return '<div class="kpi"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  }

  function card(va) {
    var sub = [va.clientName, va.businessName].filter(Boolean).join(' · ');
    return '<a class="pc" href="#/vas/' + encodeURIComponent(va.id) + '"><b>' + esc(va.fullName) + '</b><div class="mu sm">' + esc(sub || 'No client yet') + '</div><div class="sm">' + esc(va.batchName || '') + '</div></a>';
  }

  function viewDirectory() {
    var add = can('manage_va') ? '<button type="button" id="add-va" data-action="add-va">+ Add VA</button>' : '';
    var chips = ['All'].concat(CNRLabels.STATUSES).map(function (status) {
      return '<a href="#" data-status-chip="' + esc(status) + '"' + (status === state.status ? ' class="on"' : '') + '>' + esc(status) + '</a>';
    }).join('');
    if (!cache.vas.length) {
      return '<h1>VA Directory</h1><p class="lead">Onboarders can update every VA. The roster starts empty.</p><div class="bar"><span class="sp"></span>' + add + '</div><div class="card emptyqa"><h2>No VAs yet</h2><p>Add someone after training is complete. Nothing is imported for you.</p>' + (can('manage_va') ? '<button type="button" data-action="add-va">+ Add VA</button>' : '') + '</div>';
    }
    var rows = cache.vas.map(function (va) {
      var q = (va.fullName + ' ' + va.clientName + ' ' + va.businessName).toLowerCase();
      return '<tr class="cl" data-q="' + esc(q) + '" data-status="' + esc(va.status) + '" data-href="#/vas/' + encodeURIComponent(va.id) + '"><td><b>' + esc(va.fullName) + '</b></td><td>' + esc(va.clientName || '—') + '<small>' + esc(va.businessName || '') + '</small></td><td>' + esc(va.batchName || '—') + '</td><td>' + esc(va.onboarderName || '—') + '</td><td>' + badge(va.status) + '</td></tr>';
    }).join('');
    return '<h1>VA Directory</h1><p class="lead">Onboarders can update every VA. Search matches the name, client, or business.</p><div class="bar"><input id="va-search" value="' + esc(state.dirQuery) + '" placeholder="Search name, client, or business"><div class="chips">' + chips + '</div><span class="sp"></span>' + add + '</div><div class="card tw"><table id="va-table"><thead><tr><th>Name</th><th>Client</th><th>Batch</th><th>Onboarder</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table><p id="va-empty" class="mu" hidden>No VAs match.</p></div>';
  }

  function filterRows() {
    var q = (state.dirQuery || '').trim().toLowerCase();
    var status = state.status || 'All';
    var any = false;
    document.querySelectorAll('#va-table tbody tr').forEach(function (row) {
      var match = (!q || (row.dataset.q || '').indexOf(q) !== -1) && (status === 'All' || row.dataset.status === status);
      row.hidden = !match;
      if (match) any = true;
    });
    var empty = document.getElementById('va-empty');
    if (empty) empty.hidden = any;
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

  function dayLocked(va, date) {
    return (va.evaluations || []).some(function (ev) {
      return ev.status === 'closed' && date >= ev.weekStart && date <= ev.weekEnd;
    });
  }

  function weekAttendance(va, ev) {
    if (!ev) return null;
    var days = (va.attendance || []).filter(function (row) {
      return row.workDate >= ev.weekStart && row.workDate <= ev.weekEnd;
    });
    if (!days.length) return null;
    return CNRScore.weeklyAttendance(days.map(CNRScore.dailyAttendancePercent));
  }

  function compAverage(comp) {
    if (!comp) return null;
    var nums = COMPS.map(function (item) { return comp[item[0]]; }).filter(function (n) { return n != null && n !== ''; });
    if (!nums.length) return null;
    return nums.reduce(function (sum, n) { return sum + Number(n); }, 0) / nums.length;
  }

  function sopHtml(value) {
    var text = String(value || '').trim();
    if (!text) return '<p class="mu">No SOP or portfolio yet.</p>';
    if (/^https?:\/\//i.test(text)) return '<p><a href="' + esc(text) + '" target="_blank" rel="noopener">' + esc(text) + '</a></p>';
    return '<pre>' + esc(text) + '</pre>';
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

  function profileHead(va, route, ev) {
    var tabs = TABS.map(function (tab) {
      var on = tab[0] === route.tab ? ' class="on"' : '';
      return '<a href="' + profileHash(va.id, tab[0], ev ? ev.weekStart : '') + '"' + on + '>' + esc(tab[1]) + '</a>';
    }).join('');
    var edit = can('manage_va') ? '<button type="button" class="g s" data-action="edit-va">Edit</button>' : '';
    return '<p class="back"><a href="#/vas">← VA Directory</a></p><div class="sheethead"><h1><span class="av">' + esc(initials(va.fullName)) + '</span>' + esc(va.fullName) + ' ' + badge(va.status) + edit + '</h1><p class="lead">' + esc([va.clientName, va.businessName, va.batchName].filter(Boolean).join(' · ') || 'No client yet') + '</p></div><nav class="tabs">' + tabs + '</nav><div class="sheetnav">' + weekPicker(va, ev) + '</div>';
  }

  async function viewProfile(route) {
    var va = await CNRStore.getVa(route.vaId);
    cache.current = va;
    var tab = TABS.some(function (item) { return item[0] === route.tab; }) ? route.tab : 'overview';
    route.tab = tab;
    var ev = pickEval(va, route.week);
    var head = profileHead(va, route, ev);
    if (!ev && tab !== 'coaching' && tab !== 'history' && tab !== 'overview') {
      return head + startForm(CNRDates.mondayOf(va.onboardingStart) || CNRDates.mondayOf(CNRDates.todayISO()));
    }
    if (tab === 'overview') return head + overviewTab(va, ev);
    if (tab === 'attendance') return head + attendanceTab(va, ev);
    if (tab === 'qa') return head + qaTab(va, ev);
    if (tab === 'wbr') return head + wbrTab(va, ev);
    if (tab === 'competencies') return head + compTab(va, ev);
    if (tab === 'coaching') return head + coachTab(va);
    if (tab === 'kpi') return head + await kpiTab(va, ev);
    return head + historyTab(va);
  }

  function statusForm(va) {
    if (!can('manage_va')) return '';
    var allowed = me().role === 'admin' ? CNRModel.MANUAL_ADMIN : CNRModel.MANUAL_ONBOARDER;
    var options = allowed.map(function (status) {
      return '<option' + (status === va.status ? ' selected' : '') + '>' + esc(status) + '</option>';
    }).join('');
    return '<form id="status-form" class="actions"><label class="field">Status<select id="manual-status">' + options + '</select></label><button type="submit" class="g">Update status</button></form><p class="mu sm">Ready for endorsement and Continue onboarding come from closing a week. Endorsed comes only from Endorse. An onboarder can set Onboarding, Resigned, or EOC.</p>';
  }

  function overviewTab(va, ev) {
    var conv = ev && ev.wbr ? CNRScore.conversionRate(ev.wbr.totalLeads, ev.wbr.convertedLeads) : null;
    var overall = ev && ev.score ? ev.score.overall : null;
    var cards = '<div class="grid4">'
      + stat('Attendance this week', pct(weekAttendance(va, ev)))
      + stat('QA score', points(ev && ev.qa ? ev.qa.score : null))
      + stat('Sales conversion', conv == null ? '—' : pct(conv))
      + stat('Competencies', points(compAverage(ev && ev.competencies)))
      + stat('Weekly KPI', points(overall))
      + '</div>';
    var endorse = '';
    if (va.status === 'Endorsed') {
      endorse = '<p>Endorsed' + (va.endorsedByName ? ' by ' + esc(va.endorsedByName) : '') + (va.endorsedAt ? ' on ' + esc(String(va.endorsedAt).slice(0, 10)) : '') + '.</p>';
    } else if (va.status === 'Ready for endorsement' && can('endorse')) {
      endorse = '<button type="button" data-action="endorse">Endorse</button>';
    } else if (va.status === 'Ready for endorsement') {
      endorse = '<p>An admin uses Endorse on the Weekly KPI tab.</p>';
    }
    var start = ev ? '' : startForm(CNRDates.mondayOf(va.onboardingStart) || CNRDates.mondayOf(CNRDates.todayISO()));
    return cards + '<div class="row"><div class="card"><h2>Details</h2><div class="hd"><div><small>Onboarding start</small>' + esc(CNRDates.formatLong(va.onboardingStart)) + '</div><div><small>Onboarder</small>' + esc(va.onboarderName || '—') + '</div><div><small>Schedule</small>' + esc(va.schedule || '—') + '</div><div><small>Batch</small>' + esc(va.batchName || '—') + '</div></div>' + statusForm(va) + '</div><div class="card"><h2>SOP or portfolio</h2>' + sopHtml(va.sopOrPortfolio) + '</div></div><div class="card"><h2>Endorsement</h2>' + (endorse || '<p class="mu">Endorse is available after a passing week is closed.</p>') + '</div>' + start;
  }

  function stat(label, value) {
    return '<div class="stat"><small>' + esc(label) + '</small><b>' + esc(value) + '</b></div>';
  }

  function attendanceTab(va, ev) {
    var byDate = {};
    (va.attendance || []).forEach(function (row) { byDate[row.workDate] = row; });
    var editable = can('attendance');
    var days = weekDates(ev.weekStart).map(function (date) {
      var row = byDate[date] || null;
      var locked = dayLocked(va, date) || !editable;
      var absent = row ? row.absent : false;
      var late = row ? field(row.lateMinutes) : '';
      var down = row ? field(row.downtimeMinutes) : '';
      var shown = row ? pct(CNRScore.dailyAttendancePercent(row)) : '—';
      var save = locked ? '' : '<button type="submit" class="s">Save</button>';
      var remove = row && !locked ? '<button type="button" class="g s" data-action="delete-attendance" data-id="' + esc(row.id) + '">Remove</button>' : '';
      return '<form class="day" data-form="attendance" data-date="' + esc(date) + '" data-locked="' + (locked ? '1' : '0') + '"><div><b>' + esc(CNRDates.formatWeekday(date)) + '</b><small>' + esc(CNRDates.formatLong(date)) + '</small></div><label>Absent <input type="checkbox" name="absent"' + (absent ? ' checked' : '') + (locked ? ' disabled' : '') + '></label><label class="field">Late min<input name="late" inputmode="numeric" value="' + esc(absent ? '0' : late) + '"' + (locked || absent ? ' disabled' : '') + '></label><label class="field">Downtime<input name="down" inputmode="numeric" value="' + esc(absent ? '0' : down) + '"' + (locked || absent ? ' disabled' : '') + '></label><b data-pct>' + esc(shown) + '</b><div class="actions">' + save + remove + '</div></form>';
    }).join('');
    return '<div class="card"><h2>Daily attendance</h2><p class="mu">One row per work day. A full day absent is 0%. Otherwise the day is (480 − late minutes − downtime minutes) / 480. Weekly attendance averages the days you save.</p></div><div class="days">' + days + '</div><p class="scoreline">Week average ' + esc(pct(weekAttendance(va, ev))) + '</p>';
  }

  function qaTab(va, ev) {
    var qa = ev.qa || {};
    var locked = ev.status === 'closed' || !can('qa');
    var dis = locked ? ' disabled' : '';
    var save = locked ? '' : '<button type="submit">Save QA</button>';
    var remove = ev.qa && !locked ? '<button type="button" class="g" data-action="delete-qa" data-id="' + esc(ev.id) + '">Remove QA</button>' : '';
    var note = can('qa') ? '' : '<p class="mu">QA enters the score and the links.</p>';
    if (ev.status === 'closed') note = '<p class="mu">This week is closed.</p>';
    return '<form id="qa-form" class="card"><h2>Weekly QA</h2>' + note + '<div class="fields"><label>QA score<input id="qa-score" inputmode="decimal" value="' + esc(field(qa.score)) + '"' + dis + '></label><label>Evaluation form link<input id="qa-form-url" placeholder="https://" value="' + esc(qa.formUrl || '') + '"' + dis + '></label><label>Call recording link<input id="qa-recording" placeholder="https://" value="' + esc(qa.recordingUrl || '') + '"' + dis + '></label></div><div class="actions">' + save + remove + '</div></form>';
  }

  function wbrTab(va, ev) {
    var wbr = ev.wbr || {};
    var locked = ev.status === 'closed' || !can('wbr');
    var dis = locked ? ' disabled' : '';
    var rate = ev.wbr ? CNRScore.conversionRate(wbr.totalLeads, wbr.convertedLeads) : null;
    var save = locked ? '' : '<button type="submit">Save WBR</button>';
    var remove = ev.wbr && !locked ? '<button type="button" class="g" data-action="delete-wbr" data-id="' + esc(ev.id) + '">Remove WBR</button>' : '';
    var note = ev.status === 'closed' ? '<p class="mu">This week is closed.</p>' : '<p class="mu">Conversion is converted ÷ total, capped at 100. A blank or zero total is N/A and drops out of the KPI.</p>';
    return '<form id="wbr-form" class="card"><h2>Weekly WBR</h2>' + note + '<div class="fields"><label>Total leads<input id="wbr-total" inputmode="numeric" value="' + esc(field(wbr.totalLeads)) + '"' + dis + '></label><label>Converted leads<input id="wbr-converted" inputmode="numeric" value="' + esc(field(wbr.convertedLeads)) + '"' + dis + '></label></div><p class="scoreline" id="wbr-rate">' + esc(rate == null ? 'Conversion N/A' : 'Conversion ' + pct(rate)) + '</p><div class="actions">' + save + remove + '</div></form>';
  }

  function compTab(va, ev) {
    var comp = ev.competencies || {};
    var locked = ev.status === 'closed' || !can('competencies');
    var dis = locked ? ' disabled' : '';
    var fields = COMPS.map(function (item) {
      return '<label class="field">' + esc(item[2]) + '<input id="' + item[0] + '" inputmode="decimal" value="' + esc(field(comp[item[0]])) + '"' + dis + '></label><label class="field">Comment<textarea id="' + item[1] + '"' + dis + '>' + esc(comp[item[1]] || '') + '</textarea></label>';
    }).join('');
    var save = locked ? '' : '<div class="actions"><button type="submit">Save competencies</button></div>';
    var note = can('competencies') ? 'Each grade is 0–100 and has its own comment. Leave a grade blank to keep it out of the score. Zero stays in.' : 'Onboarders enter these grades.';
    if (ev.status === 'closed') note = 'This week is closed.';
    return '<form id="comp-form" class="stack"><div class="card"><h2>Competencies</h2><p class="mu">' + esc(note) + '</p>' + fields + save + '</div></form>';
  }

  function coachTab(va) {
    var form = '';
    if (can('coaching')) {
      form = '<form id="coach-form" class="card"><h2>New feedback session</h2><p class="mu">Coaching is history only. It is not part of the weekly score, and a closed week does not freeze it.</p><div class="fields"><label>Date<input id="coach-date" type="date" required value="' + esc(CNRDates.todayISO()) + '"></label><label>Topic<input id="coach-topic" required></label></div><label class="field">Discussion<textarea id="coach-discussion" required></textarea></label><label class="field">Action<textarea id="coach-action" required></textarea></label><div class="actions"><button type="submit">Save session</button></div></form>';
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

  async function kpiTab(va, ev) {
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
    if (va.status === 'Ready for endorsement' && can('endorse')) endorse = '<button type="button" data-action="endorse">Endorse</button>';
    else if (va.status === 'Ready for endorsement') endorse = '<p class="mu">An admin endorses this VA.</p>';
    else if (va.status === 'Endorsed') endorse = '<p>Endorsed' + (va.endorsedByName ? ' by ' + esc(va.endorsedByName) : '') + '.</p>';
    var note = score.rescaled ? '<p class="note">Blank sections were left out and the remaining weights were scaled to 100%.</p>' : '';
    return '<div class="split"><section class="card" id="kpi-card"><h2>Weekly KPI</h2>' + formulaHtml(score) + '<p class="scoreline" id="overall">' + esc(line) + ' ' + verdict + '</p>' + note + scoreTable(score) + '<p class="mu sm">The saved score is computed again when the week closes.</p></section><div><div class="card"><h2>Endorsement</h2>' + (endorse || '<p class="mu">Endorse appears here after a passing week is closed and the status is Ready for endorsement.</p>') + '<div class="actions">' + next + '</div></div>' + close + '</div></div>';
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
    return '<div class="card tw"><table><thead><tr><th>When</th><th>From</th><th>To</th><th>Note</th><th>By</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  async function viewAttendance() {
    var rows = await CNRStore.listAttendance();
    if (!rows.length) return '<h1>Performance Log</h1><p class="lead">Daily attendance for every VA.</p><div class="card"><p class="mu">No attendance yet.</p></div>';
    var body = rows.map(function (row) {
      var day = CNRScore.dailyAttendancePercent(row);
      return '<tr class="cl" data-href="#/vas/' + encodeURIComponent(row.vaId) + '?tab=attendance"><td>' + esc(CNRDates.formatLong(row.workDate)) + '</td><td>' + esc(row.vaName) + '</td><td>' + (row.absent ? 'Yes' : 'No') + '</td><td>' + esc(row.lateMinutes) + '</td><td>' + esc(row.downtimeMinutes) + '</td><td>' + esc(pct(day)) + '</td></tr>';
    }).join('');
    return '<h1>Performance Log</h1><p class="lead">One record per VA per work day. Eight hours is 100%.</p><div class="card tw"><table><thead><tr><th>Date</th><th>VA</th><th>Absent</th><th>Late min</th><th>Downtime</th><th>Daily %</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  async function viewCoaching() {
    var rows = await CNRStore.listCoaching();
    if (!rows.length) return '<h1>Feedback Sessions</h1><p class="lead">Coaching history across the roster. Sessions are not part of the KPI.</p><div class="card"><p class="mu">No feedback sessions yet.</p></div>';
    var body = rows.map(function (row) {
      return '<tr class="cl" data-href="#/vas/' + encodeURIComponent(row.vaId) + '?tab=coaching"><td>' + esc(CNRDates.formatLong(row.sessionDate)) + '</td><td>' + esc(row.vaName) + '</td><td>' + esc(row.topic) + '</td><td>' + esc(row.discussion) + '</td><td>' + esc(row.action) + '</td></tr>';
    }).join('');
    return '<h1>Feedback Sessions</h1><p class="lead">Date, topic, discussion, and action. A closed week does not freeze these.</p><div class="card tw"><table><thead><tr><th>Date</th><th>VA</th><th>Topic</th><th>Discussion</th><th>Action</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  async function viewReports() {
    var evals = await CNRStore.listEvaluations();
    var counts = {};
    CNRLabels.STATUSES.forEach(function (status) { counts[status] = 0; });
    cache.vas.forEach(function (va) { counts[va.status] = (counts[va.status] || 0) + 1; });
    var chips = CNRLabels.STATUSES.map(function (status) { return kpi(status, counts[status] || 0); }).join('');
    var closed = evals.filter(function (ev) { return ev.status === 'closed'; });
    var body = closed.length ? closed.map(function (ev) {
      return '<tr class="cl" data-href="' + profileHash(ev.vaId, 'kpi', ev.weekStart) + '"><td>' + esc(ev.vaName) + '</td><td>' + esc(CNRDates.formatLong(ev.weekStart)) + '</td><td>' + esc(points(ev.overall)) + '</td><td>' + esc(outcomeLabel(ev.outcome)) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="mu">No closed weeks yet.</td></tr>';
    return '<h1>Reports</h1><div class="kpis">' + chips + '</div><div class="card tw"><h2>Closed weeks</h2><table><thead><tr><th>VA</th><th>Week</th><th>KPI</th><th>Result</th></tr></thead><tbody>' + body + '</tbody></table></div>';
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
    return '<h1>Batches</h1><p class="lead">Rename a batch in place. Reports and VA cards pick up the new name. The id does not change.</p>' + form + '<div class="g3">' + cards + '</div>';
  }

  async function viewTraining(report) {
    var packs = await Promise.all([CNRStore.listBatches(), CNRStore.listAttendance(), CNRStore.listEvaluations(), CNRStore.getSettings()]);
    var batches = packs[0];
    var attendance = packs[1];
    var evals = packs[2];
    var passMark = Number(packs[3].passMark);
    var title = report ? 'Training Reports' : 'Training Results';
    if (!batches.length) return '<h1>' + title + '</h1><div class="card"><p class="mu">No batches yet. Add a batch when you add a VA.</p></div>';
    var blocks = batches.map(function (batch) {
      var vas = cache.vas.filter(function (va) { return va.batchId === batch.id; });
      var ids = {};
      vas.forEach(function (va) { ids[va.id] = true; });
      var days = attendance.filter(function (row) { return ids[row.vaId]; });
      var att = days.length ? CNRScore.weeklyAttendance(days.map(CNRScore.dailyAttendancePercent)) : null;
      var mine = evals.filter(function (ev) { return ids[ev.vaId] && ev.status === 'closed'; });
      var latest = latestByVa(mine);
      var list = Object.keys(latest).map(function (id) { return latest[id]; });
      var kpiAvg = list.length ? list.reduce(function (sum, ev) { return sum + Number(ev.overall || 0); }, 0) / list.length : null;
      var passed = list.filter(function (ev) { return ev.passed === true; }).length;
      var width = kpiAvg == null ? 0 : Math.max(0, Math.min(100, kpiAvg));
      var bar = '<div class="hb"><span>' + esc(batch.name) + '</span><div class="cb"><i style="width:' + width + '%"></i><u style="left:' + passMark + '%"></u></div><b>' + esc(kpiAvg == null ? '—' : points(kpiAvg)) + '</b></div>';
      var copy = '<p class="sm">' + vas.length + ' VAs · Attendance ' + esc(pct(att)) + ' · ' + passed + ' of ' + list.length + ' closed weeks met the pass mark</p>';
      return report ? bar + copy : '<article class="card"><h2>' + esc(batch.name) + '</h2>' + bar + copy + '</article>';
    }).join('');
    var intro = '<h1>' + title + '</h1><p class="lead">Batch averages use closed weekly KPIs. The mark on each bar is the pass mark (' + esc(String(passMark)) + ').</p>';
    return report ? intro + '<div class="card">' + blocks + '</div>' : intro + blocks;
  }

  async function viewQa() {
    var evals = await CNRStore.listEvaluations();
    var latest = latestByVa(evals);
    if (!cache.vas.length) {
      var add = can('manage_va') ? '<button type="button" data-action="add-va">+ Add VA</button>' : '';
      return '<h1>QA Sheet</h1><div class="card emptyqa"><h2>No one is on the QA sheet yet</h2><p>Add a VA after training. Everyone on the roster is listed here.</p>' + add + '</div>';
    }
    var rows = cache.vas.map(function (va) {
      var ev = latest[va.id];
      return '<tr class="cl" data-href="' + (ev ? profileHash(va.id, 'qa', ev.weekStart) : '#/vas/' + encodeURIComponent(va.id) + '?tab=qa') + '"><td><b>' + esc(va.fullName) + '</b><small>' + esc(va.clientName || '') + '</small></td><td>' + esc(va.batchName || '—') + '</td><td>' + badge(va.status) + '</td><td>' + esc(ev ? CNRDates.formatLong(ev.weekStart) : '—') + '</td><td>' + esc(ev && ev.qaScore != null ? points(ev.qaScore) : '—') + '</td><td>' + esc(ev && ev.overall != null ? points(ev.overall) : (ev ? 'In progress' : '—')) + '</td><td>' + esc(ev && ev.status === 'closed' ? outcomeLabel(ev.outcome) : (ev ? 'Open' : '—')) + '</td></tr>';
    }).join('');
    return '<h1>QA Sheet</h1><p class="lead">Every VA is listed. QA scores are entered on the VA profile for the open week.</p><div class="card tw"><table><thead><tr><th>VA</th><th>Batch</th><th>Status</th><th>Week</th><th>QA</th><th>KPI</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
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

  function onInput(event) {
    if (event.target.id === 'va-search') {
      state.dirQuery = event.target.value;
      filterRows();
      return;
    }
    if (event.target.id && event.target.id.indexOf('weight-') === 0 || event.target.id === 'pass-mark') weightSumText();
    if (event.target.name === 'late' || event.target.name === 'down') updateDayPercent(event.target.form);
    if (event.target.id === 'wbr-total' || event.target.id === 'wbr-converted') {
      var total = document.getElementById('wbr-total').value;
      var converted = document.getElementById('wbr-converted').value;
      var rate = CNRScore.conversionRate(total === '' ? null : Number(total), converted === '' ? null : Number(converted));
      var line = document.getElementById('wbr-rate');
      if (line) line.textContent = rate == null ? 'Conversion N/A' : 'Conversion ' + pct(rate);
    }
  }

  function onChange(event) {
    if (event.target.id === 'week-select') {
      var route = readRoute();
      navigate(profileHash(route.vaId, route.tab, event.target.value));
    }
    if (event.target.name === 'absent') updateDayPercent(event.target.form);
  }

  function onClick(event) {
    var chip = event.target.closest && event.target.closest('[data-status-chip]');
    if (chip) {
      event.preventDefault();
      state.status = chip.dataset.statusChip;
      var search = document.getElementById('va-search');
      if (search) state.dirQuery = search.value;
      render();
      return;
    }
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
      if (name === 'add-va') return openVaModal(null);
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
        await CNRStore.deleteWbr(action.dataset.id);
        return navigate(profileHash(route.vaId, 'wbr', route.week), 'WBR removed.');
      }
      if (name === 'delete-coaching') {
        await CNRStore.deleteCoaching(action.dataset.id);
        return navigate(profileHash(route.vaId, 'coaching', ''), 'Session removed.');
      }
      if (name === 'endorse') {
        await CNRStore.endorse(route.vaId);
        return navigate(profileHash(route.vaId, 'kpi', route.week), 'Endorsed.');
      }
      if (name === 'next-week') {
        var created = await CNRStore.nextEvaluation(route.vaId);
        return navigate(profileHash(route.vaId, 'kpi', created.weekStart), 'Next week is open.');
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
        return navigate(profileHash(route.vaId, route.tab === 'overview' ? 'attendance' : route.tab, monday), 'Week started.');
      }
      if (form.dataset.form === 'attendance') {
        await CNRStore.saveAttendance({
          vaId: route.vaId,
          workDate: form.dataset.date,
          absent: form.absent.checked,
          lateMinutes: form.late.value,
          downtimeMinutes: form.down.value
        });
        return navigate(profileHash(route.vaId, 'attendance', route.week), 'Attendance saved.');
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
      if (form.id === 'wbr-form') {
        var week = pickEval(cache.current, route.week);
        await CNRStore.saveWbr({
          evaluationId: week.id,
          totalLeads: document.getElementById('wbr-total').value,
          convertedLeads: document.getElementById('wbr-converted').value
        });
        return navigate(profileHash(route.vaId, 'wbr', week.weekStart), 'WBR saved.');
      }
      if (form.id === 'comp-form') {
        var current = pickEval(cache.current, route.week);
        var input = { evaluationId: current.id };
        COMPS.forEach(function (item) {
          input[item[0]] = document.getElementById(item[0]).value;
          input[item[1]] = document.getElementById(item[1]).value;
        });
        await CNRStore.saveCompetencies(input);
        return navigate(profileHash(route.vaId, 'competencies', current.weekStart), 'Competencies saved.');
      }
      if (form.id === 'coach-form') {
        await CNRStore.addCoaching({
          vaId: route.vaId,
          sessionDate: document.getElementById('coach-date').value,
          topic: document.getElementById('coach-topic').value,
          discussion: document.getElementById('coach-discussion').value,
          action: document.getElementById('coach-action').value
        });
        return navigate(profileHash(route.vaId, 'coaching', ''), 'Session saved.');
      }
      if (form.id === 'close-form') {
        var gaps = document.getElementById('gaps');
        var actions = document.getElementById('actions');
        await CNRStore.closeEvaluation(form.dataset.evaluation, gaps ? gaps.value : '', actions ? actions.value : '');
        return navigate(profileHash(route.vaId, 'kpi', route.week), 'Week closed.');
      }
      if (form.id === 'status-form') {
        await CNRStore.setManualStatus(route.vaId, document.getElementById('manual-status').value);
        return navigate(profileHash(route.vaId, 'overview', route.week), 'Status updated.');
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

  async function onModalSubmit(event) {
    var form = event.target;
    if (!form || form.id !== 'va-form') return;
    event.preventDefault();
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
        navigate(profileHash(input.id, 'overview', readRoute().week), 'Profile saved.');
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
