// Command trigger: /debugsource
// Usage: /debugsource <channel username>
// Diagnostic only — makes no changes, sends nothing to any destination. Shows what
// the pipeline actually sees for a given source: how many posts were fetched, the
// stored last_seen id, the newest post's raw text, and how many proxy links match.

const lib = require("/_lib");
if (!lib.isOwner()) return;
if (!params) return Bot.sendMessage("`Usage: /debugsource <channel username>`");

const posts = await lib.fetchChannelPosts(params);
const lastSeenKey = "last_id:" + params;
const lastSeen = await db.bot.get(lastSeenKey, 0);

let out = "Fetched " + posts.length + " posts from " + params + "\n";
out += "Stored last_seen id: " + lastSeen + "\n";

if (posts.length > 0) {
  const newest = posts[posts.length - 1];
  out += "Newest post id: " + newest.id + "\n\n";
  out += "Newest post raw text (first 500 chars):\n" + newest.text.slice(0, 500) + "\n\n";
  const matched = lib.extractProxyLinks(newest.text);
  out += "Regex matches in newest post: " + matched.length;
} else {
  out += "No posts parsed at all — check fetchChannelPosts' HTML selectors, the source page may have changed.";
}

Bot.sendMessage("```\n" + out + "\n```");
