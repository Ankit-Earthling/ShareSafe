# ShareSafe

ShareSafe lets a user keep files in a private account and create temporary, access-limited links for recipients. It is an early development application with local file storage and MongoDB metadata.

## Technology and architecture

- Frontend: React, Vite, JavaScript, CSS
- Backend: Node.js, Express, Multer
- Database: MongoDB with Mongoose
- Security: bcrypt, JWT session cookies, hashed share tokens, Helmet, CORS allow-list, Origin checks, and rate limits

The React frontend and Express API run separately. The frontend uses `VITE_API_BASE_URL` for API calls. The backend stores file contents under `backend/uploads/` using random storage names and keeps metadata in MongoDB. Each file and share belongs to its authenticated owner. A share token is generated once and only its SHA-256 hash is stored. Cookie-authenticated state changes require the configured frontend `Origin`.

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
  services/          Authentication and local file storage
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

Never commit or share `.env`. Start the backend in that terminal:

```powershell
npm run dev
```

In a second terminal, start the frontend:

```powershell
cd frontend
npm ci
npm run dev
```

The frontend defaults to `http://localhost:3000/api`. To change it, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL`.

## Implemented features

- Registration, login, logout, and current-user restoration with bcrypt hashes and HttpOnly JWT cookies.
- Authenticated file uploads up to 10 MB. Supported formats: PDF, PNG, JPEG, GIF, WebP, TXT, and CSV.
- User-owned file listing, metadata lookup, and deletion. Deleting a file also revokes its associated shares and removes its local contents.
- Share links with 1–30 day expiry, optional bcrypt-protected passwords, and a maximum of 1,000 downloads.
- Public recipient page and attachment download; access counts are enforced atomically. Public share attempts are rate-limited.
- Share owners can list and revoke their links. The dashboard reflects real file and share metadata.
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
| `DELETE /api/files/:id` | Delete an owned file |
| `POST /api/shares` | Create a share (`fileId`, `expiryDays`, `maxAccesses`, optional `password`) |
| `GET /api/shares` | List the signed-in user's shares |
| `DELETE /api/shares/:id` | Revoke an owned share |
| `GET /api/public/shares/:token` | Check a public share and get safe file details |
| `POST /api/public/shares/:token/access` | Validate optional password and download the file |

The generated public URL is shown for copying at creation time. Because only a hash is stored, the raw token cannot be recovered to copy an older link after a page reload; its owner can revoke it and create a replacement.

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

## Still pending

- Email verification, password recovery, and server-side session revocation.
- Cloud storage, production deployment configuration, and automated frontend interaction tests.
- Additional safe file types and configurable upload limits.
