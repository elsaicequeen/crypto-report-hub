// Add Report Modal with password gate, LLM auto-fill, Google Sheets write

let isAuthenticated = false;

const MODAL_HTML = `
<div class="modal-overlay" id="addReportModal">
  <div class="modal">
    <!-- Password Gate -->
    <div id="passwordGate">
      <div class="modal-header">
        <h2>🔒 Upload Report</h2>
        <button class="modal-close" id="closePwModal">✕</button>
      </div>
      <div class="modal-form">
        <p style="color:var(--text-secondary);margin-bottom:1rem;font-size:0.9rem">
          Enter the upload password to add a report.
        </p>
        <div class="form-group">
          <label for="uploadPassword">Password</label>
          <input type="password" id="uploadPassword" placeholder="Enter password..." autocomplete="current-password">
          <p class="form-hint" id="pwError" style="color:#ef4444;display:none">Incorrect password</p>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="submitPassword">Unlock →</button>
        </div>
      </div>
    </div>

    <!-- Report Form (shown after auth) -->
    <div id="reportFormContainer" style="display:none">
      <div class="modal-header">
        <h2>➕ Add Report</h2>
        <button class="modal-close" id="closeFormModal">✕</button>
      </div>
      <form id="addReportForm" class="modal-form">

        <!-- AUTO-FILL SECTION -->
        <div class="autofill-section">
          <label>🤖 Auto-fill with AI</label>
          <div class="autofill-row">
            <input type="url" id="autofillUrl" placeholder="Paste report URL here...">
            <button type="button" class="btn btn-primary" id="autofillBtn">
              <span id="autofillText">Extract ✨</span>
            </button>
          </div>
          <p class="form-hint">Paste a URL and click Extract — AI will fill in all fields below</p>
          <div id="autofillStatus" style="display:none;padding:0.5rem 0.75rem;border-radius:8px;font-size:0.85rem;margin-top:0.5rem"></div>
        </div>

        <div class="form-divider"><span>or fill manually</span></div>

        <div class="form-group">
          <label for="reportTitle">Title *</label>
          <input type="text" id="reportTitle" required placeholder="e.g. Crypto Theses 2025">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="reportSource">Source *</label>
            <input type="text" id="reportSource" required placeholder="e.g. Messari">
          </div>
          <div class="form-group">
            <label for="reportDate">Date</label>
            <input type="date" id="reportDate">
          </div>
        </div>

        <div class="form-group">
          <label for="reportTags">Categories (comma-separated)</label>
          <input type="text" id="reportTags" placeholder="e.g. Bitcoin, Annual Report, DeFi">
          <p class="form-hint">Bitcoin, Ethereum, DeFi, L2s, Macro, Regulation, Analytics, Infrastructure, NFTs, Annual Report</p>
        </div>

        <div class="form-group">
          <label for="reportSummary">Summary</label>
          <textarea id="reportSummary" rows="3" placeholder="Brief description of the report..."></textarea>
        </div>

        <div class="form-group">
          <label>Report Link</label>
          <div class="form-tabs">
            <button type="button" class="form-tab active" data-tab="url">🔗 URL</button>
            <button type="button" class="form-tab" data-tab="upload">📁 Upload PDF</button>
            <button type="button" class="form-tab" data-tab="pdf">📄 Drive Link</button>
          </div>
          <div class="tab-content" id="urlTab">
            <input type="url" id="reportUrl" placeholder="https://...">
          </div>
          <div class="tab-content hidden" id="uploadTab">
            <input type="file" id="reportFileUpload" accept=".pdf" style="margin-top:0.5rem; width:100%; padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem;">
            <p class="form-hint">Max file size: 3MB (Vercel limit). Use URL/Drive for larger files.</p>
          </div>
          <div class="tab-content hidden" id="pdfTab">
            <input type="url" id="reportPdfPath" placeholder="https://drive.google.com/...">
            <p class="form-hint">Upload PDF to Google Drive → Share publicly → paste link here</p>
          </div>
        </div>

        <div class="form-group">
          <label for="reportNotes">Notes</label>
          <textarea id="reportNotes" rows="2" placeholder="Your notes or a pasted LLM summary..."></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="reportAddedBy">Your name</label>
            <input type="text" id="reportAddedBy" placeholder="e.g. Sarah">
          </div>
          <div class="form-group">
            <label for="reportIcon">Icon (emoji)</label>
            <input type="text" id="reportIcon" placeholder="📊" maxlength="4">
          </div>
        </div>

        <div id="submitStatus" style="display:none;padding:0.75rem;border-radius:8px;font-size:0.9rem;margin-bottom:1rem"></div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="lockBtn">🔒 Lock</button>
          <button type="submit" class="btn btn-primary" id="submitReport">
            Add Report
          </button>
        </div>
      </form>
    </div>
  </div>
</div>`;

