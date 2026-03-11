# termbank

Terminal-based knowledge bank CLI powered by Claude AI and Obsidian vault integration.

Build and search your personal knowledge base directly from the terminal — terms, notes, and visual analyses, all stored as Markdown in your Obsidian vault and synced to GitHub.

## Requirements

- [Claude Code](https://claude.ai/code) (CLI must be available as `claude` in PATH)
- Git (for sync)
- An Obsidian vault directory (plain folder with Markdown files is fine)

## Installation

```bash
npm install -g termbank
```

## Setup

```bash
# Point termbank at your Obsidian vault
termbank config set vault /path/to/your/vault

# Enable git sync (optional)
termbank config set git.enabled true
termbank config set git.branch main
```

## Commands

### `add` — Add a term

```bash
termbank add "idempotency"
termbank add                        # interactive prompt
termbank add "CAP theorem" @paper.pdf
```

Claude generates a structured term definition with explanation, examples, related terms, and common mistakes. The term is saved as a Markdown file in `terms/` and bidirectionally linked to related terms already in your vault.

Options:
- `-f, --force` — overwrite if term already exists

---

### `note` — Create a note

```bash
termbank note "System design interview prep"
termbank note                       # interactive prompt
termbank note "API design" @spec.md
```

Creates a free-form note in `notes/` with vault context and auto-linking.

Options:
- `-f, --force` — overwrite if note already exists

---

### `visual` — Analyze an image or diagram

```bash
termbank visual @architecture.png
termbank visual                     # interactive image picker
```

Sends an image to Claude for analysis and saves the result as a term or note in `visuals/`. Useful for whiteboard photos, architecture diagrams, or any visual reference material.

Options:
- `--type <term|note>` — document type to create
- `--title <title>` — set title explicitly
- `-f, --force` — overwrite existing

---

### `list` — List vault contents

```bash
termbank list
termbank list --type note
termbank list --tag distributed-systems
termbank list --category pattern
termbank list --confidence mastered
```

Displays a formatted table of your vault contents. Confidence levels are color-coded (learning → familiar → mastered).

---

### `search` — Search vault

```bash
termbank search "cache"
termbank search "event" --type note
```

Regex-powered search across all vault content — frontmatter fields and body text. Shows matched field and a snippet.

---

### `relate` — Link two terms

```bash
termbank relate "caching" "memoization"
```

Creates bidirectional `[[wiki-links]]` between two existing terms.

---

### `confidence` — Update mastery level

```bash
termbank confidence "idempotency" mastered
```

Valid levels: `learning` · `familiar` · `mastered`

---

### `update` — Re-enrich a term with Claude

```bash
termbank update "idempotency"
```

Sends the existing term back to Claude for enrichment. Preserves created timestamp and confidence level.

---

### `sync` — Sync vault to GitHub

```bash
termbank sync
termbank sync --pull-only
```

Commits all vault changes (terms, notes, visuals, and Obsidian metadata) and pushes to the configured remote branch. Uses `--pull-only` to fetch without pushing.

---

### `config` — Manage configuration

```bash
termbank config show
termbank config get vault
termbank config set language en
termbank config set git.autoSync true
```

## Configuration Reference

| Key | Default | Description |
|-----|---------|-------------|
| `vault` | — | Path to Obsidian vault directory |
| `language` | `tr` | Language for Claude responses |
| `claudePath` | `claude` | Path to Claude CLI binary |
| `maxTurns` | `3` | Max Claude conversation turns |
| `timeout` | `60000` | Claude call timeout (ms) |
| `autoRelate` | `true` | Auto-link related terms on add |
| `vaultContext.enabled` | `true` | Send vault context to Claude |
| `vaultContext.maxTerms` | `50` | Max terms to include as context |
| `git.enabled` | `false` | Enable git sync |
| `git.autoSync` | `false` | Auto-sync after each add |
| `git.branch` | `main` | Remote branch to sync with |

## Vault Structure

```
vault/
├── terms/      ← term definitions
├── notes/      ← free-form notes
└── visuals/    ← images and their analyses
```

## License

MIT
