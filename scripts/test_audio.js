require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const apiKey = process.env.OPENAI_API_KEY;

async function test() {
    console.log("Using API Key starting with:", apiKey ? apiKey.substring(0, 8) : "MISSING");

    const source = "Test Source";
    const title = "Test Report Title";
    const summaryText = "This is a brief summary of the technical test report.";

    const scriptPrompt = `You are a Senior Crypto Research Analyst providing an audio executive summary of this report.
Write a clear, structured, and highly specific audio summary (lasting about 1.5 to 2 minutes spoken).
Always begin by clearly stating the Report Name, the Publisher (${source}), and any specific lead authors if mentioned in the text.
Next, outline the main index or summary of contents.
Finally, provide the core actionable insights, technical developments, or specific metrics mentioned. Do not use generic filler (like "adoption is growing"). Focus on the actual alpha, data points, or technical architecture discussed.
Keep sentences structured so they flow naturally when spoken. DO NOT use asterisks, markdown, or bullet points in the text. Just write the words you will say out loud.

Publisher/Source: ${source}
Report Title: ${title}

Context/Summary available:
${summaryText}`;

    console.log("1. Hitting Chat Completions...");
    try {
        const scriptRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: scriptPrompt }],
                temperature: 0.3,
                max_tokens: 350
            })
        });

        if (!scriptRes.ok) {
            console.error("Chat Error:", await scriptRes.text());
            return;
        }
        const scriptData = await scriptRes.json();
        const spokenText = scriptData.choices[0]?.message?.content;
        console.log("Generated Script:", spokenText);

        console.log("2. Hitting TTS API...");
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
            console.error("TTS Error:", await ttsRes.text());
            return;
        }

        console.log("Success! Audio binary length:", (await ttsRes.arrayBuffer()).byteLength);

    } catch (e) {
        console.error("Fetch Exception:", e);
    }
}

test();
