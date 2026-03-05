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
    } catch (e) { }
    return fileList;
}

async function run() {
    const allFiles = getAllSqlFiles(SEARCH_DIR);
    const credential = new InteractiveBrowserCredential({ redirectUri: 'http://localhost' });
    const accessToken = await credential.getToken('https://database.windows.net/.default');

    const config = {
        server: "spmsql402.database.windows.net",
        database: "ODS",
        options: { encrypt: true, trustServerCertificate: false },
        authentication: {
            type: 'azure-active-directory-access-token',
            options: { token: accessToken.token }
        }
    };

    await sql.connect(config);
    const dbSPsRes = await sql.query(`
    SELECT SPECIFIC_SCHEMA, SPECIFIC_NAME 
    FROM INFORMATION_SCHEMA.ROUTINES 
    WHERE ROUTINE_TYPE = 'PROCEDURE' 
    AND SPECIFIC_SCHEMA IN ('odssf', 'aplsf', 'srcsf')
    OR SPECIFIC_NAME LIKE 'sp_SF_%'
  `);

    const results = [];
    for (const sp of dbSPsRes.recordset) {
        const fullName = `${sp.SPECIFIC_SCHEMA}.${sp.SPECIFIC_NAME}`;
        const defRes = await sql.query(`SELECT OBJECT_DEFINITION(OBJECT_ID('${fullName}')) as Definition`);
        const definition = defRes.recordset[0].Definition || "";
        const dbMatch = definition.match(/WHERE\s+(\d{8})\s*=\s*\1/i);
        const dbDate = dbMatch ? dbMatch[1] : "No date";

        const spName = sp.SPECIFIC_NAME.toUpperCase();
        let repoFile = allFiles.find(f => path.basename(f).toUpperCase().includes(spName) && !path.basename(f).toUpperCase().includes('.VIEW'));

        let repoDate = "Not found";
        if (repoFile) {
            const content = fs.readFileSync(repoFile, 'utf8');
            const repoMatch = content.match(/WHERE\s+(\d{8})\s*=\s*\1/i);
            repoDate = repoMatch ? repoMatch[1] : "No date";
        }

        results.push({ sp: fullName, db: dbDate, repo: repoDate, match: dbDate === repoDate ? "Matches" : "Mismatch" });
    }

    console.log("PROCEDURE | PROD DATE | REPO DATE | STATUS");
    console.log("---|---|---|---");
    results.sort((a, b) => a.sp.localeCompare(b.sp)).forEach(r => {
        console.log(`${r.sp} | ${r.db} | ${r.repo} | ${r.match === 'Matches' ? '✅' : '❌'}`);
    });

    await sql.close();
}
run();
