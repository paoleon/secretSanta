# Secret Santa – Versione Telegram 🎄

Questo progetto genera automaticamente un abbinamento *Secret Santa* rispettando alcuni vincoli, salva uno storico delle ultime estrazioni ed invia a ogni partecipante un messaggio privato tramite **Telegram Bot API**.

Il tutto può essere eseguito localmente oppure automaticamente tramite **GitHub Actions**.

---

## ✨ Funzionalità

- Evita che una persona estragga sé stessa.  
- Supporta coppie vietate (es. coppie reali, familiari, ecc.).  
- Mantiene uno **storico JSON** delle ultime 3 estrazioni per evitare ripetizioni.  
- Invia a ogni partecipante un DM Telegram contenente:
  - Nome del destinatario del regalo
  - Numero di controllo univoco dell’estrazione
- Può essere eseguito tramite **GitHub Actions** senza server o infrastruttura aggiuntiva.

---

## 📦 Requisiti

### Esecuzione locale
- PowerShell 7+  
- Connessione internet per chiamare Telegram API  
- Token Bot Telegram

### Esecuzione con GitHub Actions
- Nessun requisito locale
- Repository con:
  - `SecretSanta.ps1`
  - `.github/workflows/secret-santa.yml`
  - `.gitignore`

---

## 🤖 Configurazione Telegram

1. Apri Telegram e cerca **BotFather**  
2. Crea un nuovo bot:
