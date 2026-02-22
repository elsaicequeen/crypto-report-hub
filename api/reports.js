module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return handleGet(req, res);
    }

    if (req.method === 'POST') {
        return handlePost(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

// GET /api/reports — Read all reports from Google Sheet via Sheets API v4
async function handleGet(req, res) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = (process.env.SHEET_NAME || 'crypto-reports-template').trim();

    if (!apiKey || !spreadsheetId) {
        return res.status(500).json({
            error: 'Server misconfigured',
            detail: `GOOGLE_API_KEY: ${apiKey ? 'set' : 'MISSING'}, SPREADSHEET_ID: ${spreadsheetId ? 'set' : 'MISSING'}`
        });
    }

    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(502).json({
                error: 'Sheets API error',
                status: response.status,
                detail: errorText.substring(0, 500)
            });
        }

        const data = await response.json();
        const rows = data.values || [];

        if (rows.length < 2) {
            return res.json({ reports: [], count: 0 });
        }

        // First row = headers, rest = data
        const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s/g, '_'));
        const reports = [];

        for (let i = 1; i < rows.length; i++) {
            const values = rows[i];
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = (values[idx] || '').trim();
            });

            // Skip empty rows
            if (!row.title) continue;

            const tags = (row.tags || '').split(',').map(t => t.trim()).filter(Boolean);

            reports.push({
                id: row.id ? parseInt(row.id) : 1000 + i,
                title: row.title,
                summary: row.summary || row.notes || '',
                source: row.source || 'Unknown',
                date: row.date || new Date().toISOString().split('T')[0],
                tags: tags.length ? tags : ['Research'],
                url: row.url || null,
                pdfPath: row.pdfpath || row.pdf_path || null,
                icon: row.icon || '📄',
                notes: row.notes || '',
                verified: ['TRUE', 'true', '1', 'yes'].includes(row.verified),
                addedBy: row.added_by || row.addedby || ''
            });
        }

        return res.json({ reports, count: reports.length });

    } catch (err) {
        return res.status(500).json({ error: 'Internal server error', detail: err.message });
    }
}

// POST /api/reports — Write a new report to Google Sheet via Apps Script
async function handlePost(req, res) {
    const appsScriptUrl = process.env.APPS_SCRIPT_URL;

    if (!appsScriptUrl) {
        return res.status(500).json({ error: 'Server misconfigured: missing APPS_SCRIPT_URL' });
    }

    try {
        const reportData = req.body;

        if (!reportData || !reportData.title || !reportData.source) {
            return res.status(400).json({ error: 'title and source are required' });
        }

        // --- DATA PERMANENCE: AUTO-HOST PDFs TO VERCEL BLOB ---
        if (reportData.url && reportData.url.toLowerCase().includes('.pdf')) {
            try {
                const { put } = require('@vercel/blob');
                const crypto = require('crypto');

                console.log(`[Permanence] Intercepted PDF. Downloading from: ${reportData.url}`);
                const pdfRes = await fetch(reportData.url, { timeout: 15000 });

                if (pdfRes.ok) {
                    const buffer = Buffer.from(await pdfRes.arrayBuffer());
                    const hash = crypto.createHash('md5').update(reportData.url).digest('hex');

                    const blob = await put(`reports/${hash}.pdf`, buffer, {
                        access: 'public',
                        contentType: 'application/pdf'
                    });

                    console.log(`[Permanence] Success! Hosted permanently at: ${blob.url}`);
                    reportData.pdfPath = blob.url; // Overwrite the Google Sheet field with the permanent link
                }
            } catch (err) {
                console.warn('[Permanence] Failed to physically download PDF, falling back to original link.', err.message);
            }
        }

        // Server-to-server call to Apps Script — no CORS issues
        const encoded = encodeURIComponent(JSON.stringify(reportData));
        const scriptUrl = `${appsScriptUrl}?data=${encoded}`;

        const response = await fetch(scriptUrl, { redirect: 'follow' });
        const text = await response.text();

        return res.json({ success: true, message: 'Report added to Sheet' });

    } catch (err) {
        return res.status(500).json({ error: 'Failed to write to Sheet: ' + err.message });
    }
}
