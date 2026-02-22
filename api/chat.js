const { Pinecone } = require('@pinecone-database/pinecone');

// Using standard Node.js runtime
module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    const openrouterApiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const pineconeKey = (process.env.PINECONE_API_KEY || '').trim();

    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    if (!openrouterApiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

    const body = req.body || {};
    const { url, question, history = [] } = body;
    if (!url || !question) return res.status(400).json({ error: 'url and question are required' });

    try {
        let contextText = '';

        // --- 1. PINECONE VECTOR SEARCH ---
        if (pineconeKey) {
            try {
                // Generate question embedding
                const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ input: question, model: "text-embedding-3-small" })
                });

                if (embedRes.ok) {
                    const embedData = await embedRes.json();
                    const vector = embedData.data[0].embedding;

                    // Query Pinecone Database
                    const pc = new Pinecone({ apiKey: pineconeKey });
                    const index = pc.index('crypto-reports');
                    const queryResponse = await index.query({
                        vector: vector,
                        topK: 5,
                        filter: { url: url }, // Only search chunks from this specific report
                        includeMetadata: true
                    });

                    if (queryResponse.matches && queryResponse.matches.length > 0) {
                        console.log(`PINECONE HIT: Found ${queryResponse.matches.length} semantic chunks.`);
                        contextText = queryResponse.matches.map(m => m.metadata.text).join('\n\n---\n\n');
                    }
                }
            } catch (pcErr) {
                console.warn('Pinecone Vector Search failed or timeout, falling back:', pcErr.message);
            }
        }

        // --- 2. FALLBACK: REALTIME JINA SCRAPE ---
        // If Pinecone failed or the report isn't indexed yet, scrape it on the fly.
        if (!contextText) {
            console.log("PINECONE MISS: Falling back to realtime Jina scrape...");
            const jinaUrl = `https://r.jina.ai/${url}`;
            const pageResponse = await fetch(jinaUrl, {
                headers: { 'Accept': 'text/plain' }
            });

            if (pageResponse.ok) {
                contextText = await pageResponse.text();
                contextText = contextText.substring(0, 15000);
            } else {
                contextText = "[Context extraction failed. Answer based on general knowledge.]";
            }
        }

        // --- 3. LLM INFERENCE ---
        const messages = [
            {
                role: "system",
                content: `You are a Senior Crypto Research Assistant. Answer the user's question ONLY using the provided report context chunks. 
Be analytical, technical, and use formatting like bolding and bullet points for readability. 

CRITICAL INSTRUCTIONS FOR PREVENTING HALLUCINATIONS:
1. You MUST cite your claims using exact quotes or references from the context.
2. If the user's question asks for specific data, metrics, or facts that are NOT explicitly present in the provided context, you MUST refuse to answer that specific part and clearly state "The provided report does not contain information about [X]". 
3. DO NOT hallucinate or guess based on your general knowledge. Strictly tether your analysis to the text provided.
If the information is missing from the context, state it clearly but offer any relevant sector knowledge that adds value.

CONTEXT:
${contextText}`
            }
        ];

        for (const msg of history) {
            messages.push({ role: msg.role, content: msg.content });
        }
        messages.push({ role: "user", content: question });

        const openaiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openrouterApiKey}`,
                'HTTP-Referer': 'https://crypto-reports-repo-app.vercel.app',
                'X-Title': 'Crypto Reports Hub'
            },
            body: JSON.stringify({
                model: 'anthropic/claude-3.5-sonnet',
                messages: messages,
                max_tokens: 1000
            })
        });

        if (!openaiResponse.ok) {
            const err = await openaiResponse.text();
            throw new Error(`OpenRouter Chat failure: ${err}`);
        }

        const data = await openaiResponse.json();
        const answer = data.choices[0]?.message?.content || '';

        return res.status(200).json({ answer });

    } catch (err) {
        console.error('Chat error:', err);
        return res.status(500).json({ error: 'Failed to process chat: ' + err.message });
    }
};
