// Main application logic

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Build category chips from config
    buildCategoryBar();

    // Set up event listeners
    setupEventListeners();

    // Initialize modules
    if (window.AddReportModal) window.AddReportModal.init();
    if (window.KeyboardShortcuts) window.KeyboardShortcuts.init();

    // Try to load from Google Sheet first, fallback to static data
    await loadReports();

    // Render
    window.FiltersModule.updateStats();
    window.FiltersModule.renderFilteredReports();
    updateLastUpdated();

    if (window.init3DEffects) window.init3DEffects();
}

function buildCategoryBar() {
    const bar = document.getElementById('categoryBar');
    if (!bar) return;

    const categories = (window.APP_CONFIG && window.APP_CONFIG.CATEGORIES) || ['All'];
    bar.innerHTML = categories.map((cat, i) =>
        `<button class="cat-btn ${i === 0 ? 'active' : ''}" data-category="${cat}">${cat}</button>`
    ).join('');

    bar.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.FiltersModule.setCategoryFilter(btn.dataset.category);
        });
    });
}

async function loadReports() {
    if (!window.SheetsModule.isConfigured()) {
        setSheetStatus('', '');
        return;
    }

    setSheetStatus('⏳ Loading...', 'loading');
    const sheetReports = await window.SheetsModule.fetchFromSheet();

    if (sheetReports && sheetReports.length > 0) {
        window.ReportsModule.data.length = 0;
        sheetReports.forEach(r => window.ReportsModule.data.push(r));
        setSheetStatus(`📊 ${sheetReports.length} from Sheet`, 'success');
        setTimeout(() => setSheetStatus('', ''), 4000);
    } else {
        setSheetStatus('', '');
    }
}

function setSheetStatus(text, type) {
    const el = document.getElementById('sheetStatus');
    if (!el) return;
    el.textContent = text;
    el.className = type ? `sheet-status ${type}` : 'sheet-status';
}

function setupEventListeners() {
    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.FiltersModule.setViewMode(btn.dataset.view);
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', e => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => window.FiltersModule.setSearchFilter(e.target.value), 200);
    });
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchInput.value = ''; window.FiltersModule.setSearchFilter(''); }
    });

    // Export
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const filtered = window.FiltersModule.filterReports();
            const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
            window.ExportModule.exportToCSV(sorted);
            showToast(`Exported ${sorted.length} reports`);
        });
    }

    // Upload
    const addReportBtn = document.getElementById('addReportBtn');
    if (addReportBtn) {
        addReportBtn.addEventListener('click', () => {
            if (window.AddReportModal) window.AddReportModal.show();
        });
    }

    // Refresh
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshIcon = document.getElementById('refreshIcon');
    refreshBtn.addEventListener('click', async () => {
        refreshIcon.classList.add('refresh-spin');
        refreshBtn.disabled = true;
        await loadReports();
        window.FiltersModule.updateStats();
        window.FiltersModule.renderFilteredReports();
        updateLastUpdated();
        refreshIcon.classList.remove('refresh-spin');
        refreshBtn.disabled = false;
        showToast('Reports refreshed!');
    });
}

function updateLastUpdated() {
    const now = new Date();
    const t = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const d = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    document.getElementById('lastUpdated').textContent = `Updated: ${d} at ${t}`;
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:linear-gradient(135deg,#f59e0b,#d97706);
    color:#000;padding:12px 24px;border-radius:10px;
    font-weight:500;box-shadow:0 4px 24px rgba(245,158,11,0.3);
    z-index:9999;animation:slideIn 0.3s ease,fadeOut 0.3s ease 2s forwards;
  `;

    if (!document.querySelector('#toast-styles')) {
        const s = document.createElement('style');
        s.id = 'toast-styles';
        s.textContent = `
      @keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
      @keyframes fadeOut{from{opacity:1}to{opacity:0}}
    `;
        document.head.appendChild(s);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

window.showToast = showToast;
window.refreshReports = () => document.getElementById('refreshBtn').click();
