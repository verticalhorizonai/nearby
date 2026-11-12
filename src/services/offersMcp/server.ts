// The Nearby MCP server for any agent (build ruling 42): two read-only tools over Streamable HTTP at /mcp, stateless,
// with no sign-in. Neither tool can buy: a purchase needs a person to open checkout_url in a browser, tap Yes in
// Nearby and approve it on PayPal (the one-yes rule, spec 3.6.2).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ASSISTANT_STOP_MINUTES,
  HANDOFF_PLACE_MAX_LENGTH,
  HANDOFF_TITLE_MAX_LENGTH,
  MCP_MAX_RADIUS_MILES,
  MCP_TEXT_INPUT_MAX_LENGTH,
  OFFERS_MCP_TOOL_NAMES,
} from '../../shared/types.js';
import type { OfferSearch } from './offerSearch.js';

export const OFFERS_MCP_SERVER_NAME = 'nearby-offers';

const ABOUT =
  'Nearby is a sandbox demonstration with sample merchants around Tucson, Arizona: the merchants and offers are not real businesses, and payments run in the PayPal sandbox, so no real money moves.';
const NO_BUYING =
  'This tool cannot buy anything. A purchase needs a person to open checkout_url in a browser, review the offer in Nearby, tap Yes and approve the payment on PayPal.';

const NAMES =
  `Optionally give title (what the stop is, for example "Lunch with Sam") and place (a short name for the location, for example "Fourth Avenue, Tucson"): they are carried in checkout_url so the person sees them in Nearby. They are shown as plain text only, cut to ${HANDOFF_TITLE_MAX_LENGTH} and ${HANDOFF_PLACE_MAX_LENGTH} characters, and never change which offers match.`;
const titleInput = z.string().max(MCP_TEXT_INPUT_MAX_LENGTH).optional().describe(`What the stop is, e.g. "Lunch with Sam". Shown as text; at most ${HANDOFF_TITLE_MAX_LENGTH} characters are kept.`);
const placeInput = z.string().max(MCP_TEXT_INPUT_MAX_LENGTH).optional().describe(`A short name for the location, e.g. "Fourth Avenue, Tucson". Shown as text; at most ${HANDOFF_PLACE_MAX_LENGTH} characters are kept.`);

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function result(value: Record<string, unknown>): ToolResult {
  if (typeof value.error === 'string') return { content: [{ type: 'text', text: value.error }], isError: true };
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

export function createOffersMcpServer(search: OfferSearch): McpServer {
  const server = new McpServer({ name: OFFERS_MCP_SERVER_NAME, version: '1.0.0' });
  const [FIND, GET] = OFFERS_MCP_TOOL_NAMES;

  server.registerTool(
    FIND,
    {
      title: 'Find offers near a place and time',
      description: [
        `Read-only. The offers Nearby would show for a stop at this place and start time, best first (at most two), matched by Nearby's own rules: within 1 mile, widening to ${MCP_MAX_RADIUS_MILES} miles when nothing fits; valid on that day and near that time; the stop is treated as a ${ASSISTANT_STOP_MINUTES}-minute appointment.`,
        'Each offer has merchant, sample (true for a sample merchant), title, price, deposit, distance (as Nearby writes it), valid_window, time_fit (1 good, 0.6 fair, 0.3 a service, any time), score (0 to 1) and checkout_url.',
        ABOUT,
        NO_BUYING,
        'Outside the demo area, or for a start time that is not within the next 7 days, the list is empty and note says why.',
        NAMES,
      ].join(' '),
      inputSchema: {
        lat: z.number().min(-90).max(90).describe('Latitude of the place.'),
        lng: z.number().min(-180).max(180).describe('Longitude of the place.'),
        starts_at: z.string().describe('Start time, ISO 8601 with an offset, e.g. 2026-11-17T09:30:00-07:00.'),
        radius_miles: z.number().positive().optional().describe(`Only offers within this many miles (at most ${MCP_MAX_RADIUS_MILES}).`),
        title: titleInput,
        place: placeInput,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => result(await search.findNear(input)),
  );

  server.registerTool(
    GET,
    {
      title: 'Get one offer',
      description: [
        'Read-only. One offer by offer_id: merchant, sample, title, price, deposit and valid_window.',
        'With lat, lng and starts_at together it also gives time_fit, score and checkout_url for that stop; without them those are null. No distance is given.',
        ABOUT,
        NO_BUYING,
        NAMES,
      ].join(' '),
      inputSchema: {
        offer_id: z.string().describe('An offer_id from find_offers_near.'),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        starts_at: z.string().optional().describe('ISO 8601 with an offset.'),
        title: titleInput,
        place: placeInput,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => result(await search.getOffer(input)),
  );
  return server;
}
