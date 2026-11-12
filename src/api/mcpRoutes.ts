// /mcp: the Nearby MCP server for any agent (build ruling 42), Streamable HTTP in stateless mode. Each POST is one
// JSON-RPC exchange answered as JSON; there is no MCP session, no sign-in and no browser session (the session and
// origin middleware cover /api/ only, so /mcp is outside the browser origin rule). Nothing here calls a model or an
// outside service, or writes. Each client address has its own in-process rate limit.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MCP_PATH, MCP_REQUESTS_PER_ADDRESS_PER_MINUTE } from '../shared/types.js';
import { createOffersMcpServer } from '../services/offersMcp/server.js';
import type { OfferSearch } from '../services/offersMcp/offerSearch.js';
import { WindowLimiter } from '../services/offersMcp/windowLimiter.js';

/**
 * The client's address. Behind the host's proxy (Railway) the last X-Forwarded-For entry is the one that proxy added,
 * so a client cannot choose it; without a proxy it is the socket's address.
 */
export function clientAddress(req: FastifyRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const list = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list[list.length - 1] ?? req.socket.remoteAddress ?? 'unknown';
}

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

export function registerMcpRoutes(app: FastifyInstance, search: OfferSearch, limiter: WindowLimiter): void {
  app.post(MCP_PATH, async (req, reply) => {
    if (!limiter.take(clientAddress(req))) {
      return reply
        .code(429)
        .header('retry-after', '60')
        .send(jsonRpcError(-32000, `Too many requests: at most ${MCP_REQUESTS_PER_ADDRESS_PER_MINUTE} a minute from one address. Try again in a minute.`));
    }
    const server = createOffersMcpServer(search);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  // Stateless: there is no stream to open and no session to end.
  const notAllowed = async (_req: FastifyRequest, reply: import('fastify').FastifyReply) =>
    reply.code(405).header('allow', 'POST').send(jsonRpcError(-32000, 'Method not allowed. Send MCP requests as POST.'));
  app.get(MCP_PATH, notAllowed);
  app.delete(MCP_PATH, notAllowed);
}
