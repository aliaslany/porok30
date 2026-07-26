// Command trigger: /handle_channel_post (TBL's dynamic command handler — fires
// automatically on new channel posts, no manual trigger needed)
//
// OPTIONAL — only useful for source channels you actually administer, since it
// relies on Telegram pushing the update to a bot that's an admin there. For
// channels you don't own, use /pull_sources (polling) instead.

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
