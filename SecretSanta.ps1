# SecretSanta.ps1
# Versione Telegram Bot
# - divieto di auto-assegnamento
# - coppie vietate (anche bidirezionali)
# - storico JSON delle ultime 3 soluzioni
# - invio messaggi Telegram a ogni partecipante

# ================== FUNZIONI ==================

function Count-Assignments {
    param(
        [string[]]   $Givers,
        [string[]]   $Receivers,
        [string[][]] $ForbiddenPairs
    )

    # Se non ci sono più giver da assegnare, questa è una soluzione valida
    if ($Givers.Count -eq 0) {
        return 1
    }

    $giver = $Givers[0]
    $total = 0

    foreach ($receiver in $Receivers) {
        # 1) Nessuno può pescare se stesso
        if ($giver -eq $receiver) { continue }

        # 2) Coppie vietate
        $isForbidden = $false
        foreach ($pair in $ForbiddenPairs) {
            if ($pair[0] -eq $giver -and $pair[1] -eq $receiver) {
                $isForbidden = $true
                break
            }
        }
        if ($isForbidden) { continue }

        $newReceivers = $Receivers | Where-Object { $_ -ne $receiver }

        if ($Givers.Count -le 1) {
            $remainingGivers = @()
        } else {
            $remainingGivers = $Givers[1..($Givers.Count - 1)]
        }

        $total += Count-Assignments -Givers $remainingGivers -Receivers $newReceivers -ForbiddenPairs $ForbiddenPairs
    }

    return $total
}

function Find-Assignments {
    param(
        [string[]]   $Givers,
        [string[]]   $Receivers,
        [string[][]] $ForbiddenPairs,
        [hashtable]  $Partial
    )

    if ($Givers.Count -eq 0) {
        return $Partial
    }

    $giver = $Givers[0]

    foreach ($receiver in $Receivers) {
        # 1) Nessuno può pescare se stesso
        if ($giver -eq $receiver) { continue }

        # 2) Coppie vietate
        $isForbidden = $false
        foreach ($pair in $ForbiddenPairs) {
            if ($pair[0] -eq $giver -and $pair[1] -eq $receiver) {
                $isForbidden = $true
                break
            }
        }
        if ($isForbidden) { continue }

        $newPartial = $Partial.Clone()
        $newPartial[$giver] = $receiver

        $newReceivers = $Receivers | Where-Object { $_ -ne $receiver }

        if ($Givers.Count -le 1) {
            $remainingGivers = @()
        } else {
            $remainingGivers = $Givers[1..($Givers.Count - 1)]
        }

        $result = Find-Assignments -Givers $remainingGivers -Receivers $newReceivers -ForbiddenPairs $ForbiddenPairs -Partial $newPartial
        if ($result) { return $result }
    }

    return $null
}

function Get-AssignmentKey {
    param(
        [hashtable] $Assignments
    )

    # Chiave canonica per confrontare due soluzioni (ordinata per nome)
    $pairs = $Assignments.GetEnumerator() |
        Sort-Object Name |
        ForEach-Object { "$($_.Name):$($_.Value)" }

    return ($pairs -join ';')
}

function Load-History {
    param(
        [string] $Path
    )

    if (-not (Test-Path $Path)) {
        return @()
    }

    $json = Get-Content $Path -Raw
    if ([string]::IsNullOrWhiteSpace($json)) {
        return @()
    }

    $history = $json | ConvertFrom-Json

    # Se c'è un solo oggetto, ConvertFrom-Json non restituisce un array
    if ($history -and $history.GetType().Name -ne 'Object[]') {
        $history = @($history)
    }

    return $history
}

function Save-History {
    param(
        [string]   $Path,
        [object[]] $History
    )

    $History | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $Path
}

function Send-TelegramMessage {
    param(
        [string] $Token,
        [string] $ChatId,
        [string] $Text
    )

    $uri = "https://api.telegram.org/bot$Token/sendMessage"
    $body = @{
        chat_id = $ChatId
        text    = $Text
    }

    Invoke-RestMethod -Uri $uri -Method Post -Body $body | Out-Null
}

# ================== CONFIGURAZIONE ==================

# Partecipanti
$names = @(
    "Alessandro",
    "Silvia",
    "Simone",
    "Ilaria",
    "Cipo",
    "Gio",
    "Chiara"
)

# Coppie vietate (giver, receiver) in entrambe le direzioni
$forbiddenPairs = @(
    @("Alessandro", "Silvia"),
    @("Silvia",     "Alessandro"),

    @("Simone",     "Ilaria"),
    @("Ilaria",     "Simone"),

    @("Cipo",       "Gio"),
    @("Gio",        "Cipo")
)

# ================== LETTURA TELEGRAM_CHAT_IDS ==================

$telegramIdsJson = $env:TELEGRAM_CHAT_IDS
if (-not $telegramIdsJson) {
    Write-Host "TELEGRAM_CHAT_IDS non presente o vuoto." -ForegroundColor Red
    exit 1
}

# JSON → PSCustomObject
$telegramIdsObj = $telegramIdsJson | ConvertFrom-Json

