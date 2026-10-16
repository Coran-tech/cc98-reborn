param(
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')]
  [string]$Build = (Get-Date -Format 'yyyyMMdd.HHmmss')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$source = [IO.File]::ReadAllText($manifestPath)
$manifest = $source | ConvertFrom-Json
$label = "beta $($manifest.version) (build $Build)"
# Preserve the manifest formatting and stable extension key; only the display
# label changes. The numeric version remains suitable for update comparisons.
if ($manifest.PSObject.Properties['version_name']) {
  $source = [regex]::Replace($source, '"version_name"\s*:\s*"[^"\r\n]*"', ('"version_name": "' + $label + '"'))
} else {
  $source = [regex]::Replace($source, '("version"\s*:\s*"[^"\r\n]+"\s*,)', ('$1' + "`n  `"version_name`": `"$label`","))
}
[IO.File]::WriteAllText($manifestPath, $source, [Text.UTF8Encoding]::new($false))
Write-Host "Test version: $label"
