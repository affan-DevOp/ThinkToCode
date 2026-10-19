# ThinkToCode ⚡

> **Next-generation terminal-first AI coding agent engineered for speed, autonomy, and local control.**

ThinkToCode is an intelligent agentic coding assistant that runs directly in your terminal. Built with a reactive terminal UI framework (**OpenTUI** and **React 19**), a high-speed backend engine (**Bun** and **Hono**), and client-side local tool execution, ThinkToCode enables developers to plan, build, debug, and execute code across multi-file codebases in real time.

---

## 📸 Interface Preview

![ThinkToCode Terminal UI](media/hero-banner.png)

<p align="center">
  <em>ThinkToCode CLI — Fast, autonomous agentic coding directly from your terminal.</em>
</p>

---

## ✨ Key Features

- **🖥️ Terminal-Native TUI Experience**: Built with **OpenTUI** and **React 19**, delivering a fluid, mouse- and keyboard-driven interactive CLI complete with syntax highlighting, live streaming tokens, and responsive dialog overlays.
- **🧠 Dual Operational Modes**:
  - **Plan Mode**: Read-only reasoning and architecture analysis. Ideal for code exploration, dependency reviews, and drafting implementation strategies without accidental file modifications.
  - **Build Mode**: Full agentic developer mode. Autonomously inspects directories, generates code, applies targeted surgical diffs, runs tests, and executes shell commands.
- **🛠️ Client-Side Tool Execution Engine**:
  - All file mutations, grep searches, and terminal commands execute directly on your local machine—never on remote servers.
  - Cross-platform path and command resolution supporting **Windows PowerShell**, **macOS**, and **Linux**.
  - 9+ core tools: `readFile`, `writeFile`, `editFile`, `listDirectory`, `directoryTree`, `grepSearch`, `fileSearch`, `bash`, and `browser`.
- **🛡️ Destructive Command Guardrails**:
  - Built-in heuristics detect high-risk operations (e.g., `rm`, `rmdir`, `del`, `drop`, `format`, `sudo`, `git reset --hard`).
  - Pauses execution and prompts for interactive user confirmation before dangerous commands run.
- **🌐 Multi-Model & OpenRouter Support**:
  - First-class support for leading model providers: **OpenRouter**, **Google Gemini** (Gemini 2.5 Flash / Pro), **Groq** (Llama 3.3 70B, Qwen 2.5 Coder), **Anthropic** (Claude 3.5 Sonnet), and **OpenAI**.
  - Seamless support for free OpenRouter coding models (e.g., `qwen/qwen3.8-27b`, `cohere/north-mini-code:free`, `nvidia/nemotron-3-super-120b-a12b:free`).
- **🔐 Secure OAuth Device Authentication**:
  - Browser-based OAuth device code flow powered by **Clerk**.
  - Local authentication tokens stored safely in `~/.thinktocode/auth.json`.
- **💳 Usage Metering & Billing**:
  - Integrated pay-as-you-go credit metering and customer portal via **Polar**.
- **📂 Persistent Session Workspace**:
  - Cloud-synced session histories backed by **PostgreSQL** and **Prisma**.
  - Quick-switch dialog with session search, live timestamps, and in-CLI session deletion (`Del`, `Ctrl+D`, or click `✕`).

---

## 🖼️ TUI Showcase

| Slash Command Menu (`/`) | Interactive Sessions Workspace (`Ctrl+O`) |
| :---: | :---: |
| ![Command Menu](media/command-menu.png) | ![Sessions Manager](media/sessions-manager.png) |
| *Quick command palette (`/new`, `/models`, `/sessions`, `/theme`)* | *Cloud-synced session manager with instant search & deletion* |

---

## 🏗️ Architecture & Monorepo Structure

```
ThinkToCode/
├── packages/
│   ├── cli/         # Interactive terminal UI (OpenTUI, React 19, local tool runner)
│   ├── server/      # Backend API engine (Hono, AI SDK, model router, auth)
│   ├── database/    # Data persistence layer (Prisma ORM, PostgreSQL schema)
│   └── shared/      # Shared TypeScript schemas, types, and model definitions
├── media/           # Screenshots & visual assets
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

Copy the example environment template:

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

## ⌨️ Keyboard Shortcuts & Navigation

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **`Tab`** | Main Input | Toggle between **Plan Mode** and **Build Mode** |
| **`/`** | Main Input | Open Command Menu (`/new`, `/models`, `/agents`, `/theme`...) |
| **`Ctrl+O`** | Global | Open Sessions Dialog |
| **`Ctrl+M`** | Global | Open Model Selector Dialog |
| **`Del` / `Ctrl+D`** | Sessions Dialog | Delete selected session |
| **`Enter`** | Dialogs | Confirm / Switch selection |
| **`Esc`** | Dialogs | Close active dialog / modal |

---

## 🛡️ Security & Privacy

ThinkToCode is built with a **local-first security model**:
- **Local Tool Execution**: All bash commands, file edits, and file inspections execute exclusively on your local machine where the CLI runs.
- **Safety Heuristics**: The CLI inspects bash commands before execution and blocks potentially destructive commands until you review and confirm.
- **Credential Protection**: `.env` and sensitive configuration files are strictly excluded via `.gitignore` to prevent accidental leaks.

---

## 🗺️ Roadmap & Upcoming Features

- [ ] **Sticky Models Per Mode**: Automatically bind high-reasoning models (e.g. Gemini 2.5 Pro) to Plan Mode and high-throughput executors (e.g. Cerebras/Groq) to Build Mode.
- [ ] **Git Shadow Checkpoints (`/undo`)**: Automatic snapshot rollback before multi-file modifications.
- [ ] **Doom-Loop Circuit Breaker**: Intelligent repetition detection to stop runaway or oscillating agentic tool loops.
- [ ] **Atomic Multi-Hunk Patching**: Replace sequential single-line edits with atomic multi-location diff applications.
- [ ] **Post-Edit Fast Diagnostics**: Sub-50ms local TypeScript and syntax verification via Bun after every file modification.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
