// Command trigger: /start

const lib = require("/_lib");
if (!lib.isOwner()) return Bot.sendMessage("This bot is privately configured.");
Bot.sendMessage(
  "porok30 forwarder is alive.\n\nSetup commands:\n" +
  "`/addsource <channel_id or @username>`\n" +
  "`/adddest telegram|bale|rubika <token> <chat_id>`\n" +
  "`/setregex <regex>`\n" +
  "`/settemplate <text with {data} {quote} {link}>`\n" +
  "`/setlink <your channel link>`\n" +
  "`/setquoteapi <api url>`\n" +
  "/status"
);
