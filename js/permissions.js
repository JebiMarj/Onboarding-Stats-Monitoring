// Role matrix mirrored by Supabase RLS. The database is the real gate.
// Onboarders may work on every VA, not only VAs they onboarded.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CNRPermissions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ACTIONS = {
    view: ['admin', 'onboarder', 'qa', 'viewer'],
    manage_va: ['admin', 'onboarder'],
    delete_va: ['admin'],
    batches: ['admin', 'onboarder'],
    attendance: ['admin', 'onboarder'],
    wbr: ['admin', 'onboarder'],
    competencies: ['admin', 'onboarder'],
    coaching: ['admin', 'onboarder'],
    evaluations: ['admin', 'onboarder'],
    qa: ['admin', 'qa'],
    settings: ['admin'],
    users: ['admin'],
    endorse: ['admin'],
    undo_attendance: ['admin']
  };

  function can(role, action) {
    var allowed = ACTIONS[action];
    return !!(allowed && allowed.indexOf(role) !== -1);
  }

  return { ACTIONS: ACTIONS, can: can };
});
