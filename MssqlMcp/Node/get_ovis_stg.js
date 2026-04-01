import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";
import fs from "fs";

async function run() {
    const credential = new InteractiveBrowserCredential({ redirectUri: 'http://localhost' });
    const accessToken = await credential.getToken('https://database.windows.net/.default');

    const config = {
        server: "s-p-azu-sql011.database.windows.net",
        database: "ODV_PON",
        options: { encrypt: true, trustServerCertificate: true },
        authentication: {
            type: 'azure-active-directory-access-token',
            options: { token: accessToken.token }
        }
    };

    try {
        console.log("Connecting to OVIS...");
        const pool = await sql.connect(config);
        console.log("Connected! Fetching schemas...");

        const schemaQuery = `
            SELECT name 
            FROM sys.schemas 
            WHERE name LIKE '%stg%' OR name LIKE '%staging%';
        `;
        const schemaResult = await pool.request().query(schemaQuery);
        console.log("Found staging schemas:", schemaResult.recordset);

        if (schemaResult.recordset.length > 0) {
            const schemas = schemaResult.recordset.map(s => `'${s.name}'`).join(',');
            console.log(`Fetching tables for schemas: ${schemas}`);

            const tableQuery = `
                SELECT 
                    s.name AS SchemaName,
                    t.name AS TableName
                FROM sys.tables t
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name IN (${schemas})
                ORDER BY s.name, t.name;
            `;

            const tableResult = await pool.request().query(tableQuery);
            fs.writeFileSync('ovis_stg_tables.json', JSON.stringify(tableResult.recordset, null, 2));
            console.log(`Found ${tableResult.recordset.length} staging tables. Saved to ovis_stg_tables.json`);
        } else {
            console.log("No schemas containing 'stg' or 'staging' found. Fetching all schemas just in case.");
            const allSchemaQuery = `SELECT name FROM sys.schemas WHERE principal_id < 16384 AND name NOT IN ('sys', 'guest', 'INFORMATION_SCHEMA')`;
            const allSchemaResult = await pool.request().query(allSchemaQuery);
            console.log("All schemas:", allSchemaResult.recordset);

            // fetch all tables just in case
            const allTableQuery = `
                SELECT s.name AS SchemaName, t.name AS TableName
                FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
                ORDER BY s.name, t.name;
            `;
            const allTableResult = await pool.request().query(allTableQuery);
            fs.writeFileSync('ovis_stg_tables.json', JSON.stringify(allTableResult.recordset, null, 2));
        }

        await pool.close();
    } catch (err) {
        console.error("Connection failed:", err);
    }
}

run();
