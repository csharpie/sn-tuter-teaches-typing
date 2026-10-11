import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement, decorators } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import setDocumentTitle from '../../utils/document-title.js';
import productName from '../../utils/product-name.js';
import '../../widgets/x-snc-ttt-dashboard/index.js';

const { acl } = decorators;

// /home shows personal stats, so it needs the player role too (A5.7).
@customElement('x-snc-ttt-home-page')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
export default class HomePage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100%;
    }
  `;

  static async loader(ctx) {
    return { basePath: ctx.basePath || '' };
  }

  firstUpdated() {
    setDocumentTitle(i18n.getMessage('Home'));
  }

  render() {
    const { basePath = '' } = this.loaderData || {};
    return html`<div class="mx-auto flex max-w-6xl flex-col gap-6 px-3 py-4 sm:p-6 lg:p-8">
      <header class="flex flex-col gap-1">
        <h1 class="text-3xl font-bold text-text-primary">
          ${productName()}
        </h1>
        <p class="text-text-secondary">
          ${i18n.getMessage(
            'Build typing speed and accuracy with lessons, timed tests and your own passages.',
          )}
        </p>
      </header>
      <x-snc-ttt-dashboard base-path=${basePath}></x-snc-ttt-dashboard>
    </div>`;
  }
}
