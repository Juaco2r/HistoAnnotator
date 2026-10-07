(() => {
  'use strict';

  const ENTRY_ID = 'multiReviewAdditionalToolEntry';
  const LABEL = 'Multi-annotator Review';

  function currentImageId() {
    const picker = document.getElementById('imageSelect');
    return String(picker?.value || '').trim();
  }

  function targetUrl() {
    const imageId = currentImageId();
    return imageId
      ? `/static/multi_review.html?imageId=${encodeURIComponent(imageId)}`
      : '/static/multi_review.html';
  }

  function removeIds(node) {
    if (!(node instanceof Element)) return;
    node.removeAttribute('id');
    node.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  }

  function imageManagerTool() {
    return [...document.querySelectorAll('.phase-additional-tool-label')]
      .map(label => ({label, text:String(label.textContent || '').trim()}))
      .find(item => item.text === 'Image Manager') || null;
  }

  function injectIntoAdditionalTools() {
    if (document.getElementById(ENTRY_ID)) return true;
    const found = imageManagerTool();
    if (!found) return false;

    const reference = found.label.closest(
      'button, a, [role="button"], [role="menuitem"], .phase-additional-tool'
    ) || found.label.parentElement;
    if (!reference?.parentElement) return false;

    const entry = reference.cloneNode(true);
    removeIds(entry);
    entry.id = ENTRY_ID;
    entry.setAttribute('data-multi-review-additional-tool', '1');
    entry.removeAttribute('disabled');
    entry.removeAttribute('aria-disabled');
    entry.querySelectorAll('[disabled]').forEach(el => el.removeAttribute('disabled'));

    const label = entry.querySelector('.phase-additional-tool-label') || entry;
    label.textContent = LABEL;
    entry.setAttribute('title', 'Review 2–3 annotation files for the same image');

    entry.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = targetUrl();
    }, true);

    reference.insertAdjacentElement('afterend', entry);
    return true;
  }

  function scheduleInjection() {
    [0, 30, 100, 250, 600].forEach(delay => setTimeout(injectIntoAdditionalTools, delay));
  }

  document.addEventListener('click', event => {
    const element = event.target instanceof Element ? event.target : null;
    const text = String(element?.closest('button, a, [role="button"], [role="menuitem"]')?.textContent || '').trim();
    if (/Additional Tools/i.test(text) || /Image Manager/i.test(text)) scheduleInjection();
  }, true);

  const observer = new MutationObserver(scheduleInjection);
  const start = () => {
    observer.observe(document.body, {childList:true, subtree:true});
    scheduleInjection();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
