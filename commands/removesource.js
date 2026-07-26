// Command trigger: /removesource
// Usage: /removesource <channel> — must match exactly what /addsource stored,
// check /status first if unsure of exact spelling/case.

const lib = require("/_lib");
if (!lib.isOwner()) return;
const cfg = await lib.getConfig();
cfg.sources = cfg.sources.filter(s => s !== params);
await db.bot.set("sources", cfg.sources);
Bot.sendMessage("Removed (if it existed): " + params);
