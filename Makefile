# Installs and runs Cinetadel. Start with: make help
# Helper tasks use Node so they work the same on Linux, macOS and Windows.

API_DIR := apps/api
WEB_DIR := apps/web

# The web build needs this; only .env.development is in the repository.
VITE_API_BASE_URL ?= /api
export VITE_API_BASE_URL

.DEFAULT_GOAL := help
.PHONY: help install dev debug prod clean check-node check-env check-deps \
	dev-api dev-web debug-api prod-api prod-web

help:
	@node -e "console.log(['Cinetadel - available commands', '', '  make install   Install the API and web dependencies', '  make dev       Development mode: reloads on save', '  make debug     Debug mode: API with the inspector on port 9229', '  make prod      Build and run in production mode', '  make clean     Remove dependencies and builds', '', 'Requires Node ^24.15.0 and apps/api/.env with its Oracle wallet.', 'Web: http://localhost:5173 in dev and debug, http://localhost:4173 in prod.'].join('\n'))"

install: check-node
	npm --prefix $(API_DIR) ci --no-audit --no-fund
	npm --prefix $(WEB_DIR) ci --no-audit --no-fund

dev: check-node check-env check-deps
	@$(MAKE) --no-print-directory -j2 dev-api dev-web

debug: check-node check-env check-deps
	@$(MAKE) --no-print-directory -j2 debug-api dev-web

prod: check-node check-env check-deps
	npm --prefix $(API_DIR) run build
	npm --prefix $(WEB_DIR) run build-only
	@$(MAKE) --no-print-directory -j2 prod-api prod-web

dev-api:
	npm --prefix $(API_DIR) run start:dev

dev-web:
	npm --prefix $(WEB_DIR) run dev

debug-api:
	npm --prefix $(API_DIR) run start:debug

prod-api:
	npm --prefix $(API_DIR) run start:prod

prod-web:
	npm --prefix $(WEB_DIR) run preview

# Leaves apps/api/.env, the wallet and apps/api/uploads untouched.
clean:
	node -e "for (const app of ['api', 'web']) for (const dir of ['node_modules', 'dist', 'coverage']) require('node:fs').rmSync('apps/' + app + '/' + dir, { recursive: true, force: true })"

check-node:
	@node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major !== 24 || minor < 15) { console.error('Node ^24.15.0 is required; you have ' + process.version); process.exit(1) }"

check-env:
	@node -e "if (!require('node:fs').existsSync('apps/api/.env')) { console.error('Missing apps/api/.env. Variables: DB_USER, DB_PASSWORD, DB_CONNECT_STRING, DB_WALLET_DIR, DB_WALLET_PASSWORD, JWT_SECRET, FRONTEND_URL, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.'); process.exit(1) }"

check-deps:
	@node -e "const fs = require('node:fs'); if (['api', 'web'].some((app) => !fs.existsSync('apps/' + app + '/node_modules'))) { console.error('Missing dependencies. Run: make install'); process.exit(1) }"
