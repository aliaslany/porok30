// Command trigger: /status
// Shows current sources, destinations, regex, template, link, and quote API.

const lib = require("/_lib");
if (!lib.isOwner()) return;
const cfg = await lib.getConfig();
let out = "Sources:\n" + (cfg.sources.join("\n") || "(none)") + "\n\n";
out += "Destinations:\n" +
  (cfg.destinations.map((d, i) => i + ": " + d.platform + " -> " + d.chat_id).join("\n") || "(none)") +
  "\n\n";
out += "Regex: " + cfg.extract_regex + "\n";
out += "Template: " + cfg.template + "\n";
out += "Link: " + cfg.my_link + "\n";
out += "Quote API: " + cfg.quote_api;
Bot.sendMessage("```\n" + out + "\n```");
