param(
  [string]$OutputDirectory = "dist",
  [switch]$TestBuild,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')]
  [string]$Build
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if ($Build -and -not $TestBuild) { throw '-Build requires -TestBuild' }
if ($TestBuild -and -not $Build) { $Build = Get-Date -Format 'yyyyMMdd.HHmmss' }
$unpackedName = if ($TestBuild) { "cc98-reborn-beta" } else { "cc98-reborn-$version" }
$packageName = "$unpackedName.zip"
$dist = Join-Path $root $OutputDirectory
$built = Join-Path $dist "chrome-mv3"
$zipPath = Join-Path $dist $packageName
$publishedStage = Join-Path $dist $unpackedName
$stage = if ($TestBuild) { Join-Path $dist '.cc98-reborn-beta-staging' } else { $publishedStage }

if (-not (Test-Path (Join-Path $built "manifest.json"))) {
  throw "Built extension not found at $built. Run 'pnpm build' first."
}

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

# Ship the deployable source with the extension so the manual download does
# not depend on a repository path or a separately published release asset.
& (Join-Path $PSScriptRoot 'package-semantic-lab.ps1') -OutputDirectory $OutputDirectory
Copy-Item -LiteralPath (Join-Path $dist 'cc98-semantic-lab.zip') -Destination (Join-Path $root 'assets/semantic-lab.zip') -Force

# The WXT build already contains manifest.json, images, assets, the generated
# popup and the content/background bundles. Copy it as-is, except the manifest
# which receives the optional beta label below.
Get-ChildItem -LiteralPath $built -Force | Where-Object { $_.Name -ne "manifest.json" } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stage $_.Name) -Recurse
}

@("README.md", "CHANGELOG.md", "LICENSE", "PRIVACY.md") | ForEach-Object {
  $source = Join-Path $root $_
  if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination $stage }
}

$stagedManifestPath = Join-Path $stage 'manifest.json'
$stagedManifest = [IO.File]::ReadAllText((Join-Path $built 'manifest.json'))
if ($TestBuild) {
  $label = "beta $version (build $Build)"
  $stagedManifest = [regex]::Replace($stagedManifest, '"version"\s*:\s*"([^"]+)"', ('"version": "$1",' + "`n  `"version_name`": `"$label`""), 'One')
} else {
  if (($stagedManifest | ConvertFrom-Json).PSObject.Properties['version_name']) {
    throw 'Release manifest must not contain version_name'
  }
}
[IO.File]::WriteAllText($stagedManifestPath, $stagedManifest, [Text.UTF8Encoding]::new($false))

$releasePaths = Get-ChildItem -Force -Path $stage | ForEach-Object { $_.FullName }
Compress-Archive -Path $releasePaths -DestinationPath $zipPath -CompressionLevel Optimal
if ($TestBuild) {
  $publishedFull = [IO.Path]::GetFullPath($publishedStage)
  if (-not $publishedFull.StartsWith($distFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Beta directory leaves output root' }
  New-Item -ItemType Directory -Force -Path $publishedStage | Out-Null
  $links = @(Get-Item -LiteralPath $publishedStage -Force; Get-ChildItem -LiteralPath $publishedStage -Recurse -Force) | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
  if ($links) { throw 'Refusing linked paths inside the fixed beta directory' }
  # Keep the directory itself mounted. Replace runtime files in place, prune
  # stale build files, and write the manifest last so Reload sees a full build.
  $builtFiles = @(Get-ChildItem -LiteralPath $stage -Recurse -File -Force)
  foreach ($file in $builtFiles | Where-Object { $_.FullName -ne $stagedManifestPath }) {
    $relative = $file.FullName.Substring($stageFull.Length + 1)
    $target = Join-Path $publishedStage $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  }
  foreach ($file in Get-ChildItem -LiteralPath $publishedStage -Recurse -File -Force) {
    $relative = $file.FullName.Substring($publishedFull.Length + 1)
    if (-not (Test-Path -LiteralPath (Join-Path $stage $relative) -PathType Leaf)) { Remove-Item -LiteralPath $file.FullName -Force }
  }
  Copy-Item -LiteralPath $stagedManifestPath -Destination (Join-Path $publishedStage 'manifest.json') -Force
  Remove-Item -LiteralPath $stageFull -Recurse -Force
}
Write-Host "Packaged $zipPath"
Write-Host "Unpacked extension $publishedStage"
