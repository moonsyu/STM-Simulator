param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$updateJob = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$updateStaged = $null
$updateBackup = $null
$updateReplaced = $false
function Get-UpdateHash([string]$FilePath) {
  $updateHasher = [Security.Cryptography.SHA256]::Create()
  $updateStream = [IO.File]::OpenRead($FilePath)
  try { return [BitConverter]::ToString($updateHasher.ComputeHash($updateStream)).Replace('-', '').ToLowerInvariant() }
  finally { $updateStream.Dispose(); $updateHasher.Dispose() }
}
try {
  $updateTarget = [IO.Path]::GetFullPath($updateJob.target)
  $updateSource = [IO.Path]::GetFullPath($updateJob.source)
  if ([IO.Path]::GetExtension($updateTarget) -ine '.exe' -or $updateTarget -eq $updateSource) { throw 'Invalid executable path' }
  foreach ($updatePath in @($updateTarget, $updateSource, [IO.Path]::GetDirectoryName($updateTarget))) {
    if (((Get-Item -LiteralPath $updatePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked paths are not supported' }
  }
  if ((Get-Item -LiteralPath $updateSource).Length -ne $updateJob.bytes -or (Get-UpdateHash $updateSource) -ine $updateJob.sha256) { throw 'Downloaded executable verification failed' }
  $updateStaged = $updateTarget + '.' + $updateJob.token + '.new'
  $updateBackup = $updateTarget + '.' + $updateJob.token + '.bak'
  [IO.File]::Copy($updateSource, $updateStaged, $false)
  if ((Get-UpdateHash $updateStaged) -ine $updateJob.sha256) { throw 'Staged executable verification failed' }
  [IO.File]::WriteAllText($updateJob.ready, 'ready')
  $updateDeadline = [DateTime]::UtcNow.AddSeconds(90)
  while (Get-Process -Id $updateJob.pid -ErrorAction SilentlyContinue) {
    if (Test-Path -LiteralPath $updateJob.cancel) { throw 'Update cancelled before the app exited' }
    if ([DateTime]::UtcNow -gt $updateDeadline) { throw 'Application did not exit in time' }
    Start-Sleep -Milliseconds 300
  }
  # The NSIS portable launcher can still hold the original EXE after its child exits.
  while (-not $updateReplaced) {
    if (Test-Path -LiteralPath $updateJob.cancel) { throw 'Update cancelled before replacement' }
    try { [IO.File]::Replace($updateStaged, $updateTarget, $updateBackup, $true); $updateReplaced = $true }
    catch { if ([DateTime]::UtcNow -gt $updateDeadline) { throw }; Start-Sleep -Milliseconds 300 }
  }
  # Do not pass the old launcher's extraction environment to the new launcher.
  foreach ($updateEnv in @('PORTABLE_EXECUTABLE_FILE','PORTABLE_EXECUTABLE_DIR','PORTABLE_EXECUTABLE_APP_FILENAME','ELECTRON_RUN_AS_NODE')) { [Environment]::SetEnvironmentVariable($updateEnv, $null, 'Process') }
  Start-Process -FilePath $updateTarget -WorkingDirectory ([IO.Path]::GetDirectoryName($updateTarget)) -WindowStyle Hidden -ErrorAction Stop | Out-Null
  @{ok=$true} | ConvertTo-Json | Set-Content -LiteralPath $updateJob.result -Encoding UTF8
  Remove-Item -LiteralPath $updateBackup -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $updateSource -Force -ErrorAction SilentlyContinue
} catch {
  $updateFailure = $_.Exception.Message
  if ($updateReplaced -and (Test-Path -LiteralPath $updateBackup)) {
    try { [IO.File]::Copy($updateBackup, $updateTarget, $true); Remove-Item -LiteralPath $updateBackup -Force } catch {}
  }
  @{ok=$false; message=$updateFailure} | ConvertTo-Json | Set-Content -LiteralPath $updateJob.result -Encoding UTF8
} finally {
  if ($updateStaged -and (Test-Path -LiteralPath $updateStaged)) { Remove-Item -LiteralPath $updateStaged -Force -ErrorAction SilentlyContinue }
  # Only this job's known files are removed; no recursive directory deletion.
  Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $updateJob.ready -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $updateJob.cancel -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath ([IO.Path]::GetDirectoryName($ConfigPath)) -ErrorAction SilentlyContinue
}
