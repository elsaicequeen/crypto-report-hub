require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const discoverHandler = require('../api/discover');

async function run() {
    console.log('🚀 Running targeted January 2026 discovery...\n');

    let resData = null;
    let resStatus = 200;
    const res = {
        setHeader: () => { },
        status: (s) => { resStatus = s; return res; },
        json: (data) => { resData = data; },
        send: (data) => { resData = data; }
    };

    // Override to search specifically for January 2026
    // We patch the date context by temporarily overriding the date
    const origDate = global.Date;
    global.Date = class extends origDate {
        constructor(...args) {
            if (args.length === 0) {
                super(2026, 0, 25); // Jan 25, 2026 — forces "January 2026" context
            } else {
                super(...args);
            }
        }
        static now() { return new origDate(2026, 0, 25).getTime(); }
    };

    const req = { method: 'GET', body: {} };
    await discoverHandler(req, res);

    global.Date = origDate; // restore

    if (resData) {
        console.log('\n📊 DISCOVERY RESULTS:');
        console.log(`Status: ${resStatus}`);
        if (resData.results) {
            console.log(`✅ Auto-published: ${resData.results.published?.length || 0} reports`);
            console.log(`⏳ Pending review: ${resData.results.pending?.length || 0} reports`);
            if (resData.results.published?.length > 0) {
                console.log('\n📋 Published reports:');
                resData.results.published.forEach((r, i) => console.log(`  ${i + 1}. [${r.score}/10] ${r.title} — ${r.source}\n     ${r.url}`));
            }
            if (resData.results.errors?.length > 0) {
                console.log(`\n⚠️  Errors: ${resData.results.errors.length}`);
                resData.results.errors.forEach(e => console.log(`   - ${e.url}: ${e.error}`));
            }
        } else {
            console.log(JSON.stringify(resData, null, 2));
        }
    } else {
        console.log('No response data received. Status:', resStatus);
    }
}

run().catch(e => console.error('Fatal error:', e.message, e.stack));
