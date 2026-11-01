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

  let layoutFrame = 0;
  let searchFrame = 0;
  let blurTimer = 0;
  let focusTimers = [];

  const positionSearch = () => {
    searchFrame = 0;
    if (document.activeElement !== search) return;

    const viewportTop = Math.max(0, viewport?.offsetTop || 0);
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    searchWrap.style.top = `${Math.max(viewportTop, viewportBottom - searchWrap.offsetHeight - 4)}px`;
    searchWrap.style.bottom = 'auto';
  };

  const scheduleSearchPosition = () => {
    if (searchFrame) cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(positionSearch);
  };

  const updateLayout = () => {
    layoutFrame = 0;
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
    document.body.classList.add('shopping-keyboard-open');
    scheduleSearchPosition();
    focusTimers = [60, 180, 360].map(delay => window.setTimeout(scheduleSearchPosition, delay));
  };

  const onSearchBlur = () => {
    if (blurTimer) clearTimeout(blurTimer);
    focusTimers.forEach(clearTimeout);
    blurTimer = window.setTimeout(() => {
      blurTimer = 0;
      if (document.activeElement === search) return;

      document.body.classList.remove('shopping-keyboard-open');
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
  viewport?.addEventListener('resize', scheduleLayout);
  viewport?.addEventListener('scroll', scheduleSearchPosition);
  document.addEventListener('scroll', scheduleSearchPosition, true);
  search.addEventListener('focus', onSearchFocus);
  search.addEventListener('blur', onSearchBlur);
  search.addEventListener('pointerdown', scheduleSearchPosition);
  search.addEventListener('click', onSearchFocus);
  scheduleLayout();

  setViewCleanup(() => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    if (searchFrame) cancelAnimationFrame(searchFrame);
    if (blurTimer) clearTimeout(blurTimer);
    focusTimers.forEach(clearTimeout);
    resizeObserver.disconnect();
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('orientationchange', scheduleLayout);
    viewport?.removeEventListener('resize', scheduleLayout);
    viewport?.removeEventListener('scroll', scheduleSearchPosition);
    document.removeEventListener('scroll', scheduleSearchPosition, true);
    search.removeEventListener('focus', onSearchFocus);
    search.removeEventListener('blur', onSearchBlur);
    search.removeEventListener('pointerdown', scheduleSearchPosition);
    search.removeEventListener('click', onSearchFocus);
    document.body.classList.remove('shopping-keyboard-open');
    searchWrap.style.removeProperty('top');
    searchWrap.style.removeProperty('bottom');
    document.body.style.removeProperty('--shopping-content-top');
    document.body.style.removeProperty('--shopping-content-bottom');
  });
}
