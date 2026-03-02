module.exports = async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const tavilyApiKey = (process.env.TAVILY_API_KEY || '').trim();
        const openrouterApiKey = (process.env.OPENROUTER_API_KEY || '').trim();

        if (!tavilyApiKey || !openrouterApiKey) {
            return res.status(500).json({ error: 'Missing TAVILY_API_KEY or OPENROUTER_API_KEY' });
        }

        // --- 1. Proactive Search using Tavily ---
        // Inject today's date to force fresh, recent results only.
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.toLocaleString('en-US', { month: 'long' });
        const dateContext = `${currentMonth} ${currentYear}`;

        const searchQueries = [
            `institutional crypto research report ${dateContext} site:messari.io OR site:coinbase.com OR site:binance.com`,
            `digital assets outlook ${currentYear} JPMorgan OR Bernstein OR a16z filetype:pdf`,
            `state of crypto ${currentYear} quarterly report Messari OR CoinDesk OR TheBlock filetype:pdf`,
            `DeFi protocol research report ${currentYear} Grayscale OR Pantera OR Galaxy`,
            `crypto market outlook ${dateContext} institutional research`,
            `blockchain developer activity report ${currentYear} Electric Capital OR Alchemy OR Dune`,
            `crypto blockchain research report ${currentYear} Chainalysis OR "ARK Invest" OR "ARK Research" filetype:pdf`,
            `digital assets crypto outlook ${currentYear} "Standard Chartered" OR Citibank OR Citi OR "Bloomberg Intelligence" filetype:pdf`,
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
                    days: 30  // Last 30 days only
                })
            }).then(r => r.json())
        ));

        // Flatten and deduplicate by URL
        const seenUrls = new Set();
        const searchResults = searchRes
            .filter(r => r.status === 'fulfilled' && r.value?.results)
            .flatMap(r => r.value.results)
            .filter(item => {
                if (seenUrls.has(item.url)) return false;
                seenUrls.add(item.url);
                return true;
            });

        const query = searchQueries[0]; // for logging only

        if (searchResults.length === 0) {
            return res.json({ message: 'No new reports found this month.' });
        }

        // --- 2. LLM Dragnet Filter ---
        const results = { published: [], pending: [], errors: [] };

        for (const item of searchResults) {
            try {
                // Send the URL and Tavily's snippet to GPT to decide if it's a real report
                const prompt = `You are an expert analyst reviewing a search result to decide if it is a high-quality, institutional Crypto Research Report.
Extract the metadata and rate its quality from 1 to 10 (10 = institutional deep-dive, 1 = short news blurb). If it is just a news article or opinion piece, score it a 3 or lower.

URL: ${item.url}
Title: ${item.title}
Snippet: ${item.content}

Return ONLY valid JSON (no markdown block):
{
  "title": "Cleaned Title",
  "source": "Best guess at publisher (e.g. JPMorgan, Messari, etc.)",
  "date": "YYYY-MM-DD",
  "summary": "3 sentence summary based on the snippet",
  "tags": ["Bitcoin", "Ethereum", "DeFi", "Macro", "Regulation", "Analytics", "L2s", "Research"],
  "icon": "📄",
  "score": 8
}`;

                const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openrouterApiKey}`,
                        'HTTP-Referer': 'https://crypto-reports-repo-app.vercel.app',
                        'X-Title': 'Crypto Reports Hub'
                    },
                    body: JSON.stringify({
                        model: 'minimax/minimax-m2.5', // Tier 2: MiniMax M2.5 - reliable JSON output
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.1,
                        max_tokens: 400
                    })
                });

                if (!llmRes.ok) throw new Error("LLM failure");

                const llmData = await llmRes.json();
                const content = llmData.choices[0]?.message?.content || '';
                const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const metadata = JSON.parse(jsonStr);

                metadata.url = item.url;
                metadata.id = Math.floor(100000 + Math.random() * 900000);

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
