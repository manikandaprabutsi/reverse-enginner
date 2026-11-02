# Install the reverse-engineering toolchain for this workspace.
#
#   .\scripts\install.ps1
#
# Everything lands under $env:REA_HOME (default E:\REA) except the Python
# virtualenv, which lives in the repo at .venv\. No admin rights required,
# nothing is written to Program Files or to the registry.
#
# Safe to re-run: completed steps are skipped.

[CmdletBinding()]
param(
    [string] $ReaRoot = $(if ($env:REA_HOME) { $env:REA_HOME } else { 'E:\REA' }),
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$RepoRoot  = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ToolsDir  = Join-Path $ReaRoot 'tools'
$DlDir     = Join-Path $ReaRoot 'downloads'
$VenvDir   = Join-Path $RepoRoot '.venv'

$JDK_DIR     = Join-Path $ToolsDir 'jdk21'
$GHIDRA_DIR  = Join-Path $ToolsDir 'ghidra_12.1.4_PUBLIC'

$JDK_URL     = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse'
$GHIDRA_URL  = 'https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip'
$MCP_URL     = 'https://github.com/LaurieWired/GhidraMCP/releases/download/2.0/GhidraMCP-release-2-0.zip'

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor DarkGray }

function Get-Artifact {
    param([string] $Url, [string] $Path)

    if ((Test-Path $Path) -and -not $Force) {
        Write-Ok "cached $(Split-Path $Path -Leaf)"
        return
    }
    Write-Ok "downloading $(Split-Path $Path -Leaf)"
    Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing
    Write-Ok ("{0:N0} MB" -f ((Get-Item $Path).Length / 1MB))
}

function Expand-Zip {
    param([string] $Zip, [string] $Destination)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $Destination) { Remove-Item -Recurse -Force $Destination }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Destination)
}

function Remove-IfPresent($Path) {
    if (Test-Path $Path) { Remove-Item -Recurse -Force $Path }
}

New-Item -ItemType Directory -Force -Path $ToolsDir, $DlDir | Out-Null

# --- 1. uv ---------------------------------------------------------------
Write-Step 'uv (Python toolchain)'
$uv = Join-Path $env:USERPROFILE '.local\bin\uv.exe'
if (-not (Test-Path $uv)) {
    $installer = Join-Path $env:TEMP 'uv-install.ps1'
    Invoke-WebRequest -Uri 'https://astral.sh/uv/install.ps1' -OutFile $installer -UseBasicParsing
    & $installer
}
if (-not (Test-Path $uv)) { throw "uv install failed; expected $uv" }
Write-Ok (& $uv --version)

# --- 2. JDK 21 -----------------------------------------------------------
Write-Step 'Temurin JDK 21'
$jdkZip = Join-Path $DlDir 'jdk21.zip'
Get-Artifact -Url $JDK_URL -Path $jdkZip
if ((Test-Path (Join-Path $JDK_DIR 'bin\java.exe')) -and -not $Force) {
    Write-Ok 'already extracted'
} else {
    $stage = Join-Path $DlDir '_jdk_stage'
    Expand-Zip -Zip $jdkZip -Destination $stage
    $inner = Get-ChildItem $stage -Directory | Select-Object -First 1
    Remove-IfPresent $JDK_DIR
    Move-Item $inner.FullName $JDK_DIR
    Remove-IfPresent $stage
    Write-Ok 'extracted'
}

# --- 3. Ghidra -----------------------------------------------------------
Write-Step 'Ghidra 12.1.4'
$ghidraZip = Join-Path $DlDir 'ghidra.zip'
Get-Artifact -Url $GHIDRA_URL -Path $ghidraZip
if ((Test-Path (Join-Path $GHIDRA_DIR 'ghidraRun.bat')) -and -not $Force) {
    Write-Ok 'already extracted'
} else {
    $stage = Join-Path $DlDir '_ghidra_stage'
    Expand-Zip -Zip $ghidraZip -Destination $stage
    $inner = Get-ChildItem $stage -Directory | Select-Object -First 1
    Remove-IfPresent $GHIDRA_DIR
    Move-Item $inner.FullName $GHIDRA_DIR
    Remove-IfPresent $stage
    Write-Ok 'extracted'
}

# --- 4. GhidraMCP extension ---------------------------------------------
Write-Step 'GhidraMCP plugin'
$mcpZip = Join-Path $DlDir 'ghidramcp.zip'
Get-Artifact -Url $MCP_URL -Path $mcpZip

$mcpStage = Join-Path $DlDir '_mcp_stage'
Expand-Zip -Zip $mcpZip -Destination $mcpStage
$extZip  = Get-ChildItem $mcpStage -Recurse -Filter '*_GhidraMCP.zip' | Select-Object -First 1
$whl     = Get-ChildItem $mcpStage -Recurse -Filter 'ghidra_mcp-*.whl' | Select-Object -First 1
if (-not $extZip) { throw 'GhidraMCP extension zip not found in release' }
if (-not $whl)    { throw 'ghidra_mcp wheel not found in release' }

$extDest = Join-Path $GHIDRA_DIR 'Ghidra\Extensions\GhidraMCP'
Remove-IfPresent $extDest
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($extZip.FullName, (Split-Path $extDest -Parent))
Write-Ok "installed to $extDest"

# --- 5. Python env -------------------------------------------------------
Write-Step 'Python env + MCP server (.venv)'
if (-not (Test-Path (Join-Path $VenvDir 'Scripts\python.exe'))) {
    & $uv venv --python 3.12 $VenvDir
    if ($LASTEXITCODE -ne 0) { throw 'uv venv failed' }
    Write-Ok 'created .venv (Python 3.12)'
} else {
    Write-Ok '.venv already present'
}

$py = Join-Path $VenvDir 'Scripts\python.exe'
& $uv pip install --python $py $whl.FullName 'pyghidra>=3.1'
if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }
Write-Ok 'ghidra-mcp + pyghidra installed'

# --- 6. Stop the GUI from getting a stale extension ----------------------
Write-Step 'Cleanup'
Remove-IfPresent $mcpStage
Write-Ok 'staging removed'

# --- 7. Project-level MCP config ----------------------------------------
Write-Step 'opencode.json'
$config = [ordered]@{
    '$schema' = 'https://opencode.ai/config.json'
    mcp = [ordered]@{
        ghidra = [ordered]@{
            type        = 'local'
            command     = @((Join-Path $VenvDir 'Scripts\ghidra-mcp.exe'))
            environment = [ordered]@{
                JAVA_HOME           = $JDK_DIR
                GHIDRA_INSTALL_DIR  = $GHIDRA_DIR
            }
            enabled = $true
            timeout = 120000
        }
    }
}
$configPath = Join-Path $RepoRoot 'opencode.json'
$config | ConvertTo-Json -Depth 8 | Set-Content -Path $configPath -Encoding UTF8
Write-Ok "wrote $configPath"

# --- 8. Summary ----------------------------------------------------------
Write-Host ''
Write-Host 'Toolchain ready.' -ForegroundColor Green
Write-Host "  JDK      $JDK_DIR"
Write-Host "  Ghidra   $GHIDRA_DIR"
Write-Host "  MCP      $(Join-Path $VenvDir 'Scripts\ghidra-mcp.exe')"
Write-Host ''
Write-Host 'Next:'
Write-Host '  1. .\scripts\start-ghidra.ps1   (GUI, first run: enable GhidraMCPPlugin)'
Write-Host '  2. restart OpenCode so it picks up opencode.json'
Write-Host ''
