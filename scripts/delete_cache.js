require('dotenv').config({ path: '.env.local' });
const { del } = require('@vercel/blob');

async function deleteCachedAudio() {
    try {
        const fileUrl = "https://i5ow2f1enqvwfcbv.public.blob.vercel-storage.com/audio/1402409accfb306b4c9617be4fa7ecd2.mp3";
        console.log(`🗑️ Deleting cached audio: ${fileUrl}`);

        await del(fileUrl);
        console.log("✅ Successfully deleted from Vercel Blob CDN.");
    } catch (err) {
        console.error("❌ Failed to delete:", err.message);
    }
}

deleteCachedAudio();
