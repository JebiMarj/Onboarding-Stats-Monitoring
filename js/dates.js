// Calendar dates as YYYY-MM-DD. Week math uses UTC so a date never shifts
// across a timezone boundary.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CNRDates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parseISO(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!match) return null;
    return { y: +match[1], m: +match[2], d: +match[3] };
  }

  function toISO(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    var mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(dt.getUTCDate()).padStart(2, '0');
    return dt.getUTCFullYear() + '-' + mm + '-' + dd;
  }

  function isRealDate(iso) {
    var parts = parseISO(iso);
    if (!parts) return false;
    return toISO(parts.y, parts.m, parts.d) === iso;
  }

  function addDays(iso, days) {
    var parts = parseISO(iso);
    if (!parts) return null;
    return toISO(parts.y, parts.m, parts.d + days);
  }

  function mondayOf(iso) {
    var parts = parseISO(iso);
    if (!parts) return null;
    var dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    var dow = dt.getUTCDay();
    var delta = dow === 0 ? -6 : 1 - dow;
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function isMonday(iso) {
    return isRealDate(iso) && mondayOf(iso) === iso;
  }

  function formatLong(iso) {
    if (!isRealDate(iso)) return '';
    var parts = parseISO(iso);
    var dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    }).format(dt);
  }

  function formatWeekday(iso) {
    if (!isRealDate(iso)) return '';
    var parts = parseISO(iso);
    var dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dt);
  }

  function formatMonthDay(iso) {
    if (!isRealDate(iso)) return '';
    var parts = parseISO(iso);
    var dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dt);
  }

  function trainingWeekNumber(anchor, weekStart) {
    var base = mondayOf(anchor);
    var week = mondayOf(weekStart);
    if (!base || !week) return null;
    var from = Date.parse(base + 'T00:00:00Z');
    var to = Date.parse(week + 'T00:00:00Z');
    return Math.round((to - from) / (86400000 * 7)) + 1;
  }

  function weekRangeLabel(anchor, weekStart) {
    var week = mondayOf(weekStart);
    if (!week) return '';
    var end = addDays(week, 6);
    var range = formatMonthDay(week) + ' – ' + formatMonthDay(end);
    var number = trainingWeekNumber(anchor, week);
    if (number == null) return range;
    return 'Week ' + number + ' · ' + range;
  }

  function todayISO() {
    var now = new Date();
    return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  return {
    parseISO: parseISO,
    toISO: toISO,
    isRealDate: isRealDate,
    addDays: addDays,
    mondayOf: mondayOf,
    isMonday: isMonday,
    formatLong: formatLong,
    formatWeekday: formatWeekday,
    formatMonthDay: formatMonthDay,
    trainingWeekNumber: trainingWeekNumber,
    weekRangeLabel: weekRangeLabel,
    todayISO: todayISO
  };
});
