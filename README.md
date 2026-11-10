# ShareSafe

ShareSafe is a local-first file sharing application. Users can upload files, inspect metadata, share downloads or view-only PDF previews, and configure passwords, expiration dates, access limits, revocation, and access history.

**The currently supported setup runs on one Windows 11 PC:** React + Vite, Node.js + Express, local MongoDB, local filesystem storage, and ClamAV in Docker. Cloud hosting and object storage are future deployment work.

## Architecture and data flow

- React calls the Express REST API through `http://localhost:3000/api`.
- Express uses local MongoDB at `mongodb://127.0.0.1:27017/sharesafe` by default. MongoDB holds user, file, quota, and sharing metadata, never file contents.
- Multer places an upload temporarily in `backend/uploads/.staging/`. The backend streams it to the local ClamAV daemon using ClamD's `INSTREAM` protocol.
- Only an explicit `stream: OK` verdict allows the staged file to be moved into the persistent `backend/uploads/` directory. An infected, unknown, timed-out, or unavailable scan is blocked, the temporary file is cleaned up, and the reserved quota is released.
- The backend stores an opaque random key in MongoDB. Private files are streamed through owner-authorized or validated share routes; the app does not expose a public uploads URL.

## Windows 11 prerequisites

- Node.js 22.12 or newer and npm.
- MongoDB Community Server running locally, or Docker Desktop for an optional local MongoDB container.
- Docker Desktop with its Linux container engine enabled for ClamAV.
- Git, if cloning the repository.

