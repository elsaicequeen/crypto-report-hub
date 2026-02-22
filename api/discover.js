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
        // We search for recent high-quality crypto reports published in the last week.
        const searchQueries = [
            "institutional crypto research report filetype:pdf",
            "digital assets outlook report \"JPMorgan\" OR \"Bernstein\" OR \"Messari\" filetype:pdf",
            "state of crypto report a16z OR coindesk OR the block filetype:pdf"
        ];

        // Pick a random query each run, or run them all. For cost/speed, let's just run the first one for now.
        const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];

        const tavilyRes = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: tavilyApiKey,
                query: query,
                search_depth: "advanced",
                include_images: false,
                include_answer: false,
                max_results: 5, // Keep it to top 5 to manage AI costs
                days_back: 7    // Only from the last week
            })
        });

        if (!tavilyRes.ok) {
            const err = await tavilyRes.text();
            throw new Error(`Tavily search failed: ${err}`);
        }

        const tavilyData = await tavilyRes.json();
        const searchResults = tavilyData.results || [];

        if (searchResults.length === 0) {
            return res.json({ message: 'No new reports found in search this week.' });
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
                        model: 'deepseek/deepseek-chat', // Tier 2 DeepSeek V3.1 equivalent
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
