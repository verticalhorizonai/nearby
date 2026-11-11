// Calendar MCP client adapter (task 210; REQ-01-01): the agent service's MCP client of nearby-calendar-mcp. In
// production it runs the server as a child process over stdio (spec 3.2.2 "Transport: stdio").
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { McpAppointment } from './demoBackend.js';
import { DEMO_BACKEND_CALENDAR_NAME } from './demoBackend.js';
import { LIST_TOOL } from './server.js';

export interface CalendarSource {
  readonly calendarName: string;
  listUpcomingAppointments(daysAhead?: number): Promise<McpAppointment[]>;
  /** The tool definition passed through to Claude (spec 3.2.2: "passes the tool through to Claude"). */
  toolDefinition(): Promise<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  close(): Promise<void>;
}

/** The stdio transport that spawns nearby-calendar-mcp from this build (compiled .js or, in development, .ts via tsx). */
export function stdioTransport(): Transport {
  const js = fileURLToPath(new URL('./server.js', import.meta.url));
  const ts = fileURLToPath(new URL('./server.ts', import.meta.url));
  const args = existsSync(js) ? [js] : ['--import', 'tsx', ts];
  return new StdioClientTransport({ command: process.execPath, args, stderr: 'inherit' });
}

export class McpCalendarSource implements CalendarSource {
  readonly calendarName = DEMO_BACKEND_CALENDAR_NAME;
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly makeTransport: () => Transport = stdioTransport) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = new Client({ name: 'nearby-agent-service', version: '1.0.0' });
        await client.connect(this.makeTransport());
        client.onclose = () => {
          this.client = null;
          this.connecting = null;
        };
        this.client = client;
        return client;
      })().catch((err) => {
        this.connecting = null;
        throw err;
      });
    }
    return this.connecting;
  }

  async listUpcomingAppointments(daysAhead?: number): Promise<McpAppointment[]> {
    const client = await this.connect();
    const result = await client.callTool({ name: LIST_TOOL, arguments: daysAhead === undefined ? {} : { days_ahead: daysAhead } });
    if (result.isError) throw new Error(`Calendar MCP tool error: ${JSON.stringify(result.content)}`);
    const structured = result.structuredContent as { appointments?: McpAppointment[] } | undefined;
    if (structured?.appointments) return structured.appointments;
    const text = (result.content as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text ?? '{}';
    return (JSON.parse(text) as { appointments: McpAppointment[] }).appointments ?? [];
  }

  async toolDefinition() {
    const client = await this.connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === LIST_TOOL);
    if (!tool) throw new Error('nearby-calendar-mcp does not expose list_upcoming_appointments');
    return { name: tool.name, description: tool.description ?? '', input_schema: tool.inputSchema as Record<string, unknown> };
  }

  async close(): Promise<void> {
    const c = this.client;
    this.client = null;
    this.connecting = null;
    await c?.close();
  }
}
