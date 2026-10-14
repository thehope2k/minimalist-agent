import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TOOL_COUNT = Number(process.env.FIXTURE_TOOL_COUNT ?? 30);

const server = new McpServer({ name: 'fixture', version: '1.0.0' });
for (let i = 0; i < TOOL_COUNT; i++) {
  server.registerTool(
    `lookup_record_${i}`,
    {
      description: `Look up record number ${i} in the fixture database`,
      inputSchema: { id: z.string() },
    },
    async ({ id }) => ({ content: [{ type: 'text', text: `record ${i}:${id}` }] }),
  );
}
await server.connect(new StdioServerTransport());
