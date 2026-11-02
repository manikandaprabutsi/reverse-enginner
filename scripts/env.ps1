# Dot-source this file to put the toolchain on the current session's PATH:
#
#   . .\scripts\env.ps1
#
# Override the install root with $env:REA_HOME before dot-sourcing.

$ReaRoot = if ($env:REA_HOME) { $env:REA_HOME } else { 'E:\REA' }

$env:JAVA_HOME        = Join-Path $ReaRoot 'tools\jdk21'
$env:GHIDRA_INSTALL_DIR = Join-Path $ReaRoot 'tools\ghidra_12.1.4_PUBLIC'

$paths = @(
    (Join-Path $env:JAVA_HOME 'bin'),
    (Join-Path $env:GHIDRA_INSTALL_DIR 'support'),
    (Join-Path $PSScriptRoot '..\.venv\Scripts')
)

foreach ($p in $paths) {
    $resolved = [System.IO.Path]::GetFullPath($p)
    if ((Test-Path $resolved) -and ($env:PATH -notlike "*$resolved*")) {
        $env:PATH = "$resolved;$env:PATH"
    }
}

if (-not (Test-Path $env:JAVA_HOME)) {
    Write-Warning "JDK not found at $env:JAVA_HOME - run .\scripts\install.ps1"
}
if (-not (Test-Path $env:GHIDRA_INSTALL_DIR)) {
    Write-Warning "Ghidra not found at $env:GHIDRA_INSTALL_DIR - run .\scripts\install.ps1"
}
