// Export functionality - download reports as CSV or Excel-compatible format

// Convert reports array to CSV string
function reportsToCSV(reports) {
    const headers = [
        'Title',
        'Source',
        'Tier',
        'Date',
        'Tags',
        'URL',
        'Notes',
        'Verified'
    ];

    const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    const rows = reports.map(r => [
        escapeCSV(r.title),
        escapeCSV(r.source),
        escapeCSV(r.tier),
        escapeCSV(r.date),
        escapeCSV((r.tags || []).join(', ')),
        escapeCSV(r.pdfPath || r.url || ''),
        escapeCSV(r.notes || ''),
        escapeCSV(r.verified ? 'Yes' : 'No')
    ]);

    const allRows = [headers, ...rows];
    return allRows.map(row => row.join(',')).join('\n');
}

// Trigger a file download in the browser
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Download currently visible (filtered) reports as CSV
function exportToCSV(reports) {
    const now = new Date();
    const datestamp = now.toISOString().split('T')[0];
    const filename = `crypto-reports-${datestamp}.csv`;

    const csv = reportsToCSV(reports);
    // Use UTF-8 BOM so Excel opens it correctly with special chars
    downloadFile('\uFEFF' + csv, filename, 'text/csv;charset=utf-8;');
}

// Export
window.ExportModule = {
    exportToCSV,
    reportsToCSV
};
