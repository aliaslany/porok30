// Command trigger: /settemplate
// Usage: /settemplate <text using {quote} {link}>
// Proxy links are NOT inserted via a placeholder — they only ever appear as the
// inline "Proxy 1 / Proxy 2 / ..." buttons, never as visible text in the body.

const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /settemplate <text using {data} {quote} {link}>`");
await db.bot.set("template", params);
Bot.sendMessage("Template saved.");
