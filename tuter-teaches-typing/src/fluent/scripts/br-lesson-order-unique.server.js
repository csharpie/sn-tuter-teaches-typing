// br_lesson_order_unique - before insert/update on x_snc_ttt_lesson (C10).
// Keeps `order` unique among active lessons (it sets the unlock sequence) and
// keeps the pass thresholds inside their C2 ranges.
(function executeRule(current, _previous) {
  var minAccuracy;
  var target;
  var active;
  var duplicate;
  function abort(message) {
    gs.addErrorMessage(message);
    current.setAbortAction(true);
  }

  minAccuracy = parseInt(current.getValue('min_accuracy'), 10);
  if (Number.isNaN(minAccuracy) || minAccuracy < 50 || minAccuracy > 100) {
    abort(gs.getMessage('Minimum accuracy must be between 50 and 100.'));
    return;
  }
  target = parseInt(current.getValue('target_net_wpm'), 10);
  if (Number.isNaN(target) || target < 0 || target > 200) {
    abort(gs.getMessage('Target adjusted speed must be between 0 and 200.'));
    return;
  }

  active = current.getValue('active');
  if (!(active === true || active === 'true' || active === '1')) {
    return;
  }
  // Plain GlideRecord on purpose: uniqueness must be checked against every
  // active lesson, not only the ones the caller can read.
  duplicate = new GlideRecord('x_snc_ttt_lesson');
  duplicate.addQuery('active', true);
  duplicate.addQuery('order', current.getValue('order'));
  duplicate.addQuery('sys_id', '!=', current.getUniqueValue());
  duplicate.setLimit(1);
  duplicate.query();
  if (duplicate.hasNext()) {
    abort(
      gs.getMessage('Another active lesson already uses order {0}.', [
        String(current.getValue('order'))
      ])
    );
  }
}(current, previous));
