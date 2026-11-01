# TürkEra Takip Paneli — Project Map

This document is a navigation index for coding assistants and contributors. It describes responsibilities and important data flows; it intentionally does not duplicate source code. Verify the referenced implementation before changing behavior.

## Start here

| Need | Start with |
|---|---|
| App boot, routes/tabs, page composition | `src/main.tsx`, `src/App.tsx`, `src/components/Header.tsx` |
| WarEra client requests, response types, client caches | `src/services/wareraApi.ts` |
| Server HTTP endpoints in local development | `server.ts` |
| Vercel API entry points | `api/` |
| Shared server handlers | `src/server/handlers/` |
| Tracked military units | `src/config/trackedArmies.ts` |
| Daily snapshots and persistence | `src/server/services/daily-damage.ts`, `src/lib/supabaseStorage.ts` |
| Player mode rule | `src/lib/playerMode.ts` |
| Factory and worker income / conversion recipes | `src/server/handlers/player-factories.ts` |
| Build, development, type check | `package.json`, `vite.config.ts`, `tsconfig.json` |
| Deployment schedule and function limits | `vercel.json` |

## Main data flows

### Donation tracking

1. `src/components/ManagementDonationTrackingSection.tsx` requests the management overview through `src/services/wareraApi.ts`.
2. `src/server/handlers/management-overview.ts` fetches tracked-unit membership, user profiles and donations; it combines current data with daily snapshots and aggregates the overview.
3. `src/server/services/daily-damage.ts` records per-member daily snapshots. The scheduled Vercel entry point `api/cron/record-daily-damage.ts` requests donation-target capture; targets, rates, player mode, income, level and wealth are stored with the daily member snapshot.
4. `src/lib/supabaseStorage.ts` reads/upserts the `daily_snapshots` record in Supabase and enforces the 30-day retention policy.
5. The donation page uses date-specific targets for historical weekly totals. Detailed company calculations are loaded through the bulk `POST /api/player-factories` path; the individual calculation modal uses the single-player path.
6. `src/server/handlers/player-factories.ts` calculates automated-engine and employee income, applying item conversion recipes and input-material costs.

The canonical tracked unit list is `src/config/trackedArmies.ts`; server and client validation/display should derive from this list, not a hard-coded count.

### Daily damage and player mode

- Cron route: `api/cron/record-daily-damage.ts` → `src/server/services/daily-damage.ts`.
- Shared snapshots: `src/lib/supabaseStorage.ts`; calculations and weekly baselines: `src/lib/dailyDamage.ts`.
- Economy/combat mode classification: `src/lib/playerMode.ts`; consumers include the snapshot service and management handlers.
- Snapshot dates are retained for 30 days. Check the `Europe/Istanbul` game-day offset/reset logic before changing date calculations.
- Local Express routes are separately defined in `server.ts`; when changing cron/snapshot behavior, compare the local route with the Vercel API route.

### WarEra token and API access

- `src/lib/wareraTokens.ts` reads server-side `WARERA_API_TOKEN` / `WARERA_API_TOKENS` and rotates available tokens.
- `src/services/wareraApi.ts` contains browser-facing fetch functions, response interfaces and client-side cache behavior.
- `server.ts` and handlers under `src/server/handlers/` proxy upstream API requests; keep secrets server-side.
- A user-provided key is stored locally by the browser API-key UI (`src/components/ApiKeySection.tsx`) and sent to the server through request headers.

## Feature-to-file map

### App shell and shared UI

| Feature | Files |
|---|---|
| App entry and navigation state | `src/main.tsx`, `src/App.tsx`, `src/components/Header.tsx` |
| Global styling and types | `src/index.css`, `src/types.ts` |
| API key entry | `src/components/ApiKeySection.tsx`, `src/services/wareraApi.ts` |
| Common icons/formatting | `src/components/TurkEraLogo.tsx`, `src/components/DestinationFlag.tsx`, `src/utils/formatters.ts` |

### Economy, donations and country data

| Feature | Files |
|---|---|
| Donation table, weekly totals, filters, settings, exports | `src/components/ManagementDonationTrackingSection.tsx` |
| Donation calculation details and company breakdown | `src/components/DonationCalculationModal.tsx` |
| Company/factory and employee revenue calculations | `src/server/handlers/player-factories.ts`, `api/player-factories.ts` |
| Bulk company calculation client | `src/services/wareraApi.ts` (`fetchPlayerCompanyCalculations`) |
| Market prices | `src/components/MarketPricesSection.tsx`, `src/server/handlers/player-factories.ts` |
| Country statistics | `src/components/CountryStatsPanel.tsx`, `src/server/handlers/country-stats.ts`, `src/config/countryStatsArmies.ts` |
| Country tracking, citizens and management intelligence | `src/components/ManagementIntelligenceSections.tsx`, `src/server/handlers/management-intelligence.ts` |
| Treasury | `src/components/ManagementTreasurySection.tsx`, `src/server/handlers/management-treasury.ts` |
| Donation and PDF reports | `src/services/donationReportGenerator.ts`, `src/services/pdfReportGenerator.ts`, `src/utils/exportPdf.ts`, `src/utils/exportCountryPdf.ts` |

