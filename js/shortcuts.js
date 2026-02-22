// Keyboard shortcuts module

const SHORTCUTS = {
    't': () => window.FiltersModule.setViewMode('table'),
    'c': () => window.FiltersModule.setViewMode('cards'),
    '1': () => window.FiltersModule.setTierFilter('1'),
    '2': () => window.FiltersModule.setTierFilter('2'),
    '3': () => window.FiltersModule.setTierFilter('3'),
    '0': () => window.FiltersModule.setTierFilter('all'),
    'a': () => window.FiltersModule.setTierFilter('all'),
    '/': (e) => {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    },
    'Escape': () => {
        window.FiltersModule.clearFilters();
        document.getElementById('searchInput').blur();
        if (window.AddReportModal) window.AddReportModal.hide();
    },
    'n': () => {
        if (window.AddReportModal) window.AddReportModal.show();
    },
    '?': () => showShortcutsHelp()
};

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            if (e.key === 'Escape') {
                e.target.blur();
                window.FiltersModule.setSearchFilter('');
                document.getElementById('searchInput').value = '';
            }
            return;
        }

        // Don't trigger with modifiers (except for /)
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        const handler = SHORTCUTS[e.key];
        if (handler) {
            handler(e);
        }
    });
}

function showShortcutsHelp() {
    showToast('Shortcuts: T=table, C=cards, 1-3=tiers, A=all, /=search, N=new, Esc=clear');
}

// Export
window.KeyboardShortcuts = {
    init: initKeyboardShortcuts,
    showHelp: showShortcutsHelp
};
