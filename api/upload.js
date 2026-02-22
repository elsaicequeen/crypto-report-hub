const { put } = require('@vercel/blob');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    // Enforce 4.5MB Vercel serverless payload limit protection
    const { filename, base64Content } = req.body || {};

    if (!filename || !base64Content) {
        return res.status(400).json({ error: 'filename and base64Content are required' });
    }

    try {
        console.log(`[Upload] Received file: ${filename}`);

        // Convert base64 back to binary buffer
        const buffer = Buffer.from(base64Content, 'base64');

        // Generate a unique filename hash
        const hash = crypto.createHash('md5').update(filename + Date.now()).digest('hex');
        const ext = filename.split('.').pop() || 'pdf';
        const blobFilename = `reports/uploaded_${hash}.${ext}`;

        // Upload to Vercel Blob
        const blob = await put(blobFilename, buffer, {
            access: 'public',
            contentType: 'application/pdf'
        });

        console.log(`[Upload] Success! Hosted permanently at: ${blob.url}`);

        return res.json({
            success: true,
            url: blob.url
        });

    } catch (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: 'Failed to upload PDF: ' + err.message });
    }
};

// Vercel config to allow larger bodies (up to 4.5MB is the absolute max on Vercel Hobby tier)
module.exports.config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};
