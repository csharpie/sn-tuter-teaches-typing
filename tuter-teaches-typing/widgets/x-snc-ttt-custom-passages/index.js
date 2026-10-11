import {
  html, css, nothing, isServer,
} from 'lit';
import { customElement } from 'lit/decorators.js';
import {
  AIUXWidgetElement,
  decorators,
} from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { AriaLiveController } from '@servicenow/aiux/aiux-controller-aria-live';
import { icon } from '@servicenow/aiux/aiux-directive-icon';
import '@servicenow/aiux/aiux-components-dialog';
import '@servicenow/aiux/aiux-components-empty-state-content';
import { formatInteger } from '../../utils/format.js';

const {
  name,
  description,
  bestFor,
  category,
  chatCompatible,
  server,
  acl,
  discoverable,
} = decorators;

const TITLE_MAX = 80;
const TEXT_MIN = 50;
const TEXT_MAX = 2000;

/**
 * Custom passages (APPLICATION_SPEC B3.4, C5.3): the player's own practice
 * texts with New, Edit, Delete and Practice. Fires `passage-practice`
 * {passageId}; the host page opens the typing session.
 */
@customElement('x-snc-ttt-custom-passages')
@name('Custom Passages')
@description(
  'Lets the signed-in user create, edit, delete and practice their own Abel Tuter Teaches Typing typing passages.',
)
@bestFor('Managing and practicing personal typing passages.')
@category('custom')
@chatCompatible(false)
@server('./server-script.js')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
@discoverable(true)
export default class CustomPassages extends AIUXWidgetElement {
  static fetchDataOnConnect = false;

