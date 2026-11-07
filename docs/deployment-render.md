# Render + Atlas + Backblaze B2 deployment

This is a prepared deployment configuration, not a completed deployment. The Render Blueprint is `render.yaml`. Do not deploy until the live B2 and Bouncer checks below pass and the exact generated Render service URL has been confirmed. The free Render web service has an ephemeral filesystem; this project now refuses to start on Render unless `STORAGE_DRIVER=b2`.

## Service layout

- `sharesafe-web`: Render Static Site built from `frontend/`, publishes `dist/`, and rewrites `/api/*` to the backend service. This keeps browser API requests and the HttpOnly `SameSite=Lax` auth cookie same-origin. The `/*` rewrite serves React routes such as `/share/<token>` on refresh.
- `sharesafe-api`: free Node web service rooted at `backend/`, built with `npm ci`, started with `npm start`, and health-checked at `/api/health`.
- MongoDB Atlas M0 stores metadata only.
- A private Backblaze B2 bucket stores file bytes. The API streams files after authorization checks; it never returns direct B2 URLs.
- Bouncer is selected on the backend. Its key never belongs in frontend variables.

The Blueprint uses `sharesafe-web.onrender.com` and `sharesafe-api.onrender.com`. Confirm those exact URLs in Render before deploying. If Render assigns different service URLs, update the API rewrite destination and backend `FRONTEND_URL` before creating the services.

## Render environment values

Render supplies `PORT` to the backend. Configure the following service values in the Render Dashboard; the Blueprint marks credentials `sync: false` so it contains no placeholders or secrets.

### Backend only

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `STORAGE_DRIVER` | `b2` |
| `MALWARE_SCANNER` | `bouncer` |
| `MONGODB_URI` | Atlas application connection string; URL-encode special characters in the password |
| `FRONTEND_URL` | Exact static site origin, initially `https://sharesafe-web.onrender.com` |
| `JWT_SECRET` | Private random value, at least 32 characters |
| `SHARE_TOKEN_SECRET` | Different private random value, at least 32 characters; keep stable |
| `DEFAULT_STORAGE_QUOTA_BYTES` | `524288000` (500 MiB per new user) |
| `BOUNCER_API_KEY` | Server-side key from the Bouncer dashboard |
| `B2_ENDPOINT` | HTTPS S3 endpoint for the bucket's Backblaze region |
| `B2_REGION` | Exact B2 region identifier for the bucket |
| `B2_BUCKET` | Private bucket name |
| `B2_KEY_ID` | B2 application key ID scoped to this bucket |
| `B2_APPLICATION_KEY` | Secret portion of that B2 application key |

Do not set `CLAMAV_COMMAND` for this deployment. ClamAV remains the local-development choice. Render's free 512 MB instance is below ClamAV's recommended memory requirements; select Bouncer and verify an actual clean scan through the deployed service before accepting uploads.

### Static site only

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `/api` |

Vite embeds this value during the static build. Never place `BOUNCER_API_KEY`, B2 keys, MongoDB credentials, or JWT secrets in any `VITE_*` variable.

## Private B2 configuration and migration

Create the bucket as **private**. Create a dedicated application key limited to that bucket and the operations needed to upload, read, inspect, and delete objects. Do not enable public bucket access. Keep B2 and Bouncer credentials only in the backend service's secret environment.

The storage adapter keeps local development on `STORAGE_DRIVER=local`. On Render, local disk is used only as temporary upload staging and is removed after scanning; the verified object is stored in B2. MongoDB stores opaque random object keys and a per-file `storageProvider`. Owner downloads, share downloads, and PDF previews are streamed through authenticated/validated backend routes, preserving owner authorization, scan gates, and atomic share limits.

For an existing local database, first back up MongoDB and `backend/uploads/`. Import the metadata into the target Atlas database without changing storage keys, then run the migration command from a trusted machine that has those local upload files and backend credentials configured:

```powershell
cd backend
npm run storage:migrate:b2
npm run storage:migrate:b2 -- --apply
```

The first command is a dry run. The apply command uploads each locally accounted file to the same opaque key, verifies its byte length and SHA-256 metadata, and changes the record to B2 only after verification. It is idempotent and does not delete local originals. Review failures and verify downloads before separately deciding how to archive/remove local copies. This project does not automatically import MongoDB data or delete local files.

For a new Atlas database with no local file metadata, no migration is needed.

## Pre-deployment gates

1. Confirm the Render outbound IP ranges can be added to Atlas M0's access list. Use only the documented service ranges for the selected region, not `0.0.0.0/0`; Render's default ranges are shared and may rotate.
2. Confirm Atlas M0 has enough of its 512 MB metadata/index storage budget and take an external backup/export plan. B2 files do not consume Atlas storage.
3. Verify the B2 bucket is private and the bucket-scoped key can list/head, put, get, and delete a disposable test object. Verify unauthorized/public object requests fail.
4. After deployment is explicitly approved, require `/api/health` to return `database: connected` and `storage: connected` before traffic. This checks B2 bucket access, not malware scanning.
5. Through the deployed UI, upload a harmless clean test file and verify a completed Bouncer clean result, download it as the owner, share it, and download through the public share route. Confirm the browser never receives a B2 URL.
6. Upload the standard harmless EICAR test file using a disposable account; confirm the scan blocks the file and quota is released. Verify suspicious verdicts also stay blocked. A local real Bouncer scan does not substitute for this deployed test.
7. Confirm files persist after a Render restart/redeploy and verify view-only preview, passwords, expiry, access limits, history, revocation, deletion, and per-user quota behavior through the deployed stack.

## Free-tier limitations and release blockers

- Render Free web services use 512 MB RAM, 0.1 CPU, spin down after 15 minutes without requests, and have an ephemeral filesystem. Free services cannot attach persistent disks. Use B2 for all durable file bytes.
- Render free service bandwidth/build allowances can suspend services when exceeded without a payment method. Proxying every file download through the backend consumes Render egress; watch usage and keep expected traffic small.
- Atlas M0 has a hard 512 MB storage limit. Its free-tier access is internet-facing; allowlist Render's regional shared outbound ranges and use strong DB credentials.
- B2 storage and egress are not unlimited on the free allocation. Monitor usage; application per-user quotas do not impose a global B2 account cap.
- The Bouncer SDK buffers file bytes during upload. The app's 10 MB maximum remains below Bouncer's documented Free-tier v2 limit, but simultaneous uploads consume backend memory. Render Free may be unreliable under concurrent scans.
- Actual B2 account access and a live scan from the deployed Render service have not been performed. Do not describe this stack as production verified until both live gates pass.
- Render free resources are intended for hobby/testing use and may sleep or be suspended at usage limits. Public-service reliability is not guaranteed by this configuration.
