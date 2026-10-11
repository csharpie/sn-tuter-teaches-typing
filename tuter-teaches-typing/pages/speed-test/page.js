import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement, decorators } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import setDocumentTitle from '../../utils/document-title.js';
import '../../widgets/x-snc-ttt-typing-session/index.js';

const { acl } = decorators;

/**
 * /speed-test (APPLICATION_SPEC B3.3): a timed test of 1, 2, 3 or 5 minutes on
 * a random passage. Completed timed rounds update the player's profile WPM.
 */
@customElement('x-snc-ttt-speed-test-page')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
export default class SpeedTestPage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  firstUpdated() {
    setDocumentTitle(i18n.getMessage('Speed test'));
  }

  render() {
    return html`<div class="mx-auto flex max-w-6xl flex-col gap-6 px-3 py-4 sm:p-6 lg:p-8">
      <header class="flex flex-col gap-1">
        <h1 class="text-3xl font-bold text-text-primary">
          ${i18n.getMessage('Speed test')}
        </h1>
        <p class="text-text-secondary">
          ${i18n.getMessage(
            'Pick a length, then type as much as you can before the timer runs out. Your best and latest speed are saved to your profile.',
          )}
        </p>
      </header>
      <x-snc-ttt-typing-session mode="speed_test" duration="60"></x-snc-ttt-typing-session>
    </div>`;
  }
}
