[CmdletBinding()]
param(
  [ValidateSet("Panel", "Status", "Start", "Stop", "Restart", "Snapshot")]
  [string]$Mode = "Panel",
  [string]$SnapshotPath = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CC98LocalConsoleWindow
{
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr windowHandle, int command);
}
"@

if ($Mode -eq "Panel") {
  $consoleWindow = [CC98LocalConsoleWindow]::GetConsoleWindow()
  if ($consoleWindow -ne [IntPtr]::Zero) {
    [void][CC98LocalConsoleWindow]::ShowWindow($consoleWindow, 0)
  }
}

$script:ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$script:ServerPath = Join-Path $PSScriptRoot "server.js"
$script:RuntimeRoot = Join-Path $PSScriptRoot ".runtime"
$script:StdoutLog = Join-Path $script:RuntimeRoot "server.out.log"
$script:StderrLog = Join-Path $script:RuntimeRoot "server.err.log"
$script:PanelEntries = New-Object System.Collections.Generic.List[string]
$script:LastHealthError = ""
$script:LastState = "unknown"
$script:ActionInProgress = $false
$script:LastLogText = ""

$stringsPath = Join-Path $PSScriptRoot "control-panel.strings.json"
$script:Strings = [IO.File]::ReadAllText($stringsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

function Get-Text {
  param([Parameter(Mandatory = $true)][string]$Name)
  $property = $script:Strings.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Name }
  return [string]$property.Value
}

function Get-Brush {
  param([Parameter(Mandatory = $true)][string]$Color)
  $converter = New-Object Windows.Media.BrushConverter
  return $converter.ConvertFromString($Color)
}

function Read-XamlWindow {
  $xamlPath = Join-Path $PSScriptRoot "control-panel.xaml"
  $xamlText = [IO.File]::ReadAllText($xamlPath, [Text.Encoding]::UTF8)
  $stringReader = New-Object IO.StringReader($xamlText)
  $xmlReader = [Xml.XmlReader]::Create($stringReader)
  try {
    return [Windows.Markup.XamlReader]::Load($xmlReader)
  } finally {
    $xmlReader.Dispose()
    $stringReader.Dispose()
  }
}

$window = Read-XamlWindow

function Find-Control {
  param([Parameter(Mandatory = $true)][string]$Name)
  $control = $window.FindName($Name)
  if ($null -eq $control) {
    throw ((Get-Text "missingControl") -f $Name)
  }
  return $control
}

$StatusBadge = Find-Control "StatusBadge"
$StatusDot = Find-Control "StatusDot"
$StatusText = Find-Control "StatusText"
$StatusDetailText = Find-Control "StatusDetailText"
$PortTextBox = Find-Control "PortTextBox"
$AddressText = Find-Control "AddressText"
$PidValue = Find-Control "PidValue"
$UptimeValue = Find-Control "UptimeValue"
$RequestValue = Find-Control "RequestValue"
$LastCheckValue = Find-Control "LastCheckValue"
$StartButton = Find-Control "StartButton"
$StopButton = Find-Control "StopButton"
$RestartButton = Find-Control "RestartButton"
$CheckButton = Find-Control "CheckButton"
$OpenHomeButton = Find-Control "OpenHomeButton"
$OpenEditorButton = Find-Control "OpenEditorButton"
$CopyUrlButton = Find-Control "CopyUrlButton"
$ClearLogButton = Find-Control "ClearLogButton"
$AutoCheckBox = Find-Control "AutoCheckBox"
$LogTextBox = Find-Control "LogTextBox"

$iconPath = Join-Path $script:ProjectRoot "assets\icon48.png"
if (Test-Path -LiteralPath $iconPath) {
  try {
    $icon = New-Object Windows.Media.Imaging.BitmapImage
    $icon.BeginInit()
    $icon.CacheOption = [Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    $icon.UriSource = New-Object System.Uri -ArgumentList $iconPath
    $icon.EndInit()
    $window.Icon = $icon
  } catch {
    # The panel remains usable when a local icon cannot be decoded.
  }
}

function Get-SelectedPort {
  $port = 0
  if (![int]::TryParse($PortTextBox.Text.Trim(), [ref]$port) -or $port -lt 1024 -or $port -gt 65535) {
    $port = 44303
    $PortTextBox.Text = [string]$port
  }
  return $port
}

function Get-ForumUrl {
  param([string]$Path = "/")
  $port = Get-SelectedPort
  return "http://127.0.0.1:$port$Path"
}

function Get-ObjectProperty {
  param(
    [Parameter(Mandatory = $true)]$InputObject,
    [Parameter(Mandatory = $true)][string]$Name,
    $DefaultValue = $null
  )
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) { return $DefaultValue }
  return $property.Value
}

