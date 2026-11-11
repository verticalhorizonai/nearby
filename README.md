# Nearby

Nearby is an AI agent for local offers, paid with PayPal. It reads where your calendar takes you this week, finds one
or two offers that fit each stop, tells you why in a sentence, and checks out through PayPal after one yes. Merchants
post offers in a simple dashboard and watch sales arrive.

> **Sample data notice.** Every merchant, offer and appointment in this demo is made up and labelled as sample data.
> None is a real business or person. Appointments come from a demo calendar. Payments run in the PayPal sandbox; no
> real money moves.

## How it works

- **The calendar, over MCP.** `nearby-calendar-mcp` is a small read-only MCP server in this repository
  (`src/services/calendarMcp/`). It has one tool, `list_upcoming_appointments`, and one back end: the demo calendar
  of five sample appointments around Tucson and two events that are skipped (a video call and an all-day reminder).
  Each is placed on the next occurrence of its weekday, so the demo never goes stale. The server runs as a child
  process over stdio; the agent service is its MCP client.
- **Matching is code, not the model.** For each appointment, plain code finds the offers within one mile (three if
  nothing fits), valid on that weekday and within 45 minutes before to 60 minutes after the appointment, not already
  bought, and with a sensible time fit for the category (coffee in the morning, dinner in the evening). Each gets a
  score from distance and time fit; ties go to the nearer one. All times are America/Phoenix.
- **The agent.** Claude, through the Anthropic Messages API with tool use, run on the server. It has four tools:
  `list_upcoming_appointments`, `find_places_near`, `find_offer_candidates` and `propose_offer`. It chooses at most two
  of the matched offers and writes a one-sentence reason for each. Its output is checked in code before anything is
  shown: only matched offers, at most two, at most 25 words. Distances shown are always the code's.
- **One yes.** Claude has no payment tool. Tapping Yes mints a single-use confirmation token (256 random bits, stored
  only as a hash, valid for 10 minutes, bound to that pick and that browser). Only the purchase route can create a
  PayPal order, and only with that token. The amount is the offer's price read from the database, never from the
  browser or the model.
- **PayPal.** Orders v2 REST from the server, sandbox only: the app refuses to start unless `PAYPAL_BASE_URL` is the
  sandbox. Create the order, send the shopper to PayPal's sandbox page to approve, capture on return. A second return
  shows the same receipt and captures nothing; a cancel returns the shopper to the pick.
- **The demo never depends on the model or on Google.** With the kill switch on (`AGENT_DISABLED=true`), a model
  error or a 20-second timeout, output that fails the checks, or a rate limit reached (30 requests per browser per
  hour, 300 in all), picks are the top two by score with a templated reason. With no Google key, the map is a drawn
  plot of the appointment and Nearby's own merchants.
- **Every outside service is behind one adapter** (PayPal, Anthropic, Google Places), each with recorded fixtures.
  The automated tests use the fixtures only and never call a live service.

Stack: TypeScript and Node with Fastify, React built with Vite, Tailwind CSS with shadcn/ui components, PostgreSQL,
Vitest.

## Setup

You need Node 22 and PostgreSQL.

```bash
npm install
cp .env.example .env    # then fill in the values
npm run build
npm run seed            # loads the eight sample merchants and their offers; safe to run again (the container does this at start)
npm start               # applies the schema, then serves the app on $PORT (3000 by default)
```

`npm test` runs the test suite (it needs a PostgreSQL database named by `TEST_DATABASE_URL`, default
`postgres://postgres@localhost:55432/nearby_test`; each test file uses its own throwaway schema). `npm run lint` runs
ESLint and the type checks.

## Environment variables

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. |
| `APP_BASE_URL` | The app's public URL. PayPal returns here; changes are accepted only from this origin. |
| `ANTHROPIC_API_KEY` | Claude API key (optional: without it, every pick comes from the fallback). |
| `ANTHROPIC_MODEL` | The Claude model id. |
| `AGENT_DISABLED` | `true` turns the model off (the kill switch). |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | A PayPal sandbox REST app's credentials. |
| `PAYPAL_BASE_URL` | Must be `https://api-m.sandbox.paypal.com`. |
| `GOOGLE_MAPS_SERVER_KEY` | Places API (New) key, server side (optional). |
| `GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript API key for the browser (optional). |
| `APP_REPO_URL` | When set, the home page links to the source. |

Credentials live only in environment variables; `.env.example` holds placeholders. Deployment: `DEPLOY.md`.

## The design

The three approved reference screens are in `design/` (`home.html`, `choose-a-seat.html`,
`appointment-detail.html`): the record of the look the app is built to.

## Licence

MIT. See `LICENSE`. The shadcn/ui components under `src/components/ui/` follow shadcn/ui's form (MIT); the Inter and
Bricolage Grotesque fonts are bundled under the SIL Open Font License.
