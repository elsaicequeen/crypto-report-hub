const { put, head } = require('@vercel/blob');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    const openrouterApiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    if (!openrouterApiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

    const { url, title, source: rawSource, summary: rawSummary } = req.body || {};
    if (!title || !url) return res.status(400).json({ error: 'title and url are required' });

    try {
        // --- 1. VERIFY VERCEL BLOB CACHE ---
        // Hash the URL to create a safe, unique filename for the audio
        const urlHash = crypto.createHash('md5').update(url).digest('hex');
        const filename = `audio/${urlHash}.mp3`;

        try {
            // Check if it already exists in Blob
            const blobMeta = await head(filename);
            if (blobMeta && blobMeta.url) {
                console.log("CACHE HIT: Serving audio from Blob Storage:", blobMeta.url);
                return res.json({
                    audioContent: blobMeta.url, // Directly return the CDN URL!
                    script: "Audio loaded from cache."
                });
            }
        } catch (headErr) {
            // head() throws an error if the blob doesn't exist, which is expected on the first run.
            console.log("CACHE MISS: Generating new audio for:", title);
        }

        // --- 2. GENERATE NEW AUDIO ---
        let contextText = "";
        const source = rawSource || "An independent researcher";

        // ALWAYS try to fetch the full text of the report to generate a deep, 60-second summary
        if (url) {
            try {
                console.log(`Fetching full text for audio generation via Jina: ${url}`);
                const pageResponse = await fetch(`https://r.jina.ai/${url}`, {
                    headers: {
                        'Accept': 'text/plain',
                        'X-No-Cache': 'true',
                        'X-Return-Format': 'markdown'
                    }
                });
                if (pageResponse.ok) {
                    const fullText = await pageResponse.text();
                    // Basic check to see if Jina actually extracted meaningful content
                    if (fullText && fullText.length > 500) {
                        // Pass the first chunks into the context to ensure a rich 60-second summary
                        contextText = fullText.substring(0, 15000);
                    }
                }
            } catch (e) {
                console.warn('Scraping failed, falling back...');
            }
        }

        // Fallback safely to the short UI summary if the full report couldn't be extracted
        let isShortSummary = false;
        if (!contextText || contextText.length < 500) {
            console.warn(`⚠️ Warning: Could not extract full text for ${title}. Falling back to short 3-sentence summary.`);
            contextText = rawSummary || `A crypto research report titled ${title}.`;
            isShortSummary = true;
        }

        const scriptPrompt = `You are an elite Crypto Research Analyst speaking to an audience of seasoned hedge fund managers, quantitative traders, and crypto-native experts.
Provide a dense, highly technical audio summary of this report.
${isShortSummary ? 'IMPORTANT: You have been provided with a very short summary. Do NOT pad the length. Simply read the core points provided concisely.' : 'Make it a dense 60-second spoken analysis.'}
State the Report Name and Publisher (${source}).
Then, immediately dive into the core alpha, specific data points, tokenomics, architectural upgrades, or quantitative models discussed.
CRITICAL RULE: DO NOT use generic filler phrases like "institutional adoption is growing" or "the ecosystem is expanding". Assume the audience knows the basics. Extract the unique, non-obvious insights.
Write only the spoken words (no markdown).

Report Title: ${title}
Context: ${contextText}`;

        const scriptRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openrouterApiKey}`,
                'HTTP-Referer': 'https://crypto-reports-repo-app.vercel.app',
                'X-Title': 'Crypto Reports Hub'
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-chat', // DeepSeek V3.1 equivalent on OpenRouter
                messages: [{ role: 'user', content: scriptPrompt }],
                temperature: 0.3,
                max_tokens: 250
            })
        });

        if (!scriptRes.ok) throw new Error("Failed to generate script");
        const scriptData = await scriptRes.json();
        const spokenText = scriptData.choices[0]?.message?.content || "Could not generate summary.";

        const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'tts-1',
                voice: 'alloy',
                input: spokenText
            })
        });

        if (!ttsRes.ok) {
            const err = await ttsRes.text();
            throw new Error(`TTS failed: ${err}`);
        }

        const arrayBuffer = await ttsRes.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);

        // --- 3. SAVE TO VERCEL BLOB STORAGE ---
        const blob = await put(filename, audioBuffer, {
            access: 'public',
            contentType: 'audio/mpeg'
        });

        console.log("SAVED TO BLOB:", blob.url);

        return res.json({
            audioContent: blob.url, // Return the permanent CDN URL
            script: spokenText
        });

    } catch (err) {
        console.error('Audio error:', err);
        return res.status(500).json({ error: 'Failed to generate audio summary: ' + err.message });
    }
};
