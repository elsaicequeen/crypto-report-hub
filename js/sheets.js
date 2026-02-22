// Google Sheets Integration — via Vercel API backend (/api/reports)
// Reads are always fresh (Sheets API v4), writes are confirmed (server-to-server)

async function fetchFromSheet() {
    try {
        const response = await fetch('/api/reports');
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('API error:', errData);
            return null;
        }
        const data = await response.json();
        console.log(`SheetsModule: loaded ${data.count} reports via API`);
        return data.reports;
    } catch (err) {
        console.error('SheetsModule: fetch failed', err);
        return null;
    }
}

async function appendToSheet(reportData) {
    const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData)
    });

    const result = await response.json();

    if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to save report');
    }

    return result;
}

window.SheetsModule = {
    fetchFromSheet,
    appendToSheet,
    isConfigured: () => true,
    canWrite: () => true
};
