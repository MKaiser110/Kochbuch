// cook-mode.js — Kochmodus: ein Schritt pro Seite, große Schrift,
// Wischen/Pfeiltasten zum Blättern, Timer, Bildschirm bleibt wach (sofern
// unterstützt). Beim Start wird zuerst die Zutatenliste (für die gewählte
// Portionenzahl) eingeblendet.

import { getRecipe } from '../core/db.js';
import { scaleIngredients } from '../services/scaling.js';
import { enableWakeLock, isSupported as wakeLockSupported } from '../services/wake-lock.js';
import { appRoot, mountTemplate, setPageTitle, fillIngredientList } from '../utils/dom.js';
import { currentNavigation, isStale, setViewCleanup } from '../view-lifecycle.js';

const SWIPE_MIN_DISTANCE_PX = 60;
const SWIPE_HORIZONTAL_RATIO = 1.5;
const TIMER_MAX_MINUTES = 180;

export async function renderCook(id, servingsFromUrl) {
  const seq = currentNavigation();
  const recipe = await getRecipe(id);
  if (isStale(seq)) return;
  if (!recipe) { location.hash = ''; return; }

  const servings = servingsFromUrl && servingsFromUrl > 0 ? servingsFromUrl : recipe.servingsBase;
  setPageTitle('Kochmodus');
  mountTemplate('tpl-cook');
  const root = appRoot.querySelector('.cook');

  const panel = setupIngredientsPanel(root, recipe, servings);
  const timer = setupTimer(root);
  const stepper = setupStepper(root, recipe.steps, id, panel);

  setViewCleanup(() => {
    timer.stop();
    stepper.dispose();
  });

  stepper.render();
  if (wakeLockSupported()) enableWakeLock();
}

/** Zutatenpanel, das beim Start offen ist. Gibt das Panel-Element zurück. */
function setupIngredientsPanel(root, recipe, servings) {
  const panel = root.querySelector('.cook-ingredients');
  root.querySelector('.cook-ingredients-title').textContent =
    `Zutaten für ${servings} ${servings === 1 ? 'Portion' : 'Portionen'}`;
  fillIngredientList(
    panel.querySelector('.ingredient-list'),
    scaleIngredients(recipe.ingredients, recipe.servingsBase, servings)
  );
  const showPanel = show => { panel.hidden = !show; };
  showPanel(true);
  root.querySelector('.cook-ingredients-btn').addEventListener('click', () => showPanel(true));
  root.querySelector('.cook-ingredients-close').addEventListener('click', () => showPanel(false));
  return panel;
}

/** Countdown-Timer (0–180 Min.) mit Start/Pause/Reset. */
function setupTimer(root) {
  const minutesInput = root.querySelector('.cook-timer-minutes');
  const display = root.querySelector('.cook-timer-display');
  const startBtn = root.querySelector('.cook-timer-start');
  const pauseBtn = root.querySelector('.cook-timer-pause');
  const resetBtn = root.querySelector('.cook-timer-reset');

  let remainingMs = Math.max(0, (parseInt(minutesInput.value, 10) || 0) * 60 * 1000);
  let handle = null;

  function updateDisplay() {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    display.textContent = `${minutes}:${seconds}`;
  }

  function setFromInput() {
    const minutes = Math.max(0, Math.min(TIMER_MAX_MINUTES, parseInt(minutesInput.value, 10) || 0));
    minutesInput.value = minutes;
    remainingMs = minutes * 60 * 1000;
    updateDisplay();
  }

  function stop() {
    if (handle) {
      clearInterval(handle);
      handle = null;
    }
  }

  function start() {
    if (remainingMs <= 0) setFromInput();
    if (handle) return;
    handle = setInterval(() => {
      remainingMs = Math.max(0, remainingMs - 1000);
      updateDisplay();
      if (remainingMs === 0) {
        stop();
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        alert('Timer abgelaufen!');
      }
    }, 1000);
  }

  minutesInput.addEventListener('change', () => setFromInput());
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', stop);
  resetBtn.addEventListener('click', () => { stop(); setFromInput(); });
  updateDisplay();

  return { stop };
}

/** Schritt-Navigation per Buttons, Wischen und Pfeiltasten. */
function setupStepper(root, steps, recipeId, panel) {
  const stepEl = root.querySelector('.cook-step');
  const counterEl = root.querySelector('.cook-counter');
  const barEl = root.querySelector('.cook-progress-bar');
  const prevBtn = root.querySelector('.cook-prev');
  const nextBtn = root.querySelector('.cook-next');
  let index = 0;

  function finish() {
    location.replace(`#recipe/${recipeId}`);
  }

  function render() {
    if (steps.length === 0) {
      stepEl.textContent = 'Dieses Rezept hat keine Zubereitungsschritte.';
      counterEl.textContent = '';
      barEl.style.width = '0%';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    stepEl.textContent = steps[index];
    counterEl.textContent = `Schritt ${index + 1} von ${steps.length}`;
    barEl.style.width = `${((index + 1) / steps.length) * 100}%`;
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === steps.length - 1 ? 'Fertig ✓' : 'Weiter ›';
  }

  function go(delta) {
    if (steps.length === 0) return;
    const next = index + delta;
    if (next >= steps.length) { finish(); return; }
    if (next < 0) return;
    index = next;
    render();
  }

  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));

  // Wischen (horizontal) zum Blättern
  let touchStart = null;
  stepEl.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  stepEl.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > SWIPE_MIN_DISTANCE_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) {
      go(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  // Pfeiltasten (Desktop) — Listener beim Verlassen der Ansicht entfernen
  const onKey = e => {
    if (!panel.hidden) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', onKey);

  return {
    render,
    dispose: () => document.removeEventListener('keydown', onKey),
  };
}
