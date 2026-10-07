(() => {
  'use strict';

  const ENTRY_ID = 'multiReviewSettingsEntry';
  const LABEL = 'Multi-annotator Review';
  const TARGET = '/static/multi_review.html';

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function textOf(el) {
    return [
      el?.id,
      el?.className,
      el?.getAttribute?.('title'),
      el?.getAttribute?.('aria-label'),
      el?.textContent,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function looksLikeSettingsTrigger(el) {
    const text = textOf(el);
    return /settings|setting|preferences|configuration|config|gear|connection settings/.test(text)
      || /⚙|\u2699/.test(el?.textContent || '');
  }

  function scoreSurface(el) {
    if (!isVisible(el) || el === document.body || el === document.documentElement) return -1;
    const text = textOf(el);
    let score = 0;
    if (/settings|preferences|configuration|connection settings/.test(text)) score += 5;
    if (/server|connection|display|tools|shortcuts|offline/.test(text)) score += 2;
    if (el.matches?.('[role="menu"], dialog, .modal, .popover, .dropdown-menu, [class*="settings"], [id*="settings"]')) score += 3;
    const actions = el.querySelectorAll?.('button, a, [role="menuitem"]')?.length || 0;
    if (actions >= 1 && actions <= 30) score += 2;
    if (el.children?.length > 80) score -= 3;
    return score;
  }

  function findSettingsSurface() {
    const selectors = [
      '[role="menu"]', 'dialog', '.modal', '.popover', '.dropdown-menu',
      '[class*="settings"]', '[id*="settings"]', '[class*="menu"]', '[id*="menu"]'
    ];
    const candidates = [...new Set(selectors.flatMap(sel => [...document.querySelectorAll(sel)]))]
      .map(el => ({el, score: scoreSurface(el)}))
      .filter(x => x.score >= 5)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function makeEntry(reference) {
    const button = document.createElement('button');
    button.id = ENTRY_ID;
    button.type = 'button';
    button.textContent = LABEL;
    button.title = 'Review multiple GeoJSON annotations for the same image';
    button.setAttribute('data-multi-review-settings-entry', '1');
    if (reference?.className) button.className = reference.className;
    button.style.width = reference ? '' : '100%';
    button.style.textAlign = reference ? '' : 'left';
    button.addEventListener('click', () => {
      window.location.href = TARGET;
    });
    return button;
  }

  function injectInto(surface) {
    if (!surface || surface.querySelector(`#${ENTRY_ID}`)) return false;
    const reference = surface.querySelector('button, a, [role="menuitem"]');
    const entry = makeEntry(reference);

    if (reference?.parentElement && reference.parentElement !== surface && reference.parentElement.children.length <= 30) {
      reference.parentElement.appendChild(entry);
    } else {
      surface.appendChild(entry);
    }
    return true;
  }

  function tryInject() {
    if (document.getElementById(ENTRY_ID)) return true;
    const surface = findSettingsSurface();
    return injectInto(surface);
  }

  document.addEventListener('click', event => {
    const path = event.composedPath ? event.composedPath() : [event.target];
    if (path.some(looksLikeSettingsTrigger)) {
      [0, 40, 150, 350].forEach(delay => setTimeout(tryInject, delay));
    }
  }, true);

  const observer = new MutationObserver(() => {
    tryInject();
  });

  const start = () => {
    observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open']});
    tryInject();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once: true});
  } else {
    start();
  }
})();
