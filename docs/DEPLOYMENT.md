# Deployment

## Services

docker-compose.yml defines five services: mongo, redis, api, web, nginx.
redis and the SSL profile of nginx are new in Part 3.

## Quick start (HTTP, local/staging)

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec api npm run seed
```

Visit http://localhost (routed through nginx) or the individual ports
(web:5173, api:4000) directly.

## Production deployment with HTTPS

1. Provision a domain pointing at your server's public IP.

2. Obtain a TLS certificate. The simplest path is Let's Encrypt via
   certbot's standalone mode before nginx is listening on 80/443:
   ```bash
   docker run --rm -p 80:80 -v "$(pwd)/docker/certs:/etc/letsencrypt/live/yourdomain.com" \
     certbot/certbot certonly --standalone -d yourdomain.com
   ```
   Place the result at docker/certs/fullchain.pem and
   docker/certs/privkey.pem (the paths docker/nginx.prod.conf expects).

3. Switch nginx to the production config. In docker-compose.yml, uncomment
   the two volume lines under the nginx service so nginx.prod.conf and the
   certs directory are mounted instead of the plain HTTP nginx.conf.
   docker/nginx.prod.conf terminates TLS, redirects HTTP to HTTPS, and
   proxies /api and /socket.io (with the Upgrade/Connection headers
   WebSocket needs), plus HSTS/X-Frame-Options/X-Content-Type-Options
   headers.

4. Set real environment variables. At minimum, override every "change me"
   default in .env:
   - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET - generate with
     `openssl rand -hex 32` each.
   - MONGO_ROOT_PASSWORD - a strong, unique password.
   - PAYMENT_WEBHOOK_SECRET - matches whatever your real payment gateway
     signs with, once one is integrated (Part 3 ships a verified-signature
     webhook endpoint against the mock provider; wiring a real gateway
     means implementing PaymentProvider once - see services/payment/).
   - CORS_ORIGIN - your actual frontend origin(s), not a wildcard.
   - VITE_API_BASE_URL / VITE_SOCKET_URL - your public HTTPS domain.

5. Bring the stack up:
   ```bash
   docker compose up --build -d
   docker compose exec api npm run seed
   ```

6. Certificate renewal: Let's Encrypt certs expire every 90 days. Run
   certbot's renewal on a schedule and reload nginx afterward:
   ```bash
   docker run --rm -v "$(pwd)/docker/certs:/etc/letsencrypt/live/yourdomain.com" \
     certbot/certbot renew
   docker compose exec nginx nginx -s reload
   ```

## Scaling notes

- The api service is stateless (JWT auth, no in-memory session store), so
  it can be scaled horizontally behind the existing nginx upstream. If you
  do this, also point express-rate-limit at a shared Redis store (see
  docs/SECURITY.md) so rate limits are enforced consistently across
  instances rather than per-process.
- MongoDB: the default docker-compose.yml runs a single standalone
  instance. For high availability, run a proper MongoDB replica set (3
  nodes minimum) - this also unlocks multi-document ACID transactions if a
  future phase needs them (see docs/PART2.md for why Part 2 deliberately
  didn't require one).
- Redis: a single instance is sufficient for its current one job (menu
  caching); if you also move rate-limiting to Redis under heavy
  multi-instance load, consider Redis Sentinel/Cluster for HA.

## Health checks

- GET /health (unversioned, no auth) is available for your orchestrator's
  healthcheck against the api service.
- MongoDB and Redis both have healthcheck blocks in docker-compose.yml
  already, and api waits on both via depends_on: condition: service_healthy
  for Mongo (a hard requirement) - Redis is a depends_on ordering hint
  only, since the app functions without it (see docs/PART3.md "Redis").
