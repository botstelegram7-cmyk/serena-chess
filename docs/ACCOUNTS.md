# Accounts, sign-in and keeping your progress

Short version: **there is no account, and you never need one.** The app opens
straight into a game. Your name, rating, games and settings live on your
phone. Nothing is uploaded anywhere.

This page explains why it works that way, and what to do if you want
sign-in anyway.

---

## Why there is no login

"Log in" usually bundles two different things together. They are worth
separating, because only one of them actually needs an account:

1. **Identity** — the name and picture shown next to your moves.
2. **Continuity** — not losing your rating and games when you change phone.

Serena Chess has no backend. That is deliberate: there is no server to pay
for, nothing to breach, no database of players to leak, and the app keeps
working if the project is abandoned tomorrow. Given that, a login would not
be authenticating you *against* anything — there is nothing on the other side
to check a password with. It would be decoration.

So identity is handled by just letting you set a name and a picture, and
continuity is handled properly, below.

## How your progress is kept safe

**Android already backs this app up to your Google account.** If you sign in
to a new phone with the same Google account, your games, rating, puzzle
history and settings come back during setup. This is Android Auto Backup; it
needs no code from us beyond declaring what to include, which is in
[`res/xml/backup_rules.xml`](../res/xml/backup_rules.xml). In practice this is
"log in with Google" — handled by the operating system, which already has
your credentials and does not need to share them with us.

**Export a backup file** for everything else: moving to a phone that is not
being set up fresh, keeping a copy before experimenting, or just owning your
data. Settings → Account & backup → *Export a backup*. You get a plain,
readable JSON file.

Restoring validates before it writes anything. A file that is not a backup, is
damaged, or came from a newer version of the app is refused with a reason
rather than half-applied. You are shown whose data it is — name, rating, game
count, date — and asked to confirm before anything is replaced.

**Your API key is never in a backup.** It is a credential, not a preference,
so it is stripped on export and the key already on the receiving device is
kept on import.

## Google sign-in

Optional, off by default, and it only fills in your name and picture.

It is implemented as OAuth 2.0 with PKCE in the system browser — no Google
Play Services dependency, no client secret in the app. It stays hidden until
an owner supplies an OAuth client id, because a sign-in button that always
fails is worse than no button.

To switch it on:

1. Create a project in the Google Cloud console.
2. Configure the OAuth consent screen.
3. Create an **Android** OAuth client with package name `com.serena.chess`
   and the signing certificate SHA-1 of your build.
4. Paste the client id (`…apps.googleusercontent.com`) into Settings.

Be clear about what this does and does not do. It does **not** sync anything,
because there is nowhere to sync to. The identity token is read only for the
display name, email and picture; it is not treated as proof of anything,
because with no backend there is nothing to prove it to. Claiming otherwise
would be security theatre.

## Why there is no Facebook login

Not an oversight — it was considered and rejected:

- **Facebook blocks OAuth inside embedded WebViews.** The documented path is
  the native Facebook SDK, which means pulling a large closed-source
  dependency into an app that currently builds from source with no third-party
  libraries at all.
- **It needs app review.** Shipping it means submitting the project to Meta
  for approval and maintaining that relationship, for a single-player chess
  app that has no social features.
- **It would add nothing.** The only things it could supply are a name and a
  picture, which you can already set in two taps — and it would hand a
  tracking company a list of who plays.

If you fork this and genuinely need it, the account module is small and
self-contained: [`assets/js/account.js`](../assets/js/account.js).

## What is stored, and where

Everything is in the app's own private storage on your device:

| Key | What it holds |
|---|---|
| `chess.profile` | name, picture, rating |
| `chess.stats` | wins, losses, draws |
| `chess.archive` | your last 40 games |
| `chess.settings` | themes, time control, preferences |
| `chess.puzzles` | puzzle rating and per-theme history |
| `chess.daily` | daily puzzle streak |
| `chess.ladder` | which characters you have beaten |
| `chess.achievements` | what you have unlocked |
| `chess.account` | guest id, or Google profile fields if signed in |

No analytics, no telemetry, no crash reporting, no advertising id. The only
network traffic the app makes is bot chat (if you enable it and supply a key)
and online play (if you use it).
