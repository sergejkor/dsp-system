param(
  [string]$Server = "root@109.199.122.154",
  [string]$RemoteRepoPath = "/root/dsp-system",
  [string]$Branch = "main",
  [string]$BackendAppName = "dsp-backend",
  [string]$FrontendPublishCommand = "__SKIP__",
  [switch]$PublishFrontendToGoneo,
  [string]$GoneoHost = "",
  [string]$GoneoUsername = "",
  [string]$GoneoRemotePath = "",
  [ValidateSet("ftp", "ftps", "sftp")]
  [string]$GoneoProtocol = "ftp",
  [switch]$ForceDirty
)

$ErrorActionPreference = "Stop"

function Assert-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Command '$name' is not available in PATH."
  }
}

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
$curlExe = Resolve-ToolPath "curl.exe" @(
  "C:\Windows\System32\curl.exe"
)

if (-not (Test-Path ".git")) {
  throw "Run this script from repository root."
}

$status = & $gitExe status --porcelain
if ($status -and -not $ForceDirty) {
  throw "Working tree has uncommitted changes. Commit/stash or use -ForceDirty."
}

Write-Host "Pushing local '$Branch' to origin..."
& $gitExe push origin $Branch

$publishCmdEscaped = $FrontendPublishCommand -replace "'", "'""'""'"

$remoteTemplate = @'
set -euo pipefail

REPO_PATH='__REPO_PATH__'
BRANCH='__BRANCH__'
BACKEND_APP='__BACKEND_APP__'
FRONTEND_PUBLISH_COMMAND='__FRONTEND_PUBLISH__'

echo "==> Deploy start on $(hostname)"
cd "$REPO_PATH"

if [ -n "$(git status --porcelain)" ]; then
  echo "==> Remote repo has local changes. Stashing before pull."
  git stash push -u -m "auto-deploy-$(date +%Y%m%d-%H%M%S)" >/dev/null || true
fi

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

echo "==> Backend: install + restart pm2"
cd "$REPO_PATH/backend"
npm install --omit=dev
if [ -f "data/finance/workbook-snapshot.json" ]; then
  echo "==> Finance data file: OK (data/finance/workbook-snapshot.json)"
else
  echo "==> WARNING: data/finance/workbook-snapshot.json missing — Finance page will show no data until you add it or set FINANCE_XLSX_PATH"
fi
pm2 restart "$BACKEND_APP" --update-env || pm2 start src/server.js --name "$BACKEND_APP"

echo "==> Frontend: install + build"
cd "$REPO_PATH/frontend"
npm install
npm run build

if [ "$FRONTEND_PUBLISH_COMMAND" != "__SKIP__" ]; then
  echo "==> Frontend publish command"
  bash -lc "$FRONTEND_PUBLISH_COMMAND"
else
  echo "==> Frontend publish skipped."
  echo "    Pass -FrontendPublishCommand to copy dist to web root."
fi

echo "==> Deploy done."
'@

$remoteScript = $remoteTemplate.Replace('__REPO_PATH__', $RemoteRepoPath)
$remoteScript = $remoteScript.Replace('__BRANCH__', $Branch)
$remoteScript = $remoteScript.Replace('__BACKEND_APP__', $BackendAppName)
$remoteScript = $remoteScript.Replace('__FRONTEND_PUBLISH__', $publishCmdEscaped)

Write-Host "Running remote deploy on $Server ..."
# Important on Windows: strip CR so remote bash doesn't see "set -euo pipefail\r".
$remoteScriptUnix = $remoteScript -replace "`r", ""
$remoteScriptUnix | & $sshExe $Server "bash -s"

if ($PublishFrontendToGoneo) {
  if (-not $GoneoHost -or -not $GoneoUsername -or -not $GoneoRemotePath) {
    throw "Goneo publish enabled, but host/username/remote path is missing."
  }

  $distDir = Join-Path (Get-Location) "frontend\dist"
  if (-not (Test-Path $distDir)) {
    throw "frontend/dist not found locally. Build local frontend first or adjust workflow."
  }

  $ftpPassword = [Environment]::GetEnvironmentVariable("GONEO_FTP_PASSWORD")
  if (-not $ftpPassword) {
    $secure = Read-Host "Enter Goneo FTP password for $GoneoUsername@$GoneoHost" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $ftpPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
  if (-not $ftpPassword) {
    throw "FTP password is empty. Set GONEO_FTP_PASSWORD or enter it when prompted."
  }

  Write-Host "Building local frontend for Goneo publish..."
  Push-Location "frontend"
  try {
    npm install
    npm run build
  } finally {
    Pop-Location
  }

  Write-Host "Uploading frontend/dist to ${GoneoProtocol}://${GoneoHost}${GoneoRemotePath} ..."
  $files = Get-ChildItem -Path $distDir -Recurse -File
  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($distDir.Length).TrimStart('\','/')
    $relativeUnix = $relativePath -replace '\\','/'
    $encodedPath = ($relativeUnix.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $url = "{0}://{1}{2}/{3}" -f $GoneoProtocol, $GoneoHost, $GoneoRemotePath.TrimEnd('/'), $encodedPath
    & $curlExe --silent --show-error --ftp-create-dirs --user "$GoneoUsername`:$ftpPassword" -T "$($file.FullName)" "$url"
    if ($LASTEXITCODE -ne 0) {
      throw "Upload failed for $relativeUnix"
    }
  }
  Write-Host "Goneo frontend publish complete." -ForegroundColor Green
}

Write-Host "Deployment finished." -ForegroundColor Green
