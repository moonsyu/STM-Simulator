param([Parameter(Mandatory=$true)][string]$Tag, [string]$ExpectedCommit = '', [switch]$RequireLatest)
$ErrorActionPreference = 'Stop'
if ($Tag -notmatch '^v\d+\.\d+\.\d+$') { throw 'Invalid stable release tag' }
if (-not $env:GH_REPO) { throw 'GH_REPO is required' }
function Read-GitHub([string]$ApiPath) {
    $result = gh api $ApiPath
    if ($LASTEXITCODE -ne 0) { throw "GitHub verification failed: $ApiPath" }
    return $result | ConvertFrom-Json
}
$release = Read-GitHub "repos/$env:GH_REPO/releases/tags/$Tag"
if ($release.draft -or $release.prerelease) { throw 'Release must be public and stable' }
$version = $Tag.Substring(1)
$exe = 'STM-Simulator.exe'
$zipName = "STM-Simulator-$version-Windows-x64.zip"
$required = @($exe, $zipName, 'SHA256.txt', 'BUILD-INFO.json', 'update-manifest.json')
if (@(Compare-Object $required @($release.assets.name)).Count) { throw 'Release asset set differs' }
$directory = Join-Path $PWD "work/release-verification/$Tag"
New-Item -ItemType Directory -Force $directory | Out-Null
foreach ($asset in $release.assets) {
    # Public download route, without credentials, must work for every asset.
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile (Join-Path $directory $asset.name)
    if ((Get-Item -LiteralPath (Join-Path $directory $asset.name)).Length -ne $asset.size) { throw "Asset size differs: $($asset.name)" }
}
$info = Get-Content (Join-Path $directory 'BUILD-INFO.json') -Raw | ConvertFrom-Json
$manifest = Get-Content (Join-Path $directory 'update-manifest.json') -Raw | ConvertFrom-Json
$commit = (Read-GitHub "repos/$env:GH_REPO/commits/$Tag").sha
if ($info.commit -cne $commit -or ($ExpectedCommit -and $ExpectedCommit -cne $commit)) { throw 'Build and release tag commits differ' }
if ($info.sourceDirty -cne $false) { throw 'Release must identify committed build inputs' }
if ($info.workflow -notmatch ('^https://github.com/' + [regex]::Escape($env:GH_REPO) + '/actions/runs/(\d+)$')) { throw 'Missing CI build provenance' }
$runId = $Matches[1]
$run = Read-GitHub "repos/$env:GH_REPO/actions/runs/$runId"
$jobs = Read-GitHub "repos/$env:GH_REPO/actions/runs/$runId/jobs"
if ($run.head_sha -cne $commit -or -not @($jobs.jobs | Where-Object { $_.name -eq 'Windows x64 portable' -and $_.conclusion -eq 'success' }).Count) { throw 'Build provenance does not identify a successful Windows build' }
$hash = (Get-FileHash -LiteralPath (Join-Path $directory $exe) -Algorithm SHA256).Hash.ToLowerInvariant()
$zipHash = (Get-FileHash -LiteralPath (Join-Path $directory $zipName) -Algorithm SHA256).Hash.ToLowerInvariant()
foreach ($meta in @($info, $manifest)) {
    if ($meta.version -cne $version -or $meta.filename -cne $exe -or $meta.sha256 -cne $hash -or $meta.bytes -ne (Get-Item -LiteralPath (Join-Path $directory $exe)).Length) { throw 'Public EXE metadata mismatch' }
}
$sums = Get-Content (Join-Path $directory 'SHA256.txt')
if ($sums -cnotcontains "$hash  $exe" -or $sums -cnotcontains "$zipHash  $zipName") { throw 'Public checksums mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $directory $zipName))
try {
    foreach ($name in @($exe,'BUILD-INFO.json','update-manifest.json','SHA256.txt','README.md','THIRD_PARTY_NOTICES.md','DOMPURIFY-LICENSE.txt','docs/HAL-API.md')) {
        if (-not $zip.GetEntry($name)) { throw "Portable ZIP missing $name" }
    }
    if (@($zip.Entries | Where-Object { $_.FullName -match '\.(exe|dll)$' -and $_.FullName -cne $exe }).Count) { throw 'ZIP must contain the portable EXE, not win-unpacked' }
    $stream = $zip.GetEntry($exe).Open()
    $digest = [System.Security.Cryptography.SHA256]::Create()
    try { $insideHash = [Convert]::ToHexString($digest.ComputeHash($stream)).ToLowerInvariant() } finally { $stream.Dispose(); $digest.Dispose() }
    if ($insideHash -cne $hash) { throw 'ZIP contains another executable' }
    foreach ($name in @('BUILD-INFO.json','update-manifest.json')) {
        $reader = [System.IO.StreamReader]::new($zip.GetEntry($name).Open())
        try { $inside = $reader.ReadToEnd() } finally { $reader.Dispose() }
        if ($inside -cne (Get-Content (Join-Path $directory $name) -Raw)) { throw "ZIP metadata differs: $name" }
    }
} finally { $zip.Dispose() }
if ($RequireLatest -and (Read-GitHub "repos/$env:GH_REPO/releases/latest").tag_name -cne $Tag) { throw 'Latest release selection differs' }
@{version=$version; commit=$commit; workflow=$info.workflow; sha256=$hash; zipSha256=$zipHash; passed=$true} | ConvertTo-Json | Set-Content (Join-Path $directory 'verification.json') -Encoding utf8NoBOM
Write-Host "Verified public $Tag assets, portable ZIP, hashes and CI provenance."
