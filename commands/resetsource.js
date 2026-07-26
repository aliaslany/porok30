// Command trigger: /resetsource
// Usage: /resetsource <channel> <id_to_rewind_to>
// Forces the next /pull_sources run to retry posts above the given id for that
// source — useful when a post got marked "seen" despite a failed send.

const lib = require("/_lib");
if (!lib.isOwner()) return;
const parts = (params || "").trim().split(/\s+/);
if (parts.length < 2) return Bot.sendMessage("`Usage: /resetsource <channel> <id_to_rewind_to>`");
const [channel, idStr] = parts;
const id = parseInt(idStr, 10);
if (isNaN(id)) return Bot.sendMessage("Second argument must be a number.");
await db.bot.set("last_id:" + channel, id);
Bot.sendMessage("last_seen for " + channel + " set to " + id + ". Posts above that id will be retried on the next /pull_sources run.");
