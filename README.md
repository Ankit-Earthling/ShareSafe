# ShareSafe

ShareSafe lets a user keep files in a private account and create temporary, access-limited links for recipients. It uses local storage for development and supports private Backblaze B2 object storage for hosted deployments, with MongoDB metadata.

## Technology and architecture

- Frontend: React, Vite, JavaScript, CSS
- Backend: Node.js, Express, Multer
- Database: MongoDB with Mongoose
- Security: bcrypt, JWT session cookies, hashed share tokens, Helmet, CORS allow-list, Origin checks, and rate limits

The React frontend and Express API run separately. The frontend uses `VITE_API_BASE_URL` for API calls. `STORAGE_DRIVER=local` (the development default) stores files under `backend/uploads/`; `STORAGE_DRIVER=b2` uses a private Backblaze B2 bucket. B2 files are streamed only through the backend after authorization checks; the frontend never receives object URLs. Each file records its storage provider, while MongoDB stores metadata only. A share token is derived from a cryptographically random per-link seed and a dedicated server secret; MongoDB stores the token hash and seed, never the bearer token. Keep `SHARE_TOKEN_SECRET` stable or existing share URLs will stop working. Cookie-authenticated state changes require the configured frontend `Origin`.

## Project structure

```text
frontend/
  src/components/   Dashboard, file, link, and upload components
  src/context/      Authenticated user state
  src/pages/        Login, registration, and public share page
  src/services/     API client
backend/
  config/            Environment and MongoDB setup
  controllers/       Auth, file, share, and health handlers
  middleware/        Authentication, CSRF Origin check, and errors
  models/            User, file metadata, and share links
  routes/            API route groups
  services/          Authentication, scanner adapters, and local/B2 storage adapters
  tests/             MongoDB-backed integration tests
  uploads/           Private local file contents (ignored by Git)
  server.js          API entry point
```

## Prerequisites

- Node.js and npm
- MongoDB Community Server running locally, or a MongoDB URI the backend can access

On Windows, check whether MongoDB runs as a service in PowerShell:

```powershell
Get-Service MongoDB
```

If stopped, start PowerShell as an administrator and run `Start-Service MongoDB`. For a manually managed MongoDB installation, start it using that installation's data directory and configuration.

## Configure and start

In the backend terminal:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Edit `backend/.env`:

- `PORT`: API port, usually `3000`.
- `MONGODB_URI`: MongoDB URI, such as `mongodb://127.0.0.1:27017/sharesafe`.
- `FRONTEND_URL`: Exact frontend origin, usually `http://localhost:5173`.
- `JWT_SECRET`: Private random secret with at least 32 characters. The example placeholder is rejected.
- `SHARE_TOKEN_SECRET`: Different private random secret with at least 32 characters. Keep it stable to preserve existing share URLs.
- `ADMIN_PASSWORD`: Optional 12–72 byte password for the local demo admin. Leave empty to generate a strong password on first seed; the generated password is printed once and preserved on later runs.
- `DEFAULT_STORAGE_QUOTA_BYTES`: Per-user quota in bytes (default 524288000, or 500 MiB). It is set when an account is created; configure before registering users.
- `MALWARE_SCANNER`: `clamav` (default, for local development) or `bouncer`.
- `CLAMAV_COMMAND`: ClamAV scanner executable path or command name (default `clamscan`); used when `MALWARE_SCANNER=clamav`.
- `BOUNCER_API_KEY`: Private Bouncer API key, required only when `MALWARE_SCANNER=bouncer`. Configure it in the backend environment only; never use a `VITE_` variable.
- `STORAGE_DRIVER`: `local` (default for development) or `b2`. Render startup is rejected unless B2 is selected because Render's filesystem is ephemeral.
- `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET`, `B2_KEY_ID`, `B2_APPLICATION_KEY`: Required only for B2 storage. Use the bucket's HTTPS S3 endpoint and a bucket-scoped application key. Keep the bucket private and all B2 credentials in the backend environment.

Never commit or share `.env`. Start the backend in that terminal:

```powershell
npm run seed:admin
npm run dev
```

### Malware scanning

ShareSafe supports the local ClamAV scanner and the Bouncer malware scanning API. Configure exactly one backend provider with `MALWARE_SCANNER`; scanner selection and credentials are server-side. Files become available only after an exact `clean` result. Suspicious and infected files are blocked and removed; provider errors, timeouts, quota exhaustion, incomplete scans, and unknown results remain blocked as failed. Scanner credentials and provider response details are not returned to the browser or written to application logs.

