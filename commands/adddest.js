// Command trigger: /adddest
// Usage: /adddest telegram|bale|rubika <token> <chat_id>
// For Telegram channels, chat_id needs the "@" prefix (e.g. @yourchannel) unless
// you're using the numeric channel id.

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
