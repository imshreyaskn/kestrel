# =============================================================================
# Lenny Growth Assistant (Codename: Kestrel) - One-Command Startup Script
# Conforms strictly to IMPLEMENTATION_SPEC.md Section 13.2.
# =============================================================================

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$Reindex
)

$ErrorActionPreference = "Stop"

function Step-Log {
    param([string]$Msg)
    Write-Host ""
    Write-Host "==> $Msg" -ForegroundColor Cyan
}

function Success-Log {
    param([string]$Msg)
    Write-Host "    [OK] $Msg" -ForegroundColor Green
}

function Warn-Log {
    param([string]$Msg)
    Write-Host "    [WARN] $Msg" -ForegroundColor Yellow
}

function Fatal-Log {
    param([string]$Msg)
    Write-Host ""
    Write-Host "[FATAL] $Msg" -ForegroundColor Red
    exit 1
}

function Get-JsonUrl {
    param([string]$Url)
    try {
        if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            $raw = curl.exe -s -m 3 $Url 2>$null
            if ($raw) {
                return ($raw | ConvertFrom-Json)
            }
        } else {
            return (Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop)
        }
    } catch {
        return $null
    }
    return $null
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  Lenny Growth Assistant (Codename: Kestrel) - Bootstrap" -ForegroundColor Cyan
Write-Host "  Editorial Research Studio - Unified One-Command Startup" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

# 1. Verify Docker Engine
Step-Log "Checking Docker Engine..."
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fatal-Log "Docker daemon is not running. Please start Docker Desktop and retry."
    }
    Success-Log "Docker Engine is active and healthy."
} catch {
    Fatal-Log "Docker is not installed or not in system PATH."
}

# 2. Check Host Ollama Service & Models
Step-Log "Checking host Ollama (http://localhost:11434)..."
$ollamaOnline = $false
$tagsRes = Get-JsonUrl "http://localhost:11434/api/tags"
if ($tagsRes -and $tagsRes.models) {
    $ollamaOnline = $true
    Success-Log "Ollama is reachable on host."

    $existingModels = @($tagsRes.models | ForEach-Object { $_.name })

    # Check Chat Model
    $chatModel = "qwen2.5:1.5b"
    if ($existingModels -match "qwen2\.5:1\.5b") {
        Success-Log "Chat model '$chatModel' is present."
    } else {
        Warn-Log "Chat model '$chatModel' not found in local Ollama."
        Write-Host "    Pulling $chatModel now (approx 986 MB)..." -ForegroundColor Yellow
        ollama pull $chatModel
        Success-Log "Chat model '$chatModel' pulled successfully."
    }

    # Check Embedding Model
    $embedModel = "embeddinggemma"
    if ($existingModels -match "embeddinggemma") {
        Success-Log "Embedding model '$embedModel' is present."
    } else {
        Warn-Log "Embedding model '$embedModel' not found in local Ollama."
        Write-Host "    Pulling $embedModel now (approx 600 MB)..." -ForegroundColor Yellow
        ollama pull $embedModel
        Success-Log "Embedding model '$embedModel' pulled successfully."
    }
} else {
    Warn-Log "Ollama is not running locally on port 11434."
    Warn-Log "Local inference will be offline until Ollama is started."
    Warn-Log "Cloud inference (Gemini/Anthropic/OpenAI) remains available if keys are configured."
}

# 3. Environment File Configuration (.env)
Step-Log "Configuring environment settings (.env)..."
$envFile = Join-Path $PSScriptRoot ".env"
$envExample = Join-Path $PSScriptRoot ".env.example"

if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Success-Log "Created .env from .env.example."
    } else {
        Fatal-Log "Neither .env nor .env.example exists in the repository."
    }
}

