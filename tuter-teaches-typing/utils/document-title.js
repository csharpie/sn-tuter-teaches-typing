import productName from './product-name.js';

/**
 * Sets the browser tab title as "<page> | Abel Tuter Teaches Typing"
 * (WCAG 2.4.2). SSR-safe: a no-op when there is no document.
 * @param {string} pageTitle - already-localized page name
 */
export default function setDocumentTitle(pageTitle) {
  if (typeof document === 'undefined') return;
  const appTitle = productName();
  document.title = pageTitle ? `${pageTitle} | ${appTitle}` : appTitle;
}
