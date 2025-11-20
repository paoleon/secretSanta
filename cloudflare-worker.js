export default {
  async fetch(request, env, ctx) {
    // Solo POST da Telegram
    if (request.method !== "POST") {
      return new Response("OK (Telegram webhook endpoint)", { status: 200 });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const pathSecret = parts.length >= 2 ? parts[1] : null;

    // Controllo segreto URL: /webhook/<TELEGRAM_SECRET>
    if (env.TELEGRAM_SECRET && pathSecret !== env.TELEGRAM_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    // --- PARSE TELEGRAM UPDATE ---
    let update;
    try {
      update = await request.json();
    } catch (e) {
      console.log("JSON parse error:", e);
      return new Response("Bad Request", { status: 400 });
    }

    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      return new Response("OK", { status: 200 });
    }

    const from   = message.from;
    const text   = message.text.trim();
    const chatId = message.chat.id;

    // Ignora i messaggi inviati dal bot stesso (niente loop)
    if (from && from.is_bot) {
      return new Response("OK", { status: 200 });
    }

    const botToken     = env.TELEGRAM_BOT_TOKEN;
    const adminChatId  = env.ADMIN_CHAT_ID;    // stringa
    const isAdmin      = String(chatId) === String(adminChatId);

    if (!botToken) {
      console.log("TELEGRAM_BOT_TOKEN non configurato nel Worker");
      return new Response("Bot token mancante", { status: 500 });
    }

    // Helper per sendMessage
    async function sendMessage(id, txt) {
      const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id, text: txt })
      });
      if (!res.ok) {
        const err = await res.text();
        console.log("Errore sendMessage:", res.status, err);
      }
    }

    // ================================
    // Inoltro all'admin (solo se NON è l'admin che scrive)
    // ================================
    if (adminChatId && !isAdmin) {
      const senderName =
        from.username || from.first_name || from.last_name || "unknown";

      const info =
        `📩 Nuovo messaggio al bot\n` +
        `👤 Da: ${senderName}\n` +
        `🆔 Chat ID: ${chatId}\n\n` +
        `💬 Testo:\n${text}`;

      await sendMessage(adminChatId, info);
      // NON ritorno qui: posso ancora gestire /start per l'utente normale
    }

    // ================================
    // /start → per tutti
    // ================================
    if (text === "/start") {
      const msg =
        "🎅 Ciao! Sono il bot del Secret Santa.\n\n" +
        "L'organizzatore userà questo bot per inviare gli abbinamenti via Telegram.\n" +
        "Se hai domande, scrivi pure: il tuo messaggio viene inoltrato all'organizzatore.";
      await sendMessage(chatId, msg);
      return new Response("OK", { status: 200 });
    }


    // ================================
    // /help → risposta diversa per admin e utenti
    // ================================
    if (text === "/help") {
      
      let help = "";

      if (isAdmin) {

        help =
          "🎅 Secret Santa Bot — Comandi disponibili\n\n" +
          "👑 Per l'organizzatore\n" +
          "• /hat – avvia l’estrazione Secret Santa\n" +
          "• /list – mostra la lista partecipanti\n" +
          "• /status – mostra lo stato dell’ultimo sorteggio\n" +
          "• /broadcast <msg> – invia un messaggio a tutti\n\n" +
          "👤 Funzioni per i partecipanti\n" +
          "• /start – informazioni sul bot\n" +
          "• Qualsiasi messaggio verrà inoltrato all'organizzatore";

      } else {

        help =
          "🎅 Secret Santa Bot — Comandi disponibili\n\n" +
          "👤 Per i partecipanti\n" +
          "• /start – informazioni sul bot\n" +
          "• Puoi scrivere un messaggio qualsiasi: verrà inoltrato all’organizzatore\n\n" +
          "ℹ️ I comandi avanzati sono riservati all'organizzatore.";

      }

      await sendMessage(chatId, help);
      return new Response("OK", { status: 200 });
    }



    // ===================================================================
    // DA QUI IN POI: SOLO ADMIN PER /hat, /broadcast, /status, /list
    // ===================================================================
    if (!isAdmin) {
      // Se un utente prova a usare comandi admin, glielo diciamo
      if (
        text.startsWith("/hat") ||
        text.startsWith("/broadcast") ||
        text.startsWith("/status") ||
        text.startsWith("/list")
      ) {
        await sendMessage(chatId, "Questo comando è riservato all'organizzatore del Secret Santa.");
      }
      return new Response("OK", { status: 200 });
    }

    // ================================
    // COMANDI ADMIN
    // ================================

    // /list → elenco partecipanti da PARTICIPANTS_JSON
    if (text === "/list") {
      try {
        const participantsJson = env.PARTICIPANTS_JSON || "{}";
        const participants = JSON.parse(participantsJson); // { Nome: "chat_id", ... }

        const names = Object.keys(participants);
        if (!names.length) {
          await sendMessage(adminChatId, "Nessun partecipante configurato in PARTICIPANTS_JSON.");
          return new Response("OK", { status: 200 });
        }

        const body = names.map(n => `• ${n} (${participants[n]})`).join("\n");
        await sendMessage(adminChatId, "👥 Partecipanti:\n\n" + body);
      } catch (e) {
        console.log("Errore /list:", e);
        await sendMessage(adminChatId, "Errore nella lettura di PARTICIPANTS_JSON.");
      }
      return new Response("OK", { status: 200 });
    }

    // /status → legge secret_santa_history.json da GitHub
    if (text === "/status") {
      const repo = env.GITHUB_REPO;
      const ref  = env.GITHUB_REF || "main";

      if (!repo) {
        await sendMessage(adminChatId, "GITHUB_REPO non configurato.");
        return new Response("OK", { status: 200 });
      }

      const historyUrl = `https://raw.githubusercontent.com/${repo}/${ref}/secret_santa_history.json`;

      try {
        const res = await fetch(historyUrl);
        if (!res.ok) {
          await sendMessage(adminChatId, "Impossibile leggere lo storico (secret_santa_history.json).");
          return new Response("OK", { status: 200 });
        }

        const history = await res.json();
        if (!history || !history.length) {
          await sendMessage(adminChatId, "📭 Nessuna estrazione presente nello storico.");
          return new Response("OK", { status: 200 });
        }

        const last = history[0]; // ultima estrazione (in testa)
        const msg =
          "📅 Ultima estrazione:\n\n" +
          `🕒 Data: ${last.date}\n` +
          (last.controlNumber ? `🔐 Numero di controllo: ${last.controlNumber}\n` : "") +
          `🧮 Totale storico: ${history.length} estrazioni (max 3 salvate).`;

        await sendMessage(adminChatId, msg);
      } catch (e) {
        console.log("Errore /status:", e);
        await sendMessage(adminChatId, "Errore nel recupero dello storico.");
      }

      return new Response("OK", { status: 200 });
    }

    // /broadcast <messaggio> → invia a tutti i partecipanti di PARTICIPANTS_JSON
    if (text.startsWith("/broadcast")) {
      const payload = text.replace("/broadcast", "").trim();
      if (!payload) {
        await sendMessage(adminChatId, "Uso: /broadcast messaggio_da_inviare");
        return new Response("OK", { status: 200 });
      }

      try {
        const participantsJson = env.PARTICIPANTS_JSON || "{}";
        const participants = JSON.parse(participantsJson);

        const names = Object.keys(participants);
        if (!names.length) {
          await sendMessage(adminChatId, "Nessun partecipante in PARTICIPANTS_JSON.");
          return new Response("OK", { status: 200 });
        }

        for (const name of names) {
          const pid = participants[name];
          await sendMessage(
            pid,
            `📢 Messaggio dall'organizzatore del Secret Santa:\n\n${payload}`
          );
        }

        await sendMessage(adminChatId, "Broadcast inviato a tutti i partecipanti.");
      } catch (e) {
        console.log("Errore /broadcast:", e);
        await sendMessage(adminChatId, "Errore nell'uso di PARTICIPANTS_JSON per il broadcast.");
      }

      return new Response("OK", { status: 200 });
    }

    // /hat → trigger workflow GitHub (SecretSanta.ps1)
    if (text === "/hat") {
      const repo   = env.GITHUB_REPO;
      const wfFile = env.GITHUB_WORKFLOW;
      const ref    = env.GITHUB_REF || "main";

      if (!repo || !wfFile || !env.GITHUB_TOKEN) {
        await sendMessage(adminChatId, "Configurazione GitHub incompleta (GITHUB_REPO/GITHUB_WORKFLOW/GITHUB_TOKEN).");
        return new Response("OK", { status: 200 });
      }

      const ghUrl = `https://api.github.com/repos/${repo}/actions/workflows/${wfFile}/dispatches`;

      try {
        const ghRes = await fetch(ghUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "User-Agent": "secret-santa-bot-worker",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ ref })
        });

        if (!ghRes.ok) {
          const err = await ghRes.text();
          console.log("GitHub error:", ghRes.status, err);
          await sendMessage(adminChatId, "❌ Errore nell'avviare l'estrazione.");
        } else {
          await sendMessage(adminChatId, "🎩 Estrazione Secret Santa avviata tramite GitHub Actions.");
        }
      } catch (e) {
        console.log("Exception GitHub dispatch:", e);
        await sendMessage(adminChatId, "⚠️ Errore interno nell'avvio dell'estrazione.");
      }

      return new Response("OK", { status: 200 });
    }

    // Nessun comando admin riconosciuto → OK
    return new Response("OK", { status: 200 });
  }
};
