// History - server script (APPLICATION_SPEC B3.5, C5.4).
//
// A thin adapter over WpmAttemptService (C4.6). getState: one page of the
// caller's completed attempts with the AWPM trend and weak keys
// (getHistory). getAttempt: one attempt's read-only result block.
//
// Written in ES5 style (var/function) for the Glide script engine.
export default function server(data, _options, input) {
  var service;
  try {
    service = new x_snc_ttt.WpmAttemptService();
  } catch (e) {
    data.isError = true;
    data.errorCode = 'not_installed';
    data.errorMessage = gs.getMessage(
      'Abel Tuter Teaches Typing is not installed on this instance. Ask your administrator to deploy it.'
    );
    return;
  }

  service.respond(data, input, {
    widget: 'x-snc-ttt-history',
    handlers: {
      getState: function getState(params) {
        return service.getHistory({ mode: params.mode, page: params.page });
      },
      getAttempt: function getAttempt(params) {
        return service.getAttemptResult({ sysId: params.sysId });
      }
    },
    messages: {
      not_found: gs.getMessage('That attempt was not found.'),
      server_error: gs.getMessage('Your history could not be loaded. Try again.')
    }
  });
}
