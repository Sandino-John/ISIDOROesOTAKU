# Repo Hygiene

This repository mixes source code with runtime data and generated output. The goal of this guide is to make it clear what should be versioned and what should stay local to each machine.

## Keep in Git

- Application source: `server.js`, `public/app.js`, `public/index.html`, `public/style.css`
- Inventory module source: `inventario/db.js`, `inventario/routes/*`
- Views/templates: `views/**`
- Dependency manifests: `package.json`, `package-lock.json`
- Stable product assets that are part of the UI, especially image files used by the minibar and room cards

## Do Not Keep in Git

- `node_modules/`
- SQLite databases and journals:
  - `motel23.db`
  - `inventario/inventario.db`
  - `*.db-shm`
  - `*.db-wal`
- Generated reports and backups under `public/Reportes Diarios/`
- Exported PDFs/JSON files dropped into `public/images/`
- Local machine settings such as `.claude/settings.local.json`

## Files That Look Generated or Accidental

These should be reviewed manually before deleting, but they should not be versioned:

- `public/Reportes Diarios/**`
- `public/images/*.pdf`
- `public/images/*.json`
- `public/images/motel23_autobackup_*.json`
- `indexoi.html`

## Working Rule

When a new file appears, classify it before committing:

1. If the app creates it at runtime, keep it local and ignore it.
2. If it is required to run the UI or business logic, keep it in Git.
3. If it is a one-off export, preview, backup, or experiment, keep it out of Git.
