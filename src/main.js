import './styles.css';
import {
  wix,
  persistTokens,
  LIST_FIELDS,
  DETAIL_FIELDS,
  EDITORIAL,
  imgSrc,
  imgSrcSet,
  sellingPrice,
  isHigher,
  priceRange,
  ribbons,
  stripTags,
  escapeHtml,
  sanitizeHtml,
  purchasePath,
  catalogItem,
  buildVariantIndex,
  variantAvailable,
} from './wix.js';
import { initCart, addToCart } from './cart.js';
import { openOverlay, closeOverlay, closeAll } from './overlay.js';

const app = document.getElementById('app');
const PAGE_SIZE = 24;
const SITE = 'Samiran';
const DEFAULT_DESC =
  'Samiran — contemporary Indian clothing. Handwoven silk and handloom sarees, iron cotton, powerlook and checked shirts.';

// ---------------------------------------------------------------- utilities
const fmtMoney = (m, currency = 'INR') => {
  if (!m) return '';
  if (m.formattedAmount) return m.formattedAmount;
  if (m.amount == null) return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(m.amount));
};

let routeVersion = 0;
let categoryCache = null;

async function getCategories() {
  if (categoryCache) return categoryCache;
  try {
    const res = await wix.categories
      .queryCategories({ treeReference: { appNamespace: '@wix/stores' } })
      .exists('name', true)
      .limit(50)
      .find();
    persistTokens();
    categoryCache = (res.items ?? []).filter((c) => c.visible !== false && c.slug !== 'all-products');
  } catch {
    categoryCache = [];
  }
  return categoryCache;
}

function setMeta({ title, description, seoData, jsonLd } = {}) {
  let t = title ? `${title} · ${SITE}` : `${SITE} · Sarees & Shirts, Woven in India`;
  let d = description || DEFAULT_DESC;
  for (const tag of seoData?.tags ?? []) {
    if (tag.disabled) continue;
    if (tag.type === 'title' && tag.children) t = tag.children;
    if (tag.type === 'meta' && tag.props?.name === 'description' && tag.props?.content) d = tag.props.content;
  }
  document.title = t;
  document.querySelector('meta[name="description"]')?.setAttribute('content', d);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', t);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', d);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = window.location.origin + window.location.pathname;
  document.getElementById('ld-json')?.remove();
  if (jsonLd) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'ld-json';
    s.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(s);
  }
}

function observeReveals(root = document) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = root.querySelectorAll('.reveal:not(.is-in), .thread:not(.is-in)');
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((el) => io.observe(el));
}

const errorBlock = (msg = "We couldn't load this right now.") => `
  <div class="state state--error" role="alert">
    <p class="display-s">${escapeHtml(msg)}</p>
    <button class="btn btn--ghost" type="button" data-retry>Try again</button>
  </div>`;

// ---------------------------------------------------------------- product card
function cardPrice(p) {
  const v = p.variantSummary?.minPriceVariant;
  const range = p.actualPriceRange;
  const ranged = range?.minValue && range?.maxValue && range.minValue.amount !== range.maxValue.amount;
  if (ranged) return `<span class="price">${escapeHtml(priceRange(p))}</span>`;
  const { current, original } = sellingPrice(v?.price ?? { actualPrice: range?.minValue });
  const cur = fmtMoney(current, p.currency);
  if (isHigher(original, current)) {
    return `<span class="price"><span class="price__now">${escapeHtml(cur)}</span>
      <s class="price__was"><span class="sr-only">Was </span>${escapeHtml(fmtMoney(original, p.currency))}</s></span>`;
  }
  return `<span class="price">${escapeHtml(cur)}</span>`;
}

function cardHtml(p, i = 0) {
  const items = p.media?.itemsInfo?.items ?? [];
  const main = p.media?.main ?? items[0];
  const alt = items[0]?.altText || p.name;
  const second = items.find((it, idx) => idx > 0 && (it._id ?? it.image) !== (main?._id ?? main?.image));
  const path = purchasePath(p);
  const rb = ribbons(p);
  const action =
    path === 'directAdd'
      ? `<button class="btn btn--small" type="button" data-direct-add>Add to bag</button>`
      : path === 'quickAdd'
        ? `<button class="btn btn--small btn--ghost" type="button" data-quick-open aria-expanded="false">Choose size</button>`
        : path === 'soldOut'
          ? `<button class="btn btn--small" type="button" disabled>Sold out</button>`
          : `<a class="btn btn--small btn--ghost" href="/products/${p.slug}" data-link>View options</a>`;
  return `
  <article class="card reveal" style="--d:${(i % 4) * 70}ms" data-product-id="${p._id}">
    <a class="card__media" href="/products/${escapeHtml(p.slug)}" data-link tabindex="-1" aria-hidden="true">
      ${
        main
          ? `<img src="${imgSrc(main, 720, 900)}" srcset="${imgSrcSet(main)}" sizes="(min-width:1100px) 25vw, (min-width:700px) 33vw, 50vw" alt="" width="720" height="900" loading="${i < 4 ? 'eager' : 'lazy'}">`
          : `<div class="img-fallback"><span>${escapeHtml(p.name)}</span></div>`
      }
      ${second ? `<img class="card__alt" src="${imgSrc(second, 720, 900)}" alt="" width="720" height="900" loading="lazy">` : ''}
      ${rb.length ? `<span class="ribbons">${rb.map((r) => `<span class="ribbon">${escapeHtml(r)}</span>`).join('')}</span>` : ''}
    </a>
    <div class="card__body">
      <h3 class="card__name"><a href="/products/${escapeHtml(p.slug)}" data-link>${escapeHtml(p.name)}</a></h3>
      ${cardPrice(p)}
      <span class="sr-only">${escapeHtml(alt)}</span>
      <div class="card__actions">${action}</div>
      <div class="quick" hidden></div>
      <p class="field-error" data-card-error role="alert"></p>
    </div>
  </article>`;
}

