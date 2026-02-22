// Filtering, search, and view logic

let currentCategory = 'All';
let currentSearch = '';
let activeTag = null;
let currentView = 'cards';

function filterReports() {
    const data = window.ReportsModule.data;
    return data.filter(report => {
        // Category filter
        if (currentCategory !== 'All' && !(report.tags || []).includes(currentCategory)) {
            return false;
        }
        // Tag filter (clicked tag from card)
        if (activeTag && !(report.tags || []).includes(activeTag)) {
            return false;
        }
        // Search
        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            const fields = [report.title, report.summary, report.source, report.notes, ...(report.tags || [])];
            if (!fields.some(f => f && f.toLowerCase().includes(q))) return false;
        }
        return true;
    });
}

function setCategoryFilter(category) {
    currentCategory = category;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    renderFilteredReports();
}

function setSearchFilter(query) {
    currentSearch = query.trim();
    renderFilteredReports();
}

function setTagFilter(tag) {
    activeTag = activeTag === tag ? null : tag;
    renderFilteredReports();
}

function setViewMode(mode) {
    currentView = mode;
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    renderFilteredReports();
}

function clearFilters() {
    currentCategory = 'All';
    currentSearch = '';
    activeTag = null;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === 'All');
    });
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    renderFilteredReports();
}

function handleCopyClick(e) {
    e.stopPropagation();
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
        if (window.showToast) window.showToast('Link copied!');
    });
}

function attachCardHandlers(container) {
    container.querySelectorAll('.tag').forEach(tagEl => {
        tagEl.addEventListener('click', e => {
            e.stopPropagation();
            setTagFilter(tagEl.dataset.tag);
        });
        if (activeTag && tagEl.dataset.tag === activeTag) {
            tagEl.style.background = 'rgba(99,102,241,0.4)';
            tagEl.style.borderColor = '#a5b4fc';
        }
    });

    container.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', handleCopyClick);
    });
}

function renderCardsView(reports, container) {
    container.innerHTML = reports.map(r => window.ReportsModule.createCard(r)).join('');
    attachCardHandlers(container);

    container.querySelectorAll('.report-card').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('.copy-btn') || e.target.closest('.tag') || e.target.closest('.ask-ai-btn') || e.target.closest('.listen-btn')) return;
            const url = card.dataset.url;
            if (url) window.open(url, '_blank');
        });
    });
}

function renderTableView(reports, container) {
    container.innerHTML = `
    <table class="reports-table">
      <thead>
        <tr>
          <th class="col-date">Date</th>
          <th class="col-title">Report</th>
          <th class="col-source">Source</th>
          <th class="col-tags">Tags</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        ${reports.map(r => window.ReportsModule.createRow(r)).join('')}
      </tbody>
    </table>`;
    attachCardHandlers(container);

    container.querySelectorAll('.report-row').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('.copy-btn') || e.target.closest('.tag') || e.target.closest('.ask-ai-btn') || e.target.closest('.listen-btn')) return;
            const url = row.dataset.url;
            if (url) window.open(url, '_blank');
        });
    });
}

function renderEmptyState(container) {
    container.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🔍</div>
      <h3 class="empty-title">No reports found</h3>
      <p class="empty-text">Try a different category or search term</p>
      <button class="btn btn-secondary" onclick="window.FiltersModule.clearFilters()" style="margin-top:1rem">
        Clear Filters
      </button>
    </div>`;
}

function renderFilteredReports() {
    const container = document.getElementById('reportsGrid');
    const filtered = filterReports();

    if (!filtered.length) {
        container.className = 'reports-grid';
        renderEmptyState(container);
        return;
    }

    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (currentView === 'table') {
        container.className = 'reports-table-container';
        renderTableView(sorted, container);
    } else {
        container.className = 'reports-grid';
        renderCardsView(sorted, container);
    }
}

function updateStats() {
    const data = window.ReportsModule.data;
    const sources = new Set(data.map(r => r.source));
    document.getElementById('totalReports').textContent = data.length;
    document.getElementById('sourceCount').textContent = sources.size;
    const newCount = data.filter(r => window.ReportsModule.isNewReport(r)).length;
    document.getElementById('newCount').textContent = newCount;
}

window.FiltersModule = {
    filterReports,
    setCategoryFilter,
    setSearchFilter,
    setTagFilter,
    setViewMode,
    getViewMode: () => currentView,
    clearFilters,
    renderFilteredReports,
    updateStats
};
