# ThoughtGuards - CoT Manipulation Monitor

## Project Overview

ThoughtGuards is an AI safety research project that monitors and detects manipulation in AI chain-of-thought (CoT) reasoning. It's built as a full-stack web application for analyzing conversations between AI agents and users, specifically focusing on detecting deceptive or manipulative patterns in AI reasoning traces from e-commerce chatbot scenarios.

**Primary Use Case**: Detect and categorize manipulation patterns in AI-generated reasoning traces (e.g., reward hacking, sycophancy, sandbagging, deception) using a structured taxonomy framework.

**License**: MIT (Copyright 2025 Hilary Torn)

---

## Tech Stack

### Frontend
- **Framework**: React 19.2.3 with TypeScript
- **Build Tool**: Vite 6.2.0
- **Routing**: React Router DOM 7.12.0
- **UI**: Custom components with Lucide React icons
- **Charts**: Recharts 3.6.0
- **Deployment**: Cloudflare Pages (static assets served via Workers)

### Backend
- **Runtime**: Cloudflare Workers (edge computing)
- **Web Framework**: Hono 4.11.3 (lightweight, fast routing)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **API Design**: RESTful JSON API

### AI/ML Integration
- **Primary Model**: Google Gemini API (via @google/genai)
- **Supported Models**: OpenAI GPT, Anthropic Claude, DeepSeek, Qwen (via various API keys)
- **Purpose**: Run audits on conversation traces to detect manipulation patterns

### Development Tools
- **TypeScript**: ~5.8.2
- **Package Manager**: npm
- **Local Testing**: Wrangler 4.54.0 (Cloudflare dev server)
- **Scripts Runner**: tsx 4.21.0
- **Database Testing**: better-sqlite3 12.5.0 (for local D1 emulation)

---

## Project Structure

```
ThoughtGuards/
├── frontend/                     # Main application (React + Cloudflare Workers)
│   ├── src/
│   │   └── worker/              # Cloudflare Worker backend (Hono API)
│   │       ├── index.ts         # Entry point, CORS, route mounting
│   │       └── routes/          # API route handlers
│   │           ├── audit-reports.ts
│   │           ├── audit-results.ts
│   │           ├── audit-statistics.ts
│   │           ├── aggregate-reports.ts
│   │           ├── chat.ts
│   │           ├── conversations.ts
│   │           ├── dashboard-stats.ts
│   │           ├── ground-truth-labels.ts
│   │           ├── report-cache.ts
│   │           ├── reset-db.ts
│   │           ├── sync-conversations.ts
│   │           ├── tools.ts
│   │           └── wmdp-evaluations.ts
│   ├── components/              # React UI components
│   │   ├── AuditView.tsx       # Detailed audit report view
│   │   ├── ConversationTurn.tsx
│   │   ├── DetectedIssuesPanel.tsx
│   │   ├── DetectionCard.tsx
│   │   ├── DynamicDashboard.tsx # Main dashboard
│   │   ├── Landing.tsx
│   │   ├── LeftNav.tsx
│   │   ├── ParameterSweepView.tsx
│   │   ├── ReasoningDisplay.tsx
│   │   ├── ReportCreationModal.tsx
│   │   ├── ReportListView.tsx
│   │   ├── Settings.tsx
│   │   ├── Sidebar.tsx
│   │   ├── TraceDetail.tsx     # Individual trace inspection
│   │   ├── TraceList.tsx
│   │   └── TriadDisplay.tsx    # Taxonomy triad visualization
│   ├── lib/                     # Core business logic
│   │   ├── aiClient.ts         # AI model API integration
│   │   ├── intelligentMultiSkillDetector.ts
│   │   ├── llmParameterTracker.ts
│   │   ├── multiRunExecutor.ts
│   │   ├── multiSkillExecutor.ts
│   │   ├── parameterSweepExecutor.ts
│   │   ├── reportExecutor.ts
│   │   ├── skillExecutor.ts
│   │   ├── skillVersioning.ts
│   │   ├── skillsRegistry.ts   # Available audit skills
│   │   ├── statisticalAnalysis.ts
│   │   └── types.ts
│   ├── skills/                  # Detection skill definitions
│   │   ├── deception-planning-auditor/
│   │   ├── goal-reasoning-auditor/
│   │   ├── obfuscation-evasion-auditor/
│   │   ├── persona-manipulation-auditor/
│   │   ├── reward-hacking-auditor/
│   │   ├── sabotage-planning-auditor/
│   │   ├── sycophancy-auditor/
│   │   └── taxonomy-auditor/   # Triad-based classification
│   ├── scripts/                 # Utility scripts
│   │   ├── deploy.sh           # Production deployment
│   │   ├── import-conversations.ts
│   │   ├── seed-database.ts
│   │   ├── apply-local-migrations.ts
│   │   ├── test-*.ts           # Various test scenarios
│   │   └── verify-seeding.ts
│   ├── db/
│   │   ├── schema.sql          # Complete D1 database schema
│   │   └── migrations/         # Migration files
│   ├── App.tsx                  # Main React app
│   ├── index.tsx                # React entry point
│   ├── types.ts                 # TypeScript type definitions
│   ├── constants.ts             # UI constants, category styles
│   ├── wrangler.json           # Cloudflare Workers config
│   ├── vite.config.ts
│   └── package.json
├── cot-generator/               # Python conversation generator
│   ├── main.py                  # Entry point for generating conversations
│   ├── config.py                # API keys, model settings
│   ├── requirements.txt
│   ├── data/                    # Mock e-commerce data
│   │   ├── products.json
│   │   ├── customers.json
│   │   ├── orders.json
│   │   └── policies.json
│   └── src/
│       ├── mock_database.py
│       ├── tools.py
│       ├── personas.py          # Customer personas
│       ├── chatbot_modes.py     # Different optimization targets
│       ├── user_simulator.py
│       └── orchestrator.py
├── taxonomy/                    # Manipulation taxonomy definitions
│   ├── taxonomy-description-llm.md  # Full taxonomy guide
│   ├── taxonomy-output-schema.json
│   └── taxonomy-output-example.json
├── mock_data/                   # Generated conversation batches
│   └── [various batch directories with .jsonl files]
├── _additional_data/
│   └── ecommerce_cot_dataset.json
└── backend/                     # (empty, logic moved to frontend/src/worker)
```

