// Lesson Map - server script (APPLICATION_SPEC C5.2).
//
// A thin adapter over WpmAttemptService (C4.6): status comes from one
// aggregate over the caller's passed attempts; no progress table is stored.
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
    widget: 'x-snc-ttt-lesson-map',
    handlers: {
      getState: function getState() {
        return service.getLessonMap();
      }
    },
    messages: {
      server_error: gs.getMessage('The lessons could not be loaded. Try again.')
    }
  });
}
