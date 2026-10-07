(() => {
  'use strict';
  if (document.getElementById('multiReviewLauncher')) return;
  const button = document.createElement('button');
  button.id = 'multiReviewLauncher';
  button.type = 'button';
  button.textContent = 'Multi Review';
  button.title = 'Open multi-annotator GeoJSON review';
  Object.assign(button.style, {
    position: 'fixed', right: '14px', bottom: '14px', zIndex: '2147483000',
    padding: '8px 12px', borderRadius: '9px', border: '1px solid rgba(255,255,255,.25)',
    background: '#1f6fb2', color: '#fff', font: '600 13px system-ui, sans-serif',
    boxShadow: '0 4px 18px rgba(0,0,0,.28)', cursor: 'pointer'
  });
  button.addEventListener('click', () => {
    window.location.href = '/static/multi_review.html';
  });
  document.body.appendChild(button);
})();