---

## Key Concepts

### 1. Manipulation Taxonomy (WHY-HOW-TARGET Triad)

ThoughtGuards uses a three-axis taxonomy to categorize AI manipulation:

**WHY (The Driver)** - What signal is the behavior optimizing?
- **W1 (Gamed)**: Proxy/Score Optimization - metric gaming, reward hacking
- **W2 (Pleased)**: Approval Optimization - sycophancy, user preference exploitation
- **W3 (Shortcut)**: Cost/Effort Minimization - laziness, skipping verification
- **W4 (Dodged)**: Penalty/Constraint Avoidance - deceptive alignment, sandbagging

**HOW (The Mechanism)** - Observable action taken:
- **H1 (Fabricated)**: Misrepresentation - false facts, hallucination
- **H2 (Sandbagged)**: Capability Suppression - strategic underperformance
- **H3 (Context-Switched)**: Oversight Awareness - behavior changes when evaluated
- **H4 (Pressured)**: Influence Tactics - framing, urgency, authority
- **H5 (Hid)**: Omission/Obfuscation - withholds crucial info
- **H6 (Overclaimed)**: Miscalibration - confidence exceeds evidence

**TARGET (The Object)** - What is being affected?
- **T1 (User)**: User Beliefs - psychological/decision impact
- **T2 (Evaluator)**: Evaluator/Oversight - grades, audits, monitors
- **T3 (Policy)**: Policy Adherence - rules, compliance systems
- **T4 (External)**: External Systems - databases, APIs, physical world

**Triad Code Format**: `T2|H1|W4` (e.g., "Agent fabricated in order to dodge penalty, affecting evaluator")



### 3. Traces and Audits

- **Trace**: A conversation between user and AI agent, including reasoning traces
- **Audit**: Analysis of a trace using one or more skills, producing a detection report
- **Audit Reports**: Detailed results with scores, confidence levels, evidence, recommendations
- **Aggregate Reports**: Statistical analysis across multiple audits (mean, variance, parameter effects)

