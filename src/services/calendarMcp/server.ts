// nearby-calendar-mcp (spec 3.2; REQ-01-04): a small read-only MCP server with one tool, list_upcoming_appointments,
// over stdio. The agent service runs it as a child process and is its MCP client. Read only: no tool writes anything.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CALENDAR_MCP_DAYS_AHEAD_DEFAULT, CALENDAR_MCP_DAYS_AHEAD_MAX, CALENDAR_MCP_SERVER_NAME } from '../../shared/types.js';
import { demoAppointments, DEMO_BACKEND_CALENDAR_NAME } from './demoBackend.js';

export const LIST_TOOL = 'list_upcoming_appointments';

export function createCalendarMcpServer(now: () => Date = () => new Date()): McpServer {
  const server = new McpServer({ name: CALENDAR_MCP_SERVER_NAME, version: '1.0.0' });
  server.registerTool(
    LIST_TOOL,
    {
      title: 'List upcoming appointments',
      description: `Read-only. Lists calendar events in the next days_ahead days (default ${CALENDAR_MCP_DAYS_AHEAD_DEFAULT}, max ${CALENDAR_MCP_DAYS_AHEAD_MAX}) with their location text. Calendar: ${DEMO_BACKEND_CALENDAR_NAME}.`,
      inputSchema: { days_ahead: z.number().int().min(1).max(CALENDAR_MCP_DAYS_AHEAD_MAX).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ days_ahead }) => {
      const result = { appointments: demoAppointments(now(), days_ahead ?? CALENDAR_MCP_DAYS_AHEAD_DEFAULT) };
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    },
  );
  return server;
}

// Run over stdio when started as a process (the agent service spawns this file).
const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const server = createCalendarMcpServer();
  await server.connect(new StdioServerTransport());
}
