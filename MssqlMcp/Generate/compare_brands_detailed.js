import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

async function run() {
    const server = "spmsql402.database.windows.net";
    const database = "ODS";

    console.log(`\n=== Comparing Brands on ${server} [${database}] ===`);

    try {
        const credential = new InteractiveBrowserCredential({
            redirectUri: 'http://localhost'
        });

        console.log("Requesting access token...");
        const accessToken = await credential.getToken('https://database.windows.net/.default');

        const config = {
            server: server,
            database: database,
            options: { encrypt: true, trustServerCertificate: false },
            authentication: {
                type: 'azure-active-directory-access-token',
                options: { token: accessToken.token }
            },
            connectionTimeout: 60000,
        };

        await sql.connect(config);
        console.log("✓ Connected.\n");

        console.log(">>> Fetching brands from [odsmds].[MDS_BRAND]...");
        const mdsResult = await sql.query`
      SELECT DISTINCT 
             [Name] as MDS_Name, 
             [CommercialName] as MDS_CommercialName, 
             [BrandCode] as MDS_BrandCode, 
             [PonBrandCode] as MDS_PonBrandCode
      FROM [odsmds].[MDS_BRAND]
      ORDER BY [Name]
    `;
        console.table(mdsResult.recordset);

        console.log("\n>>> Fetching brands from [odsndn].[NADIN_VEHICLE]...");
        const nadinResult = await sql.query`
      SELECT DISTINCT 
             [ProductBrand] as NDN_ProductBrand, 
             [SalesBrand] as NDN_SalesBrand, 
             [BrandCommercial] as NDN_BrandCommercial
      FROM [odsndn].[NADIN_VEHICLE]
      ORDER BY [ProductBrand]
    `;
        console.table(nadinResult.recordset);

        await sql.close();
        console.log("\n=== Comparison Completed ===");
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
