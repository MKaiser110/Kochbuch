import { setViewCleanup } from '../view-lifecycle.js';

export function setupShoppingLayout() {
  const header = document.querySelector('.topbar');
  const app = document.getElementById('app');
  const searchWrap = document.querySelector('.shopping-search-wrap');
  const search = searchWrap?.querySelector('#shopping-search');
  const viewport = window.visualViewport;

  if (!header || !app || !searchWrap || !search) {
    throw new Error('Einkaufslisten-Layout konnte nicht initialisiert werden.');
  }

  const headerTop = Number.parseFloat(getComputedStyle(header).top) || 0;
  let layoutFrame = 0;
  let blurTimer = 0;
  let focusTimers = [];
  let viewportHeightOnFocus = 0;

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
    if (keyboardOpen) {
      header.style.top = `${Math.max(0, viewport?.offsetTop || 0) + headerTop}px`;
    } else {
      header.style.removeProperty('top');
    }
    if (!keyboardOpen) {
      searchWrap.style.removeProperty('top');
      searchWrap.style.removeProperty('bottom');
    }

    const viewportBottom = viewport
      ? viewport.offsetTop + viewport.height
      : window.innerHeight;
    document.body.style.setProperty(
      '--shopping-viewport-bottom-offset',
      `${window.innerHeight - viewportBottom}px`,
    );
    positionSearch();

    const headerBottom = header.getBoundingClientRect().bottom;
    const searchTop = searchWrap.getBoundingClientRect().top;
    document.body.style.setProperty('--shopping-content-top', `${headerBottom}px`);
    document.body.style.setProperty(
      '--shopping-content-bottom',
      `${Math.max(0, window.innerHeight - searchTop)}px`,
    );
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
    focusTimers.forEach(clearTimeout);
    viewportHeightOnFocus = viewport?.height || window.innerHeight;
    document.body.classList.remove('shopping-keyboard-open');
    scheduleLayout();
    focusTimers = [60, 180, 360].map(delay => window.setTimeout(scheduleLayout, delay));
  };

  const onSearchBlur = () => {
    if (blurTimer) clearTimeout(blurTimer);
    focusTimers.forEach(clearTimeout);
    blurTimer = window.setTimeout(() => {
      blurTimer = 0;
      if (document.activeElement === search) return;

      document.body.classList.remove('shopping-keyboard-open');
      viewportHeightOnFocus = 0;
      header.style.removeProperty('top');
      searchWrap.style.removeProperty('top');
      searchWrap.style.removeProperty('bottom');
      scheduleLayout();
    }, 240);
  };

  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(header);
  resizeObserver.observe(searchWrap);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
  viewport?.addEventListener('resize', scheduleLayout);
  viewport?.addEventListener('scroll', scheduleLayout);
  document.addEventListener('scroll', scheduleLayout, true);
  search.addEventListener('focus', onSearchFocus);
  search.addEventListener('blur', onSearchBlur);
  search.addEventListener('pointerdown', scheduleLayout);
  search.addEventListener('click', onSearchFocus);
  scheduleLayout();

  setViewCleanup(() => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    if (blurTimer) clearTimeout(blurTimer);
    focusTimers.forEach(clearTimeout);
    resizeObserver.disconnect();
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('orientationchange', scheduleLayout);
    window.removeEventListener('pageshow', scheduleLayout);
    viewport?.removeEventListener('resize', scheduleLayout);
    viewport?.removeEventListener('scroll', scheduleLayout);
    document.removeEventListener('scroll', scheduleLayout, true);
    search.removeEventListener('focus', onSearchFocus);
    search.removeEventListener('blur', onSearchBlur);
    search.removeEventListener('pointerdown', scheduleLayout);
    search.removeEventListener('click', onSearchFocus);
    document.body.classList.remove('shopping-keyboard-open');
    viewportHeightOnFocus = 0;
    searchWrap.style.removeProperty('top');
    searchWrap.style.removeProperty('bottom');
    document.body.style.removeProperty('--shopping-content-top');
    document.body.style.removeProperty('--shopping-content-bottom');
    document.body.style.removeProperty('--shopping-viewport-bottom-offset');
  });
}
