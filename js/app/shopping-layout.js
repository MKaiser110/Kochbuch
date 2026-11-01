import { setViewCleanup } from '../view-lifecycle.js';

export function setupShoppingLayout() {
  const header = document.querySelector('.topbar');
  const app = document.getElementById('app');
  const searchWrap = document.querySelector('.shopping-search-wrap');
  const viewport = window.visualViewport;

  if (!header || !app || !searchWrap) {
    throw new Error('Einkaufslisten-Layout konnte nicht initialisiert werden.');
  }

  let frame = 0;
  const updateLayout = () => {
    frame = 0;
    const headerTop = Math.max(
      parseFloat(getComputedStyle(document.body).getPropertyValue('--shell-inset')) || 0,
      viewport?.offsetTop || 0,
    );
    header.style.top = `${headerTop}px`;
    const headerBottom = header.getBoundingClientRect().bottom;
    const searchTop = searchWrap.getBoundingClientRect().top;

    document.body.style.setProperty('--shopping-content-top', `${headerBottom}px`);
    document.body.style.setProperty(
      '--shopping-content-bottom',
      `${Math.max(0, window.innerHeight - searchTop)}px`,
    );
  };
  const scheduleLayout = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateLayout);
  };

  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(header);
  resizeObserver.observe(searchWrap);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('orientationchange', scheduleLayout);
  viewport?.addEventListener('resize', scheduleLayout);
  viewport?.addEventListener('scroll', scheduleLayout);
  scheduleLayout();

  setViewCleanup(() => {
    if (frame) cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('orientationchange', scheduleLayout);
    viewport?.removeEventListener('resize', scheduleLayout);
    viewport?.removeEventListener('scroll', scheduleLayout);
    header.style.removeProperty('top');
    document.body.style.removeProperty('--shopping-content-top');
    document.body.style.removeProperty('--shopping-content-bottom');
  });
}