function Get-LocalForumHealth {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutMilliseconds = 750
  )

  $response = $null
  $reader = $null
  try {
    $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/__test/health")
    $request.Method = "GET"
    $request.Proxy = $null
    $request.Timeout = $TimeoutMilliseconds
    $request.ReadWriteTimeout = $TimeoutMilliseconds
    $response = $request.GetResponse()
    $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
    $payload = $reader.ReadToEnd() | ConvertFrom-Json
    if ((Get-ObjectProperty $payload "ok" $false) -ne $true -or [int](Get-ObjectProperty $payload "port" 0) -ne $Port) {
      throw (Get-Text "healthMismatch")
    }
    $script:LastHealthError = ""
    return $payload
  } catch {
    $script:LastHealthError = $_.Exception.Message
    return $null
  } finally {
    if ($null -ne $reader) { $reader.Dispose() }
    if ($null -ne $response) { $response.Dispose() }
  }
}

function Format-Uptime {
  param([int]$Seconds)
  if ($Seconds -lt 60) { return ((Get-Text "uptimeSeconds") -f $Seconds) }
  $span = [TimeSpan]::FromSeconds($Seconds)
  if ($span.TotalHours -lt 1) { return ((Get-Text "uptimeMinutes") -f $span.Minutes, $span.Seconds) }
  if ($span.TotalDays -lt 1) { return ((Get-Text "uptimeHours") -f [Math]::Floor($span.TotalHours), $span.Minutes) }
  return ((Get-Text "uptimeDays") -f [Math]::Floor($span.TotalDays), $span.Hours)
}

function Write-PanelLog {
  param([Parameter(Mandatory = $true)][string]$Message)
  $script:PanelEntries.Add(("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message))
  while ($script:PanelEntries.Count -gt 80) {
    $script:PanelEntries.RemoveAt(0)
  }
  Refresh-LogView
}

function Get-LogTail {
  param([string]$Path, [int]$Lines = 35)
  if (!(Test-Path -LiteralPath $Path)) { return @() }
  try {
    return @(Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop)
  } catch {
    return @((Get-Text "logReadFailed") -f $_.Exception.Message)
  }
}

function Refresh-LogView {
  $sections = New-Object System.Collections.Generic.List[string]
  if ($script:PanelEntries.Count -gt 0) {
    $sections.Add((Get-Text "panelSection"))
    foreach ($line in $script:PanelEntries) { $sections.Add($line) }
  }

  $stdout = @(Get-LogTail -Path $script:StdoutLog)
  if ($stdout.Count -gt 0) {
    if ($sections.Count -gt 0) { $sections.Add("") }
    $sections.Add((Get-Text "serverOutputSection"))
    foreach ($line in $stdout) { $sections.Add([string]$line) }
  }

  $stderr = @(Get-LogTail -Path $script:StderrLog)
  if ($stderr.Count -gt 0) {
    if ($sections.Count -gt 0) { $sections.Add("") }
    $sections.Add((Get-Text "errorOutputSection"))
    foreach ($line in $stderr) { $sections.Add([string]$line) }
  }

  $nextText = $sections -join [Environment]::NewLine
  if ($nextText -ne $script:LastLogText) {
    $script:LastLogText = $nextText
    $LogTextBox.Text = $nextText
    $LogTextBox.ScrollToEnd()
  }
}

function Set-StatusVisual {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("checking", "running", "stopped")][string]$State,
    [Parameter(Mandatory = $true)][string]$Detail
  )

  switch ($State) {
    "running" {
      $StatusBadge.Background = Get-Brush "#F0FBF5"
      $StatusBadge.BorderBrush = Get-Brush "#A7DEC0"
      $StatusDot.Fill = Get-Brush "#238A57"
      $StatusText.Foreground = Get-Brush "#17663F"
      $StatusText.Text = Get-Text "statusRunning"
    }
    "checking" {
      $StatusBadge.Background = Get-Brush "#FFF9E8"
      $StatusBadge.BorderBrush = Get-Brush "#E8CE7B"
      $StatusDot.Fill = Get-Brush "#C28B11"
      $StatusText.Foreground = Get-Brush "#7C5B0E"
      $StatusText.Text = Get-Text "statusChecking"
    }
    default {
      $StatusBadge.Background = Get-Brush "#FFF4F4"
      $StatusBadge.BorderBrush = Get-Brush "#F2B8B8"
      $StatusDot.Fill = Get-Brush "#C53030"
      $StatusText.Foreground = Get-Brush "#8D2525"
      $StatusText.Text = Get-Text "statusStopped"
    }
  }
  $StatusDetailText.Text = $Detail
}

