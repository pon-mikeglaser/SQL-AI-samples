import sql from 'mssql';
import { InteractiveBrowserCredential } from '@azure/identity';

async function run() {
    const credential = new InteractiveBrowserCredential({ redirectUri: 'http://localhost' });
    const accessToken = await credential.getToken('https://database.windows.net/.default');
    const config = {
        server: 'spmsql402.database.windows.net',
        database: 'ODS',
        options: { encrypt: true, trustServerCertificate: false },
        authentication: {
            type: 'azure-active-directory-access-token',
            options: { token: accessToken.token }
        }
    };
    await sql.connect(config);
    const name = 'odssf.sp_SF_P_COC_REPRESENTED_BY';
    const res = await sql.query(`SELECT OBJECT_DEFINITION(OBJECT_ID('${name}')) as Definition`);
    console.log(`Definition for ${name}:`);
    console.log(res.recordset[0].Definition);
    await sql.close();
}
run();
