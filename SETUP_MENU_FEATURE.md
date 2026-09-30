# HCF Restaurant System — Setup Guide (Frontend → Backend → Nginx)

This build adds a full **Menu Management** feature on top of your existing
project:

- Customer side: after login, the dashboard/menu page shows all food items as
  cards, grouped into sections (e.g. Starter, Main Course, Beverages) with a
  **Veg / Non-veg** filter, product image, ingredients, price and an
  **offer % badge** with the discounted price shown automatically.
- Admin side: a new **Admin → Menu** tab where staff with the `menu.manage`
  permission (Owner/Manager by default) can create sections and add food
  items — name, price, offer %, major ingredients, veg/non-veg, and an
  uploaded image — from a form.

Architecture (already matched what you asked for, now completed):
**1 nginx container** as the single public entrypoint → routes to
**2 app containers** (`web` = frontend, `api` = backend). `mongo` and `redis`
are data services, not "app" containers, and are unavoidable for a real
backend (redis is optional/best-effort and the API works without it).

```
                     ┌─────────────┐
   Browser ───80───▶ │   nginx     │
                     └──────┬──────┘
                    /api/*  │  everything else
                 /uploads/* │
                            ▼
                ┌────────────────┐        ┌──────────────┐
                │  api (backend) │◀──────▶│ web (frontend)│
                └───────┬────────┘        └──────────────┘
                        │
                 ┌──────┴──────┐
                 │ mongo, redis │
                 └─────────────┘
```

---

## Step 1 — Backend (`apps/api`)

What changed:
- `src/models/MenuItem.ts` — added `ingredients: string[]` and
  `offerPercent: number` (0–100).
- `src/validators/order.validators.ts` — validation for the new fields, plus
  a proper `updateMenuItemSchema`.
- `src/middleware/upload.ts` — new file. Multer disk storage, 3 MB limit,
  JPG/PNG/WEBP only, saves to `apps/api/uploads/menu/`.
- `src/controllers/menu.controller.ts` / `src/routes/menu.routes.ts` —
  new `POST /api/v1/menu/items/upload-image` (staff + `menu.manage` only),
  returns `{ url: "/uploads/menu/xxx.jpg" }`.
- `src/app.ts` — serves `/uploads` statically.
- `package.json` — added `multer` + `@types/multer`.

### Run it locally (without Docker, for development)

```bash
cd apps/api
npm install
cp ../../.env.example .env   # if you haven't already; fill in Mongo/JWT secrets
npm run dev                  # starts on http://localhost:4000
```

Make sure MongoDB (and optionally Redis) are running — either locally or via
`docker compose up mongo redis` from the repo root.

### Build it (what Docker will do)

```bash
npm run build   # compiles TypeScript to dist/
npm start       # node dist/server.js
```

---

## Step 2 — Frontend (`apps/web`)

