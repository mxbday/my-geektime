# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

My GeekTime is a GeekTime (time.geekbang.org) offline cache and online documentation tool. It caches VIP account data for permanent offline viewing, publishes courses as online doc sites, and downloads audio/video resources. Go backend + React/TypeScript frontend, shipped as a single binary with embedded static assets.

## Build & run

```shell
# Go backend (builds to ./my-geektime)
make build                   # go vet + go build with ldflags

# Frontend (builds to web/ which is embedded in the Go binary)
make web                     # npm install + npm run build, copies dist/* to web/

# Run backend (listens on :8090)
go run main.go server --config=config.yml

# Run frontend dev server (listens on :3000, proxies /v2 to :8090)
cd frontend && npm run dev

# Docker
make image                   # multi-arch buildx + push
cd docker && docker-compose up -d
```

## Lint & test

```shell
golangci-lint run            # Go lint (config: .golangci.yml)
cd frontend && npm run lint  # ESLint + TypeScript
go test ./...                # Run all Go tests
```

## Architecture

### Binary entry point (`main.go`)

Uses `//go:embed` to bundle `i18n/`, `web/`, and `config.yml` into the binary. Calls `cmd.Execute(Assets)`.

### Two run modes (wired in `cmd/cmd.go`)

1. **`server`** (`cmd/api/app.go`) — starts the Gin HTTP server. Initializes DB (GORM), JWT, zap logger, local storage, goroutine pool, timer wheel, i18n, and a resource cache worker. Loads config from embedded `config.yml` or an external file.
2. **`cli`** (`cmd/cli/`) — command-line tools: `cli config` (generate config template), `cli data` (sync GeekTime data to local DB), `cli docs` (generate doc site via storage), `cli docs-local` (local doc site with comments), `cli label`, `cli redirect`.

### Backend layers

```
router/ (Gin routes, v2/ prefix, public vs JWT-protected groups)
  → middleware/ (CORS, JWT auth, timeout, access_token extraction)
    → api/v2/ (handlers: request binding, response formatting)
      → service/ (business logic: GeekTime API calls, downloads, doc generation)
        → model/ (GORM models defined in .proto files)
        → libs/ (utility packages)
```

### Global singletons (`internal/global/`)

Package-level variables used across the backend: `CONF` (parsed config), `DB` (*gorm.DB), `LOG` (*zap.Logger), `JWT`, `Storage` (local filesystem), `GPool` (worker pool), `TW` (timer wheel), `Resource` (background cache worker), `HttpClient` (shared client with cookie jar), `ASSETS` (embedded filesystem). Initialized in `internal/initialize/`.

### Protobuf-defined GORM models (`internal/model/`)

Models (User, Task, Product, Article, ArticleComment, Collect, SysDict, etc.) are defined in `.proto` files with GORM tags embedded in protobuf `moretags` options. Compiled to `.pb.go` via the Makefile in that directory. Soft deletes use a `deleted_at` int64 timestamp (not GORM's built-in soft delete).

### Background task worker (timer wheel + DB polling)

A custom timer wheel (`libs/schedule/`) polls every 10 seconds via `handler/task/download.go`. It picks up pending tasks from the `tasks` table:

- **TASK_TYPE_PRODUCT**: update download statistics for a course.
- **TASK_TYPE_ARTICLE**: fetch article content from GeekTime API, download audio (MP3) or video (HLS/M3U8 → TS segments, AES-128 decrypted), cache resources, rewrite CDN URLs to local paths.

### M3U8/HLS video pipeline (`libs/m3u8/`)

Standalone HLS downloader: `parser.go` (master + media playlist parsing), `downloader.go` (concurrent TS segment download + merge), `crypto.go` (AES-128 decryption). Also usable as a standalone CLI via `cmd/m3u8-downloader/main.go`.

### Doc site generation (`internal/service/docsite.go`)

`DocGenerator` interface with three methods: `MakeDocsite` (online HTML doc site with nav), `MakeDocsiteLocal` (same + comments), `MakeDocArchive` (.tar.gz of Markdown). Uses goldmark for Markdown→HTML, an embedded Go template (`docsite.html.tpl`) for pages, and the `GPool` worker pool for concurrent article processing.

### URL proxy / resource caching

GeekTime CDN resources (static001.geekbang.org) are proxied through `/v2/file/proxy?url={url}`. `service/proxy.go` rewrites `href`/`src` attributes in HTML. `handler/resource/resource.go` caches proxied resources locally.

### Frontend (`frontend/`)

React 18 + TypeScript + Vite. React Router v6 with lazy-loaded pages. Zustand for auth/loading state. Axios with a centralized `request.ts` (token attach, error interceptors). TailwindCSS with dark/light theme support. Key directories: `pages/` (lazy-loaded route pages), `components/` (Layout, UI primitives, business components), `api/` (API client modules), `store/` (Zustand), `hooks/`.

### Config (`config.yml`)

Single YAML config file. Key sections: `server` (addr, port, run mode), `jwt` (secret, expiry), `database` (driver: mysql|postgres|sqlite, source DSN), `storage` (local driver, directory for downloads), `site` (download toggle, proxy URL patterns, login/register type toggles, play type origin|local).

### Database support

Supports SQLite (default), MySQL, and PostgreSQL via the GORM factory in `libs/db/orm.go`. The Docker Compose setup uses MySQL.
