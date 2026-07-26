// Command trigger: /setlink
// Usage: /setlink <your channel link>

const lib = require("/_lib");
if (!lib.isOwner()) return;
await db.bot.set("my_link", params || "");
Bot.sendMessage("Link saved:\n`" + params + "`");
