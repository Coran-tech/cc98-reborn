param(
  [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$packageName = "cc98-reborn-$version.zip"
$unpackedName = "cc98-reborn-$version"
$dist = Join-Path $root $OutputDirectory
$zipPath = Join-Path $dist $packageName
$stage = Join-Path $dist $unpackedName

New-Item -ItemType Directory -Force -Path $dist | Out-Null
$distFull = [System.IO.Path]::GetFullPath($dist)
$stageFull = [System.IO.Path]::GetFullPath($stage)
if (-not $stageFull.StartsWith($distFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Package stage must remain inside the output directory: $stageFull"
}
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}
if (Test-Path $stage) {
  if ((Get-Item -LiteralPath $stage -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw "Refusing to remove linked package stage: $stageFull"
  }
  Remove-Item $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "src") | Out-Null

@(
  "manifest.json",
  "assets",
  "images",
  "popup",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "PRIVACY.md"
) | ForEach-Object {
  Copy-Item -Path (Join-Path $root $_) -Destination $stage -Recurse
}

@(
  "background.js",
  "content.js",
  "extended-ubb-core.js",
  "extended-ubb.js",
  "extended-ubb.css",
  "openid-webvpn-bridge.js",
  "page-submit-monitor.js",
  "styles.css",
  "vendor"
) | ForEach-Object {
  Copy-Item -Path (Join-Path $root "src\$_") -Destination (Join-Path $stage "src") -Recurse
}

$questionStage = Join-Path $stage "experiments\question-mark"
New-Item -ItemType Directory -Force -Path $questionStage | Out-Null
@(
  "admin-key-store.js",
  "admin.html",
  "admin.js",
  "background.js",
  "content.js",
  "content.css"
) | ForEach-Object {
  Copy-Item -LiteralPath (Join-Path $root "experiments\question-mark\$_") -Destination $questionStage
}

$releasePaths = Get-ChildItem -Force -Path $stage | ForEach-Object { $_.FullName }
Compress-Archive -Path $releasePaths -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "Packaged $zipPath"
Write-Host "Unpacked extension $stage"
