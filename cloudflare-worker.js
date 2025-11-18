export default {
  async fetch(request, env, ctx) {
    // Per debug: risponde 200 anche a GET
    if (request.method !== "POST") {
      return new Response("OK (Telegram webhook endpoint)", { status: 200 });
    }

    // --- Controllo "segreto" nell'URL: /webhook/<secret> ---
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // es: ["webhook", "mio-segreto"]
    const pathSecret = parts.length >= 2 ? parts[1] : null;

    if (env.TELEGRAM_SECRET && pathSecret !== env.TELEGRAM_SECRET) {
      // Qualcuno ha chiamato un URL sbagliato
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
      // Non ci interessa (sticker, foto, ecc.)
      return new Response("No text message", { status: 200 });
    }

    const text = message.text.trim();
    const chatId = message.chat.id;

    // --- Comando che scatena il workflow GitHub ---
    if (text === "/run" || text === "/run@NOME_DEL_TUO_BOT") {
      // Prepara chiamata a GitHub Actions (workflow_dispatch)
      const repo   = env.GITHUB_REPO;      // es: "tuonome/secret-santa"
      const wfFile = env.GITHUB_WORKFLOW;  // es: "secret-santa.yml"
      const ref    = env.GITHUB_REF || "main";

      const ghUrl = `https://api.github.com/repos/${repo}/actions/workflows/${wfFile}/dispatches`;

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
        return new Response("GitHub dispatch error", { status: 500 });
      }

      console.log("GitHub workflow dispatched for ref:", ref);
    }

    // Telegram vuole comunque 200 OK
    return new Response("OK", { status: 200 });
  }
}
