param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$startJob = $null
try {
  $startJob = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $startScript = Join-Path $PSScriptRoot 'apply.ps1'
  $startDirectory = [IO.Path]::GetDirectoryName($startJob.result)
  $startArguments = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"' + $startScript + '"'),'-ConfigPath',('"' + $ConfigPath + '"'))
  Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $startArguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $startDirectory 'helper.log') -RedirectStandardError (Join-Path $startDirectory 'helper-error.log') | Out-Null
} catch {
  if ($null -ne $startJob) { @{ok=$false; message=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $startJob.result -Encoding UTF8 }
  exit 1
}
