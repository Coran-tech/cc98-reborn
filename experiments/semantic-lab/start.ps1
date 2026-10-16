param(
  [string]$RuntimeDirectory = (Join-Path $env:USERPROFILE 'Documents/GitHub/cc98-semantic-lab-runtime'),
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
$python = Join-Path $runtime 'venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Run setup.cmd first.' }
Add-Type -AssemblyName System.Net.Http
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(2)
$url = 'http://127.0.0.1:8766'
function Get-LabHealth {
  try { return ($client.GetStringAsync($url + '/api/v1/health').GetAwaiter().GetResult() | ConvertFrom-Json) } catch { return $null }
}
try {
  $health = Get-LabHealth
  if (!$health) {
    $serverFile = Join-Path $PSScriptRoot 'server.py'
    $cache = Join-Path $runtime 'models'
    $token = Join-Path $runtime 'service-token.txt'
    $arguments = @('-u', ('"' + $serverFile + '"'), '--cache-dir', ('"' + $cache + '"'), '--token-file', ('"' + $token + '"'), '--extension-id', 'njfhkgjkndlmegmocgdmlmkddifagafk')
    $process = Start-Process -FilePath $python -ArgumentList $arguments -WindowStyle Hidden -PassThru -WorkingDirectory $PSScriptRoot -RedirectStandardOutput (Join-Path $runtime 'service.stdout.log') -RedirectStandardError (Join-Path $runtime 'service.stderr.log')
    [IO.File]::WriteAllText((Join-Path $runtime 'service.pid'), [string]$process.Id)
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Milliseconds 300
      $health = Get-LabHealth
      if ($health) { break }
      if ($process.HasExited) { throw 'Service exited. Check service.stderr.log in the runtime directory.' }
    }
  }
  if (!$health -or $health.schemaVersion -ne 1) { throw 'Local service could not start; port 8766 may be occupied.' }
  Write-Host ('Local comparison tool: ' + $url)
  if (!$NoBrowser) { Start-Process $url }
} finally { $client.Dispose(); $handler.Dispose() }
