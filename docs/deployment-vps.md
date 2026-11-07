# ShareSafe VPS deployment preparation (superseded)

This earlier VPS/local-disk plan is retained for history. It does not describe the current Render + Atlas + B2 target. Use [deployment-render.md](deployment-render.md); do not deploy this VPS configuration for the selected architecture.

This runbook prepares ShareSafe for an Ubuntu LTS VPS with persistent disk. It is not a deployment: the provider, operating system image, domain names, production MongoDB URI, and deployment approval have not been supplied. Do not put real credentials in this file.

## Current application requirements

- Node.js 22.12+ is required by the current Vite toolchain; use a supported Node.js LTS release on both build and runtime systems.
- MongoDB is an external runtime dependency. The backend needs a production `MONGODB_URI` reachable from the VPS.
- The API listens on `PORT` (normally 3000) and reads its frontend allow-list from `FRONTEND_URL`.
- The frontend embeds `VITE_API_BASE_URL` at build time. Set it before building.
- Uploaded file contents live in `backend/uploads/`, outside MongoDB. The directory must be on persistent storage and writable by the service account. Do not replace or clean it during application updates.
- ClamAV is invoked as a local command. The production service needs `clamscan` installed, current virus definitions, and permission to execute it. The app fails closed when scanning cannot complete.
- Keep `SHARE_TOKEN_SECRET` stable across releases; changing it invalidates existing share URLs. Keep `JWT_SECRET` stable to avoid invalidating sessions.
- The current default account quota is 500 MiB. `DEFAULT_STORAGE_QUOTA_BYTES` configures the value assigned to new accounts; existing accounts retain their stored quota.

## Recommended layout

Use one HTTPS site and one HTTPS API hostname under the same registrable domain (for example `files.example.com` and `api.example.com`). This aligns with the current secure, `SameSite=Lax` session cookie and exact-origin CORS configuration. Terminate HTTPS at Nginx and bind Node to localhost so port 3000 is not publicly exposed.

Use a persistent mount for the application checkout and uploads, for example `/srv/sharesafe`. Keep secrets in `/etc/sharesafe/backend.env`, outside the checkout. Back up MongoDB and the upload directory together according to an explicit retention plan.

## VPS setup checklist

1. Create an Ubuntu LTS VM and attach/mount persistent storage at `/srv/sharesafe`. Create a dedicated unprivileged `sharesafe` account. Permit inbound SSH only from trusted addresses and allow inbound TCP 80/443; keep 3000 private.
2. Install a supported Node.js LTS release, Git, Nginx, and ClamAV packages using the official distribution/vendor instructions. Enable FreshClam updates and verify `clamscan --version` and fresh definitions before starting the app.
3. Configure a MongoDB production database or managed cluster. Create a dedicated application user with access only to the ShareSafe database, use TLS, and allowlist only the VPS egress IP where supported.
4. Check out the approved release under `/srv/sharesafe/app`. Ensure `/srv/sharesafe/app/backend/uploads` is on the persistent mount and owned by `sharesafe`. Preserve this directory on upgrades.
5. Install dependencies from lockfiles with `npm ci` in `backend/` and `frontend/`.
6. Create `/etc/sharesafe/backend.env` with mode 600, owned by root or the service administrator. Example values (replace every placeholder):

   ```dotenv
   NODE_ENV=production
   PORT=3000
   MONGODB_URI=mongodb+srv://<app-user>:<url-encoded-password>@<cluster>/<database>?retryWrites=true&w=majority
   FRONTEND_URL=https://files.example.com
   JWT_SECRET=<unique-random-secret-at-least-32-characters>
   SHARE_TOKEN_SECRET=<different-stable-random-secret-at-least-32-characters>
   DEFAULT_STORAGE_QUOTA_BYTES=524288000
   CLAMAV_COMMAND=/usr/bin/clamscan
   ```

   Generate each secret independently, for example with `openssl rand -hex 32`. Never reuse a secret for both settings or place the resulting values in Git, shell history, tickets, or logs. URL-encode special characters in the MongoDB URI password.

7. Build the frontend with its production API address:

   ```bash
   cd /srv/sharesafe/app/frontend
   VITE_API_BASE_URL=https://api.example.com/api npm run build
   ```

   Serve `frontend/dist` from Nginx with an SPA fallback to `index.html`; do not expose the backend uploads directory as a static path.

8. Run the API under systemd as `sharesafe`, with working directory `/srv/sharesafe/app/backend`, `EnvironmentFile=/etc/sharesafe/backend.env`, and command `node server.js`. Restart on failure. Keep the process bound behind the reverse proxy/firewall; the app currently listens on all interfaces, so enforce localhost-only access to port 3000 with the host firewall and Nginx configuration.

9. Configure Nginx to proxy `/api/` to `http://127.0.0.1:3000`, preserve the `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers, allow uploads slightly above the 10 MiB application limit (for example 12 MiB), and use a proxy timeout longer than the scanner's 120-second timeout. Serve the frontend on its separate hostname and obtain TLS certificates before accepting user traffic.

10. Before directing users to the service, verify all of the following:
    - `https://api.example.com/api/health` reports `status: ok` and `database: connected`.
    - The backend service can run `/usr/bin/clamscan --version`; FreshClam is active and its database is current.
    - Upload one harmless clean test file through ShareSafe and confirm `scanStatus: clean` in the UI.
    - In a controlled test account, upload the standard EICAR test string/file and confirm the UI reports infected and sharing/download remain blocked. EICAR is a harmless antivirus test signature, but endpoint protection may quarantine it; do not disable protection to force the test.
    - Exercise registration/login/logout, quota enforcement, downloads, view-only preview, password-protected and limited links, expiry, and revocation over HTTPS.
    - Confirm uploads remain present after an application service restart and a planned release update.

## Release update procedure

Take and verify backups first. Fetch/check out the approved release, install dependencies with `npm ci`, build the frontend using the production API URL, restart the backend service, then check service logs and `/api/health`. Do not delete `backend/uploads`, rotate either signing secret, or change the MongoDB database as part of a routine code update. Roll back the application release if health checks fail; retain the persistent upload volume and database state.

## Known deployment gaps

- There is no checked-in systemd or Nginx configuration, CI/CD workflow, automated backup/restore procedure, or production infrastructure configuration yet.
- The current storage implementation has a fixed path relative to the backend checkout. Keep the checkout on persistent disk and preserve its `backend/uploads/` directory; moving uploads to a separate mount would require a focused storage-path configuration change.
- Backend startup logs a MongoDB connection failure but continues to listen. Treat the database-connected health response as a release gate; a future focused improvement could make startup fail immediately when MongoDB is unavailable.
- Production deployment and external user acceptance testing remain pending provider/domain/access details and explicit approval.
