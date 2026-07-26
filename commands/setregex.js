// Command trigger: /setregex
// Usage: /setregex <regex pattern>
// Passed straight into new RegExp(...), so don't escape forward slashes — just
// escape things like "." and "?" that are regex-special. Recommended pattern for
// real Telegram MTProto proxy links (skips channel/post URLs entirely):
//   https://t\.me/proxy\?[^\s]+

const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /setregex <regex pattern>`");
try { new RegExp(params); } catch (e) { return Bot.sendMessage("Invalid regex: `" + e.message + "`"); }
await db.bot.set("extract_regex", params);
Bot.sendMessage("Regex saved:\n`" + params + "`");
