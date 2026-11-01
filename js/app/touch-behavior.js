export function disablePageZoom() {
  let lastTap = null;
  let touchMoved = false;

  document.addEventListener('touchstart', event => {
    if (event.touches.length === 1) touchMoved = false;
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', event => {
    touchMoved = true;
    lastTap = null;
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('touchend', event => {
    if (touchMoved) {
      lastTap = null;
      return;
    }
    if (event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const now = Date.now();
    if (lastTap && now - lastTap.time < 350
        && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 32) {
      if (event.target.closest('button, a, input, select, textarea, [role="button"]')) {
        lastTap = null;
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      lastTap = null;
      return;
    }
    lastTap = { time: now, x: touch.clientX, y: touch.clientY };
  }, { capture: true, passive: false });

  document.addEventListener('gesturestart', event => {
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('gesturechange', event => {
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
  document.addEventListener('dblclick', event => event.preventDefault(), true);
}