function Set-ButtonState {
  param([bool]$Running)
  $StartButton.IsEnabled = !$Running -and !$script:ActionInProgress
  $StopButton.IsEnabled = $Running -and !$script:ActionInProgress
  $RestartButton.IsEnabled = $Running -and !$script:ActionInProgress
  $CheckButton.IsEnabled = !$script:ActionInProgress
  $OpenHomeButton.IsEnabled = $Running
  $OpenEditorButton.IsEnabled = $Running
  $PortTextBox.IsEnabled = !$Running -and !$script:ActionInProgress
}

function Update-Dashboard {
  param([switch]$Manual)
  if ($script:ActionInProgress -and !$Manual) { return }

  $port = Get-SelectedPort
  $AddressText.Text = Get-ForumUrl
  if ($Manual) {
    Set-StatusVisual -State "checking" -Detail (Get-Text "detailChecking")
    $window.Dispatcher.Invoke([System.Action] {}, [Windows.Threading.DispatcherPriority]::Background)
  }

  $health = Get-LocalForumHealth -Port $port
  $LastCheckValue.Text = (Get-Date).ToString("HH:mm:ss")

  if ($null -ne $health) {
    $healthPid = Get-ObjectProperty $health "pid"
    $healthUptime = Get-ObjectProperty $health "uptimeSeconds"
    $healthActivity = Get-ObjectProperty $health "activityRequests"
    $healthRequests = Get-ObjectProperty $health "requests" 0
    $PidValue.Text = if ($null -ne $healthPid) { [string]$healthPid } else { Get-Text "legacyInterface" }
    $UptimeValue.Text = if ($null -ne $healthUptime) { Format-Uptime ([int]$healthUptime) } else { "--" }
    $RequestValue.Text = if ($null -ne $healthActivity) { [string]$healthActivity } else { [string]$healthRequests }
    Set-StatusVisual -State "running" -Detail (Get-Text "detailRunning")
    Set-ButtonState -Running $true
    if ($script:LastState -ne "running" -or $Manual) {
      Write-PanelLog ((Get-Text "healthOkay") -f $port)
    }
    $script:LastState = "running"
  } else {
    $PidValue.Text = "--"
    $UptimeValue.Text = "--"
    $RequestValue.Text = "--"
    Set-StatusVisual -State "stopped" -Detail (Get-Text "detailStopped")
    Set-ButtonState -Running $false
    if ($script:LastState -eq "running" -or $Manual) {
      Write-PanelLog ((Get-Text "healthMissing") -f $port)
    }
    $script:LastState = "stopped"
  }
  Refresh-LogView
}

function Wait-ForHealth {
  param([int]$Port, [bool]$ExpectedRunning, [int]$TimeoutMilliseconds = 5500)
  $watch = [Diagnostics.Stopwatch]::StartNew()
  while ($watch.ElapsedMilliseconds -lt $TimeoutMilliseconds) {
    $health = Get-LocalForumHealth -Port $Port -TimeoutMilliseconds 400
    if (($ExpectedRunning -and $null -ne $health) -or (!$ExpectedRunning -and $null -eq $health)) {
      return $health
    }
    [Threading.Thread]::Sleep(130)
  }
  return $null
}

