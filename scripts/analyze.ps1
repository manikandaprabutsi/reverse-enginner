# Headless triage: import a binary, run auto-analysis, dump the function map.
#
#   .\scripts\analyze.ps1 -Binary C:\path\to\target.exe
#   .\scripts\analyze.ps1 -Binary .\samples\app.exe -Export
#   .\scripts\analyze.ps1 -Binary .\samples\app.exe -NoAnalyze
#
# For interactive work use .\scripts\start-ghidra.ps1 instead - headless is for
# triage and for machines where you cannot run the GUI.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Binary,

    [string] $ProjectDir = ([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\labs\projects'))),
    [string] $ProjectName,
    [string] $ReportDir = ([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\labs\notes'))),

    [switch] $NoAnalyze,
    [switch] $Export,
    [switch] $DeleteProject
)

. (Join-Path $PSScriptRoot 'env.ps1')

$headless = Join-Path $env:GHIDRA_INSTALL_DIR 'support\analyzeHeadless.bat'
if (-not (Test-Path $headless)) {
    throw "analyzeHeadless.bat not found. Run .\scripts\install.ps1 first."
}
if (-not (Test-Path $env:JAVA_HOME)) {
    throw "JDK not found at $env:JAVA_HOME. Run .\scripts\install.ps1 first."
}

$bin = Get-Item (Resolve-Path $Binary -ErrorAction Stop)
$base = [System.IO.Path]::GetFileNameWithoutExtension($bin.Name)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

if (-not $ProjectName) { $ProjectName = "$base-$stamp" }
New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null

$headlessArgs = @($ProjectDir, $ProjectName, '-import', $bin.FullName)

if ($NoAnalyze) { $headlessArgs += '-noanalysis' }

if ($Export) {
    New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
    $report = Join-Path $ReportDir "$base-symbols-$stamp.tsv"
    $scriptDir = Join-Path $PSScriptRoot 'ghidra'
    $headlessArgs += @('-scriptPath', $scriptDir, '-postScript', 'DumpSymbols.java', $report)
}

if ($DeleteProject) { $headlessArgs += '-deleteProject' }

Write-Host "binary    : $($bin.FullName)"
Write-Host "project   : $ProjectDir\$ProjectName"
Write-Host "java      : $env:JAVA_HOME"
if ($Export) { Write-Host "report    : $report" }
Write-Host ""

& $headless @headlessArgs
$code = $LASTEXITCODE

if ($Export -and (Test-Path $report)) {
    $count = (Get-Content $report | Where-Object { $_ -and -not $_.StartsWith('#') } | Measure-Object).Count
    Write-Host ""
    Write-Host "Functions mapped: $count"
}

exit $code
