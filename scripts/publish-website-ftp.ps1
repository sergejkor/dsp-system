<#
.SYNOPSIS
  Build production frontend and upload frontend/dist to your web hosting via FTP/FTPS (e.g. Goneo).

.DESCRIPTION
  Does NOT deploy the Node backend. Use deploy-all.ps1 + VPS for API, or deploy backend separately.
  Set VITE_BACKEND_URL in frontend/.env before build (e.g. https://api.alfamile.com).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/publish-website-ftp.ps1 `
    -GoneoHost "546540.test-my-website.de" -GoneoUsername "u123456" -GoneoRemotePath "/htdocs/dsp-system"

  $env:GONEO_FTP_PASSWORD = "secret"
  .\scripts\publish-website-ftp.ps1 -GoneoHost "..." -GoneoUsername "..."
#>
param(
  [Parameter(Mandatory = $false)]
  [string]$GoneoHost = "",
  [Parameter(Mandatory = $false)]
  [string]$GoneoUsername = "",
  [string]$GoneoRemotePath = "/htdocs/dsp-system",
  [ValidateSet("ftp", "ftps")]
  [string]$GoneoProtocol = "ftps",
  [switch]$SkipBuild,
  [switch]$GitPush,
  [string]$Branch = "main",
  [switch]$ForceDirty
)

$ErrorActionPreference = "Stop"

function Resolve-ToolPath([string]$name, [string[]]$fallbacks) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in $fallbacks) {
    if (Test-Path $p) { return $p }
  }
  throw "Command '$name' is not available in PATH and not found in fallback locations."
}

$gitExe = Resolve-ToolPath "git" @(
  "C:\Program Files\Git\cmd\git.exe",
  "C:\Program Files\Git\bin\git.exe",
  "C:\Program Files (x86)\Git\cmd\git.exe"
)
$curlExe = Resolve-ToolPath "curl.exe" @("C:\Windows\System32\curl.exe")

if (-not (Test-Path ".git")) {
  throw "Run this script from the repository root (dsp-system)."
}

if (-not $GoneoHost) {
  $GoneoHost = Read-Host "FTP host (e.g. 546540.test-my-website.de)"
}
if (-not $GoneoUsername) {
  $GoneoUsername = Read-Host "FTP username"
}
if (-not $GoneoHost -or -not $GoneoUsername) {
  throw "GoneoHost and GoneoUsername are required."
}

if ($GitPush) {
  $status = & $gitExe status --porcelain
  if ($status -and -not $ForceDirty) {
    throw "Working tree has uncommitted changes. Commit/stash or use -ForceDirty."
  }
  Write-Host "Pushing '$Branch' to origin..."
  & $gitExe push origin $Branch
}

$distDir = Join-Path (Get-Location) "frontend\dist"
if (-not $SkipBuild) {
  Write-Host "Building frontend (production)..."
  Push-Location "frontend"
  try {
    npm install
    npm run build
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $distDir)) {
  throw "frontend/dist not found. Run without -SkipBuild or run 'npm run build' in frontend/."
}

$ftpPassword = [Environment]::GetEnvironmentVariable("GONEO_FTP_PASSWORD")
if (-not $ftpPassword) {
  $secure = Read-Host "FTP password for $GoneoUsername@$GoneoHost" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $ftpPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $ftpPassword) {
  throw "FTP password is empty. Set environment variable GONEO_FTP_PASSWORD or enter when prompted."
}

Write-Host "Uploading to ${GoneoProtocol}://${GoneoHost}$GoneoRemotePath ..."
$files = Get-ChildItem -Path $distDir -Recurse -File
$n = 0
foreach ($file in $files) {
  $relativePath = $file.FullName.Substring($distDir.Length).TrimStart('\', '/')
  $relativeUnix = $relativePath -replace '\\', '/'
  $encodedPath = ($relativeUnix.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
  $url = "{0}://{1}{2}/{3}" -f $GoneoProtocol, $GoneoHost, $GoneoRemotePath.TrimEnd('/'), $encodedPath
  & $curlExe --silent --show-error --ftp-create-dirs --user "${GoneoUsername}:${ftpPassword}" -T "$($file.FullName)" "$url"
  if ($LASTEXITCODE -ne 0) {
    throw "Upload failed for $relativeUnix (curl exit $LASTEXITCODE)"
  }
  $n++
}

Write-Host "Uploaded $n files. Website publish complete." -ForegroundColor Green
Write-Host "Ensure backend/data/finance and /api/finance are deployed on your API server if you use Finance page." -ForegroundColor DarkGray