function Start-LocalForum {
  $port = Get-SelectedPort
  if ($null -ne (Get-LocalForumHealth -Port $port)) {
    Write-PanelLog ((Get-Text "alreadyRunning") -f $port)
    return
  }

  Set-StatusVisual -State "checking" -Detail (Get-Text "detailStarting")
  New-Item -ItemType Directory -Path $script:RuntimeRoot -Force | Out-Null
  $nodeCommand = Get-Command node -ErrorAction Stop
  $nodePath = $nodeCommand.Source
  if ([string]::IsNullOrWhiteSpace($nodePath)) { $nodePath = $nodeCommand.Path }
  if ([string]::IsNullOrWhiteSpace($nodePath)) { throw (Get-Text "nodeMissing") }

  $oldPort = $env:CC98_LOCAL_PORT
  $oldHost = $env:CC98_LOCAL_HOST
  $oldOutputLog = $env:CC98_LOCAL_OUTPUT_LOG
  $oldErrorLog = $env:CC98_LOCAL_ERROR_LOG
  try {
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($script:StdoutLog, "", $utf8NoBom)
    [IO.File]::WriteAllText($script:StderrLog, "", $utf8NoBom)
    $env:CC98_LOCAL_PORT = [string]$port
    $env:CC98_LOCAL_HOST = "127.0.0.1"
    $env:CC98_LOCAL_OUTPUT_LOG = $script:StdoutLog
    $env:CC98_LOCAL_ERROR_LOG = $script:StderrLog
    $process = Start-Process `
      -FilePath $nodePath `
      -ArgumentList ('"{0}"' -f $script:ServerPath) `
      -WorkingDirectory $script:ProjectRoot `
      -WindowStyle Hidden `
      -PassThru
  } finally {
    $env:CC98_LOCAL_PORT = $oldPort
    $env:CC98_LOCAL_HOST = $oldHost
    $env:CC98_LOCAL_OUTPUT_LOG = $oldOutputLog
    $env:CC98_LOCAL_ERROR_LOG = $oldErrorLog
  }

  Write-PanelLog ((Get-Text "processCreated") -f $process.Id)
  $health = Wait-ForHealth -Port $port -ExpectedRunning $true
  if ($null -eq $health) { throw (Get-Text "startTimedOut") }
  Write-PanelLog (Get-Text "startComplete")
}

function Stop-LocalForum {
  $port = Get-SelectedPort
  $health = Get-LocalForumHealth -Port $port
  if ($null -eq $health) {
    Write-PanelLog (Get-Text "nothingToStop")
    return
  }

  $healthPid = Get-ObjectProperty $health "pid"
  if ($null -eq $healthPid -or [int]$healthPid -le 0) { throw (Get-Text "missingPid") }

  $serverPid = [int]$healthPid
  $process = Get-Process -Id $serverPid -ErrorAction Stop
  if ($process.ProcessName -ne "node") { throw ((Get-Text "wrongProcess") -f $serverPid) }
  $processPath = $null
  try { $processPath = $process.Path } catch { $processPath = $null }
  if ($processPath -and [IO.Path]::GetFileName($processPath) -ne "node.exe") {
    throw ((Get-Text "wrongExecutable") -f $serverPid)
  }

  Set-StatusVisual -State "checking" -Detail (Get-Text "detailStopping")
  Stop-Process -Id $serverPid -Force -ErrorAction Stop
  [void](Wait-ForHealth -Port $port -ExpectedRunning $false -TimeoutMilliseconds 3500)
  Write-PanelLog ((Get-Text "stoppedProcess") -f $serverPid)
}

function Invoke-PanelAction {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Action,
    [Parameter(Mandatory = $true)][string]$FailurePrefix
  )
  if ($script:ActionInProgress) { return }
  $script:ActionInProgress = $true
  Set-ButtonState -Running ($script:LastState -eq "running")
  try {
    & $Action
  } catch {
    $message = (Get-Text "actionFailed") -f $FailurePrefix, $_.Exception.Message
    Write-PanelLog $message
    [Windows.MessageBox]::Show(
      $_.Exception.Message,
      (Get-Text "windowTitle"),
      [Windows.MessageBoxButton]::OK,
      [Windows.MessageBoxImage]::Warning
    ) | Out-Null
  } finally {
    $script:ActionInProgress = $false
    Update-Dashboard -Manual
  }
}

function Save-PanelSnapshot {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    $Path = Join-Path $script:RuntimeRoot "control-panel-preview.png"
  } elseif (![IO.Path]::IsPathRooted($Path)) {
    $Path = Join-Path $script:ProjectRoot $Path
  }

  $targetDirectory = Split-Path -Parent $Path
  if (![string]::IsNullOrWhiteSpace($targetDirectory)) {
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
  }

  $surface = $window.Content
  $renderWidth = 812
  $renderHeight = 652
  $renderSize = New-Object Windows.Size -ArgumentList $renderWidth, $renderHeight
  $renderRect = New-Object Windows.Rect -ArgumentList 0, 0, $renderWidth, $renderHeight
  $surface.Measure($renderSize)
  $surface.Arrange($renderRect)
  $surface.UpdateLayout()

  $bitmap = New-Object Windows.Media.Imaging.RenderTargetBitmap `
    -ArgumentList $renderWidth, $renderHeight, 96, 96, ([Windows.Media.PixelFormats]::Pbgra32)
  $bitmap.Render($surface)
  $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $encoder.Save($stream)
  } finally {
    $stream.Dispose()
  }
  return [IO.Path]::GetFullPath($Path)
}

