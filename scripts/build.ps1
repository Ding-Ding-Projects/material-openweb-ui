<#
  Material Open WebUI - build.

  Invoked by build.bat at the repository root. The logic lives here rather than
  in the batch file because cmd's parser mangles the escaping this needs: a
  caret inside a parenthesised block gets processed twice, and the resulting
  "Unbalanced parenthesis" silently reorders control flow rather than stopping.

  Takes a machine with nothing installed to a built, runnable program. It never
  installs a secret, a credential or a code-signing certificate, and it never
  changes the machine's persistent execution policy - build.bat passes
  -ExecutionPolicy Bypass for this process only.

    build.bat            interactive: builds, then asks whether to run
    build.bat /s         silent: no prompts, no pauses, non-zero on failure
#>

[CmdletBinding()]
param(
  [switch]$Silent
)

$ErrorActionPreference = 'Stop'
if ($env:SILENT -eq '1') { $Silent = $true }

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Pinned inside this project's supported range. Upstream's package.json declares
# node >=18.13.0 <=22.x.x with engine-strict=true, and a transitive dependency
# (eslint-visitor-keys) additionally wants ^22.13.0 - so the usable window is
# 22.13 to 22.x, and picking the newest 22 is the only thing that satisfies both.
$NodeVersion  = '22.23.2'
$Toolchain    = Join-Path $env:LOCALAPPDATA 'material-openweb-ui\toolchain'
$NodeDir      = Join-Path $Toolchain "node-v$NodeVersion-win-x64"

function Say([string]$m)  { Write-Host "      $m" }
function Phase([string]$m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "      $m" -ForegroundColor Green }

function Fail([string]$m) {
  Write-Host ''
  Write-Host "  FAILED: $m" -ForegroundColor Red
  Write-Host ''
  Write-Host '  Nothing was installed globally and nothing was left half-written;'
  Write-Host '  re-running is safe and reuses whatever succeeded.'
  Write-Host ''
  exit 1
}

function Elapsed([datetime]$start) {
  Say ("done in {0:n1}s" -f ((Get-Date) - $start).TotalSeconds)
}

# ---------------------------------------------------------------- banner

Write-Host ''
Write-Host '  Material Open WebUI - build'
Write-Host '  ---------------------------'
Write-Host ("  mode: " + $(if ($Silent) { 'silent' } else { 'interactive' }))
Write-Host "  root: $Root"
Write-Host ''

# ---------------------------------------------------------------- 1. Node

$t = Get-Date
Phase '[1/4] Node.js'

function Get-EngineRange {
  $pkg = Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
  $spec = $pkg.engines.node
  $min = if ($spec -match '>=\s*(\d+)') { [int]$Matches[1] } else { 0 }
  $max = if ($spec -match '<=\s*(\d+)') { [int]$Matches[1] } else { 99 }
  return @{ Spec = $spec; Min = $min; Max = $max }
}

function Test-NodeUsable([string]$exe) {
  if (-not $exe) { return $false }
  try { $v = & $exe --version 2>$null } catch { return $false }
  if (-not $v) { return $false }
  $major = [int]($v.TrimStart('v').Split('.')[0])
  $r = Get-EngineRange
  return ($major -ge $r.Min -and $major -le $r.Max)
}

$range = Get-EngineRange
$nodeExe = $null

# A toolchain Node from an earlier run wins: it is already known to fit.
if (Test-Path (Join-Path $NodeDir 'node.exe')) {
  $nodeExe = Join-Path $NodeDir 'node.exe'
  Say "using the toolchain Node at $NodeDir"
} else {
  $onPath = (Get-Command node -ErrorAction SilentlyContinue)
  if ($onPath -and (Test-NodeUsable $onPath.Source)) {
    $nodeExe = $onPath.Source
    Say ("found " + (& $nodeExe --version) + " on PATH, inside the supported range")
  } elseif ($onPath) {
    Say ("found " + (& $onPath.Source --version) + " on PATH, which this project does not support")
    Say ("package.json declares node " + $range.Spec + " and .npmrc sets engine-strict")
    Say 'installing a supported Node beside it rather than overriding the check'
  } else {
    Say 'not found on PATH'
  }
}

if (-not $nodeExe) {
  $zip = Join-Path $env:TEMP "node-v$NodeVersion-win-x64.zip"
  $url = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
  New-Item -ItemType Directory -Force $Toolchain | Out-Null
  Say "downloading Node v$NodeVersion (per-user, no administrator rights)"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
  } catch {
    Fail "could not download Node v$NodeVersion from $url . Check network access to nodejs.org and re-run."
  }
  Say "extracting into $Toolchain"
  Expand-Archive -Force -Path $zip -DestinationPath $Toolchain
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
    Fail "the archive extracted but $NodeDir\node.exe is not there; the archive layout may have changed."
  }
  $nodeExe = Join-Path $NodeDir 'node.exe'
  Ok ("toolchain Node " + (& $nodeExe --version) + " ready")
}

