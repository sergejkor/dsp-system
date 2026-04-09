# One-click deploy

## Deploy frontend directly to the website (FTP / Goneo)

From the repo root — builds `frontend` with `frontend/.env` (set `VITE_BACKEND_URL` to your live API, e.g. `https://api.alfamile.com`) and uploads `frontend/dist` to the host.

```powershell
$env:GONEO_FTP_PASSWORD = "your-ftp-password"
powershell -ExecutionPolicy Bypass -File scripts/publish-website-ftp.ps1 `
  -GoneoHost "YOUR_FTP_HOST" `
  -GoneoUsername "YOUR_FTP_USER" `
  -GoneoRemotePath "/htdocs/dsp-system" `
  -GoneoProtocol ftps
```

If you omit host or username, the script will prompt. Password: env `GONEO_FTP_PASSWORD` or interactive prompt.

Optional: `-GitPush` pushes `main` before build; add `-ForceDirty` if you have uncommitted changes (push still only sends committed work).

Optional: `-SkipBuild` if you already ran `npm run build` in `frontend/`.

**SPA routing:** `frontend/public/.htaccess` must be on the server (uploaded with `dist` if it was copied into `dist` at build time — Vite copies `public/` into `dist/`).

**API:** The static site only serves HTML/JS; `/api/*` must reach your Node backend (e.g. `api.alfamile.com`). Deploy backend separately (`deploy-all.ps1` on the VPS or your process).

### VS Code task

Use **Deploy: Website (FTP only)** — you will be prompted for FTP host/user (or pass them by editing the task args in `.vscode/tasks.json`).

---

## Run from Cursor/VS Code (full stack)

Use task:

- `Deploy: Full stack (frontend + backend)`

This task runs with `-ForceDirty`, so local uncommitted changes do not block deployment
(only pushed commits are deployed).
By default task publishes backend and builds frontend on remote server.
Frontend upload to hosting is skipped (manual upload workflow).

You can also use **deploy-all.ps1** with Goneo FTP in one run:

- `-PublishFrontendToGoneo`
- `-GoneoHost`
- `-GoneoUsername`
- `-GoneoRemotePath`
- `-GoneoProtocol ftp|ftps|sftp`

## Run from terminal

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-all.ps1
```

## What script does

1. `git push origin main`
2. SSH to server
3. In remote repo:
   - stash local changes (if any)
   - `git pull --rebase`
   - backend: `npm install --omit=dev` + `pm2 restart dsp-backend`
   - frontend: `npm install` + `npm run build`

## Publish frontend to web root

By default, script only builds frontend.
If your web root needs copying from `frontend/dist`, pass publish command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-all.ps1 `
  -FrontendPublishCommand "rsync -a --delete /root/dsp-system/frontend/dist/ /var/www/html/"
```

Adjust destination path for your server.

---

## Finance page: `Finance API not found` (404)

A **404** on `/api/finance` means the **Node process answering at your API URL does not run this repo’s latest `server.js`** (no `app.use('/api/finance', …)`), or a **reverse proxy** returns 404 before Node.

### 1. Check deployed API (no login)

Open or run:

`https://api.alfamile.com/api/health`

**New backend** returns JSON like:

```json
{
  "ok": true,
  "service": "dsp-system-backend",
  "finance": {
    "routeMounted": true,
    "snapshotExists": true,
    ...
  }
}
```

- If **`finance` is missing** → old backend still running: **pull latest code**, `cd backend && npm install --omit=dev`, **`pm2 restart …`** (or your process manager), confirm **PM2 `cwd`/script path** points at the same repo you updated.
- If **`finance.snapshotExists` is false** → copy **`backend/data/finance/workbook-snapshot.json`** onto the server (or set **`FINANCE_XLSX_PATH`** in `.env` to an `.xlsx` file). Without data you get a JSON error from `/api/finance`, not 404 — but health still shows `snapshotExists: false`.

### 2. Confirm the browser calls the same API

Production build uses **`frontend/.env`** → **`VITE_BACKEND_URL`**. It must match the host where you deployed the new backend (e.g. `https://api.alfamile.com`).

### 3. CORS

If the website is not `https://dsp-system.alfamile.com`, add its origin to **`CORS_ALLOWED_ORIGINS`** in backend `.env` (comma-separated). Otherwise the browser may block requests (you would usually see a CORS error in DevTools, not always a clean 404).
