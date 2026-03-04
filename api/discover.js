module.exports = async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const tavilyApiKey = (process.env.TAVILY_API_KEY || '').trim();
        const openrouterApiKey = (process.env.OPENROUTER_API_KEY || '').trim();
        const firecrawlApiKey = (process.env.FIRECRAWL_API_KEY || '').trim();

        if (!tavilyApiKey || !openrouterApiKey || !firecrawlApiKey) {
            return res.status(500).json({ error: 'Missing TAVILY, OPENROUTER, or FIRECRAWL keys' });
        }

        // --- 1. Proactive Search using Tavily ---
        // Inject today's date to force fresh, recent results only.
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.toLocaleString('en-US', { month: 'long' });
        const dateContext = `${currentMonth} ${currentYear}`;

        const searchQueries = [
            `institutional crypto research report ${dateContext} site:messari.io OR site:coinbase.com/institutional`,
            `digital assets outlook ${currentYear} JPMorgan OR Bernstein filetype:pdf -site:binance.com -site:cointelegraph.com`,
            `state of crypto ${currentYear} quarterly report Messari OR TheBlock filetype:pdf`,
            `DeFi protocol research report ${currentYear} site:grayscale.com OR site:galaxy.com`,
            `blockchain developer activity report ${currentYear} site:developerreport.com OR site:electriccapital.com`,
            `crypto blockchain research report ${currentYear} site:chainalysis.com OR "ARK Invest" filetype:pdf`,
            `digital assets crypto outlook ${currentYear} Citibank OR "Standard Chartered" filetype:pdf -site:yahoo.com`
        ];

        // Run all queries in parallel to scan broadly, then deduplicate by URL
        const searchRes = await Promise.allSettled(searchQueries.map(q =>
            fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: tavilyApiKey,
                    query: q,
                    search_depth: "basic",
                    include_images: false,
                    include_answer: false,
                    max_results: 3,
                    days: 90  // Last 90 days only
                })
            }).then(r => r.json())
        ));

        // Flatten and deduplicate by URL within search results
        const seenUrls = new Set();
        let searchResults = searchRes
            .filter(r => r.status === 'fulfilled' && r.value?.results)
            .flatMap(r => r.value.results)
            .filter(item => {
                if (seenUrls.has(item.url)) return false;
                seenUrls.add(item.url);
                return true;
            });

        // --- DEDUP AGAINST DATABASE ---
        // Fetch existing URLs from Google Sheet so we never re-publish a duplicate
        try {
            const googleApiKey = (process.env.GOOGLE_API_KEY || '').trim();
            const spreadsheetId = (process.env.SPREADSHEET_ID || '').trim();
            const sheetName = (process.env.SHEET_NAME || 'crypto-reports-template').trim();
            if (googleApiKey && spreadsheetId) {
                const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${googleApiKey}`;
                const sheetRes = await fetch(sheetUrl);
                if (sheetRes.ok) {
                    const sheetData = await sheetRes.json();
                    const rows = sheetData.values || [];
                    const headers = rows[0] ? rows[0].map(h => h.trim().toLowerCase()) : [];
                    const urlIdx = headers.indexOf('url');
                    if (urlIdx >= 0) {
                        const existingUrls = new Set(rows.slice(1).map(r => (r[urlIdx] || '').trim()).filter(Boolean));
                        const before = searchResults.length;
                        searchResults = searchResults.filter(item => !existingUrls.has(item.url));
                        console.log(`Dedup: ${before - searchResults.length} already in DB, ${searchResults.length} new to process.`);
                    }
                }
            }
        } catch (dedupErr) {
            console.warn('Dedup check failed, proceeding without:', dedupErr.message);
        }

        if (searchResults.length === 0) {
            return res.json({ message: 'No new reports found (all results already in database).' });
        }

        // --- 2. LLM Dragnet Filter ---
        const results = { published: [], pending: [], errors: [] };

        for (const item of searchResults) {
            try {
                // Send the URL and Tavily's snippet to GPT to decide if it's a real report
                // Scrape full page content using Firecrawl
                console.log(`Scraping: ${item.url}`);
                const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${firecrawlApiKey}`
                    },
                    body: JSON.stringify({ url: item.url, formats: ['markdown'] })
                });
                const fcData = await fcRes.json();

                let reportMarkdown = item.content; // fallback to snippet
                let extractedDate = item.published_date ? item.published_date.split('T')[0] : null;

                if (fcData.success && fcData.data) {
                    reportMarkdown = (fcData.data.markdown || item.content).substring(0, 6000); // Send first 6k chars to LLM
                    if (fcData.data.metadata && fcData.data.metadata['article:published_time']) {
                        extractedDate = fcData.data.metadata['article:published_time'].split('T')[0];
                    }
                }

                if (!extractedDate) {
                    extractedDate = "Date not clearly found in metadata, please infer from text or default to today: " + new Date().toISOString().split('T')[0];
                }

                const prompt = `You are a Tier 1 expert analyst vetting a web scrape to decide if it is a high-quality, institutional Crypto Research Report.
Extract the metadata and rate its quality from 1 to 10 (10 = institutional deep-dive PDF or long-form report, 1 = short news blurb, aggregator, or social post). 
If it is just a news article covering a report (but not the report itself) or an opinion piece, score it a 4 or lower.

URL: ${item.url}
Title: ${item.title}
Report Content (Scraped Markdown Truncated): 
${reportMarkdown}

Provided Metadata Date (if any): ${extractedDate}

Return ONLY valid JSON (no markdown block):
{
  "title": "Cleaned Title",
  "source": "Publisher (e.g. JPMorgan, Messari, Grayscale, etc.)",
  "date": "YYYY-MM-DD", // IMPORTANT: Extract exact publication date from the content if possible. If not found, use the Provided Metadata Date. If you infer the date or use today's fallback, it's fine, do not discard.
  "summary": "3 sentence summary of the report. If the date was approximated/inferred, append '[Date Approximated]' to the end of this summary.",
  "tags": ["Bitcoin", "Ethereum", "DeFi", "Macro", "Regulation", "Analytics", "TradFi", "Research"],
  "icon": "📄",
  "score": 8
}`;

                const llmController = new AbortController();
                const llmTimeout = setTimeout(() => llmController.abort(), 45000); // 45s timeout for Claude
                const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    signal: llmController.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openrouterApiKey}`,
                        'HTTP-Referer': 'https://crypto-reports-repo-app.vercel.app',
                        'X-Title': 'Crypto Reports Hub'
                    },
                    body: JSON.stringify({
                        model: 'anthropic/claude-sonnet-4.6', // Tier 1: Claude Sonnet 4.6
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.1,
                        max_tokens: 450
                    })
                });
                clearTimeout(llmTimeout);

                if (!llmRes.ok) throw new Error("LLM failure");

                const llmData = await llmRes.json();
                const content = llmData.choices[0]?.message?.content || '';
                // Robust JSON extraction - find the first {...} block regardless of markdown wrapping
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error(`No JSON found in response: ${content.substring(0, 100)}`);
                const metadata = JSON.parse(jsonMatch[0]);

                metadata.url = item.url;
                metadata.id = Math.floor(100000 + Math.random() * 900000);
                metadata.added_on = new Date().toISOString();

                // Auto-approval logic
                if (metadata.score >= 8) {
                    metadata.verified = true;
                    metadata.notes = "Auto-approved by AI Search (Score: " + metadata.score + ")";
                    results.published.push(metadata);
                } else if (metadata.score >= 5) {
                    // Send to pending if it's borderline (5-7)
                    metadata.verified = false;
                    metadata.notes = "Pending Review (AI Score: " + metadata.score + ")";
                    results.pending.push(metadata);
                }
                // If score < 5, we completely ignore it (discard noise).
                else {
                    // Skip writing to sheet entirely.
                    continue;
                }

                // Write to Google Sheet (for published AND pending)
                const appsScriptUrl = process.env.APPS_SCRIPT_URL;
                if (appsScriptUrl) {
                    const encoded = encodeURIComponent(JSON.stringify(metadata));
                    await fetch(`${appsScriptUrl}?data=${encoded}`);
                }

            } catch (err) {
                results.errors.push({ url: item.url, error: err.message });
            }
        }

        // --- 3. Send Telegram Notification ---
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (botToken && chatId && (results.published.length > 0 || results.pending.length > 0)) {
            const msg = `🔍 *Proactive Weekly Discovery*\n\n` +
                `✅ *Auto-Published (${results.published.length}):*\n` +
                (results.published.length > 0 ? results.published.map(r => `• [${r.title}](${r.url}) (${r.source})`).join('\n') : "None") + `\n\n` +
                `⏳ *Pending Review (${results.pending.length}):*\n` +
                (results.pending.length > 0 ? results.pending.map(r => `• [${r.title}](${r.url}) (Score: ${r.score})`).join('\n') : "None") +
                `\n\n_Discarded the remaining noise. Check the dashboard!_`;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: msg,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            });
        }

        return res.json({
            message: 'Proactive sweep complete',
            results
        });

    } catch (err) {
        console.error('Discovery error:', err);
        return res.status(500).json({ error: 'Failed discovery run', msg: err.message });
    }
};
