import { i18n } from '@servicenow/aiux/aiux-services';

/**
 * The app's name wherever it stands alone: nav title, toolbar, browser tab,
 * headings. Sentences that mention it keep it inline in their own message so
 * translators see the whole sentence.
 */
export default function productName() {
  // Translators: "Abel Tuter Teaches Typing" is the game's product name.
  // Leave it untranslated.
  return i18n.getMessage('Abel Tuter Teaches Typing');
}