// Product lookup for card actions (kept per render).
const cardProducts = new Map();
function registerProducts(list) {
  list.forEach((p) => cardProducts.set(p._id, p));
}

async function onCardClick(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  const p = cardProducts.get(card.dataset.productId);
  if (!p) return;
  const errEl = card.querySelector('[data-card-error]');
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.matches('[data-direct-add]')) {
    errEl.textContent = '';
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Adding…';
    try {
      const variant = p.variantSummary?.minPriceVariant;
      await addToCart(catalogItem({ product: p, variant, quantity: 1 }), `${p.name} added to your bag`);
    } catch (err) {
      errEl.textContent = err?.message || "Couldn't add this piece. Please try again.";
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  if (btn.matches('[data-quick-open]')) {
    const panel = card.querySelector('.quick');
    const open = panel.hidden;
    document.querySelectorAll('.quick:not([hidden])').forEach((q) => {
      q.hidden = true;
      q.closest('.card')?.querySelector('[data-quick-open]')?.setAttribute('aria-expanded', 'false');
    });
    if (!open) return;
    btn.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    panel.innerHTML = `<p class="muted">Loading sizes…</p>`;
    try {
      // getProduct resolves to the product itself (getProductBySlug wraps it in { product }).
      const res = await wix.productsV3.getProduct(p._id, { fields: DETAIL_FIELDS });
      const full = res?.product ?? res;
      renderPicker(panel, full, { compact: true });
    } catch {
      panel.innerHTML = `<p class="field-error">Sizes didn't load. <a href="/products/${p.slug}" data-link>Open the product</a></p>`;
    }
  }
}

// ---------------------------------------------------------------- shared purchase picker
function renderPicker(container, product, { compact = false } = {}) {
  const { key, map } = buildVariantIndex(product);
  const options = product.options ?? [];
  const selected = {};
  let qty = 1;
  const single = !options.length ? product.variantsInfo?.variants?.find((v) => v.visible !== false) : null;

  const currentVariant = () => {
    if (single) return single;
    const complete = options.every((o) => selected[o._id]);
    return complete ? map.get(key(Object.values(selected))) ?? null : null;
  };

  const choiceSelectable = (opt, choice) => {
    if (choice.visible === false) return false;
    const others = Object.entries(selected).filter(([oid]) => oid !== opt._id);
    if (!others.length) return choice.inStock ?? true;
    return [...map.values()].some((v) => {
      const ids = (v.choices ?? []).map((c) => c.optionChoiceIds?.choiceId);
      return ids.includes(choice.choiceId) && others.every(([, cid]) => ids.includes(cid)) && variantAvailable(v);
    });
  };

  const priceHtml = () => {
    const v = currentVariant();
    if (!v) return `<span class="price price--lg">${escapeHtml(priceRange(product))}</span>`;
    const { current, original } = sellingPrice(v.price);
    return `<span class="price price--lg"><span class="price__now">${escapeHtml(fmtMoney(current, product.currency))}</span>${
      isHigher(original, current)
        ? ` <s class="price__was"><span class="sr-only">Was </span>${escapeHtml(fmtMoney(original, product.currency))}</s>`
        : ''
    }</span>`;
  };

  const draw = () => {
    const v = currentVariant();
    const missing = options.find((o) => !selected[o._id]);
    let reason = '';
    let label = 'Add to bag';
    let disabled = false;
    const preorder = v?.inventoryStatus?.preorderEnabled && v?.inventoryStatus?.inStock === false;
    if (missing) {
      reason = `Choose a ${missing.name.toLowerCase()}`;
      disabled = true;
    } else if (!v) {
      reason = 'This combination is unavailable';
      disabled = true;
    } else if (preorder) {
      label = 'Pre-order';
    } else if (!variantAvailable(v)) {
      label = 'Sold out';
      disabled = true;
    }
    container.innerHTML = `
      ${compact ? '' : `<div class="pdp__price" aria-live="polite">${priceHtml()}</div>`}
      ${options
        .map(
          (o) => `
        <fieldset class="opt">
          <legend>${escapeHtml(o.name)}${selected[o._id] ? `: <span>${escapeHtml(o.choicesSettings.choices.find((c) => c.choiceId === selected[o._id])?.name ?? '')}</span>` : ''}</legend>
          <div class="pills">
            ${(o.choicesSettings?.choices ?? [])
              .filter((c) => c.visible !== false)
              .map((c) => {
                const ok = choiceSelectable(o, c);
                const on = selected[o._id] === c.choiceId;
                const swatch = ['SWATCH_CHOICES', 'COLOR_CHOICES'].includes(o.optionRenderType) && c.colorCode;
                return `<button type="button" class="pill${swatch ? ' pill--swatch' : ''}${on ? ' is-on' : ''}" aria-pressed="${on}" data-opt="${o._id}" data-choice="${c.choiceId}" ${ok ? '' : 'disabled aria-disabled="true"'} ${swatch ? `style="--sw:${c.colorCode}" aria-label="${escapeHtml(c.name)}"` : ''}>${swatch ? '' : escapeHtml(c.name)}</button>`;
              })
              .join('')}
          </div>
        </fieldset>`,
        )
        .join('')}
      ${
        compact
          ? ''
          : `<div class="qty-row"><span class="label">Quantity</span>
              <div class="stepper" role="group" aria-label="Quantity">
                <button type="button" data-q="-1" aria-label="Decrease quantity" ${qty <= 1 ? 'disabled' : ''}>−</button>
                <span aria-live="polite">${qty}</span>
                <button type="button" data-q="1" aria-label="Increase quantity" ${qty >= 10 ? 'disabled' : ''}>+</button>
              </div></div>`
      }
      <div class="buy">
        <button type="button" class="btn ${compact ? 'btn--small' : 'btn--wide'}" data-buy ${disabled ? 'disabled' : ''}>${label}${
          compact && v ? ` · ${escapeHtml(fmtMoney(sellingPrice(v.price).current, product.currency))}` : ''
        }</button>
        ${reason ? `<p class="reason">${escapeHtml(reason)}</p>` : ''}
        <p class="field-error" data-buy-error role="alert"></p>
      </div>`;
  };

  container.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.opt) {
      selected[b.dataset.opt] = selected[b.dataset.opt] === b.dataset.choice ? undefined : b.dataset.choice;
      if (!selected[b.dataset.opt]) delete selected[b.dataset.opt];
      qty = 1;
      draw();
      container.querySelector(`[data-choice="${b.dataset.choice}"]`)?.focus();
    } else if (b.dataset.q) {
      qty = Math.min(10, Math.max(1, qty + Number(b.dataset.q)));
      draw();
    } else if (b.matches('[data-buy]')) {
      const v = currentVariant();
      if (!v) return;
      const err = container.querySelector('[data-buy-error]');
      b.disabled = true;
      b.textContent = 'Adding…';
      try {
        const preorder = v.inventoryStatus?.preorderEnabled && v.inventoryStatus?.inStock === false;
        await addToCart(catalogItem({ product, variant: v, quantity: qty, preorder }), `${product.name} added to your bag`);
        if (compact) {
          container.hidden = true;
          container.closest('.card')?.querySelector('[data-quick-open]')?.setAttribute('aria-expanded', 'false');
        } else draw();
      } catch (ex) {
        draw();
        container.querySelector('[data-buy-error]').textContent = ex?.message || "Couldn't add this piece. Please try again.";
        void err;
      }
    }
  };
  draw();
}

