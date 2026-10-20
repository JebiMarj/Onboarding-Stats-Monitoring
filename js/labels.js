// Shared labels. Section keys match js/score.js and the SQL snapshot.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CNRLabels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SECTION_LABELS = {
    attendance: 'Attendance',
    conversion: 'Sales conversion',
    qa: 'QA score',
    tool_navigation: 'Tool navigation',
    communication: 'Communication',
    critical_thinking: 'Critical thinking',
    core_values: 'Core values'
  };

  var STATUSES = [
    'Onboarding',
    'Continue onboarding',
    'Ready for endorsement',
    'Endorsed',
    'Resigned',
    'EOC'
  ];

  var CREATE_STATUSES = ['Onboarding', 'Continue onboarding', 'Resigned', 'EOC'];

  var ROLES = [
    { id: 'admin', label: 'Admin' },
    { id: 'onboarder', label: 'Onboarder' },
    { id: 'qa', label: 'QA' },
    { id: 'viewer', label: 'Viewer' }
  ];

  function roleLabel(role) {
    for (var i = 0; i < ROLES.length; i++) {
      if (ROLES[i].id === role) return ROLES[i].label;
    }
    return 'Viewer';
  }

  return {
    SECTION_LABELS: SECTION_LABELS,
    STATUSES: STATUSES,
    CREATE_STATUSES: CREATE_STATUSES,
    ROLES: ROLES,
    roleLabel: roleLabel
  };
});
