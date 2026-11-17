# The Masterminds

A 12-day family advent puzzle site, made by Alexis & Mila.

This repo contains **code only**. All puzzle content, answers (as hashes), letters, final words and household links live in Firestore, protected by `firestore.rules`.

- `play/` — what relatives see (`/play/?h=<household code>`)
- `mastermind/` — admin login, live dashboard, content loader
- `tools/hash.html` — answer → SHA-256 helper
- `firestore.rules` — paste into Firebase console → Firestore → Rules

Pushing to `main` redeploys via GitHub Actions.
