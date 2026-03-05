import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

async function test() {
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
        console.log("Connecting...");
        const pool = await sql.connect(config);
        console.log("Connected! Fetching schemas...");
        const result = await pool.request().query("SELECT name FROM sys.schemas WHERE principal_id < 16384 AND name NOT IN ('sys', 'guest', 'INFORMATION_SCHEMA')");
        console.log("Schemas:", JSON.stringify(result.recordset, null, 2));
        await pool.close();
    } catch (err) {
        console.error("Connection failed:", err);
    }
}

test();
