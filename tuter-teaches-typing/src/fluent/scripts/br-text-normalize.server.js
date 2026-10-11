/* global WpmAttemptService */
// br_text_normalize - before insert/update on lesson, passage and custom
// passage (C2.1). Normalizes the text to printable ASCII with single spaces,
// enforces the per-table length limits, and requires a title of at most 80
// characters. The rules live in WpmAttemptService.normalizeText so the custom
// passage widget can validate with the same code before saving.
(function executeRule(current, _previous) {
  var KINDS = {
    x_snc_ttt_lesson: 'lesson',
    x_snc_ttt_passage: 'passage',
    x_snc_ttt_custom_passage: 'custom'
  };

  var title;
  var kind;
  var normalized;
  function abort(message) {
    gs.addErrorMessage(message);
    current.setAbortAction(true);
  }

  title = String(current.getValue('title') || '')
    .replace(/\s+/g, ' ')
    .replace(/^ +| +$/g, '');
  if (!title) {
    abort(gs.getMessage('Enter a title.'));
    return;
  }
  if (title.length > 80) {
    abort(gs.getMessage('The title can be at most 80 characters long.'));
    return;
  }
  current.setValue('title', title);

  kind = KINDS[current.getTableName()] || 'custom';
  normalized = new WpmAttemptService().normalizeText(
    current.getValue('text'),
    kind
  );
  if (normalized.errorCode) {
    abort(normalized.message);
    return;
  }
  current.setValue('text', normalized.text);
}(current, previous));