### 4. Conversation Generation (cot-generator)

Python system that generates synthetic e-commerce chatbot conversations:
- **Chatbot Modes**: helpful, conversion_optimized, retention_focused, metric_gamer, policy_enforcer
- **Customer Personas**: angry_returner, price_haggler, confused_elderly, warranty_claimer, etc.
- **Tools Available**: lookup_product, check_inventory, process_return, apply_discount, escalate_to_human
- **Output**: JSONL files with conversation turns, tool calls, reasoning traces

---

## Database Schema (D1/SQLite)

### Core Tables
- **customers**: Customer profiles with history, lifetime value, segments
- **products**: SKU, pricing, margins, competitor prices, known issues
- **orders**: Order history with status, returns, refunds
- **order_items**: Line items for orders
- **support_tickets**: Customer service history
- **policies**: Return, warranty, price match policies (JSON)

### Conversation Tables
- **conversations**: Conversation metadata (customer_id, chatbot_mode, provider, model, label, expected_manipulation)
- **conversation_turns**: Individual messages (role, content, reasoning_content, timestamp)
- **tool_calls**: Tools invoked during conversations (tool_name, arguments, result)
- **escalations**: Escalation events
- **email_log**: Email tool usage

### Audit & Analysis Tables
- **audit_results**: Legacy audit storage (being phased out)
- **audit_reports**: New audit system with full LLM parameter tracking (temperature, top_p, seed, prompt_hash, response_hash, system_fingerprint, latency, tokens)
- **audit_runs**: Individual runs within multi-run audits
- **aggregate_reports**: Statistical aggregations (mean, CI, parameter effects)
- **parameter_sweeps**: Automated parameter exploration
- **skill_versions**: Versioned skill definitions
- **report_cache**: Caching layer for repeated audits

