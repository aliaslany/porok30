// Command trigger: /removedest
// Usage: /removedest <index> — get the index from /status. Indices shift after a
// removal, so re-check /status between removals if deleting more than one.

const lib = require("/_lib");
if (!lib.isOwner()) return;
const idx = parseInt(params, 10);
const cfg = await lib.getConfig();
if (isNaN(idx) || !cfg.destinations[idx]) return Bot.sendMessage("Give a valid index from /status");
cfg.destinations.splice(idx, 1);
await db.bot.set("destinations", cfg.destinations);
Bot.sendMessage("Removed.");
