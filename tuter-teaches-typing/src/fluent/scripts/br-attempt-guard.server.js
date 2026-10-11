/* global WpmAttemptService */
// br_attempt_guard - before insert on x_snc_ttt_attempt (C10, A2.5).
//
// For every caller: the mode must be valid and must match its reference.
// For non-admins: force ownership, state and start time; clear every score
// field so a forged attempt cannot carry scores; and take the text snapshot
// from real content (or verify it), so an attempt created through a form,
// list, import or script cannot be scored against made-up text or a locked
// lesson.
(function executeRule(current, _previous) {
  var MODES = ['lesson', 'speed_test', 'custom'];
  var DURATIONS = [60, 120, 180, 300];
  var SCORE_VALUES = [
    'completed_on',
    'elapsed_ms',
    'typed_chars',
    'keystrokes',
    'missed_keystrokes',
    'errors',
    'gross_wpm',
    'net_wpm',
    'accuracy',
    'flag_reason'
  ];
  var SCORE_FLAGS = ['passed', 'personal_best', 'flagged'];

  var mode;
  var v;
  var f;
  var service;
  var lesson;
  var custom;
  function abort(message) {
    gs.addErrorMessage(message);
    current.setAbortAction(true);
  }

  mode = current.getValue('mode');
  if (MODES.indexOf(mode) < 0) {
    abort(gs.getMessage('Choose a lesson, speed test or custom mode.'));
    return;
  }
  if (mode === 'lesson' && !current.getValue('lesson')) {
    abort(gs.getMessage('A lesson attempt needs a lesson.'));
    return;
  }
  if (mode === 'custom' && !current.getValue('custom_passage')) {
    abort(gs.getMessage('A custom attempt needs a custom passage.'));
    return;
  }
  if (
    mode === 'speed_test'
    && DURATIONS.indexOf(parseInt(current.getValue('duration_seconds'), 10)) < 0
  ) {
    abort(
      gs.getMessage('A speed test needs a duration of 1, 2, 3 or 5 minutes.')
    );
    return;
  }

  if (gs.hasRole('x_snc_ttt.admin')) {
    if (!current.getValue('started_on')) {
      current.setValue('started_on', new GlideDateTime().getValue());
    }
    return;
  }

  current.setValue('user', gs.getUserID());
  current.setValue('state', 'in_progress');
  current.setValue('started_on', new GlideDateTime().getValue());
  for (v = 0; v < SCORE_VALUES.length; v += 1) {
    current.setValue(SCORE_VALUES[v], '');
  }
  for (f = 0; f < SCORE_FLAGS.length; f += 1) {
    current.setValue(SCORE_FLAGS[f], false);
  }

  service = new WpmAttemptService();
  if (mode === 'lesson') {
    // Plain GlideRecord on purpose: the snapshot must come from the stored
    // lesson, whatever the caller submitted.
    lesson = new GlideRecord('x_snc_ttt_lesson');
    if (!lesson.get(current.getValue('lesson'))) {
      abort(gs.getMessage('That lesson was not found.'));
      return;
    }
    if (!service.isLessonUnlocked(lesson.getUniqueValue(), gs.getUserID())) {
      abort(
        gs.getMessage('Finish the earlier lessons to unlock this one.')
      );
      return;
    }
    current.setValue('passage_title', lesson.getValue('title'));
    current.setValue('passage_text', lesson.getValue('text'));
  } else if (mode === 'custom') {
    // Plain GlideRecord on purpose: ownership is checked here explicitly.
    custom = new GlideRecord('x_snc_ttt_custom_passage');
    if (
      !custom.get(current.getValue('custom_passage'))
      || custom.getValue('user') !== gs.getUserID()
    ) {
      abort(gs.getMessage('Choose one of your own custom passages.'));
      return;
    }
    current.setValue('passage_title', custom.getValue('title'));
    current.setValue('passage_text', custom.getValue('text'));
  } else if (!service.isActivePassageText(current.getValue('passage_text'))) {
    abort(
      gs.getMessage('Speed tests can only use the active speed-test passages.')
    );
  }
}(current, previous));