// ---------------------------------------------------------------- HOME
async function renderHome(v) {
  setMeta({});
  const hero = EDITORIAL.hero;
  app.innerHTML = `
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__media">
      <img src="${imgSrc(hero.src, 1376, 768)}" srcset="${[640, 960, 1376].map((w) => `${imgSrc(hero.src, w, Math.round((w * 768) / 1376))} ${w}w`).join(', ')}" sizes="100vw" alt="${escapeHtml(hero.alt)}" width="1376" height="768" fetchpriority="high">
    </div>
    <div class="hero__copy">
      <p class="kicker hero-in" style="--d:100ms">Sarees &amp; shirts · Woven in India</p>
      <h1 id="hero-title" class="display-xl hero-in" style="--d:220ms">Woven for the occasion.<br><em>Cut for every day</em></h1>
      <p class="lede hero-in" style="--d:380ms">Shop handwoven silk and handloom sarees alongside iron cotton, powerlook and checked shirts — Indian craft, tailored for now</p>
      <div class="hero-in" style="--d:520ms"><a class="btn" href="/shop" data-link>Shop the collection</a></div>
    </div>
  </section>

  <section class="lines" aria-labelledby="lines-title">
    <div class="section-head">
      <span class="thread" aria-hidden="true"></span>
      <p class="kicker">The collection</p>
      <h2 id="lines-title" class="display-l reveal">Four lines, one hand</h2>
    </div>
    <ol class="lines__list" data-lines><li class="skeleton-row"></li><li class="skeleton-row"></li><li class="skeleton-row"></li><li class="skeleton-row"></li></ol>
  </section>

  <section class="rail" aria-labelledby="rail-title">
    <div class="section-head section-head--row">
      <div>
        <span class="thread" aria-hidden="true"></span>
        <p class="kicker">New this season</p>
        <h2 id="rail-title" class="display-l reveal">Pieces to begin with</h2>
      </div>
      <a class="text-link" href="/shop" data-link>View all</a>
    </div>
    <div class="grid" data-rail>${'<div class="card card--skeleton"></div>'.repeat(4)}</div>
  </section>

  <section class="story" aria-labelledby="story-title">
    <figure class="story__media reveal">
      <img src="${imgSrc(EDITORIAL.loom.src, 1200, 896)}" srcset="${[600, 900, 1200].map((w) => `${imgSrc(EDITORIAL.loom.src, w, Math.round(w * 0.7467))} ${w}w`).join(', ')}" sizes="(min-width: 900px) 55vw, 100vw" alt="${escapeHtml(EDITORIAL.loom.alt)}" width="1200" height="896" loading="lazy">
    </figure>
    <div class="story__copy reveal" style="--d:120ms">
      <p class="kicker">From the loom</p>
      <h2 id="story-title" class="display-l">Thread first, then the cut</h2>
      <p>Every Samiran piece starts with the cloth. Our sarees are handwoven — Kanchi silk with fine zari, featherlight Chanderi with silver buti — and finished with a blouse piece.</p>
      <p>Our shirts take the same care into daily life: iron cotton dense enough to hold a crisp line all day, powerlook shirts with a sharper cut and a quiet sheen, and checks reworked in soft yarn-dyed cotton.</p>
      <a class="text-link" href="/category/sarees" data-link>Explore the sarees</a>
    </div>
  </section>

  <section class="looks" aria-label="Lookbook">
    <a class="look reveal" href="/category/sarees" data-link>
      <img src="${imgSrc(EDITORIAL.sareeLook.src, 1200, 896)}" alt="${escapeHtml(EDITORIAL.sareeLook.alt)}" width="1200" height="896" loading="lazy">
      <span class="look__cap"><span class="kicker">For the occasion</span><span class="display-m">Sarees</span></span>
    </a>
    <a class="look reveal" style="--d:120ms" href="/shop" data-link>
      <img src="${imgSrc(EDITORIAL.shirtsLook.src, 1200, 896)}" alt="${escapeHtml(EDITORIAL.shirtsLook.alt)}" width="1200" height="896" loading="lazy">
      <span class="look__cap"><span class="kicker">For every day</span><span class="display-m">Shirts</span></span>
    </a>
  </section>`;
  observeReveals();

  // Live: categories + a representative product image for each line.
  (async () => {
    const list = app.querySelector('[data-lines]');
    try {
      const cats = await getCategories();
      if (v !== routeVersion) return;
      if (!cats.length) {
        list.closest('section').remove();
        return;
      }
      const firsts = await Promise.all(
        cats.map((c) =>
          wix.productsV3
            .searchProducts(
              {
                filter: { $and: [{ visible: true }, { 'allCategoriesInfo.categories': { $matchItems: [{ id: c._id }] } }] },
                cursorPaging: { limit: 1 },
              },
              { fields: ['MEDIA_ITEMS_INFO', 'CURRENCY'] },
            )
            .then((r) => r.products?.[0] ?? null)
            .catch(() => null),
        ),
      );
      if (v !== routeVersion) return;
      list.innerHTML = cats
        .map((c, i) => {
          const p = firsts[i];
          const m = p?.media?.main;
          return `
          <li class="line reveal" style="--d:${i * 80}ms">
            <a href="/category/${escapeHtml(c.slug)}" data-link>
              <span class="line__no">${String(i + 1).padStart(2, '0')}</span>
              <span class="line__name display-m">${escapeHtml(c.name)}</span>
              <span class="line__desc">${escapeHtml(c.description ?? '')}</span>
              <span class="line__img" aria-hidden="true">${m ? `<img src="${imgSrc(m, 360, 450)}" alt="" width="360" height="450" loading="lazy">` : ''}</span>
              <span class="line__arrow" aria-hidden="true">→</span>
            </a>
          </li>`;
        })
        .join('');
      observeReveals(list);
    } catch {
      list.innerHTML = '';
    }
  })();

  // Live: product rail.
  (async () => {
    const rail = app.querySelector('[data-rail]');
    try {
      const { items } = await wix.productsV3.queryProducts({ fields: LIST_FIELDS }).limit(8).find();
      persistTokens();
      if (v !== routeVersion) return;
      if (!items?.length) {
        rail.closest('section').remove();
        return;
      }
      registerProducts(items);
      rail.innerHTML = items.map(cardHtml).join('');
      observeReveals(rail);
    } catch {
      rail.innerHTML = errorBlock("The collection didn't load.");
    }
  })();
}

