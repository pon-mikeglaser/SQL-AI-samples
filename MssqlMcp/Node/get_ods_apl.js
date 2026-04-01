import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";
import fs from "fs";

async function run() {
    const credential = new InteractiveBrowserCredential({ redirectUri: 'http://localhost' });
    const accessToken = await credential.getToken('https://database.windows.net/.default');

    const config = {
        server: "spmsql402.database.windows.net",
        database: "ODS",
        options: { encrypt: true, trustServerCertificate: true },
        authentication: {
            type: 'azure-active-directory-access-token',
            options: { token: accessToken.token }
        }
    };

    try {
        console.log("Connecting to ODS...");
        const pool = await sql.connect(config);
        console.log("Connected! Fetching APL views and their dependencies...");

        const query = `
            SELECT 
                s.name AS ViewSchema,
                v.name AS ViewName,
                d.referenced_schema_name AS RefSchema,
                d.referenced_entity_name AS RefTable
            FROM sys.sql_expression_dependencies d
            JOIN sys.views v ON d.referencing_id = v.object_id
            JOIN sys.schemas s ON v.schema_id = s.schema_id
            WHERE s.name LIKE 'apl%'
            ORDER BY s.name, v.name;
        `;

        const result = await pool.request().query(query);
        fs.writeFileSync('ods_apl_dependencies.json', JSON.stringify(result.recordset, null, 2));
        console.log(`Found ${result.recordset.length} dependencies. Saved to ods_apl_dependencies.json`);

        // Also fetch the definition of the views just in case
        const defQuery = `
            SELECT
                s.name AS SchemaName,
                v.name AS ViewName,
                m.definition AS ViewDefinition
            FROM sys.views v
            JOIN sys.schemas s ON v.schema_id = s.schema_id
            JOIN sys.sql_modules m ON v.object_id = m.object_id
            WHERE s.name IN ('odsndn', 'odsmds') AND v.name LIKE 'APL_%'
        `;
        const defResult = await pool.request().query(defQuery);
        fs.writeFileSync('ods_apl_definitions.json', JSON.stringify(defResult.recordset, null, 2));
        console.log(`Found ${defResult.recordset.length} view definitions. Saved to ods_apl_definitions.json`);

        await pool.close();
    } catch (err) {
        console.error("Connection failed:", err);
    }
}

run();
