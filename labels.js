// Batch display names. The id on each VA stays YYYY-MM.
// A missing or blank name falls back to "Batch N · Mon YYYY",
// where N is the 1-based place of that id in the sorted id list.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CNRLabels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var MAX = 80;

  function monthLabel(id) {
    if (!id) return '';
    var d = new Date(id + '-01T00:00');
    if (isNaN(d.getTime())) return String(id);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function cleanName(raw) {
    return String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ').slice(0, MAX);
  }

  function normalizeBatchNames(raw) {
    var src = raw;
    if (typeof src === 'string') {
      try { src = JSON.parse(src); } catch (e) { src = null; }
    }
    var out = {};
    if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
    Object.keys(src).forEach(function (key) {
      var id = String(key).trim();
      var name = cleanName(src[key]);
      if (id && name) out[id] = name;
    });
    return out;
  }

  function defaultBatchLabel(id, ids) {
    var list = (ids || []).filter(Boolean).slice().sort();
    var n = list.indexOf(id) + 1;
    if (n < 1) n = list.length + 1;
    return 'Batch ' + n + ' · ' + monthLabel(id);
  }

  function batchLabel(id, names, ids) {
    if (!id) return 'Unassigned';
    var map = normalizeBatchNames(names);
    if (map[id]) return map[id];
    return defaultBatchLabel(id, ids);
  }

  function renameBatch(names, id, raw, ids) {
    var current = normalizeBatchNames(names);
    if (!id) return { ok: false, names: current, error: 'This batch has no id.' };
    var value = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
    if (value.length > MAX) {
      return { ok: false, names: current, error: 'Use 80 characters or fewer.' };
    }
    var next = {};
    Object.keys(current).forEach(function (key) { next[key] = current[key]; });
    if (!value) delete next[id];
    else next[id] = value;
    if (value) {
      var needle = value.toLowerCase();
      var clash = (ids || []).some(function (other) {
        return other !== id && batchLabel(other, next, ids).toLowerCase() === needle;
      });
      if (clash) {
        return { ok: false, names: current, error: 'Another batch is already called ' + value + '.' };
      }
    }
    return { ok: true, names: next, error: '' };
  }

  return {
    MAX: MAX,
    monthLabel: monthLabel,
    normalizeBatchNames: normalizeBatchNames,
    defaultBatchLabel: defaultBatchLabel,
    batchLabel: batchLabel,
    renameBatch: renameBatch
  };
});
