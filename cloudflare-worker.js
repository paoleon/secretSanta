export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const pathSecret = parts[1];

    if (env.TELEGRAM_SECRET && pathSecret !== env.TELEGRAM_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      console.log("Invalid JSON");
      return new Response("Bad JSON", { status: 400 });
    }

    const msg = update.message;
    if (!msg || !msg.text) return new Response("No text", { status: 200 });

    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const from = msg.from;

    if (from?.is_bot) return new Response("Ignore bot", { status: 200 });

    const botToken = env.TELEGRAM_BOT_TOKEN;
    const adminId = parseInt(env.ADMIN_CHAT_ID);

    // Helper: send message
    async function send(chat, text) {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text })
      });
    }

    // ======== Inoltro messaggi all'admin ========
    try {
      const senderName =
        from.username || from.first_name || from.last_name || "sconosciuto";

      await send(
        adminId,
        `📩 *Nuovo messaggio al bot*\n` +
        `👤 Da: ${senderName}\n` +
        `🆔 Chat ID: ${chatId}\n\n` +
        `💬 Messaggio:\n${text}`
      );
    } catch (e) {
      console.log("Errore inoltro admin", e);
    }


    // ====================================================================================
    // 1) /start → chiunque può usarlo
    // ====================================================================================

    if (text === "/start") {
      await send(chatId,
        "🎅 *Benvenuto nel Secret Santa Bot!*\n\n" +
        "Questo bot gestisce l'estrazione automatica del Secret Santa.\n" +
        "I comandi sono disponibili solo per l'organizzatore.\n\n" +
        "Se vuoi parlare con lui, scrivi un messaggio: verrà inoltrato."
      );

      return new Response("OK", { status: 200 });
    }

    // ====================================================================================
    // FUNZIONI SOLO PER ADMIN
    // ====================================================================================

    const isAdmin = chatId === adminId;

    if (!isAdmin) {
      // Utente normale → NON può usare hat, broadcast, list, status
      return new Response("OK", { status: 200 });
    }

    // ----- /list -----
    if (text === "/list") {
      const participants = JSON.parse(env.PARTICIPANTS_JSON); 
      const lista = Object.keys(participants).map(n => `• ${n}`).join("\n");

      await send(chatId, `👥 *Lista partecipanti*\n\n${lista}`);
      return new Response("OK");
    }

    // ----- /status -----
    if (text === "/status") {
      const apiUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/secret_santa_history.json`;

      try {
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error("no history");

        const history = await res.json();

        if (!history.length) {
          await send(chatId, "📭 Nessuna estrazione presente nello storico.");
          return new Response("OK");
        }

        const last = history[0];

        await send(
          chatId,
          `📅 *Ultima estrazione*\n` +
          `🕒 Data: ${last.date}\n` +
          `🔐 Numero di controllo: ${last.controlNumber}\n`
        );

      } catch (e) {
        await send(chatId, "⚠️ Impossibile leggere lo storico.");
      }

      return new Response("OK");
    }

    // ----- /broadcast -----
    if (text.startsWith("/broadcast ")) {
      const msgToAll = text.replace("/broadcast ", "");

      const participants = JSON.parse(env.PARTICIPANTS_JSON);

      for (const name of Object.keys(participants)) {
        const pid = parseInt(participants[name]);
        await send(pid, `📢 *Messaggio dall'organizzatore*:\n\n${msgToAll}`);
      }

      await send(chatId, "📨 Broadcast inviato a tutti.");
      return new Response("OK");
    }

    // ----- /hat -----
    if (text === "/hat") {
      const repo   = env.GITHUB_REPO;
      const wfFile = env.GITHUB_WORKFLOW;
      const ref    = env.GITHUB_REF || "main";

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

        if (ghRes.ok) {
          await send(chatId, "🎩 Estrazione Secret Santa avviata!");
        } else {
          await send(chatId, "❌ Errore avvio estrazione.");
        }
      } catch (e) {
        await send(chatId, "⚠️ Errore interno.");
      }

      return new Response("OK");
    }

    return new Response("OK");
  }
};