For Bouncer, set `MALWARE_SCANNER=bouncer` and `BOUNCER_API_KEY` in `backend/.env` (or the backend host's secret environment settings), then restart the backend. Use an API key created in the Bouncer dashboard. The installed `@usebouncer/sdk` version supports Node.js 20+ and automatically switches files above its 4 MiB internal threshold to Bouncer's v2 upload flow. Bouncer's documentation lists a 25 MB v2 maximum for its Free tier and 500 scans per month; the ShareSafe upload limit remains 10 MB. Larger files and scans beyond the account allowance are rejected and never marked clean. See the [official Bouncer API documentation](https://usebouncer.dev/docs/).

The SDK buffers file data for upload, so concurrent 10 MB uploads can use significant memory. Provider scan failures remain fail-closed. Mocked tests do not establish that an account has valid credentials, remaining quota, or operational service access; confirm a real clean scan separately before enabling Bouncer for users.

For local ClamAV on Windows:

Install ClamAV for Windows using the [official Windows installer or portable package](https://docs.clamav.net/faq/faq-win32.html) and update its virus database using the included `freshclam` utility ([signature database setup](https://docs.clamav.net/manual/Usage/SignatureManagement.html)). Confirm `clamscan.exe` runs from PowerShell, then either add its install directory to `PATH` or set `CLAMAV_COMMAND` in `backend/.env` to the full path to `clamscan.exe` (enter the path without surrounding quotes). Set `MALWARE_SCANNER=clamav` and restart the backend. A successful upload response with `scanStatus: clean` means the configured scanner completed a clean scan. When the configured scanner is missing or fails, uploads are retained as failed and blocked from downloads and sharing; no file is treated as clean.

The seed command is restricted to a local MongoDB URI and refuses to run with `NODE_ENV=production`. It creates or updates `admin@sharesafe.local` with the `admin` role. If `ADMIN_PASSWORD` is empty, it generates a random password only when creating the account; save the one-time output. Subsequent runs preserve that password. Set `ADMIN_PASSWORD` in the ignored `.env` to explicitly set or rotate it.

In a second terminal, start the frontend:

```powershell
cd frontend
npm ci
npm run dev
```

The frontend defaults to `http://localhost:3000/api`. To change it, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL`.

## Implemented features

- Registration, login, logout, and current-user restoration with bcrypt hashes and HttpOnly JWT cookies.
- Local-only idempotent demo admin seed command; new registrations always receive the regular `user` role.
- Authenticated file uploads up to 10 MB. Supported formats: PDF, PNG, JPEG, GIF, WebP, TXT, and CSV. Each account has a configurable 500 MiB default storage quota.
- Local storage remains available for development. The B2 adapter stores private objects and streams them through backend authorization routes. `backend/scripts/migrateLocalFilesToB2.js` supports verified, repeatable migration without deleting the original local files.
- Uploaded files remain pending and cannot be downloaded or shared until the selected scanner reports an exact clean verdict. Suspicious and infected files are removed; unavailable or unknown scanner results remain failed and blocked.
- User-owned file listing, metadata lookup, and deletion. Deleting a file also revokes its associated shares and removes the provider's stored object.
- Owner-only file details and downloads.
- Share links with 1–30 day expiry, optional bcrypt-protected passwords, and a maximum of 1,000 accesses. Owners can choose downloads or view-only PDF previews with a viewer/link/time watermark overlay.
- Public recipient page and attachment download; access counts are enforced atomically. Public share attempts are rate-limited.
- Share owners can list, copy, inspect download history, and revoke their links. The dashboard reflects real file and share metadata.
- Light/dark themes, search, responsive dashboard, and backend connection status.
- Health endpoint: `GET /api/health`.

## API overview

Authenticated endpoints use the HttpOnly cookie returned by register/login. File/share mutations also require the configured frontend Origin.

| Method and path | Purpose |
| --- | --- |
| `POST /api/auth/register` | Create an account |
| `POST /api/auth/login` | Start a session (10 attempts per 15 minutes per IP) |
| `POST /api/auth/logout` | Clear the session cookie |
| `GET /api/auth/me` | Get the signed-in user |
| `POST /api/files/upload` | Upload multipart field `file` (10 MB maximum) |
| `GET /api/files` | List the signed-in user's files |
| `GET /api/files/:id` | Get owned file metadata |
| `GET /api/files/:id/download` | Download an owned file |
| `DELETE /api/files/:id` | Delete an owned file |
| `POST /api/shares` | Create a share (`fileId`, `expiryDays`, `maxAccesses`, optional `password`) |
| `GET /api/shares` | List the signed-in user's shares |
| `GET /api/shares/:id/history` | Get successful download timestamps for an owned share |
| `DELETE /api/shares/:id` | Revoke an owned share |
| `GET /api/public/shares/:token` | Check a public share and get safe file details |
| `POST /api/public/shares/:token/access` | Validate optional password and download the file |
| `POST /api/public/shares/:token/preview` | Validate a view-only link and return a watermarked PDF preview stream |

The backend can reproduce an owner's URL from its random per-link seed and `SHARE_TOKEN_SECRET`, so existing active links remain copyable after reload without storing raw bearer tokens. Keep the dedicated secret stable; changing it invalidates existing links.

## Checks

Backend integration tests use local MongoDB databases named `sharesafe_auth_test`, `sharesafe_files_test`, and `sharesafe_shares_test`. Keep MongoDB running, then run:

```powershell
cd backend
npm test
```

Frontend checks:

```powershell
cd frontend
npm run lint
npm run build
```

## Render deployment preparation

`render.yaml` defines a static frontend and Node API, an API rewrite for same-origin cookie requests, B2 storage, and Bouncer scanning. Review [the Render deployment guide](docs/deployment-render.md) before creating services. The Blueprint deliberately requests real secrets in Render instead of containing placeholder credentials. The deployment is not verified until the deployed API can access the private B2 bucket and a real clean file scan succeeds through the deployed service.

## Still pending

- Email verification, password recovery, and server-side session revocation.
- Existing links created before token-seed support cannot have their original URL recovered; recreate those links if their original URL is unavailable.
- Real B2 account integration, local-to-Atlas/B2 migration rehearsal, Render service creation, deployed B2 and Bouncer smoke tests, and automated frontend interaction tests.
- Additional safe file types and configurable upload limits.
