export default {
  async fetch(request, env, ctx) {
    // Per debug: risponde 200 anche a GET
    if (request.method !== "POST") {
      return new Response("OK (Telegram webhook endpoint)", { status: 200 });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // es: ["webhook", "mio-segreto"]
    const pathSecret = parts.length >= 2 ? parts[1] : null;

    // Controllo "segreto" URL /webhook/<TELEGRAM_SECRET>
    if (env.TELEGRAM_SECRET && pathSecret !== env.TELEGRAM_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    // --- Legge l'update di Telegram ---
    let update;
    try {
      update = await request.json();
    } catch (e) {
      console.log("JSON parse error:", e);
      return new Response("Bad Request", { status: 400 });
    }

    console.log("Telegram update:", JSON.stringify(update));

    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      // Non interessa (sticker, foto, ecc.)
      return new Response("No text message", { status: 200 });
    }

    const from   = message.from;
    const text   = message.text.trim();
    const chatId = message.chat.id;

    // Evita loop: ignora i messaggi inviati dal bot stesso
    if (from && from.is_bot) {
      return new Response("Ignore bot messages", { status: 200 });
    }

    const botToken    = env.TELEGRAM_BOT_TOKEN;
    const adminChatId = env.ADMIN_CHAT_ID;

    // Piccola helper per sendMessage
    async function sendMessage(chatId, text) {
      if (!botToken) {
        console.log("TELEGRAM_BOT_TOKEN non configurato nel Worker");
        return;
      }
      const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const body = {
        chat_id: chatId,
        text: text
      };
      const res = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text();
        console.log("Errore sendMessage:", res.status, errText);
      }
    }

    // ===============================
    // 1) Inoltra SEMPRE all'admin
    // ===============================
    if (adminChatId) {
      const senderName =
        (from && (from.username || from.first_name || from.last_name)) ||
        "unknown";

      const adminText =
        `Nuovo messaggio al bot:\n` +
        `Da: ${senderName}\n` +
        `Chat ID: ${chatId}\n\n` +
        `Testo:\n${text}`;

      try {
        await sendMessage(adminChatId, adminText);
      } catch (e) {
        console.log("Exception inoltro admin:", e);
      }
    }

    // ===============================
    // 2) /start → risposta al chiamante
    // ===============================
    if (text === "/start") {
      const helpText =
        "Ciao! Sono il bot del Secret Santa.\n\n" +
        "• Scrivi /hat per avviare l'estrazione delle coppie.\n" +
        "• Quando l'estrazione parte, riceverai un messaggio con il nome della persona a cui devi fare il regalo.\n\n" +
        "Questo bot è gestito dall'organizzatore del Secret Santa.";

      try {
        await sendMessage(chatId, helpText);
      } catch (e) {
        console.log("Exception risposta /start:", e);
      }

      // Non serve fare altro per /start
      return new Response("OK", { status: 200 });
    }

    // ===============================
    // 3) /hat → trigger GitHub Actions
    // ===============================
    if (text === "/hat") {
      const repo   = env.GITHUB_REPO;      // es: "tuoutente/secretSanta"
      const wfFile = env.GITHUB_WORKFLOW;  // es: "secret-santa.yml"
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

        if (!ghRes.ok) {
          const errText = await ghRes.text();
          console.log("GitHub error:", ghRes.status, errText);
          // feedback al chiamante
          await sendMessage(chatId, "Si è verificato un errore nell'avviare l'estrazione. Contatta l'organizzatore.");
        } else {
          console.log("GitHub workflow dispatched for ref:", ref);
          // feedback al chiamante
          await sendMessage(chatId, "Ho avviato l'estrazione del Secret Santa. Tra poco riceverete i vostri abbinamenti!");
        }
      } catch (e) {
        console.log("Exception GitHub dispatch:", e);
        await sendMessage(chatId, "Errore interno nell'avviare l'estrazione.");
      }

      return new Response("OK", { status: 200 });
    }

    // Altri messaggi (non /start, non /hat) → solo inoltro admin
    return new Response("OK", { status: 200 });
  }
}
