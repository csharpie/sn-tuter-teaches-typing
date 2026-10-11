import { html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement, decorators } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { navigate } from '@servicenow/aiux/aiux-client';
import { icon } from '@servicenow/aiux/aiux-directive-icon';
import setDocumentTitle from '../../utils/document-title.js';
import '../../widgets/x-snc-ttt-custom-passages/index.js';
import '../../widgets/x-snc-ttt-typing-session/index.js';

const { acl } = decorators;

const SYS_ID = /^[0-9a-f]{32}$/;

function practicePassage(e) {
  if (e.detail?.passageId) navigate(`/custom?passage=${e.detail.passageId}`);
}

function backToList() {
  navigate('/custom');
}

/**
 * /custom (APPLICATION_SPEC B3.4): the player's own passages, and the typing
 * session for the passage in ?passage=<sys_id>. Custom attempts appear in
 * history but never unlock lessons.
 */
@customElement('x-snc-ttt-custom-page')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
export default class CustomPage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  static async loader(ctx) {
    const passage = String(ctx.query?.passage || '');
    return {
      basePath: ctx.basePath || '',
      passageId: SYS_ID.test(passage) ? passage : '',
    };
  }

  constructor() {
    super();
    this._shownPassage = undefined;
  }

  firstUpdated() {
    setDocumentTitle(i18n.getMessage('Custom lessons'));
  }

  updated(changed) {
    super.updated?.(changed);
    const passageId = this.loaderData?.passageId || '';
    if (this._shownPassage !== undefined && this._shownPassage !== passageId) {
      this.renderRoot.querySelector('h1')?.focus();
    }
    this._shownPassage = passageId;
  }

  render() {
    const { basePath = '', passageId = '' } = this.loaderData || {};
    return html`<div class="mx-auto flex max-w-6xl flex-col gap-6 px-3 py-4 sm:p-6 lg:p-8">
      <header class="flex flex-col gap-1">
        <h1 class="text-3xl font-bold text-text-primary" tabindex="-1">
          ${i18n.getMessage('Custom lessons')}
        </h1>
        <p class="text-text-secondary">
          ${i18n.getMessage(
            'Practice with your own text. Custom passages count in your history but do not unlock lessons.',
          )}
        </p>
      </header>
      ${passageId
        ? html`<a class="aiux-link w-fit" href="${basePath}/custom">
              ${icon({ name: 'arrow-left', size: 'sm' })} ${i18n.getMessage('All passages')}
            </a>
            <x-snc-ttt-typing-session
              mode="custom"
              passage-id=${passageId}
              @session-exit=${backToList}
            ></x-snc-ttt-typing-session>`
        : nothing}
      <div ?hidden=${!!passageId}>
        <x-snc-ttt-custom-passages
          @passage-practice=${practicePassage}
        ></x-snc-ttt-custom-passages>
      </div>
    </div>`;
  }
}
