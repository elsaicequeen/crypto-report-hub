module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url is required' });

    try {
        // Step 1: Use Jina Reader to fetch and parse the page (works for PDFs and complex web apps)
        const jinaUrl = `https://r.jina.ai/${url}`;
        const pageResponse = await fetch(jinaUrl, {
            headers: {
                'Accept': 'text/plain'
            }
        });

        if (!pageResponse.ok) {
            return res.status(400).json({ error: `Could not fetch URL via Jina (HTTP ${pageResponse.status})` });
        }

        let pageText = await pageResponse.text();

        // Jina already gives us clean markdown/text, but we'll trim it for token safety
        pageText = pageText.substring(0, 8000);


        // Truncate to ~6000 chars to stay within token limits
        if (pageText.length > 6000) {
            pageText = pageText.substring(0, 6000) + '...';
        }

        // Step 2: Ask GPT to extract structured metadata
        const prompt = `You are analyzing a crypto/blockchain research report page. Extract the following metadata from this content and return ONLY a JSON object (no markdown, no explanation):

{
  "title": "Full title of the report",
  "source": "Organization/company that published it",
  "date": "Publication date in YYYY-MM-DD format (best guess if not explicit)",
  "summary": "2-3 sentence summary of what the report covers. Dive deep into the specific architecture, tokens, metrics, or mechanisms discussed. NO generic fluff like 'institutional adoption'—this is for an expert, crypto-savvy audience.",
  "tags": ["array", "of", "relevant", "category", "tags"],
  "icon": "single emoji that best represents this report"
}

Available tags to choose from (pick 1-3 most relevant):
Bitcoin, Ethereum, DeFi, L2s, Macro, Regulation, Annual Report, Analytics, Infrastructure, NFTs, Research

URL: ${url}

Page content:
${pageText}`;

        const openaiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://crypto-reports-repo-app.vercel.app',
                'X-Title': 'Crypto Reports Hub'
            },
            body: JSON.stringify({
                model: 'anthropic/claude-3.5-sonnet',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 500
            })
        });

        if (!openaiResponse.ok) {
            const errText = await openaiResponse.text();
            console.error('OpenAI error:', errText);
            return res.status(502).json({ error: 'LLM request failed', detail: errText.substring(0, 300) });
        }

        const completion = await openaiResponse.json();
        const content = completion.choices[0]?.message?.content || '';

        // Parse the JSON from GPT's response (strip any markdown fencing)
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const metadata = JSON.parse(jsonStr);

        // Validate and sanitize
        const result = {
            title: metadata.title || '',
            source: metadata.source || '',
            date: metadata.date || new Date().toISOString().split('T')[0],
            summary: metadata.summary || '',
            tags: Array.isArray(metadata.tags) ? metadata.tags : [],
            icon: metadata.icon || '📄'
        };

        return res.json(result);

    } catch (err) {
        console.error('Summarize error:', err);
        return res.status(500).json({ error: 'Failed to extract metadata: ' + err.message });
    }
};
