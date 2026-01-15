# Parking Enforcement System – Local Development Environment Setup
# Run this script from the root of the project folder

Write-Host "=== Parking Enforcement Dev Environment Setup ==="

# ---------- 1. Verify prerequisites ----------
Write-Host "Checking prerequisites..."

$requiredCommands = @("git", "docker", "node", "npm")
foreach ($cmd in $requiredCommands) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "$cmd is not installed or not on PATH. Aborting."
        exit 1
    }
}

Write-Host "Prerequisites OK."

# ---------- 2. Create folder structure ----------
Write-Host "Creating project structure..."

$dirs = @(
    "backend",
    "frontend-admin",
    "mobile",
    "shared",
    "infra",
    "scripts",
    "local",
    "local/db",
    "local/s3",
    "local/mail"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

# ---------- 3. Create environment files ----------
Write-Host "Creating environment configuration..."

$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
@"
ENV=local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/parking_dev
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=parking-evidence
AUTH_MODE=stub
EMAIL_MODE=local
API_BASE_URL=http://localhost:3000
"@ | Out-File $envFile -Encoding utf8
}

# ---------- 4. Docker compose for local services ----------
Write-Host "Creating docker-compose.yml..."

$dockerCompose = "local/docker-compose.yml"
if (-not (Test-Path $dockerCompose)) {
@"
version: '3.8'
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
"@ | Out-File $dockerCompose -Encoding utf8
}

# ---------- 5. Start local infrastructure ----------
Write-Host "Starting local infrastructure (Postgres, S3, Mail)..."
Push-Location local
docker compose up -d
Pop-Location

# ---------- 6. Install backend dependencies ----------
if (Test-Path "backend/package.json") {
    Write-Host "Installing backend dependencies..."
    Push-Location backend
    npm install
    Pop-Location
}

# ---------- 7. Install frontend dependencies ----------
if (Test-Path "frontend-admin/package.json") {
    Write-Host "Installing frontend-admin dependencies..."
    Push-Location frontend-admin
    npm install
    Pop-Location
}

# ---------- 8. Install shared dependencies ----------
if (Test-Path "shared/package.json") {
    Write-Host "Installing shared dependencies..."
    Push-Location shared
    npm install
    Pop-Location
}

# ---------- 9. Initialize database ----------
Write-Host "Waiting for Postgres to be ready..."
Start-Sleep -Seconds 5

Write-Host "Initializing database schema..."
docker exec -i parking-postgres psql `
    -U postgres `
    -d parking_dev `
    -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# ---------- 10. Create S3 bucket ----------
Write-Host "Creating local S3 bucket..."
docker exec parking-minio `
    mc alias set local http://localhost:9000 minio minio123
docker exec parking-minio `
    mc mb local/parking-evidence --ignore-existing

# ---------- 11. Seed development data ----------
Write-Host "Seeding development data (stub)..."
Write-Host "NOTE: Implement seed scripts in /scripts/seed.ps1"

# ---------- 12. Final instructions ----------
Write-Host ""
Write-Host "=== Setup Complete ==="
Write-Host "Next steps:"
Write-Host "1. Start backend:   cd backend; npm run dev"
Write-Host "2. Start admin UI:  cd frontend-admin; npm run dev"
Write-Host "3. Mobile app:      use local API_BASE_URL"
Write-Host "4. Mail UI:         http://localhost:8025"
Write-Host "5. MinIO UI:        http://localhost:9001"
Write-Host ""
Write-Host "Local environment ready."
