# ===============================
# Start-Bot.ps1
# Avvia la versione Telegram del Secret Santa
# - Controlla la presenza del token Telegram
# - Chiede il token se assente (solo locale)
# - Imposta la variabile d'ambiente
# - Avvia SecretSanta.ps1
# ===============================

Write-Host "=== Secret Santa – Avvio versione Telegram Bot ===`n"

# ===============================
# PUNTO 1 — Verifica Token Telegram
# ===============================

if (-not $env:TELEGRAM_BOT_TOKEN -or [string]::IsNullOrWhiteSpace($env:TELEGRAM_BOT_TOKEN)) {

    Write-Host "Il token TELEGRAM_BOT_TOKEN non è impostato." -ForegroundColor Yellow
    Write-Host "Inserisci il token del Bot (non verrà salvato in file, solo nella sessione PS):`n"

    $token = Read-Host "Telegram Bot Token"

    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Host "Nessun token inserito. Interrotto." -ForegroundColor Red
        exit 1
    }

    $env:TELEGRAM_BOT_TOKEN = $token
    Write-Host "`nToken configurato correttamente.`n"
}
else {
    Write-Host "Token Telegram già presente nella sessione.`n"
}

# ===============================
# PUNTO 2 — Avvio script principale
# ===============================

Write-Host "=== Avvio SecretSanta.ps1 ===`n"

$scriptPath = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "SecretSanta.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Host "ERRORE: SecretSanta.ps1 non trovato nel percorso previsto:" -ForegroundColor Red
    Write-Host "       $scriptPath"
    exit 1
}

powershell -ExecutionPolicy Bypass -File $scriptPath

Write-Host "`n=== Completato ==="


