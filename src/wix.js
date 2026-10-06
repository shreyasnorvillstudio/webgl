// Samiran — Wix Headless data layer (visitor client, constants, shared helpers).
import { createClient, OAuthStrategy, media } from '@wix/sdk';
import { productsV3 } from '@wix/stores';
import { categories } from '@wix/categories';
import { currentCartV2, cartV2 } from '@wix/ecom';
import { redirects } from '@wix/redirects';

// Public OAuth client id of the Samiran headless project (not a secret).
export const CLIENT_ID = 'be6dcace-a013-41ce-9eda-2fbbbe5f0e6f';
export const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

const TOKEN_KEY = 'samiran.wix.tokens';

function readTokens() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export const wix = createClient({
  modules: { productsV3, categories, currentCartV2, cartV2, redirects },
  auth: OAuthStrategy({ clientId: CLIENT_ID, tokens: readTokens() }),
});

// Persist the visitor session so the cart survives refreshes and navigation.
export function persistTokens() {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(wix.auth.getTokens()));
  } catch {
    /* storage unavailable (private mode) — the session simply won't persist */
  }
}

export const LIST_FIELDS = [
  'CURRENCY',
  'PLAIN_DESCRIPTION',
  'MEDIA_ITEMS_INFO',
  'MIN_PRICE_VARIANT',
  'DISCOUNT_INFO',
];

export const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  'DESCRIPTION',
  'INFO_SECTION',
  'INFO_SECTION_DESCRIPTION',
  'VARIANT_OPTION_CHOICE_NAMES',
  'PRODUCT_CHOICES_MEDIA_REFERENCES',
  'SUBSCRIPTION_PRICES_INFO',
  'BREADCRUMBS_INFO',
];

// ---------- Images ----------
export function imgSrc(mediaLike, w = 600, h = 600) {
  const v = mediaLike?.image ?? mediaLike?.url ?? mediaLike;
  if (!v) return '';
  if (typeof v === 'string' && v.startsWith('wix:image://')) {
    return media.getScaledToFillImageUrl(v, w, h, {});
  }
  return typeof v === 'string' ? v : v.url ?? '';
}

export function imgSrcSet(mediaLike, widths = [360, 540, 720, 960], ratio = 1.25) {
  return widths.map((w) => `${imgSrc(mediaLike, w, Math.round(w * ratio))} ${w}w`).join(', ');
}

// Editorial images generated for Samiran, held in the site's Wix Media library.
const wixImage = (id, name, w, h) => `wix:image://v1/${id}/${name}#originWidth=${w}&originHeight=${h}`;
export const EDITORIAL = {
  hero: {
    src: wixImage('0490c8_751929ccb4774647973df6b5f93fe2a2~mv2.png', 'samiran-hero.png', 1376, 768),
    alt: 'A woman in an ivory and gold silk saree and a man in a white cotton shirt in a sunlit sandstone courtyard',
  },
  loom: {
    src: wixImage('0490c8_7f4de17e114d454ea2e3a3f7896103b1~mv2.png', 'samiran-handloom.png', 1200, 896),
    alt: "A weaver's hands at a wooden handloom with ivory, indigo and gold silk threads",
  },
  sareeLook: {
    src: wixImage('0490c8_2643a485d3274ca2b87db737e4e94f3f~mv2.png', 'samiran-saree-lookbook.png', 1200, 896),
    alt: 'A woman walking down stepwell stairs in a terracotta and gold silk saree, the pallu in motion',
  },
  shirtsLook: {
    src: wixImage('0490c8_ef26313264904b7295f70a20e24d2962~mv2.png', 'samiran-shirts-atelier.png', 1200, 896),
    alt: 'Folded cotton shirts in white, sage, navy and rust Madras check stacked on a dark wooden table',
  },
};

// ---------- Prices ----------
export function sellingPrice(price) {
  if (price?.priceAfterDiscount !== undefined && price?.priceAfterDiscount !== null) {
    return { current: price.priceAfterDiscount, original: price.actualPrice };
  }
  return { current: price?.actualPrice, original: price?.compareAtPrice };
}

const num = (m) => (m?.amount == null ? NaN : Number(m.amount));

export function isHigher(original, current) {
  return original && current && num(original) > num(current);
}

export function priceRange(product) {
  const { minValue: min, maxValue: max } = product?.actualPriceRange ?? {};
  if (min && max && min.amount !== max.amount) return `${min.formattedAmount} – ${max.formattedAmount}`;
  return min?.formattedAmount ?? '';
}

export function formatCartMoney(money, cart) {
  const value = money?.convertedAmount ?? money?.amount;
  const currency = cart?.customerInfo?.currencyCode ?? cart?.businessInfo?.currencyCode ?? 'INR';
  if (value == null || value === '') return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
}

// ---------- Misc ----------
export const ribbons = (p) =>
  [p?.ribbon?.name, ...(p?.additionalRibbons ?? []).map((r) => r.name)].filter(Boolean);

export const stripTags = (html = '') => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Minimal allow-list sanitizer for merchant HTML descriptions.
export function sanitizeHtml(html = '') {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'H3', 'H4', 'SPAN', 'A']);
  const walk = (node) => {
    [...node.children].forEach((el) => {
      if (!allowed.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        return;
      }
      [...el.attributes].forEach((a) => {
        const keep = el.tagName === 'A' && a.name === 'href' && /^https?:/i.test(a.value);
        if (!keep) el.removeAttribute(a.name);
      });
      if (el.tagName === 'A') el.setAttribute('rel', 'noopener');
      walk(el);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

// The product-group "purchase path" used by every card.
export function purchasePath(p) {
  const mods = p.modifiers ?? [];
  if (mods.some((m) => m.modifierRenderType === 'FREE_TEXT') || p.subscriptionPricesInfo) return 'pdp';
  if ((p.options?.length ?? 0) > 0 || mods.some((m) => m.mandatory)) return 'quickAdd';
  if (p.inventory?.availabilityStatus === 'OUT_OF_STOCK' && p.inventory?.preorderStatus !== 'ENABLED') return 'soldOut';
  return 'directAdd';
}

export function catalogItem({ product, variant, quantity = 1, preorder = false }) {
  return {
    quantity,
    catalogReference: {
      appId: STORES_APP_ID,
      catalogItemId: product._id,
      options: {
        variantId: variant._id,
        ...(preorder ? { preOrderRequested: true } : {}),
      },
    },
  };
}

// Variant resolution by sorted choice ids.
export function buildVariantIndex(product) {
  const key = (ids) => [...ids].sort().join('_');
  const map = new Map();
  for (const v of product.variantsInfo?.variants ?? []) {
    if (v.visible === false) continue;
    map.set(key((v.choices ?? []).map((c) => c.optionChoiceIds?.choiceId)), v);
  }
  return { key, map };
}

export const variantAvailable = (v) =>
  v?.inventoryStatus?.inStock !== false || v?.inventoryStatus?.preorderEnabled === true;
