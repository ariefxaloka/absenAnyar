// =========================================================
// KONFIGURASI - GANTI DENGAN URL WEB APP GOOGLE APPS SCRIPT KAMU
// =========================================================
const CONFIG = {
  APP_SCRIPT_URL: 'PASTE_URL_WEB_APP_APPS_SCRIPT_DI_SINI'
};

const BLOK_OPTIONS = { JOLIN: ['F', 'G'], PIRES: ['A', 'B', 'C', 'D', 'E'] };

// ---------------------- AUTH (PIN admin) ----------------------
const AUTH_KEY = 'rt_absensi_pin';
function getPin() { return localStorage.getItem(AUTH_KEY) || ''; }
function setPin(pin) { localStorage.setItem(AUTH_KEY, pin); }
function clearPin() { localStorage.removeItem(AUTH_KEY); }

// ---------------------- Helper fetch ----------------------
// Semua request (baca & tulis) memakai GET dengan query string, BUKAN POST,
// karena redirect 302 Apps Script membuang body request POST di fetch().
async function apiCall(action, params) {
  const url = new URL(CONFIG.APP_SCRIPT_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('pin', getPin());
  if (params) {
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
    });
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Terjadi kesalahan');
  return json.data;
}
const apiGet = apiCall;
const apiPost = apiCall;

// ---------------------- Toast ----------------------
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type === 'error' ? 'toast-error' : 'toast-success');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ---------------------- Login screen ----------------------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pinInput = document.getElementById('login-pin').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  setPin(pinInput);
  try {
    await apiCall('login', {});
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');
    showTab('kegiatan');
  } catch (err) {
    clearPin();
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  clearPin();
  document.getElementById('app-root').classList.add('hidden');
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('login-pin').value = '';
});

async function tryAutoLogin() {
  if (!getPin()) return;
  try {
    await apiCall('login', {});
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');
    showTab('kegiatan');
  } catch (err) {
    clearPin();
  }
}

// ---------------------- Tab navigation ----------------------
const tabs = ['kegiatan', 'warga', 'scan', 'laporan'];
function showTab(name) {
  tabs.forEach(t => {
    document.getElementById('panel-' + t).classList.toggle('hidden', t !== name);
    document.getElementById('tab-' + t).classList.toggle('tab-active', t === name);
  });
  if (name === 'kegiatan') loadKegiatanList();
  if (name === 'warga') { loadWargaList(); }
  if (name === 'scan') { loadKegiatanDropdown('scan-kegiatan'); resetScanSummary(); }
  if (name === 'laporan') { loadKegiatanDropdown('laporan-kegiatan'); }
}
tabs.forEach(t => document.getElementById('tab-' + t).addEventListener('click', () => showTab(t)));

// ---------------------- Blok Rumah dependent dropdown ----------------------
function populateBlokSelect(selectEl, namaRumah, selectedValue, includeAllOption) {
  const options = namaRumah && BLOK_OPTIONS[namaRumah] ? BLOK_OPTIONS[namaRumah] : ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let html = includeAllOption ? '<option value="">Semua Blok</option>' : '<option value="">-- Pilih Blok --</option>';
  html += options.map(o => `<option value="${o}" ${o === selectedValue ? 'selected' : ''}>${o}</option>`).join('');
  selectEl.innerHTML = html;
}

