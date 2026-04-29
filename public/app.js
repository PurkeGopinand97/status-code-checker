// ── State ──────────────────────────────────────────────────────────────────
const state = {
  activeTab: 'paste',
  pastedUrls: [],
  uploadedUrls: [],
  sitemapUrls: [],
  results: [],
  filter: 'all',
  checking: false,
  stopRequested: false,
};

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const checkBtn        = $('checkBtn');
const clearBtn        = $('clearBtn');
const stopBtn         = $('stopBtn');
const urlCountEl      = $('urlCount');
const progressSection = $('progressSection');
const progressFill    = $('progressFill');
const progressText    = $('progressText');
const progressErrors  = $('progressErrors');
const resultsSection  = $('resultsSection');
const resultsBody     = $('resultsBody');
const pasteArea       = $('pasteArea');
const fileInput       = $('fileInput');
const dropzone        = $('dropzone');
const browseLink      = $('browseLink');
const uploadedFilename = $('uploadedFilename');
const sitemapInput    = $('sitemapInput');
const sitemapLoadBtn  = $('sitemapLoadBtn');
const sitemapStatus   = $('sitemapStatus');
const downloadBtn     = $('downloadBtn');
const exampleBtn      = $('exampleBtn');
const emptyState      = $('emptyState');

// ── Tabs ────────────────────────────────────────────────────────────────────
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    state.activeTab = tab.dataset.tab;
    $$('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    $$('.tab-content').forEach(c => c.classList.add('hidden'));
    $(`${tab.dataset.tab}-content`).classList.remove('hidden');
    updateFooter();
  });
});

// ── Paste ───────────────────────────────────────────────────────────────────
pasteArea.addEventListener('input', () => {
  state.pastedUrls = parseLines(pasteArea.value);
  updateFooter();
});

function parseLines(text) {
  return [...new Set(
    text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  )];
}

// ── CSV Upload ───────────────────────────────────────────────────────────────
browseLink.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    state.uploadedUrls = parseCSV(e.target.result);
    uploadedFilename.textContent = `${file.name} — ${state.uploadedUrls.length} URL${state.uploadedUrls.length !== 1 ? 's' : ''} loaded`;
    uploadedFilename.classList.remove('hidden');
    updateFooter();
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const urls = new Set();

  // Detect if first row is a header
  const first = lines[0] ? lines[0].toLowerCase() : '';
  const startRow = /url|link|href|address/i.test(first) ? 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    for (const cell of cells) {
      const val = cell.trim().replace(/^["']|["']$/g, '');
      if (val && /^https?:\/\//i.test(val)) urls.add(val);
      // Also accept bare domains / www.*
      else if (val && /^(www\.|\w+\.\w{2,})/.test(val) && !val.includes(' ')) urls.add(val);
    }
  }
  return [...urls];
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Sitemap ──────────────────────────────────────────────────────────────────
sitemapLoadBtn.addEventListener('click', loadSitemap);
sitemapInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSitemap(); });

async function loadSitemap() {
  const url = sitemapInput.value.trim();
  if (!url) return;

  sitemapLoadBtn.disabled = true;
  sitemapLoadBtn.textContent = 'Loading…';
  sitemapStatus.className = 'sitemap-status';
  sitemapStatus.textContent = '';
  sitemapStatus.classList.remove('hidden');

  try {
    const res = await fetch('/.netlify/functions/parse-sitemap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitemapUrl: url }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

    state.sitemapUrls = data.urls;
    sitemapStatus.textContent = `✓ ${data.total.toLocaleString()} URLs found`;
    sitemapStatus.classList.add('ok');
  } catch (err) {
    state.sitemapUrls = [];
    sitemapStatus.textContent = `✗ ${err.message}`;
    sitemapStatus.classList.add('err');
  } finally {
    sitemapLoadBtn.disabled = false;
    sitemapLoadBtn.textContent = 'Load';
    updateFooter();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function activeUrls() {
  switch (state.activeTab) {
    case 'paste':   return state.pastedUrls;
    case 'upload':  return state.uploadedUrls;
    case 'sitemap': return state.sitemapUrls;
  }
  return [];
}

function updateFooter() {
  const n = activeUrls().length;
  urlCountEl.textContent = `${n.toLocaleString()} URL${n !== 1 ? 's' : ''}`;
  clearBtn.classList.toggle('hidden', n === 0);
}

// ── Clear ─────────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  state.pastedUrls = [];
  state.uploadedUrls = [];
  state.sitemapUrls = [];
  pasteArea.value = '';
  uploadedFilename.classList.add('hidden');
  sitemapStatus.classList.add('hidden');
  fileInput.value = '';
  updateFooter();
});

// ── Check ─────────────────────────────────────────────────────────────────────
checkBtn.addEventListener('click', startCheck);
stopBtn.addEventListener('click', () => { state.stopRequested = true; stopBtn.disabled = true; stopBtn.textContent = 'Stopping…'; });

async function startCheck() {
  if (state.checking) return;

  const urls = activeUrls();
  if (urls.length === 0) { alert('Add some URLs first.'); return; }

  state.checking = true;
  state.stopRequested = false;
  state.results = [];

  checkBtn.disabled = true;
  checkBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M10 15l5-3-5-3v6z"/></svg> Checking…';
  stopBtn.disabled = false;
  stopBtn.textContent = 'Stop';
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  updateProgress(0, urls.length, 0);

  const BATCH = 20;
  let done = 0, errors = 0;

  for (let i = 0; i < urls.length; i += BATCH) {
    if (state.stopRequested) break;

    const batch = urls.slice(i, i + BATCH);

    try {
      const res = await fetch('/.netlify/functions/check-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: batch }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const batchResults = await res.json();
      state.results.push(...batchResults);
      errors += batchResults.filter(r => !r.statusCode).length;
    } catch (err) {
      batch.forEach(url => {
        state.results.push({ originalUrl: url, finalUrl: url, statusCode: null, error: err.message, redirects: 0, responseTime: 0 });
        errors++;
      });
    }

    done += batch.length;
    updateProgress(Math.min(done, urls.length), urls.length, errors);
  }

  // Finish up
  state.checking = false;
  checkBtn.disabled = false;
  checkBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Check URLs';
  progressSection.classList.add('hidden');

  if (state.results.length > 0) {
    renderResults();
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateProgress(done, total, errors) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  progressFill.style.width = pct + '%';
  progressText.textContent = `${done.toLocaleString()} / ${total.toLocaleString()}`;
  progressErrors.textContent = errors > 0 ? `${errors} error${errors !== 1 ? 's' : ''}` : '';
}

// ── Results ────────────────────────────────────────────────────────────────────
$$('.filter').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    $$('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
  });
});

