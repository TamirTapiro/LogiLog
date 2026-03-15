# Contributing to LogiLog

Thank you for your interest in contributing! LogiLog is a browser-native semantic log analysis tool and every contribution — whether a bug fix, feature, docs improvement, or test — helps make incident response better for engineers everywhere.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [Code Standards](#code-standards)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Getting Help](#getting-help)

## Prerequisites

Before getting started, ensure you have:

- **Node.js 20+** — check with `node --version`
- **npm 10+** — check with `npm --version`
- **Git** — for version control
- **Chrome 113+** — required to run the app locally (WebGPU)
- Basic TypeScript and React knowledge is helpful but not required

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/TamirTapiro/Logilog.git
cd Logilog
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Dev Server

```bash
npm run dev
```

Open `http://localhost:5173/LogiLog/` in Chrome 113+.

### 4. Enable AI Forensics (Optional)

Create a `.env` file in the project root:

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Get a key at [console.anthropic.com](https://console.anthropic.com). The Forensics tab works without a key using built-in heuristic analysis.

### 5. Run the Test Suite

```bash
npm test              # unit tests (Vitest)
npm run test:node     # Node.js pipeline integration tests
npm run test:e2e      # Playwright end-to-end tests
```

## Project Structure

```
Logilog/
├── src/
│   ├── components/        # React UI components
│   ├── workers/           # Web Workers (parse, inference)
│   ├── store/             # Zustand state
│   ├── lib/               # Core pipeline (clustering, anomaly detection)
│   ├── reporters/         # Vitest / Jest reporters
│   └── cli/               # Node.js CLI entry point
├── test/                  # Unit and integration tests
├── e2e/                   # Playwright end-to-end tests
├── docs/                  # Screenshots and documentation assets
├── scripts/               # Build helper scripts
├── .github/
│   ├── workflows/         # CI, deploy, publish, lighthouse
│   └── ISSUE_TEMPLATE/    # Bug and feature templates
├── vite.config.ts         # Web app build
├── tsup.config.ts         # npm package build
└── package.json
```

## Running Tests

### Unit Tests

```bash
npm test
```

Runs all Vitest unit tests in the `test/` directory.

### Node.js Pipeline Tests

```bash
npm run test:node
```

Runs integration tests for the Node.js analysis pipeline (no browser required).

### CLI Tests

```bash
npm run test:cli
```

Runs end-to-end CLI smoke tests.

### End-to-End Tests

```bash
npm run test:e2e
```

Runs Playwright browser tests. Requires Chrome to be installed.

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## Code Standards

### TypeScript

- **Strict mode is required** — `"strict": true` is enabled in all tsconfig files
- **Avoid `any`** — use specific types; if unavoidable, add a `// eslint-disable-next-line` comment with a reason
- **Export types explicitly** — all public API surfaces must be fully typed

### React

- Use functional components and hooks
- Colocate component state with the component unless it needs to be shared
- Use Zustand for cross-component state
- Prefer `react-window` virtualization for lists that could contain thousands of items

### Naming Conventions

| Entity                | Convention       | Example             |
| --------------------- | ---------------- | ------------------- |
| React components      | PascalCase       | `AnomalyPanel`      |
| Functions / variables | camelCase        | `detectAnomalies`   |
| Constants             | UPPER_SNAKE_CASE | `MAX_CLUSTERS`      |
| File names            | kebab-case       | `anomaly-panel.tsx` |

### Performance

LogiLog processes log files with millions of lines. Before introducing new operations on the hot path (log parsing, embedding, clustering), consider:

- Can this run in a Web Worker?
- Is the operation O(n) or better?
- Will `react-window` virtualization prevent DOM bloat?

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
type(scope): subject

body (optional)

footer (optional — e.g. Closes #123)
```

### Types

| Type       | When to use                           |
| ---------- | ------------------------------------- |
| `feat`     | New feature                           |
| `fix`      | Bug fix                               |
| `docs`     | Documentation only                    |
| `style`    | Formatting, no logic change           |
| `refactor` | Restructuring without behavior change |
| `perf`     | Performance improvement               |
| `test`     | Adding or updating tests              |
| `chore`    | Build process, dependency updates, CI |

### Scope (optional but recommended)

Use the area of the codebase: `ui`, `inference`, `cli`, `workers`, `ci`, `docs`, `deps`.

### Examples

```
feat(inference): add cosine distance threshold configuration

Allow users to tune the anomaly sensitivity via VITE_ANOMALY_THRESHOLD.
Defaults to 0.35 (existing behaviour).

Closes #42
```

```
fix(workers): handle empty log files without crashing

Previously the parse worker threw an unhandled rejection when the
input file was 0 bytes.

Closes #57
```

## Pull Request Process

### Before Submitting

1. **Create a feature branch** from `main`

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** and commit with conventional commit messages

3. **Run all checks locally**

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

4. **Rebase against main**

   ```bash
   git fetch origin
   git rebase origin/main
   ```

### Submitting Your PR

1. Push your branch and open a pull request against `main`
2. Fill in the PR template completely
3. Link any related issues with `Closes #<number>`

### CI Requirements

All PRs must pass:

- **Lint** — ESLint and Prettier checks
- **Type Check** — TypeScript strict compilation
- **Tests** — Vitest unit tests
- **Build** — Production build succeeds

GitHub Actions will run these automatically. The `CI passed` check must be green before merging.

### Code Review

- At least one maintainer approval is required before merging
- Feedback is constructive — we aim to improve the code together
- Once approved and CI is green, the PR author may merge

## Getting Help

- **Questions?** — Open a [GitHub Discussion](https://github.com/TamirTapiro/Logilog/discussions)
- **Found a bug?** — Open a [GitHub Issue](https://github.com/TamirTapiro/Logilog/issues/new/choose) using the Bug Report template
- **Feature idea?** — Open an issue using the Feature Request template

## Thank You

Every contribution makes LogiLog better for engineers debugging incidents. We appreciate your time and effort.
