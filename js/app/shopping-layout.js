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
  let viewportHeightBeforeKeyboard = Math.max(
    window.innerHeight,
    viewport?.height || 0
  );
  let windowWidthBeforeResize = window.innerWidth;
  let touchStartX = 0;
  let touchStartY = 0;

  const updateLayout = () => {
    layoutFrame = 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    const searchHasFocus = document.activeElement === search;
    if (window.innerWidth !== windowWidthBeforeResize) {
      windowWidthBeforeResize = window.innerWidth;
      viewportHeightBeforeKeyboard = Math.max(window.innerHeight, viewportHeight);
    } else if (!searchHasFocus) {
      viewportHeightBeforeKeyboard = Math.max(window.innerHeight, viewportHeight);
    }
    const keyboardOpen = searchHasFocus
      && viewportHeightBeforeKeyboard - viewportHeight > 120;
    const searchFocused = document.body.classList.contains('shopping-search-focused');
    document.body.classList.toggle('shopping-keyboard-open', keyboardOpen);
    if (searchFocused) {
      shell.style.setProperty('--shell-viewport-top', `${viewportTop}px`);
      shell.style.setProperty('--shell-viewport-height', `${viewportHeight}px`);
    } else {
      shell.style.removeProperty('--shell-viewport-top');
      shell.style.removeProperty('--shell-viewport-height');
    }
    if (keyboardOpen) {
      const searchTop = Math.max(
        viewportTop + 8,
        viewportTop + viewportHeight - searchWrap.offsetHeight - 28
      );
      shell.style.setProperty('--shopping-search-top', `${searchTop}px`);
    } else {
      shell.style.removeProperty('--shopping-search-top');
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

  const onTouchStart = event => {
    if (event.touches.length !== 1) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  };

  const onTouchMove = event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (target?.closest('#shopping-search')) return;

    const horizontalArea = target?.closest('.shopping-suggestions');
    if (horizontalArea) {
      if (Math.abs(deltaY) > Math.abs(deltaX)) event.preventDefault();
      return;
    }

    const scrollArea = target?.closest('#app, .shopping-catalog-list, .ingredient-choice-grid, dialog[open]');
    if (!scrollArea) {
      event.preventDefault();
      return;
    }

    const atTop = scrollArea.scrollTop <= 0;
    const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1;
    if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) event.preventDefault();
  };

  const onSearchFocus = () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = 0;
    }
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
      shell.style.removeProperty('--shell-viewport-top');
      shell.style.removeProperty('--shell-viewport-height');
      shell.style.removeProperty('--shopping-search-top');
      scheduleLayout();
    }, 240);
  };

  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);
  viewport?.addEventListener('resize', scheduleLayout);
  viewport?.addEventListener('scroll', scheduleLayout);
  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
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
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchmove', onTouchMove, true);
    search.removeEventListener('focus', onSearchFocus);
    search.removeEventListener('blur', onSearchBlur);
    search.removeEventListener('input', scheduleLayout);
    document.body.classList.remove('shopping-keyboard-open');
    document.body.classList.remove('shopping-search-focused');
    shell.style.removeProperty('--shell-viewport-top');
    shell.style.removeProperty('--shell-viewport-height');
    shell.style.removeProperty('--shopping-search-top');
  });
}