$$('.summary-card').forEach(card => {
  card.addEventListener('click', () => {
    const f = card.dataset.filter;
    state.filter = f;
    $$('.filter').forEach(b => b.classList.remove('active'));
    const filterBtn = document.querySelector(`.filter[data-filter="${f}"]`);
    if (filterBtn) filterBtn.classList.add('active');
    $$('.summary-card').forEach(c => c.classList.remove('active-filter'));
    card.classList.add('active-filter');
    renderTable();
  });
});

function category(r) {
  const c = r.statusCode;
  if (!c) return 'error';
  if (c >= 200 && c < 300) return '2xx';
  if (c >= 300 && c < 400) return '3xx';
  if (c >= 400 && c < 500) return '4xx';
  if (c >= 500) return '5xx';
  return 'error';
}

function renderResults() {
  // Counts
  const counts = { total: state.results.length, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, error: 0 };
  state.results.forEach(r => counts[category(r)]++);

  $('count-total').textContent = counts.total.toLocaleString();
  $('count-2xx').textContent   = counts['2xx'].toLocaleString();
  $('count-3xx').textContent   = counts['3xx'].toLocaleString();
  $('count-4xx').textContent   = counts['4xx'].toLocaleString();
  $('count-5xx').textContent   = counts['5xx'].toLocaleString();
  $('count-error').textContent = counts.error.toLocaleString();

  // Reset filter
  state.filter = 'all';
  $$('.filter').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter[data-filter="all"]').classList.add('active');
  $$('.summary-card').forEach(c => c.classList.remove('active-filter'));

  renderTable();
}

function renderTable() {
  const rows = state.filter === 'all'
    ? state.results
    : state.results.filter(r => category(r) === state.filter);

  if (rows.length === 0) {
    resultsBody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  resultsBody.innerHTML = rows.map((r, i) => {
    const cat = category(r);
    const badgeClass = cat === 'error' ? 'badge-err' : `badge-${cat}`;
    const statusLabel = r.statusCode ? String(r.statusCode) : (r.error ? 'ERR' : '—');
    const title = r.error ? ` title="${esc(r.error)}"` : '';
    const isRedirected = r.finalUrl && r.originalUrl !== r.finalUrl;

    return `<tr>
      <td class="col-num" style="color:var(--text-hint)">${i + 1}</td>
      <td class="url-cell"><a href="${esc(r.originalUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(r.originalUrl)}">${esc(clip(r.originalUrl, 55))}</a></td>
      <td class="url-cell">${isRedirected
        ? `<a href="${esc(r.finalUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(r.finalUrl)}">${esc(clip(r.finalUrl, 55))}</a>`
        : `<span class="same">same</span>`
      }</td>
      <td><span class="badge ${badgeClass}"${title}>${statusLabel}</span></td>
      <td class="time-cell">${r.responseTime ? r.responseTime + 'ms' : '—'}</td>
      <td class="hops-cell">${r.redirects > 0 ? r.redirects : '—'}</td>
    </tr>`;
  }).join('');
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clip(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max) + '…';
}

// ── Download ───────────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', downloadCSV);

function downloadCSV() {
  const header = ['#', 'Original URL', 'Final URL', 'Status Code', 'Response Time (ms)', 'Redirects', 'Error'];
  const csvRows = [header, ...state.results.map((r, i) => [
    i + 1,
    r.originalUrl || '',
    r.finalUrl || '',
    r.statusCode || '',
    r.responseTime || '',
    r.redirects || 0,
    r.error || '',
  ])];

  const csv = csvRows.map(row =>
    row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  triggerDownload(csv, `status-check-${today()}.csv`, 'text/csv');
}

// ── Example CSV ────────────────────────────────────────────────────────────────
exampleBtn.addEventListener('click', () => {
  const csv = [
    'url',
    'https://example.com',
    'https://httpstat.us/200',
    'https://httpstat.us/301',
    'https://httpstat.us/404',
    'https://httpstat.us/500',
    'https://google.com',
    'https://github.com',
  ].join('\r\n');
  triggerDownload(csv, 'example-urls.csv', 'text/csv');
});

function triggerDownload(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
