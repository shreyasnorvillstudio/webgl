# Samiran — headless storefront

A Vite single-page storefront for **Samiran** (sarees, iron cotton, powerlook and checked shirts), running on a Wix Headless backend: Wix Stores (Catalog V3) for products, Wix eCommerce Cart V2 for the bag, and Wix-hosted secure checkout.

- **Wix project:** Samiran · dashboard: https://manage.wix.com/dashboard/2801559c-17e2-46c7-8d97-f6998471cc89
- **Public OAuth client id:** `be6dcace-a013-41ce-9eda-2fbbbe5f0e6f` (in `src/wix.js`; not a secret)
- **Currency:** INR · **Time zone:** Asia/Kolkata

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production files in dist/
```

## Deploy

`dist/` is a static site. Deep links (`/shop`, `/category/...`, `/products/...`) are handled by the app, so the host must serve `index.html` for unknown paths:

- **Vercel** — `vercel.json` is included. Import the folder (framework: Vite) or run `npx vercel --prod`.
- **Netlify** — `public/_redirects` is copied into `dist/`. Drag `dist/` into Netlify, or `npx netlify deploy --prod --dir=dist`.
- **Wix hosting** — upload `dist/` at https://www.wix.com/headless/drop to host the files on Wix.
- Other static hosts — `dist/404.html` is a copy of `index.html` as a fallback.

### After the first deploy (required for checkout)

Add the live domain to the OAuth app's allowed redirect domains, or the return from Wix checkout will be refused:

Open https://manage.wix.com/dashboard/2801559c-17e2-46c7-8d97-f6998471cc89/oauth-apps-settings, select **Samiran Storefront**, and add your domain (e.g. `samiran.vercel.app`) to the allowed redirect domains. Add `localhost` too if you want to test checkout from `npm run dev`.

### To take real payments

The project is on the Free plan. Upgrade to a Wix Premium business plan and connect a payment provider in the dashboard's payment settings, then set your shipping rules.

## What's where

| File | Purpose |
|---|---|
| `src/wix.js` | Visitor client (`OAuthStrategy`), field sets, image/price helpers, editorial image ids |
| `src/main.js` | Router + pages: home, shop, `/category/:slug`, `/products/:slug`, 404; SEO tags |
| `src/cart.js` | Side-drawer bag: add, quantity, remove, Wix-calculated subtotal, redirect to checkout |
| `src/overlay.js` | Drawer/sheet behaviour: focus trap, Escape, scroll lock, focus return |
| `src/styles.css` | Design tokens, layout, motion (respects reduced-motion) |

Everything is read live from Wix: products, prices, stock, categories and their order. Add or edit products and categories in the dashboard (Store Products / Categories) and they appear without code changes. Product SEO set in the dashboard is applied to product and category pages.

## Catalog seeded

| Line | Pieces |
|---|---|
| Sarees | Ivory Kanchi Silk Saree (₹18,500, was ₹21,500) · Indigo Chanderi Handloom Saree (₹8,900) |
| Iron Cotton Shirts | Oxford — White (₹2,490) · Mandarin — Sage (₹2,690) |
| Powerlook Shirts | Structured — Midnight Navy (₹2,990, was ₹3,490) · Satin-Finish — Onyx (₹3,190) |
| Checked Shirts | Madras — Rust (₹2,290) · Gingham — Indigo (₹2,190) |

Shirts come in M / L / XL. All product and editorial images are AI-generated placeholders in the site's Media Manager — replace them with real photography from the dashboard when it's ready (editorial image ids are in `EDITORIAL` in `src/wix.js`).
