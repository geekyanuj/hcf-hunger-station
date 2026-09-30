# Operations

## Local development commands

```bash
# API
cd apps/api
npm install
npm run dev
npm run build
npm run seed
npm run test

# Web
cd apps/web
npm install
npm run dev
npm run build
```

## Docker commands

```bash
docker compose up --build -d
docker compose logs -f api
docker compose exec api npm run seed
docker compose down
docker compose down -v
```

## Monitoring and logs

- The API logs structured JSON (production) or colorized console output
  (development) via winston (config/logger.ts). morgan HTTP request logs
  are piped through the same logger.
- There is no centralized log aggregation configured in this repository -
  in production, ship container stdout/stderr to your platform's log
  aggregator.
- GET /health returns a simple liveness check; there is no separate
  readiness endpoint that checks MongoDB/Redis connectivity specifically -
  add one if your orchestrator distinguishes liveness from readiness
  probes.

## CI/CD

Not configured in this repository. There is no .github/workflows/ or
equivalent. A minimal pipeline worth adding:

1. On every PR: npm install && npm run build for both apps.
2. On every PR: npm run test for the API (requires internet access for
   mongodb-memory-server's binary download, or MONGOMS_SYSTEM_BINARY
   pointed at a mongod pre-installed in the CI image).
3. On merge to main: build and push Docker images, then deploy.

## Runbook: common incidents

"Orders aren't reaching the kitchen display"
1. Check the KDS browser's console for Socket.IO connection errors - is
   the staff JWT still valid?
2. Check whether the order is scheduled and hasn't hit its release window
   yet (Outlet.settings.scheduledOrderReleaseWindowMinutes) - this is by
   design, not a bug.
3. Check GET /kitchen/board?outletId=... directly to see if the order is
   present in the API response but not rendering (frontend bug) vs absent
   entirely (backend/socket issue).

"Stock wasn't deducted for a completed order"
1. Check whether the menu item actually has a Recipe defined - items
   without one are silently skipped by design.
2. Check the outlet's stockDeductionTrigger setting.
3. Check InventoryLedger for a SALE_CONSUMPTION entry with referenceId
   equal to the order's _id.

"A payment isn't confirming"
1. Cash payments confirm synchronously - check API logs for a thrown error.
2. Non-cash payments require the webhook. In development with the mock
   provider, use POST /payments/dev/simulate-webhook (staff-authenticated)
   to manually complete the flow.
3. Check the webhook's signature verification isn't rejecting a legitimate
   call - see docs/SECURITY.md.

## Admin login (seeded)

See the root README.md "Test credentials" section - owner@hcf.example /
Passw0rd!123 is the seeded OWNER account with access to every admin page.
