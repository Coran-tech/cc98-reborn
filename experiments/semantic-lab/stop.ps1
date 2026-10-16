param([string]$RuntimeDirectory = (Join-Path $env:USERPROFILE 'Documents/GitHub/cc98-semantic-lab-runtime'))
$ErrorActionPreference = 'Stop'
$tokenFile = Join-Path $RuntimeDirectory 'service-token.txt'
if (!(Test-Path -LiteralPath $tokenFile)) { Write-Host 'Local service is not configured.'; exit 0 }
Add-Type -AssemblyName System.Net.Http
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(3)
try {
  $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', ([IO.File]::ReadAllText($tokenFile).Trim()))
  $content = [System.Net.Http.StringContent]::new('{}', [Text.Encoding]::UTF8, 'application/json')
  $response = $client.PostAsync('http://127.0.0.1:8766/api/v1/shutdown', $content).GetAwaiter().GetResult()
  if (!$response.IsSuccessStatusCode) { throw 'The local service rejected shutdown.' }
  Write-Host 'Shutdown requested. Any current calculation finishes before memory is released.'
} finally { $client.Dispose(); $handler.Dispose() }
