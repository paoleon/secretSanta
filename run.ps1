# ===============================
# Run-All.ps1
# Avvia Docker Desktop (se serve)
# Avvia smtp4dev con docker compose
# Attende che il container sia "Up"
# Esegue SecretSanta.ps1
# ===============================

Write-Host "=== Controllo Docker Desktop ==="

# Verifica se docker è disponibile
try {
    docker version > $null 2>&1
}
catch {
    Write-Host "Docker Desktop non è attivo. Avvialo e riprova." -ForegroundColor Red
    exit 1
}

Write-Host "Docker è attivo.`n"

# ===============================
# PUNTO 1 — docker compose up
# ===============================

Write-Host "=== Avvio smtp4dev con docker compose ==="

# directory dove hai docker-compose.yml
$composeDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Directory compose: $composeDir"

Push-Location $composeDir

docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "Errore nell'eseguire 'docker compose up -d'." -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "docker compose avviato.`n"


# ===============================
# PUNTO 2 — Attendi che smtp4dev sia su
# ===============================

Write-Host "=== Attesa avvio container smtp4dev ==="

$maxWait = 20
$waited  = 0

while ($waited -lt $maxWait) {
    $container = docker ps --format "{{.Names}} {{.Status}}" | Select-String "smtp4dev"

    if ($container) {
        Write-Host "smtp4dev è attivo: $container"
        break
    }

    Write-Host "In attesa che il container parta..."
    Start-Sleep -Seconds 1
    $waited++
}

if (-not $container) {
    Write-Host "smtp4dev NON è partito entro il tempo limite." -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host "`n"


# ===============================
# PUNTO 3 — Avvio script principale
# ===============================

Write-Host "=== Avvio SecretSanta.ps1 ==="

$scriptPath = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "SecretSanta.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Host "SecretSanta.ps1 non trovato: $scriptPath" -ForegroundColor Red
    exit 1
}

powershell -ExecutionPolicy Bypass -File $scriptPath
