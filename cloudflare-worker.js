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

    const from = message.from;
    const text = message.text.trim();
    const chatId = message.chat.id;

    // Evita loop: ignora i messaggi inviati dal bot stesso
    if (from && from.is_bot) {
      return new Response("Ignore bot messages", { status: 200 });
    }

    // ===============================
    // 1) INOLTRO AL TUO ADMIN_CHAT_ID
    // ===============================
    if (env.TELEGRAM_BOT_TOKEN && env.ADMIN_CHAT_ID) {
      const senderName =
        (from && (from.username || from.first_name || from.last_name)) ||
        "unknown";

      const adminText =
        `Nuovo messaggio al bot:\n` +
        `Da: ${senderName}\n` +
        `Chat ID: ${chatId}\n\n` +
        `Testo:\n${text}`;

      try {
        const tgUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const body = {
          chat_id: env.ADMIN_CHAT_ID,
          text: adminText
        };

        const res = await fetch(tgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errText = await res.text();
          console.log("Errore inoltro admin:", res.status, errText);
        }
      } catch (e) {
        console.log("Exception inoltro admin:", e);
      }
    }

    // ===============================
    // 2) TRIGGER GITHUB ACTIONS (/run, /start)
    // ===============================
    if (
      text === "/run" ||
      text === `/run@${env.BOT_USERNAME}` ||
      text === "/start" ||
      text === `/start@${env.BOT_USERNAME}`
    ) {
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
          // Non blocchiamo Telegram, rispondiamo comunque 200
        } else {
          console.log("GitHub workflow dispatched for ref:", ref);
        }
      } catch (e) {
        console.log("Exception GitHub dispatch:", e);
      }
    }

    // Telegram vuole sempre 200 OK
    return new Response("OK", { status: 200 });
  }
}
