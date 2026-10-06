// Samiran — cart drawer (Wix eCommerce Cart V2).
import { wix, persistTokens, imgSrc, formatCartMoney, escapeHtml } from './wix.js';
import { openOverlay, closeOverlay } from './overlay.js';

let cart = null;
let summary = null;
let pending = false;
const lineErrors = new Map();
let queue = Promise.resolve();

const drawer = () => document.getElementById('cart-drawer');
const countEls = () => document.querySelectorAll('[data-cart-count]');

// Serialize price-affecting operations so a stale response can't overwrite newer state.
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function lineCount() {
  return (cart?.lineItems ?? []).reduce((n, l) => n + (l.quantityInfo?.confirmedQuantity ?? l.quantity ?? 0), 0);
}

function updateBadge() {
  const n = lineCount();
  countEls().forEach((el) => {
    el.textContent = String(n);
    el.hidden = n === 0;
  });
  document.querySelectorAll('[data-cart-label]').forEach((el) => {
    el.setAttribute('aria-label', `Bag, ${n} ${n === 1 ? 'item' : 'items'}`);
  });
}

async function refreshEstimate() {
  summary = null;
  if (!cart?.lineItems?.length) return;
  try {
    const res = await wix.currentCartV2.estimateCurrentCart();
    summary = res?.summary ?? null;
  } catch {
    summary = null; // display nicety only — lines still render
  }
}

export async function loadCart() {
  try {
    const res = await wix.currentCartV2.getCurrentCart();
    cart = res?.cart ?? null;
    persistTokens();
    await refreshEstimate();
  } catch {
    cart = null; // no cart yet for this visitor
  }
  updateBadge();
  render();
}

export function addToCart(item, label = 'Added to your bag') {
  return serial(async () => {
    const res = await wix.currentCartV2.addLineItemsToCurrentCart({ catalogItems: [item] });
    persistTokens();
    cart = res?.cart ?? null;
    const ref = item.catalogReference;
    const line = (cart?.lineItems ?? []).find(
      (l) =>
        l.source?.catalogReference?.catalogItemId === ref.catalogItemId &&
        (l.source?.catalogReference?.options?.variantId ?? null) === (ref.options?.variantId ?? null),
    );
    if (!line || (line.quantityInfo?.confirmedQuantity ?? 1) === 0) {
      throw new Error('This piece could not be added — it may have just sold out.');
    }
    if (line.status && line.status !== 'IN_STOCK') {
      throw new Error('This size is no longer available in that quantity.');
    }
    await refreshEstimate();
    updateBadge();
    render(label);
    openCart();
    return cart;
  });
}

function updateQuantity(lineItemId, newQuantity) {
  return serial(async () => {
    pending = true;
    lineErrors.delete(lineItemId);
    render();
    try {
      const res =
        newQuantity <= 0
          ? await wix.currentCartV2.removeLineItemsFromCurrentCart([lineItemId])
          : await wix.currentCartV2.updateLineItemsInCurrentCart({
              lineItems: [{ lineItemId, quantity: { newQuantity } }],
            });
      cart = res?.cart ?? null;
      await refreshEstimate();
    } catch (e) {
      lineErrors.set(lineItemId, e?.message ? cleanError(e.message) : "Couldn't update the quantity");
    } finally {
      pending = false;
      updateBadge();
      render();
    }
  });
}

function cleanError(msg) {
  if (/inventory|stock/i.test(msg)) return 'Not enough stock for that quantity.';
  return "Couldn't update this item. Please try again.";
}

async function checkout() {
  const btn = drawer().querySelector('[data-checkout]');
  const err = drawer().querySelector('[data-checkout-error]');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Opening secure checkout…';
  try {
    await queue;
    const { cart: fresh } = await wix.currentCartV2.getCurrentCart();
    if (!fresh?.lineItems?.length) throw new Error('Your bag is empty.');
    const blocked = fresh.lineItems.find((l) => l.status && l.status !== 'IN_STOCK');
    if (blocked) throw new Error(`${blocked.productName?.original ?? 'An item'} is no longer available in that quantity.`);
    const origin = window.location.origin;
    const session = await wix.redirects.createRedirectSession({
      ecomCheckout: { checkoutId: fresh._id },
      callbacks: { postFlowUrl: `${origin}/`, thankYouPageUrl: `${origin}/` },
    });
    window.location.assign(session.redirectSession.fullUrl);
  } catch (e) {
    err.textContent = e?.message && !/^\d|HTTP/.test(e.message) ? e.message : "We couldn't open checkout. Please try again.";
    btn.disabled = false;
    btn.textContent = 'Continue to secure checkout';
  }
}

