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
  shown: only matched offers, at most two, at most 25 words. Distances shown are always the code's. While it runs, My
  week and the stop's page show its tool calls live, as they happen ("Reading your week", "Looking up places",
  "Checking 3 offers", "Choosing"), then what it came to ("2 picks", "1 pick", "Nothing fits").
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
- **Merchants.** Any visitor can open a sample merchant's dashboard and post an offer. A posted offer belongs to the
  browser that posted it: it is shown, matched for picks and sold only there, and only that browser can edit or
  remove it. The eight sample offers are shared and never change; editing one makes that browser's own version,
  which replaces the sample offer in its demo only. Removing or editing an offer never changes a past sale or
  receipt; removing your version, or Reset demo, brings the sample offer back.
- **Every outside service is behind one adapter** (PayPal, Anthropic, Google Places), each with recorded fixtures.
  The automated tests use the fixtures only and never call a live service.

## Bring your own agent

Nearby's offers are open to any AI assistant that speaks MCP, and the purchase is still one person's yes. The app
serves a small read-only MCP server at `/mcp` on its own address (for a local run, `http://localhost:3000/mcp`):
Streamable HTTP, stateless, no sign-in.

Add it to an MCP client as a Streamable HTTP (or "HTTP") server with that URL. For example, in Claude Code:

```bash
claude mcp add --transport http nearby https://your-nearby-address/mcp
```

or, in a client that reads a JSON configuration:

```json
{ "mcpServers": { "nearby": { "type": "http", "url": "https://your-nearby-address/mcp" } } }
```

It has two tools. Neither can buy anything.

- **`find_offers_near`** takes `lat`, `lng`, `starts_at` (ISO 8601 with an offset, for example
  `2026-11-17T09:30:00-07:00`) and an optional `radius_miles` (at most 3). It runs the app's own matching for a stop
  at that place and time (treated as a one-hour appointment) and returns at most two offers, best first, each with
  `offer_id`, `merchant`, `sample`, `title`, `price` and `price_cents`, `deposit`, `distance` (as the app's card
  writes it, for example `0.2 mi`), `valid_window`, `time_fit`, `score` and `checkout_url`. Outside the demo area
  around Tucson, or for a start that is not within the next 7 days, the list is empty and `note` says why.
- **`get_offer`** takes an `offer_id` and returns the same fields without the distance. Given `lat`, `lng` and
  `starts_at` as well, it also returns that stop's `time_fit`, `score` and `checkout_url`; without them those are
  `null`.

The tools call no model and no outside service, write nothing, and are rate limited per client address (60 requests
a minute). To buy, a person opens `checkout_url` in a browser. That page changes nothing: it shows the offer with its
Sample badge, the price from Nearby's database, the place and the time, and one button, **Review in Nearby**. The
button checks again that the offer still fits, adds the stop to that browser's week ("Added by your assistant") with
the offer as a pick ("Suggested by your assistant"), and opens the stop. From there it is the usual flow: Yes, the
confirmation sheet, approval on PayPal's sandbox page, the receipt. The pick's sentence is Nearby's own template; a
`title` added to the link is shown as plain text (at most 80 characters) and is never given to the model. Reset demo
removes these stops with their picks.

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
