# porok30 Forwarder — TeleBotHost / TBL Build

Full setup walkthrough and command reference. Built specifically for
**[TeleBotHost](https://telebothost.com)** (TBL scripting language) — see the
main [README](../README.md) for a repo overview, or `commands/` for each command's
code as standalone files instead of the copy-paste blocks below.

One bot = one forwarder identity (per your choice). To run "endless" forwarders,
repeat this exact setup under a new BotFather token for each one — same commands,
different config (config lives in that bot's own `db.bot` storage, so bots never
collide with each other).

## Prereqs
1. Create the bot with @BotFather, grab the token, add it in the TeleBotHost console.
2. In the bot's Environment Variables, set `ADMIN_ID` to your own numeric Telegram
   user id (message @userinfobot to get it, or check /whoami-style output if you
   already have any command replying with `user.id`). This is what gates every
   config command to just you.
3. Add this bot as **admin** in every source Telegram channel you administer (only
   needed for the optional `/handle_channel_post` path — the polling path below
   doesn't require this).
4. In the TeleBotHost dashboard → your bot → Commands tab, create one command per
   section below. The command **name** is the heading (e.g. `/addsource`); the code
   block goes in that command's **Logic** field.

---

## `/_lib` (shared helpers — never triggered directly, just imported)

```js
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
```

---

## `/getwebhook` (run once, then you can delete this command)

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
const url = Webhook.getUrl("/pull_sources", {});
Bot.sendMessage("`" + url + "`");
```

The URL this returns is what goes into GitHub Actions/cron-job.org instead of the
API-key-based approach. Since it's signed and tied to your account, hitting it
repeatedly from an external cron should just work without needing to re-generate it —
but confirm it doesn't expire by testing it once manually (paste the URL in a browser
or `curl` it) before wiring up the scheduler.

---

## `/resetsource`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
const parts = (params || "").trim().split(/\s+/);
if (parts.length < 2) return Bot.sendMessage("`Usage: /resetsource <channel> <id_to_rewind_to>`");
const [channel, idStr] = parts;
const id = parseInt(idStr, 10);
if (isNaN(id)) return Bot.sendMessage("Second argument must be a number.");
await db.bot.set("last_id:" + channel, id);
Bot.sendMessage("last_seen for " + channel + " set to " + id + ". Posts above that id will be retried on the next /pull_sources run.");
```

To force a retry of the stuck post `57234` from your `/debugsource` output:
```
/resetsource @iroproxy 57233
```
Then manually trigger `/pull_sources` and check the logs (the updated version above
now logs every send attempt via `Bot.inspect`) to see the actual success/failure
reason this time — that'll tell us definitively whether `@prox30new` is misconfigured
or something else is wrong.

---

## `/debugsource` (diagnostic only — makes no changes, sends nothing)

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /debugsource <channel username>`");

const posts = await lib.fetchChannelPosts(params);
const lastSeenKey = "last_id:" + params;
const lastSeen = await db.bot.get(lastSeenKey, 0);

let out = "Fetched " + posts.length + " posts from " + params + "\n";
out += "Stored last_seen id: " + lastSeen + "\n";

if (posts.length > 0) {
  const newest = posts[posts.length - 1];
  out += "Newest post id: " + newest.id + "\n\n";
  out += "Newest post raw text (first 500 chars):\n" + newest.text.slice(0, 500) + "\n\n";
  const cfg = await lib.getConfig();
  const matched = lib.extractProxyLinks(newest.text);
  out += "Regex matches in newest post: " + matched.length;
} else {
  out += "No posts parsed at all — check fetchChannelPosts' HTML selectors, the source page may have changed.";
}

Bot.sendMessage("```\n" + out + "\n```");
```

Run `/debugsource iroproxy` and paste back what it says — specifically whether
"Newest post id" is higher than "Stored last_seen id" (tells us if there's actually
anything new to send), and what the raw text looks like (tells us if the proxy link
format matches the regex).

---

## `/start`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return Bot.sendMessage("This bot is privately configured.");
Bot.sendMessage(
  "porok30 forwarder is alive.\n\nSetup commands:\n" +
  "`/addsource <channel_id or @username>`\n" +
  "`/adddest telegram|bale|rubika <token> <chat_id>`\n" +
  "`/setregex <regex>`\n" +
  "`/settemplate <text with {data} {quote} {link}>`\n" +
  "`/setlink <your channel link>`\n" +
  "`/setquoteapi <api url>`\n" +
  "/status"
);
```

---

## `/addsource`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /addsource <public channel username, e.g. iRoProxy>`");
const cfg = await lib.getConfig();
if (!cfg.sources.includes(params)) cfg.sources.push(params);
await db.bot.set("sources", cfg.sources);
Bot.sendMessage("Source added: " + params + "\nMust be a PUBLIC channel (has a @username) — private channels can't be scraped this way.");
```

> Note: with the polling approach below, the bot no longer needs to be a member or
> admin of the source channel at all — just give it the public username.

---

## `/removesource`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
const cfg = await lib.getConfig();
cfg.sources = cfg.sources.filter(s => s !== params);
await db.bot.set("sources", cfg.sources);
Bot.sendMessage("Removed (if it existed): " + params);
```

---

## `/adddest`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
const parts = (params || "").trim().split(/\s+/);
if (parts.length < 3) return Bot.sendMessage(
  "`Usage: /adddest telegram|bale|rubika <token> <chat_id>`"
);
const [platform, token, chatId] = parts;
if (!["telegram", "bale", "rubika"].includes(platform)) {
  return Bot.sendMessage("Platform must be telegram, bale or rubika");
}
const cfg = await lib.getConfig();
cfg.destinations.push({ platform, token, chat_id: chatId });
await db.bot.set("destinations", cfg.destinations);
Bot.sendMessage("Destination added: " + platform + " -> " + chatId);
```

---

## `/removedest`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
const idx = parseInt(params, 10);
const cfg = await lib.getConfig();
if (isNaN(idx) || !cfg.destinations[idx]) return Bot.sendMessage("Give a valid index from /status");
cfg.destinations.splice(idx, 1);
await db.bot.set("destinations", cfg.destinations);
Bot.sendMessage("Removed.");
```

---

## `/setregex`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /setregex <regex pattern>`");
try { new RegExp(params); } catch (e) { return Bot.sendMessage("Invalid regex: `" + e.message + "`"); }
await db.bot.set("extract_regex", params);
Bot.sendMessage("Regex saved:\n`" + params + "`");
```

---

## `/settemplate`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /settemplate <text using {data} {quote} {link}>`");
await db.bot.set("template", params);
Bot.sendMessage("Template saved.");
```

---

## `/setlink`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
await db.bot.set("my_link", params || "");
Bot.sendMessage("Link saved:\n`" + params + "`");
```

---

## `/setquoteapi`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
await db.bot.set("quote_api", params || "");
Bot.sendMessage("Quote API saved:\n`" + params + "`");
```

---

## `/status`

```js
const lib = require("/_lib");
if (!lib.isOwner()) return;
const cfg = await lib.getConfig();
let out = "Sources:\n" + (cfg.sources.join("\n") || "(none)") + "\n\n";
out += "Destinations:\n" +
  (cfg.destinations.map((d, i) => i + ": " + d.platform + " -> " + d.chat_id).join("\n") || "(none)") +
  "\n\n";
out += "Regex: " + cfg.extract_regex + "\n";
out += "Template: " + cfg.template + "\n";
out += "Link: " + cfg.my_link + "\n";
out += "Quote API: " + cfg.quote_api;
Bot.sendMessage("```\n" + out + "\n```");
```

---

## `/poll_sources` — the actual pipeline (polling-based, no admin needed)

This is the command you'll bind to an external webhook trigger (see "Scheduling"
below), since it needs to run on a timer, not in response to a Telegram update.

```js
const lib = require("/_lib");
const cfg = await lib.getConfig();

// TBL disallows creating promises inside a loop, so this must stay sequential —
// fine for a small number of sources/destinations, but it does mean total run
// time is the sum of every fetch/send, not the max. Keep this in mind if the
// 15s command timeout comes back once you add more sources.
for (const source of cfg.sources) {
  const lastSeenKey = "last_id:" + source;
  let lastSeen = await db.bot.get(lastSeenKey, 0);

  const posts = await lib.fetchChannelPosts(source);
  const newPosts = posts.filter(p => p.id > lastSeen);

  for (const post of newPosts) {
    const proxyLinks = lib.extractProxyLinks(post.text);

    if (proxyLinks.length > 0) {
      const quote = await lib.getQuote(cfg.quote_api);
      const finalText = lib.buildMessage(cfg.template, quote, cfg.my_link);

      let anySucceeded = false;
      for (const dest of cfg.destinations) {
        const result = await lib.sendToDestination(dest, finalText, proxyLinks);
        const ok = result && result.ok !== false; // HTTP.post-style responses expose .ok
        Bot.inspect(
          source + " post " + post.id + " -> " + dest.platform + ":" + dest.chat_id +
          " = " + (ok ? "OK" : "FAILED: " + JSON.stringify(result))
        );
        if (ok) anySucceeded = true;
      }

      // only mark this post as seen if it actually went out somewhere — a failed
      // send (bad token, bot not admin, wrong chat id, etc.) now gets retried on
      // the next run instead of silently vanishing forever.
      if (anySucceeded) {
        lastSeen = post.id;
        await db.bot.set(lastSeenKey, lastSeen);
      } else {
        Bot.inspect(source + " post " + post.id + ": all sends failed, will retry next run");
        break; // stop processing this source's newer posts until this one is fixed
      }
    } else {
      // no real proxy links — legitimately skip, this one really is "seen"
      lastSeen = post.id;
      await db.bot.set(lastSeenKey, lastSeen);
    }
  }
}

Bot.inspect("poll_sources ran " + new Date().toISOString());
```

## `/handle_channel_post` (optional — only useful for channels you DO administer)

```js
const lib = require("/_lib");
const cfg = await lib.getConfig();

const sourceKey = String(chat.id);
const sourceUsername = chat.username ? ("@" + chat.username) : null;
const isKnownSource = cfg.sources.includes(sourceKey) || (sourceUsername && cfg.sources.includes(sourceUsername));
if (!isKnownSource) return;

const text = message.text || message.caption || "";
const proxyLinks = lib.extractProxyLinks(text);
if (proxyLinks.length === 0) return; // no real proxy links, skip entirely

const quote = await lib.getQuote(cfg.quote_api);
const finalText = lib.buildMessage(cfg.template, quote, cfg.my_link);

for (const dest of cfg.destinations) {
  await lib.sendToDestination(dest, finalText, proxyLinks);
}
```

---

## Scheduling `/pull_sources` (TeleBotHost has no built-in cron)

The real callable URL for this bot, generated via `/getwebhook`, looks like:
```
https://webapp.telebothost.com/ownlang/webhook/468621946003853?command=pull_sources&sig=...&user=...
```

Create `.github/workflows/poll-sources.yml` in a repo:

```yaml
name: Poll Telegram Sources

on:
  schedule:
    - cron: "*/5 * * * *"   # every 5 minutes — GitHub Actions' minimum interval
  workflow_dispatch: {}      # lets you trigger it manually from the Actions tab too

jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger /pull_sources webhook
        run: |
          curl -sS --max-time 20 -o /dev/null -w "HTTP %{http_code}\n" \
            "${{ secrets.PULL_SOURCES_WEBHOOK_URL }}"
```

Setup:
1. In the repo → Settings → Secrets and variables → Actions → **New repository secret**,
   name it `PULL_SOURCES_WEBHOOK_URL`, and paste the full URL from `/getwebhook` as the
   value. Don't put the URL directly in the YAML — it's signed and tied to your
   account, so treat it like a credential, especially if the repo is public.
2. Commit the workflow file and push.
3. Check the Actions tab — you can run it once manually via "Run workflow"
   (workflow_dispatch) to confirm it fires `/pull_sources` before waiting on the
   schedule.

Reminder from earlier: GitHub Actions' `schedule:` trigger is best-effort, not
exact-time — expect occasional delays past the 5-minute mark, especially during
GitHub's peak load periods. If you ever need tighter/more reliable timing than GH
Actions can guarantee, [cron-job.org](https://cron-job.org) hitting the same secret
URL is the lower-latency alternative — same setup, just paste the URL into their
dashboard instead of a GitHub secret.

---

## Things to verify once you're actually testing (I couldn't run TBL myself)

1. **`message`/`chat` globals on channel posts** — I'm assuming TBL populates the same
   `message` and `chat` globals for `/handle_channel_post` as it does for normal messages.
   Confirm the exact fields at https://docs.telebothost.com/globals/message/ and
   /globals/chat/ — if the shape differs, adjust `/handle_channel_post` and `/_lib`
   accordingly.
2. **majidapi response shape** — hit `https://api.majidapi.ir/fun/sokhan?token=YOUR_TOKEN`
   once yourself and see what key the quote text actually comes back under, then fix
   `getQuote()` in `/_lib`.
3. **Free tier request limits** — TeleBotHost's free tier has a request cap; if you're
   running many of these bots and each source channel posts often, keep an eye on usage
   per bot in the dashboard.
4. Bale endpoint (`tapi.bale.ai`) and Rubika endpoint (`messengerg2b1.iranlms.ir/v3/`)
   are both plain REST — no bot-specific TeleBotHost support needed, this is just an
   HTTP POST, so it should work as-is, but test a `sendMessage` call against each once
   before relying on it.
5. **`res.data` shape for an HTML page** — `HTTP.get` examples in TBL's docs are all
   JSON APIs (`res.data.status`). For `https://t.me/s/<channel>`, confirm `res.data` is
   the raw HTML string (it should be, but check the [Responses doc](https://docs.telebothost.com/http-instance/responses/) once) before passing it into `modules.cheerio.load()`.
6. **`.tgme_widget_message` / `.tgme_widget_message_text` class names** — these are
   Telegram's current public-preview markup as of now; if Telegram changes their HTML
   structure later, `fetchChannelPosts()` will need its selectors updated. Test it on
   `iRoProxy` directly and print a `Bot.inspect(JSON.stringify(posts))` to sanity-check
   before wiring it to real sends.

## How to add a new forwarder later
Spin up a new bot in TeleBotHost with a new BotFather token, paste in this exact same
set of commands, then configure it fresh with `/addsource`, `/adddest`, `/setregex`,
etc. Nothing here is shared state between bots — each one is fully independent.

---

This setup was built running a live forwarder for
[@prox30new](https://t.me/prox30new) — feel free to check it out. 🙂
