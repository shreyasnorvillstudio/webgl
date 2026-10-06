// Shared overlay contract: scrim, scroll lock, inert background, focus trap, Escape, focus return.
const stack = [];
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function background() {
  return [...document.body.children].filter((el) => !el.matches('[data-overlay]'));
}

function setInert(on) {
  background().forEach((el) => {
    if (on) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
  document.documentElement.classList.toggle('scroll-locked', on);
}

function onKey(e) {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeOverlay(top.el);
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...top.el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function openOverlay(el, trigger) {
  if (!el) return;
  if (stack.some((s) => s.el === el)) return;
  stack.forEach((s) => s.el.setAttribute('inert', ''));
  stack.push({ el, trigger: trigger ?? document.activeElement });
  el.hidden = false;
  el.removeAttribute('inert');
  setInert(true);
  requestAnimationFrame(() => {
    el.classList.add('is-open');
    const target = el.querySelector('[data-autofocus]') ?? el.querySelector(FOCUSABLE);
    target?.focus({ preventScroll: true });
  });
  if (stack.length === 1) document.addEventListener('keydown', onKey);
}

export function closeOverlay(el) {
  const i = stack.findIndex((s) => s.el === el);
  if (i === -1) return;
  const [{ trigger }] = stack.splice(i, 1);
  el.classList.remove('is-open');
  const done = () => {
    if (!el.classList.contains('is-open')) el.hidden = true;
  };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) done();
  else setTimeout(done, 380);
  if (stack.length) {
    stack[stack.length - 1].el.removeAttribute('inert');
  } else {
    setInert(false);
    document.removeEventListener('keydown', onKey);
  }
  if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
}

export function closeAll() {
  [...stack].reverse().forEach((s) => closeOverlay(s.el));
}

// Scrim click closes the overlay that owns it.
document.addEventListener('click', (e) => {
  const scrim = e.target.closest('[data-scrim]');
  if (scrim) closeOverlay(scrim.closest('[data-overlay]'));
});
