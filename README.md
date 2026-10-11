# Letterwell — Bulk Outreach & Email Campaign Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.2-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F.svg)](https://orm.drizzle.team/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ed.svg)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-grade, full-stack email campaign and cold outreach application that delivers personalized bulk emails directly through your authenticated Gmail account using the official Google Workspace APIs. Built with a modern TypeScript monorepo architecture, end-to-end type safety, PostgreSQL persistence, and Clerk authentication.

---

## Architecture Overview

Letterwell is structured as a **pnpm workspace monorepo** with strict contract-driven API communication.

```mermaid
flowchart TD
    subgraph Client ["Frontend Client (React 19)"]
        UI[Tailwind UI & Radix Primitives]
        Editor[Template Editor & Recipient Grid]
        Query[TanStack React Query Client]
        AuthClient[Clerk Auth SDK]
    end

    subgraph Server ["Backend API (Express 5)"]
        API[Express REST API Router]
        AuthMW[Clerk Express Auth Middleware]
        RateLimiter[Campaign Worker & Rate Limiter]
        GmailService[Google APIs OAuth2 Client]
    end

    subgraph Persistence ["Data & External Services"]
        PG[(PostgreSQL 16)]
        GoogleAPI[Google Gmail API v1]
        ClerkService[Clerk Identity Provider]
    end

    UI --> Query
    Query -->|Type-safe HTTP / OpenAPI| API
    AuthClient <--> ClerkService
    API --> AuthMW
    AuthMW <--> ClerkService
    API --> RateLimiter
    RateLimiter --> GmailService
    RateLimiter -->|Drizzle ORM| PG
    GmailService -->|RFC 2822 MIME| GoogleAPI
```

### Monorepo Structure

```
.
├── artifacts/
│   ├── api-server/             # Express 5 REST API & Gmail worker service
│   │   ├── src/lib/gmail.ts    # Google OAuth2 & Gmail API client
│   │   ├── src/routes/         # Campaign orchestration routes
│   │   └── src/app.ts          # Middleware, CORS, and Clerk integration
│   ├── gmail-campaign/         # React 19 single-page application
│   │   ├── src/App.tsx         # Template editor, CSV importer & campaign monitor
│   │   └── src/components/ui/  # Reusable Radix UI & Tailwind design system
│   └── mockup-sandbox/         # Isolated component preview sandbox
├── lib/
│   ├── api-spec/               # OpenAPI 3.0 specification contract
│   ├── api-zod/                # Auto-generated runtime Zod validation schemas
│   ├── api-client-react/       # Auto-generated TanStack Query React hooks (via Orval)
│   └── db/                     # Drizzle ORM PostgreSQL schema & migrations
├── docker-compose.yml          # Local container orchestrator (API + PostgreSQL)
├── Dockerfile                  # Multi-stage production container build
├── package.json                # Monorepo task orchestration scripts
└── pnpm-workspace.yaml         # Pnpm workspace & catalog definitions
```

---

## Key Features

- **Direct Gmail API Dispatch:** Emails originate directly from your genuine Google account via official OAuth2 scopes (`gmail.send`, `gmail.readonly`), ensuring high deliverability without third-party SMTP deliverability hits.
- **Dynamic Variable Interpolation:** Personalize subjects and bodies with tags like `{{name}}`, `{{company}}`, and `{{role}}`. Includes real-time syntax checking to highlight malformed tags before dispatch.
- **CSV & Spreadsheet Importer:** Paste or parse spreadsheet tables directly into an interactive recipient grid with field-length validations and RFC-compliant email checks.
- **Attachment & Resume Support:** Attach resumes or portfolio documents (PDF, DOCX, TXT up to 5MB) encoded into compliant multipart/mixed MIME payloads.
- **Durable Campaign Tracking:** Campaign metadata, lifecycle states (`sending`, `paused`, `completed`), and per-recipient delivery statuses (`queued`, `sending`, `sent`, `failed`) are persisted in PostgreSQL.
- **Rate-Limiting & Safety Backoff:** Throttled dispatch loop designed to stay well within Gmail sending limits and prevent mailbox reputation degradation.
- **End-to-End Type Safety:** Changes to the OpenAPI specification (`lib/api-spec`) generate runtime Zod validators (`lib/api-zod`) and React Query hooks (`lib/api-client-react`).

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS v4, Radix UI, TanStack Query, Lucide Icons, Wouter |
| **Backend** | Node.js 22, Express 5, TypeScript, Pino Logger, Google APIs (`googleapis`), Drizzle ORM |
| **Database** | PostgreSQL 16 (with connection pooling and Drizzle Kit migrations) |
| **Authentication** | Clerk (OAuth token delegation for Google Workspace) |
| **DevOps & Tooling** | Docker, Docker Compose, pnpm Workspaces, Orval |

