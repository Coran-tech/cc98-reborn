param(
  [string]$RuntimeDirectory = (Join-Path $env:USERPROFILE 'Documents/GitHub/cc98-semantic-lab-runtime'),
  [switch]$KeepProxy,
  [switch]$SkipDownload
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$python = Join-Path $runtime 'venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) {
  & python -m venv (Join-Path $runtime 'venv')
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.10-3.13 is required.' }
}
# Keep the normal proxy available to curl: Python TLS can fail through the same
# proxy even when the official CPU wheel downloads correctly with system curl.
& $python (Join-Path $root 'install_cpu_torch.py') --runtime-dir $runtime
if ($LASTEXITCODE -ne 0) { throw 'CPU Torch installation failed.' }
$wheelCache = Join-Path $runtime 'wheels'
$requirements = Join-Path $root 'requirements-models.txt'
$names = @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $dependenciesInstalled = $false
  if (Test-Path -LiteralPath $wheelCache -PathType Container) {
    Write-Host 'Installing model dependencies from the local wheel cache.'
    & $python -m pip install --disable-pip-version-check --no-index --find-links $wheelCache -r $requirements
    $dependenciesInstalled = $LASTEXITCODE -eq 0
    if (!$dependenciesInstalled) { Write-Host 'The local wheel cache is incomplete; trying the configured package index.' }
  }
  if (!$dependenciesInstalled) {
    # -KeepProxy is available for networks that require their existing proxy.
    if (!$KeepProxy) {
      foreach ($name in @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY')) { [Environment]::SetEnvironmentVariable($name, '', 'Process') }
      $env:NO_PROXY = '*'
    }
    & $python -m pip install --disable-pip-version-check --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw 'pip installation failed.' }
    & $python -m pip install --disable-pip-version-check -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Model dependencies installation failed.' }
  }
  & $python -m pip check
  if ($LASTEXITCODE -ne 0) { throw 'Installed model dependencies are inconsistent.' }
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
$installedRequirements = @(& $python -m pip freeze)
if ($LASTEXITCODE -ne 0) { throw 'Could not record installed model dependencies.' }
$installedRequirements | Set-Content -LiteralPath (Join-Path $runtime 'installed-requirements.txt') -Encoding UTF8
if (!$SkipDownload) {
  & $python (Join-Path $root 'download_models.py') all --cache-dir (Join-Path $runtime 'models')
  if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Run setup.cmd again to resume.' }
}
Write-Host 'Setup complete. Run start.cmd to open the local comparison tool.'
