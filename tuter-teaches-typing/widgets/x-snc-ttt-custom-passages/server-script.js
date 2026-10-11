// Custom Passages - server script (APPLICATION_SPEC B3.4, C5.3).
//
// A thin adapter over WpmAttemptService (C4.6): lists, saves and deletes the
// caller's own passages. Every action returns the full list; a save or delete
// also reports actionStatus and actionMessage (and actionField for the form).
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
    widget: 'x-snc-ttt-custom-passages',
    handlers: {
      getState: function getState() {
        return service.getCustomPassages();
      },
      savePassage: function savePassage(params) {
        return service.saveCustomPassage({
          sysId: params.sysId,
          title: params.title,
          text: params.text
        });
      },
      deletePassage: function deletePassage(params) {
        return service.deleteCustomPassage({ sysId: params.sysId });
      }
    },
    messages: {
      server_error: gs.getMessage('Your passages could not be loaded. Try again.')
    }
  });
}