ClamAV uses the official `clamav/clamav` image. This repository pins `clamav/clamav:1.5.4`; review [official ClamAV releases](https://github.com/Cisco-Talos/clamav/releases) and update that tag when adopting a newer patched release. The image includes the ClamAV daemons and signature database; Compose persists the database in a Docker volume. The daemon port is published only on `127.0.0.1`.

## First-time local setup

Run these PowerShell commands from the repository root. The copy commands preserve any existing environment files.

```powershell
if (-not (Test-Path backend\.env)) {
    Copy-Item backend\.env.example backend\.env
}
if (-not (Test-Path frontend\.env.local)) {
    Copy-Item frontend\.env.example frontend\.env.local
}
```

Open `backend/.env` and replace both signing-secret placeholders with different random values. In PowerShell, generate each value with:

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Do not reuse either secret elsewhere or commit the `.env` file. MongoDB, frontend origin, local storage, and ClamAV connection values in the example are safe local defaults.

### MongoDB

If MongoDB Community Server is installed as a Windows service, check it with:

```powershell
Get-Service MongoDB
Test-NetConnection 127.0.0.1 -Port 27017
```

If the service is stopped, start it from an elevated PowerShell window:

```powershell
Start-Service MongoDB
```

If MongoDB is not installed as a Windows service but Docker Desktop is available, start a persistent local database container:

```powershell
docker run -d --name sharesafe-mongodb -p 127.0.0.1:27017:27017 -v sharesafe-mongodb-data:/data/db mongo:8
```

On later starts, use `docker start sharesafe-mongodb`. The named Docker volume keeps database files across container restarts. Do not run `docker volume rm` for this volume unless you intend to delete the local database.

### ClamAV

From the repository root, start the local ClamAV service:

```powershell
docker compose up -d clamav
docker compose ps
docker compose logs -f clamav
```

The first start may take several minutes while the image initializes and its signature database loads. Wait for the service health check to pass. The official image runs `clamd` and FreshClam; its database volume persists signature data. Stop viewing logs with `Ctrl+C` (the container continues running).

The daemon protocol is not encrypted or authenticated. Compose binds port 3310 to loopback only. Do not change that mapping to `0.0.0.0` or expose it to a network.

## Start ShareSafe

Open three PowerShell terminals at the repository root.

**Terminal 1 — ClamAV**, if it is not already running:

```powershell
docker compose up -d clamav
```

**Terminal 2 — backend:**

```powershell
cd backend
npm install
npm run dev
```

**Terminal 3 — frontend:**

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The backend listens on port 3000 by default. `PORT`, `MONGODB_URI`, `FRONTEND_URL`, and `VITE_API_BASE_URL` can be set for a different local setup. The Vite API URL is embedded at build time.

## Health and readiness

- Liveness: `http://localhost:3000/api/health` returns HTTP 200 while the Express process is running.
- Readiness: `http://localhost:3000/api/ready` reports whether MongoDB, local storage, and ClamAV are available. It returns HTTP 503 while a required dependency is unavailable.
- Backend startup logs report whether the ClamAV daemon and its definitions are ready. The backend may start without ClamAV so the UI remains usable, but uploads fail closed until scanning is ready.

PowerShell checks:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/ready
```

## Malware scanning

ShareSafe uses ClamAV locally and has no external scanning API. The backend connects to `127.0.0.1:3310` by default. It streams staged bytes to ClamD using `INSTREAM`, so it does not load an entire uploaded file into memory. The command framing and response handling follow the [official ClamD protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).

Only an explicit clean reply makes a file downloadable or shareable. Infected replies are rejected. Unknown replies, connection errors, missing definitions, and timeouts are treated as scan failures, never as clean. The upload-size limit remains 10 MiB.

After Docker reports ClamAV healthy and `/api/ready` reports `scanner: connected`, run a live clean/EICAR check:

```powershell
cd backend
npm run test:clamav:live
```

This command writes both fixtures only into the temporary staging directory, scans them through the real daemon, expects a clean verdict for the harmless fixture and detection for the standard EICAR test fixture, then removes both. Do not upload EICAR through a normal account or place it in persistent user storage. A passing mocked backend test does not prove the live daemon or its definitions work.

## Uploads, storage, and sharing

- Files are limited to 10 MiB and checked against the allowed extension, declared MIME type, and file signature/content.
- Temporary upload data lives in `backend/uploads/.staging/`; accepted clean files are moved to persistent `backend/uploads/`. Do not delete or replace this directory during normal code updates. Back it up together with MongoDB.
- Each user has a 500 MiB default quota. Reservations are made atomically; rejected scans and failed uploads clean up their staged bytes and release quota.
- File metadata includes the scan state. Files without a clean verdict cannot be downloaded or shared.
- Sharing retains password protection, expiry, download/access limits, revocation, access history, and view-only PDF preview. Link tokens are cryptographically random and stored hashed. Owners can only manage their own files and links.
- `backend/services/storage/` retains an optional B2 adapter for future work, but local storage is the supported configuration. No B2 account or credentials are needed for local operation.

## Environment variables

`backend/.env.example` contains local defaults and placeholder signing secrets:

- `PORT` — backend port, default `3000`.
- `MONGODB_URI` — local MongoDB URI, default `mongodb://127.0.0.1:27017/sharesafe`.
- `FRONTEND_URL` — local Vite origin, default `http://localhost:5173`.
- `JWT_SECRET` and `SHARE_TOKEN_SECRET` — separate private values; each must be at least 32 characters.
- `DEFAULT_STORAGE_QUOTA_BYTES` — quota for new accounts, default `524288000`.
- `STORAGE_DRIVER` — `local` by default. `b2` is retained as an optional adapter and requires its provider credentials; it is not part of the supported local setup.
- `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_CONNECT_TIMEOUT_MS`, `CLAMAV_TIMEOUT_MS` — local daemon settings, defaulting to `127.0.0.1`, `3310`, `5000`, and `120000` milliseconds.

`frontend/.env.example` sets `VITE_API_BASE_URL=http://localhost:3000/api`. Never put backend secrets in a `VITE_*` variable.

## Tests and build checks

```powershell
cd backend
npm test
npm run test:clamav:live
```

Backend lint is not configured. Frontend checks:

```powershell
cd frontend
npm test
npm run lint
npm run build
```

The live ClamAV check requires Docker Desktop and a healthy local `clamav` service. Backend integration tests also require the local MongoDB service or container.

### Latest verification status

- Backend tests: 31 passed.
- Frontend tests: 6 passed.
- Frontend lint and production build: passed.
- Real ClamAV clean-file and EICAR scans: passed.
- Local upload, download, malware rejection, and deletion integration tests: passed.
- Manual browser verification was performed by the project owner. Automated browser testing is not claimed here.

## Troubleshooting

**MongoDB connection refused:** Check `Get-Service MongoDB` and `Test-NetConnection 127.0.0.1 -Port 27017`. If using Docker, check `docker ps` and `docker logs sharesafe-mongodb`. Confirm `MONGODB_URI` points to the local database. Do not delete the database volume to troubleshoot connectivity.

**Docker command fails:** Start Docker Desktop, wait for its engine to finish starting, and verify with `docker info` and `docker compose version`.

**ClamAV is unavailable or readiness reports scanner disconnected:** Check `docker compose ps` and `docker compose logs clamav`. Wait for database initialization and a healthy container. Confirm `CLAMAV_HOST=127.0.0.1` and `CLAMAV_PORT=3310`. Uploads remain blocked until the daemon responds and reports loaded virus definitions.

**ClamAV times out:** Allow the daemon to finish initializing, check Docker Desktop memory allocation, then retry. Increase `CLAMAV_TIMEOUT_MS` only if slower scanning is expected; failures must remain fail-closed.

**Port already in use:** Check `Get-NetTCPConnection -LocalPort 27017,3000,3310,5173 -State Listen` and stop or reconfigure the conflicting local service.

## Security and data limitations

- Local storage is plaintext on the host filesystem. Use Windows account permissions and full-disk protection, and maintain backups.
- ClamAV is a malware filter, not a guarantee that every harmful file will be detected. Keep its signatures current and fail closed when it is unavailable.
- ClamD TCP has no transport encryption or authentication. The provided configuration is restricted to local loopback. Do not expose it publicly.
- The application is configured for local development, not public internet use. Do not expose the development server or ClamAV port to untrusted networks.
- Local files and MongoDB are separate persistence layers; include both in a recovery plan.

## Future hosting roadmap

Hosting is not the current supported setup. A future Render, VPS, or other deployment needs a deliberate review and configuration for:

- Persistent private object storage (or secured persistent disks) and a migration plan for existing local files.
- Production MongoDB, restricted network access, credentials, backups, and restore testing.
- A private-network ClamAV service or another secured scanning service with enough memory, scan capacity, updated definitions, timeouts, and monitoring. Do not expose ClamD's unauthenticated TCP port publicly.
- Production-only secrets supplied by the host, never committed or embedded in frontend build variables.
- HTTPS, exact CORS origins, secure cookies, and a trusted reverse-proxy configuration verified for that provider.
- Persistent storage, database/object backups, monitoring, usage limits, retention, and malware-scan failure alerts.

No future-hosting configuration or public deployment is claimed as implemented or tested here.
