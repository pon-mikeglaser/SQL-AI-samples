import fs from 'fs';
import path from 'path';
import sql from "mssql";
import { InteractiveBrowserCredential } from "@azure/identity";

const SEARCH_DIRS = [
    'c:\\Users\\mike.glaser\\Documents\\GitHub\\BI_SQL_ODS\\ODS_SALESFORCE',
    'c:\\Users\\mike.glaser\\Documents\\GitHub\\BI_SQL_EDW\\01. PA_APL\\01. Views'
];

function getAllSqlFiles(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const isDir = fs.statSync(filePath).isDirectory();
            if (isDir) {
                // Skip stored procedures directories for view search
                if (!filePath.toLowerCase().includes('stored procedure')) {
                    getAllSqlFiles(filePath, fileList);
                }
            } else if (file.toLowerCase().endsWith('.sql')) {
                // Skip sp_ files
                if (!file.toLowerCase().startsWith('sp_')) {
                    fileList.push(filePath);
                }
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

    let allFiles = [];
    SEARCH_DIRS.forEach(dir => {
        if (fs.existsSync(dir)) {
            allFiles = allFiles.concat(getAllSqlFiles(dir));
        }
    });

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

        const dbViews = (await sql.query(`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.VIEWS 
      WHERE TABLE_SCHEMA IN ('odssf', 'aplsf', 'srcsf')
    `)).recordset;

        const results = [];

        for (const view of dbViews) {
            const fullName = `${view.TABLE_SCHEMA}.${view.TABLE_NAME}`;
            const query = `SELECT OBJECT_DEFINITION(OBJECT_ID('${fullName}')) as Definition`;
            const result = await sql.query(query);
            const definition = result.recordset[0].Definition || "";
            const dbMatch = definition.match(/WHERE\s+(\d{8})\s*=\s*\1/i);
            const dbDate = dbMatch ? dbMatch[1] : "No date";

            const schema = view.TABLE_SCHEMA.toUpperCase();
            const name = view.TABLE_NAME.toUpperCase();

            // 1. Exact Name Match
            let repoFile = allFiles.find(f => {
                const bn = path.basename(f).toUpperCase();
                return bn === `${schema}.${name}.SQL` || bn === `${name}.SQL` || bn === `CREATE VIEW ${fullName}.SQL` || bn === `CREATE VIEW ${name}.SQL`;
            });

            // 2. Loose Match (contains name)
            if (!repoFile) {
                repoFile = allFiles.find(f => {
                    const bn = path.basename(f).toUpperCase();
                    return bn.includes(name) && bn.endsWith('.SQL') && !bn.includes('SP_');
                });
            }

            let repoDate = "File not found";
            if (repoFile) {
                const repoContent = fs.readFileSync(repoFile, 'utf8');
                const repoMatch = repoContent.match(/WHERE\s+(\d{8})\s*=\s*\1/i);
                repoDate = repoMatch ? repoMatch[1] : "No date found";
            }

            results.push({
                View: fullName,
                DB_Date: dbDate,
                Repo_Date: repoDate,
                Match: dbDate === repoDate ? "✅" : (repoDate === "File not found" ? "❓" : "❌"),
                File: repoFile ? path.relative('c:\\Users\\mike.glaser\\Documents\\GitHub', repoFile) : "N/A"
            });
        }

        // Print results in groups of 20 to avoid truncation
        for (let i = 0; i < results.length; i += 20) {
            console.table(results.slice(i, i + 20));
        }

        const mismatches = results.filter(r => r.Match === "❌");
        console.log(`\nSummary:`);
        console.log(`- Total Views: ${results.length}`);
        console.log(`- Matches: ${results.filter(r => r.Match === "✅").length}`);
        console.log(`- Mismatches: ${mismatches.length}`);
        console.log(`- Not Found: ${results.filter(r => r.Match === "❓").length}`);

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

run();
