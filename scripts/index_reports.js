require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { Pinecone } = require('@pinecone-database/pinecone');

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index('crypto-reports');

const openaiApiKey = process.env.OPENAI_API_KEY;

async function generateEmbeddings(text) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: text,
            model: "text-embedding-3-small" // Cheap, fast, and 1536 dimensions
        })
    });

    if (!res.ok) {
        throw new Error(`Embedding failed: ${await res.text()}`);
    }
    const data = await res.json();
    return data.data[0].embedding;
}

// Simple chunking logic to avoid huge token blocks
function chunkText(text, chunkSize = 1000) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    return chunks;
}

async function run() {
    console.log("1. Fetching existing reports from the backend...");
    const reportsRes = await fetch('http://localhost:3000/api/reports');
    const data = await reportsRes.json();
    const reports = data.reports || data || [];

    console.log(`Found ${reports.length} reports. Starting indexing...`);

    let successCount = 0;

    for (const report of reports) {
        if (!report.url) continue;
        console.log(`\nProcessing: ${report.title}`);

        try {
            // 1. Scrape the report text via Jina
            const pageRes = await fetch(`https://r.jina.ai/${report.url}`, {
                headers: { 'Accept': 'text/plain' }
            });

            if (!pageRes.ok) {
                console.log(`❌ Failed to scrape ${report.title}`);
                continue;
            }

            let text = await pageRes.text();

            // Limit to the first 10,000 words (approx 15k tokens) to save on initial scraping costs/time
            const chunks = chunkText(text, 800).slice(0, 10);

            let vectors = [];

            // 2. Embed each chunk
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (chunk.length < 50) continue; // Skip tiny noisy chunks

                const embedding = await generateEmbeddings(chunk);

                vectors.push({
                    id: `${report.id || Math.random().toString(36).substring(7)}-chunk-${i}`,
                    values: embedding,
                    metadata: {
                        reportId: report.id || 'unknown',
                        title: report.title,
                        source: report.source || 'Unknown',
                        url: report.url,
                        text: chunk // Store text in metadata so we can return it to GPT later
                    }
                });
            }

            // 3. Upsert to Pinecone
            if (vectors.length > 0) {
                await index.upsert(vectors);
                console.log(`✅ Indexed ${vectors.length} chunks for: ${report.title}`);
                successCount++;
            }

        } catch (e) {
            console.error(`Error processing ${report.title}:`, e.message);
        }
    }

    console.log(`\n🎉 Indexing complete! Successfully indexed ${successCount} reports into Pinecone.`);
}

run();
