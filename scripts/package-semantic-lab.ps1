param([string]$OutputDirectory = 'dist')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = [IO.Path]::GetFullPath((Join-Path $root 'experiments/semantic-lab'))
$output = [IO.Path]::GetFullPath((Join-Path $root $OutputDirectory))
if (!$output.StartsWith([IO.Path]::GetFullPath($root) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must stay inside the project.' }
New-Item -ItemType Directory -Force -Path $output | Out-Null
$archivePath = Join-Path $output 'cc98-semantic-lab.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = @(Get-ChildItem -LiteralPath $source -Recurse -File -Force | Sort-Object FullName | Where-Object {
  $relative = $_.FullName.Substring($source.Length + 1).Replace('\', '/')
  $relative -notmatch '(^|/)(__pycache__|venv|models|\.runtime|\.git)(/|$)' -and $relative -notmatch '\.(pyc|log|partial)$' -and $_.Name -ne 'service-token.txt'
})
$reusable = $false
if (Test-Path -LiteralPath $archivePath) {
  $existing = $null
  try {
    $existing = [IO.Compression.ZipFile]::OpenRead($archivePath)
    $reusable = $existing.Entries.Count -eq $files.Count
    foreach ($file in $files) {
      if (!$reusable) { break }
      $relative = $file.FullName.Substring($source.Length + 1).Replace('\', '/')
      $entry = $existing.GetEntry('cc98-semantic-lab/' + $relative)
      if (!$entry -or $entry.Length -ne $file.Length) { $reusable = $false; break }
      $stream = $entry.Open()
      $hasher = [Security.Cryptography.SHA256]::Create()
      try { $entryHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
      finally { $stream.Dispose(); $hasher.Dispose() }
      if ($entryHash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) { $reusable = $false }
    }
  } catch { $reusable = $false }
  finally { if ($existing) { $existing.Dispose() } }
}
if (!$reusable -and (Test-Path -LiteralPath $archivePath)) { Remove-Item -LiteralPath $archivePath -Force }
$archive = if (!$reusable) { [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create) } else { $null }
$count = 0
try {
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($source.Length + 1).Replace('\', '/')
    if ($relative -match '(^|/)(__pycache__|venv|models|\.runtime|\.git)(/|$)' -or $relative -match '\.(pyc|log|partial)$' -or $file.Name -eq 'service-token.txt') { continue }
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked deployment sources are not allowed.' }
    if ($archive) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, ('cc98-semantic-lab/' + $relative), [IO.Compression.CompressionLevel]::Optimal) | Out-Null }
    $count++
  }
} finally { if ($archive) { $archive.Dispose() } }
$digest = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $output 'cc98-semantic-lab-SHA256.txt'), ($digest + '  cc98-semantic-lab.zip' + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
Write-Host ('Packaged standalone source: ' + $archivePath + ' (' + $count + ' files; no model weights or Python environment)')
