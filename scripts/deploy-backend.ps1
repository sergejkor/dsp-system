param(
  [string]$Server = "root@109.199.122.154",
  [string]$RemoteRepoPath = "/root/dsp-system",
  [string]$Branch = "main",
  [string]$BackendAppName = "dsp-backend",
  [switch]$ForceDirty
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
  throw "Repository root was not found next to scripts/."
}

Set-Location $RepoRoot

function Resolve-ToolPath([string]$name, [string[]]$fallbacks) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  foreach ($p in $fallbacks) {
    if (Test-Path $p) {
      return $p
    }
  }
  throw "Command '$name' is not available in PATH and not found in fallback locations."
}

$gitExe = Resolve-ToolPath "git" @(
  "C:\Program Files\Git\cmd\git.exe",
  "C:\Program Files\Git\bin\git.exe",
  "C:\Program Files (x86)\Git\cmd\git.exe",
  "C:\Program Files (x86)\Git\bin\git.exe"
)

$sshExe = Resolve-ToolPath "ssh" @(
  "C:\Windows\System32\OpenSSH\ssh.exe",
  "C:\Program Files\Git\usr\bin\ssh.exe"
)

$status = & $gitExe status --porcelain
if ($status -and -not $ForceDirty) {
  throw "Working tree has uncommitted changes. Commit/stash or use -ForceDirty."
}

Write-Host "Pushing local '$Branch' to origin..."
& $gitExe push origin $Branch

$remoteTemplate = @'
set -euo pipefail

REPO_PATH='__REPO_PATH__'
BRANCH='__BRANCH__'
BACKEND_APP='__BACKEND_APP__'

echo "==> Backend deploy start on $(hostname)"
cd "$REPO_PATH"

if [ -n "$(git status --porcelain)" ]; then
  echo "==> Remote repo has local changes. Stashing before pull."
  git stash push -u -m "auto-backend-deploy-$(date +%Y%m%d-%H%M%S)" >/dev/null || true
fi

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

echo "==> Backend: install + restart pm2"
cd "$REPO_PATH/backend"
npm install --omit=dev
pm2 restart "$BACKEND_APP" --update-env || pm2 start src/server.js --name "$BACKEND_APP"

echo "==> Backend health check"
curl -fsS http://127.0.0.1:3001/api/health

echo
echo "==> Backend deploy done."
'@

$remoteScript = $remoteTemplate.Replace('__REPO_PATH__', $RemoteRepoPath)
$remoteScript = $remoteScript.Replace('__BRANCH__', $Branch)
$remoteScript = $remoteScript.Replace('__BACKEND_APP__', $BackendAppName)

Write-Host "Running backend deploy on $Server ..."
$remoteScriptUnix = $remoteScript -replace "`r", ""
$remoteScriptUnix | & $sshExe $Server "bash -s"

Write-Host "Backend deployment finished." -ForegroundColor Green
