# 🎅 Secret Santa Automation (Telegram + GitHub Actions + Cloudflare Workers)

<p align="center">
  <img src="assets/logo.svg" width="220" alt="Secret Santa Bot Logo">
</p>

Questo progetto automatizza il **Secret Santa** tramite:

* **Bot Telegram**
* **GitHub Actions**
* **Cloudflare Workers**s
* Script **PowerShell** per generare gli abbinamenti
* Invio automatico via Telegram ai partecipanti

Il tutto funziona **senza server**, completamente gratuito.

---

## ✨ Funzionamento (overview)

1. Un utente scrive al bot Telegram:

   * `/start` → riceve la descrizione del bot
   * `/hat` → avvia l’estrazione Secret Santa

2. Il **Cloudflare Worker** riceve il messaggio (webhook Telegram):
   
   * inoltra a un **admin** il messaggio e l’ID del chiamante
   * se `/hat`, attiva il workflow GitHub

3. GitHub Actions esegue `SecretSanta.ps1`:

   * genera abbinamenti validi (no auto-assegnazione, coppie vietate, storico)
   * calcola un numero di controllo comune
   * invia via Telegram a ciascun partecipante il proprio destinatario

4. Lo script mantiene uno storico JSON delle ultime 3 estrazioni.

---

## 🗂 Struttura del repository

```
.
├── SecretSanta.ps1
├── .github
│   └── workflows
│       └── secret-santa.yml
├── secret_santa_history.json   # generato automaticamente
└── README.md
```

---

## 🧰 Requisiti

* Account GitHub
* Account Cloudflare
* Bot Telegram (creato con @BotFather)
* Chat ID Telegram dei partecipanti
* Ambiente GitHub Actions (gratuito)

---

## 🔐 Configurazione dei Secret su GitHub

Vai su:

**Settings → Secrets and variables → Actions**

Aggiungi:

### 1. `TELEGRAM_BOT_TOKEN`

Il token del bot Telegram (fornito da @BotFather).

### 2. `TELEGRAM_CHAT_IDS`

JSON dei partecipanti:

```json
{
  "Alessandro": "123456789",
  "Silvia": "234567890",
  "Simone": "345678901",
  "Ilaria": "456789012",
  "Cipo": "567890123",
  "Gio": "678901234",
  "Chiara": "789012345"
}
```

---

## ☁️ Configurazione Cloudflare Worker

1. Crea un **Worker**
2. Incolla il codice del Worker aggiornato
3. Imposta le **Environment Variables**:

| Nome            | Tipo | Valore                          |
| --------------- | ---- | ------------------------------- |
| GITHUB_REPO     | Text | `tuousername/tuorepo`           |
| GITHUB_WORKFLOW | Text | `secret-santa.yml`              |
| GITHUB_REF      | Text | `main`                          |
| TELEGRAM_SECRET | Text | un token segreto per il webhook |
| ADMIN_CHAT_ID   | Text | il tuo chat_id Telegram         |
| BOT_USERNAME    | Text | username del bot, es: `MioBot`  |

Aggiungi i **segreti**:

| Nome               | Tipo   | Valore                 |
| ------------------ | ------ | ---------------------- |
| GITHUB_TOKEN       | Secret | PAT GitHub con `repo`  |
| TELEGRAM_BOT_TOKEN | Secret | token del bot Telegram |

---

## 🔔 Configura il webhook Telegram

Sostituisci:

* `<TOKEN>` = token del bot
* `<WORKER_URL>` = URL del Worker
* `<SECRET>` = valore `TELEGRAM_SECRET`

Esegui:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<WORKER_URL>/webhook/<SECRET>
```

Deve tornare:

```json
{"ok":true,"result":true,...}
```

---

## ▶️ Esecuzione

### Avvio manuale (debug)

Vai in **Actions → Secret Santa → Run workflow**.

### Avvio dal bot

Su Telegram:

* `/start`
  Risponde al chiamante + inoltra all’admin

* `/hat`
  Avvia l’estrazione Secret Santa e invia abbinamenti a tutti

Ogni messaggio inviato al bot viene inoltrato all’admin con:

* testo
* username / nome del mittente
* chat_id

---

## 📦 Script principale `SecretSanta.ps1`

Lo script:

* genera abbinamenti validi
* evita le ultime 3 soluzioni (storico)
* invia il destinatario al partecipante via Telegram
* mantiene uno storico JSON
* calcola un numero di controllo comune

Il workflow GitHub esegue questo file automaticamente.

---

## 🚨 Debug

Puoi controllare:

* Log del Worker (Cloudflare → Worker → Logs)
* Log del workflow (GitHub → Actions → Secret Santa)
* Output dello script PowerShell (nello step GitHub)

---

## 🛡 Sicurezza

* Nessun token è salvato nel repository
* I secret GitHub sono **cifrati**
* Cloudflare Worker usa solo secret-side variables
* Il webhook Telegram include un token segreto nel percorso

Non è necessario esporre server.

---

## 🎁 Contribuire / Estendere

Puoi aggiungere facilmente:

* Sistema di conferma ricezione regali
* Dashboard web con abbinamenti anonimi
* Pubblicazione automatica degli accoppiamenti “post evento”
* Statistiche storiche
* Multi-gruppo / Multi-room

---

## ✔️ Licenza

MIT License (personalizzabile).

