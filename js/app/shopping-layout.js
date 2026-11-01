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
  let blurTimer = 0;
  let viewportHeightOnFocus = 0;

  const updateLayout = () => {
    layoutFrame = 0;
    const keyboardOpen = document.activeElement === search
      && viewportHeightOnFocus > 0
      && viewportHeightOnFocus - (viewport?.height || window.innerHeight) > 120;
    document.body.classList.toggle('shopping-keyboard-open', keyboardOpen);
    shell.style.setProperty('--shell-viewport-height', `${viewport?.height || window.innerHeight}px`);
    shell.style.setProperty('--shell-viewport-top', `${keyboardOpen ? viewport?.offsetTop || 0 : 0}px`);
  };

  const scheduleLayout = () => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(updateLayout);
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
  scheduleLayout();

  setViewCleanup(() => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    if (blurTimer) clearTimeout(blurTimer);
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('orientationchange', scheduleLayout);
    window.removeEventListener('pageshow', scheduleLayout);
    viewport?.removeEventListener('resize', scheduleLayout);
    viewport?.removeEventListener('scroll', scheduleLayout);
    search.removeEventListener('focus', onSearchFocus);
    search.removeEventListener('blur', onSearchBlur);
    document.body.classList.remove('shopping-keyboard-open');
    document.body.classList.remove('shopping-search-focused');
    viewportHeightOnFocus = 0;
    shell.style.removeProperty('--shell-viewport-top');
    shell.style.removeProperty('--shell-viewport-height');
  });
}
