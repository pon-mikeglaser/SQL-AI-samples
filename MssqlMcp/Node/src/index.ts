import sql from "mssql";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { InteractiveBrowserCredential } from "@azure/identity";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";

let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

async function createSqlConfig(): Promise<{ config: sql.config, token: string, expiresOn: Date }> {
  const credential = new InteractiveBrowserCredential({
    redirectUri: 'http://localhost'
  });
  const accessToken = await credential.getToken('https://database.windows.net/.default');

  if (!process.env.SERVER_NAME) throw new Error("SERVER_NAME environment variable is required");
  if (!process.env.DATABASE_NAME) throw new Error("DATABASE_NAME environment variable is required");

  return {
    config: {
      server: process.env.SERVER_NAME,
      database: process.env.DATABASE_NAME,
      options: {
        encrypt: true,
        trustServerCertificate: process.env.TRUST_SERVER_CERTIFICATE === "true"
      },
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: accessToken.token,
        },
      },
      connectionTimeout: 30000,
    },
    token: accessToken.token,
    expiresOn: accessToken.expiresOnTimestamp ? new Date(accessToken.expiresOnTimestamp) : new Date(Date.now() + 30 * 60 * 1000)
  };
}

const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();

const server = new Server(
  {
    name: "mssql-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const isReadOnly = process.env.READONLY === "true";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: isReadOnly
    ? [listTableTool, readDataTool, describeTableTool]
    : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    await ensureSqlConnection();
    let result;
    switch (name) {
      case insertDataTool.name: result = await insertDataTool.run(args); break;
      case readDataTool.name: result = await readDataTool.run(args); break;
      case updateDataTool.name: result = await updateDataTool.run(args); break;
      case createTableTool.name: result = await createTableTool.run(args); break;
      case createIndexTool.name: result = await createIndexTool.run(args); break;
      case listTableTool.name: result = await listTableTool.run(args); break;
      case dropTableTool.name: result = await dropTableTool.run(args); break;
      case describeTableTool.name: result = await describeTableTool.run(args as any); break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error occurred: ${error}` }], isError: true };
  }
});

async function ensureSqlConnection() {
  if (globalSqlPool && globalSqlPool.connected && globalAccessToken && globalTokenExpiresOn && globalTokenExpiresOn > new Date(Date.now() + 2 * 60 * 1000)) {
    return;
  }
  const { config, token, expiresOn } = await createSqlConfig();
  globalAccessToken = token;
  globalTokenExpiresOn = expiresOn;
  if (globalSqlPool) await globalSqlPool.close();
  globalSqlPool = await sql.connect(config);
}

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});