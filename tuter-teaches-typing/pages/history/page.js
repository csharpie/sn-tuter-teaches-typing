import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement, decorators } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import setDocumentTitle from '../../utils/document-title.js';
import '../../widgets/x-snc-ttt-history/index.js';

const { acl } = decorators;

/** /history (APPLICATION_SPEC B3.5). */
@customElement('x-snc-ttt-history-page')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
export default class HistoryPage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  firstUpdated() {
    setDocumentTitle(i18n.getMessage('History'));
  }

  render() {
    return html`<div class="mx-auto flex max-w-6xl flex-col gap-6 px-3 py-4 sm:p-6 lg:p-8">
      <header class="flex flex-col gap-1">
        <h1 class="text-3xl font-bold text-text-primary">${i18n.getMessage('History')}</h1>
        <p class="text-text-secondary">
          ${i18n.getMessage(
            'See how your speed changes over time and which keys trip you up the most.',
          )}
        </p>
      </header>
      <x-snc-ttt-history></x-snc-ttt-history>
    </div>`;
  }
}