---

## Getting Started

### Prerequisites

- **Node.js:** `>= 20.18.0` (Node 22 LTS recommended)
- **Package Manager:** `pnpm` (`npm install -g pnpm` or `corepack enable`)
- **Database:** PostgreSQL instance running locally or via Docker
- **Google Cloud Console:** OAuth 2.0 Client Credentials with Gmail API enabled
- **Clerk:** Account with publishable and secret keys

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/genius-0963/BulK-Mail.git
cd BulK-Mail
```

### Step 2: Install Dependencies

```bash
pnpm install
```

### Step 3: Configure Environment Variables

Create a root `.env` file based on the template:

```bash
cp .env.example .env
```

Populate the required credentials:

```dotenv
NODE_ENV=development
PORT=3000

# PostgreSQL Connection String
DATABASE_URL=postgres://postgres:postgres@localhost:5432/bulk_outreach

# Clerk Authentication (https://dashboard.clerk.com)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Google OAuth2 Credentials (https://console.cloud.google.com)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

### Step 4: Run Database Migrations

Apply the Drizzle database schema to your PostgreSQL instance:

```bash
pnpm run db:push
```

### Step 5: Start Development Servers

Run backend and frontend concurrently:

```bash
# Terminal 1: Backend API Server (Port 3000)
pnpm run dev:api

# Terminal 2: Frontend Web App (Port 5173)
pnpm run dev:web
```

The application will be accessible at:
- **Web App:** `http://localhost:5173`
- **API Server:** `http://localhost:3000/api`

---

## Running with Docker Compose

To spin up both the backend server and an isolated PostgreSQL 16 database with a single command:

```bash
# Build and start services in the background
docker compose up -d --build

# View container logs
docker compose logs -f

# Stop services
docker compose down
```

The database container will run on port `5432` with a persistent volume (`postgres_data`), and the API container will be exposed on port `3000`.

---

## Google Cloud & Gmail API Configuration

To enable automated dispatch via Gmail, configure your Google Cloud project:

1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Under **APIs & Services > Library**, enable the **Gmail API**.
4. Under **APIs & Services > OAuth consent screen**:
   - Choose User Type (External or Internal).
   - Add the scopes:
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.readonly`
5. Under **APIs & Services > Credentials**, create an **OAuth 2.0 Client ID** (Web Application).
6. Obtain your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Generate a refresh token via the OAuth Playground or Clerk Google OAuth connection.

---

## Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `pnpm run dev:web` | Starts the frontend Vite development server |
| `pnpm run dev:api` | Starts the Express API server with automatic hot-reloading (`tsx`) |
| `pnpm run build` | Runs full typecheck and compiles all libraries and web artifacts |
| `pnpm run typecheck` | Validates TypeScript types across all workspace packages |
| `pnpm run db:push` | Pushes Drizzle schemas directly to the connected PostgreSQL instance |

---

## Safety & Best Practices

- **Google Daily Sending Limits:** Regular Gmail accounts (`@gmail.com`) have a hard ceiling of 500 emails/day, while Google Workspace accounts have a limit of 2,000 emails/day.
- **Warm-Up Schedules:** When using new domains or accounts for cold outreach, increase batch volumes gradually over several weeks to protect domain reputation.
- **Opt-Out Compliance:** Always include an opt-out or unsubscribe mechanism in your email body to comply with CAN-SPAM and GDPR regulations.

---

## License

This project is licensed under the [MIT License](LICENSE).