  static properties = {
    _state: { type: Object, state: true },
    _error: { type: String, state: true },
    _editor: { type: Object, state: true },
    _confirm: { type: Object, state: true },
    _busy: { type: Boolean, state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
  `;

  // The controller builds its live regions in its constructor, which crashes
  // under the SSR DOM shim, so it is created in firstUpdated (client only).
  _live = null;

  constructor() {
    super();
    this._state = null;
    this._error = '';
    this._editor = null;
    this._confirm = null;
    this._busy = false;
  }

  firstUpdated() {
    this._live = new AriaLiveController(this);
    this._load();
  }

  async _send(input) {
    try {
      return (await this.server.get(input)) || null;
    } catch {
      return null;
    }
  }

  async _load() {
    if (isServer) return;
    const response = await this._send({ action: 'getState' });
    if (!response || response.isError) {
      this._error = response?.errorMessage
        || i18n.getMessage(
          "Your passages couldn't be loaded. Check that you have the Abel Tuter Teaches Typing player role, then try again.",
        );
      return;
    }
    this._error = '';
    this._state = response;
  }

  // ------------------------------------------------------------ actions

  _practice(passageId) {
    this.dispatchEvent(
      new CustomEvent('passage-practice', {
        detail: { passageId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _openEditor(passage) {
    this._editor = {
      sysId: passage?.sysId || '',
      title: passage?.title || '',
      text: passage?.text || '',
      errors: {},
      message: '',
    };
  }

  _closeEditor = () => {
    this._editor = null;
  };

  _onField(field, value) {
    const errors = { ...this._editor.errors };
    delete errors[field];
    this._editor = { ...this._editor, [field]: value, errors };
  }

  _validate() {
    const errors = {};
    const title = this._editor.title.trim();
    const { length } = this._editor.text.replace(/\s+/g, ' ').trim();
    if (!title) errors.title = i18n.getMessage('Enter a title.');
    else if (title.length > TITLE_MAX) {
      errors.title = i18n.getMessage('The title can be at most {0} characters long.', [
        formatInteger(TITLE_MAX, this._locale),
      ]);
    }
    if (length < TEXT_MIN) {
      errors.text = i18n.getMessage('The text must be at least {0} characters long.', [
        formatInteger(TEXT_MIN, this._locale),
      ]);
    } else if (length > TEXT_MAX) {
      errors.text = i18n.getMessage('The text can be at most {0} characters long.', [
        formatInteger(TEXT_MAX, this._locale),
      ]);
    }
    return errors;
  }

  _focusField(field) {
    this.updateComplete.then(() => this.renderRoot.querySelector(`#passage-${field}`)?.focus());
  }

  _save = async (e) => {
    e.preventDefault();
    if (this._busy || !this._editor) return;
    const errors = this._validate();
    if (Object.keys(errors).length) {
      this._editor = { ...this._editor, errors };
      this._focusField(errors.title ? 'title' : 'text');
      return;
    }
    this._busy = true;
    const response = await this._send({
      action: 'savePassage',
      sysId: this._editor.sysId,
      title: this._editor.title,
      text: this._editor.text,
    });
    this._busy = false;
    if (!response || response.isError) {
      this._editor = {
        ...this._editor,
        message:
          response?.errorMessage || i18n.getMessage('The passage could not be saved.'),
      };
      return;
    }
    this._state = response;
    if (response.actionStatus === 'error') {
      if (response.actionField) {
        this._editor = {
          ...this._editor,
          errors: { [response.actionField]: response.actionMessage },
        };
        this._focusField(response.actionField);
      } else {
        this._editor = { ...this._editor, message: response.actionMessage };
      }
      return;
    }
    this._editor = null;
    this._live?.announce(response.actionMessage || i18n.getMessage('Passage saved.'));
  };

  _askDelete(passage) {
    this._confirm = passage;
  }

  _closeConfirm = () => {
    this._confirm = null;
  };

  _delete = async () => {
    const passage = this._confirm;
    if (!passage || this._busy) return;
    const ids = (this._state?.passages || []).map((p) => p.sysId);
    const index = ids.indexOf(passage.sysId);
    const neighbour = ids[index + 1] || ids[index - 1] || null;
    this._busy = true;
    const response = await this._send({ action: 'deletePassage', sysId: passage.sysId });
    this._busy = false;
    this._confirm = null;
    if (!response || response.isError || response.actionStatus === 'error') {
      this._error = response?.actionMessage
        || response?.errorMessage
        || i18n.getMessage('The passage could not be deleted.');
      return;
    }
    this._state = response;
    this._live?.announce(response.actionMessage || i18n.getMessage('Passage deleted.'));
    // Never leave focus on a removed row: move to its neighbour or to New.
    this.updateComplete.then(() => {
      const target = neighbour
        ? this.renderRoot.querySelector(`[data-practice="${neighbour}"]`)
        : this.renderRoot.querySelector('[data-new]');
      target?.focus();
    });
  };

  get _locale() {
    return this._state?.locale || 'en';
  }

  // ------------------------------------------------------------ render

  _renderEditor() {
    const editor = this._editor;
    if (!editor) return nothing;
    const { length } = editor.text;
    return html`<aiux-dialog
      open
      size="lg"
      @aiux-dialog-close=${this._closeEditor}
    >
      <div slot="header" id="passage-dialog-title">
        ${editor.sysId
          ? i18n.getMessage('Edit passage')
          : i18n.getMessage('New passage')}
      </div>
      <form
        id="passage-form"
        class="flex flex-col gap-4"
        aria-labelledby="passage-dialog-title"
        novalidate
        @submit=${this._save}
      >
        ${editor.message
          ? html`<div class="aiux-alert aiux-alert-error aiux-alert-soft" role="alert">
              ${icon({ name: 'circle-exclamation', size: 'sm' })}
              <span>${editor.message}</span>
            </div>`
          : nothing}
        <div class="flex flex-col gap-1">
          <label for="passage-title" class="text-sm font-medium text-text-primary">
            ${i18n.getMessage('Title')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="passage-title"
            class="aiux-input w-full ${editor.errors.title ? 'aiux-input-error' : ''}"
            maxlength=${TITLE_MAX}
            required
            aria-required="true"
            aria-invalid=${editor.errors.title ? 'true' : 'false'}
            aria-describedby="passage-title-error"
            .value=${editor.title}
            @input=${(e) => this._onField('title', e.target.value)}
          />
          <p id="passage-title-error" class="text-sm text-error" role="alert">
            ${editor.errors.title || nothing}
          </p>
        </div>
        <div class="flex flex-col gap-1">
          <label for="passage-text" class="text-sm font-medium text-text-primary">
            ${i18n.getMessage('Text')} <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="passage-text"
            class="aiux-textarea w-full ${editor.errors.text ? 'aiux-textarea-error' : ''}"
            rows="8"
            required
            aria-required="true"
            aria-invalid=${editor.errors.text ? 'true' : 'false'}
            aria-describedby="passage-text-help passage-text-error"
            .value=${editor.text}
            @input=${(e) => this._onField('text', e.target.value)}
          ></textarea>
          <p id="passage-text-help" class="text-xs text-text-secondary">
            ${i18n.getMessage(
              'Between {0} and {1} characters, using only characters on a standard US keyboard. Line breaks become spaces. ({2} so far)',
              [
                formatInteger(TEXT_MIN, this._locale),
                formatInteger(TEXT_MAX, this._locale),
                formatInteger(length, this._locale),
              ],
            )}
          </p>
          <p id="passage-text-error" class="text-sm text-error" role="alert">
            ${editor.errors.text || nothing}
          </p>
        </div>
      </form>
      <div slot="footer" class="flex flex-wrap justify-end gap-2">
        <button type="button" class="aiux-btn aiux-btn-ghost" @click=${this._closeEditor}>
          ${i18n.getMessage('Cancel')}
        </button>
        <button
          type="submit"
          form="passage-form"
          class="aiux-btn aiux-btn-primary"
          ?disabled=${this._busy}
        >
          ${this._busy
            // A spinner inside a button is action feedback, which the rule allows.
            // eslint-disable-next-line @servicenow/aiux-style/prefer-skeleton-loader
            ? html`<span class="aiux-loading aiux-loading-spinner aiux-loading-xs"></span>`
            : nothing}
          ${i18n.getMessage('Save')}
        </button>
      </div>
    </aiux-dialog>`;
  }

  _renderConfirm() {
    const passage = this._confirm;
    if (!passage) return nothing;
    return html`<aiux-dialog open size="sm" @aiux-dialog-close=${this._closeConfirm}>
      <div slot="header">${i18n.getMessage('Delete passage?')}</div>
      <p class="break-words text-text-primary">
        ${i18n.getMessage(
          'Delete "{0}"? Attempts you made with it stay in your history.',
          [passage.title],
        )}
      </p>
      <div slot="footer" class="flex flex-wrap justify-end gap-2">
        <button type="button" class="aiux-btn aiux-btn-ghost" @click=${this._closeConfirm}>
          ${i18n.getMessage('Cancel')}
        </button>
        <button
          type="button"
          class="aiux-btn aiux-btn-error"
          ?disabled=${this._busy}
          @click=${this._delete}
        >
          ${i18n.getMessage('Delete')}
        </button>
      </div>
    </aiux-dialog>`;
  }

  _renderPassage(passage) {
    const titleId = `passage-${passage.sysId}`;
    return html`<li class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4">
      <div class="flex flex-col gap-1">
        <h3 id=${titleId} class="break-words text-base font-semibold text-text-primary">
          ${passage.title}
        </h3>
        <p class="text-sm text-text-secondary">
          ${i18n.getMessage('{0} characters · Updated {1}', [
            formatInteger(passage.length, this._locale),
            passage.updatedOn,
          ])}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="aiux-btn aiux-btn-sm aiux-btn-primary"
          data-practice=${passage.sysId}
          aria-describedby=${titleId}
          @click=${() => this._practice(passage.sysId)}
        >
          ${icon({ name: 'play', size: 'sm' })} ${i18n.getMessage('Practice')}
        </button>
        <button
          type="button"
          class="aiux-btn aiux-btn-sm aiux-btn-outline"
          aria-describedby=${titleId}
          @click=${() => this._openEditor(passage)}
        >
          ${icon({ name: 'pencil', size: 'sm' })} ${i18n.getMessage('Edit')}
        </button>
        <button
          type="button"
          class="aiux-btn aiux-btn-sm aiux-btn-ghost"
          aria-describedby=${titleId}
          @click=${() => this._askDelete(passage)}
        >
          ${icon({ name: 'trash', size: 'sm' })} ${i18n.getMessage('Delete')}
        </button>
      </div>
    </li>`;
  }

  render() {
    if (!this._state && !this._error) {
      return html`<div
        role="status"
        aria-label=${i18n.getMessage('Loading your passages')}
        class="flex flex-col gap-3"
      >
        ${[0, 1, 2].map(
          () => html`<div class="aiux-skeleton h-24 w-full" aria-hidden="true"></div>`,
        )}
      </div>`;
    }
    const passages = this._state?.passages || [];
    const limit = this._state?.limit || 100;
    return html`<div class="flex flex-col gap-4">
      ${this._error
        ? html`<div class="aiux-alert aiux-alert-error aiux-alert-soft" role="alert">
            ${icon({ name: 'circle-exclamation', size: 'sm' })}
            <span>${this._error}</span>
          </div>`
        : nothing}
      ${this._state
        ? html`<div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-text-primary">
                ${i18n.getMessage('Your passages')}
              </h2>
              <p class="text-sm text-text-secondary">
                ${i18n.getMessage('{0} of {1} passages', [
                  formatInteger(passages.length, this._locale),
                  formatInteger(limit, this._locale),
                ])}
              </p>
            </div>
            <button
              type="button"
              class="aiux-btn aiux-btn-primary"
              data-new
              ?disabled=${passages.length >= limit}
              @click=${() => this._openEditor(null)}
            >
              ${icon({ name: 'plus', size: 'sm' })} ${i18n.getMessage('New passage')}
            </button>
          </div>`
        : nothing}
      ${this._state && !passages.length
        ? html`<div role="status">
            <aiux-empty-state-content
              icon="pencil"
              heading-text=${i18n.getMessage("You don't have any custom passages yet")}
              body-text=${i18n.getMessage(
                'Add your own text, such as a letter or notes, and practice typing it.',
              )}
              show-action
            >
              <button
                slot="action"
                type="button"
                class="aiux-btn aiux-btn-primary"
                @click=${() => this._openEditor(null)}
              >
                ${i18n.getMessage('Create your first passage')}
              </button>
            </aiux-empty-state-content>
          </div>`
        : html`<ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
            ${passages.map((passage) => this._renderPassage(passage))}
          </ul>`}
      ${this._renderEditor()} ${this._renderConfirm()}
    </div>`;
  }
}
