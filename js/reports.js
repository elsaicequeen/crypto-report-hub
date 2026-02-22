// Curated crypto research reports — static fallback data
// These are used when Google Sheet is unavailable or not configured

const reportsData = [];

// Generate Dynamic SVG Fallback for missing report images
window.generateFallbackSVG = function (sourceStr) {
  const name = sourceStr || 'Unk';
  let initials = name.substring(0, 2).toUpperCase();

  // Deterministic color hashing
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Premium Apple-style gradients
  const gradients = [
    ['#FF2A54', '#FF9B44'], // Sunrise
    ['#007AFF', '#34C759'], // Ocean
    ['#5856D6', '#FF2D55'], // Dusk
    ['#FF9500', '#FFCC00'], // Solar
    ['#34C759', '#32ADE6'], // Forest
    ['#AF52DE', '#5856D6']  // Amethyst
  ];
  const index = Math.abs(hash) % gradients.length;
  const [color1, color2] = gradients[index];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="grad${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color1}" />
          <stop offset="100%" stop-color="${color2}" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#grad${hash})" />
      <text x="50" y="50" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="42" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${initials}</text>
    </svg>
  `;

  // Encode safely to base64 Data URI
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.trim())));
};

// Check if report is "new" (within configured days)
function isNewReport(report) {
  const days = (window.APP_CONFIG && window.APP_CONFIG.NEW_BADGE_DAYS) || 7;
  const reportDate = new Date(report.date);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return reportDate >= cutoff;
}

// Generate report card HTML
function createReportCard(report) {
  const formattedDate = new Date(report.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  const tagsHTML = (report.tags || [])
    .slice(0, 3)
    .map(tag => `<span class="tag" data-tag="${tag}">${tag}</span>`)
    .join('');

  const icon = report.icon || '📄';
  const link = report.pdfPath || report.url;
  const isNew = isNewReport(report);
  const isPDF = Boolean(report.pdfPath);

  let domain = 'example.com';
  try {
    if (report.url) domain = new URL(report.url).hostname;
  } catch (e) { }

  const faviconUrl = `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=128`;
  let thumbnailUrl = '';

  // Prefer the link text for OG extraction, otherwise generic fallback
  if (link && !isPDF) { // PDF direct links won't have HTML OG tags
    thumbnailUrl = `/api/og-image?url=${encodeURIComponent(link)}`;
  } else {
    thumbnailUrl = faviconUrl;
  }

  // Use a neat trick: load the OG image first. If it fails (404), swap to the favicon, and update classes.
  return `
    <article class="report-card card-glass" data-id="${report.id}" data-url="${link || ''}">
      <div class="card-header">
        <div class="card-badges">
          ${isNew ? '<span class="new-badge">🆕 New</span>' : ''}
          ${isPDF ? '<span class="pdf-badge">PDF</span>' : ''}
          ${report.verified ? '<span class="verified-badge" title="Verified">✓</span>' : ''}
        </div>
        <span class="card-date">${formattedDate}</span>
      </div>
      <div class="card-body">
        <div class="card-thumbnail">
          <img src="${thumbnailUrl}" alt="${report.source} preview" class="dynamic-thumbnail ${thumbnailUrl === faviconUrl ? 'is-favicon' : 'is-og'}" onerror="if(this.src !== '${faviconUrl}' && !this.dataset.t) { this.dataset.t=1; this.src = '${faviconUrl}'; this.classList.remove('is-og'); this.classList.add('is-favicon'); } else if (!this.dataset.s) { this.dataset.s=1; this.src = window.generateFallbackSVG('${report.source.replace(/'/g, "\\'")}'); this.classList.remove('is-favicon'); this.classList.add('is-fallback'); } else { this.style.display = 'none'; }">
        </div>
        <h3 class="card-title">${report.title}</h3>
        <p class="card-summary">${report.summary}</p>
        ${report.notes ? `<p class="card-notes">📝 ${report.notes}</p>` : ''}
        <div class="card-footer">
          <div class="card-tags">${tagsHTML}</div>
          <div class="card-actions">
            <button class="btn-ask-ai ask-ai-btn" data-url="${link || ''}" data-title="${report.title}" title="Ask AI about this report">✨ Ask AI</button>
            <button class="btn-listen listen-btn" data-url="${link || ''}" data-title="${report.title}" data-source="${report.source}" data-summary="${report.summary}" title="Generate 1-min Audio Summary">🔊 Listen</button>
            <button class="copy-btn" data-url="${link || ''}" title="Copy link">📋</button>
            <div class="card-source">
              <span class="source-icon">${icon}</span>
              <span>${report.source}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

// Generate table row HTML
function createReportRow(report) {
  const formattedDate = new Date(report.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric'
  });

  const tagsHTML = (report.tags || [])
    .slice(0, 2)
    .map(tag => `<span class="tag tag-sm" data-tag="${tag}">${tag}</span>`)
    .join('');

  const link = report.pdfPath || report.url;
  const isNew = isNewReport(report);
  const isPDF = Boolean(report.pdfPath);

  let domain = 'example.com';
  if (report.url) {
    try {
      domain = new URL(report.url).hostname;
    } catch (e) { }
  }

  const faviconUrl = `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=64`;
  let thumbnailUrl = faviconUrl;

  // Use Vercel Edge Cache via /api/og-image
  if (link && !isPDF) {
    thumbnailUrl = `/api/og-image?url=${encodeURIComponent(link)}`;
  }

  return `
    <tr class="report-row" data-id="${report.id}" data-url="${link || ''}">
      <td class="col-date">${formattedDate}</td>
      <td class="col-title">
        <div class="row-title-wrap">
          <img src="${thumbnailUrl}" class="row-thumbnail" onerror="if(this.src !== '${faviconUrl}' && !this.dataset.t) { this.dataset.t=1; this.src = '${faviconUrl}'; } else if (!this.dataset.s) { this.dataset.s=1; this.src = window.generateFallbackSVG('${report.source.replace(/'/g, "\\'")}'); this.classList.add('is-fallback'); } else { this.style.display = 'none'; }" alt=""/>
          <span class="row-title">${report.title}</span>
          <span class="row-type">${isNew ? '🆕' : ''} ${isPDF ? '📄' : ''}</span>
        </div>
      </td>
      <td class="col-source">${report.source}</td>
      <td class="col-tags">${tagsHTML}</td>
      <td class="col-actions">
        <div style="display:flex; gap:8px;">
          <button class="btn-ask-ai ask-ai-btn" data-url="${link || ''}" data-title="${report.title}" title="Ask AI">✨ Ask AI</button>
          <button class="btn-listen listen-btn" data-url="${link || ''}" data-title="${report.title}" data-source="${report.source}" data-summary="${report.summary}" title="Listen to summary">🔊</button>
          <button class="copy-btn copy-btn-sm" data-url="${link || ''}" title="Copy link">📋</button>
        </div>
      </td>
    </tr>
  `;
}

function getNextId() {
  return Math.max(...reportsData.map(r => r.id), 0) + 1;
}

window.ReportsModule = {
  data: reportsData,
  createCard: createReportCard,
  createRow: createReportRow,
  isNewReport,
  getNextId
};