// ---------------------------------------------------------------- GALLERY (shop + category)
const SORTS = {
  featured: undefined,
  priceAsc: [{ fieldName: 'actualPriceRange.minValue.amount', order: 'ASC' }, { fieldName: 'name', order: 'ASC' }],
  priceDesc: [{ fieldName: 'actualPriceRange.minValue.amount', order: 'DESC' }, { fieldName: 'name', order: 'ASC' }],
  newest: [{ fieldName: 'createdDate', order: 'DESC' }, { fieldName: 'name', order: 'ASC' }],
  nameAsc: [{ fieldName: 'name', order: 'ASC' }],
};
const SORT_LABELS = {
  featured: 'Featured',
  newest: 'Newest',
  priceAsc: 'Price: low to high',
  priceDesc: 'Price: high to low',
  nameAsc: 'Name: A–Z',
};

function readState() {
  const q = new URLSearchParams(location.search);
  return {
    sort: SORTS.hasOwnProperty(q.get('sort')) ? q.get('sort') : 'featured',
    min: q.get('min') ? Number(q.get('min')) : null,
    max: q.get('max') ? Number(q.get('max')) : null,
    stock: q.get('stock') === '1',
    choices: (q.get('opt') ?? '').split(',').filter(Boolean),
  };
}

function writeState(s) {
  const q = new URLSearchParams();
  if (s.sort !== 'featured') q.set('sort', s.sort);
  if (s.min != null && !Number.isNaN(s.min)) q.set('min', String(s.min));
  if (s.max != null && !Number.isNaN(s.max)) q.set('max', String(s.max));
  if (s.stock) q.set('stock', '1');
  if (s.choices.length) q.set('opt', s.choices.join(','));
  const url = location.pathname + (q.toString() ? `?${q}` : '');
  history.replaceState(history.state, '', url);
}