function initAddReportModal() {
  document.body.insertAdjacentHTML('beforeend', MODAL_HTML);

  // Close buttons
  document.getElementById('closePwModal').addEventListener('click', hideModal);
  document.getElementById('closeFormModal').addEventListener('click', hideModal);
  document.getElementById('addReportModal').addEventListener('click', e => {
    if (e.target === document.getElementById('addReportModal')) hideModal();
  });

  // Password submit
  document.getElementById('submitPassword').addEventListener('click', checkPassword);
  document.getElementById('uploadPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkPassword();
  });

  // Lock button
  document.getElementById('lockBtn').addEventListener('click', () => {
    isAuthenticated = false;
    showPasswordGate();
  });

  // Tab switching
  document.querySelectorAll('.form-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('urlTab').classList.toggle('hidden', tab.dataset.tab !== 'url');
      document.getElementById('uploadTab').classList.toggle('hidden', tab.dataset.tab !== 'upload');
      document.getElementById('pdfTab').classList.toggle('hidden', tab.dataset.tab !== 'pdf');
    });
  });

  // Auto-fill button
  document.getElementById('autofillBtn').addEventListener('click', handleAutofill);
  document.getElementById('autofillUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); handleAutofill(); }
  });

  // Form submit
  document.getElementById('addReportForm').addEventListener('submit', submitReport);

  // Set today as default date
  document.getElementById('reportDate').valueAsDate = new Date();
}

// ==================== LLM AUTO-FILL ====================
async function handleAutofill() {
  const urlInput = document.getElementById('autofillUrl');
  const btn = document.getElementById('autofillBtn');
  const textEl = document.getElementById('autofillText');
  const statusEl = document.getElementById('autofillStatus');
  const url = urlInput.value.trim();

  if (!url) {
    urlInput.focus();
    return;
  }

  btn.disabled = true;
  textEl.textContent = 'Extracting...';
  showAutofillStatus('🤖 AI is reading the page and extracting report details...', 'loading');

  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to extract metadata');
    }

    // Auto-fill the form fields
    document.getElementById('reportTitle').value = data.title || '';
    document.getElementById('reportSource').value = data.source || '';
    document.getElementById('reportSummary').value = data.summary || '';
    document.getElementById('reportTags').value = (data.tags || []).join(', ');
    document.getElementById('reportIcon').value = data.icon || '📄';
    document.getElementById('reportUrl').value = url;

    if (data.date) {
      document.getElementById('reportDate').value = data.date;
    }

    showAutofillStatus('✅ Fields auto-filled! Review and edit if needed, then submit.', 'success');

  } catch (err) {
    console.error('Autofill error:', err);
    showAutofillStatus(`❌ ${err.message}. You can fill the fields manually.`, 'error');
  } finally {
    btn.disabled = false;
    textEl.textContent = 'Extract ✨';
  }
}

function showAutofillStatus(message, type) {
  const el = document.getElementById('autofillStatus');
  const colors = {
    success: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', color: '#22c55e' },
    error: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#ef4444' },
    loading: { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }
  };
  const c = colors[type] || colors.loading;
  el.textContent = message;
  el.style.display = 'block';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
}

// ==================== PASSWORD ====================
function checkPassword() {
  const input = document.getElementById('uploadPassword').value;
  const correct = window.APP_CONFIG && window.APP_CONFIG.UPLOAD_PASSWORD;
  if (input === correct) {
    isAuthenticated = true;
    document.getElementById('passwordGate').style.display = 'none';
    document.getElementById('reportFormContainer').style.display = 'block';
    document.getElementById('uploadPassword').value = '';
    document.getElementById('pwError').style.display = 'none';
    document.getElementById('autofillUrl').focus();
  } else {
    document.getElementById('pwError').style.display = 'block';
    document.getElementById('uploadPassword').value = '';
    document.getElementById('uploadPassword').focus();
  }
}

