# LogiLog — UX/UI Design Specification

**Version:** 1.0
**Status:** Production
**Date:** 2026-03-14

---

## Table of Contents

1. [User Personas](#1-user-personas)
2. [User Journey Maps](#2-user-journey-maps)
3. [Design System](#3-design-system)
4. [Component Library Specs](#4-component-library-specs)
5. [Screen Layouts](#5-screen-layouts)
6. [Interactive Timeline Design](#6-interactive-timeline-design)
7. [Information Architecture](#7-information-architecture)
8. [Micro-interactions](#8-micro-interactions)
9. [Responsive Behavior](#9-responsive-behavior)
10. [Accessibility](#10-accessibility)
11. [Dark-Only Mode Decision](#11-dark-only-mode-decision)

---

## 1. User Personas

### Persona A — "The Firefighter" (Primary)

**Name:** Morgan Chen
**Role:** Site Reliability Engineer, 6 years experience
**Context:** On-call rotation, 3:17 AM. PagerDuty fired. p99 latency spiked to 8s across the payment service. The runbook says "pull last 4 hours of app logs."

**Goals:**

- Find the root cause in under 10 minutes
- Confirm the failure timeline before waking up the on-call developer
- Rule out infrastructure causes vs. application code causes

**Pain Points:**

- Cloud log platforms are slow, expensive, and require VPN
- `grep` across millions of lines gives false positives without semantic understanding
- Context is always missing — needs the 50 lines _before_ the error, not just the error itself
- Cognitive load is extremely high at 3 AM; UI must not demand careful reading

**Mental Model:** Thinks in timelines. "When did this start? What changed right before?"

**Device:** MacBook Pro, 2560×1600, always dark mode, terminal open next to browser.

**Success Criteria:** Identifies the anomaly cluster, reads the Smart Context forensic chain, screenshots for the post-mortem. Done in < 8 minutes.

---

### Persona B — "The Investigator" (Secondary)

**Name:** Dario Santos
**Role:** Senior Backend Engineer, Python/Go
**Context:** Daytime. Staging environment is mysteriously slow on Tuesdays. Dario wants to understand why. No urgency, but wants depth.

**Goals:**

- Understand log volume patterns over a long time window (days)
- Find clusters of similar errors that look like one issue but might be several
- Export findings for a GitHub issue comment

**Pain Points:**

- Log patterns that look identical mask different root causes
- Wants to toggle noisy health-check logs out of the view without losing them
- Tool-switching fatigue: doesn't want to leave the browser tab

**Mental Model:** Thinks in patterns. "Are these the same error or different?"

**Device:** External 4K monitor (3840×2160), macOS. May have 12+ browser tabs open.

**Success Criteria:** Clusters understood, noise filtered, pattern summarized in natural language.

---

### Persona C — "The Auditor" (Tertiary)

**Name:** Priya Mehta
**Role:** DevOps/Platform Engineer
**Context:** Quarterly security audit. Needs to scan 90 days of access logs for anomalous authentication patterns. Privacy is a hard requirement — cannot use SaaS tools.

**Goals:**

- Verify no logs leave the browser (privacy-first)
- Process large files (multi-GB) without crashing
- Find semantic anomalies across authentication and access patterns

**Pain Points:**

- SaaS log tools are disqualified by compliance team
- Existing tools require server-side upload
- File sizes exceed what typical web tools can handle

**Mental Model:** Thinks in compliance. "Prove this ran locally. Show me what's unusual."

**Success Criteria:** Processes large file locally, anomalies flagged, no network requests made during analysis (verifiable via DevTools Network tab).

---

## 2. User Journey Maps

### Primary Journey: Drop File → Wait → Explore Anomalies

```
TRIGGER: User has a log file and a question ("what broke?")
```

**Step 1 — Land on tool**

- User arrives at LogiLog.github.io
- Sees: Empty drop zone, brief headline explaining the tool, privacy assurance badge
- Feels: Cautiously optimistic. "Will this actually work in a browser?"
- UI: Full-screen drop zone, no clutter. One clear CTA.

**Step 2 — Drop / select file**

- User drags file from Finder or clicks "Browse"
- File System Access API streams the file
- Feels: Hopeful. Expecting something to happen immediately.
- UI: Drop zone activates with border glow. File name appears. Size shown.

**Step 3 — Parsing begins (0–3s)**

- Web Worker spins up, begins streaming parse
- Feels: Impatient but watching. "Is this working?"
- UI: Progress screen appears within 500ms. "Parsing log file..." with animated progress bar and line count ticking up.
- **5-Second Rule:** UI must show this state before 5s. Target: 300ms after file is accepted.

**Step 4 — Model load (3–15s, first run only)**

- If WebGPU model not in IndexedDB cache, download begins
- Feels: This is where users bail if not informed.
- UI: Separate progress stage "Loading AI model (first run only)" with byte counter and estimated time. Honest, not vague.

**Step 5 — Analysis in progress (variable)**

- Semantic analysis running in worker
- Feels: Trusting the process if progress is visible.
- UI: Timeline begins populating in real-time as chunks complete. Progress indicator shows "Analyzing 45,000 / 128,000 lines."

**Step 6 — Analysis complete**

- Full results rendered
- Feels: Urgently scanning for the anomaly.
- UI: Timeline fully rendered. Anomaly cards appear in sidebar. Highest-severity card auto-focused. Toast notification: "Found 7 anomalies across 4 clusters."

**Step 7 — Explore anomaly**

- User clicks anomaly card or spike in timeline
- Feels: This is the payoff moment.
- UI: Log viewer panel scrolls to anomaly. Smart Context panel expands showing the 50–100 lines of forensic context with natural-language summary above.

**Step 8 — Understand cluster**

- User switches to Clusters tab
- Feels: Pattern recognition click.
- UI: Cluster cards showing similar log groups, count badges, collapse/expand behavior.

**Step 9 — Export / share**

- User copies anomaly context or takes screenshot
- Feels: Task complete.
- UI: Copy button on Smart Context block. "Open in new tab" for full context view.

---

### Secondary Journey: Returning User with Cached Model

Same as above but Steps 3–4 compress to < 3s total because model weights are in IndexedDB. A "Model ready (cached)" badge communicates this instantly.

---

## 3. Design System

### 3.1 Color Palette

LogiLog uses a terminal-native dark palette. The primary background references the darkest values of VS Code's default dark theme and classic terminal emulators (iTerm2 "Dark Background").

#### Base Colors

| Token                    | Hex       | Usage                                               |
| ------------------------ | --------- | --------------------------------------------------- |
| `--color-bg-base`        | `#0D0F12` | Page background, deepest layer                      |
| `--color-bg-surface`     | `#141720` | Cards, panels, modals                               |
| `--color-bg-elevated`    | `#1C2030` | Hover states, selected rows, tooltips               |
| `--color-bg-inset`       | `#0A0C0F` | Code/log line backgrounds, input fields             |
| `--color-border-subtle`  | `#232840` | Dividers, card borders                              |
| `--color-border-default` | `#2E3555` | Active borders, focus rings (before accent applied) |
| `--color-border-strong`  | `#4A5280` | High-emphasis borders                               |

#### Text Colors

| Token                    | Hex       | Usage                                         |
| ------------------------ | --------- | --------------------------------------------- |
| `--color-text-primary`   | `#E8EAF0` | Primary readable text                         |
| `--color-text-secondary` | `#8892B0` | Secondary labels, metadata                    |
| `--color-text-tertiary`  | `#546080` | Timestamps, disabled text                     |
| `--color-text-inverse`   | `#0D0F12` | Text on bright accent backgrounds             |
| `--color-text-code`      | `#CDD6F4` | Monospace log line text (Catppuccin-inspired) |

#### Accent — Terminal Green (Primary Interactive)

| Token                | Hex       | Usage                                                            |
| -------------------- | --------- | ---------------------------------------------------------------- |
| `--color-accent-500` | `#00FF88` | Primary interactive: hover borders, active states, progress bars |
| `--color-accent-400` | `#33FFAA` | Secondary accent, lighter variant                                |
| `--color-accent-300` | `#66FFbb` | Disabled accent                                                  |
| `--color-accent-900` | `#00261A` | Accent backgrounds (low-opacity fills)                           |

> Contrast: `--color-accent-500` (#00FF88) on `--color-bg-base` (#0D0F12) = **13.4:1** — exceeds WCAG AAA.

#### Anomaly Severity Colors

| Token                   | Hex       | Severity                    | Contrast on `--color-bg-surface` |
| ----------------------- | --------- | --------------------------- | -------------------------------- |
| `--color-critical`      | `#FF4444` | Critical / P0               | 5.8:1 (AA pass)                  |
| `--color-critical-bg`   | `#2A0A0A` | Critical card background    | —                                |
| `--color-warning`       | `#FFB700` | Warning / P1                | 8.2:1 (AAA pass)                 |
| `--color-warning-bg`    | `#271E00` | Warning card background     | —                                |
| `--color-info`          | `#4DA6FF` | Informational / P2          | 6.1:1 (AA pass)                  |
| `--color-info-bg`       | `#061828` | Info card background        | —                                |
| `--color-anomaly-spike` | `#FF6B35` | Timeline anomaly spike bars | 5.2:1 (AA pass)                  |

#### Semantic Log Level Colors

| Token               | Hex       | Log Level |
| ------------------- | --------- | --------- |
| `--color-log-error` | `#FF4D4D` | ERROR     |
| `--color-log-warn`  | `#FFD166` | WARN      |
| `--color-log-info`  | `#06D6A0` | INFO      |
| `--color-log-debug` | `#828FA3` | DEBUG     |
| `--color-log-trace` | `#546080` | TRACE     |
| `--color-log-fatal` | `#FF006E` | FATAL     |

#### Utility Colors

| Token             | Hex                      | Usage                             |
| ----------------- | ------------------------ | --------------------------------- |
| `--color-success` | `#00C853`                | Success toasts, completion states |
| `--color-overlay` | `rgba(13, 15, 18, 0.85)` | Modal overlays                    |

---

### 3.2 Typography

**Decision:** Use system monospace stacks for log content (performance, familiarity for devs) and a geometric sans for UI chrome (legibility, modernity).

#### Font Families

```css
/* UI Chrome — geometric sans, clean and technical */
--font-ui:
  'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial,
  sans-serif;

/* Log Content — monospace, high legibility at small sizes */
--font-mono:
  'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Consolas', 'Liberation Mono',
  monospace;
```

**Note:** JetBrains Mono is loaded via Google Fonts as a single 400/500 weight subset. Inter is loaded as 400/500/600. Total font payload: ~80KB.

#### Type Scale

| Token            | Size             | Weight | Line Height | Letter Spacing | Usage                         |
| ---------------- | ---------------- | ------ | ----------- | -------------- | ----------------------------- |
| `--text-2xl`     | 24px / 1.5rem    | 600    | 1.3         | -0.02em        | Page headline                 |
| `--text-xl`      | 20px / 1.25rem   | 600    | 1.4         | -0.01em        | Section headers, panel titles |
| `--text-lg`      | 16px / 1rem      | 500    | 1.5         | 0              | Anomaly card titles           |
| `--text-md`      | 14px / 0.875rem  | 400    | 1.6         | 0              | Body text, descriptions       |
| `--text-sm`      | 12px / 0.75rem   | 400    | 1.5         | 0.01em         | Labels, metadata, timestamps  |
| `--text-xs`      | 11px / 0.6875rem | 400    | 1.4         | 0.02em         | Badge text, log level tags    |
| `--text-code-md` | 13px / 0.8125rem | 400    | 1.7         | 0              | Log line content (monospace)  |
| `--text-code-sm` | 12px / 0.75rem   | 400    | 1.6         | 0              | Compact log view (monospace)  |

---

### 3.3 Spacing Scale

An 4px base unit (0.25rem) with a standard 8-point grid.

| Token        | Value   | px equiv |
| ------------ | ------- | -------- |
| `--space-0`  | 0       | 0        |
| `--space-1`  | 0.25rem | 4px      |
| `--space-2`  | 0.5rem  | 8px      |
| `--space-3`  | 0.75rem | 12px     |
| `--space-4`  | 1rem    | 16px     |
| `--space-5`  | 1.25rem | 20px     |
| `--space-6`  | 1.5rem  | 24px     |
| `--space-8`  | 2rem    | 32px     |
| `--space-10` | 2.5rem  | 40px     |
| `--space-12` | 3rem    | 48px     |
| `--space-16` | 4rem    | 64px     |
| `--space-20` | 5rem    | 80px     |
| `--space-24` | 6rem    | 96px     |

---

### 3.4 Shape Tokens

#### Border Radius

| Token           | Value  | Usage                                    |
| --------------- | ------ | ---------------------------------------- |
| `--radius-sm`   | 4px    | Badges, inline tags, small chips         |
| `--radius-md`   | 6px    | Buttons, inputs, small cards             |
| `--radius-lg`   | 10px   | Panels, cards                            |
| `--radius-xl`   | 16px   | Modals, large surfaces                   |
| `--radius-full` | 9999px | Pills, toggle switches, circular avatars |

#### Shadows / Glow

Terminal aesthetic uses glow effects (colored box-shadows) rather than traditional drop shadows.

| Token                   | Value                                                              | Usage                                      |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `--shadow-surface`      | `0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6)`             | Cards resting on bg                        |
| `--shadow-elevated`     | `0 4px 12px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)`            | Hover cards, tooltips                      |
| `--shadow-modal`        | `0 16px 48px rgba(0,0,0,0.7)`                                      | Modals                                     |
| `--glow-accent`         | `0 0 12px rgba(0, 255, 136, 0.25), 0 0 4px rgba(0, 255, 136, 0.4)` | Active/focused accent elements             |
| `--glow-critical`       | `0 0 12px rgba(255, 68, 68, 0.3), 0 0 4px rgba(255, 68, 68, 0.5)`  | Critical anomaly highlights                |
| `--glow-warning`        | `0 0 10px rgba(255, 183, 0, 0.25)`                                 | Warning anomaly highlights                 |
| `--glow-timeline-spike` | `0 0 8px rgba(255, 107, 53, 0.6)`                                  | Timeline spike bars on hover               |
| `--focus-ring`          | `0 0 0 2px #0D0F12, 0 0 0 4px #00FF88`                             | Keyboard focus indicator (offset + accent) |

---

### 3.5 Animation & Transition Guidelines

```css
/* Durations */
--duration-instant: 50ms; /* Immediate feedback: button press, toggle */
--duration-fast: 150ms; /* Hover states, color transitions */
--duration-normal: 250ms; /* Panel slides, accordion expand */
--duration-slow: 400ms; /* Page transitions, skeleton fade-in */
--duration-crawl: 600ms; /* Progress bar fill, loading shimmer cycle */

/* Easing curves */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1); /* Material standard */
--ease-out: cubic-bezier(0, 0, 0.2, 1); /* Entering elements */
--ease-in: cubic-bezier(0.4, 0, 1, 1); /* Exiting elements */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Satisfying bouncy: toasts, popovers */
```

**Reduced Motion Policy:**
All animations that are decorative (shimmer loaders, floating particles, pulsing glows) MUST be disabled when `prefers-reduced-motion: reduce` is active. Functional animations (progress bars, panel slides) may continue at 50% speed. Loading spinners become static indicators.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  /* Exception: progress bars remain functional at reduced speed */
  .progress-bar-fill {
    transition-duration: 150ms !important;
  }
}
```

---

## 4. Component Library Specs

### 4.1 Drop Zone

The primary entry point. Occupies center of empty state screen.

**Anatomy:**

```
┌─────────────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════════════╗   │
│  ║                                               ║   │
│  ║         [  terminal cursor icon  ]            ║   │
│  ║                                               ║   │
│  ║    Drop your log file here                    ║   │
│  ║    or click to browse                         ║   │
│  ║                                               ║   │
│  ║    .log  .txt  .json  .gz  .ndjson            ║   │
│  ║                                               ║   │
│  ╚═══════════════════════════════════════════════╝   │
└─────────────────────────────────────────────────────┘
```

**States:**

| State        | Border               | Background             | Text                     | Behavior                    |
| ------------ | -------------------- | ---------------------- | ------------------------ | --------------------------- |
| Default      | `2px dashed #2E3555` | `#0A0C0F`              | `--color-text-secondary` | Static                      |
| Hover        | `2px dashed #00FF88` | `rgba(0,255,136,0.03)` | `--color-text-primary`   | `--glow-accent` on border   |
| Drag-over    | `2px solid #00FF88`  | `rgba(0,255,136,0.06)` | `--color-accent-500`     | Pulsing glow, scale(1.01)   |
| Drag-invalid | `2px solid #FF4444`  | `rgba(255,68,68,0.04)` | `#FF4444`                | Error glow, shake animation |

**Dimensions:**

- Max-width: 640px
- Min-height: 320px
- Padding: 48px
- Border-radius: `--radius-xl` (16px)

**Typography:**

- Main text: `--text-xl`, weight 500, `--color-text-primary`
- Sub text: `--text-md`, `--color-text-secondary`
- File format hints: `--text-sm`, `--color-text-tertiary`, monospace font

**Interaction:**

- The entire card is keyboard-focusable (role="button", tabIndex=0)
- Enter/Space triggers the file browser dialog
- Focus state: `--focus-ring` applied to card border

---

### 4.2 Progress Bar (Analysis Pipeline)

Used on the loading screen. Multi-stage, inline with stage labels.

**Anatomy:**

```
Parsing log file                              45,823 / 128,000 lines
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░
▲ current stage
```

**Track:**

- Height: 4px
- Background: `#1C2030` (`--color-bg-elevated`)
- Border-radius: `--radius-full`

**Fill:**

- Background: `--color-accent-500` (#00FF88) for active stage
- Animated shimmer overlay: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)` moving left-to-right, 1.5s cycle
- Transition on width: `transition: width 300ms --ease-out`

**Multi-stage indicator:** Three dots below the bar showing pipeline stages (Parsing → Embedding → Analysis). Active stage dot: 8px, accent color. Completed: 8px, `#2E3555`. Pending: 6px, `#1C2030`.

**States:**

- `indeterminate`: Full-width oscillating shimmer when total is unknown
- `determinate`: Fills based on percentage
- `error`: Fill color becomes `--color-critical`, shimmer removed
- `complete`: Briefly holds at 100%, then transitions to success state

---

### 4.3 Anomaly Card

The primary result unit. Rendered in the sidebar panel.

**Anatomy:**

```
┌──────────────────────────────────────────────────────┐
│ ● CRITICAL              [score: 0.94]  [12:34:21 UTC]│
│──────────────────────────────────────────────────────│
│ Connection pool exhausted during payment processing   │
│                                                      │
│ payment-service.go:234 · 3 occurrences               │
│ ──────────────────────────────────────────────────── │
│ [Smart Context ↗]           [Jump to Timeline ↗]     │
└──────────────────────────────────────────────────────┘
```

**States:**

| State            | Border-left                                         | Background | Shadow                                 |
| ---------------- | --------------------------------------------------- | ---------- | -------------------------------------- |
| Critical default | `3px solid #FF4444`                                 | `#141720`  | `--shadow-surface`                     |
| Critical hover   | `3px solid #FF4444`                                 | `#1C2030`  | `--glow-critical`, `--shadow-elevated` |
| Warning default  | `3px solid #FFB700`                                 | `#141720`  | `--shadow-surface`                     |
| Warning hover    | `3px solid #FFB700`                                 | `#1C2030`  | `--glow-warning`                       |
| Info default     | `3px solid #4DA6FF`                                 | `#141720`  | `--shadow-surface`                     |
| Selected         | border-left 3px + full border 1px in severity color | `#1C2030`  | severity glow                          |
| Collapsed        | shows only first line + severity dot                | —          | —                                      |

**Dimensions:**

- Padding: 16px
- Border-radius: `--radius-lg` (10px)
- Gap between cards: 8px
- Severity dot: 8px circle, `border-radius: 50%`, filled with severity color, pulsing animation (2s) for critical

**Typography:**

- Severity label: `--text-xs`, weight 600, uppercase, letter-spacing: 0.08em, severity color
- Score badge: `--text-xs`, monospace, `--color-text-tertiary`
- Timestamp: `--text-xs`, monospace, `--color-text-tertiary`
- Title: `--text-md`, weight 500, `--color-text-primary`
- Source reference: `--text-sm`, monospace, `--color-text-secondary`

---

### 4.4 Log Line Row

The atomic unit of the log viewer. Must be optimized for virtualized rendering (thousands of rows).

**Anatomy:**

```
 1234 │ 12:34:21.456 │ ERROR │ payment-svc  │ Connection pool exhausted: max=50 current=50
```

**Column layout (fixed-width columns to align for readability):**

- Line number: 52px fixed, right-aligned, `--color-text-tertiary`, `--text-code-sm`
- Divider: `1px solid #232840` (`--color-border-subtle`)
- Timestamp: 120px fixed, `--color-text-tertiary`, `--text-code-sm`, monospace
- Log level tag: 52px fixed, centered, colored badge (see Semantic Log Level Colors)
- Service name: 120px fixed, truncated with ellipsis, `--color-text-secondary`
- Message: flex-fill, `--color-text-code`, `--text-code-md`, monospace

**States:**

| State                | Background                                                 | Left border                       |
| -------------------- | ---------------------------------------------------------- | --------------------------------- |
| Default (even)       | `#0A0C0F`                                                  | none                              |
| Default (odd)        | `#0D0F12`                                                  | none                              |
| Hover                | `#141720`                                                  | none                              |
| Selected             | `#1C2030`                                                  | `3px solid --color-accent-500`    |
| Anomaly-flagged      | `rgba(255,107,53,0.06)`                                    | `3px solid --color-anomaly-spike` |
| Smart Context window | `rgba(77,166,255,0.04)`                                    | `2px solid --color-info`          |
| Search match         | highlighted term: `rgba(255,183,0,0.3)` background on span | —                                 |

**Row height:** 28px (compact), 36px (comfortable mode). Toggle in settings.

**Log Level Tag (badge):**

- Dimensions: 42px × 16px
- Border-radius: `--radius-sm` (4px)
- Font: `--text-xs`, weight 600, monospace, uppercase
- Background opacity: 15% of text color
- ERROR: text `#FF4D4D`, bg `rgba(255,77,77,0.15)`
- WARN: text `#FFD166`, bg `rgba(255,209,102,0.15)`
- INFO: text `#06D6A0`, bg `rgba(6,214,160,0.15)`
- DEBUG: text `#828FA3`, bg `rgba(130,143,163,0.12)`
- FATAL: text `#FF006E`, bg `rgba(255,0,110,0.2)`, bold border

---

### 4.5 Timeline Bar (single bar unit)

Each vertical bar in the timeline chart. Built with SVG/Recharts.

**Normal bar:**

- Fill: `#2E3555`
- Hover fill: `#4A5280`
- Width: dynamic based on total time span, minimum 2px, maximum 16px

**Anomaly spike bar:**

- Fill: `--color-anomaly-spike` (#FF6B35)
- On hover: `--glow-timeline-spike` applied, tooltip shown, cursor: crosshair
- Minimum height: 4px even for 0-count (to show the marker)

**Selected range:**

- Background overlay on selected bars: `rgba(0,255,136,0.08)`
- Border: `1px solid rgba(0,255,136,0.3)` on left/right edges of selection

---

### 4.6 Cluster Card

Represents a group of semantically similar log patterns.

**Anatomy:**

```
┌──────────────────────────────────────────────────────┐
│ PATTERN                                [342 entries]  │
│                                        [▼ expand]     │
│ "Database connection timeout after * ms"              │
│──────────────────────────────────────────────────────│
│ Timespan:  12:20 – 12:45 UTC (25 min span)            │
│ Services:  postgres-proxy, payment-svc                │
│ Severity:  ████████░░░░ WARN (82%)                   │
│──────────────────────────────────────────────────────│
│ [Expand 342 entries ↓]    [Dismiss noise ✕]           │
└──────────────────────────────────────────────────────┘
```

**States:**

- Collapsed: shows header + pattern + action buttons only
- Expanded: inline virtualized list of matching log lines
- Dismissed: muted appearance (`--color-text-tertiary`), entry count shown in strikethrough, button changes to "Restore"

**Pattern template string:** Wildcards shown as `*` in accent color (`--color-accent-500`), making variable parts visually distinct from the constant pattern.

---

### 4.7 Smart Context Panel

A dedicated panel showing the forensic context capture for a selected anomaly.

**Anatomy:**

```
┌──────────────────────────────────────────────────────┐
│ Smart Context                            [✕ close]   │
│ Anomaly: Connection pool exhausted                    │
│──────────────────────────────────────────────────────│
│ AI SUMMARY                                           │
│ ┌──────────────────────────────────────────────────┐ │
│ │ The payment service began receiving elevated     │ │
│ │ traffic at 12:32 UTC. Connection pool saturation │ │
│ │ occurred 90 seconds later as requests queued.    │ │
│ │ Root cause: pool size (max=50) insufficient for  │ │
│ │ observed traffic spike (3.2× baseline).          │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ FORENSIC CONTEXT (lines 4,521–4,581)                 │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [log line viewer — 60 lines]                    │ │
│ │ highlighted: the anomaly line                   │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [Copy context]  [Open full view]  [Export JSON]      │
└──────────────────────────────────────────────────────┘
```

**AI Summary block:**

- Background: `#0A0C0F` (inset)
- Border-left: `3px solid #4DA6FF`
- Border-radius: `--radius-md`
- Font: `--text-md`, `--color-text-primary`, line-height 1.7
- Padding: 16px

---

### 4.8 Toast Notification

**Positions:** Bottom-right, 24px from edges.
**Stack:** Multiple toasts stack upward with 8px gap.
**Max width:** 380px
**Auto-dismiss:** 5s for success, 8s for error, never for critical actions.

**States:**

| Variant | Left border color | Icon           |
| ------- | ----------------- | -------------- |
| Success | `#00C853`         | checkmark      |
| Error   | `#FF4444`         | x-circle       |
| Info    | `#4DA6FF`         | info           |
| Warning | `#FFB700`         | alert-triangle |

**Entry animation:** Slide in from right: `translateX(calc(100% + 24px))` → `translateX(0)` over 300ms, `--ease-spring`.
**Exit animation:** `opacity: 1` → `opacity: 0` + `translateX(calc(100% + 24px))` over 200ms, `--ease-in`.

---

### 4.9 Navigation Tabs

Used to switch between Analysis, Clusters, and Timeline views.

**Anatomy:**

```
[ Analysis ]  [ Clusters · 4 ]  [ Timeline ]  [ Settings ⚙ ]
━━━━━━━━━
   active tab indicator (2px bottom border, accent color)
```

**States:**

- Active: `--color-text-primary`, `border-bottom: 2px solid #00FF88`, background transparent
- Hover: `--color-text-primary`, background `rgba(255,255,255,0.04)`
- Default: `--color-text-secondary`, no border

**Dimensions:**

- Height: 44px (touch-safe)
- Padding: 0 16px
- Gap between tabs: 4px
- Badge (count indicator): 18px pill, background `#2E3555`, `--text-xs` monospace

---

### 4.10 Privacy Badge

Shown in header and empty state. Critical for Persona C trust.

**Anatomy:**

```
[ 🔒 All analysis runs locally · No data leaves your browser ]
```

- Background: `rgba(0,255,136,0.06)`
- Border: `1px solid rgba(0,255,136,0.2)`
- Border-radius: `--radius-full`
- Padding: 6px 14px
- Font: `--text-xs`, `--color-accent-400`
- Icon: lock icon, 12px, same color

---

## 5. Screen Layouts

### 5.1 Empty State / File Drop Screen

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                  │
│ LogiLog                                    [🔒 Local · Private]        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                                                                         │
│                    ╔═══════════════════════════════╗                   │
│                    ║                               ║                   │
│                    ║      >_                        ║                   │
│                    ║                               ║                   │
│                    ║   Drop your log file here     ║                   │
│                    ║   or  [ Browse files ]        ║                   │
│                    ║                               ║                   │
│                    ║   .log  .txt  .json  .ndjson  ║                   │
│                    ║   .gz files supported         ║                   │
│                    ║                               ║                   │
│                    ╚═══════════════════════════════╝                   │
│                                                                         │
│             Semantic forensic log analysis · Runs in your browser       │
│                                                                         │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│   │ Anomaly         │  │ Smart Context   │  │ Log Clustering  │       │
│   │ Detection       │  │ Forensics       │  │ & Patterns      │       │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Header:**

- Height: 56px
- Background: `#141720` with `border-bottom: 1px solid #232840`
- Logo: "LogiLog" — `--text-xl`, weight 600, `--color-text-primary`. The ">" prefix character in `--color-accent-500`.
- Privacy badge: right-aligned

**Drop zone:**

- Centered in viewport, `max-width: 560px`, `min-height: 300px`
- Vertically centered in the available space below header

**Feature triptych:**

- Three equal cards below drop zone
- Each: `--radius-lg`, background `#141720`, border `1px solid #232840`
- Padding: 20px
- Icon: 24px, `--color-accent-500`
- Title: `--text-md`, weight 500
- Description: `--text-sm`, `--color-text-secondary`

---

### 5.2 Loading / Progress Screen

**5-Second Rule compliance strategy:**

- Transition FROM empty state to this screen occurs within **300ms** of file acceptance
- No blank screen, no unresponsive state
- User sees activity before 1 second has elapsed

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LogiLog                                    [🔒 Local · Private]        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    ┌───────────────────────────────────┐               │
│                    │  access_2024-12-14.log            │               │
│                    │  2.4 GB · 1,284,332 lines         │               │
│                    └───────────────────────────────────┘               │
│                                                                         │
│  ● PARSING LOG FILE                                                     │
│  ──────────────────────────────────────────────────────────━━━━░░░░░   │
│  45,823 / 1,284,332 lines              3%          ~12s remaining       │
│                                                                         │
│  ○ Loading AI model                                                     │
│  ────────────────────────────────────────────────────────────────────   │
│                                                                         │
│  ○ Semantic analysis                                                     │
│  ────────────────────────────────────────────────────────────────────   │
│                                                                         │
│                    ┌───────────────────────────────────┐               │
│                    │  Timeline building in real-time   │               │
│                    │  [live timeline preview...]       │               │
│                    └───────────────────────────────────┘               │
│                                                                         │
│  Processing happens entirely on your hardware.  No data is transmitted. │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Pipeline stage list:**

- Active stage: `--color-text-primary`, filled accent dot, progress bar active
- Pending stage: `--color-text-tertiary`, hollow dot, empty progress track
- Complete stage: `--color-success`, checkmark icon, full bar with success color

**File info card:**

- Background: `#141720`
- Border: `1px solid #2E3555`
- Border-radius: `--radius-lg`
- File name: `--text-lg`, monospace, `--color-text-primary`
- Metadata: `--text-sm`, `--color-text-secondary`

**Live timeline preview:**

- A low-fidelity bar chart begins rendering as lines are parsed
- Shows log volume over time BEFORE analysis is complete
- Marked with "Building..." label, animated left-to-right fill

**First-run model loading state:**

- Stage 2 ("Loading AI model") shows additional sub-progress: "Downloading model weights: 47 / 82 MB"
- After first load: "Model ready (cached)" with green checkmark, no download progress shown

---

### 5.3 Main Analysis View

The primary working screen. Three-panel layout.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LogiLog · access_2024.log                          [🔒] [New file]     │
├─────────────────────────────────────────────────────────────────────────┤
│ [ Analysis ]  [ Clusters · 4 ]  [ Timeline ]  [ Settings ⚙ ]           │
│──────────────────────────────────────────────────────────────────────── │
│  TIMELINE PANEL  (height: 140px, collapsible)                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ▁▂▃▂▁▂▄▅▆▇█▇▆▃▂▁  ↑↑  ▂▃▂▁▁▂▃█▇▅▂▁  ↑               ▂▃▁       │ │
│  │                                                                    │ │
│  │ 10:00       11:00      12:00 ↑ spike    13:00      14:00          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────┬──────────────────────────────────────────┤
│  SIDEBAR (320px)             │  LOG VIEWER (flex-fill)                 │
│                              │                                          │
│  ┌──────────────────────────┐│  [ search / filter bar ]                │
│  │ ● CRITICAL  0.94  12:34  ││  ──────────────────────────────────     │
│  │ Connection pool          ││  1234│12:32:01│INFO │payment │ Rcvd req │
│  │ exhausted                ││  1235│12:32:01│INFO │payment │ Rcvd req │
│  └──────────────────────────┘│  1236│12:32:02│WARN │pg-proxy│ Slow qry │
│  ┌──────────────────────────┐│ ▶1237│12:32:03│ERROR│payment │ Conn fail│
│  │ ⚠ WARNING  0.78  11:22  ││  1238│12:32:03│ERROR│payment │ Conn fail│
│  │ Auth token refresh       ││  1239│12:32:04│FATAL│payment │ Pool exhd│
│  │ failure rate elevated    ││  1240│12:32:04│ERROR│payment │ Req abort│
│  └──────────────────────────┘│                                          │
│                              │  ──────────────────────────────────      │
│  ┌──────────────────────────┐│  [Smart Context panel - if selected]    │
│  │ ● CRITICAL  0.89  12:39  ││                                          │
│  │ OOM killer invoked on    ││                                          │
│  │ worker-3 node            ││                                          │
│  └──────────────────────────┘│                                          │
│                              │                                          │
│  [7 anomalies · 4 clusters]  │                                          │
└──────────────────────────────┴──────────────────────────────────────────┘
```

**Layout Measurements:**

- Header: 56px
- Tab bar: 44px
- Timeline panel: 140px (collapsible to 32px tab)
- Sidebar: 320px fixed, `resize: horizontal` allowed (min 240px, max 480px)
- Log viewer: `flex: 1`, fills remaining width
- Smart context: slides up from bottom of log viewer at 320px height when open

**Sidebar:**

- Background: `#141720`
- Border-right: `1px solid #232840`
- Overflow-y: auto
- Padding: 12px
- Summary footer (pinned bottom): background `#0D0F12`, `border-top: 1px solid #232840`

**Log Viewer:**

- Background: `#0A0C0F`
- Uses virtual scrolling (only renders visible rows + 20px buffer above/below)
- Search bar: 40px height, sticky at top of log viewer panel

**Search/Filter Bar:**

- Input background: `#141720`
- Border: `1px solid #2E3555`, focus: `1px solid #00FF88` + `--glow-accent`
- Placeholder: "Search logs... (supports regex)"
- Filter chips: log levels can be toggled (ERROR, WARN, INFO, DEBUG, FATAL)
- Active filter chip: background `rgba(0,255,136,0.1)`, border `1px solid #00FF88`

---

### 5.4 Anomaly Detail View

Triggered when clicking an anomaly card or clicking a spike in the timeline. The Smart Context panel slides up within the log viewer.

```
LOG VIEWER with Smart Context panel open:

┌────────────────────────────────────────────────────────────────────────┐
│ [ search / filter bar ]                              [← back to list]  │
├────────────────────────────────────────────────────────────────────────┤
│  [log lines above context window — dimmed: opacity 0.4]                │
│  1234│12:32:01│INFO │payment │ Received request, queuing               │
│  1235│12:32:01│INFO │payment │ DB latency: 230ms (elevated)            │
├────────────────────────────────────────────────────────────────────────┤
│  SMART CONTEXT — lines 1,236–1,296  ·  60 lines                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ AI SUMMARY                                                       │  │
│  │ The payment service began receiving 3.2× baseline traffic at    │  │
│  │ 12:32 UTC. Over 90 seconds, the PostgreSQL connection pool       │  │
│  │ saturated (max=50). Requests began queuing and aborting.         │  │
│  │ The FATAL event at line 1,239 represents pool exhaustion.        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  1236│12:32:02│WARN │pg-proxy│ Slow query: 1.2s (threshold: 500ms)    │
│  1237│12:32:03│ERROR│payment │ Connection failed: pool full            │
│▶ 1239│12:32:04│FATAL│payment │ Connection pool exhausted: max=50       │ ← anomaly
│  1240│12:32:04│ERROR│payment │ Request aborted: no connection          │
│  [log lines below — dimmed]                                            │
├────────────────────────────────────────────────────────────────────────┤
│  [Copy context]     [Open in full view]     [Export JSON]              │
└────────────────────────────────────────────────────────────────────────┘
```

**Context window rendering:**

- Lines within the Smart Context window: full opacity
- Lines outside the window: `opacity: 0.35`
- Context window boundary: `1px solid rgba(77,166,255,0.3)` top and bottom
- The anomaly line itself: `background: rgba(255,107,53,0.12)`, left border `3px solid #FF6B35`

**AI Summary block:**

- Background: `#0A0C0F`
- Border-left: `3px solid #4DA6FF`
- Padding: 16px
- Font: `--text-md`, `--color-text-primary`, line-height 1.7

---

### 5.5 Clustering / Pattern View

Accessed via the "Clusters" tab.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLUSTERS  ·  4 pattern groups  ·  1,247 log entries grouped             │
│──────────────────────────────────────────────────────────────────────── │
│ [Sort by: count ▼]  [Show: all ▼]  [Expand all]  [Dismiss all noise]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PATTERN 1                                           [342] [▼]   │   │
│  │ "Database connection timeout after * ms on host *"              │   │
│  │ Timespan: 12:20–12:45 UTC · Services: postgres-proxy, svc-pay  │   │
│  │ ████████░░ WARN (82%) / ERROR (18%)                            │   │
│  │ [Expand 342 entries]            [Dismiss as noise ✕]           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PATTERN 2  [expanded ▲]                             [89 ] [▲]   │   │
│  │ "Auth token validation failed for user * (attempt */3)"         │   │
│  │ ──────────────────────────────────────────────────────────────  │   │
│  │ 4521│12:34:01│WARN │auth-svc│ Auth fail user_id=9823 (1/3)    │   │
│  │ 4528│12:34:08│WARN │auth-svc│ Auth fail user_id=9823 (2/3)    │   │
│  │ 4531│12:34:15│ERROR│auth-svc│ Auth fail user_id=9823 (3/3)    │   │
│  │ ... 86 more entries                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Dismissed cluster state:**

```
  ── DISMISSED ────────────────────────────────────  [Restore]
  "Health check: GET /ping 200 OK"    ~~342 entries~~
```

- Full opacity → 25% opacity on dismiss, strikethrough on count
- `transition: opacity 300ms --ease-out`

---

## 6. Interactive Timeline Design

### 6.1 Structure

The timeline is a horizontal bar chart showing log volume per time bucket. Built with Recharts (`BarChart` + `Bar` + custom tooltip + `ReferenceArea` for selection).

**Chart layout:**

```
 Volume
   │
   │          ████
   │        ████████
   │      ██████████▓▓        ████
   │    ████████████▓▓      ██████
   │  ██████████████▓▓    ████████
   └────────────────────────────────── Time
  10:00   11:00   12:00   13:00   14:00
                    ↑
                 spike markers
```

**Chart container:**

- Height: 108px chart area + 32px time axis
- Background: `#0A0C0F`
- Border-bottom: `1px solid #232840`
- Padding: 8px 16px 0 48px (left pad for Y-axis labels)

### 6.2 Bar Rendering

**Normal bars:**

- Fill: `#2E3555`
- On hover: fill `#4A5280`, tooltip appears

**Anomaly spike bars:**

- Fill: `--color-anomaly-spike` (#FF6B35)
- Height always drawn from baseline (not stacked)
- On hover: `--glow-timeline-spike`, cursor: crosshair, tooltip with anomaly count

**Bar width logic:**

- Time window < 1 hour: bucket = 1 minute, bars ~6px wide
- Time window 1–6 hours: bucket = 5 minutes, bars ~8px wide
- Time window 6–24 hours: bucket = 30 minutes, bars ~10px wide
- Time window > 24 hours: bucket = 1 hour, bars ~8px wide

### 6.3 Anomaly Spike Markers

Additional visual layer above normal bars for detected anomalies:

- A small inverted triangle (▼) marker, 8px, `--color-anomaly-spike`, positioned at the top of the spike bar
- On hover: enlarges to 12px with glow
- Accessible title/aria-label: "Anomaly at [timestamp]: [description]"

### 6.4 Scrubbing / Range Selection

**Click behavior:** Click a bar → log viewer jumps to that time range (smooth scroll to first log line in that bucket).

**Drag behavior:** Click-drag across bars → selects a time range. Selected range shows:

- `ReferenceArea` overlay: `fill: rgba(0,255,136,0.06)`
- Left/right edges: `stroke: rgba(0,255,136,0.4)`, 1px
- Selection shows a "Viewing X–Y UTC · N entries" chip above the timeline

**Keyboard scrubbing:**

- Timeline focusable as a whole (role="application")
- Left/Right arrows move the current position marker
- Shift+Left/Right extends or contracts the selection
- Enter confirms and jumps the log viewer

### 6.5 Tooltip Design

Appears on bar hover, positioned above the bar.

```
┌─────────────────────────────────┐
│  12:32 – 12:33 UTC              │
│  ─────────────────────────────  │
│  Total:  1,284 log entries      │
│  Errors: 342  ████              │
│  Warns:  891  ████████████      │
│  ⚠ 3 anomalies detected        │
└─────────────────────────────────┘
```

**Tooltip spec:**

- Background: `#1C2030`
- Border: `1px solid #2E3555`
- Border-radius: `--radius-md` (6px)
- Box-shadow: `--shadow-elevated`
- Padding: 12px
- Max-width: 240px
- Font: `--text-sm`, `--color-text-primary`
- Mini bar indicators: 4px height, colored fills matching log level colors
- Pointer/caret: 6px CSS triangle, same background color
- Position: always stays within viewport bounds (flip vertical if near top)

### 6.6 Timeline Y-Axis

- Labels: 3–4 labels max, `--text-xs`, monospace, `--color-text-tertiary`
- Auto-scales to max volume + 10% padding
- Grid lines: `1px solid rgba(46,53,85,0.5)` (subtle, does not compete with bars)

### 6.7 Timeline Collapse/Expand

- A collapse handle at the bottom of the timeline panel: a horizontal `drag handle` line (centered, 40px wide, `--color-border-subtle`)
- Clicking it toggles between full (140px) and collapsed (32px) states showing just the time axis
- In collapsed state, a compact "sparkline" version (height 16px) shows the volume shape without detail

---

## 7. Information Architecture

### 7.1 Navigation Model

LogiLog uses a **flat tab model** (no deep hierarchies) because users are in investigation mode and need to jump between views quickly. Tabs do not change the URL (single-page, state-only navigation).

```
App
├── [Empty State]
├── [Loading State]
└── [Analysis Session]
    ├── Analysis tab (default)
    │   ├── Timeline (persistent across all tabs)
    │   ├── Anomaly sidebar
    │   └── Log viewer + Smart Context overlay
    ├── Clusters tab
    │   ├── Timeline (same persistent instance)
    │   └── Cluster cards list
    └── Settings tab
        ├── Display density (compact/comfortable)
        ├── Model info (version, cache status)
        └── Log format hints (auto-detect vs. manual)
```

### 7.2 Anomaly Prioritization

Anomalies surface in the sidebar sorted by **anomaly score** (cosine distance, 0–1 scale) descending. Secondary sort by timestamp descending.

**Score visual mapping:**

- 0.90–1.00: Critical (red dot, pulsing animation)
- 0.70–0.89: High (orange/warning dot)
- 0.50–0.69: Medium (info blue dot)
- < 0.50: Low (not surfaced in sidebar; available in full log view only)

### 7.3 Cluster Organization

Clusters appear in order of **entry count** descending (highest volume patterns first). This puts the noisiest patterns first so users can dismiss them quickly and focus on unusual ones.

**Dismissal persistence:** Dismissed clusters are held in session state. A "Restore all dismissed" action appears in the cluster toolbar after at least one dismissal.

### 7.4 Cross-View Linking

Every anomaly card has a "Jump to Timeline" action that scrolls the timeline to the anomaly's timestamp and highlights it. Every timeline spike tooltip has a "View anomaly" link that opens the corresponding anomaly card in the sidebar. The Smart Context panel's line numbers link back to the log viewer position.

---

## 8. Micro-interactions

### 8.1 File Drop Zone

**Drag enter:** 150ms transition to drag-over state — border changes from dashed to solid, background brightens, icon scales from 1.0 → 1.1 with `--ease-spring`.

**Invalid file type drop:** Shake animation on the drop zone:

```css
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-6px);
  }
  40% {
    transform: translateX(6px);
  }
  60% {
    transform: translateX(-4px);
  }
  80% {
    transform: translateX(4px);
  }
}
/* duration: 400ms, ease: linear */
```

Error message appears below the zone: "Unsupported file type. Drop a .log, .txt, .json, .ndjson, or .gz file."

**Valid file accepted:** Instant transition (< 100ms) to loading state. Green border briefly flashes before layout changes.

### 8.2 Log Line Hover

- Row background transitions: `transition: background-color 100ms --ease-default`
- No layout shift — height is fixed, no expanding
- Selected row left border appears with: `transition: border-left-width 150ms --ease-out, border-left-color 150ms --ease-out`

### 8.3 Anomaly Card Selection

**Click on card:**

1. Card immediately shows selected state (0ms — instant, not animated)
2. Log viewer smoothly scrolls to the anomaly line: `behavior: 'smooth'`, ~300ms
3. Smart Context panel slides up: `translateY(100%)` → `translateY(0)` over 300ms, `--ease-out`
4. Lines outside the context window fade to 35% opacity over 200ms

**Deselect / close Smart Context:**

- Panel slides down (reverse), all log lines return to full opacity, card deselects

### 8.4 Progress Bar Animations

**Shimmer effect (loading progress):**

```css
@keyframes shimmer {
  from {
    background-position: -200% 0;
  }
  to {
    background-position: 200% 0;
  }
}
.progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s --ease-default infinite;
}
```

**Stage completion:** When a stage completes, the progress bar briefly glows (`--glow-accent` applied for 400ms, then fades), and the stage dot changes from pulsing to a static checkmark with a scale-in animation: `scale(0) → scale(1)` over 200ms, `--ease-spring`.

### 8.5 Cluster Expand/Collapse

**Expand:**

- Height animates from 0 to content height using `grid-template-rows: 0fr → 1fr` technique
- Duration: 250ms, `--ease-out`
- Log lines fade in: `opacity: 0 → 1` staggered by 20ms per visible row (max 8 rows staggered)

**Collapse:** Reverse of expand, 200ms, `--ease-in`.

### 8.6 Skeleton Loaders

Used when transitioning from loading to analysis state. Individual panels get skeletons that match the shape of their final content.

**Skeleton base:**

```css
.skeleton {
  background: linear-gradient(90deg, #1c2030 25%, #232840 50%, #1c2030 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}
```

**Timeline skeleton:** Full-width bar at timeline panel height, single shimmer.

**Anomaly card skeleton:** Three stacked card-shaped skeletons with varying widths (simulating title text of different lengths).

### 8.7 Timeline Scrubbing

- **Cursor:** `cursor: crosshair` over the chart area
- **Hover line:** A vertical hairline (1px, `rgba(0,255,136,0.4)`) tracks the cursor X position across the full chart height
- **Snap behavior:** Bars snap to the nearest bucket boundary — smooth hover line movement, but click/selection snaps
- **Selection drag visual:** As the user drags, the selected range fills with `rgba(0,255,136,0.06)` in real-time

### 8.8 Toast Entry

Toasts slide in with a spring easing that gives a satisfying physicality. The progress bar underneath auto-dismisses over 5 seconds. Hovering the toast pauses the dismiss timer.

### 8.9 Terminal Cursor in Empty State

The ">" cursor in the empty state drop zone animates with a blinking caret:

```css
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
.cursor {
  animation: blink 1.2s step-start infinite;
}
/* disabled when prefers-reduced-motion: reduce */
```

---

## 9. Responsive Behavior

### 9.1 Breakpoint Strategy

LogiLog is **desktop-first**. The primary user (SRE, DevOps engineer) is at a workstation. Mobile support is deprioritized but must not be completely broken.

| Breakpoint | Min width | Layout                                                  |
| ---------- | --------- | ------------------------------------------------------- |
| `xs`       | 320px     | Single column, minimal (read-only display, no analysis) |
| `sm`       | 480px     | Single column, basic analysis view                      |
| `md`       | 768px     | Sidebar hidden, tab-accessible                          |
| `lg`       | 1024px    | Two-panel (sidebar + log viewer), timeline              |
| `xl`       | 1280px    | Optimal layout — three-panel with full timeline         |
| `2xl`      | 1920px    | Same as xl with increased padding and font sizes        |

**Minimum supported analysis viewport:** 1024px wide. Below this, a non-blocking banner appears: "LogiLog works best at 1024px width or wider. Some features may be condensed."

### 9.2 Desktop (1280px+) — Primary

Full three-panel layout as described in Section 5.3. All features available. Timeline always visible.

### 9.3 Tablet (768px–1023px)

- Sidebar moves to an overlay drawer (300px wide, slides in from left)
- Timeline collapses to compact sparkline (48px)
- Drawer toggle button: fixed at top-left, 44×44px, hamburger/panel icon
- Log viewer takes full width

### 9.4 Mobile (< 768px) — Degraded

- Drop zone renders full-screen
- After analysis: tabs-only navigation
- No split view — each tab is full-screen
- Timeline hidden (too complex for touch at small sizes)
- Anomaly list: full-screen scroll
- Log viewer: horizontal scroll enabled, sticky columns for line number and timestamp

### 9.5 High-DPI Displays

All icons are SVG (resolution-independent). No raster images in the UI chrome. Text rendering: `-webkit-font-smoothing: antialiased` for macOS, `text-rendering: optimizeLegibility` for all.

### 9.6 Ultra-Wide (2560px+)

Max content width: `1920px`, centered with `margin: 0 auto`. Does not stretch to fill ultra-wide monitors (log lines become too long to scan).

---

## 10. Accessibility

### 10.1 Color Contrast Compliance (WCAG 2.1 AA)

All text/background pairings meet WCAG AA at minimum (4.5:1 for normal text, 3:1 for large text).

| Foreground             | Background                | Ratio  | Level         |
| ---------------------- | ------------------------- | ------ | ------------- |
| `#E8EAF0` on `#0D0F12` | Primary text on base bg   | 16.2:1 | AAA           |
| `#E8EAF0` on `#141720` | Primary text on surface   | 14.8:1 | AAA           |
| `#8892B0` on `#141720` | Secondary text on surface | 5.2:1  | AA            |
| `#8892B0` on `#0D0F12` | Secondary text on base    | 5.7:1  | AA            |
| `#546080` on `#141720` | Tertiary text on surface  | 3.1:1  | AA Large only |
| `#00FF88` on `#0D0F12` | Accent on base bg         | 13.4:1 | AAA           |
| `#FF4444` on `#141720` | Critical on surface       | 5.8:1  | AA            |
| `#FFB700` on `#141720` | Warning on surface        | 8.2:1  | AAA           |
| `#4DA6FF` on `#141720` | Info on surface           | 6.1:1  | AA            |
| `#CDD6F4` on `#0A0C0F` | Code text on inset bg     | 14.1:1 | AAA           |
| `#FFD166` on `#0A0C0F` | WARN level on log bg      | 9.4:1  | AAA           |
| `#FF4D4D` on `#0A0C0F` | ERROR level on log bg     | 6.2:1  | AA            |

**Note on `--color-text-tertiary` (#546080):** Only used for decorative labels and timestamps. Never used for critical information. Its 3.1:1 ratio qualifies only for large text (18px+) at AA. At its usage size (11–12px), this is a deliberate tradeoff for visual hierarchy. All critical information uses AA-compliant colors.

### 10.2 Keyboard Navigation

**Tab order (main view, left to right, top to bottom):**

1. Skip-to-main link (visually hidden, appears on focus)
2. Header: Logo (not focusable), "New file" button
3. Tab navigation: Analysis, Clusters, Timeline, Settings tabs
4. Timeline chart (role="application", custom keyboard handler)
5. Search/filter input
6. Log level filter chips
7. Log viewer (role="grid", virtualized — only rendered rows are focusable)
8. Anomaly sidebar cards (ordered by severity)

**Log viewer keyboard:**

- `↑`/`↓`: move between rows
- `Enter`: select row, open Smart Context if anomaly
- `Home`/`End`: jump to first/last line
- `Ctrl+F` / `Cmd+F`: focus search input

**Timeline keyboard:**

- `←`/`→`: move cursor one bucket
- `Shift+←`/`Shift+→`: extend/contract selection
- `Enter`: jump log viewer to cursor position

**Focus indicators:**
All focusable elements use `--focus-ring`: `outline: none; box-shadow: 0 0 0 2px #0D0F12, 0 0 0 4px #00FF88;`

This double-ring (dark inner, accent outer) is visible against both dark and light browser chrome.

### 10.3 Screen Reader Support

**ARIA roles:**

- Timeline chart: `role="img"`, `aria-label="Log volume timeline from [start] to [end]. [N] anomalies detected."` with a live description region that updates on selection.
- Anomaly cards: `role="article"`, `aria-label="[Severity] anomaly: [title]"`, `aria-describedby` pointing to score and timestamp.
- Log viewer: `role="grid"`, `aria-label="Log entries"`. Each row: `role="row"`, columns: `role="gridcell"`.
- Progress stages: `role="status"`, `aria-live="polite"` on the stage description. Count updates: `aria-live="off"` (too frequent to announce every line).
- Toast notifications: `role="alert"` for errors, `role="status"` for success.
- Smart Context panel: `role="complementary"`, `aria-label="Smart Context forensic analysis"`.

**Live regions:**

- Analysis completion: `aria-live="assertive"` on the toast that says "Analysis complete. Found N anomalies."
- Cluster dismiss/restore: `aria-live="polite"`.

**Skip link:**

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

Visually hidden until focused; then appears at top of viewport.

### 10.4 Motion Sensitivity

See Section 3.5 for the `prefers-reduced-motion` implementation. All decorative animations (shimmer, blink, pulse, glow) are disabled. Page transitions, panel slides, and progress bars remain functional at reduced speed.

### 10.5 Zoom and Text Resize

All layouts use relative units (rem, em, %) and flex/grid. The application must remain functional at 200% browser zoom. At 200% zoom on 1280px viewport, the sidebar collapses to the drawer behavior (same as tablet breakpoint).

### 10.6 Semantic HTML

- Page structure: `<header>`, `<main>`, `<nav>` (for tabs), `<aside>` (for anomaly sidebar), `<section>` per panel.
- Log lines are `<div role="row">` within a `role="grid"` (not a real `<table>` due to virtual scrolling constraints — but the ARIA grid role provides equivalent semantics).
- All buttons are `<button>` elements, never `<div onClick>`.
- The drop zone is a `<label>` wrapping a visually hidden `<input type="file">` (with `role="button"` and `aria-label` for the styled version).

---

## 11. Dark-Only Mode Decision

### Decision: Dark mode only. No light mode.

**Rationale:**

**1. User context and environment.**
LogiLog's primary users (SREs at 3 AM, developers debugging in a dimly-lit home office, security engineers running audits) operate in environments where a bright white interface causes genuine discomfort and eye strain. Terminals are dark. IDEs default to dark. Log analysis tools (Kibana, Loki, Grafana) default to dark. A light mode would feel alien to the user and the context.

**2. Semantic clarity of the color system.**
The anomaly and severity color palette is designed against a dark background where chromatic colors (red, orange, yellow, green) read as signals against a neutral dark field. On a white background, these same colors lose their urgency and blend into standard UI chrome. The terminal aesthetic color language does not translate to light mode without a full palette redesign.

**3. Scope and maintenance cost.**
Maintaining two complete color themes doubles the design surface area and introduces a class of bugs (color regression between themes). For a focused, single-purpose tool, this cost is not justified.

**4. The product identity.**
The "terminal-native" positioning is a feature, not an afterthought. A light mode option implicitly signals that the tool is a generic web app that happens to have a dark option. The dark-only decision reinforces the product identity as a tool _for_ the terminal-native developer.

**5. Precedent.**
Notable developer tools that are dark-only and suffer no meaningful adoption penalty: Warp (terminal), Ray (debugging tool), Raycast, WakaTime, Datadog APM in "dark" context.

**Mitigation for users who require light mode:**
The browser's accessibility features (forced-colors: active, invert colors at OS level) are respected via:

```css
@media (forced-colors: active) {
  /* Allow Windows high-contrast mode to override our color system */
  * {
    forced-color-adjust: auto;
  }
}
```

This ensures the tool is usable in Windows High Contrast Mode (which is an accessibility requirement, not a preference).

**Future consideration:** If user research or significant user demand surfaces a strong light-mode preference (particularly from Persona C — the auditor — who may be using a compliance-approved laptop with forced light mode), a light mode can be added as a post-1.0 feature. The CSS custom property design token system makes this technically straightforward — all colors are tokenized and a light theme would require updating ~30 token values.

---

_End of LogiLog UX/UI Design Specification v1.0_

---

## Appendix: Quick Reference Cheat Sheet

### Most-Used Tokens

```css
/* Backgrounds */
--color-bg-base:
  #0d0f12 --color-bg-surface: #141720 --color-bg-elevated: #1c2030 --color-bg-inset: #0a0c0f
    /* Text */ --color-text-primary: #e8eaf0 --color-text-secondary: #8892b0
    --color-text-code: #cdd6f4 /* Accent */ --color-accent-500: #00ff88 /* Severity */
    --color-critical: #ff4444 --color-warning: #ffb700 --color-info: #4da6ff /* Log levels */
    --color-log-error: #ff4d4d --color-log-warn: #ffd166 --color-log-info: #06d6a0
    --color-log-debug: #828fa3 --color-log-fatal: #ff006e /* Fonts */ --font-ui: 'Inter',
  system-ui, sans-serif --font-mono: 'JetBrains Mono', 'Fira Code',
  monospace /* Key spacings */ --space-4: 1rem /* 16px — standard padding */ --space-6: 1.5rem
    /* 24px — section padding */ --space-8: 2rem /* 32px — large gaps */ /* Key radii */
    --radius-md: 6px --radius-lg: 10px /* Animations */ --duration-fast: 150ms
    --duration-normal: 250ms --ease-default: cubic-bezier(0.4, 0, 0.2, 1)
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Panel Dimensions

```
Header:          56px height
Tab bar:         44px height
Timeline:        140px height (collapsible to 32px)
Sidebar:         320px width (min 240px, max 480px)
Smart Context:   320px height overlay
Log row compact: 28px height
Log row normal:  36px height
Drop zone:       max-width 560px, min-height 300px
```
