param([string]$Destination = (Join-Path $env:LOCALAPPDATA 'STM-Simulator-Tools'))
$ErrorActionPreference = 'Stop'
$Destination = [System.IO.Path]::GetFullPath($Destination)
if ($Destination -match '[^\x00-\x7F]') { throw 'Choose an ASCII path, for example -Destination C:\STM-Tools.' }
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
function Install-ZipTool($Name, $Url, $Sha256, $Executable) {
    if (Test-Path -LiteralPath (Join-Path $Destination $Executable)) { Write-Output "Already installed: $Executable"; return }
    $Archive = Join-Path $Destination $Name
    Invoke-WebRequest -Uri $Url -OutFile $Archive
    if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) { throw "Checksum mismatch: $Name" }
    Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
    if (-not (Test-Path -LiteralPath (Join-Path $Destination $Executable))) { throw "Missing executable after extraction: $Executable" }
}
Install-ZipTool 'arm-gcc-15.2.1-1.1.zip' 'https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v15.2.1-1.1/xpack-arm-none-eabi-gcc-15.2.1-1.1-win32-x64.zip' 'bae6a3d1667697ce750c3b13d6d26d80973ecedc2cc87bf04869e83447fd93ea' 'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe'
Install-ZipTool 'clangd-23.1.0.zip' 'https://github.com/clangd/clangd/releases/download/23.1.0/clangd-windows-23.1.0.zip' '23412a240756a162e7b98a282f36aa2a23a88db5ce16a0cbc4fef7253768c810' 'clangd_23.1.0/bin/clangd.exe'
Install-ZipTool 'openocd-0.12.0-7.zip' 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-7/xpack-openocd-0.12.0-7-win32-x64.zip' '6bfd3c97135aafef8affc9af1acf34fd0e2b9ca26044506f6abd7f95b7630052' 'xpack-openocd-0.12.0-7/bin/openocd.exe'
$Cube = Join-Path $Destination 'STM32CubeF4'
if (-not (Test-Path -LiteralPath $Cube)) {
    git clone --depth 1 --branch v1.28.3 --filter=blob:none --sparse https://github.com/STMicroelectronics/STM32CubeF4.git $Cube
    if ($LASTEXITCODE -ne 0) { throw 'STM32CubeF4 checkout failed.' }
    git -C $Cube sparse-checkout set Drivers/CMSIS/Include
    if ($LASTEXITCODE -ne 0) { throw 'CMSIS checkout failed.' }
}
$Revision = git -C $Cube rev-parse HEAD
if ($Revision -ne '94cae6e83f00e276a11957e7833c01ac3d0bd7af') { throw 'Existing SDK revision differs. Use another destination to preserve it.' }
git -C $Cube submodule update --init --depth 1 Drivers/CMSIS/Device/ST/STM32F4xx Drivers/STM32F4xx_HAL_Driver
if ($LASTEXITCODE -ne 0) { throw 'ST HAL/CMSIS device checkout failed.' }
Write-Output "Ready: $Destination"
Write-Output 'Open Development tools in STM Simulator, then Auto-detect and Save. For another destination select the installed executables and SDK folder.'