function showPasswordGate() {
  document.getElementById('passwordGate').style.display = 'block';
  document.getElementById('reportFormContainer').style.display = 'none';
}

// ==================== SUBMIT ====================
async function submitReport(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('submitReport');
  const activeTab = document.querySelector('.form-tab.active').dataset.tab;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  let url = activeTab === 'url' ? document.getElementById('reportUrl').value.trim() : null;
  let pdfPath = activeTab === 'pdf' ? document.getElementById('reportPdfPath').value.trim() : null;

  // Handle direct file upload logic first before building report object
  if (activeTab === 'upload') {
    const fileInput = document.getElementById('reportFileUpload');
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (file.size > 3.5 * 1024 * 1024) { // Absolute safely limit
        showStatus('File is too large! Maximum allowed is 3.5MB', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Report';
        return;
      }

      try {
        submitBtn.textContent = 'Uploading PDF...';
        const base64Content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = error => reject(error);
        });

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, base64Content })
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || uploadData.error) {
          throw new Error(uploadData.error || 'Upload failed');
        }

        pdfPath = uploadData.url; // Use the returned permanent Blob CDN URL
        url = uploadData.url; // Also set as URL so summarizing works if triggered

      } catch (err) {
        showStatus(`Upload failed: ${err.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Report';
        return;
      }
    } else {
      showStatus('Please select a PDF file first', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Report';
      return;
    }
  }

  const tagsStr = document.getElementById('reportTags').value.trim();
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

  const report = {
    id: window.ReportsModule.getNextId(),
    title: document.getElementById('reportTitle').value.trim(),
    summary: document.getElementById('reportSummary').value.trim(),
    source: document.getElementById('reportSource').value.trim(),
    date: document.getElementById('reportDate').value || new Date().toISOString().split('T')[0],
    tags,
    url,
    pdfPath,
    icon: document.getElementById('reportIcon').value.trim() || '📄',
    notes: document.getElementById('reportNotes').value.trim(),
    verified: false,
    addedBy: document.getElementById('reportAddedBy').value.trim()
  };

  if (!report.title || !report.source) {
    showStatus('Title and Source are required', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    if (window.SheetsModule.canWrite()) {
      await window.SheetsModule.appendToSheet(report);
      showStatus('✅ Report saved to Google Sheet!', 'success');
    } else {
      window.ReportsModule.data.unshift(report);
      showStatus('⚠️ Added for this session only.', 'warning');
    }

    // Refresh the view immediately
    window.ReportsModule.data.unshift(report);
    window.FiltersModule.updateStats();
    window.FiltersModule.renderFilteredReports();

    // Reset form
    document.getElementById('addReportForm').reset();
    document.getElementById('autofillUrl').value = '';
    document.getElementById('autofillStatus').style.display = 'none';
    document.getElementById('reportDate').valueAsDate = new Date();

  } catch (err) {
    console.error('Submit error:', err);
    showStatus(`❌ Error: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Report';
  }
}

function showStatus(message, type) {
  const el = document.getElementById('submitStatus');
  const colors = {
    success: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', color: '#22c55e' },
    error: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#ef4444' },
    warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b' }
  };
  const c = colors[type] || colors.warning;
  el.textContent = message;
  el.style.display = 'block';
  el.style.background = c.bg;
  el.style.border = `1px solid ${c.border}`;
  el.style.color = c.color;
}

function showAddReportModal() {
  const modal = document.getElementById('addReportModal');
  modal.classList.add('visible');
  if (isAuthenticated) {
    document.getElementById('passwordGate').style.display = 'none';
    document.getElementById('reportFormContainer').style.display = 'block';
    document.getElementById('autofillUrl').focus();
  } else {
    showPasswordGate();
    document.getElementById('uploadPassword').focus();
  }
}

function hideModal() {
  document.getElementById('addReportModal').classList.remove('visible');
}

window.AddReportModal = {
  init: initAddReportModal,
  show: showAddReportModal,
  hide: hideModal
};
