import { createSqlConfig } from './dist/index.js';

async function test() {
    try {
        const result = await createSqlConfig();
        console.log("Config Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error calling createSqlConfig:", e);
    }
}

test();
