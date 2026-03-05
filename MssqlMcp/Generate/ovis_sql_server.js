import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

const server = new Server({
    name: "ovis-sql-server",
    version: "1.0.0"
}, {
    capabilities: { tools: {} }
});

async function getSqlConfig() {
    const credential = new InteractiveBrowserCredential({ redirectUri: 'http://localhost' });
    const accessToken = await credential.getToken('https://database.windows.net/.default');
    return {
        server: "s-p-azu-sql011.database.windows.net",
        database: "ODV_PON",
        options: { encrypt: true, trustServerCertificate: true },
        authentication: {
            type: 'azure-active-directory-access-token',
            options: { token: accessToken.token }
        }
    };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: "read_data",
        description: "Execute a SELECT query on OVIS SQL",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string" }
            },
            required: ["query"]
        }
    }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "read_data") {
        const config = await getSqlConfig();
        const pool = await sql.connect(config);
        const result = await pool.request().query(request.params.arguments.query);
        await pool.close();
        return {
            content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }]
        };
    }
    throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);
