# LogiLog DevOps & Deployment Specification

**Version:** 1.0.0
**Date:** 2026-03-14
**Status:** Authoritative

---

## Table of Contents

1. [Repository Setup](#1-repository-setup)
2. [GitHub Actions CI/CD Pipeline](#2-github-actions-cicd-pipeline)
3. [COOP/COEP Header Solution](#3-coopcoep-header-solution)
4. [Vite Build Configuration](#4-vite-build-configuration)
5. [Environment Configuration](#5-environment-configuration)
6. [Model Asset Strategy](#6-model-asset-strategy)
7. [Performance Budgets](#7-performance-budgets)
8. [Lighthouse CI](#8-lighthouse-ci)
9. [Release Process](#9-release-process)
10. [Monitoring](#10-monitoring)
11. [Security](#11-security)

---

## 1. Repository Setup

### 1.1 Branch Strategy

LogiLog uses a trunk-based development model. There is one long-lived branch.

```
main          ← production, always deployable, protected
feature/*     ← short-lived feature branches, opened as PRs to main
fix/*         ← bug fix branches
chore/*       ← tooling, dependency, docs branches
```

All work enters `main` via pull request. Direct pushes to `main` are blocked. Feature branches are deleted after merge.

### 1.2 Branch Protection Rules

Configure in **Settings > Branches > Add rule** for the pattern `main`:

| Rule                                                             | Value                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| Require a pull request before merging                            | enabled                                                  |
| Required approving reviews                                       | 1                                                        |
| Dismiss stale pull request approvals when new commits are pushed | enabled                                                  |
| Require status checks to pass before merging                     | enabled                                                  |
| Required status checks                                           | `ci / lint`, `ci / typecheck`, `ci / test`, `ci / build` |
| Require branches to be up to date before merging                 | enabled                                                  |
| Require conversation resolution before merging                   | enabled                                                  |
| Do not allow bypassing the above settings                        | enabled                                                  |
| Allow force pushes                                               | disabled                                                 |
| Allow deletions                                                  | disabled                                                 |

### 1.3 PR Template

Create at `.github/pull_request_template.md`:

```markdown
## What does this PR do?

<!-- One paragraph description of the change and why it is needed. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Performance improvement
- [ ] Dependency update
- [ ] Documentation / tooling

## Testing

<!-- Describe how you tested this. Include browser/GPU tested if relevant. -->

- [ ] Unit tests pass locally (`pnpm test`)
- [ ] Build succeeds locally (`pnpm build`)
- [ ] Manually tested in browser (note browser/OS):

## Checklist

- [ ] No secrets or credentials are committed
- [ ] WASM/Worker changes tested with COOP/COEP headers active
- [ ] Bundle size impact assessed (run `pnpm build` and check output)
- [ ] Accessibility not regressed (run Lighthouse locally if UI changed)

## Screenshots / recordings

<!-- If this is a UI change, add before/after screenshots. -->
```

### 1.4 Issue Labels

Create these labels for triage:

| Label          | Color     | Purpose                              |
| -------------- | --------- | ------------------------------------ |
| `bug`          | `#d73a4a` | Something is broken                  |
| `performance`  | `#e4e669` | Inference speed, bundle size         |
| `wasm`         | `#0075ca` | WASM/ONNX runtime issues             |
| `webgpu`       | `#7057ff` | WebGPU backend issues                |
| `headers`      | `#008672` | COOP/COEP/CSP issues                 |
| `model`        | `#e99695` | Model weights, quantization, caching |
| `ci`           | `#f9d0c4` | CI/CD pipeline issues                |
| `dependencies` | `#cfd3d7` | Dependency updates                   |

---

## 2. GitHub Actions CI/CD Pipeline

### 2.1 Pipeline Overview

```
Push / PR to main
        │
        ▼
┌──────────────────────────────────────────┐
│  Job: install                            │
│  - Setup pnpm + Node                     │
│  - Restore or populate node_modules cache│
└────────────────┬─────────────────────────┘
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
    lint      typecheck  build
        │        │        │
        └────────┼────────┘
                 │
                 ▼
              test
                 │
                 ▼
         performance-budget
                 │
          (PR only)        (merge to main only)
                 │                │
                 ▼                ▼
         lighthouse-ci       deploy-pages
```

### 2.2 CI Workflow — PR Checks and Production Deploy

Create at `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Cancel in-flight runs for the same branch to save minutes.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9'

jobs:
  # ─────────────────────────────────────────
  # Wave 1: Dependency installation + caching
  # ─────────────────────────────────────────
  install:
    name: Install dependencies
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Cache node_modules
        uses: actions/cache/save@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

  # ─────────────────────────────────────────
  # Wave 2: Lint, typecheck, build (parallel)
  # ─────────────────────────────────────────
  lint:
    name: Lint
    runs-on: ubuntu-latest
    needs: install
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          fail-on-cache-miss: true

      - name: Lint
        run: pnpm lint

      - name: Check formatting
        run: pnpm format:check

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    needs: install
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          fail-on-cache-miss: true

      - name: Typecheck
        run: pnpm typecheck

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: install
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          fail-on-cache-miss: true

      - name: Build
        run: pnpm build
        env:
          # Vite will embed this at build time. See §5.
          VITE_APP_VERSION: ${{ github.sha }}
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: dist/
          retention-days: 7

  # ─────────────────────────────────────────
  # Wave 3: Unit tests
  # ─────────────────────────────────────────
  test:
    name: Unit tests
    runs-on: ubuntu-latest
    needs: install
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          fail-on-cache-miss: true

      - name: Run tests with coverage
        run: pnpm test:coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ github.sha }}
          path: coverage/
          retention-days: 7

      - name: Post coverage summary to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const summary = JSON.parse(
              fs.readFileSync('coverage/coverage-summary.json', 'utf8')
            );
            const total = summary.total;
            const fmt = (v) => `${v.pct.toFixed(1)}%`;
            const body = [
              '## Coverage Report',
              '',
              '| Metric | Coverage |',
              '|---|---|',
              `| Statements | ${fmt(total.statements)} |`,
              `| Branches | ${fmt(total.branches)} |`,
              `| Functions | ${fmt(total.functions)} |`,
              `| Lines | ${fmt(total.lines)} |`,
            ].join('\n');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            });

  # ─────────────────────────────────────────
  # Wave 4: Performance budget enforcement
  # ─────────────────────────────────────────
  performance-budget:
    name: Performance budget
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          fail-on-cache-miss: true

      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: dist/

      - name: Check bundle size budgets
        run: node scripts/check-bundle-size.mjs

      - name: Post bundle size report to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(
              fs.readFileSync('bundle-report.json', 'utf8')
            );
            const rows = report.chunks.map(
              (c) => `| ${c.name} | ${c.sizePretty} | ${c.gzipPretty} | ${c.status} |`
            );
            const body = [
              '## Bundle Size Report',
              '',
              '| Chunk | Raw | Gzip | Status |',
              '|---|---|---|---|',
              ...rows,
              '',
              `**Total JS:** ${report.totalJsPretty} (gzip: ${report.totalJsGzipPretty})`,
            ].join('\n');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            });

  # ─────────────────────────────────────────
  # Wave 5: Lighthouse CI (PRs only)
  # ─────────────────────────────────────────
  lighthouse:
    name: Lighthouse CI
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          fail-on-cache-miss: true

      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: dist/

      - name: Run Lighthouse CI
        run: pnpm exec lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}

  # ─────────────────────────────────────────
  # Wave 5: Security audit (PRs + main)
  # ─────────────────────────────────────────
  audit:
    name: Security audit
    runs-on: ubuntu-latest
    needs: install
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache/restore@v4
        with:
          path: node_modules
          key: node_modules-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          fail-on-cache-miss: true

      - name: Audit dependencies
        # --audit-level=high fails the build only for high/critical CVEs.
        # Moderate advisories are tracked but do not block merges.
        run: pnpm audit --audit-level=high

  # ─────────────────────────────────────────
  # Final gate: single required status check
  # ─────────────────────────────────────────
  ci-success:
    name: CI passed
    runs-on: ubuntu-latest
    needs: [lint, typecheck, build, test, performance-budget, audit]
    if: always()
    steps:
      - name: Check all jobs succeeded
        run: |
          results='${{ toJSON(needs) }}'
          failed=$(echo "$results" | node -e "
            const d = require('fs').readFileSync('/dev/stdin','utf8');
            const needs = JSON.parse(d);
            const failed = Object.entries(needs)
              .filter(([,v]) => v.result !== 'success')
              .map(([k]) => k);
            console.log(failed.join(','));
          ")
          if [ -n "$failed" ]; then
            echo "Failed jobs: $failed"
            exit 1
          fi
          echo "All required jobs passed."

  # ─────────────────────────────────────────
  # Deploy to GitHub Pages (main branch only)
  # ─────────────────────────────────────────
  deploy-pages:
    name: Deploy to GitHub Pages
    runs-on: ubuntu-latest
    needs: [ci-success]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Download build artifact
        uses: actions/download-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: dist/

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 2.3 Dependency Update Workflow

Create at `.github/workflows/dependency-update.yml`:

```yaml
name: Dependency update check

on:
  schedule:
    # Runs every Monday at 09:00 UTC.
    - cron: '0 9 * * 1'
  workflow_dispatch:

jobs:
  audit:
    name: Weekly security audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: '9'

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Full audit report
        # Do not fail — this is informational. The CI workflow enforces --audit-level=high.
        run: pnpm audit --json > audit-report.json || true

      - name: Upload audit report
        uses: actions/upload-artifact@v4
        with:
          name: audit-report-${{ github.run_id }}
          path: audit-report.json
          retention-days: 30

      - name: Open issue on high/critical findings
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('audit-report.json', 'utf8'));
            const advisories = report.advisories || {};
            const highOrCritical = Object.values(advisories).filter(
              (a) => ['high', 'critical'].includes(a.severity)
            );
            if (highOrCritical.length === 0) return;
            const body = highOrCritical.map((a) =>
              `- **${a.severity.toUpperCase()}** [${a.module_name}](${a.url}): ${a.title}`
            ).join('\n');
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `[Security] ${highOrCritical.length} high/critical vulnerabilities found`,
              body: `## Weekly Dependency Audit\n\n${body}\n\nRun: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
              labels: ['dependencies', 'bug'],
            });
```

### 2.4 Preview Deployments

GitHub Pages does not natively support per-PR preview URLs from a single repository. Two viable options are:

**Option A (recommended): Cloudflare Pages**
If the project is also connected to Cloudflare Pages, each PR automatically gets a preview URL at `<pr-branch>.LogiLog.pages.dev`. This requires no additional workflow changes — Cloudflare's GitHub App handles it. Cloudflare Pages also solves the COOP/COEP header problem natively (see §3.2).

**Option B: Netlify Drop via artifact**
Upload the `dist/` artifact to Netlify's Deploy API via `curl`. Less predictable URLs, but free and zero infrastructure:

```yaml
# Append to the `build` job steps, conditioned on PR events:
- name: Deploy preview to Netlify
  if: github.event_name == 'pull_request'
  env:
    NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
    NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
  run: |
    pnpm exec netlify deploy \
      --dir=dist \
      --alias=pr-${{ github.event.pull_request.number }} \
      --message="PR #${{ github.event.pull_request.number }}" \
      --json > netlify-deploy.json
    URL=$(node -e "console.log(require('./netlify-deploy.json').deploy_url)")
    echo "Preview URL: $URL"
```

---

## 3. COOP/COEP Header Solution

### 3.1 Why These Headers Are Required

WebGPU requires a "secure context" (HTTPS + same-origin isolation). SharedArrayBuffer — used by Transformers.js for multi-threaded ONNX inference — requires `crossOriginIsolated === true`, which browsers only set when both headers are present:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages serves static files but does not allow custom HTTP response headers. The solution is a service worker that intercepts every fetch response and re-adds these headers before the browser processes them.

### 3.2 Service Worker Header Injection (coi-serviceworker)

This is the standard solution for GitHub Pages. The `coi-serviceworker` library injects a minimal service worker that clones every response with the required headers appended.

**Installation:**

```bash
pnpm add -D coi-serviceworker
```

**Integration into `index.html`:**

The script must be the first `<script>` in `<head>`. It registers the service worker and, if necessary, immediately reloads the page once the worker is active (the first load without the worker active does not have `crossOriginIsolated`).

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LogiLog</title>

    <!--
      coi-serviceworker: Injects COOP/COEP headers via service worker.
      Must be the first script executed. The worker registration triggers
      a one-time page reload on first visit; subsequent loads are instant.
      Source: https://github.com/gzuidhof/coi-serviceworker
    -->
    <script src="/coi-serviceworker.js"></script>

    <!-- remaining head content -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Vite plugin to copy the service worker into `dist/`:**

Rather than manually copying the file, configure Vite to emit it as a public asset:

```typescript
// In vite.config.ts publicDir is `public/` by default.
// Copy node_modules/coi-serviceworker/coi-serviceworker.js into public/:
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "prebuild": "cp node_modules/coi-serviceworker/coi-serviceworker.js public/coi-serviceworker.js",
    "predev": "cp node_modules/coi-serviceworker/coi-serviceworker.js public/coi-serviceworker.js"
  }
}
```

This ensures the file is always in sync with the installed package version and is picked up by Vite's public asset handling (served as-is, not processed).

**Verification:**

After deployment, open DevTools > Console and confirm:

```
crossOriginIsolated === true   // must be true
```

Check DevTools > Application > Service Workers to confirm `coi-serviceworker` is registered with status "Activated and running".

### 3.3 Development Server Headers

During local development, Vite's dev server must also serve these headers so that WebGPU and SharedArrayBuffer work without a reload loop. Configure in `vite.config.ts` (see §4):

```typescript
server: {
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  },
},
```

### 3.4 Alternative: Cloudflare Workers Proxy

If `coi-serviceworker` is insufficient (e.g., for iframes or third-party embeds that don't cooperate with `require-corp`), route traffic through a Cloudflare Worker. This is the "escape hatch" option.

Create at `cloudflare/worker.js`:

```javascript
/**
 * Cloudflare Worker: COOP/COEP header proxy for LogiLog GitHub Pages.
 *
 * Deploy this worker to a custom domain that proxies to the GitHub Pages
 * origin. All responses get the cross-origin isolation headers attached.
 *
 * Routes: *.LogiLog.app/* → username.github.io/LogiLog/*
 */

const GITHUB_PAGES_ORIGIN = 'https://your-username.github.io'
const BASE_PATH = '/LogiLog'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // Rewrite the request to the GitHub Pages origin.
    const upstreamUrl = new URL(`${GITHUB_PAGES_ORIGIN}${BASE_PATH}${url.pathname}${url.search}`)

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    })

    // Clone the response so headers are mutable.
    const response = new Response(upstreamResponse.body, upstreamResponse)

    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')

    // Tighten cache control for HTML to prevent stale app shells.
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
    }

    return response
  },
}
```

Deploy via Wrangler:

```yaml
# wrangler.toml
name = "LogiLog-proxy"
main = "cloudflare/worker.js"
compatibility_date = "2025-01-01"

[env.production]
routes = [{ pattern = "LogiLog.app/*", zone_name = "LogiLog.app" }]
```

---

## 4. Vite Build Configuration

### 4.1 Complete `vite.config.ts`

```typescript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  // Load .env files for the current mode.
  // This makes all VITE_* variables available to the config itself.
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react()],

    // ─────────────────────────────────────────────────────────────────
    // Base URL
    //
    // GitHub Pages serves from /<repo-name>/ when deployed to a project
    // page (e.g., username.github.io/LogiLog). Set VITE_BASE_URL=/
    // in .env.production.local when using a custom domain.
    // ─────────────────────────────────────────────────────────────────
    base: env.VITE_BASE_URL ?? '/LogiLog/',

    // ─────────────────────────────────────────────────────────────────
    // Development server
    // ─────────────────────────────────────────────────────────────────
    server: {
      port: 5173,
      headers: {
        // Required for WebGPU + SharedArrayBuffer in development.
        // The service worker handles this in production (see §3.2).
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },

    // ─────────────────────────────────────────────────────────────────
    // Preview server (used by Lighthouse CI)
    // ─────────────────────────────────────────────────────────────────
    preview: {
      port: 4173,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },

    // ─────────────────────────────────────────────────────────────────
    // Build
    // ─────────────────────────────────────────────────────────────────
    build: {
      outDir: 'dist',
      // Generate source maps for Sentry error reporting. The upload
      // step in CI strips them from the public dist after upload.
      sourcemap: true,

      // Warn when any single chunk exceeds 500 kB (gzip ~150 kB).
      // The budget script (§7) enforces hard limits.
      chunkSizeWarningLimit: 500,

      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },

        output: {
          // ──────────────────────────────────────────────────────────
          // Manual chunk splitting strategy
          //
          // Goal: keep the initial JS payload small so the app shell
          // renders before model weights arrive. Inference code is
          // lazy-loaded only when the user drops a log file.
          //
          // Chunk inventory:
          //   vendor-react   — React + React-DOM (stable, high cache hit)
          //   vendor-ui      — charting / visualization libs
          //   inference      — Transformers.js ONNX runtime (large, lazy)
          //   worker-*       — Web Worker entry points (auto-named)
          //   [hash]         — all other application code
          // ──────────────────────────────────────────────────────────
          manualChunks(id) {
            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/scheduler')
            ) {
              return 'vendor-react'
            }

            // Transformers.js and its ONNX runtime are large (~8 MB
            // uncompressed). Isolating them maximises cache lifetime
            // and allows lazy-loading via dynamic import().
            if (
              id.includes('node_modules/@huggingface/transformers') ||
              id.includes('node_modules/onnxruntime-web')
            ) {
              return 'inference'
            }

            // Charting and visualization libraries.
            if (
              id.includes('node_modules/d3') ||
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/victory')
            ) {
              return 'vendor-ui'
            }
          },

          // Content-addressable filenames for all assets.
          // The [hash] ensures CDN/browser caches are busted correctly.
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const ext = assetInfo.name?.split('.').pop() ?? ''

            // Keep WASM files in a predictable location so the ONNX
            // runtime can locate them via its default path resolution.
            if (ext === 'wasm') {
              return 'assets/wasm/[name]-[hash][extname]'
            }

            if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) {
              return 'assets/img/[name]-[hash][extname]'
            }

            if (['woff', 'woff2', 'eot', 'ttf'].includes(ext)) {
              return 'assets/fonts/[name]-[hash][extname]'
            }

            return 'assets/[name]-[hash][extname]'
          },
        },
      },
    },

    // ─────────────────────────────────────────────────────────────────
    // Worker bundling
    //
    // Vite handles ?worker imports natively. Workers are bundled as
    // separate entry points. The `type: 'module'` setting allows
    // top-level await and ES module syntax inside workers.
    // ─────────────────────────────────────────────────────────────────
    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/workers/[name]-[hash].js',
          entryFileNames: 'assets/workers/[name]-[hash].js',
        },
      },
    },

    // ─────────────────────────────────────────────────────────────────
    // WASM support
    //
    // Vite 5+ handles .wasm imports via `?init` or `?url` suffixes.
    // The ONNX runtime fetches its WASM binaries at runtime using a
    // configurable `wasmPaths` option — it does not go through the
    // module bundler. No special Vite plugin is needed, but the files
    // must be present in the build output.
    //
    // If direct WASM imports (import init from './foo.wasm?init') are
    // used, the `vite-plugin-wasm` plugin is required:
    //   plugins: [react(), wasm(), topLevelAwait()]
    // ─────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────
    // Path aliases
    // ─────────────────────────────────────────────────────────────────
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@workers': resolve(__dirname, 'src/workers'),
        '@inference': resolve(__dirname, 'src/inference'),
      },
    },

    // ─────────────────────────────────────────────────────────────────
    // Test configuration (Vitest)
    // ─────────────────────────────────────────────────────────────────
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary', 'lcov'],
        thresholds: {
          // Enforced thresholds — CI fails if these drop.
          statements: 70,
          branches: 65,
          functions: 70,
          lines: 70,
        },
        exclude: ['src/test/**', 'src/**/*.d.ts', 'src/main.tsx', 'vite.config.ts'],
      },
    },
  }
})
```

### 4.2 `.dockerignore` / `.gitignore` Additions

```
# Build output
dist/
coverage/

# Local environment files — never committed
.env.local
.env.*.local

# pnpm
.pnpm-store/

# Lighthouse CI
.lighthouseci/

# Bundle size reports
bundle-report.json
```

---

## 5. Environment Configuration

### 5.1 Environment Variable Naming

All variables accessible in browser code must be prefixed `VITE_`. Variables without this prefix are only available in `vite.config.ts` (build-time Node context).

### 5.2 Environment Files

```
.env                   # Committed. Defaults for all environments.
.env.development       # Committed. Dev-only defaults.
.env.production        # Committed. Prod-only defaults (no secrets).
.env.local             # Never committed. Local overrides (any env).
.env.development.local # Never committed. Local dev overrides.
.env.production.local  # Never committed. Local prod overrides.
```

### 5.3 `.env` (base defaults, committed)

```bash
# App identity — overridden per environment below.
VITE_APP_NAME=LogiLog

# Feature flags.
VITE_ENABLE_WEBGPU=true

# Model source. See §6 for full strategy.
# In development, models are fetched from HuggingFace Hub directly.
# In production, the same URL is used; IndexedDB caching makes it fast
# after the first load.
VITE_MODEL_BASE_URL=https://huggingface.co/Xenova

# Sentry — leave blank to disable error reporting.
VITE_SENTRY_DSN=

# Analytics — leave blank to disable.
VITE_PLAUSIBLE_DOMAIN=
```

### 5.4 `.env.development` (committed)

```bash
# Force CPU/WASM backend in development if a discrete GPU is not
# available, to avoid misleading performance numbers during development.
VITE_INFERENCE_BACKEND=webgpu

# Enable verbose worker logging in the console.
VITE_DEBUG_WORKERS=true

# Disable Sentry in development.
VITE_SENTRY_DSN=

# Point to a local model cache directory served by a tiny static server
# if you want to avoid re-downloading from HuggingFace on every restart.
# Example: `npx serve -p 8080 ~/.cache/LogiLog-models`
# VITE_MODEL_BASE_URL=http://localhost:8080
```

### 5.5 `.env.production` (committed)

```bash
VITE_INFERENCE_BACKEND=webgpu
VITE_DEBUG_WORKERS=false

# Base URL for GitHub Pages project page deployment.
# Override with VITE_BASE_URL=/ in .env.production.local for custom domains.
VITE_BASE_URL=/LogiLog/
```

### 5.6 Secrets in CI

The following secrets must be added to **Settings > Secrets and variables > Actions**:

| Secret name             | Description                       |
| ----------------------- | --------------------------------- |
| `VITE_SENTRY_DSN`       | Sentry project DSN (browser SDK)  |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI GitHub App token    |
| `NETLIFY_AUTH_TOKEN`    | (Optional) For PR preview deploys |
| `NETLIFY_SITE_ID`       | (Optional) For PR preview deploys |

### 5.7 Runtime Environment Detection

```typescript
// src/config.ts
// All VITE_* variables are inlined at build time by Vite.
// This module provides typed access with sensible defaults.

export const config = {
  appName: import.meta.env.VITE_APP_NAME ?? 'LogiLog',
  appVersion: import.meta.env.VITE_APP_VERSION ?? 'dev',
  inferenceBackend: import.meta.env.VITE_INFERENCE_BACKEND ?? 'webgpu',
  modelBaseUrl: import.meta.env.VITE_MODEL_BASE_URL ?? 'https://huggingface.co/Xenova',
  debugWorkers: import.meta.env.VITE_DEBUG_WORKERS === 'true',
  sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? '',
  plausibleDomain: import.meta.env.VITE_PLAUSIBLE_DOMAIN ?? '',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const
```

---

## 6. Model Asset Strategy

### 6.1 Overview

LogiLog does not bundle model weights into the application. Weights are fetched on first use and cached permanently in the browser's IndexedDB via the Transformers.js caching layer. Subsequent loads are local-only.

```
First visit:
  Browser → HuggingFace Hub CDN → IndexedDB cache
  (30–60 s download, once per model version)

All subsequent visits:
  Browser → IndexedDB cache
  (< 3 s, entirely local)
```

### 6.2 Model Selection and Hosting

| Purpose                       | Model                       | Source          | Size (4-bit) |
| ----------------------------- | --------------------------- | --------------- | ------------ |
| Embedding / anomaly detection | `Xenova/all-MiniLM-L6-v2`   | HuggingFace Hub | ~23 MB       |
| Summarization (Smart Context) | `Xenova/distilbart-cnn-6-6` | HuggingFace Hub | ~300 MB      |

Both models are hosted on HuggingFace Hub under the `Xenova` namespace — these are pre-converted ONNX versions maintained by the Transformers.js team. Using the Hub avoids self-hosting model weights and the associated bandwidth costs.

**When to reconsider self-hosting:**

- If HuggingFace Hub has availability issues.
- If models need to be private or audited.
- In that case, upload ONNX model files to an S3 bucket or GitHub Releases with `--lfs` and serve via CloudFront with appropriate CORS headers.

### 6.3 Transformers.js Cache Configuration

```typescript
// src/inference/model-loader.ts
import { env, pipeline, FeatureExtractionPipeline } from '@huggingface/transformers'
import { config } from '@/config'

// Instruct Transformers.js to use IndexedDB for caching (default in browser).
env.useBrowserCache = true

// Override the model hub base URL. In development this can point to a
// local static server to avoid repeated downloads.
env.remoteHost = config.modelBaseUrl

// Disable local model file resolution — we always fetch from remote.
env.localModelPath = undefined

// Allow WebGPU backend if the browser supports it.
env.backends.onnx.wasm.proxy = false

export async function loadEmbeddingModel(): Promise<FeatureExtractionPipeline> {
  return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    // Use WebGPU if available, fall back to WASM.
    device: config.inferenceBackend as 'webgpu' | 'wasm',
    dtype: 'q4', // 4-bit quantization
    progress_callback: (progress) => {
      // Dispatch progress events to the UI via a BroadcastChannel
      // or postMessage so the loading state (§4 UX requirement) can
      // display accurate download progress.
      self.postMessage({ type: 'model-progress', payload: progress })
    },
  })
}
```

### 6.4 IndexedDB Cache Versioning

When a model is updated, the old cached weights must be evicted. Transformers.js uses the model revision (Git SHA on HuggingFace Hub) as the cache key, so pointing to a new revision automatically invalidates the cache.

To force a cache clear on model upgrade (e.g., from `v1` to `v2` quantization), increment `VITE_MODEL_CACHE_VERSION` in `.env.production`. At app startup, compare the stored version with the current one and call `caches.delete()` + clear the Transformers.js IndexedDB store if they differ.

```typescript
// src/inference/cache-manager.ts
const CACHE_VERSION_KEY = 'LogiLog-model-cache-version'
const CURRENT_VERSION = import.meta.env.VITE_MODEL_CACHE_VERSION ?? '1'

export async function evictStaleModelCache(): Promise<void> {
  const stored = localStorage.getItem(CACHE_VERSION_KEY)
  if (stored === CURRENT_VERSION) return

  // Delete all Transformers.js IndexedDB stores.
  const dbName = 'transformers-cache'
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })

  localStorage.setItem(CACHE_VERSION_KEY, CURRENT_VERSION)
  console.info(`[LogiLog] Model cache evicted. New version: ${CURRENT_VERSION}`)
}
```

### 6.5 Offline Behaviour

After the first model download, LogiLog should function without any network connection (the core value proposition). The service worker (coi-serviceworker) does not implement a full offline cache for application assets — add a Workbox precache manifest for that:

```typescript
// Install workbox-build as a dev dependency.
// scripts/generate-sw.mjs — run as part of the build.
import { generateSW } from 'workbox-build'

await generateSW({
  swDest: 'dist/sw.js',
  globDirectory: 'dist/',
  // Cache app shell (HTML, JS, CSS) for offline use.
  // Do NOT cache model weights here — they're handled by IndexedDB.
  globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
  // Exclude WASM — large and infrequently updated.
  globIgnores: ['**/*.wasm'],
  // On update, the new SW takes over immediately without waiting for
  // all tabs to close.
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      // Cache WASM files with a cache-first strategy.
      urlPattern: /\.wasm$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'wasm-cache',
        expiration: { maxAgeSeconds: 30 * 24 * 60 * 60 }, // 30 days
      },
    },
  ],
})
```

Note: if Workbox SW is used alongside coi-serviceworker, they must be merged into a single service worker file, because only one SW can control a given scope. Merge strategy: inline coi-serviceworker logic at the top of the Workbox-generated `sw.js`.

---

## 7. Performance Budgets

### 7.1 Budget Targets

| Chunk                | Max raw size | Max gzip size | Rationale                                                      |
| -------------------- | ------------ | ------------- | -------------------------------------------------------------- |
| `vendor-react`       | 150 kB       | 50 kB         | React 19 is small; if this grows, something wrong was included |
| `vendor-ui`          | 400 kB       | 120 kB        | D3/Recharts; acceptable for visualization-heavy app            |
| `main` (app shell)   | 200 kB       | 60 kB         | App shell should be minimal                                    |
| `inference`          | 12 MB        | N/A           | Transformers.js + ONNX runtime; not gzip-budgeted separately   |
| **Total initial JS** | **500 kB**   | **200 kB**    | Excludes `inference` chunk (lazy-loaded)                       |

The `inference` chunk is intentionally exempt from the initial load budget because it is loaded lazily only when the user triggers analysis.

### 7.2 Budget Enforcement Script

Create at `scripts/check-bundle-size.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Bundle size budget enforcement.
 *
 * Reads the Rollup stats from dist/ and fails the build if any chunk
 * exceeds its defined limit. Also writes bundle-report.json for the
 * CI PR comment job.
 */

import { readdirSync, statSync, writeFileSync } from 'fs'
import { resolve, extname } from 'path'
import { createReadStream } from 'fs'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Writable } from 'stream'

const DIST_JS = resolve('dist/assets/js')

// Budgets in bytes.
const BUDGETS = {
  'vendor-react': { raw: 150 * 1024, gzip: 50 * 1024 },
  'vendor-ui': { raw: 400 * 1024, gzip: 120 * 1024 },
  main: { raw: 200 * 1024, gzip: 60 * 1024 },
  // inference is excluded from hard limits (lazy-loaded, large by design).
}

// Total initial JS budget (sum of all non-inference chunks).
const TOTAL_INITIAL_BUDGET = { raw: 500 * 1024, gzip: 200 * 1024 }

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function gzipSize(filePath) {
  let size = 0
  const counter = new Writable({
    write(chunk, _enc, cb) {
      size += chunk.length
      cb()
    },
  })
  await pipeline(createReadStream(filePath), createGzip(), counter)
  return size
}

const files = readdirSync(DIST_JS).filter((f) => extname(f) === '.js')

const chunks = []
let totalRaw = 0
let totalGzip = 0
let failed = false

for (const file of files) {
  const filePath = resolve(DIST_JS, file)
  const rawSize = statSync(filePath).size
  const gzSize = await gzipSize(filePath)

  // Identify which named chunk this file belongs to by matching the
  // name prefix (before the content hash).
  const chunkName = Object.keys(BUDGETS).find((name) => file.startsWith(name))

  const budget = BUDGETS[chunkName]
  let status = 'ok'

  if (budget) {
    if (rawSize > budget.raw) {
      console.error(
        `BUDGET EXCEEDED: ${file} raw size ${formatBytes(rawSize)} > limit ${formatBytes(budget.raw)}`,
      )
      status = 'exceeded'
      failed = true
    } else if (gzSize > budget.gzip) {
      console.error(
        `BUDGET EXCEEDED: ${file} gzip size ${formatBytes(gzSize)} > limit ${formatBytes(budget.gzip)}`,
      )
      status = 'exceeded'
      failed = true
    }
  }

  const isInitial = chunkName !== undefined && chunkName !== 'inference'
  if (isInitial) {
    totalRaw += rawSize
    totalGzip += gzSize
  }

  chunks.push({
    name: file,
    rawSize,
    gzipSize: gzSize,
    sizePretty: formatBytes(rawSize),
    gzipPretty: formatBytes(gzSize),
    status,
  })
}

// Check total initial JS budget.
if (totalRaw > TOTAL_INITIAL_BUDGET.raw) {
  console.error(
    `BUDGET EXCEEDED: Total initial JS ${formatBytes(totalRaw)} > limit ${formatBytes(TOTAL_INITIAL_BUDGET.raw)}`,
  )
  failed = true
}

if (totalGzip > TOTAL_INITIAL_BUDGET.gzip) {
  console.error(
    `BUDGET EXCEEDED: Total initial JS gzip ${formatBytes(totalGzip)} > limit ${formatBytes(TOTAL_INITIAL_BUDGET.gzip)}`,
  )
  failed = true
}

const report = {
  chunks,
  totalJsPretty: formatBytes(totalRaw),
  totalJsGzipPretty: formatBytes(totalGzip),
  passed: !failed,
}

writeFileSync('bundle-report.json', JSON.stringify(report, null, 2))
console.log('\nBundle report written to bundle-report.json')

if (failed) {
  console.error('\nBundle size check FAILED. See errors above.')
  process.exit(1)
} else {
  console.log(
    `\nBundle size check PASSED. Total initial JS: ${formatBytes(totalRaw)} (gzip: ${formatBytes(totalGzip)})`,
  )
}
```

---

## 8. Lighthouse CI

### 8.1 Configuration

Create at `lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./dist",
      "numberOfRuns": 3,
      "settings": {
        "chromeFlags": "--no-sandbox --disable-dev-shm-usage",
        "extraHeaders": {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp"
        },
        "emulatedFormFactor": "desktop",
        "throttlingMethod": "simulate",
        "throttling": {
          "rttMs": 40,
          "throughputKbps": 10240,
          "cpuSlowdownMultiplier": 1
        }
      }
    },
    "assert": {
      "preset": "lighthouse:no-pwa",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.75 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["error", { "minScore": 0.85 }],
        "categories:seo": ["warn", { "minScore": 0.8 }],

        "first-contentful-paint": ["warn", { "maxNumericValue": 2000 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 4000 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 300 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "interactive": ["warn", { "maxNumericValue": 5000 }],

        "uses-text-compression": ["error", { "minScore": 1 }],
        "efficient-animated-content": ["warn", { "minScore": 0.9 }],
        "uses-long-cache-ttl": ["warn", { "minScore": 0.5 }],

        "color-contrast": ["error", { "minScore": 1 }],
        "image-alt": ["error", { "minScore": 1 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**Notes on thresholds:**

- Performance is set to 0.75 rather than the typical 0.90 because the app must load Transformers.js (a large runtime). The "Loading" state is by design (UX requirement in §4 of seed doc). The LCP of 4 s accommodates this.
- Accessibility is held to a high bar (0.90) because terminal aesthetics with low-contrast text are a common pitfall.

### 8.2 Local Lighthouse Run

```bash
# Install globally or use via pnpm exec
pnpm add -D @lhci/cli

# Build first, then run against the static dist.
pnpm build
pnpm exec lhci autorun
```

---

## 9. Release Process

### 9.1 Versioning Strategy

LogiLog follows [Semantic Versioning](https://semver.org/):

- **PATCH** (`1.0.x`): Bug fixes, dependency updates, performance improvements that do not change behaviour.
- **MINOR** (`1.x.0`): New features, new model support, UX additions — backward compatible.
- **MAJOR** (`x.0.0`): Breaking changes to URL structure, IndexedDB schema (forces cache eviction), removal of supported browser targets.

Version is recorded in `package.json` and exposed to the app via `import.meta.env.VITE_APP_VERSION` (set to the Git tag in CI).

### 9.2 Automated Release with `release-please`

`release-please` reads Conventional Commits to automatically create release PRs with a bumped version and an auto-generated changelog. Merging the release PR triggers the publish step.

**Commit message conventions:**

```
feat: add clustering view for grouped log patterns
fix: correct cosine distance calculation for zero-length vectors
perf: reduce embedding batch size to prevent OOM on mobile GPUs
chore: update transformers.js to v3.2.0
docs: add model cache eviction documentation
feat!: change IndexedDB schema to v2 (breaking — clears existing cache)
```

Commits starting with `feat!` or containing `BREAKING CHANGE:` in the footer trigger a major version bump.

### 9.3 Release Workflow

Create at `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    name: Create or update release PR
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.rp.outputs.release_created }}
      tag_name: ${{ steps.rp.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: rp
        with:
          release-type: node
          # release-please reads package.json for the current version
          # and writes the bumped version back on release.
          package-name: LogiLog

  # Only runs when release-please merged a release PR.
  publish-release:
    name: Build and publish release
    runs-on: ubuntu-latest
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          # Check out the release commit (with the bumped version in package.json).
          ref: ${{ needs.release-please.outputs.tag_name }}

      - uses: pnpm/action-setup@v4
        with:
          version: '9'

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Build release
        run: pnpm build
        env:
          VITE_APP_VERSION: ${{ needs.release-please.outputs.tag_name }}
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}

      - name: Upload Sentry source maps
        # Upload source maps to Sentry BEFORE stripping them from dist.
        # This allows Sentry to de-obfuscate stack traces without serving
        # source maps publicly.
        run: |
          pnpm exec sentry-cli sourcemaps inject ./dist
          pnpm exec sentry-cli sourcemaps upload \
            --release="${{ needs.release-please.outputs.tag_name }}" \
            ./dist
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: LogiLog

      - name: Strip source maps from public dist
        # Source maps have been uploaded to Sentry. Remove them from the
        # dist directory so they are not publicly accessible.
        run: find dist -name "*.map" -delete

      - name: Deploy to GitHub Pages
        uses: actions/deploy-pages@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Create Sentry release
        run: |
          pnpm exec sentry-cli releases new "${{ needs.release-please.outputs.tag_name }}"
          pnpm exec sentry-cli releases set-commits \
            "${{ needs.release-please.outputs.tag_name }}" --auto
          pnpm exec sentry-cli releases finalize \
            "${{ needs.release-please.outputs.tag_name }}"
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: LogiLog
```

### 9.4 Changelog

`release-please` auto-generates `CHANGELOG.md` from Conventional Commits. The changelog is committed to `main` as part of the release PR. No manual changelog maintenance required.

### 9.5 Hotfix Process

For urgent fixes to production:

```bash
# Branch off the release tag, not main (in case main has unreleased changes).
git checkout -b fix/critical-webgpu-crash v1.2.3

# Make the fix, commit with conventional commit message.
git commit -m "fix: prevent GPU device loss on inactive tab"

# Open a PR to main.
# After merge, release-please will create a patch release PR.
# Merge that PR to trigger deployment.
```

---

## 10. Monitoring

### 10.1 Error Tracking with Sentry

LogiLog uses the Sentry browser SDK. No backend Sentry SDK is needed.

```bash
pnpm add @sentry/browser @sentry/vite-plugin
```

**`src/monitoring/sentry.ts`:**

```typescript
import * as Sentry from '@sentry/browser'
import { config } from '@/config'

export function initSentry(): void {
  if (!config.sentryDsn || config.isDev) {
    return
  }

  Sentry.init({
    dsn: config.sentryDsn,
    release: config.appVersion,

    // Sample rate for performance tracing. Start low and increase if
    // needed. 10% gives statistical signal without hammering quotas.
    tracesSampleRate: 0.1,

    // Do not send events in development or for localhost users.
    // This is a belt-and-suspenders guard alongside the isDev check above.
    beforeSend(event) {
      if (window.location.hostname === 'localhost') return null
      return event
    },

    // Browser integrations.
    integrations: [
      Sentry.browserTracingIntegration(),
      // Replay captures a video-like reproduction of user sessions when
      // an error occurs. Set to 0 for session replay and 1.0 for error
      // replay — errors are the only interesting signal here.
      Sentry.replayIntegration({
        maskAllText: true, // Do not capture log content (privacy)
        blockAllMedia: true,
      }),
    ],

    replaysSessionSampleRate: 0, // No passive session recording
    replaysOnErrorSampleRate: 1.0, // Always record on error

    // IMPORTANT: LogiLog processes potentially sensitive log files.
    // Sentry must never receive log file content. The beforeBreadcrumb
    // hook strips any breadcrumb that might contain file content.
    beforeBreadcrumb(breadcrumb) {
      // Drop all console breadcrumbs — they may contain log line content.
      if (breadcrumb.category === 'console') return null
      return breadcrumb
    },
  })
}
```

Call `initSentry()` as the first statement in `src/main.tsx`, before any other imports execute.

### 10.2 What Sentry Can Capture

| Captured                        | Not captured                                       |
| ------------------------------- | -------------------------------------------------- |
| JavaScript exceptions           | Log file content                                   |
| WebGPU device loss errors       | Model weights                                      |
| Worker crash messages           | User-identifiable file names (strip in beforeSend) |
| WASM trap / OOM errors          | Any file path                                      |
| Performance traces (10% sample) | PII                                                |

### 10.3 Sentry Source Map Upload

Source maps are uploaded in the release workflow (§9.3) and then deleted from `dist/`. This allows Sentry to show readable stack traces without exposing source maps to the public internet.

Add the Sentry Vite plugin only for the release build. In the CI workflow it runs as a separate `sentry-cli` step rather than a plugin, to keep the build output clean.

### 10.4 Analytics (Privacy-First)

Use [Plausible Analytics](https://plausible.io) — a privacy-first, cookieless analytics tool that does not require a cookie banner, does not collect PII, and is GDPR compliant without configuration.

```html
<!-- In index.html, only if VITE_PLAUSIBLE_DOMAIN is set -->
<!-- Injected conditionally by a Vite plugin or at build time -->
<script defer data-domain="LogiLog.app" src="https://plausible.io/js/script.js"></script>
```

Custom events to track (via `plausible()` JS API):

| Event                | When                                             |
| -------------------- | ------------------------------------------------ |
| `log-file-opened`    | User opens a log file via File System Access API |
| `analysis-started`   | Anomaly detection begins                         |
| `analysis-complete`  | Results rendered (track duration as a prop)      |
| `model-loaded`       | First inference model fully loaded               |
| `webgpu-unsupported` | Browser falls back to WASM                       |
| `anomaly-detected`   | At least one anomaly flagged (count as prop)     |

These events provide product signal without capturing any log content.

### 10.5 Alerting

Since there is no server, alerting is limited to:

- **Sentry alerts**: Configure alert rules in Sentry for error rate spikes, new issues, and WebGPU-specific error fingerprints.
- **GitHub Actions notifications**: Failed CI jobs notify via GitHub's built-in email/Slack integration.
- **Uptime monitoring**: Use a free tier of [Better Uptime](https://betterstack.com/better-uptime) or [UptimeRobot](https://uptimerobot.com) to ping the GitHub Pages URL and alert on downtime (GitHub Pages outages).

---

## 11. Security

### 11.1 Content Security Policy

The CSP must accommodate:

- WebGPU (requires `unsafe-eval` for shader compilation in some browsers)
- WASM execution (requires `wasm-unsafe-eval`)
- HuggingFace Hub model downloads (`connect-src`)
- Sentry DSN reporting (`connect-src`)
- Inline scripts are prohibited

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  connect-src 'self'
    https://huggingface.co
    https://cdn-lfs.huggingface.co
    https://*.sentry.io
    https://plausible.io;
  worker-src 'self' blob:;
  img-src 'self' data: blob:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'none';
  upgrade-insecure-requests;
```

**Implementation**: GitHub Pages cannot set HTTP headers. Inject CSP via a `<meta>` tag in `index.html`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co https://*.sentry.io https://plausible.io;
  worker-src 'self' blob:;
  img-src 'self' data: blob:;
  font-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'none';
"
/>
```

Note: CSP via `<meta>` does not support `frame-ancestors` or `report-uri`. For those directives, a reverse proxy (Cloudflare Worker, §3.4) is required.

**Note on `unsafe-eval`**: WebGPU shader compilation in some Chromium versions requires `unsafe-eval` in addition to `wasm-unsafe-eval`. Audit browser requirements at release time and add only if browser support data confirms it is needed. Track this as a known gap.

### 11.2 Subresource Integrity

All CDN-loaded resources (if any) must use SRI. Plausible's script is the only external script — load it without an integrity attribute (Plausible's script is intentionally versioned without a fixed hash). If this is unacceptable, self-host the Plausible script.

For local assets (all JS/CSS chunks), Vite generates content-addressed filenames (`[name]-[hash].js`), which provides equivalent guarantees to SRI — the filename itself is the integrity check.

### 11.3 Dependency Auditing in CI

The `audit` job in the CI workflow (§2.2) runs `pnpm audit --audit-level=high` on every PR and push to main. This:

- Blocks merges on high/critical CVEs.
- Allows moderate/low advisories through (tracked but not blocking).
- Is supplemented by the weekly audit workflow (§2.3) which creates GitHub Issues for actionable findings.

**Dependabot**: Enable automated dependency PRs in `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: '/'
    schedule:
      interval: weekly
      day: monday
      time: '09:00'
      timezone: 'UTC'
    # Limit open PRs to avoid noise.
    open-pull-requests-limit: 5
    # Group all non-major updates into a single PR per week.
    groups:
      minor-and-patch:
        update-types:
          - 'minor'
          - 'patch'
    # Separate PR for major updates (requires manual review).
    # Major updates are not grouped — they each get individual attention.
    ignore: []
    labels:
      - dependencies

  - package-ecosystem: github-actions
    directory: '/'
    schedule:
      interval: monthly
    labels:
      - dependencies
      - ci
```

### 11.4 Secret Scanning

Enable GitHub's built-in secret scanning in **Settings > Security > Secret scanning**. Add a `.gitleaks.toml` for local pre-commit scanning:

```toml
# .gitleaks.toml
title = "LogiLog secret scanning rules"

[allowlist]
  description = "Allowlisted test fixtures"
  regexes = [
    # Example: allow fake API keys in test fixtures.
    '''FAKE_KEY_FOR_TESTING''',
  ]
```

Install Gitleaks as a pre-commit hook:

```bash
# .husky/pre-commit (append to existing hook)
gitleaks protect --staged --no-banner
```

### 11.5 Security Headers Summary

| Header                         | Value                             | Delivery Method                        |
| ------------------------------ | --------------------------------- | -------------------------------------- |
| `Cross-Origin-Opener-Policy`   | `same-origin`                     | Service worker (prod), Vite dev server |
| `Cross-Origin-Embedder-Policy` | `require-corp`                    | Service worker (prod), Vite dev server |
| `Content-Security-Policy`      | (see §11.1)                       | `<meta>` tag in `index.html`           |
| `X-Content-Type-Options`       | `nosniff`                         | Cloudflare Worker (if used)            |
| `Referrer-Policy`              | `strict-origin-when-cross-origin` | Cloudflare Worker (if used)            |
| `Permissions-Policy`           | `interest-cohort=()`              | Cloudflare Worker (if used)            |

Without a Cloudflare Worker, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` cannot be set as HTTP headers via GitHub Pages. They can be approximated via meta tags for some directives, but not all. Document this as a known limitation of the GitHub Pages deployment model.

---

## Appendix A: Required Secrets

Add these in **Settings > Secrets and variables > Actions > Repository secrets**:

| Secret                  | Required for              | Notes                                                                    |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `VITE_SENTRY_DSN`       | Error tracking            | Sentry project DSN. Get from Sentry project settings.                    |
| `SENTRY_AUTH_TOKEN`     | Release source map upload | Create at sentry.io/settings/auth-tokens/ with `project:releases` scope. |
| `SENTRY_ORG`            | Release source map upload | Your Sentry organization slug.                                           |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI PR comments | Install the Lighthouse CI GitHub App.                                    |
| `NETLIFY_AUTH_TOKEN`    | PR previews (optional)    | Personal access token from Netlify.                                      |
| `NETLIFY_SITE_ID`       | PR previews (optional)    | Site ID from Netlify site settings.                                      |

## Appendix B: Required `package.json` Scripts

```json
{
  "scripts": {
    "prebuild": "cp node_modules/coi-serviceworker/coi-serviceworker.js public/coi-serviceworker.js",
    "predev": "cp node_modules/coi-serviceworker/coi-serviceworker.js public/coi-serviceworker.js",
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0",
    "format": "prettier --write src",
    "format:check": "prettier --check src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lhci": "lhci autorun"
  }
}
```

## Appendix C: File Structure Created by This Spec

```
.github/
  workflows/
    ci.yml                    # Main CI + deploy workflow
    dependency-update.yml     # Weekly security audit
    release.yml               # release-please + publish
  pull_request_template.md
  dependabot.yml
lighthouserc.json
.gitleaks.toml
scripts/
  check-bundle-size.mjs
cloudflare/
  worker.js                   # Optional COOP/COEP proxy
  wrangler.toml               # Optional Cloudflare config
public/
  coi-serviceworker.js        # Copied from node_modules at build time
src/
  config.ts                   # Typed env variable access
  monitoring/
    sentry.ts                 # Sentry initialization
  inference/
    model-loader.ts           # Transformers.js setup
    cache-manager.ts          # IndexedDB cache version management
.env
.env.development
.env.production
vite.config.ts
```
