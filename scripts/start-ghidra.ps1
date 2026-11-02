# Launch the Ghidra GUI with the project toolchain wired up.
#
#   .\scripts\start-ghidra.ps1
#
# Extra arguments are forwarded to ghidraRun.bat.

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $GhidraArgs
)

. (Join-Path $PSScriptRoot 'env.ps1')

$ghidraRun = Join-Path $env:GHIDRA_INSTALL_DIR 'ghidraRun.bat'
if (-not (Test-Path $ghidraRun)) {
    throw "ghidraRun.bat not found at $ghidraRun. Run .\scripts\install.ps1 first."
}

Write-Host "JAVA_HOME  $env:JAVA_HOME"
Write-Host "GHIDRA     $env:GHIDRA_INSTALL_DIR"
Write-Host ""
Write-Host "First run only: File > Configure > Developer > tick 'GhidraMCPPlugin'."
Write-Host "The plugin listens on http://127.0.0.1:8080 once a program is open."
Write-Host ""

& $ghidraRun @GhidraArgs
