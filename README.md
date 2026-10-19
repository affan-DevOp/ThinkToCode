# ThinkToCode ⚡

> **Next-generation terminal-first AI coding agent engineered for speed, autonomy, and local control.**

ThinkToCode is an intelligent agentic coding assistant that runs directly in your terminal. Built with a reactive terminal UI framework (**OpenTUI** and **React 19**), a high-speed backend engine (**Bun** and **Hono**), and client-side local tool execution, ThinkToCode enables developers to plan, build, debug, and execute code across multi-file codebases in real time.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-black.svg)](https://bun.sh)
[![OpenTUI](https://img.shields.io/badge/OpenTUI-React--19-purple.svg)](https://github.com/opentui)
[![Tests](https://img.shields.io/badge/Tests-10%2F10%20Passing-brightgreen.svg)](packages/cli/tests/upgrades.test.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Research: Specifications](https://img.shields.io/badge/Research-Specifications%20&%20Benchmarks-orange.svg)](RESEARCH.md)

---

## 📸 Interface Preview

![ThinkToCode Terminal UI](media/hero-banner.png)

<p align="center">
  <em>ThinkToCode CLI — Fast, autonomous agentic coding directly from your terminal.</em>
</p>

---

## ✨ Cutting-Edge Capabilities

- **🖥️ Terminal-Native TUI Experience**: Built with **OpenTUI** and **React 19**, delivering a fluid, mouse- and keyboard-driven interactive CLI complete with syntax highlighting, live streaming tokens, and responsive dialog overlays.
- **🧠 Dual Operational Modes & Sticky Models**:
  - **Plan Mode**: Read-only reasoning and architecture analysis. Automatically binds to high-reasoning models (e.g. Gemini 2.5 Pro, Claude 3.5 Sonnet) saved in `~/.thinktocode/preferences.json`.
  - **Build Mode**: Full agentic developer mode. Automatically binds to high-speed executor models (e.g. Gemini 2.5 Flash, Groq Qwen 2.5 Coder) for rapid iterative editing.
- **🗺️ Semantic Repository Map (`repoMap`)**:
  - Extracts structural TypeScript/JavaScript signatures (interfaces, classes, types, function headers) while stripping bodies `{ ... }`.
  - Employs **BM25 lexical scoring** + **Personalized PageRank ($\alpha=0.85$)** over file dependency graphs to rank architectural significance.
  - Caches mtime timestamps in `.cache/repomap.json` for **~22ms warm re-scans** and budgets output under **<1,800 tokens**.
- **🧩 4-Tier Cascade Fuzzy Patch Engine (`patchFile`)**:
  - Replaces fragile exact-string matching with a 4-tier cascade:
    1. **Tier 1 (Exact Line Offset Match)**
    2. **Tier 2 (Whitespace-Normalized Match)**
    3. **Tier 3 (Relative Indentation Shift with $\Delta$ spaces compensation)**
    4. **Tier 4 (Levenshtein Sliding-Window Similarity with Ambiguity Guard)**
  - Includes Myers $O(ND)$ diff generator and side-by-side ANSI colored terminal preview.
- **🐝 Sub-Agent Swarms & DAG Scheduling (`planSwarmDag`)**:
  - Decomposes complex multi-file refactors into a Directed Acyclic Graph (DAG) of atomic sub-tasks.
  - **Kahn's Topological Wave Compiler**: Schedules independent tasks into concurrent execution waves.
  - **Disjoint Write-Set Protection**: Automatically detects concurrent tasks targeting the same file and serializes them into safe sub-waves to eliminate write collisions.
  - **Context-Isolated Workers**: Delivers up to **~71% token savings** and $1.3\times - 2.4\times$ speedups compared to single-agent history accumulation.
- **⏪ Git Shadow Checkpoints (`/undo`)**:
  - Automatically captures pre-mutation snapshots before any `writeFile`, `editFile`, or `patchFile` execution.
  - Instant transactional rollback via `/undo` in the chat input bar or command palette, safely deleting newly created files and restoring previous states.
- **⚡ Post-Edit Fast Diagnostics via Bun**:
  - Runs sub-millisecond (**~0.4ms**) native syntax validation via `Bun.Transpiler` on TS/TSX/JS/JSX/JSON after every edit, surfacing errors for immediate self-correction.
- **🛑 Doom-Loop Circuit Breaker**:
  - Fingerprint hashing prevents runaway execution: detects **3x identical tool calls**, **3x consecutive failures**, **2-cycle ping-pong file fighting**, and enforces a **20-step per-turn budget ceiling**.
- **🛡️ Destructive Command Guardrails**:
  - Blocks high-risk terminal commands (`rm`, `del`, `drop`, `sudo`, `git reset --hard`) with interactive confirmation gates.
- **🌐 Multi-Model & Free OpenRouter Support**:
  - First-class support for **OpenRouter**, **Google Gemini**, **Groq**, **Anthropic**, and **OpenAI**.
- **🔐 Secure Authentication & Billing**:
  - Browser-based OAuth device flow powered by **Clerk**; usage metering and customer portal via **Polar**.

---

## 🖼️ TUI Showcase

| Slash Command Menu (`/`) | Interactive Sessions Workspace (`Ctrl+O`) |
| :---: | :---: |
| ![Command Menu](media/command-menu.png) | <img width="707" height="393" alt="image" src="https://github.com/user-attachments/assets/dcaa0584-d8e8-4ccb-a4aa-0eba91437ea5" /> |
| *Quick command palette (`/new`, `/undo`, `/repomap`, `/models`)* | *Cloud-synced session manager with instant search & deletion* |

---

## 🛠️ Integrated Tool Suite

| Tool | Mode | Description |
|---|---|---|
| **`patchFile`** | BUILD | Applies Unified Diff hunks using 4-tier fuzzy matching and Myers side-by-side preview. |
| **`repoMap`** | PLAN & BUILD | Generates a compact (<1,800 token) Semantic RepoMap using BM25 and PageRank. |
| **`planSwarmDag`** | PLAN & BUILD | Compiles and validates a Sub-Agent Task DAG with Kahn waves and disjoint write-set protection. |
| **`readFile`** | PLAN & BUILD | Reads file contents with path traversal safety. |
| **`writeFile`** | BUILD | Creates or overwrites files with shadow checkpoint protection. |
| **`editFile`** | BUILD | Applies single-hunk or transactional multi-hunk replacements with overlap detection. |
| **`listDirectory`** | PLAN & BUILD | Lists directory contents. |
| **`glob`** | PLAN & BUILD | Matches file paths against glob patterns. |
| **`grep`** | PLAN & BUILD | Searches file contents using regular expressions. |
| **`bash`** | BUILD | Executes shell commands with destructive command guardrails. |

---

## 🏗️ Architecture & Monorepo Structure

```
ThinkToCode/
├── packages/
│   ├── cli/         # Terminal UI (OpenTUI, React 19, local tools, fuzzy-patch, repo-map, dag-swarm)
│   ├── server/      # Backend API engine (Hono, AI SDK, model router, auth, polar)
│   ├── database/    # Data persistence layer (Prisma ORM, PostgreSQL schema)
│   └── shared/      # Shared TypeScript schemas, contracts, tool definitions
├── media/           # Visual assets and screenshots
├── RESEARCH.md      # Comprehensive technical research specifications & benchmarks
├── package.json     # Bun workspace configuration
└── tsconfig.base.json
```

---

## 🚀 Quickstart

### Prerequisites

- [Bun](https://bun.sh) (v1.2+) installed
- [PostgreSQL](https://www.postgresql.org/) database (e.g. Aiven, Neon, Supabase, or local)
- At least one AI provider API key (e.g. [OpenRouter](https://openrouter.ai), [Groq](https://console.groq.com), or [Google AI Studio](https://aistudio.google.com/))

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/affan-DevOp/ThinkToCode.git
cd ThinkToCode
bun install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```ini
# Server
PORT=3000
API_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# AI Provider Keys (at least one required)
OPENROUTER_API_KEY=your_openrouter_api_key
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key

# Clerk Authentication (Optional for local dev)
CLERK_FRONTEND_API=https://<your-app>.clerk.accounts.dev
CLERK_OAUTH_CLIENT_ID=
CLERK_OAUTH_CLIENT_SECRET=
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
JWT_SECRET=your-jwt-secret

# Polar Billing (Optional for local dev)
POLAR_ACCESS_TOKEN=
POLAR_PRODUCT_ID=
POLAR_SERVER=sandbox
POLAR_CREDITS_METER_ID=
```

### 3. Generate Database Client & Run Migrations

```bash
bun run db:generate
```

### 4. Launch the Server

```bash
bun dev:server
```

The Hono API server will spin up on `http://localhost:3000`.

### 5. Launch the CLI Agent

In a separate terminal window:

```bash
bun dev:cli
```

---

## 🧪 Testing & Verification

Run the automated test suite covering the fuzzy patch engine, circuit breaker, semantic repo map, checkpoints, and DAG swarm compiler:

```bash
bun test packages/cli/tests/upgrades.test.ts
```

Run static typechecking across all monorepo packages:

```bash
bunx tsc -p packages/shared/tsconfig.json --noEmit
bunx tsc -p packages/cli/tsconfig.json --noEmit
bunx tsc -p packages/server/tsconfig.json --noEmit
```

---

## ⌨️ Keyboard Shortcuts & Commands

| Shortcut / Command | Context | Action |
| :--- | :--- | :--- |
| **`Tab`** | Main Input | Toggle between **Plan Mode** and **Build Mode** (auto-switches sticky models) |
| **`/`** | Main Input | Open Command Menu |
| **`/undo`** | Command / Input | Revert last file mutations via Git shadow checkpoints |
| **`/repomap`** | Command Menu | Generate and display repository semantic AST map and token estimate |
| **`Ctrl+O`** | Global | Open Sessions Dialog |
| **`Ctrl+M`** | Global | Open Model Selector Dialog |
| **`Del` / `Ctrl+D`** | Sessions Dialog | Delete selected session |
| **`Enter`** | Dialogs | Confirm / Switch selection |
| **`Esc`** | Dialogs | Close active dialog / modal |

---

## 🔬 Research & Deep Dive

For mathematical formulations, Myers diff algorithms, topological wave scheduling proofs, and token growth comparisons, read our detailed technical whitepaper:

👉 **[Read RESEARCH.md](RESEARCH.md)**

---

## 🛡️ Security & Privacy

ThinkToCode is built with a **local-first security model**:
- **Local Tool Execution**: All bash commands, file edits, and file inspections execute exclusively on your local machine where the CLI runs.
- **Safety Heuristics**: The CLI inspects bash commands before execution and blocks potentially destructive commands until you review and confirm.
- **Credential Protection**: `.env` and sensitive configuration files are strictly excluded via `.gitignore` to prevent accidental leaks.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
