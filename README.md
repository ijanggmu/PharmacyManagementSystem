# Pharmacy Management System

Multi-tenant pharmacy management for Nepal-focused pharmacies: a .NET modular-monolith API (built on the [fullstackhero .NET starter kit](docs/fullstackhero-README.md)) with a Next.js web app.

## Layout

```
src/                      .NET API, modules, DB migrator, Aspire AppHost, tests
clients/
  pharmacywebapp/         Next.js app pharmacy staff use (BFF → .NET API) — see its README
  admin/                  Platform operator console (React + Vite): tenants, plans, audits
deploy/docker/            Production docker-compose (+ optional Caddy TLS edge)
deploy/terraform/         AWS (ECS/RDS) infrastructure from the starter kit
docs/                     Design notes and plans
```

## Run locally

Everything (Postgres, Redis, MinIO, API, pharmacy web app, admin) through Aspire:

```bash
yarn --cwd clients/pharmacywebapp install
npm install --prefix clients/admin
dotnet run --project src/Host/FSH.Starter.AppHost
```

Pharmacy web app: <http://localhost:3000> · Admin: <http://localhost:5173> · Aspire dashboard: printed on startup.

## Deploy

See [`deploy/docker/README.md`](deploy/docker/README.md) — one VPS, `docker compose --profile caddy up -d --build`.
