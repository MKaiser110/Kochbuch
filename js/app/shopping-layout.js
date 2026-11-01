import { setViewCleanup } from '../view-lifecycle.js';

export function setupShoppingLayout() {
  const searchWrap = document.querySelector('.shopping-search-wrap');
  const search = searchWrap?.querySelector('#shopping-search');
  const app = document.getElementById('app');
  const viewport = window.visualViewport;

  if (!searchWrap || !search || !app) {
    throw new Error('Einkaufslisten-Layout konnte nicht initialisiert werden.');
  }

  let layoutFrame = 0;
  let blurTimer = 0;
  let viewportHeightOnFocus = 0;

  const updateContentBottom = () => {
    app.style.setProperty(
      '--shopping-content-bottom',
      `calc(${Math.ceil(searchWrap.getBoundingClientRect().height + 67)}px + env(safe-area-inset-bottom, 0px))`,
    );
  };

  const positionSearch = () => {
    if (!document.body.classList.contains('shopping-keyboard-open')) return;

    const viewportTop = Math.max(0, viewport?.offsetTop || 0);
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    searchWrap.style.top = `${Math.max(viewportTop, viewportBottom - searchWrap.offsetHeight - 4)}px`;
    searchWrap.style.bottom = 'auto';
  };

  const updateLayout = () => {
    layoutFrame = 0;
    const keyboardOpen = document.activeElement === search
      && viewportHeightOnFocus > 0
      && viewportHeightOnFocus - (viewport?.height || window.innerHeight) > 120;
    document.body.classList.toggle('shopping-keyboard-open', keyboardOpen);
    if (!keyboardOpen) {
      searchWrap.style.removeProperty('top');
      searchWrap.style.removeProperty('bottom');
    }
    positionSearch();
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
      searchWrap.style.removeProperty('top');
      searchWrap.style.removeProperty('bottom');
      scheduleLayout();
    }, 240);
  };

  const resizeObserver = new ResizeObserver(updateContentBottom);
  resizeObserver.observe(searchWrap);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
  viewport?.addEventListener('resize', scheduleLayout);
  search.addEventListener('focus', onSearchFocus);
  search.addEventListener('blur', onSearchBlur);
  search.addEventListener('click', onSearchFocus);
  updateContentBottom();
  scheduleLayout();

  setViewCleanup(() => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    if (blurTimer) clearTimeout(blurTimer);
    resizeObserver.disconnect();
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('orientationchange', scheduleLayout);
    window.removeEventListener('pageshow', scheduleLayout);
    viewport?.removeEventListener('resize', scheduleLayout);
    search.removeEventListener('focus', onSearchFocus);
    search.removeEventListener('blur', onSearchBlur);
    search.removeEventListener('click', onSearchFocus);
    document.body.classList.remove('shopping-keyboard-open');
    document.body.classList.remove('shopping-search-focused');
    viewportHeightOnFocus = 0;
    searchWrap.style.removeProperty('top');
    searchWrap.style.removeProperty('bottom');
    app.style.removeProperty('--shopping-content-bottom');
  });
}
