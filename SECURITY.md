# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.6.x | yes |
| 1.5.x and earlier | no — please update |

## Reporting a vulnerability

Please report privately rather than opening a public issue:

- [Open a private advisory](https://github.com/botstelegram7-cmyk/serena-chess/security/advisories/new)
  (preferred), or
- Telegram **@TechnicalSerena**

Please include what you found, how to reproduce it, and what an attacker
could do with it. You will get a first reply within a few days. Credit in the
release notes if you want it.

## What is in scope

- The relay server in [`server/`](server) — anything that lets a client read
  or affect a game it is not part of, crash the process, or exhaust memory.
- The app — anything that lets a remote peer run code, read local storage
  beyond the game, or escape the WebView.
- The build — anything that causes a credential to be committed or shipped
  where it should not be.

## What is out of scope, and why

**The AI key in the APK.** Any key compiled into an APK is extractable in
about thirty seconds, with public tools, by anyone. This is a property of
shipping software to devices you do not control, not a flaw in this app. The
project treats a shipped key as public:

- the key is never in the repository — `build.sh` injects it from a gitignored
  `local.key` at build time;
- users can replace it with their own in Settings without rebuilding;
- rotate it at any time, and nothing breaks except the old one.

If you redistribute a build with your own key in it, assume that key is
public and budget accordingly.

**Cheating in online play.** The relay does not validate that a move came from
a human rather than an engine, and cannot. Online play is for games with
people you choose. There is no ranked ladder to protect.

**Self-hosted relays.** How you deploy the server is yours. The provided
`render.yaml` and `Dockerfile` do not enable authentication because the relay
has nothing to authenticate.