function buildFilter(categoryId, s) {
  const c = [{ visible: true }];
  if (categoryId) c.push({ 'allCategoriesInfo.categories': { $matchItems: [{ id: categoryId }] } });
  if (s.min != null) c.push({ 'actualPriceRange.minValue.amount': { $gte: String(s.min) } });
  if (s.max != null) c.push({ 'actualPriceRange.minValue.amount': { $lte: String(s.max) } });
  if (s.stock) c.push({ 'inventory.availabilityStatus': { $eq: 'IN_STOCK' } });
  if (s.choices.length) c.push({ 'options.choicesSettings.choices.choiceId': { $hasSome: s.choices } });
  return { $and: c };
}

async function renderGallery(v, slug) {
  let category = null;
  if (slug) {
    try {
      const res = await wix.categories.getCategoryBySlug(slug, { appNamespace: '@wix/stores' });
      category = res?.category ?? null;
    } catch {
      category = null;
    }
    if (v !== routeVersion) return;
    if (!category || category.visible === false) return renderNotFound('We couldn’t find that collection.');
  }
  const cats = await getCategories();
  if (v !== routeVersion) return;

  const title = category ? category.name : 'The collection';
  setMeta({
    title: category ? category.name : 'Shop all',
    description: category?.description || 'Shop Samiran sarees and shirts — handwoven silk, handloom, iron cotton, powerlook and checked shirts.',
    seoData: category?.seoData,
  });

  const state = readState();
  app.innerHTML = `
  <section class="gallery-head">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/" data-link>Home</a><span aria-hidden="true">/</span>${
      category ? `<a href="/shop" data-link>Shop</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(category.name)}</span>` : `<span aria-current="page">Shop</span>`
    }</nav>
    <h1 class="display-l">${escapeHtml(title)}</h1>
    ${category?.description ? `<p class="lede">${escapeHtml(category.description)}</p>` : `<p class="lede">Sarees and shirts across all four Samiran lines</p>`}
    <span class="thread is-in" aria-hidden="true"></span>
  </section>
  <section class="gallery">
    <div class="toolbar">
      <button class="btn btn--ghost btn--small filters-toggle" type="button" data-open-filters>Filters<span data-active-count></span></button>
      <p class="count" data-count aria-live="polite"></p>
      <label class="sort"><span>Sort</span>
        <select data-sort>${Object.entries(SORT_LABELS)
          .map(([k, l]) => `<option value="${k}" ${state.sort === k ? 'selected' : ''}>${l}</option>`)
          .join('')}</select>
      </label>
    </div>
    <div class="gallery__body">
      <aside class="filters" aria-label="Filters" data-filters-inline></aside>
      <div>
        <div class="chips" data-chips></div>
        <div class="grid grid--gallery" data-grid>${'<div class="card card--skeleton"></div>'.repeat(8)}</div>
        <div class="more"><button class="btn btn--ghost" type="button" data-more hidden>Load more</button></div>
      </div>
    </div>
  </section>`;

  const grid = app.querySelector('[data-grid]');
  const countEl = app.querySelector('[data-count]');
  const moreBtn = app.querySelector('[data-more]');
  const inline = app.querySelector('[data-filters-inline]');
  const sheet = document.getElementById('filter-sheet');
  const sheetBody = sheet.querySelector('[data-sheet-body]');
  let cursor = null;
  let qv = 0;
  let facets = [];
  let priceBounds = null;

  // Facets from the scope's own products.
  try {
    const { products: scope } = await wix.productsV3.searchProducts(
      { filter: buildFilter(category?._id, { min: null, max: null, stock: false, choices: [] }), cursorPaging: { limit: 100 } },
      { fields: ['CURRENCY'] },
    );
    const byName = new Map();
    const amounts = [];
    for (const p of scope ?? []) {
      if (p.actualPriceRange?.minValue?.amount) amounts.push(Number(p.actualPriceRange.minValue.amount));
      for (const o of p.options ?? []) {
        const f = byName.get(o.name) ?? { name: o.name, render: o.optionRenderType, choices: new Map() };
        for (const ch of o.choicesSettings?.choices ?? []) {
          if (ch.visible === false) continue;
          const ex = f.choices.get(ch.name) ?? { name: ch.name, ids: [], colorCode: ch.colorCode };
          if (!ex.ids.includes(ch.choiceId)) ex.ids.push(ch.choiceId);
          f.choices.set(ch.name, ex);
        }
        byName.set(o.name, f);
      }
    }
    facets = [...byName.values()].filter((f) => f.choices.size > 1);
    if (amounts.length > 1) priceBounds = { lo: Math.min(...amounts), hi: Math.max(...amounts) };
  } catch {
    facets = [];
  }
  if (v !== routeVersion) return;

  const filtersHtml = (s, staged) => `
    <div class="fgroup">
      <p class="fgroup__title">Line</p>
      <ul class="flist">
        <li><a href="/shop" data-link ${!category ? 'aria-current="page"' : ''}>All</a></li>
        ${cats.map((c) => `<li><a href="/category/${escapeHtml(c.slug)}" data-link ${category?._id === c._id ? 'aria-current="page"' : ''}>${escapeHtml(c.name)}</a></li>`).join('')}
      </ul>
    </div>
    ${facets
      .map(
        (f) => `
      <fieldset class="fgroup">
        <legend class="fgroup__title">${escapeHtml(f.name)}</legend>
        <div class="pills">${[...f.choices.values()]
          .map((ch) => {
            const on = ch.ids.some((id) => s.choices.includes(id));
            return `<button type="button" class="pill${on ? ' is-on' : ''}" aria-pressed="${on}" data-facet="${ch.ids.join('|')}">${escapeHtml(ch.name)}</button>`;
          })
          .join('')}</div>
      </fieldset>`,
      )
      .join('')}
    <fieldset class="fgroup">
      <legend class="fgroup__title">Price (₹)</legend>
      <div class="price-inputs">
        <label><span class="sr-only">Minimum price</span><input type="number" inputmode="numeric" min="0" step="100" placeholder="${priceBounds ? Math.floor(priceBounds.lo) : 'Min'}" value="${s.min ?? ''}" data-min></label>
        <span aria-hidden="true">–</span>
        <label><span class="sr-only">Maximum price</span><input type="number" inputmode="numeric" min="0" step="100" placeholder="${priceBounds ? Math.ceil(priceBounds.hi) : 'Max'}" value="${s.max ?? ''}" data-max></label>
        ${staged ? '' : '<button type="button" class="btn btn--small btn--ghost" data-apply-price>Go</button>'}
      </div>
    </fieldset>
    <label class="check"><input type="checkbox" data-stock ${s.stock ? 'checked' : ''}> In stock only</label>`;

  let staged = { ...state, choices: [...state.choices] };

  const drawFilters = () => {
    inline.innerHTML = filtersHtml(state, false);
  };

  const drawChips = () => {
    const chips = [];
    for (const f of facets)
      for (const ch of f.choices.values())
        if (ch.ids.some((id) => state.choices.includes(id)))
          chips.push({ label: `${f.name}: ${ch.name}`, clear: () => (state.choices = state.choices.filter((id) => !ch.ids.includes(id))) });
    if (state.min != null) chips.push({ label: `From ₹${state.min}`, clear: () => (state.min = null) });
    if (state.max != null) chips.push({ label: `Up to ₹${state.max}`, clear: () => (state.max = null) });
    if (state.stock) chips.push({ label: 'In stock', clear: () => (state.stock = false) });
    const el = app.querySelector('[data-chips]');
    el.innerHTML = chips.length
      ? chips.map((c, i) => `<button type="button" class="chip" data-chip="${i}">${escapeHtml(c.label)} <span aria-hidden="true">×</span><span class="sr-only">Remove filter</span></button>`).join('') +
        `<button type="button" class="link-btn" data-clear-all>Clear all</button>`
      : '';
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.chip != null) chips[Number(b.dataset.chip)].clear();
      if (b.matches('[data-clear-all]')) Object.assign(state, { min: null, max: null, stock: false, choices: [] });
      commit();
    };
    const n = chips.length;
    app.querySelector('[data-active-count]').textContent = n ? ` (${n})` : '';
  };

  async function load(append = false) {
    const my = ++qv;
    const filter = buildFilter(category?._id, state);
    if (!append) {
      cursor = null;
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = '<div class="card card--skeleton"></div>'.repeat(8);
    }
    moreBtn.disabled = true;
    try {
      const [{ products, pagingMetadata }, countRes] = await Promise.all([
        wix.productsV3.searchProducts(
          {
            ...(append && cursor ? {} : { filter, ...(SORTS[state.sort] ? { sort: SORTS[state.sort] } : {}) }),
            cursorPaging: { limit: PAGE_SIZE, ...(append && cursor ? { cursor } : {}) },
          },
          { fields: LIST_FIELDS },
        ),
        append ? Promise.resolve(null) : wix.productsV3.countProducts({ filter }).catch(() => null),
      ]);
      persistTokens();
      if (my !== qv || v !== routeVersion) return;
      registerProducts(products ?? []);
      cursor = pagingMetadata?.cursors?.next ?? null;
      if (!append) {
        if (!products?.length) {
          const filtered = state.choices.length || state.min != null || state.max != null || state.stock;
          grid.innerHTML = filtered
            ? `<div class="state"><p class="display-s">Nothing matches these filters</p><button class="btn btn--ghost" type="button" data-reset>Reset filters</button></div>`
            : `<div class="state"><p class="display-s">New pieces are on their way</p><p>This line is being restocked. <a href="/shop" data-link>See everything else</a></p></div>`;
        } else grid.innerHTML = products.map(cardHtml).join('');
        if (countRes?.count != null) countEl.textContent = `${countRes.count} ${countRes.count === 1 ? 'piece' : 'pieces'}`;
      } else {
        const start = grid.children.length;
        grid.insertAdjacentHTML('beforeend', products.map((p, i) => cardHtml(p, start + i)).join(''));
      }
      moreBtn.hidden = !cursor;
      moreBtn.disabled = false;
      grid.removeAttribute('aria-busy');
      observeReveals(grid);
    } catch {
      if (my !== qv) return;
      grid.innerHTML = errorBlock("The collection didn't load.");
      grid.removeAttribute('aria-busy');
    }
  }

  function commit() {
    writeState(state);
    drawFilters();
    drawChips();
    load(false);
  }

  const toggleFacet = (s, ids) => {
    const on = ids.some((id) => s.choices.includes(id));
    s.choices = on ? s.choices.filter((id) => !ids.includes(id)) : [...s.choices, ...ids];
  };
  const readPrice = (root, s) => {
    const mn = root.querySelector('[data-min]').value;
    const mx = root.querySelector('[data-max]').value;
    s.min = mn === '' ? null : Math.max(0, Number(mn));
    s.max = mx === '' ? null : Math.max(0, Number(mx));
  };

  // Inline filters commit immediately.
  inline.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.facet) {
      toggleFacet(state, b.dataset.facet.split('|'));
      commit();
    }
    if (b.matches('[data-apply-price]')) {
      readPrice(inline, state);
      commit();
    }
  });
  inline.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-min],[data-max]')) {
      readPrice(inline, state);
      commit();
    }
  });
  inline.addEventListener('change', (e) => {
    if (e.target.matches('[data-stock]')) {
      state.stock = e.target.checked;
      commit();
    }
  });

  // Sheet filters stage until Apply.
  app.querySelector('[data-open-filters]').addEventListener('click', (e) => {
    staged = { ...state, choices: [...state.choices] };
    sheetBody.innerHTML = filtersHtml(staged, true);
    sheetBody.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (b?.dataset.facet) {
        toggleFacet(staged, b.dataset.facet.split('|'));
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      if (ev.target.closest('a[data-link]')) closeOverlay(sheet);
    };
    sheet.querySelector('[data-apply]').onclick = () => {
      readPrice(sheetBody, staged);
      staged.stock = sheetBody.querySelector('[data-stock]').checked;
      Object.assign(state, staged);
      closeOverlay(sheet);
      commit();
    };
    sheet.querySelector('[data-sheet-clear]').onclick = () => {
      staged = { ...staged, min: null, max: null, stock: false, choices: [] };
      sheetBody.innerHTML = filtersHtml(staged, true);
    };
    openOverlay(sheet, e.currentTarget);
  });

  app.querySelector('[data-sort]').addEventListener('change', (e) => {
    state.sort = e.target.value;
    commit();
  });
  moreBtn.addEventListener('click', () => load(true));
  grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-reset]')) {
      Object.assign(state, { min: null, max: null, stock: false, choices: [] });
      commit();
    }
  });

  drawFilters();
  drawChips();
  load(false);
}

