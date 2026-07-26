# porok30 Forwarder
a mechanism which i call [Read(review),Modify,Send]
A Telegram bot that watches public channels , wraps them in
a nicely formatted post with a rotating quote, and forwards them — with clickable
"Proxy 1 / Proxy 2 / ..." buttons — to one or more destination channels across
Telegram, Bale, and Rubika.

Built to run on **[TeleBotHost](https://telebothost.com)**, a free hosting
platform for Telegram bots using their own scripting language, **TBL** (plain
JavaScript with some built-in extras: `Bot`, `HTTP`, `db`, `Webhook`, etc). This
repo is not a standalone app you `npm install` and run — it's a set of TBL command
scripts you paste into the TeleBotHost dashboard. See `docs/SETUP.md` for the full
walkthrough.

## What it does

1. Polls one or more **public** Telegram channels (no admin rights needed — it
   reads the public `t.me/s/<channel>` preview page).
2. Extracts real MTProto proxy links (`https://t.me/proxy?...`) from each new post
   — plain channel/post URLs are ignored.
3. Skips any post that doesn't contain a real proxy link — no proxy, no forward.
4. Builds a message using a customizable template plus a rotating quote pulled
   from a Persian quotes dataset.
5. Sends it to any mix of Telegram, Bale, and Rubika destinations, with each
   proxy link as its own clickable inline button.
6. Runs on a schedule via an external trigger (GitHub Actions workflow included),
   since TeleBotHost has no built-in cron.

## Repo structure

```
commands/                    — one file per TBL command, paste each into the
                                TeleBotHost dashboard under a command with the
                                matching name (see the comment at the top of
                                each file for its trigger)
  _lib.js                     shared helper functions, imported by everything else
  start.js                    /start
  addsource.js                /addsource
  removesource.js             /removesource
  adddest.js                  /adddest
  removedest.js               /removedest
  setregex.js                 /setregex
  settemplate.js               /settemplate
  setlink.js                  /setlink
  setquoteapi.js               /setquoteapi
  status.js                   /status
  pull_sources.js              /pull_sources — the actual pipeline
  handle_channel_post.js       optional push-based path for channels you admin
  getwebhook.js                one-off command to get your webhook URL
  resetsource.js               rewind a source's dedup counter for retries
  debugsource.js               non-destructive diagnostics for a given source

.github/workflows/
  poll-sources.yml            GitHub Actions job that triggers /pull_sources
                               every 5 minutes

docs/
  SETUP.md                    full setup walkthrough, command reference, and
                               troubleshooting notes
```

## Quick start

See [`docs/SETUP.md`](docs/SETUP.md) for the complete guide. Short version:

1. Create a bot with @BotFather, add it to [TeleBotHost](https://telebothost.com).
2. Set `ADMIN_ID` in the bot's Environment Variables to your own numeric Telegram
   user id.
3. Create one TeleBotHost command per file in `commands/`, matching the trigger
   name in that file's header comment.
4. Configure via chat: `/addsource`, `/adddest`, `/setregex`, `/setlink`, etc.
5. Run `/getwebhook` once to get your callable URL, add it as a GitHub Actions
   secret (`PULL_SOURCES_WEBHOOK_URL`), push this repo's workflow file.

Want to run more than one forwarder? Just repeat the whole setup under a new
BotFather token — nothing here is shared state between bots.

## Credit / follow

Config and quirks documented here came out of getting this running for
**[@prox30new](https://t.me/prox30new)** — feel free to check it out. 🙂

## License

Use it, fork it, adapt it — no restrictions.
