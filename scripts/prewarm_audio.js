require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

async function prewarmAudio() {
    console.log("🔊 Fetching reports from backend to pre-warm audio cache...");

    const reportsRes = await fetch('https://crypto-reports-repo-app.vercel.app/api/reports');
    const data = await reportsRes.json();
    const reports = data.reports || data || [];

    console.log(`Found ${reports.length} total reports. Processing audio cache...`);

    let successCount = 0;

    for (const report of reports) {
        if (!report.url) continue;
        console.log(`\nGenerating/Warming Audio for: ${report.title}`);

        try {
            const audioRes = await fetch('https://crypto-reports-repo-app.vercel.app/api/audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: report.url,
                    title: report.title,
                    source: report.source || 'Unknown',
                    summary: report.summary || ''
                })
            });

            if (audioRes.ok) {
                const audioData = await audioRes.json();
                console.log(`  ✅ Audios cached successfully. CDN Link: ${audioData.audioContent}`);
                successCount++;
            } else {
                console.error(`  ❌ Failed to generate audio:`, await audioRes.text());
            }

        } catch (e) {
            console.error(`  ❌ Error processing ${report.title}:`, e.message);
        }
    }

    console.log(`\n🎉 Audio Pre-warming complete! Cached ${successCount} reports.`);
}

prewarmAudio();
