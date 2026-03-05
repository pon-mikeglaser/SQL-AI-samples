import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

async function run() {
    const server = "spmsql402.database.windows.net";
    const database = "ODS";

    console.log(`\n=== Listing ALL WHERE Clause Dates for SF Views on Production ===`);

    try {
        const credential = new InteractiveBrowserCredential({ redirectUri: 'http://localhost' });
        const accessToken = await credential.getToken('https://database.windows.net/.default');

        const config = {
            server: server,
            database: database,
            options: { encrypt: true, trustServerCertificate: false },
            authentication: {
                type: 'azure-active-directory-access-token',
                options: { token: accessToken.token }
            }
        };

        await sql.connect(config);

        const listRes = await sql.query(`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.VIEWS 
      WHERE TABLE_SCHEMA IN ('odssf', 'aplsf', 'srcsf')
    `);

        const views = listRes.recordset;

        for (const view of views) {
            const query = `SELECT OBJECT_DEFINITION(OBJECT_ID('${view.TABLE_SCHEMA}.${view.TABLE_NAME}')) as Definition`;
            const result = await sql.query(query);
            const definition = result.recordset[0].Definition;

            if (definition) {
                const match = definition.match(/WHERE\s+(\d{8})\s*=\s*\1/i);
                if (match) {
                    console.log(`${view.TABLE_SCHEMA}.${view.TABLE_NAME}: ${match[1]}`);
                } else {
                    // Check for any 8 digit number near WHERE
                    const upperDef = definition.toUpperCase();
                    const whereIdx = upperDef.lastIndexOf('WHERE');
                    if (whereIdx !== -1) {
                        const snippet = upperDef.substring(whereIdx, whereIdx + 40);
                        const fallbackMatch = snippet.match(/(\d{8})/);
                        if (fallbackMatch) {
                            console.log(`${view.TABLE_SCHEMA}.${view.TABLE_NAME}: ${fallbackMatch[1]} (fallback match)`);
                        } else {
                            console.log(`${view.TABLE_SCHEMA}.${view.TABLE_NAME}: No date pattern found in snippet: ${snippet.trim()}`);
                        }
                    } else {
                        console.log(`${view.TABLE_SCHEMA}.${view.TABLE_NAME}: No WHERE found`);
                    }
                }
            }
        }

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

run();