# Ensure INTERNAL_SERVICE_TOKEN is populated
$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch "INTERNAL_SERVICE_TOKEN=.+" -or $envContent -match "INTERNAL_SERVICE_TOKEN=dev-internal-token-change-me") {
    $randomToken = [Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
    if ($envContent -match "INTERNAL_SERVICE_TOKEN=") {
        $envContent = $envContent -replace "INTERNAL_SERVICE_TOKEN=.*", "INTERNAL_SERVICE_TOKEN=$randomToken"
    } else {
        $envContent += "`nINTERNAL_SERVICE_TOKEN=$randomToken`n"
    }
    Set-Content -Path $envFile -Value $envContent -NoNewline
    Success-Log "Generated secure random INTERNAL_SERVICE_TOKEN."
} else {
    Success-Log ".env configuration is verified."
}

# 4. Start Container Topology
Step-Log "Launching container services (db, agent-gateway, api, frontend)..."
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Fatal-Log "Failed to start Docker Compose services."
}
Success-Log "Containers started."

# 5. Wait for Database Readiness & Migrations
Step-Log "Waiting for PostgreSQL database health..."
$dbReady = $false
for ($i = 0; $i -lt 30; $i++) {
    $health = docker inspect --format="{{json .State.Health.Status}}" kestrel-db 2>$null
    if ($health -eq '"healthy"') {
        $dbReady = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $dbReady) {
    Fatal-Log "Database container failed to become healthy within 30 seconds."
}
Success-Log "Database is healthy and accepting connections."

Step-Log "Applying database migrations (Alembic)..."
docker compose exec -T api alembic -c /app/alembic.ini upgrade head
if ($LASTEXITCODE -ne 0) {
    Fatal-Log "Alembic migrations failed."
}
Success-Log "Schema migrations applied to head."

# 6. Wait for FastAPI Readiness Probe
Step-Log "Verifying API readiness (http://localhost:8000/api/v1/health/ready)..."
$apiReady = $false
for ($i = 0; $i -lt 30; $i++) {
    $healthJson = Get-JsonUrl "http://localhost:8000/api/v1/health/ready"
    if ($healthJson -and $healthJson.status -eq "ready") {
        $apiReady = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $apiReady) {
    Fatal-Log "API failed readiness probe after 30 seconds."
}
Success-Log "API is ready."

# 7. Check Knowledge Base
Step-Log "Checking transcript knowledge base..."
$chunkCount = 0
$sourceCount = 0
$ingestStatus = Get-JsonUrl "http://localhost:8000/api/v1/ingestion/status"
if ($ingestStatus) {
    $chunkCount = [int]$ingestStatus.total_chunks
    $sourceCount = [int]$ingestStatus.active_sources
}

$needsIngest = $Reindex.IsPresent -or ($chunkCount -eq 0)

if ($chunkCount -gt 0 -and -not $Reindex.IsPresent) {
    Success-Log "Knowledge base is ready ($chunkCount chunks indexed across $sourceCount episodes)."
} else {
    Step-Log "Syncing and indexing Lenny Podcast transcripts into pgvector..."
    docker compose exec -T api python -m backend.app.ingestion.cli sync
    docker compose exec -T api python -m backend.app.ingestion.cli index
    Success-Log "Knowledge base successfully synced and indexed."
}

# 8. Success Banner
$ollamaMsg = if ($ollamaOnline) { "Online (http://localhost:11434)" } else { "Offline (Cloud providers active)" }

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "  [OK] APPLICATION ONLINE - EDITORIAL RESEARCH STUDIO IS READY" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "  Studio Web UI:         http://localhost:5173" -ForegroundColor White
Write-Host "  Backend API Service:   http://localhost:8000" -ForegroundColor White
Write-Host "  OpenAPI Documentation: http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Database:              PostgreSQL 16 + pgvector (HNSW Indexed)" -ForegroundColor White
Write-Host "  Host Ollama:           $ollamaMsg" -ForegroundColor White
Write-Host ""
Write-Host "  To view live container logs: docker compose logs -f" -ForegroundColor Gray
Write-Host "  To stop the application:     docker compose down" -ForegroundColor Gray
Write-Host "========================================================================" -ForegroundColor Green

if (-not $NoBrowser) {
    Start-Process "http://localhost:5173"
}
