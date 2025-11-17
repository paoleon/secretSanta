Per metterlo su GitHub e usare un server di posta “vero” devi risolvere due cose:

1. **Niente credenziali nel repository** (mai utente/password in chiaro).
2. **Configurazione SMTP esterna allo script** (via file di config e/o variabili d’ambiente).

Ti propongo una soluzione pratica.

---

## 1. Struttura del repository

Esempio:

```text
__secretSanta/
  SecretSanta.ps1
  run.ps1
  docker-compose.yml
  config.example.ps1
  .gitignore
  README.md
```

`.gitignore` (minimo):

```gitignore
config.ps1
secret_santa_history.json
```

Così non committi:

* config con dati SMTP reali
* storico con nomi ed email.

---

## 2. File di config da copiare localmente

Crea **config.example.ps1** (questo lo committi):

```powershell
# config.example.ps1
# Copia questo file in "config.ps1" e personalizza i valori.

$SecretSantaConfig = @{
    # SMTP "vero"
    SmtpServer = "smtp.example.com"
    SmtpPort   = 587
    UseSsl     = $true
    FromEmail  = "secretsanta@example.com"

    # Nomi delle variabili d'ambiente che conterranno user/pass SMTP
    SmtpUserEnvVar = "SECRET_SANTA_SMTP_USER"
    SmtpPassEnvVar = "SECRET_SANTA_SMTP_PASS"
}
```

Poi, in locale, ognuno farà:

```powershell
Copy-Item config.example.ps1 config.ps1
```

e modifica i valori.
`config.ps1` **non** va committato.

---

## 3. Variabili d’ambiente per username/password SMTP

Su Windows (PowerShell):

```powershell
[Environment]::SetEnvironmentVariable("SECRET_SANTA_SMTP_USER", "utente_smtp", "User")
[Environment]::SetEnvironmentVariable("SECRET_SANTA_SMTP_PASS", "password_smtp", "User")
```

Così:

* utente e password **non** stanno nel repo
* lo script li legge quando gira.

---

## 4. Modifiche a `SecretSanta.ps1`

### 4.1. Carica la config all’inizio

Subito dopo le funzioni, prima della sezione CONFIGURAZIONE:

```powershell
# ================== CONFIGURAZIONE GENERALE ==================

# Carica la config locale (non versionata)
$configPath = Join-Path $PSScriptRoot "config.ps1"
if (-not (Test-Path $configPath)) {
    Write-Host "File di config non trovato: $configPath" -ForegroundColor Red
    Write-Host "Copia config.example.ps1 in config.ps1 e personalizza i valori."
    exit 1
}

. $configPath   # carica $SecretSantaConfig
```

### 4.2. SMTP con credenziali (se presenti)

Nella sezione dove prima avevi la configurazione smtp, metti:

```powershell
# ================== CONFIGURAZIONE SMTP ==================

$smtpServer = $SecretSantaConfig.SmtpServer
$smtpPort   = $SecretSantaConfig.SmtpPort
$fromEmail  = $SecretSantaConfig.FromEmail
$useSsl     = [bool]$SecretSantaConfig.UseSsl

# Legge utente/password dalle variabili d'ambiente configurate
$smtpUser = [Environment]::GetEnvironmentVariable($SecretSantaConfig.SmtpUserEnvVar, "User")
$smtpPass = [Environment]::GetEnvironmentVariable($SecretSantaConfig.SmtpPassEnvVar, "User")

$smtpCredential = $null
if ($smtpUser -and $smtpPass) {
    $securePass     = ConvertTo-SecureString $smtpPass -AsPlainText -Force
    $smtpCredential = New-Object System.Management.Automation.PSCredential ($smtpUser, $securePass)
}
```

Se le variabili non sono valorizzate, `smtpCredential` resta null: puoi usarlo per decidere se inviare via server vero o in modalità “test” (smtp4dev).

Per smtp4dev puoi semplicemente usare:

```powershell
# Override per ambiente di sviluppo/test
# $smtpServer = "localhost"
# $smtpPort   = 2525
# $useSsl     = $false
# $smtpCredential = $null
```

(commentato di default, da scommentare su chi sviluppa).

---

## 5. Invio email con o senza SSL / credenziali

Sostituisci il blocco di invio con una versione che:

* usa SSL solo se `UseSsl` è true
* usa credenziali solo se ci sono
* manda la mail al **giver** con il nome del **receiver**.

```powershell
# ================== INVIO EMAIL ==================

foreach ($giver in $validAssignments.Keys) {
    if (-not $emails.ContainsKey($giver)) {
        Write-Host "ATTENZIONE: nessuna email definita per '$giver', salto l'invio." -ForegroundColor Yellow
        continue
    }

    $to       = $emails[$giver]              # mail di chi fa il regalo
    $receiver = $validAssignments[$giver]    # destinatario del regalo

    $subject = "Secret Santa - Il tuo abbinamento (controllo $controlNumber)"
    $body    = @"
Ciao $giver,

quest'anno sei il Secret Santa di:

    $receiver

Numero di controllo estrazione: $controlNumber

Conservalo: è lo stesso per tutti i partecipanti e può servire per eventuali verifiche.

Buon Secret Santa!
"@

    # Parametri comuni
    $mailParams = @{
        SmtpServer = $smtpServer
        Port       = $smtpPort
        From       = $fromEmail
        To         = $to
        Subject    = $subject
        Body       = $body
    }

    if ($useSsl) {
        $mailParams.UseSsl = $true
    }

    if ($smtpCredential) {
        $mailParams.Credential = $smtpCredential
    }

    try {
        Send-MailMessage @mailParams
        Write-Host "Email inviata a $giver <$to>."
    }
    catch {
        Write-Host "Errore nell'invio email a $giver <$to>: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

---

## 6. Esempi di server SMTP reali

Poi, nel tuo `config.ps1` locale, puoi mettere:

### Gmail (con password app)

```powershell
$SecretSantaConfig = @{
    SmtpServer       = "smtp.gmail.com"
    SmtpPort         = 587
    UseSsl           = $true
    FromEmail        = "tuoindirizzo@gmail.com"
    SmtpUserEnvVar   = "SECRET_SANTA_SMTP_USER"
    SmtpPassEnvVar   = "SECRET_SANTA_SMTP_PASS"
}
```

E nelle variabili d’ambiente:

* `SECRET_SANTA_SMTP_USER` = `tuoindirizzo@gmail.com`
* `SECRET_SANTA_SMTP_PASS` = password-app generata da Google (non la password normale).

### Office 365 / Outlook.com

```powershell
$SecretSantaConfig = @{
    SmtpServer       = "smtp.office365.com"
    SmtpPort         = 587
    UseSsl           = $true
    FromEmail        = "tuoindirizzo@dominio.com"
    SmtpUserEnvVar   = "SECRET_SANTA_SMTP_USER"
    SmtpPassEnvVar   = "SECRET_SANTA_SMTP_PASS"
}
```

---

## 7. README per GitHub (in breve)

Nel `README.md` spieghi:

* come copiare `config.example.ps1` → `config.ps1`
* come impostare le variabili d’ambiente SMTP
* come avviare smtp4dev per test (opzionale)
* come lanciare:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

In questo modo:

* il codice su GitHub è pulito
* nessuna credenziale in chiaro
* puoi usare sia server reale che smtp4dev a seconda della config locale.