// ---------------------------------------------------------------- PRODUCT PAGE
async function renderProduct(v, slug) {
  app.innerHTML = `<div class="pdp pdp--loading"><div class="pdp__gallery skeleton-block"></div><div class="pdp__info"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>`;
  let product = null;
  try {
    const res = await wix.productsV3.getProductBySlug(slug, { fields: DETAIL_FIELDS });
    product = res?.product ?? null;
    persistTokens();
  } catch {
    product = null;
  }
  if (v !== routeVersion) return;
  if (!product) return renderNotFound('We couldn’t find that piece.');

  // Gallery: every image, main first, de-duplicated on media identity.
  const seen = new Set();
  const imgs = [];
  for (const it of [product.media?.main, ...(product.media?.itemsInfo?.items ?? [])]) {
    if (!it) continue;
    const raw = it._id ?? (typeof it.image === 'string' ? it.image.split('#')[0] : it.image?.id ?? it.url);
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    imgs.push(it);
  }
  const crumbs = product.breadcrumbsInfo?.breadcrumbs ?? [];
  const lastCrumb = crumbs[crumbs.length - 1];
  const rb = ribbons(product);
  const descHtml = product.plainDescription ? sanitizeHtml(product.plainDescription) : '';
  const sections = product.infoSections ?? [];
  const inStock = product.inventory?.availabilityStatus !== 'OUT_OF_STOCK';
  const minP = product.actualPriceRange?.minValue;

  setMeta({
    title: product.name,
    description: stripTags(product.plainDescription).slice(0, 155),
    seoData: product.seoData,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: stripTags(product.plainDescription),
      image: imgs.map((m) => imgSrc(m, 1200, 1500)).filter(Boolean),
      brand: { '@type': 'Brand', name: SITE },
      offers: minP
        ? {
            '@type': 'Offer',
            priceCurrency: product.currency || 'INR',
            price: minP.amount,
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: window.location.href,
          }
        : undefined,
    },
  });

  app.innerHTML = `
  <article class="pdp">
    <div class="pdp__gallery" data-gallery>
      <div class="pdp__main">
        ${
          imgs.length
            ? `<img src="${imgSrc(imgs[0], 1100, 1375)}" srcset="${imgSrcSet(imgs[0], [480, 720, 960, 1100])}" sizes="(min-width: 900px) 55vw, 100vw" alt="${escapeHtml(imgs[0].altText || product.name)}" width="1100" height="1375" data-main-img>`
            : `<div class="img-fallback"><span>${escapeHtml(product.name)}</span></div>`
        }
      </div>
      ${
        imgs.length > 1
          ? `<div class="pdp__thumbs" role="list">${imgs
              .map(
                (m, i) =>
                  `<button type="button" role="listitem" class="thumb${i === 0 ? ' is-on' : ''}" data-thumb="${i}" aria-label="Show image ${i + 1} of ${imgs.length}"><img src="${imgSrc(m, 160, 200)}" alt="" width="80" height="100"></button>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>
    <div class="pdp__info">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/shop" data-link>Shop</a>${
        lastCrumb?.categorySlug ? `<span aria-hidden="true">/</span><a href="/category/${escapeHtml(lastCrumb.categorySlug)}" data-link>${escapeHtml(lastCrumb.categoryName ?? '')}</a>` : ''
      }</nav>
      ${rb.length ? `<div class="ribbons ribbons--inline">${rb.map((r) => `<span class="ribbon">${escapeHtml(r)}</span>`).join('')}</div>` : ''}
      <h1 class="display-l pdp__name">${escapeHtml(product.name)}</h1>
      <div class="pdp__buy" data-picker></div>
      ${descHtml ? `<div class="pdp__desc">${descHtml}</div>` : ''}
      ${
        sections.length
          ? `<div class="accordion">${sections
              .map(
                (s) => `<details><summary>${escapeHtml(s.title ?? s.uniqueName ?? 'Details')}</summary><div>${sanitizeHtml(s.plainDescription ?? '')}</div></details>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>
  </article>
  <section class="rail rail--related" aria-labelledby="related-title" data-related hidden>
    <div class="section-head"><span class="thread" aria-hidden="true"></span><h2 id="related-title" class="display-m">${
      lastCrumb?.categoryName ? `More ${escapeHtml(lastCrumb.categoryName.toLowerCase())}` : 'You may also like'
    }</h2></div>
    <div class="grid" data-related-grid></div>
  </section>`;

  renderPicker(app.querySelector('[data-picker]'), product);

  const gallery = app.querySelector('[data-gallery]');
  gallery.addEventListener('click', (e) => {
    const t = e.target.closest('[data-thumb]');
    if (!t) return;
    const m = imgs[Number(t.dataset.thumb)];
    const main = gallery.querySelector('[data-main-img]');
    main.src = imgSrc(m, 1100, 1375);
    main.srcset = imgSrcSet(m, [480, 720, 960, 1100]);
    main.alt = m.altText || product.name;
    gallery.querySelectorAll('.thumb').forEach((b) => b.classList.toggle('is-on', b === t));
  });

  // Related: same line, else the wider collection.
  (async () => {
    try {
      const filter = lastCrumb?.categoryId
        ? { $and: [{ visible: true }, { 'allCategoriesInfo.categories': { $matchItems: [{ id: lastCrumb.categoryId }] } }] }
        : { $and: [{ visible: true }] };
      let { products } = await wix.productsV3.searchProducts({ filter, cursorPaging: { limit: 8 } }, { fields: LIST_FIELDS });
      products = (products ?? []).filter((p) => p._id !== product._id);
      if (products.length < 2) {
        const all = await wix.productsV3.queryProducts({ fields: LIST_FIELDS }).limit(8).find();
        products = [...products, ...(all.items ?? []).filter((p) => p._id !== product._id && !products.some((x) => x._id === p._id))];
      }
      if (v !== routeVersion || !products.length) return;
      const pick = products.slice(0, 4);
      registerProducts(pick);
      const sec = app.querySelector('[data-related]');
      sec.querySelector('[data-related-grid]').innerHTML = pick.map(cardHtml).join('');
      sec.hidden = false;
      observeReveals(sec);
    } catch {
      /* related rail is optional */
    }
  })();
  observeReveals();
}

// ---------------------------------------------------------------- 404
function renderNotFound(msg = 'This page has moved or never existed.') {
  setMeta({ title: 'Not found' });
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex');
  app.innerHTML = `
    <section class="state state--page">
      <p class="kicker">404</p>
      <h1 class="display-l">${escapeHtml(msg)}</h1>
      <p>Browse the full collection of sarees and shirts instead.</p>
      <a class="btn" href="/shop" data-link>Shop the collection</a>
    </section>`;
}

// ---------------------------------------------------------------- router + chrome
async function route() {
  const v = ++routeVersion;
  closeAll();
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'index,follow');
  const path = location.pathname.replace(/\/+$/, '') || '/';
  app.classList.remove('page-in');
  void app.offsetWidth;
  app.classList.add('page-in');
  highlightNav(path);
  let m;
  if (path === '/') return renderHome(v);
  if (path === '/shop') return renderGallery(v, null);
  if ((m = path.match(/^\/category\/([^/]+)$/))) return renderGallery(v, decodeURIComponent(m[1]));
  if ((m = path.match(/^\/products\/([^/]+)$/))) return renderProduct(v, decodeURIComponent(m[1]));
  return renderNotFound();
}

function navigate(href) {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) {
    location.href = href;
    return;
  }
  history.pushState({}, '', url.pathname + url.search);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  route();
}

function highlightNav(path) {
  document.querySelectorAll('.nav a[data-link], .mnav a[data-link]').forEach((a) => {
    const p = new URL(a.href).pathname;
    if (p === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function buildNav() {
  const cats = await getCategories();
  const links = cats.map((c) => `<li><a href="/category/${escapeHtml(c.slug)}" data-link>${escapeHtml(c.name)}</a></li>`).join('');
  document.querySelector('[data-nav-cats]').innerHTML = links;
  document.querySelector('[data-mnav-cats]').innerHTML = links;
  document.querySelector('[data-foot-cats]').innerHTML = links;
  highlightNav(location.pathname.replace(/\/+$/, '') || '/');
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
document.addEventListener('click', onCardClick);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-retry]')) route();
});
window.addEventListener('popstate', route);

// Header state on scroll.
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile nav.
const mnav = document.getElementById('mobile-nav');
document.querySelector('[data-open-menu]').addEventListener('click', (e) => openOverlay(mnav, e.currentTarget));
mnav.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeOverlay(mnav);
});
document.getElementById('filter-sheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeOverlay(document.getElementById('filter-sheet'));
});

document.getElementById('year').textContent = String(new Date().getFullYear());

buildNav();
initCart();
route();
