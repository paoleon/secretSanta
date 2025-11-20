# 🎅 Secret Santa Automation (Telegram + GitHub Actions + Cloudflare Workers)

<p align="center">
  <img src="assets/logo.svg" width="220" alt="Secret Santa Bot Logo">
</p>

Un sistema automatizzato di **Secret Santa** con:

* 🎁 Estrazione automatica dei partecipanti
* 🔐 Vincoli personalizzati (no auto-abbinamento, coppie vietate)
* 🧮 Storico ultime 3 estrazioni
* 🤖 Notifica privata via Telegram a ciascun partecipante
* ☁️ Webhook Telegram su **Cloudflare Worker**
* 🚀 Estrazione avviabile via comando Telegram (`/hat`)
* 🛠️ GitHub Actions che esegue `SecretSanta.ps1`
* 👑 Controlli admin (broadcast, lista, stato, comandi riservati)

---

# 📦 Funzionamento

Il sistema è composto da:

1. **Telegram Bot**
2. **Cloudflare Worker** che riceve i messaggi da Telegram e inoltra i comandi al workflow GitHub
3. **GitHub Actions** che esegue lo script PowerShell `SecretSanta.ps1`
4. **Script PS** che:

   * genera un nuovo Secret Santa
   * evita ripetizioni tramite uno storico JSON
   * invia la notifica Telegram a tutti i partecipanti

---

# ⚙️ Configurazione

## 1. Crea un Bot Telegram

1. Apri Telegram → cerca **@BotFather**
2. Comando: `/newbot`
3. Ottieni il **TOKEN** → lo chiameremo `TELEGRAM_BOT_TOKEN`
4. Comando: `/setprivacy` → `Disable` (il bot deve leggere tutti i messaggi)

---

## 2. Crea un Webhook sicuro

Il webhook del Worker avrà forma:

```
https://<nome-worker>.workers.dev/webhook/<TELEGRAM_SECRET>
```

Imposta il webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://<worker>.workers.dev/webhook/<TELEGRAM_SECRET>"
```

---

## 3. Configura Cloudflare Worker

Nel pannello **Workers → Settings → Variables** aggiungi:

### 📌 Environment Variables (TEXT)

| Nome              | Valore                                  |
| ----------------- | --------------------------------------- |
| TELEGRAM_SECRET   | un token segreto a tua scelta           |
| ADMIN_CHAT_ID     | tuo chat id Telegram                    |
| GITHUB_REPO       | `username/repo`                         |
| GITHUB_WORKFLOW   | `secret-santa.yml`                      |
| GITHUB_REF        | `main`                                  |
| PARTICIPANTS_JSON | JSON nome→id (una riga sola)            |
| BROADCAST_IDS     | lista chat id `[1,2,3]` (una riga sola) |

Esempio valido per PARTICIPANTS_JSON:

```json
{"Alessandro":"123456789","Silvia":"234567890","Simone":"345678901","Ilaria":"456789012","Cipo":"567890123","Gio":"678901234","Chiara":"789012345"}
```

### 🔒 Secrets

| Secret             | Valore                           |
| ------------------ | -------------------------------- |
| TELEGRAM_BOT_TOKEN | token Telegram                   |
| GITHUB_TOKEN       | PAT GitHub con permessi workflow |

---

## 4. Configura GitHub Actions

Nel repo GitHub → **Settings → Secrets → Actions**

Aggiungi:

* `TELEGRAM_BOT_TOKEN`
* `TELEGRAM_CHAT_IDS` (JSON nome → id)
* `GITHUB_TOKEN` (PAT)

Workflow:

```yaml
name: Secret Santa

on:
  workflow_dispatch:

jobs:
  run-secret-santa:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Run SecretSanta.ps1
        shell: pwsh
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_IDS:  ${{ secrets.TELEGRAM_CHAT_IDS }}
        run: ./SecretSanta.ps1
```

---

## 5. Script PowerShell (`SecretSanta.ps1`)

Lo script:

* genera la combinazione valida
* evita gli ultimi 3 storici
* calcola numero di controllo
* invia messaggi Telegram ai partecipanti

È già incluso nel repo.

---

# 🤖 Cloudflare Worker — Comandi disponibili

### 👤 *Partecipanti*

| Comando         | Funzione            |
| --------------- | ------------------- |
| `/start`        | Info sul bot        |
| `/help`         | Aiuto generale      |
| Messaggi liberi | Inoltrati all'admin |

---

### 👑 *Organizzatore (Admin)*

Accessibili solo da `ADMIN_CHAT_ID`:

| Comando            | Funzione                                                |
| ------------------ | ------------------------------------------------------- |
| `/hat`             | Avvio estrazione Secret Santa (trigger workflow GitHub) |
| `/list`            | Mostra i partecipanti dal JSON                          |
| `/status`          | Mostra stato ultima estrazione                          |
| `/broadcast <msg>` | Invia un messaggio a tutti                              |
| `/help`            | Aiuto completo                                          |

Tutto filtrato automaticamente dal Worker.

---

# 🧩 Flusso completo

```
Utente → Telegram Bot → Cloudflare Worker
   → se admin /hat → GitHub Actions esegue SecretSanta.ps1
      → Script genera estrazione + invia messaggi Telegram
```

---

# 🧪 Test locali

Puoi testare lo script PS localmente impostando variabili:

```powershell
$env:TELEGRAM_CHAT_IDS='{"Alessandro":"123","Silvia":"234"}'
$env:TELEGRAM_BOT_TOKEN='xxx'
./SecretSanta.ps1
```

---

# 🔐 Sicurezza

* Webhook protetto con `TELEGRAM_SECRET`
* Worker non mostra mai secret
* PAT GitHub salvato nei secret
* Dati sensibili in variabili ambiente
* Storico estrazioni limitato a 3 voci

---
# 🎉 Fine