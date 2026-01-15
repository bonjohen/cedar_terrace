# Parking Enforcement System – Deterministic Local Dev Setup
# Run from project root
# Requires: Docker Desktop, Node.js

$ErrorActionPreference = "Stop"

function Section($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Success($msg) {
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Fail($msg) {
    Write-Host "[FAIL] $msg" -ForegroundColor Red
    exit 1
}

function Info($msg) {
    Write-Host "[INFO] $msg" -ForegroundColor Yellow
}

Section "Environment verification"

$required = @("git", "docker", "node", "npm")
foreach ($cmd in $required) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Fail "$cmd is not installed or not on PATH"
    }
}
Success "Required tools present"

Section "Docker diagnostics"

Info "Docker CLI location:"
(Get-Command docker).Source | Write-Host

Info "Docker CLI version:"
docker version --format '{{.Client.Version}}'

Info "Docker contexts:"
docker context ls

Info "Active Docker context:"
docker context show

Info "WSL status:"
try { wsl --status } catch { Info "WSL not available" }

Section "Docker engine startup"

$dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (-not (Test-Path $dockerDesktop)) {
    Fail "Docker Desktop not found at expected path"
}

# --- Docker readiness check (warning-tolerant) ---
$oldEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Info "Docker engine not reachable, starting Docker Desktop"
    Start-Process $dockerDesktop
} else {
    Success "Docker engine already running"
}

Info "Waiting for Docker engine (\\.\pipe\docker_engine)"

$engineReady = $false
$elapsed = 0
$maxWaitSeconds = 300
$interval = 5

while (-not $engineReady -and $elapsed -lt $maxWaitSeconds) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval

    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
        $engineReady = $true
        Success "Docker engine is ready"
    } else {
        Info "Docker engine not ready yet ($elapsed sec)"
    }
}

$ErrorActionPreference = $oldEAP

if (-not $engineReady) {
    Fail "Docker engine did not become ready within $maxWaitSeconds seconds"
}

Section "Project structure"

$dirs = @(
    "backend",
    "frontend-admin",
    "mobile",
    "shared",
    "infra",
    "scripts",
    "local\db",
    "local\s3",
    "local\mail"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}
Success "Directory structure ensured"

Section "Environment configuration"

$envFile = ".env.local"
@"
ENV=local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/parking_dev
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=parking-evidence
EMAIL_MODE=local
AUTH_MODE=stub
API_BASE_URL=http://localhost:3000
"@ | Out-File $envFile -Encoding utf8
Success ".env.local refreshed"

Section "Local infrastructure (Docker Compose)"

$composeFile = "local\docker-compose.yml"
@"
services:
  postgres:
    image: postgres:16
    container_name: parking-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: parking_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./db:/var/lib/postgresql/data

  minio:
    image: minio/minio
    container_name: parking-minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes:
      - ./s3:/data

  mailhog:
    image: mailhog/mailhog
    container_name: parking-mailhog
    ports:
      - "1025:1025"
      - "8025:8025"
"@ | Out-File $composeFile -Encoding utf8

Push-Location local

$oldEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"

docker compose down --remove-orphans *> $null
if ($LASTEXITCODE -ne 0) {
    $ErrorActionPreference = $oldEAP
    Fail "docker compose down failed"
}

docker compose pull *> $null
if ($LASTEXITCODE -ne 0) {
    $ErrorActionPreference = $oldEAP
    Fail "docker compose pull failed"
}

docker compose up -d *> $null
if ($LASTEXITCODE -ne 0) {
    $ErrorActionPreference = $oldEAP
    Fail "docker compose up failed"
}

$ErrorActionPreference = $oldEAP
Pop-Location

Success "Docker services started"

Section "Database initialization"

$ErrorActionPreference = "Continue"

$pgReady = $false
$elapsed = 0
while (-not $pgReady -and $elapsed -lt 60) {
    docker exec parking-postgres pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) {
        $pgReady = $true
        break
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
}

$ErrorActionPreference = $oldEAP

if (-not $pgReady) {
    Fail "Postgres did not become ready"
}

docker exec parking-postgres psql `
    -U postgres `
    -d parking_dev `
    -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" *> $null

Success "Database ready"

Section "Object storage (MinIO)"

docker exec parking-minio mc alias set local http://localhost:9000 minio minio123 *> $null
docker exec parking-minio mc mb local/parking-evidence --ignore-existing *> $null
Success "S3-compatible storage ready"

Section "Node dependencies"

$nodeProjects = @("backend", "frontend-admin", "shared")
foreach ($proj in $nodeProjects) {
    if (Test-Path "$proj\package.json") {
        Push-Location $proj
        npm install
        Pop-Location
        Success "$proj dependencies installed"
    }
}

Section "Setup complete"

Write-Host "Local environment is READY" -ForegroundColor Green
Write-Host "Postgres : localhost:5432"
Write-Host "MinIO    : http://localhost:9001"
Write-Host "MailHog  : http://localhost:8025"
Write-Host "Next:"
Write-Host " cd backend        ; npm run dev"
Write-Host " cd frontend-admin ; npm run dev"