if ($Mode -ne "Panel") {
  try {
    $port = Get-SelectedPort
    switch ($Mode) {
      "Status" {
        $health = Get-LocalForumHealth -Port $port
        if ($null -eq $health) { throw $script:LastHealthError }
        $health | ConvertTo-Json -Compress
      }
      "Start" {
        Start-LocalForum
        (Get-LocalForumHealth -Port $port) | ConvertTo-Json -Compress
      }
      "Stop" {
        Stop-LocalForum
        @{ ok = $true; running = $false; port = $port } | ConvertTo-Json -Compress
      }
      "Restart" {
        Stop-LocalForum
        Start-LocalForum
        (Get-LocalForumHealth -Port $port) | ConvertTo-Json -Compress
      }
      "Snapshot" {
        Update-Dashboard -Manual
        Save-PanelSnapshot -Path $SnapshotPath
      }
    }
    return
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
  }
}

$PortTextBox.Add_PreviewTextInput({
  param($sender, $eventArgs)
  $eventArgs.Handled = $eventArgs.Text -notmatch "^[0-9]+$"
})
$PortTextBox.Add_LostKeyboardFocus({ Update-Dashboard -Manual })
$StartButton.Add_Click({ Invoke-PanelAction -FailurePrefix (Get-Text "startFailed") -Action { Start-LocalForum } })
$StopButton.Add_Click({ Invoke-PanelAction -FailurePrefix (Get-Text "stopFailed") -Action { Stop-LocalForum } })
$RestartButton.Add_Click({
  Invoke-PanelAction -FailurePrefix (Get-Text "restartFailed") -Action {
    Stop-LocalForum
    Start-LocalForum
  }
})
$CheckButton.Add_Click({ Update-Dashboard -Manual })
$OpenHomeButton.Add_Click({ Start-Process (Get-ForumUrl) })
$OpenEditorButton.Add_Click({ Start-Process (Get-ForumUrl "/editor/postTopic/81") })
$CopyUrlButton.Add_Click({
  [Windows.Clipboard]::SetText((Get-ForumUrl))
  Write-PanelLog (Get-Text "urlCopied")
})
$ClearLogButton.Add_Click({
  $script:PanelEntries.Clear()
  $script:LastLogText = ""
  Refresh-LogView
})

$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(2)
$timer.Add_Tick({
  if ($AutoCheckBox.IsChecked -eq $true) {
    Update-Dashboard
  } else {
    Refresh-LogView
  }
})

$window.Add_ContentRendered({
  Write-PanelLog (Get-Text "panelReady")
  Update-Dashboard -Manual
  $timer.Start()
})
$window.Add_SourceInitialized({
  $windowHandle = (New-Object Windows.Interop.WindowInteropHelper($window)).Handle
  if ($windowHandle -ne [IntPtr]::Zero) {
    [void][CC98LocalConsoleWindow]::ShowWindow($windowHandle, 5)
  }
  [void]$window.Activate()
})
$window.Add_Closed({ $timer.Stop() })

[void]$window.ShowDialog()
