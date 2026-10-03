param(
    [string]$Python = '',
    [switch]$UseExistingPostgres
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Python) { $Python = Join-Path $RepoRoot '.venv/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $Python)) { throw 'Python environment missing. Create .venv and install backend/requirements.txt first.' }
$Python = (Resolve-Path -LiteralPath $Python).Path
Push-Location (Join-Path $RepoRoot 'backend')
try {
    & $Python scripts/demo_preflight.py --config-only
    if ($LASTEXITCODE -ne 0) { throw 'Environment preflight failed.' }
    if (-not $UseExistingPostgres) {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is unavailable. Install Docker or configure an existing PostgreSQL and use -UseExistingPostgres.' }
        & docker compose --project-directory $RepoRoot up -d --wait --wait-timeout 60 db
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL Compose startup failed.' }
    }
    & $Python scripts/demo_preflight.py --migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database setup failed; backend/frontend were not started.' }
    Write-Host 'Ready. In backend/, using the same Python environment and environment variables:'
    Write-Host 'python -m uvicorn app.main:app --host 127.0.0.1 --port 8000'
    Write-Host 'Verify http://127.0.0.1:8000/health returns HTTP 200 and database=ok.'
    Write-Host 'Then in frontend/: npm.cmd ci; npm.cmd run build; npm.cmd start'
} finally { Pop-Location }
