import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

async function run() {
    const server = "spmsql402.database.windows.net";
    const database = "ODS";

    console.log(`\n=== Connecting to ${server} [${database}] ===`);
    console.log("Starting Entra ID Interactive Login (Browser)...");

    try {
        const credential = new InteractiveBrowserCredential({
            redirectUri: 'http://localhost'
        });

        console.log("Requesting access token from Azure...");
        const accessToken = await credential.getToken('https://database.windows.net/.default');
        console.log("✓ Access token received.\n");

        const config = {
            server: server,
            database: database,
            options: {
                encrypt: true,
                trustServerCertificate: false
            },
            authentication: {
                type: 'azure-active-directory-access-token',
                options: {
                    token: accessToken.token,
                },
            },
            connectionTimeout: 60000,
        };

        console.log("Connecting to SQL Server...");
        await sql.connect(config);
        console.log("✓ Connected successfully!\n");

        console.log(">>> Listing tables in schema [odsmds]...");
        const result = await sql.query`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'odsmds' 
      AND TABLE_TYPE = 'BASE TABLE' 
      ORDER BY TABLE_NAME
    `;

        if (result.recordset.length === 0) {
            console.log("No tables found in [odsmds].");
        } else {
            console.table(result.recordset);
        }

        await sql.close();
        console.log("\n=== Task Completed Successfully ===");
    } catch (err) {
        console.error("\n!!! ERROR OCCURRED !!!");
        console.error(err);
        process.exit(1);
    }
}

run();
