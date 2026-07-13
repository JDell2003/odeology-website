# DEPLOYMENT — Scoring Engine v2 (SCORING_ENGINE_V2)

What the owner reviews before flipping `SCORING_ENGINE_V2` to `true` on Railway.
The app runs on **Railway** against **Neon Postgres** and auto-deploys on push to
`main` (repo `JDell2003/odeology-website`). Everything below is read from
`process.env` — **no secrets or environment-specific URLs are hardcoded**.

## A. Environment variables (Railway → service → Variables)

| Variable | Purpose | Local | Railway |
|---|---|---|---|
| `DATABASE_URL` | Neon connection string (`*.neon.tech` → serverless driver via `core/db.js`) | already set | **verify set & points at prod Neon** |
| `SCORING_ENGINE_V2` | Master feature flag | `false` | **`false` at launch — flip to `true` after verifying** |
| `DEFAULT_TZ` | Fallback timezone for the health day-boundary (Task 7) | `America/New_York` | same (or your default) |
| `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` | Fitbit OAuth | set | set |
| `FITBIT_SCOPES` | **Must include `heart`** for VO2max / resting-HR (Task 8) | `activity sleep profile heart` | same |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Strava OAuth (HR/distance/type already in `activity:read`) | set | set |
| `PUBLIC_BASE_URL` | OAuth callback base — **differs by env** (localhost vs Railway public domain) | `http://localhost:3000` | **Railway public domain** |
| `HEALTH_OAUTH_SECRET` | Signs the OAuth `state` param | optional | recommended in prod |
| `NODE_ENV` | `production` on Railway | `development` | `production` |

Do **not** hardcode any of these — the code reads `process.env` (matching how
`core/db.js` already does). On boot, `server.js` calls
`scoringGather.logScoringEnvStatus()` which logs (never throws) any missing
scoring-relevant var so you can spot config drift in the Railway logs.

## B. Schema on deploy

`ensureSchema()` (training + health) and `ensureScoringSchema()` run at boot
(wired into the `server.listen` callback in `server.js`), so Task 1's additive
migrations auto-apply on the next Railway deploy. All statements are
`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` —
additive only, never destructive.

**Verify in the Railway deploy logs** that you see:

```
[scoring] v2 schema ensured (training + health + scoring tables) - verify these CREATE/ALTER statements applied against prod Neon in the Railway deploy logs
```

and that the new tables/columns exist in prod Neon:
`app_score_snapshots`, `app_score_events`, `app_edit_audit`;
`app_training_profiles.sex/dob/timezone`; `app_daily_checkins.sources`;
`app_health_daily.wake_at/sleep_start_at/vigorous_minutes/vo2max/resting_hr`.

## C. Nightly job & multiple replicas

The periodic recompute (`runScoringRecomputePass`, boot + every 6 h in
`server.js`) is wrapped in a Postgres **advisory lock**
(`pg_try_advisory_lock(727274637)`) held on a single pooled client, so if
Railway ever runs more than one replica only ONE instance computes per tick.
The lock is released in a `finally` block on completion. Confirm in the logs
you never see two instances doing a full pass at the same time; a replica that
doesn't get the lock logs `recompute pass skipped - another instance holds the
advisory lock`.

## D. OAuth redirect URIs (owner action)

The Strava and Fitbit app registrations must list the **Railway production
callback URL** in addition to localhost, or prod OAuth breaks:

- Strava: `https://<railway-domain>/api/health/connect/strava/callback`
- Fitbit: `https://<railway-domain>/api/health/connect/fitbit/callback`

(The callback base comes from `PUBLIC_BASE_URL`, else the request host.)

## E. Fitbit `heart` scope (owner action)

The **Fitbit developer app registration itself** must be updated to request the
`heart` scope, and `FITBIT_SCOPES` must match — otherwise the new HR/VO2max pull
returns 403 in prod. Existing Fitbit connections made before this change won't
have the scope until the user reconnects.

## Acceptance / go-live checklist

- [ ] App boots on Railway with all vars present (check `logScoringEnvStatus` output).
- [ ] Deploy logs show the v2 schema applied against prod Neon.
- [ ] OAuth still works in prod (Strava + Fitbit) with the Railway callback URLs added.
- [ ] Nightly job single-runs under the advisory lock.
- [ ] `SCORING_ENGINE_V2` stays `false` until you flip it after this review.
