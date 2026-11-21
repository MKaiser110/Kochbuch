import { setViewCleanup } from '../view-lifecycle.js';

export function setupShoppingLayout() {
  const shell = document.getElementById('app-shell');
  const searchWrap = document.querySelector('.shopping-search-wrap');
  const search = searchWrap?.querySelector('#shopping-search');
  const viewport = window.visualViewport;

  if (!shell || !searchWrap || !search) {
    throw new Error('Einkaufslisten-Layout konnte nicht initialisiert werden.');
  }

  let layoutFrame = 0;
  let settleTimer = 0;
  let blurTimer = 0;
  let viewportHeightOnFocus = 0;

  const updateLayout = () => {
    layoutFrame = 0;
    const keyboardOpen = document.activeElement === search
      && viewportHeightOnFocus > 0
      && viewportHeightOnFocus - (viewport?.height || window.innerHeight) > 120;
    const searchFocused = document.body.classList.contains('shopping-search-focused');
    document.body.classList.toggle('shopping-keyboard-open', keyboardOpen);
    if (searchFocused) {
      shell.style.setProperty(
        '--shell-viewport-top',
        `${viewport?.offsetTop || 0}px`
      );
      shell.style.setProperty(
        '--shell-viewport-height',
        `${viewport?.height || window.innerHeight}px`
      );
    } else {
      shell.style.removeProperty('--shell-viewport-top');
      shell.style.removeProperty('--shell-viewport-height');
    }
  };

  const scheduleLayout = () => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(updateLayout);
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      updateLayout();
    }, 280);
  };

  const onSearchFocus = () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = 0;
    }
    viewportHeightOnFocus = viewport?.height || window.innerHeight;
    document.body.classList.add('shopping-search-focused');
    document.body.classList.remove('shopping-keyboard-open');
    scheduleLayout();
  };

  const onSearchBlur = () => {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = window.setTimeout(() => {
      blurTimer = 0;
      if (document.activeElement === search) return;

      document.body.classList.remove('shopping-search-focused');
      document.body.classList.remove('shopping-keyboard-open');
      viewportHeightOnFocus = 0;
      shell.style.removeProperty('--shell-viewport-top');
      shell.style.removeProperty('--shell-viewport-height');
      scheduleLayout();
    }, 240);
  };

  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
  viewport?.addEventListener('resize', scheduleLayout);
  viewport?.addEventListener('scroll', scheduleLayout);
  search.addEventListener('focus', onSearchFocus);
  search.addEventListener('blur', onSearchBlur);
  search.addEventListener('input', scheduleLayout);
  scheduleLayout();

  setViewCleanup(() => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    if (settleTimer) clearTimeout(settleTimer);
    if (blurTimer) clearTimeout(blurTimer);
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('orientationchange', scheduleLayout);
    window.removeEventListener('pageshow', scheduleLayout);
    viewport?.removeEventListener('resize', scheduleLayout);
    viewport?.removeEventListener('scroll', scheduleLayout);
    search.removeEventListener('focus', onSearchFocus);
    search.removeEventListener('blur', onSearchBlur);
    search.removeEventListener('input', scheduleLayout);
    document.body.classList.remove('shopping-keyboard-open');
    document.body.classList.remove('shopping-search-focused');
    viewportHeightOnFocus = 0;
    shell.style.removeProperty('--shell-viewport-top');
    shell.style.removeProperty('--shell-viewport-height');
  });
}
