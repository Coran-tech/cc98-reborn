param(
  [string]$OutputDirectory = "dist"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$packageName = "cc98-reborn-$version.zip"
$dist = Join-Path $root $OutputDirectory
$zipPath = Join-Path $dist $packageName
$stage = Join-Path $dist "package"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}
if (Test-Path $stage) {
  Remove-Item $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "src") | Out-Null

@(
  "manifest.json",
  "assets",
  "popup",
  "README.md",
  "README.zh-CN.md",
  "CHANGELOG.md",
  "LICENSE",
  "PRIVACY.md"
) | ForEach-Object {
  Copy-Item -Path (Join-Path $root $_) -Destination $stage -Recurse
}

@(
  "background.js",
  "content.js",
  "styles.css"
) | ForEach-Object {
  Copy-Item -Path (Join-Path $root "src\$_") -Destination (Join-Path $stage "src")
}

$releasePaths = Get-ChildItem -Force -Path $stage | ForEach-Object { $_.FullName }
Compress-Archive -Path $releasePaths -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force
Write-Host "Packaged $zipPath"
