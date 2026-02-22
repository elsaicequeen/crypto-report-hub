require('dotenv').config({ path: '.env.local' });
const { del } = require('@vercel/blob');
const crypto = require('crypto');

async function deleteCachedAudio() {
    try {
        const url = 'https://downloads.ctfassets.net/k3n74unfin40/rmATDHYWNtdxmeLGypfqm/1ab64899b1133d1f7cccd28fdf4c5f4d/CB_CryptoMarketOutlook_2026.pdf';
        const urlHash = crypto.createHash('md5').update(url).digest('hex');
        const fileUrl = `https://i5ow2f1enqvwfcbv.public.blob.vercel-storage.com/audio/${urlHash}.mp3`;

        console.log(`🗑️ Deleting cached audio: ${fileUrl}`);

        await del(fileUrl);
        console.log("✅ Successfully deleted from Vercel Blob CDN.");
    } catch (err) {
        console.error("❌ Failed to delete:", err.message);
    }
}

deleteCachedAudio();