What changed:
- `src/types/domain.ts` — `MenuItem` now has `ingredients` and `offerPercent`.
- `src/services/apiClient.ts` — added `resolveImageUrl()` helper (turns the
  relative `/uploads/...` path the API returns into a full URL, whether
  you're hitting the API directly on :4000 in dev or through nginx on :80).
- `src/services/staffApi.ts` — `MenuAdminApi` now has `createCategory`,
  `createItem`, `updateItem`, `setAvailability`, `uploadImage`.
- `src/pages/customer/MenuPage.tsx` — real images, ingredients line, offer %
  badge + struck-through original price, Veg/Non-veg filter tabs.
- `src/pages/staff/admin/MenuManagementPage.tsx` — **new page**: create
  sections, add food items with an image picker, ingredients, price, offer %,
  veg/non-veg, card grid with an availability toggle.
- `src/routes/index.tsx` and `AdminLayout.tsx` — wired the new page in at
  `/admin/menu` with a "Menu" tab.

### Run it locally (without Docker)

```bash
cd apps/web
npm install
npm run dev     # http://localhost:5173, proxies API calls to VITE_API_BASE_URL
```

### Build it (what Docker will do)

```bash
npm run build   # outputs static files to dist/
```

### How to use the new feature once it's running

1. Log in as staff at `/staff/login` with an Owner/Manager account (see
   `docs/USER_ROLES.md` / your seed data for credentials).
2. Go to **Admin → Menu**.
3. Click **Section** to create e.g. "Starter" and "Main Course" (if you
   don't already have categories for your outlet).
4. Click **Add food item**: upload a photo, enter name, ingredients
   (comma-separated), price, an optional offer %, and pick Veg/Non-veg +
   the section. Save.
5. As a customer, open `/menu` for that outlet — the item appears as a card
   in its section, filterable by Veg/Non-veg, showing the image, ingredients,
   and the offer badge with the discounted price.

---

## Step 3 — Nginx (single entrypoint)

What changed in `docker/nginx.conf` and `docker/nginx.prod.conf`:
- Added a `location /uploads/ { proxy_pass http://api_upstream; ... }` block
  so uploaded menu images are reachable through the same port-80 entrypoint
  the browser talks to (alongside the existing `/api/` and `/socket.io/`
  blocks). Everything else still falls through to the `web` container.

`docker-compose.yml` changes:
- `api` service now has `volumes: - api_uploads:/app/uploads` so uploaded
  images survive container restarts/rebuilds.
- New named volume `api_uploads` declared at the bottom.

### Bring the whole stack up

```bash
# from the repo root
cp .env.example .env     # fill in real secrets for anything beyond local testing
docker compose up --build
```

This starts, in order of dependency: `mongo`, `redis` → `api` → `web` →
`nginx`. Once healthy:

- App (through nginx, single port): **http://localhost**
- API directly (dev convenience, also exposed): **http://localhost:4000**
- Web directly (dev convenience, also exposed): **http://localhost:5173**

To seed sample data (if you have a seed script, check `apps/api/src/seed`):

```bash
docker compose exec api npm run seed
```

### Verifying the menu feature end-to-end

```bash
curl http://localhost/api/v1/menu?outletId=<your-outlet-id>
```
should return sections with `ingredients` and `offerPercent` on each item,
and any uploaded image should load at:
```
http://localhost/uploads/menu/<filename>
```

---

## Update — Customer login simplified (OTP removed)

Customer login no longer uses mobile OTP verification. It's now a single
`POST /api/v1/auth/customer/login` call that takes `name`, `mobile`, optional
`email`, and an optional `address`, and:

- creates a new `Customer` document if the mobile number hasn't been seen
  before, or
- updates the existing customer's name/email and appends the given address
  if they've logged in before,

then immediately issues an access/refresh token pair — no OTP step, no
password. This is intentionally low-friction; if you need real identity
verification later, reintroduce a verification step in
`apps/api/src/services/auth.service.ts` (`customerLogin`) before issuing the
session.

What changed:
- **Backend**: `Customer` model no longer has `otpHash`/`otpExpiresAt`.
  `AuthService.requestCustomerOtp` / `verifyCustomerOtp` / `registerCustomer`
  were replaced by a single `AuthService.customerLogin(...)`. Routes
  `POST /auth/customer/otp/request` and `/otp/verify` were removed in favor
  of `POST /auth/customer/login`.
- **Frontend**: `AccountPage.tsx` is now a single form (name, mobile, email,
  address) instead of the two-step mobile → OTP flow. `AuthApi.customerLogin`
  replaces `requestOtp` / `verifyOtp` in `services/domainApi.ts`.

Note: `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`,
`docs/USER_ROLES.md`, `docs/DATABASE.md` and `docs/PART3.md` still describe
the old OTP flow in places — the code above is the source of truth now;
update those docs if you rely on them for onboarding.

## Notes / things to double check for your environment- The upload endpoint requires the logged-in staff user's role to include the
  `menu.manage` permission (already granted to Owner/Manager in
  `apps/api/src/config/permissions.ts` — check `docs/USER_ROLES.md` if you
  need to add it to another role).
- Image uploads are capped at 3 MB and JPG/PNG/WEBP only; adjust the limits
  in `apps/api/src/middleware/upload.ts` if you need larger files.
- `offerPercent` is a simple display discount (e.g. "20% OFF") independent of
  the existing `discountPrice` field; the customer menu prefers `offerPercent`
  when both are set.
