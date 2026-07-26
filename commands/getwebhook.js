// Command trigger: /getwebhook
// Run once to get the callable URL for /pull_sources, then you can delete this
// command. The URL is signed/tied to your account — store it like a credential.

const lib = require("/_lib");
if (!lib.isOwner()) return;
const url = Webhook.getUrl("/pull_sources", {});
Bot.sendMessage("`" + url + "`");