// ---------------------- KEGIATAN ----------------------
async function loadKegiatanList() {
  const tbody = document.getElementById('kegiatan-tbody');
  tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="4">Memuat...</td></tr>';
  try {
    const data = await apiGet('getKegiatan');
    if (!data.length) {
      tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="4">Belum ada kegiatan.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(k => `
      <tr class="border-b border-slate-100">
        <td class="p-3 font-medium">${escapeHtml(k.Nama)}</td>
        <td class="p-3">${escapeHtml(k.Tanggal)}</td>
        <td class="p-3">${escapeHtml(k.Lokasi)}</td>
        <td class="p-3"><span class="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">${escapeHtml(k.Status)}</span></td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td class="p-3 text-red-500" colspan="4">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

document.getElementById('form-kegiatan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await apiPost('addKegiatan', {
      nama: f.nama.value.trim(),
      tanggal: f.tanggal.value,
      lokasi: f.lokasi.value.trim()
    });
    f.reset();
    toast('Kegiatan berhasil ditambahkan');
    loadKegiatanList();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
});

async function loadKegiatanDropdown(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Memuat...</option>';
  try {
    const data = await apiGet('getKegiatan');
    if (!data.length) {
      select.innerHTML = '<option value="">Belum ada kegiatan</option>';
      return;
    }
    select.innerHTML = '<option value="">-- Pilih kegiatan --</option>' +
      data.map(k => `<option value="${k.ID}">${escapeHtml(k.Nama)} (${escapeHtml(k.Tanggal)})</option>`).join('');
  } catch (err) {
    select.innerHTML = '<option value="">Gagal memuat</option>';
  }
}

// ---------------------- WARGA ----------------------
let wargaCache = [];
let wargaEditId = null; // null = mode tambah, terisi = mode edit
let wargaSelected = new Set(); // ID yang dicentang untuk hapus massal

const formWargaNamaRumah = document.getElementById('warga-namaRumah');
const formWargaBlokRumah = document.getElementById('warga-blokRumah');
formWargaNamaRumah.addEventListener('change', () => {
  populateBlokSelect(formWargaBlokRumah, formWargaNamaRumah.value, '', false);
});
populateBlokSelect(formWargaBlokRumah, '', '', false);

const filterNamaRumah = document.getElementById('filter-namaRumah');
const filterBlok = document.getElementById('filter-blok');
filterNamaRumah.addEventListener('change', () => {
  populateBlokSelect(filterBlok, filterNamaRumah.value, '', true);
  applyWargaFilter();
});
populateBlokSelect(filterBlok, '', '', true);
filterBlok.addEventListener('change', applyWargaFilter);
document.getElementById('warga-search').addEventListener('input', applyWargaFilter);

async function loadWargaList() {
  const tbody = document.getElementById('warga-tbody');
  tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="6">Memuat...</td></tr>';
  try {
    wargaCache = await apiGet('getWarga');
    wargaSelected.clear();
    updateBulkDeleteButton();
    applyWargaFilter();
  } catch (err) {
    tbody.innerHTML = `<tr><td class="p-3 text-red-500" colspan="6">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function applyWargaFilter() {
  const q = document.getElementById('warga-search').value.toLowerCase();
  const nr = filterNamaRumah.value;
  const bl = filterBlok.value;
  const filtered = wargaCache.filter(w => {
    if (q && !(w.Nama || '').toLowerCase().includes(q)) return false;
    if (nr && w.NamaRumah !== nr) return false;
    if (bl && w.BlokRumah !== bl) return false;
    return true;
  });
  renderWargaTable(filtered);
}

function renderWargaTable(data) {
  const tbody = document.getElementById('warga-tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="6">Tidak ada data warga.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((w, idx) => `
    <tr class="border-b border-slate-100">
      <td class="p-3 w-8">
        <input type="checkbox" class="warga-row-check" data-id="${w.ID}" ${wargaSelected.has(w.ID) ? 'checked' : ''} />
      </td>
      <td class="p-3 text-slate-400">${idx + 1}</td>
      <td class="p-3 font-medium">${escapeHtml(w.Nama)}</td>
      <td class="p-3">${escapeHtml(w.NamaRumah)} ${escapeHtml(w.BlokRumah)}${w.NoRumah ? ', No. ' + escapeHtml(w.NoRumah) : ''}</td>
      <td class="p-3">${escapeHtml(w.NoHP)}</td>
      <td class="p-3 space-x-2 whitespace-nowrap">
        <button class="text-indigo-600 hover:underline text-sm" onclick="openQrModal('${w.ID}','${escapeAttr(w.Nama)}')">QR</button>
        <button class="text-amber-600 hover:underline text-sm" onclick="editWarga('${w.ID}')">Edit</button>
        <button class="text-red-600 hover:underline text-sm" onclick="deleteWarga('${w.ID}','${escapeAttr(w.Nama)}')">Hapus</button>
      </td>
    </tr>`).join('');

  document.querySelectorAll('.warga-row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) wargaSelected.add(cb.dataset.id);
      else wargaSelected.delete(cb.dataset.id);
      updateBulkDeleteButton();
    });
  });
}

document.getElementById('warga-select-all').addEventListener('change', (e) => {
  document.querySelectorAll('.warga-row-check').forEach(cb => {
    cb.checked = e.target.checked;
    if (e.target.checked) wargaSelected.add(cb.dataset.id);
    else wargaSelected.delete(cb.dataset.id);
  });
  updateBulkDeleteButton();
});

function updateBulkDeleteButton() {
  const btn = document.getElementById('warga-bulk-delete');
  btn.classList.toggle('hidden', wargaSelected.size === 0);
  btn.textContent = `Hapus Terpilih (${wargaSelected.size})`;
}

document.getElementById('warga-bulk-delete').addEventListener('click', async () => {
  if (!wargaSelected.size) return;
  if (!confirm(`Hapus ${wargaSelected.size} warga terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await apiPost('deleteWargaMultiple', { ids: Array.from(wargaSelected).join(',') });
    toast('Warga terpilih berhasil dihapus');
    loadWargaList();
  } catch (err) {
    toast('Gagal menghapus: ' + err.message, 'error');
  }
});

function editWarga(id) {
  const w = wargaCache.find(x => x.ID === id);
  if (!w) return;
  wargaEditId = id;
  const f = document.getElementById('form-warga');
  f.nama.value = w.Nama || '';
  f.namaRumah.value = w.NamaRumah || '';
  populateBlokSelect(formWargaBlokRumah, w.NamaRumah, w.BlokRumah, false);
  f.noRumah.value = w.NoRumah || '';
  f.nohp.value = w.NoHP || '';
  document.getElementById('warga-form-title').textContent = 'Edit Warga: ' + w.Nama;
  document.getElementById('warga-submit-btn').textContent = 'Update Warga';
  document.getElementById('warga-cancel-edit').classList.remove('hidden');
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('warga-cancel-edit').addEventListener('click', resetWargaForm);

function resetWargaForm() {
  wargaEditId = null;
  document.getElementById('form-warga').reset();
  populateBlokSelect(formWargaBlokRumah, '', '', false);
  document.getElementById('warga-form-title').textContent = 'Daftarkan Warga';
  document.getElementById('warga-submit-btn').textContent = 'Simpan Warga';
  document.getElementById('warga-cancel-edit').classList.add('hidden');
}

async function deleteWarga(id, nama) {
  if (!confirm(`Hapus data warga "${nama}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await apiPost('deleteWarga', { id });
    toast('Warga berhasil dihapus');
    loadWargaList();
  } catch (err) {
    toast('Gagal menghapus: ' + err.message, 'error');
  }
}

document.getElementById('form-warga').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    nama: f.nama.value.trim(),
    namaRumah: f.namaRumah.value,
    blokRumah: f.blokRumah.value,
    noRumah: f.noRumah.value.trim(),
    nohp: f.nohp.value.trim()
  };
  try {
    if (wargaEditId) {
      await apiPost('updateWarga', Object.assign({ id: wargaEditId }, payload));
      toast('Data warga berhasil diperbarui');
    } else {
      await apiPost('addWarga', payload);
      toast('Warga berhasil ditambahkan');
    }
    resetWargaForm();
    loadWargaList();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
});

// ---------------------- QR Modal (generate + download) ----------------------
function openQrModal(id, nama) {
  document.getElementById('qr-modal').classList.remove('hidden');
  document.getElementById('qr-modal-nama').textContent = nama;
  const canvas = document.getElementById('qr-canvas');
  QRCode.toCanvas(canvas, id, { width: 240, margin: 2 }, (err) => {
    if (err) toast('Gagal membuat QR: ' + err.message, 'error');
  });
  document.getElementById('qr-download').onclick = () => {
    const link = document.createElement('a');
    link.download = 'QR-' + nama.replace(/\s+/g, '_') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
}
document.getElementById('qr-modal-close').addEventListener('click', () => {
  document.getElementById('qr-modal').classList.add('hidden');
});

// ---------------------- SCAN ABSENSI ----------------------
let html5QrCode = null;
let scanBusy = false;
let scanWargaCache = [];

document.getElementById('scan-kegiatan').addEventListener('change', resetScanSummary);

async function resetScanSummary() {
  const idKegiatan = document.getElementById('scan-kegiatan').value;
  const summaryEl = document.getElementById('scan-summary');
  if (!idKegiatan) { summaryEl.classList.add('hidden'); return; }
  summaryEl.classList.remove('hidden');
  await refreshRekap(idKegiatan, 'scan');
  if (!scanWargaCache.length) {
    scanWargaCache = await apiGet('getWarga');
    populateScanManualSelect();
  }
}

function populateScanManualSelect() {
  const select = document.getElementById('scan-manual-select');
  select.innerHTML = '<option value="">-- Pilih warga --</option>' +
    scanWargaCache.map(w => `<option value="${w.ID}">${escapeHtml(w.Nama)} (${escapeHtml(w.NamaRumah)} ${escapeHtml(w.BlokRumah)})</option>`).join('');
}

async function refreshRekap(idKegiatan, prefix) {
  try {
    const rekap = await apiGet('getRekapKehadiran', { id_kegiatan: idKegiatan });
    document.getElementById(prefix + '-hadir-count').textContent = rekap.hadir;
    document.getElementById(prefix + '-ijin-count').textContent = rekap.ijin;
    document.getElementById(prefix + '-tidakhadir-count').textContent = rekap.tidakHadir;
    const listEl = document.getElementById(prefix + '-tidakhadir-list');
    if (listEl) {
      listEl.innerHTML = rekap.tidakHadirList.length
        ? rekap.tidakHadirList.map(w => `<li>${escapeHtml(w.Nama)} — ${escapeHtml(w.NamaRumah)} ${escapeHtml(w.BlokRumah)}</li>`).join('')
        : '<li class="text-slate-400">Semua warga sudah tercatat.</li>';
    }
  } catch (err) {
    // biarkan diam, angka lama tetap tampil
  }
}

document.getElementById('scan-start').addEventListener('click', async () => {
  const idKegiatan = document.getElementById('scan-kegiatan').value;
  if (!idKegiatan) { toast('Pilih kegiatan dulu', 'error'); return; }

  document.getElementById('scan-start').classList.add('hidden');
  document.getElementById('scan-stop').classList.remove('hidden');

  html5QrCode = new Html5Qrcode('qr-reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 240 },
      async (decodedText) => {
        if (scanBusy) return;
        scanBusy = true;
        await handleScanResult(idKegiatan, decodedText, 'Hadir');
        setTimeout(() => { scanBusy = false; }, 1500);
      },
      () => {}
    );
  } catch (err) {
    toast('Tidak bisa mengakses kamera: ' + err.message, 'error');
    stopScan();
  }
});

document.getElementById('scan-stop').addEventListener('click', stopScan);

function stopScan() {
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {}).finally(() => { html5QrCode.clear(); });
  }
  document.getElementById('scan-start').classList.remove('hidden');
  document.getElementById('scan-stop').classList.add('hidden');
}

async function handleScanResult(idKegiatan, idWarga, status) {
  try {
    const result = await apiPost('absen', { id_kegiatan: idKegiatan, id_warga: idWarga, status });
    if (result.duplikat) {
      toast(`${result.nama} sudah tercatat ${result.status} (${result.waktu})`, 'error');
    } else {
      toast(`${result.status}: ${result.nama} — ${result.waktu}`);
    }
    addScanLog(result.nama, result.waktu, result.status, result.duplikat);
    refreshRekap(idKegiatan, 'scan');
  } catch (err) {
    toast('Gagal mencatat: ' + err.message, 'error');
  }
}

function addScanLog(nama, waktu, status, duplikat) {
  const list = document.getElementById('scan-log');
  const li = document.createElement('li');
  const colorClass = duplikat ? 'bg-amber-50 text-amber-700' : (status === 'Ijin' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700');
  li.className = 'px-3 py-2 rounded-lg ' + colorClass;
  li.textContent = `${nama} — ${status} — ${waktu}${duplikat ? ' (sudah tercatat sebelumnya)' : ''}`;
  list.prepend(li);
}

document.getElementById('scan-manual-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const idKegiatan = document.getElementById('scan-kegiatan').value;
  const idWarga = document.getElementById('scan-manual-select').value;
  const status = document.getElementById('scan-manual-status').value;
  if (!idKegiatan) { toast('Pilih kegiatan dulu', 'error'); return; }
  if (!idWarga) { toast('Pilih warga dulu', 'error'); return; }
  await handleScanResult(idKegiatan, idWarga, status);
  document.getElementById('scan-manual-select').value = '';
});

// ---------------------- LAPORAN ----------------------
let laporanCache = [];
let laporanWargaMap = {};

document.getElementById('laporan-kegiatan').addEventListener('change', loadLaporan);

async function loadLaporan() {
  const idKegiatan = document.getElementById('laporan-kegiatan').value;
  const tbody = document.getElementById('laporan-tbody');
  const summaryEl = document.getElementById('laporan-summary');
  document.getElementById('laporan-total').textContent = '';
  if (!idKegiatan) {
    tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="3">Pilih kegiatan untuk melihat rekap.</td></tr>';
    summaryEl.classList.add('hidden');
    return;
  }
  tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="3">Memuat...</td></tr>';
  summaryEl.classList.remove('hidden');
  try {
    if (!wargaCache.length) wargaCache = await apiGet('getWarga');
    laporanWargaMap = {};
    wargaCache.forEach(w => { laporanWargaMap[w.ID] = w; });

    laporanCache = await apiGet('getAbsensi', { id_kegiatan: idKegiatan });
    refreshRekap(idKegiatan, 'laporan');

    if (!laporanCache.length) {
      tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="3">Belum ada yang tercatat.</td></tr>';
      return;
    }
    tbody.innerHTML = laporanCache.map(a => {
      const w = laporanWargaMap[a.ID_Warga];
      const alamat = w ? `${w.NamaRumah || ''} ${w.BlokRumah || ''}${w.NoRumah ? ', No. ' + w.NoRumah : ''}`.trim() : '';
      const statusColor = a.Status === 'Ijin' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700';
      return `
      <tr class="border-b border-slate-100">
        <td class="p-3">
          <div class="font-medium">${escapeHtml(a.Nama)}</div>
          ${alamat ? `<div class="text-xs text-slate-400">${escapeHtml(alamat)}</div>` : ''}
        </td>
        <td class="p-3">${escapeHtml(a.Waktu)}</td>
        <td class="p-3"><span class="px-2 py-1 rounded-full text-xs ${statusColor}">${escapeHtml(a.Status)}</span></td>
      </tr>`;
    }).join('');
    document.getElementById('laporan-total').textContent = `Total tercatat: ${laporanCache.length} orang`;
  } catch (err) {
    tbody.innerHTML = `<tr><td class="p-3 text-red-500" colspan="3">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

document.getElementById('laporan-export').addEventListener('click', () => {
  if (!laporanCache.length) { toast('Tidak ada data untuk diekspor', 'error'); return; }
  const rows = [['Nama', 'Nama Rumah', 'Blok', 'No Rumah', 'Waktu', 'Status']];
  laporanCache.forEach(a => {
    const w = laporanWargaMap[a.ID_Warga] || {};
    rows.push([a.Nama, w.NamaRumah || '', w.BlokRumah || '', w.NoRumah || '', a.Waktu, a.Status]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'rekap-absensi.csv';
  link.click();
});

// ---------------------- Utils ----------------------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) {
  return String(str ?? '').replace(/'/g, "\\'");
}

// ---------------------- Init ----------------------
tryAutoLogin();