# Put the chosen Node first for THIS process. A package manager writes PATH for
# future shells only, so without this the very next command still cannot find
# what was just installed - which reads as "the install failed" when it succeeded.
$nodeHome = Split-Path -Parent $nodeExe
$env:PATH = "$nodeHome;$env:PATH"

if (-not (Test-NodeUsable $nodeExe)) {
  Fail ("the active Node (" + (& $nodeExe --version) + ") is outside the declared range " + $range.Spec + ".")
}
$npmCmd = Join-Path $nodeHome 'npm.cmd'
if (-not (Test-Path $npmCmd)) { $npmCmd = 'npm' }
Elapsed $t

# ---------------------------------------------------------------- 2. dependencies

$t = Get-Date
Phase '[2/4] Project dependencies'
if (Test-Path (Join-Path $Root 'node_modules\.package-lock.json')) {
  Say 'node_modules present - reusing it'
} else {
  Say 'installing (the slow phase on a cold checkout)'
  & $npmCmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Say 'npm ci failed - falling back to npm install'
    & $npmCmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      Fail 'npm could not install dependencies. The active Node is inside the declared range, so this is not an engine refusal on the project itself - read the npm log printed above for the package that objected.'
    }
  }
}
Elapsed $t

# ---------------------------------------------------------------- 3. gates

$t = Get-Date
Phase '[3/4] Gates'

& $nodeExe (Join-Path $Root 'scripts/test-parse.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'a shipped module is not valid JavaScript, which renders as a blank page because nothing transpiles it. Run: node scripts/test-parse.mjs'
}
Ok 'every shipped module parses'

& $nodeExe (Join-Path $Root 'scripts\check-inventory.mjs') --quiet
if ($LASTEXITCODE -ne 0) {
  Fail 'the completeness inventory does not match the tree. Run: node scripts/check-inventory.mjs'
}
Ok 'completeness inventory: consistent'

& $nodeExe (Join-Path $Root 'scripts\test-inventory-guard.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'the inventory guard negative regression did not behave. Run: node scripts/test-inventory-guard.mjs'
}
Ok 'inventory guard negative regression: every case turns it red'

& $nodeExe (Join-Path $Root 'scripts/test-totp.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'the authenticator disagrees with the RFC 6238 published test vectors. Run: node scripts/test-totp.mjs'
}
Ok 'RFC 6238 vectors: all 18 pass'

& $nodeExe (Join-Path $Root 'scripts/test-convert.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'file-type detection or a conversion adapter misbehaved. Run: node scripts/test-convert.mjs'
}
Ok 'converter: detection and every renderer-free conversion behave'

& $nodeExe (Join-Path $Root 'scripts/test-dom-safety.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'an append() call site can receive a conditional null, which renders the literal word "null". Run: node scripts/test-dom-safety.mjs'
}
Ok 'no append() call site can render a stray "null"'

& $nodeExe (Join-Path $Root 'scripts/test-school-mode.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'School mode is naming or leaving visible something it is supposed to omit. Run: node scripts/test-school-mode.mjs'
}
Ok 'School mode omits rather than disables'

& $nodeExe (Join-Path $Root 'scripts/test-locks.mjs') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'a lock or unlock-ladder safety rule no longer holds. Run: node scripts/test-locks.mjs'
}
Ok 'locks keep their own credentials and the ladder stays safe'
Elapsed $t

# ---------------------------------------------------------------- 4. build

$t = Get-Date
Phase '[4/4] Build'
Say 'documentation site: static, nothing to compile (docs/)'

if (Test-Path (Join-Path $Root 'electron\main.ts')) {
  & $npmCmd run electron:build
  if ($LASTEXITCODE -ne 0) { Fail 'the desktop build failed.' }
  Ok 'desktop application built'
} else {
  # The honest stopping point. Producing something CI would not recognise would
  # be worse than producing nothing.
  Say 'desktop application: not implemented yet - no installer is produced'
  Say '(INVENTORY.md marks it planned rather than shipped)'
}
Elapsed $t

# ---------------------------------------------------------------- summary

Write-Host ''
Write-Host '  Build complete.' -ForegroundColor Green
Write-Host ''
& $nodeExe (Join-Path $Root 'scripts\count-lines.mjs')
Write-Host ''

if ($Silent) { exit 0 }

$answer = Read-Host '  Serve the documentation site locally now? [y/N]'
if ($answer -match '^[Yy]') {
  Write-Host ''
  Write-Host '  Serving docs/ on http://localhost:8080 - press Ctrl+C to stop.'
  Write-Host ''
  & (Join-Path $nodeHome 'npx.cmd') --yes http-server docs -p 8080 -c-1
}
exit 0
