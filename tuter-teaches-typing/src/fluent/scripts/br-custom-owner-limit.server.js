// br_custom_owner_limit - before insert on x_snc_ttt_custom_passage (C10).
// Forces ownership for non-admins and rejects a player's 101st passage.
(function executeRule(current, _previous) {
  var MAX_PASSAGES = 100;

  var ga;
  var count;
  if (!gs.hasRole('x_snc_ttt.admin')) {
    current.setValue('user', gs.getUserID());
  }

  // Plain GlideAggregate on purpose: the limit counts every passage the owner
  // has, independent of what the caller can read.
  ga = new GlideAggregate('x_snc_ttt_custom_passage');
  ga.addQuery('user', current.getValue('user'));
  ga.addAggregate('COUNT');
  ga.query();
  count = ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) || 0 : 0;
  if (count >= MAX_PASSAGES) {
    gs.addErrorMessage(
      gs.getMessage(
        'You can keep up to {0} custom passages. Delete one to add another.',
        [String(MAX_PASSAGES)]
      )
    );
    current.setAbortAction(true);
  }
}(current, previous));
