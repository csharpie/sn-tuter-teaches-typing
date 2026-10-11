// Home dashboard - server script (APPLICATION_SPEC B3.1, C5.5).
//
// A thin adapter over WpmAttemptService.getDashboard() (C4.6): best
// speed-test AWPM, recent accuracy, lesson progress, the next lesson and an
// AWPM sparkline.
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
    widget: 'x-snc-ttt-dashboard',
    handlers: {
      getState: function getState() {
        return service.getDashboard();
      }
    },
    messages: {
      server_error: gs.getMessage('Your progress could not be loaded. Try again.')
    }
  });
}
