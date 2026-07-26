// Command trigger: /setquoteapi
// Usage: /setquoteapi <api url>
// Defaults to a static Persian quotes JSON dataset if you never set this — see
// getQuote() in _lib.js. Any array of {body, author} objects works as a drop-in
// replacement.

const lib = require("/_lib");
if (!lib.isOwner()) return;
await db.bot.set("quote_api", params || "");
Bot.sendMessage("Quote API saved:\n`" + params + "`");
