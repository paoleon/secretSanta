# SecretSanta.ps1
# Genera abbinamenti Secret Santa con:
# - divieto di auto-assegnamento
# - coppie vietate (anche bidirezionali)
# - storico JSON delle ultime 3 soluzioni, evitando di ripeterle
# - invio email a ciascun partecipante con il proprio receiver e un numero di controllo comune

# ================== FUNZIONI ==================

function Count-Assignments {
    param(
        [string[]]   $Givers,
        [string[]]   $Receivers,
        [string[][]] $ForbiddenPairs
    )

    if ($Givers.Count -eq 0) {
        return 1
    }

    $giver = $Givers[0]
    $total = 0

    foreach ($receiver in $Receivers) {
        if ($giver -eq $receiver) { continue }

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
        if ($giver -eq $receiver) { continue }

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

# EMAIL PARTECIPANTI (nome → email)
# Sostituisci con indirizzi reali
$emails = @{
    "Alessandro" = "alessandro@example.com"
    "Silvia"     = "silvia@example.com"
    "Simone"     = "simone@example.com"
    "Ilaria"     = "ilaria@example.com"
    "Cipo"       = "cipo@example.com"
    "Gio"        = "gio@example.com"
    "Chiara"     = "chiara@example.com"
}

# Coppie vietate (giver, receiver) in entrambe le direzioni
$forbiddenPairs = @(
    @("Alessandro", "Silvia"),
    @("Silvia",     "Alessandro"),

    @("Simone",     "Ilaria"),
    @("Ilaria",     "Simone"),

    @("Cipo",       "Gio"),
    @("Gio",        "Cipo")
)

# File di storico JSON (nella stessa cartella dello script)
$historyPath = Join-Path $PSScriptRoot "secret_santa_history.json"

# CONFIGURAZIONE SMTP (DA ADATTARE)
# Esempio generico: server SMTP del tuo provider
$smtpServer     = "localhost"
$smtpPort       = 2525
$fromEmail      = "secret.santa@test.local"
#$useSsl         = $false
# Richiede le credenziali (user/password SMTP) all'avvio
# Puoi anche commentare e impostare $smtpCredential in altro modo se vuoi
#$smtpCredential = $null   # niente credenziali per smtp4dev
#$smtpCredential = Get-Credential -Message "Credenziali per il server SMTP"


# ================== RIEPILOGO REGOLE ==================

$history = Load-History -Path $historyPath
$historyKeys = @()
foreach ($item in $history) {
    if ($item.key) {
        $historyKeys += $item.key
    }
}

Write-Host "=== Regole Secret Santa ===`n"

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

# Numero di soluzioni possibili
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

    $validAssignments = $assignments
}

if (-not $validAssignments) {
    Write-Host "Impossibile trovare una NUOVA soluzione diversa dalle ultime $($history.Count) con questi vincoli."
    exit 1
}

# Numero di controllo comune a tutti (per questa estrazione)
$controlNumber = Get-Random -Minimum 100000 -Maximum 999999

Write-Host "Sto calcolando gli abbinamenti di questo Secret Santa...`n"
Write-Host "Numero di controllo per questa estrazione: $controlNumber`n"

# foreach ($k in ($validAssignments.Keys | Sort-Object)) {
#     Write-Host "$k ::> $($validAssignments[$k])"
# }

# ================== INVIO EMAIL ==================

Write-Host "Invio email ai Giver del Secret Santa:`n"

foreach ($giver in $validAssignments.Keys) {
    # chi FA il regalo = giver
    # chi LO RICEVE    = $validAssignments[$giver]

    if (-not $emails.ContainsKey($giver)) {
        Write-Host "ATTENZIONE: nessuna email definita per '$giver', salto l'invio." -ForegroundColor Yellow
        continue
    }

    $to       = $emails[$giver]              # mail di chi fa il regalo
    $receiver = $validAssignments[$giver]    # persona a cui deve fare il regalo

    $subject = "Secret Santa - Il tuo abbinamento (controllo $controlNumber)"
    $body    = @"
Ciao $giver,

quest'anno sei il Secret Santa di:

    $receiver

Numero di controllo estrazione: $controlNumber

Conservalo: è lo stesso per tutti i partecipanti e può servire per eventuali verifiche.

Buon Secret Santa!
"@

    try {
        # smtp4dev: niente SSL, niente credenziali
        Send-MailMessage `
            -SmtpServer $smtpServer `
            -Port       $smtpPort `
            -From       $fromEmail `
            -To         $to `
            -Subject    $subject `
            -Body       $body

        Write-Host "Email inviata a $giver <$to>."
    }
    catch {
        Write-Host "Errore nell'invio email a $giver <$to>: $($_.Exception.Message)" -ForegroundColor Red
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

Write-Host "http://localhost:3000"