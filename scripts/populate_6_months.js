require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

async function runBulkPopulation() {
    console.log("🚀 Starting Final Demo Population (Target: 10 Elite Reports)...");

    const tavilyApiKey = (process.env.TAVILY_API_KEY || '').trim();
    const openaiApiKey = (process.env.OPENAI_API_KEY || '').trim();

    if (!tavilyApiKey || !openaiApiKey) {
        console.error("❌ Missing required environment variables in .env.local");
        return;
    }

    const searchQueries = [
        "\"Messari\" crypto research report Q4 OR 2026 filetype:pdf",
        "\"Binance Research\" institutional crypto report 2026 OR 2025 filetype:pdf",
        "\"Coinbase Institutional\" crypto market outlook research filetype:pdf",
        "\"a16z crypto\" state of crypto research report filetype:pdf"
    ];

    let totalPublished = 0;
    const maxReports = 10;

    for (const query of searchQueries) {
        if (totalPublished >= maxReports) break;

        console.log(`\n🔍 Searching Tavily for: ${query}`);

        try {
            const tavilyRes = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: tavilyApiKey,
                    query: query,
                    search_depth: "advanced",
                    include_images: false,
                    include_answer: false,
                    max_results: 15,
                    days_back: 200 // Roughly mid-2025 to now
                })
            });

            if (!tavilyRes.ok) {
                throw new Error(`Tavily search failed: ${await tavilyRes.text()}`);
            }

            const tavilyData = await tavilyRes.json();
            const searchResults = tavilyData.results || [];

            console.log(`Found ${searchResults.length} raw results. Running LLM Dragnet...`);

            for (const item of searchResults) {
                if (totalPublished >= maxReports) break;

                // Skip if it doesn't look like a PDF
                if (!item.url.toLowerCase().endsWith('.pdf')) continue;

                console.log(`- Evaluating: ${item.title.substring(0, 50)}...`);

                try {
                    const prompt = `You are a Senior Crypto Research Analyst reviewing a search result to decide if it is a high-quality, institutional Crypto Research Report.
Extract the metadata and rate its quality from 1 to 10 (10 = institutional deep-dive, 1 = short news blurb). If it is just a news article or opinion piece, score it a 3 or lower.

CRITICAL INSTRUCTION: For the "summary" field, provide a dense, highly technical 3-sentence summary. DO NOT use generic fluff like "institutional adoption is growing". Tailor the summary for an expert, crypto-savvy audience. Focus on architecture, quantitative metrics, or specific tokens.

URL: ${item.url}
Title: ${item.title}
Snippet: ${item.content}

Return ONLY valid JSON (no markdown block):
{
  "title": "Cleaned Title",
  "source": "Best guess at publisher (e.g. Messari, a16z, etc.)",
  "date": "YYYY-MM-DD",
  "summary": "Dense 3-sentence technical summary",
  "tags": ["Bitcoin", "Ethereum", "DeFi", "Macro", "Regulation", "Analytics", "L2s", "Research"],
  "icon": "📄",
  "score": 8
}`;

                    const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openaiApiKey}`
                        },
                        body: JSON.stringify({
                            model: 'gpt-4o-mini',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.1,
                            max_tokens: 400
                        })
                    });

                    if (!llmRes.ok) continue;

                    const llmData = await llmRes.json();
                    const content = llmData.choices[0]?.message?.content || '';
                    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    const metadata = JSON.parse(jsonStr);

                    metadata.url = item.url;
                    metadata.id = Math.floor(100000 + Math.random() * 900000);

                    if (metadata.score >= 7) {
                        metadata.verified = true;
                        metadata.notes = "Auto-approved for Demo (Score: " + metadata.score + ")";

                        console.log(`  ✅ APPROVED (Score ${metadata.score}) -> Sending to API for Auto-PDF Hosting...`);

                        // Use our local API so it triggers the Vercel Blob PDF auto-download logic
                        const res = await fetch('http://localhost:3000/api/reports', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(metadata)
                        });

                        if (res.ok) {
                            console.log(`  ✅ Successfully hosted PDF and pushed to Sheet.`);
                            totalPublished++;
                        } else {
                            console.error(`  ❌ Local API rejected the payload:`, await res.text());
                        }
                    }

                } catch (err) {
                    console.error(`  ❌ Error processing item: ${err.message}`);
                }
            }
        } catch (err) {
            console.error(`Error with query "${query}":`, err);
        }
    }

    console.log(`\n🎉 Population Complete! Added ${totalPublished} elite reports to the database.`);
}

runBulkPopulation();