function lineHtml(l) {
  const name = l.productName?.original ?? l.name?.original ?? 'Item';
  const qty = l.quantityInfo?.confirmedQuantity ?? l.quantity ?? 1;
  const max = l.quantityInfo?.availableQuantity;
  const options = (l.descriptionLines ?? l.attributes?.descriptionLines ?? [])
    .map((d) => {
      const n = d.name?.original ?? d.name?.translated;
      const v = d.plainText?.original ?? d.colorInfo?.original ?? d.plainText?.translated;
      return n && v ? `${escapeHtml(n)}: ${escapeHtml(v)}` : '';
    })
    .filter(Boolean)
    .join(' · ');
  const image = imgSrc(l.image ?? l.attributes?.image, 160, 200);
  const total = formatCartMoney(l.pricing?.totalPrice ?? l.price, cart);
  const err = lineErrors.get(l._id);
  const atMax = Number.isFinite(max) && qty >= max;
  return `
    <li class="cart-line" data-line="${l._id}">
      <div class="cart-line__img">${image ? `<img src="${image}" alt="" width="80" height="100" loading="lazy">` : ''}</div>
      <div class="cart-line__body">
        <p class="cart-line__name">${escapeHtml(name)}</p>
        ${options ? `<p class="cart-line__opts">${options}</p>` : ''}
        <div class="cart-line__row">
          <div class="stepper" role="group" aria-label="Quantity for ${escapeHtml(name)}">
            <button type="button" data-qty="${qty - 1}" aria-label="Decrease quantity" ${pending ? 'disabled' : ''}>−</button>
            <span aria-live="polite">${qty}</span>
            <button type="button" data-qty="${qty + 1}" aria-label="Increase quantity" ${pending || atMax ? 'disabled' : ''}>+</button>
          </div>
          <span class="cart-line__price">${total}</span>
        </div>
        <button type="button" class="link-btn" data-remove ${pending ? 'disabled' : ''}>Remove</button>
        ${err ? `<p class="field-error" role="alert">${escapeHtml(err)}</p>` : ''}
      </div>
    </li>`;
}

function render(status = '') {
  const el = drawer();
  if (!el) return;
  const lines = cart?.lineItems ?? [];
  const body = el.querySelector('[data-cart-body]');
  const foot = el.querySelector('[data-cart-foot]');
  el.querySelector('[data-cart-status]').textContent = status;
  if (!lines.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <p class="display-s">Your bag is empty</p>
        <p>Begin with a saree for the occasion, or a shirt for every day after.</p>
        <a class="btn btn--ghost" href="/shop" data-link data-close-cart>Explore the collection</a>
      </div>`;
    foot.hidden = true;
    return;
  }
  body.innerHTML = `<ul class="cart-lines">${lines.map(lineHtml).join('')}</ul>`;
  const ps = summary?.priceSummary;
  const subtotal = ps?.subtotal ? formatCartMoney(ps.subtotal, cart) : '';
  const discount = ps?.discount && Number(ps.discount.amount) > 0 ? formatCartMoney(ps.discount, cart) : '';
  foot.hidden = false;
  foot.querySelector('[data-subtotal]').innerHTML = subtotal
    ? `<div class="sum-row"><span>Subtotal</span><span>${subtotal}</span></div>${
        discount ? `<div class="sum-row"><span>Discount</span><span>−${discount}</span></div>` : ''
      }`
    : '';
  const btn = foot.querySelector('[data-checkout]');
  btn.disabled = pending;
}

export function openCart() {
  openOverlay(drawer(), document.querySelector('[data-open-cart]'));
}

export function initCart() {
  const el = drawer();
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.matches('[data-close]') || t.matches('[data-close-cart]')) closeOverlay(el);
    const line = t.closest('[data-line]');
    if (line && t.matches('[data-qty]')) updateQuantity(line.dataset.line, Number(t.dataset.qty));
    if (line && t.matches('[data-remove]')) updateQuantity(line.dataset.line, 0);
    if (t.matches('[data-checkout]')) checkout();
  });
  document.querySelectorAll('[data-open-cart]').forEach((b) => b.addEventListener('click', openCart));
  loadCart();
}