### Military, damage and tools

| Feature | Files |
|---|---|
| Army overview / army member table | `src/components/ManagementArmyTrackingSection.tsx`, `src/components/ArmyStatsTable.tsx`, `src/server/handlers/mu-data.ts` |
| Military overview and details | `src/components/MilitaryOverviewSection.tsx`, `src/components/MilitaryDetailsSection.tsx`, `src/server/handlers/military-overview.ts`, `src/server/handlers/military-details.ts` |
| Combat telemetry and daily damage | `src/components/DailyDamageTelemetrySection.tsx`, `src/components/AllianceDamageSection.tsx`, `src/server/handlers/combat-telemetry.ts`, `src/server/handlers/all-armies-daily-summary.ts` |
| Potential damage / combat classification | `src/lib/potentialDamage.ts`, `src/lib/dailyDamage.ts` |
| Level and prestige tools | `src/components/LevelCalculatorSection.tsx`, `src/components/PrestigeDamageOptimizerSection.tsx`, `src/utils/levelProgression.ts`, `src/utils/prestigeOptimizer.ts` |
| Shared management API dispatch | `src/server/handlers/management-overview.ts` |

## API entry points

Vercel function files in `api/` are thin entry points. Implementations generally live in `src/server/handlers/`.

| Endpoint | Entry / implementation |
|---|---|
| `/api/management-overview` | `api/management-overview.ts` → `src/server/handlers/management-overview.ts`; also dispatches management intelligence and treasury views |
| `/api/player-factories` | `api/player-factories.ts` → `src/server/handlers/player-factories.ts` |
| `/api/cron/record-daily-damage` | `api/cron/record-daily-damage.ts` → `src/server/services/daily-damage.ts` |
| `/api/daily-damage-snapshots` | `api/daily-damage-snapshots.ts` → `src/server/handlers/daily-damage-snapshots.ts` |
| `/api/all-armies-daily-summary` | `api/all-armies-daily-summary.ts` → `src/server/handlers/all-armies-daily-summary.ts` |
| `/api/combat-telemetry` | `api/combat-telemetry.ts` → `src/server/handlers/combat-telemetry.ts` |
| `/api/country-stats` | `api/country-stats.ts` → `src/server/handlers/country-stats.ts` |
| `/api/military-overview` | `api/military-overview.ts` → `src/server/handlers/military-overview.ts` |
| `/api/military-details` | `api/military-details.ts` → `src/server/handlers/military-details.ts` |
| `/api/mu-data` | `api/mu-data.ts` → `src/server/handlers/mu-data.ts` |
| `/api/warera-proxy` | `api/warera-proxy.ts`; local implementation also exists in `server.ts` |

Local development uses the Express routes in `server.ts`; it is not just a wrapper around every Vercel handler. Confirm both paths when modifying an endpoint used in both environments.

## Persistence, configuration and scripts

| Concern | Files |
|---|---|
| Supabase client, snapshots, cache | `src/lib/supabaseStorage.ts`, `src/services/supabaseStorage.ts` |
| Tracked armies and country-stat units | `src/config/trackedArmies.ts`, `src/config/countryStatsArmies.ts` |
| Daily snapshot processing | `src/server/services/daily-damage.ts` |
| Vercel cron schedule / function limits | `vercel.json` |
| Optional management cache SQL | `scripts/create-management-cache-table.sql` |
| Snapshot/backfill utilities | `scripts/seed-yesterday-baseline.ts`, `scripts/backfill-dtx-daily-baseline.ts`, `scripts/backfill-mu-member-baseline.ts` |
| Local development and build scripts | `package.json`, `server.ts` |

## Change and validation guide

- Follow the active code path from UI → `src/services/wareraApi.ts` → API entry → handler/service before changing behavior.
- Keep tracked-army behavior configuration-driven; avoid duplicating IDs or counts.
- For donation target changes, inspect both cron snapshot production and historical-date consumption in the management overview and donation component.
- For API changes, verify both Vercel `api/` and local `server.ts` paths when applicable.
- Available checks: `npm run lint` (TypeScript) and `npm run build` (Vite client + bundled server). There is no configured test script in `package.json`.
- Never put API tokens or Supabase service-role credentials in client code or documentation.