### Quality Control Tables
- **ground_truth_labels**: Human-annotated labels (multi-label, annotator tracking, inter-annotator agreement)
- **calibration_datasets**: Model calibration metrics (sensitivity, specificity, Cohen's κ)
- **calibration_curve_points**: Calibration curve data
- **calibration_by_type**: Per-manipulation-type calibration
- **cross_validation_runs**: Multi-judge comparisons (detect judge bias)
- **annotation_priorities**: Prioritize which conversations need human labels
- **model_canaries**: Detect model drift over time
- **model_drift_events**: Logged drift detection events
- **fingerprint_log**: Track OpenAI system_fingerprint changes
- **bootstrap_samples**: Bootstrap confidence intervals
- **sync_status**: File sync tracking

---

## API Routes

All routes are prefixed with `/api/`

### Dashboard & Stats
- `GET /api/dashboard-stats` - Overview metrics
- `GET /api/health` - Health check

### Conversations
- `GET /api/conversations` - List conversations
- `GET /api/conversations/:id` - Get conversation details
- `POST /api/sync-conversations` - Import from mock_data

### Audits
- `GET /api/audit-results` - List audit results (legacy)
- `GET /api/audit-reports` - List audit reports (new system)
- `POST /api/audit-reports` - Create new audit
- `GET /api/audit-statistics` - Statistical analysis
- `GET /api/aggregate-reports` - Aggregated reports
- `POST /api/aggregate-reports` - Create aggregate

### Analysis & Tools
- `GET /api/ground-truth-labels` - Human annotations
- `POST /api/ground-truth-labels` - Add annotation
- `GET /api/report-cache` - Check cache
- `POST /api/tools` - Execute tool calls
- `GET /api/wmdp-evaluations` - WMDP benchmark results

### Chat
- `POST /api/chat` - Run live chat with auditing

### Database Management
- `POST /api/reset-db` - Reset database (requires RESET_DB_TOKEN)

---

## Environment Variables

### Required
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - For Gemini-based audits (primary)

### Optional (for multi-model support)
- `OPENAI_API_KEY` - For GPT-based audits
- `ANTHROPIC_API_KEY` - For Claude-based audits
- `DEEPSEEK_API_KEY` - For DeepSeek models
- `QWEN_API_KEY` - For Qwen models

### Configuration
- `RESET_DB_TOKEN` - Secret token for database reset endpoint

### Local Development
Create `frontend/.dev.vars`:
```
GEMINI_API_KEY=your_key_here
```

### Production (Cloudflare)
Set secrets via wrangler:
```bash
wrangler secret put GEMINI_API_KEY
```

---

## Development Workflow

### Setup
```bash
cd frontend
npm install
```

### Local Development
```bash
# Option 1: Full stack (Workers + D1)
npm run dev:local  # Builds frontend, runs on http://localhost:8787

# Option 2: Frontend only (no API)
npm run dev  # Vite dev server
```

### Database Setup
```bash
# Initialize local D1 database
rm -rf .wrangler/state/v3/d1
npx wrangler d1 execute thoughtguards-db --local --file=./db/schema.sql

# Or use setup script
npm run setup:local  # migrate + seed
```

### Testing Scripts
```bash
npm run test:local              # Test local setup
npm run test:production         # Test production API
npm run test:conversation       # Test conversation flow
npm run test:scenarios          # Test detection scenarios
npm run verify:seeding          # Verify database seeding
npm run check:db                # Check database status
```

### Deployment
```bash
npm run deploy  # Runs scripts/deploy.sh

# Manual steps:
npm run build
wrangler deploy
```

**Important**: [deploy.sh](frontend/scripts/deploy.sh:38-50) does NOT run migrations or seeding to prevent data loss. Run manually when needed.

---

## CoT Generator Workflow

### Setup (Python)
```bash
cd cot-generator
pip install -r requirements.txt

# Set API keys
export DEEPSEEK_API_KEY="..."
export OPENAI_API_KEY="..."
export ANTHROPIC_API_KEY="..."
export GOOGLE_API_KEY="..."
```

### Generate Conversations
```bash
# Test run (5 conversations)
python main.py --test

# Adversarial mode (targeted manipulation scenarios)
python main.py --adversarial 5 --provider gpt-4o

# Per-persona clean conversations
python main.py --per-persona 5 --modes helpful --provider deepseek-r1

# Full batch
python main.py --count 500 --modes helpful,metric_gamer,conversion_optimized
```

### Import to Database
```bash
cd ../frontend
npm run import  # Runs scripts/import-conversations.ts
```

---

## Key Files to Understand

### Type Definitions
- [types.ts](frontend/types.ts:1-100) - Core TypeScript types (DetectionCategory, TaxonomyDetection, Message, Trace, etc.)
- [lib/types.ts](frontend/lib/types.ts) - Business logic types

### UI Components
- [App.tsx](frontend/App.tsx:1-100) - Main React app, routing, trace loading
- [components/AuditView.tsx](frontend/components/AuditView.tsx) - Detailed audit report UI
- [components/TraceDetail.tsx](frontend/components/TraceDetail.tsx) - Individual trace viewer
- [components/TriadDisplay.tsx](frontend/components/TriadDisplay.tsx) - Taxonomy visualization

### Backend Logic
- [src/worker/index.ts](frontend/src/worker/index.ts:1-109) - Worker entry point, route mounting, SPA fallback
- [lib/skillsRegistry.ts](frontend/lib/skillsRegistry.ts) - Available skills registry
- [lib/multiSkillExecutor.ts](frontend/lib/multiSkillExecutor.ts) - Run multiple skills
- [lib/statisticalAnalysis.ts](frontend/lib/statisticalAnalysis.ts) - Bootstrap CI, calibration

### Database
- [db/schema.sql](frontend/db/schema.sql:1-667) - Full database schema with detailed comments

### Taxonomy
- [taxonomy/taxonomy-description-llm.md](taxonomy/taxonomy-description-llm.md:1-100) - Complete taxonomy guide for LLM auditors

### Constants
- [constants.ts](frontend/constants.ts) - Category styles, UI constants

---

## Common Tasks

### Add a New Audit Skill
1. Create skill directory in `frontend/skills/my-skill-auditor/`
2. Add `skill.json` with name, description, prompt, category
3. Register in [lib/skillsRegistry.ts](frontend/lib/skillsRegistry.ts)
4. Update `CATEGORY_TO_SKILL` mapping if needed

### Run an Audit on a Conversation
```bash
# Via API
curl -X POST http://localhost:8787/api/audit-reports \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "conv_00001",
    "skill_id": "taxonomy-auditor",
    "model_name": "gemini-2.0-flash-exp"
  }'
```

### Reset Database (Local)
```bash
cd frontend
rm -rf .wrangler/state/v3/d1
npm run migrate:local
npm run seed:generate
npm run seed:local
```

### Reset Database (Production)
```bash
# Set RESET_DB_TOKEN secret first
curl -X POST https://your-worker.workers.dev/api/reset-db \
  -H "Authorization: Bearer YOUR_RESET_TOKEN"
```

### View Model Calibration
- Check `calibration_datasets` table
- Calculate sensitivity/specificity against `ground_truth_labels`
- Use [lib/statisticalAnalysis.ts](frontend/lib/statisticalAnalysis.ts) for bootstrap CIs

---

## Architecture Patterns

### Single-Page Application (SPA)
- React Router handles client-side routing
- Worker serves `index.html` for all non-API, non-static routes
- See [src/worker/index.ts](frontend/src/worker/index.ts:68-105) for SPA fallback logic

### Edge-First Design
- Cloudflare Workers run at edge locations worldwide
- D1 database is SQLite running at edge
- Low-latency API responses

### AI-as-a-Judge Pattern
- LLMs audit conversations for manipulation
- Multi-model support for cross-validation
- Parameter sweeps for robustness testing
- Statistical analysis (bootstrap, calibration curves)

### Research-Grade Reproducibility
- Full parameter tracking (prompt_hash, response_hash, system_fingerprint, seed, temperature)
- Versioned skills
- Audit run deduplication via cache
- Model drift detection via canaries

---

## Current State & Known Issues

### Recent Changes (from git log)
- b936b3a: Database reset issue fixed
- 4ab5ffa: Favicon added
- 72ee3a5: Deploy script fix to prevent data loss
- a3b4e3b: Workers routing fix
- 481e035: Taxonomy integration merged

### Database
- Using new `audit_reports` table (old `audit_results` being phased out)
- Multi-run support with statistical aggregation
- Calibration system for model quality assessment

### Frontend
- Currently loads traces from `/api/audit-results` on mount
- Settings allow BYOK (Bring Your Own Key) for API access
- Support for multi-skill audits with combined scoring

---

## Research Context

This project is designed for AI safety research, specifically:
- Detecting manipulation in AI reasoning (chain-of-thought)
- Taxonomy development (WHY-HOW-TARGET framework)
- Model calibration and cross-validation
- Benchmarking detection capabilities
- Dataset generation for training detection models

### Related Concepts
- Reward hacking, specification gaming, Goodhart's Law
- Sycophancy, opinion matching
- Deceptive alignment, sandbagging
- Capability hiding, strategic underperformance
- Oversight gaming, evaluation awareness

---

## Tips for Future Sessions

1. **When analyzing conversations**: Look at both `content` (user-facing) and `reasoning_trace` (CoT/thinking) fields
2. **When running audits**: Use multi-run mode (10-30 runs) for robust confidence intervals
3. **When comparing models**: Use cross-validation with multiple judge models to detect bias
4. **When adding skills**: Follow existing skill JSON format, ensure proper versioning
5. **When deploying**: Remember [deploy.sh](frontend/scripts/deploy.sh) skips migrations/seeding by design
6. **Database changes**: Always create migration files, never modify schema.sql directly for existing DBs
7. **Type safety**: Update both [types.ts](frontend/types.ts) (UI types) and [lib/types.ts](frontend/lib/types.ts) (business logic) when adding features

---

## Useful Links

- GitHub: https://github.com/HilaryTorn/ThoughtGuards
- Cloudflare D1 Docs: https://developers.cloudflare.com/d1/
- Hono Framework: https://hono.dev/
- Gemini API: https://ai.google.dev/

---

**Last Updated**: 2026-01-10
**Git Branch**: main
**Git Status**: Clean (as of last commit)
