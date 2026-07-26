// Shared helpers — never triggered directly, imported by other commands via
// require("/_lib"). Paste this into a command named exactly "/_lib" in the
// TeleBotHost dashboard.

async function getConfig() {
  const cfg = await db.bot.mget([
    "sources", "destinations", "extract_regex", "template", "my_link", "quote_api"
  ]);
  return {
    sources: cfg.sources || [],
    destinations: cfg.destinations || [],
    extract_regex: cfg.extract_regex || "(https?:\\/\\/[^\\s]+)",
    template: cfg.template || "{quote}\n\n{link}",
    my_link: cfg.my_link || "",
    // static JSON dataset instead of a live API — nothing to go down. Array of
    // {body, author} objects. Override with /setquoteapi if you find something you
    // like better, as long as it's the same [{body, author}, ...] shape.
    quote_api: cfg.quote_api || "https://huggingface.co/datasets/MaralGPT/persian_quotes/resolve/main/data.json"
  };
}

function isOwner() {
  if (!user) return false;
  // owner.id is a TeleBotHost account id, NOT a Telegram user id — don't compare
  // against it. Set ADMIN_ID in the bot's Environment Variables to your own
  // numeric Telegram user id instead.
  return String(user.id) === String(process.env.ADMIN_ID);
}

function extractData(text, patternStr) {
  if (!text) return [];
  let re;
  try { re = new RegExp(patternStr, "g"); } catch (e) { return []; }
  return text.match(re) || [];
}

async function getQuote(apiUrl) {
  if (!apiUrl) return "";
  const res = await HTTP.get(apiUrl, { timeout: 6000 });
  if (!res.ok) return "";
  const d = res.data;

  if (Array.isArray(d) && d.length > 0) {
    // sequential read, one item per call, wraps back to 0 when it reaches the end.
    // counter is keyed per apiUrl so switching /setquoteapi later doesn't collide
    // with progress on a different source.
    const counterKey = "quote_index:" + apiUrl;
    let idx = await db.bot.get(counterKey, 0);
    if (idx >= d.length) idx = 0;

    const pick = d[idx];
    await db.bot.set(counterKey, idx + 1);

    if (pick && pick.body) {
      return pick.author ? pick.body + "\n— " + pick.author : pick.body;
    }
    return "";
  }

  // fallback shape for non-array quote APIs you might swap in later
  return (d && (d.result || d.text || d.sokhan || d.quote)) || "";
}

function extractProxyLinks(text) {
  // the actual clickable "proxy import" links Telegram recognizes — distinct from
  // plain channel links (t.me/iRoProxy) or post permalinks (t.me/iRoProxy/57220),
  // which should never end up in the message or as buttons.
  if (!text) return [];
  const matches = text.match(/https:\/\/t\.me\/proxy\?[^\s]+/g) || [];
  return [...new Set(matches)]; // dedupe repeats
}

function buildMessage(template, quote, link) {
  // no {data} placeholder anymore — proxy links live only in the button row,
  // never as visible text in the message body.
  return template
    .split("{quote}").join(quote || "")
    .split("{link}").join(link || "");
}

async function sendToDestination(dest, text, proxyLinks) {
  try {
    const buttons = proxyLinks || [];
    const keyboard = {
      inline_keyboard: buttons.map((url, i) => [
        { text: "Proxy " + (i + 1), url: url }
      ])
    };

    if (dest.platform === "telegram") {
      return await HTTP.post("https://api.telegram.org/bot" + dest.token + "/sendMessage", {
        body: {
          chat_id: dest.chat_id,
          text: text,
          disable_web_page_preview: true,
          reply_markup: JSON.stringify(keyboard)
        }
      });
    }
    if (dest.platform === "bale") {
      return await HTTP.post("https://tapi.bale.ai/bot" + dest.token + "/sendMessage", {
        body: { chat_id: dest.chat_id, text: text }
      });
    }
    if (dest.platform === "rubika") {
      return await HTTP.post("https://messengerg2b1.iranlms.ir/v3/" + dest.token + "/sendMessage", {
        body: { chat_id: dest.chat_id, text: text }
      });
    }
    return { ok: false, message: "unknown platform" };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

async function fetchChannelPosts(channelUsername) {
  // Scrapes Telegram's public preview page without cheerio — cheerio breaks inside
  // TBL's sandbox (it tries to reassign a read-only toString on a frozen object).
  const clean = channelUsername.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  const url = "https://t.me/s/" + clean;
  const res = await HTTP.get(url, { timeout: 7000 });
  if (!res.ok) return [];
  const html = String(res.data || "");
  const posts = [];

  const blocks = html.match(
    /<div class="tgme_widget_message[\s\S]*?data-post="[^"]+"[\s\S]*?<\/div>\s*<\/div>/g
  ) || [];

  for (const block of blocks) {
    const dataPostMatch = block.match(/data-post="([^"]+)"/);
    if (!dataPostMatch) continue;
    const dataPost = dataPostMatch[1]; // "channel/12345"
    const id = parseInt(dataPost.split("/")[1], 10);

    const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    let text = "";
    if (textMatch) {
      text = textMatch[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .trim();
    }

    const hrefs = [];
    const hrefRegex = /href="([^"]+)"/g;
    let m;
    while ((m = hrefRegex.exec(block)) !== null) {
      hrefs.push(
        m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
      );
    }

    posts.push({ id, text: text + "\n" + hrefs.join("\n"), url: "https://t.me/" + dataPost });
  }

  posts.sort((a, b) => a.id - b.id); // oldest first, so sends go out in order
  return posts;
}

module.exports = {
  getConfig, isOwner, extractData, extractProxyLinks, getQuote, buildMessage,
  sendToDestination, fetchChannelPosts
};
