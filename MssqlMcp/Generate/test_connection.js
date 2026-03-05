import sql from "mssql";
import { DefaultAzureCredential, InteractiveBrowserCredential } from "@azure/identity";

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function test() {
    const server = process.env.SERVER_NAME;
    const database = process.env.DATABASE_NAME;

    console.log(`Testing connection to ${server}/${database}...`);

    try {
        console.log("Creating credential (Default)...");
        const credential = new DefaultAzureCredential();

        console.log("Requesting token...");
        const accessToken = await credential.getToken('https://database.windows.net/.default');
        console.log("Token received.");

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
            connectionTimeout: 30000,
        };

        console.log("Connecting to SQL...");
        await sql.connect(config);
        console.log("Connected successfully!");

        const result = await sql.query`SELECT 1 as Test`;
        console.log("Query result:", result.recordset);

        await sql.close();
    } catch (err) {
        console.error("DETAILED ERROR:");
        console.error(err);
    }
}

test();
