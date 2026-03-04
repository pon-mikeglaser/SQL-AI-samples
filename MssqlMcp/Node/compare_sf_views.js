import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";
import fs from "fs";
import path from "path";

async function run() {
    const server = "spmsql402.database.windows.net";
    const database = "ODS";

    // Repo paths
    const repo1 = "c:/Users/mike.glaser/Documents/GitHub/BI_SQL_EDW/01. PA_APL/01. Views/SALESFORCE";
    const repo2 = "c:/Users/mike.glaser/Documents/GitHub/BI_SQL_EDW/01. PA_APL/01. Views/PARIS NIEUW";
    const repoODS_SF1 = "c:/Users/mike.glaser/Documents/GitHub/BI_SQL_ODS/ODS_SALESFORCE/Business views";
    const repoODS_SF2 = "c:/Users/mike.glaser/Documents/GitHub/BI_SQL_ODS/ODS_SALESFORCE/Relational view";
    const repoODS_SF3 = "c:/Users/mike.glaser/Documents/GitHub/BI_SQL_ODS/ODS_SALESFORCE/AW views";

    const repoFiles = [
        ...fs.readdirSync(repo1).map(f => ({ name: f.replace('.sql', ''), schema: 'aplsf' })), // Most are aplsf
        ...fs.readdirSync(repo2).filter(f => f.includes('PARTNER')).map(f => ({ name: f.replace('Create View APL_EDW.', '').replace('.sql', ''), schema: 'aplsf' })),
        ...fs.readdirSync(repoODS_SF1).map(f => ({ name: f.replace('.sql', ''), schema: 'odssf' })),
        ...fs.readdirSync(repoODS_SF2).map(f => ({ name: f.replace('.sql', ''), schema: 'aplsf' })),
        ...fs.readdirSync(repoODS_SF3).map(f => ({ name: f.replace('Create view aplssf.', '').replace('.sql', ''), schema: 'aplsf' }))
    ];

    // Normalize names and remove duplicates
    const repoViewsSet = new Set(repoFiles.map(f => {
        let cleanName = f.name.replace('aplsf.', '').replace('odssf.', '').replace('[', '').replace(']', '').replace('Create view aplssf.', '');
        return `${f.schema}.${cleanName}`.toLowerCase();
    }));
    const repoViews = Array.from(repoViewsSet);

    console.log(`\n=== Comparing SF Views: Repo vs Production ===`);

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
        const dbResult = await sql.query`
      SELECT LOWER(TABLE_SCHEMA + '.' + TABLE_NAME) as FullName
      FROM INFORMATION_SCHEMA.VIEWS 
      WHERE TABLE_SCHEMA IN ('odssf', 'aplsf', 'srcsf')
    `;
        const dbViews = dbResult.recordset.map(r => r.FullName);

        console.log(`\nFound ${repoViews.length} unique views in Repo.`);
        console.log(`Found ${dbViews.length} views in Production DB (odssf, aplsf, srcsf).`);

        const missingInDb = repoViews.filter(v => !dbViews.includes(v));
        const extraInDb = dbViews.filter(v => !repoViews.includes(v));

        if (missingInDb.length > 0) {
            console.log("\n❌ Views in REPO but MISSING in DB:");
            missingInDb.sort().forEach(v => console.log(` - ${v}`));
        } else {
            console.log("\n✅ All repo views are present in DB.");
        }

        if (extraInDb.length > 0) {
            console.log("\n⚠️ Views in DB but NOT in REPO (untracked in these folders):");
            extraInDb.sort().forEach(v => console.log(` - ${v}`));
        } else {
            console.log("\n✅ No extra views in DB.");
        }

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

run();
