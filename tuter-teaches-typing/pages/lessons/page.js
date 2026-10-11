import { html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AIUXElement, decorators } from '@servicenow/aiux/aiux-components-core';
import { i18n } from '@servicenow/aiux/aiux-services';
import { navigate } from '@servicenow/aiux/aiux-client';
import { icon } from '@servicenow/aiux/aiux-directive-icon';
import setDocumentTitle from '../../utils/document-title.js';
import '../../widgets/x-snc-ttt-lesson-map/index.js';
import '../../widgets/x-snc-ttt-typing-session/index.js';

const { acl } = decorators;

const SYS_ID = /^[0-9a-f]{32}$/;

// Opens the lesson an event names: a pick on the map, or "Next lesson".
function openLesson(e) {
  if (e.detail?.lessonId) navigate(`/lessons?lesson=${e.detail.lessonId}`);
}

function backToMap() {
  navigate('/lessons');
}

/**
 * /lessons (APPLICATION_SPEC B3.2): the lesson map, and the typing session for
 * the lesson in ?lesson=<sys_id>. The URL can be bookmarked, and the browser
 * Back button returns to the map. The map stays mounted (hidden) while a
 * lesson is open and is refreshed after every scored attempt.
 */
@customElement('x-snc-ttt-lessons-page')
@acl([{ decision: 'allow_if', roles: ['x_snc_ttt.user'] }])
export default class LessonsPage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  static async loader(ctx) {
    const lesson = String(ctx.query?.lesson || '');
    return {
      basePath: ctx.basePath || '',
      lessonId: SYS_ID.test(lesson) ? lesson : '',
    };
  }

  constructor() {
    super();
    this._shownLesson = undefined;
  }

  firstUpdated() {
    setDocumentTitle(i18n.getMessage('Lessons'));
  }

  updated(changed) {
    super.updated?.(changed);
    const lessonId = this.loaderData?.lessonId || '';
    // When the view switches between the map and a lesson, the control that
    // was focused disappears: move focus to the page heading instead.
    if (this._shownLesson !== undefined && this._shownLesson !== lessonId) {
      this.renderRoot.querySelector('h1')?.focus();
    }
    this._shownLesson = lessonId;
  }

  _onScored = () => {
    this.renderRoot.querySelector('x-snc-ttt-lesson-map')?.refresh();
  };

  render() {
    const { basePath = '', lessonId = '' } = this.loaderData || {};
    return html`<div class="mx-auto flex max-w-6xl flex-col gap-6 px-3 py-4 sm:p-6 lg:p-8">
      <header class="flex flex-col gap-1">
        <h1 class="text-3xl font-bold text-text-primary" tabindex="-1">
          ${i18n.getMessage('Lessons')}
        </h1>
        <p class="text-text-secondary">
          ${i18n.getMessage(
            'Work through the keyboard one row at a time. Pass a lesson to unlock the next one.',
          )}
        </p>
      </header>
      ${lessonId
        ? html`<a class="aiux-link w-fit" href="${basePath}/lessons">
              ${icon({ name: 'arrow-left', size: 'sm' })} ${i18n.getMessage('All lessons')}
            </a>
            <x-snc-ttt-typing-session
              mode="lesson"
              lesson-id=${lessonId}
              @attempt-scored=${this._onScored}
              @next-lesson=${openLesson}
              @session-exit=${backToMap}
            ></x-snc-ttt-typing-session>`
        : nothing}
      <div ?hidden=${!!lessonId}>
        <x-snc-ttt-lesson-map @lesson-select=${openLesson}></x-snc-ttt-lesson-map>
      </div>
    </div>`;
  }
}
