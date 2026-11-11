# Deploying Nearby

Nearby runs as one container: the Fastify server applies the database schema at start, serves the API under `/api`
and serves the built React client. It needs a PostgreSQL database. It is built for Railway with Railway's
PostgreSQL (spec 3.1), and runs anywhere that runs a Dockerfile.

## Environment variables

Every variable is set on the deployed service, never committed. `.env.example` lists the same names with
placeholder values.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. On Railway, reference the PostgreSQL service's `DATABASE_URL`. |
| `APP_BASE_URL` | Yes | The public URL of the app, e.g. `https://nearby-production.up.railway.app`. PayPal returns the shopper here, and a request that changes anything is accepted only from this origin. |
| `PAYPAL_BASE_URL` | Yes | Must be `https://api-m.sandbox.paypal.com`. The app refuses to start with any other value, unset included. |
| `PAYPAL_CLIENT_ID` | Yes, to take payments | Client id of a PayPal **sandbox** REST app (developer.paypal.com, Apps & Credentials, Sandbox). |
| `PAYPAL_CLIENT_SECRET` | Yes, to take payments | Secret of the same sandbox app. |
| `ANTHROPIC_API_KEY` | No | Claude API key. Without it, every pick comes from the fallback (top two by score, template reason). |
| `ANTHROPIC_MODEL` | No | The Claude model id the agent uses. |
| `AGENT_DISABLED` | No | `true` turns the model off (the kill switch); every pick then comes from the fallback. Read on every request: no restart needed. |
| `GOOGLE_MAPS_SERVER_KEY` | No | Server-side key restricted to the Places API (New). Without it, the map is the SVG plot of Nearby's own merchants. |
| `GOOGLE_MAPS_BROWSER_KEY` | No | Browser key restricted to the Maps JavaScript API and your domain. Without it, the map is the SVG plot. |
| `APP_REPO_URL` | No | When set, the home page footer links to the source repository. |

`PORT` is set by Railway itself; the server listens on it (3000 when it is not set).

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the client (`dist/client`) and the server (`dist/server`). |
| `npm start` | Applies the schema (from `src/models/schema/`, copied into `dist`), then starts the server. |
| `npm run seed` | Applies the schema and loads the sample data: eight sample merchants and their offers. Safe to run again: it never duplicates. The demo calendar ships with the app. **The container runs it at every start** (`CMD ["sh", "-c", "npm run seed && npm start"]`), so a deploy needs no separate seed step. |

## Railway, step by step

1. Create a project and add a **PostgreSQL** service.
2. Add a service from the GitHub repository. The Dockerfile is detected. If the app is not at the repository root,
   set the service's **Root Directory** to the folder that holds the `Dockerfile`.
3. In the service's **Variables**, set the variables above. `DATABASE_URL` references the PostgreSQL service.
4. In **Settings, Networking**, generate a domain, then set `APP_BASE_URL` to it (with `https://`, no trailing slash).
5. Nothing to seed by hand: the container seeds the sample data at every start, before the server starts (the seed is
   idempotent, so restarts never duplicate data).
6. Deploy. The log line `Server listening` means it is up; `Nearby did not start: PAYPAL_BASE_URL must be the PayPal
   sandbox` means the PayPal variable is wrong.

## Trying a sandbox purchase

Use a PayPal **sandbox personal (buyer)** account (developer.paypal.com, Testing Tools, Sandbox Accounts). Open the
app, Try the demo, choose the Shopper seat, open the week, open an appointment, tap Yes, then Pay with PayPal, and log
in on PayPal's sandbox page with the buyer account. Back in Nearby the receipt shows a redemption code; the sale
appears on that merchant's dashboard within 5 seconds. No real money moves.
