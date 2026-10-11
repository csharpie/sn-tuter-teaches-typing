// Abel Tuter Teaches Typing - server script.
//
// A thin adapter over WpmAttemptService (C4.6): it parses input, calls one
// service method, and every action also returns the full session config, so
// one round trip refreshes the UI. Typed text and keystroke logs are never
// logged.
//
// Written in ES5 style (var/function) for the Glide script engine.
export default function server(data, options, input) {
  var MAX_LOG_JSON = 1000000;
  var service;
  var params;
  var source;
  var request;

  // The session config with the action's outcome on top. An error from the
  // action wins over one from the config.
  function withConfig(outcome) {
    var done = outcome || {};
    var result = service.getSessionConfig(request);
    result.errorCode = done.errorCode || result.errorCode;
    if (done.attempt) {
      result.attempt = done.attempt;
      result.passage = done.passage;
    }
    if (done.result) {
      result.result = done.result;
    }
    if (done.preferences) {
      result.preferences = done.preferences;
    }
    return result;
  }

  function parseLog(log) {
    if (typeof log !== 'string') {
      return log;
    }
    if (log.length > MAX_LOG_JSON) {
      return null;
    }
    try {
      return JSON.parse(log);
    } catch (e) {
      return null;
    }
  }

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

  // The first load reads the component's properties; actions send them along.
  params = input || {};
  source = params.action ? params : options || {};
  request = {
    mode: String(source.mode || ''),
    lessonId: String(source.lessonId || ''),
    customId: String(source.customId || source.passageId || ''),
    durationSeconds: source.durationSeconds || source.duration
  };

  service.respond(data, input, {
    widget: 'x-snc-ttt-typing-session',
    handlers: {
      getState: function getState() {
        return withConfig({});
      },
      startAttempt: function startAttempt() {
        return withConfig(service.startAttempt(request));
      },
      submitAttempt: function submitAttempt(p) {
        return withConfig(
          service.submitAttempt({ attemptId: p.attemptId, log: parseLog(p.log), ended: p.ended })
        );
      },
      abandonAttempt: function abandonAttempt(p) {
        return withConfig(service.abandonAttempt({ attemptId: p.attemptId }));
      },
      savePreferences: function savePreferences(p) {
        return withConfig(service.savePreferences(p.preferences || {}));
      }
    }
  });
}
