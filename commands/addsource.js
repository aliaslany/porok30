// Command trigger: /addsource
// Usage: /addsource <public channel username, e.g. iRoProxy>
// Must be a PUBLIC channel (has a @username) — private channels can't be scraped.
// No admin/membership needed for the polling pipeline.

const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /addsource <public channel username, e.g. iRoProxy>`");
const cfg = await lib.getConfig();
if (!cfg.sources.includes(params)) cfg.sources.push(params);
await db.bot.set("sources", cfg.sources);
Bot.sendMessage("Source added: " + params + "\nMust be a PUBLIC channel (has a @username) — private channels can't be scraped this way.");
