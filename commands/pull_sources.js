// Command trigger: /pull_sources
// The actual pipeline (polling-based, no admin needed on source channels).
// This is the command bound to an external webhook trigger (see README's
// "Scheduling" section) — GitHub Actions or cron-job.org calls it on a timer.

const lib = require("/_lib");
const cfg = await lib.getConfig();

// TBL disallows creating promises inside a loop, so this stays sequential — fine
// for a small number of sources/destinations, but total run time is the sum of
// every fetch/send, not the max. Keep this in mind if you hit the 15s command
// timeout once you add more sources.
for (const source of cfg.sources) {
  const lastSeenKey = "last_id:" + source;
  let lastSeen = await db.bot.get(lastSeenKey, 0);

  const posts = await lib.fetchChannelPosts(source);
  const newPosts = posts.filter(p => p.id > lastSeen);

  for (const post of newPosts) {
    const proxyLinks = lib.extractProxyLinks(post.text);

    if (proxyLinks.length > 0) {
      const quote = await lib.getQuote(cfg.quote_api);
      const finalText = lib.buildMessage(cfg.template, quote, cfg.my_link);

      let anySucceeded = false;
      for (const dest of cfg.destinations) {
        const result = await lib.sendToDestination(dest, finalText, proxyLinks);
        const ok = result && result.ok !== false; // HTTP.post-style responses expose .ok
        Bot.inspect(
          source + " post " + post.id + " -> " + dest.platform + ":" + dest.chat_id +
          " = " + (ok ? "OK" : "FAILED: " + JSON.stringify(result))
        );
        if (ok) anySucceeded = true;
      }

      // only mark this post as seen if it actually went out somewhere — a failed
      // send (bad token, bot not admin, wrong chat id, etc.) now gets retried on
      // the next run instead of silently vanishing forever.
      if (anySucceeded) {
        lastSeen = post.id;
        await db.bot.set(lastSeenKey, lastSeen);
      } else {
        Bot.inspect(source + " post " + post.id + ": all sends failed, will retry next run");
        break; // stop processing this source's newer posts until this one is fixed
      }
    } else {
      // no real proxy links — legitimately skip, this one really is "seen"
      lastSeen = post.id;
      await db.bot.set(lastSeenKey, lastSeen);
    }
  }
}

Bot.inspect("pull_sources ran " + new Date().toISOString());
