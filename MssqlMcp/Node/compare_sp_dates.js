import fs from 'fs';
import path from 'path';
import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

const SEARCH_DIR = 'c:\\Users\\mike.glaser\\Documents\\GitHub\\BI_SQL_ODS\\ODS_SALESFORCE';

function getAllSqlFiles(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                getAllSqlFiles(filePath, fileList);
            } else if (file.toLowerCase().endsWith('.sql')) {
                fileList.push(filePath);
            }
        });
    } catch (e) {
        console.error(`Error reading ${dir}: ${e.message}`);
    }
    return fileList;
}

async function run() {
    const server = "spmsql402.database.windows.net";
    const database = "ODS";

    console.log("Searching for SF SP files in repo...");
    const allFiles = getAllSqlFiles(SEARCH_DIR);
    console.log(`Found ${allFiles.length} SQL files in ${SEARCH_DIR}.`);

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

        // Get all SPs in relevant schemas
        const dbSPsRes = await sql.query(`
      SELECT SPECIFIC_SCHEMA, SPECIFIC_NAME 
      FROM INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_TYPE = 'PROCEDURE' 
      AND SPECIFIC_SCHEMA IN ('odssf', 'aplsf', 'srcsf')
      OR SPECIFIC_NAME LIKE 'sp_SF_%'
    `);

        const dbSPs = dbSPsRes.recordset;
        const results = [];

        for (const sp of dbSPs) {
            const fullName = `${sp.SPECIFIC_SCHEMA}.${sp.SPECIFIC_NAME}`;

            // Get DB definition
            const defRes = await sql.query(`SELECT OBJECT_DEFINITION(OBJECT_ID('${fullName}')) as Definition`);
            const definition = defRes.recordset[0].Definition || "";
            const dbMatch = definition.match(/WHERE\s+(\d{8})\s*=\s*\1/i);
            const dbDate = dbMatch ? dbMatch[1] : "No date";

            // Find Repo file
            const spName = sp.SPECIFIC_NAME.toUpperCase();

            let repoFile = allFiles.find(f => {
                const bn = path.basename(f).toUpperCase();
                return bn.includes(spName) && !bn.includes('.VIEW'); // Simple filter
            });

            let repoDate = "File not found";
            if (repoFile) {
                const repoContent = fs.readFileSync(repoFile, 'utf8');
                const repoMatch = repoContent.match(/WHERE\s+(\d{8})\s*=\s*\1/i);
                repoDate = repoMatch ? repoMatch[1] : "No date found";
            }

            results.push({
                StoredProcedure: fullName,
                DB_Date: dbDate,
                Repo_Date: repoDate,
                Match: dbDate === repoDate ? "✅" : (repoDate === "File not found" ? "❓" : "❌"),
                File: repoFile ? path.basename(repoFile) : "N/A"
            });
        }

        // Sort: Mismatches first, then non-matches, then matches
        results.sort((a, b) => {
            if (a.Match === b.Match) return 0;
            if (a.Match === "❌") return -1;
            if (b.Match === "❌") return 1;
            if (a.Match === "❓") return -1;
            if (b.Match === "❓") return 1;
            return 0;
        });

        for (let i = 0; i < results.length; i += 20) {
            console.table(results.slice(i, i + 20));
        }

        const mismatches = results.filter(r => r.Match === "❌");
        const missing = results.filter(r => r.Match === "❓");

        console.log(`\nSummary:`);
        console.log(`- Total SPs checked: ${results.length}`);
        console.log(`- Exact Matches: ${results.filter(r => r.Match === "✅").length}`);
        console.log(`- Mismatches: ${mismatches.length}`);
        console.log(`- Not Found in Repo: ${missing.length}`);

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

run();