# PSCustomObject → hashtable nome → chat_id
$telegramIds = @{}
$telegramIdsObj.PSObject.Properties | ForEach-Object {
    $telegramIds[$_.Name] = "$($_.Value)"
}

Write-Host "Chat IDs caricati:"
$telegramIds.GetEnumerator() | Sort-Object Name | ForEach-Object {
    Write-Host " - $($_.Name) : $($_.Value)"
}


# Token del bot da variabile d'ambiente (es. GitHub Actions: TELEGRAM_BOT_TOKEN secret)
$TelegramBotToken = $env:TELEGRAM_BOT_TOKEN
if (-not $TelegramBotToken) {
    Write-Host "Token Telegram non trovato (variabile TELEGRAM_BOT_TOKEN)." -ForegroundColor Red
    exit 1
}

# File di storico JSON (nella stessa cartella dello script)
$historyPath = Join-Path $PSScriptRoot "secret_santa_history.json"

# ================== CARICAMENTO STORICO ==================

$history = Load-History -Path $historyPath
$historyKeys = @()
foreach ($item in $history) {
    if ($item.key) {
        $historyKeys += $item.key
    }
}

# ================== RIEPILOGO REGOLE ==================

Write-Host "=== Regole Secret Santa (Telegram) ===`n"

Write-Host "Partecipanti:"
$names | ForEach-Object { Write-Host " - $_" }

Write-Host "`nCoppie vietate (giver: receiver):"
if ($forbiddenPairs.Count -eq 0) {
    Write-Host " (nessuna)"
} else {
    foreach ($p in $forbiddenPairs) {
        Write-Host " - $($p[0]) : $($p[1])"
    }
}

Write-Host "`nStorico soluzioni da evitare: $($history.Count) (max 3)`n"

# ================== NUMERO TOTALE SOLUZIONI ==================

$totalSolutions = Count-Assignments -Givers $names -Receivers $names -ForbiddenPairs $forbiddenPairs
Write-Host "Numero totale di soluzioni possibili con questi vincoli: $totalSolutions`n"

# ================== GENERAZIONE CON CONTROLLO STORICO ==================

$maxTries = 50
$attempt  = 0
$validAssignments = $null

while (-not $validAssignments -and $attempt -lt $maxTries) {
    $attempt++

    $givers    = $names | Sort-Object { Get-Random }
    $receivers = $names | Sort-Object { Get-Random }

    $assignments = Find-Assignments -Givers $givers -Receivers $receivers -ForbiddenPairs $forbiddenPairs -Partial @{}

    if (-not $assignments) {
        continue
    }

    $key = Get-AssignmentKey -Assignments $assignments

    if ($historyKeys -contains $key) {
        continue
    }

    # Soluzione nuova
    $validAssignments = $assignments
}

if (-not $validAssignments) {
    Write-Host "Impossibile trovare una NUOVA soluzione diversa dalle ultime $($history.Count) con questi vincoli."
    exit 1
}

# Numero di controllo comune a tutti (per questa estrazione)
$controlNumber = Get-Random -Minimum 100000 -Maximum 999999

Write-Host "Abbinamenti Secret Santa:`n"
Write-Host "Numero di controllo per questa estrazione: $controlNumber`n"

foreach ($k in ($validAssignments.Keys | Sort-Object)) {
    Write-Host "$k ::> $($validAssignments[$k])"
}

# ================== INVIO MESSAGGI TELEGRAM ==================

Write-Host "`nInvio messaggi Telegram...`n"

foreach ($giver in $validAssignments.Keys) {
    if (-not $telegramIds.ContainsKey($giver)) {
        Write-Host "ATTENZIONE: nessun chat_id Telegram definito per '$giver', salto l'invio." -ForegroundColor Yellow
        continue
    }

    $chatId   = $telegramIds[$giver]       # chi fa il regalo
    $receiver = $validAssignments[$giver]  # destinatario

    $text = @"
Ciao $giver,

quest'anno sei il Secret Santa di:

    $receiver

Numero di controllo estrazione: $controlNumber

Conservalo: e' lo stesso per tutti i partecipanti e puo' servire per eventuali verifiche.

Buon Secret Santa!
"@

    try {
        Send-TelegramMessage -Token $TelegramBotToken -ChatId $chatId -Text $text
        Write-Host "Messaggio Telegram inviato a $giver (chat_id = $chatId)."
    }
    catch {
        Write-Host "Errore nell'invio Telegram a $giver (chat_id = $chatId): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ================== AGGIORNAMENTO STORICO ==================

$newEntry = [PSCustomObject]@{
    date          = (Get-Date).ToString("s")
    assignment    = $validAssignments
    key           = (Get-AssignmentKey -Assignments $validAssignments)
    controlNumber = $controlNumber
}

$history = @($newEntry) + $history

if ($history.Count -gt 3) {
    $history = $history[0..2]
}

Save-History -Path $historyPath -History $history

Write-Host "`nStorico aggiornato (max 3 soluzioni). File: $historyPath"
