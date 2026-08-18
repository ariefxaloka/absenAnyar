// =========================================================
// KONFIGURASI - GANTI DENGAN URL WEB APP GOOGLE APPS SCRIPT KAMU
// =========================================================
const CONFIG = {
  APP_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwuyOS9xRTHe6am30msa1O-Bg6_uktKShiC1rArGa5ZapBNcQNopZZYIQRkI0j6T9BMKA/exec'
};

const BLOK_OPTIONS = { JOLIN: ['F', 'G'], PIRES: ['A', 'B', 'C', 'D', 'E'] };
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// ---------------------- Format tanggal Indonesia ----------------------
// Input tanggal murni (yyyy-MM-dd) -> "Senin, 8 Agustus 2026"
function formatTanggalIndo(tanggalStr) {
  if (!tanggalStr) return '';
  const d = new Date(tanggalStr + 'T00:00:00');
  if (isNaN(d.getTime())) return tanggalStr;
  return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}
// Input datetime (yyyy-MM-dd HH:mm[:ss]) -> "Senin, 8 Agustus 2026 10:15"
function formatWaktuIndo(datetimeStr) {
  if (!datetimeStr) return '';
  const parts = String(datetimeStr).split(' ');
  const tanggal = formatTanggalIndo(parts[0]);
  const jam = parts[1] ? parts[1].slice(0, 5) : '';
  return jam ? `${tanggal} ${jam}` : tanggal;
}

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
    startAutoSync();
  } catch (err) {
    clearPin();
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  clearPin();
  stopAutoSync();
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
    startAutoSync();
  } catch (err) {
    clearPin();
  }
}

// ---------------------- Tab navigation ----------------------
const tabs = ['kegiatan', 'warga', 'scan', 'laporan', 'folder'];
let activeTab = 'kegiatan';
function showTab(name) {
  activeTab = name;
  tabs.forEach(t => {
    document.getElementById('panel-' + t).classList.toggle('hidden', t !== name);
    document.getElementById('tab-' + t).classList.toggle('tab-active', t === name);
  });
  if (name === 'kegiatan') loadKegiatanList();
  if (name === 'warga') { loadWargaList(); }
  if (name === 'scan') { loadKegiatanDropdown('scan-kegiatan'); resetScanSummary(); }
  if (name === 'laporan') { loadKegiatanDropdown('laporan-kegiatan'); }
  if (name === 'folder') { loadFolderInfo(); }
}
tabs.forEach(t => document.getElementById('tab-' + t).addEventListener('click', () => showTab(t)));

// ---------------------- AUTO SYNC (tanpa refresh/logout) ----------------------
let syncTimer = null;
function startAutoSync() {
  if (syncTimer) return;
  syncTimer = setInterval(autoSync, 12000);
}
function stopAutoSync() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
}

async function autoSync() {
  if (!getPin()) return;
  try {
    // Selalu segarkan dropdown "Pilih Warga" di menu Absensi, apapun tab aktif
    const freshWarga = await apiGet('getWarga');
    scanWargaCache = freshWarga;
    populateScanManualSelect();

    if (activeTab === 'warga') {
      wargaCache = freshWarga;
      Array.from(wargaSelected).forEach(id => { if (!freshWarga.some(w => w.ID === id)) wargaSelected.delete(id); });
      updateBulkDeleteButton();
      applyWargaFilter();
    } else if (activeTab === 'kegiatan') {
      loadKegiatanList();
    } else if (activeTab === 'scan') {
      const idK = document.getElementById('scan-kegiatan').value;
      if (idK) refreshRekap(idK, 'scan');
    } else if (activeTab === 'laporan') {
      const idK = document.getElementById('laporan-kegiatan').value;
      if (idK) loadLaporan();
    }
  } catch (err) { /* diam-diam, jangan spam toast tiap 12 detik */ }
}

// ---------------------- Blok Rumah dependent dropdown ----------------------
function populateBlokSelect(selectEl, namaRumah, selectedValue, includeAllOption) {
  const options = namaRumah && BLOK_OPTIONS[namaRumah] ? BLOK_OPTIONS[namaRumah] : ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let html = includeAllOption ? '<option value="">Semua Blok</option>' : '<option value="">-- Pilih Blok --</option>';
  html += options.map(o => `<option value="${o}" ${o === selectedValue ? 'selected' : ''}>${o}</option>`).join('');
  selectEl.innerHTML = html;
}

// ---------------------- KEGIATAN ----------------------
let kegiatanCache = [];
let kegiatanEditId = null;

function statusBadgeClass(status) {
  if (status === 'Aktif') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Selesai') return 'bg-slate-200 text-slate-600';
  return 'bg-amber-100 text-amber-700'; // Terjadwal
}

async function loadKegiatanList() {
  const tbody = document.getElementById('kegiatan-tbody');
  tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="7">Memuat...</td></tr>';
  try {
    kegiatanCache = await apiGet('getKegiatan');
    if (!kegiatanCache.length) {
      tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="7">Belum ada kegiatan.</td></tr>';
      return;
    }
    tbody.innerHTML = kegiatanCache.map((k, idx) => `
      <tr class="border-b border-slate-100">
        <td class="p-3 text-slate-400">${idx + 1}</td>
        <td class="p-3 font-medium">${escapeHtml(k.Nama)}</td>
        <td class="p-3">${escapeHtml(formatTanggalIndo(k.Tanggal))}</td>
        <td class="p-3 whitespace-nowrap">${escapeHtml(k.JamMulai || '-')} - ${escapeHtml(k.JamSelesai || '-')}</td>
        <td class="p-3">${escapeHtml(k.Lokasi)}</td>
        <td class="p-3"><span class="px-2 py-1 rounded-full text-xs ${statusBadgeClass(k.Status)}">${escapeHtml(k.Status)}</span></td>
        <td class="p-3 space-x-2 whitespace-nowrap">
          <button class="text-amber-600 hover:underline text-sm" onclick="editKegiatan('${k.ID}')">Edit</button>
          <button class="text-red-600 hover:underline text-sm" onclick="deleteKegiatan('${k.ID}','${escapeAttr(k.Nama)}')">Hapus</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td class="p-3 text-red-500" colspan="7">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

document.getElementById('form-kegiatan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    nama: f.nama.value.trim(),
    tanggal: f.tanggal.value,
    jamMulai: f.jamMulai.value,
    jamSelesai: f.jamSelesai.value,
    lokasi: f.lokasi.value.trim()
  };
  try {
    if (kegiatanEditId) {
      await apiPost('updateKegiatan', Object.assign({ id: kegiatanEditId }, payload));
      toast('Kegiatan berhasil diperbarui');
    } else {
      await apiPost('addKegiatan', payload);
      toast('Kegiatan berhasil ditambahkan');
    }
    resetKegiatanForm();
    loadKegiatanList();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
});

function editKegiatan(id) {
  const k = kegiatanCache.find(x => x.ID === id);
  if (!k) return;
  kegiatanEditId = id;
  const f = document.getElementById('form-kegiatan');
  f.nama.value = k.Nama || '';
  f.tanggal.value = k.Tanggal || '';
  f.jamMulai.value = k.JamMulai || '';
  f.jamSelesai.value = k.JamSelesai || '';
  f.lokasi.value = k.Lokasi || '';
  document.getElementById('kegiatan-form-title').textContent = 'Edit Kegiatan: ' + k.Nama;
  document.getElementById('kegiatan-submit-btn').textContent = 'Update Kegiatan';
  document.getElementById('kegiatan-cancel-edit').classList.remove('hidden');
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('kegiatan-cancel-edit').addEventListener('click', resetKegiatanForm);

function resetKegiatanForm() {
  kegiatanEditId = null;
  document.getElementById('form-kegiatan').reset();
  document.getElementById('kegiatan-form-title').textContent = 'Tambah Kegiatan';
  document.getElementById('kegiatan-submit-btn').textContent = 'Simpan Kegiatan';
  document.getElementById('kegiatan-cancel-edit').classList.add('hidden');
}

async function deleteKegiatan(id, nama) {
  if (!confirm(`Hapus kegiatan "${nama}"? Data absensi terkait kegiatan ini juga akan terhapus.`)) return;
  try {
    await apiPost('deleteKegiatan', { id });
    toast('Kegiatan berhasil dihapus');
    loadKegiatanList();
  } catch (err) {
    toast('Gagal menghapus: ' + err.message, 'error');
  }
}

document.getElementById('kegiatan-delete-all').addEventListener('click', async () => {
  if (!kegiatanCache.length) return;
  if (!confirm('Hapus SEMUA kegiatan beserta seluruh data absensinya? Tindakan ini tidak bisa dibatalkan.')) return;
  try {
    await apiPost('deleteAllKegiatan', {});
    toast('Semua kegiatan berhasil dihapus');
    loadKegiatanList();
  } catch (err) {
    toast('Gagal menghapus: ' + err.message, 'error');
  }
});

async function loadKegiatanDropdown(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Memuat...</option>';
  try {
    const data = await apiGet('getKegiatan');
    kegiatanCache = data;
    if (!data.length) {
      select.innerHTML = '<option value="">Belum ada kegiatan</option>';
      return;
    }
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Pilih kegiatan --</option>' +
      data.map(k => `<option value="${k.ID}">${escapeHtml(k.Nama)} — ${escapeHtml(formatTanggalIndo(k.Tanggal))} (${escapeHtml(k.Status)})</option>`).join('');
    if (currentVal && data.some(k => k.ID === currentVal)) select.value = currentVal;
  } catch (err) {
    select.innerHTML = '<option value="">Gagal memuat</option>';
  }
}

// ---------------------- WARGA ----------------------
let wargaCache = [];
let wargaEditId = null;
let wargaSelected = new Set();

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
      <td class="p-3 w-8"><input type="checkbox" class="warga-row-check" data-id="${w.ID}" ${wargaSelected.has(w.ID) ? 'checked' : ''} /></td>
      <td class="p-3 text-slate-400">${idx + 1}</td>
      <td class="p-3 font-medium">${escapeHtml(w.Nama)}</td>
      <td class="p-3">${escapeHtml(w.NamaRumah)} ${escapeHtml(w.BlokRumah)}${w.NoRumah ? ', No. ' + escapeHtml(w.NoRumah) : ''}</td>
      <td class="p-3">${escapeHtml(w.NoHP)}</td>
      <td class="p-3 space-x-2 whitespace-nowrap">
        <button class="text-indigo-600 hover:underline text-sm" onclick="openQrModal('${w.ID}','${escapeAttr(w.Nama)}')">QR</button>
        <button class="text-purple-600 hover:underline text-sm" onclick="saveQrToDrive('${w.ID}')">Simpan Drive</button>
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
  if (!confirm(`Hapus ${wargaSelected.size} warga terpilih? File QR di Drive (jika ada) juga akan terhapus.`)) return;
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
  if (!confirm(`Hapus data warga "${nama}"? File QR di Drive (jika ada) juga akan terhapus.`)) return;
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

// ---------------------- QR Modal (generate + download PNG) ----------------------
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

// ---------------------- Simpan QR ke Google Drive ----------------------
async function saveQrToDrive(idWarga) {
  toast('Menyimpan QR ke Drive...');
  try {
    const res = await apiPost('generateQrPdf', { id_warga: idWarga });
    toast('QR tersimpan: ' + res.fileName);
  } catch (err) {
    toast('Gagal simpan ke Drive: ' + err.message, 'error');
  }
}

document.getElementById('warga-save-all-drive').addEventListener('click', async () => {
  if (!wargaCache.length) { toast('Belum ada data warga', 'error'); return; }
  if (!confirm(`Simpan QR untuk ${wargaCache.length} warga ke Google Drive? Proses ini bisa memakan waktu beberapa menit.`)) return;
  toast('Memproses, mohon tunggu...');
  try {
    const res = await apiPost('generateAllQrPdf', {});
    toast(`Selesai: ${res.sukses} berhasil, ${res.gagal} gagal`, res.gagal ? 'error' : 'success');
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
});

// ---------------------- FOLDER QR ----------------------
async function loadFolderInfo() {
  const infoEl = document.getElementById('folder-info');
  infoEl.textContent = 'Memuat...';
  try {
    const res = await apiGet('getFolderId');
    if (res.folderId) {
      infoEl.innerHTML = `Folder aktif: <strong>${escapeHtml(res.folderName)}</strong><br><span class="text-xs text-slate-400">ID: ${escapeHtml(res.folderId)}</span>`;
      document.getElementById('folder-id-input').value = res.folderId;
    } else {
      infoEl.textContent = 'Belum ada folder yang diatur.';
    }
  } catch (err) {
    infoEl.textContent = 'Gagal memuat: ' + err.message;
  }
}

document.getElementById('form-folder').addEventListener('submit', async (e) => {
  e.preventDefault();
  const folderId = document.getElementById('folder-id-input').value.trim();
  try {
    const res = await apiPost('setFolderId', { folderId });
    toast('Folder berhasil diatur: ' + res.folderName);
    loadFolderInfo();
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
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
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Pilih warga --</option>' +
    scanWargaCache.map(w => `<option value="${w.ID}">${escapeHtml(w.Nama)} (${escapeHtml(w.NamaRumah)} ${escapeHtml(w.BlokRumah)})</option>`).join('');
  if (currentVal && scanWargaCache.some(w => w.ID === currentVal)) select.value = currentVal;
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
  } catch (err) { /* biarkan angka lama tetap tampil */ }
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
  if (html5QrCode) html5QrCode.stop().catch(() => {}).finally(() => { html5QrCode.clear(); });
  document.getElementById('scan-start').classList.remove('hidden');
  document.getElementById('scan-stop').classList.add('hidden');
}

async function handleScanResult(idKegiatan, idWarga, status) {
  try {
    const result = await apiPost('absen', { id_kegiatan: idKegiatan, id_warga: idWarga, status });
    if (result.duplikat) {
      toast(`${result.nama} sudah tercatat ${result.status} (${formatWaktuIndo(result.waktu)})`, 'error');
    } else {
      toast(`${result.status}: ${result.nama} — ${formatWaktuIndo(result.waktu)}`);
    }
    addScanLog(result.nama, result.waktu, result.status, result.duplikat);
    refreshRekap(idKegiatan, 'scan');
  } catch (err) {
    toast('Gagal mencatat: ' + err.message, 'error');
  }
}

// Log Terbaru: maksimal 5 entri terakhir
function addScanLog(nama, waktu, status, duplikat) {
  const list = document.getElementById('scan-log');
  const li = document.createElement('li');
  const colorClass = duplikat ? 'bg-amber-50 text-amber-700' : (status === 'Ijin' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700');
  li.className = 'px-3 py-2 rounded-lg ' + colorClass;
  li.textContent = `${nama} — ${status} — ${formatWaktuIndo(waktu)}${duplikat ? ' (sudah tercatat sebelumnya)' : ''}`;
  list.prepend(li);
  while (list.children.length > 5) list.removeChild(list.lastChild);
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
let laporanTidakHadirList = [];
let laporanKegiatanSelected = null;

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

    const kegiatanList = await apiGet('getKegiatan');
    laporanKegiatanSelected = kegiatanList.find(k => k.ID === idKegiatan) || null;

    laporanCache = await apiGet('getAbsensi', { id_kegiatan: idKegiatan });
    const rekap = await apiGet('getRekapKehadiran', { id_kegiatan: idKegiatan });
    document.getElementById('laporan-hadir-count').textContent = rekap.hadir;
    document.getElementById('laporan-ijin-count').textContent = rekap.ijin;
    document.getElementById('laporan-tidakhadir-count').textContent = rekap.tidakHadir;
    laporanTidakHadirList = rekap.tidakHadirList;

    renderLaporanTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td class="p-3 text-red-500" colspan="3">Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderLaporanTable() {
  const tbody = document.getElementById('laporan-tbody');
  const rows = laporanCache.map(a => {
    const w = laporanWargaMap[a.ID_Warga];
    const alamat = w ? `${w.NamaRumah || ''} ${w.BlokRumah || ''}${w.NoRumah ? ', No. ' + w.NoRumah : ''}`.trim() : '';
    const statusColor = a.Status === 'Ijin' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700';
    return `
      <tr class="border-b border-slate-100">
        <td class="p-3">
          <div class="font-medium">${escapeHtml(a.Nama)}</div>
          ${alamat ? `<div class="text-xs text-slate-400">${escapeHtml(alamat)}</div>` : ''}
        </td>
        <td class="p-3">${escapeHtml(formatWaktuIndo(a.Waktu))}</td>
        <td class="p-3"><span class="px-2 py-1 rounded-full text-xs ${statusColor}">${escapeHtml(a.Status)}</span></td>
      </tr>`;
  });

  // Kalau kegiatan sudah Selesai, tampilkan juga warga yang Tidak Hadir
  if (laporanKegiatanSelected && laporanKegiatanSelected.Status === 'Selesai' && laporanTidakHadirList.length) {
    laporanTidakHadirList.forEach(w => {
      const alamat = `${w.NamaRumah || ''} ${w.BlokRumah || ''}${w.NoRumah ? ', No. ' + w.NoRumah : ''}`.trim();
      rows.push(`
        <tr class="border-b border-slate-100 bg-red-50/40">
          <td class="p-3">
            <div class="font-medium">${escapeHtml(w.Nama)}</div>
            ${alamat ? `<div class="text-xs text-slate-400">${escapeHtml(alamat)}</div>` : ''}
          </td>
          <td class="p-3">-</td>
          <td class="p-3"><span class="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">Tidak Hadir</span></td>
        </tr>`);
    });
  }

  tbody.innerHTML = rows.length ? rows.join('') : '<tr><td class="p-3 text-slate-400" colspan="3">Belum ada yang tercatat.</td></tr>';
  document.getElementById('laporan-total').textContent = `Total baris: ${rows.length}`;
}

document.getElementById('laporan-export').addEventListener('click', () => {
  if (!laporanCache.length && !laporanTidakHadirList.length) { toast('Tidak ada data untuk diekspor', 'error'); return; }
  const rows = [['Nama', 'Nama Rumah', 'Blok', 'No Rumah', 'Waktu', 'Status']];
  laporanCache.forEach(a => {
    const w = laporanWargaMap[a.ID_Warga] || {};
    rows.push([a.Nama, w.NamaRumah || '', w.BlokRumah || '', w.NoRumah || '', formatWaktuIndo(a.Waktu), a.Status]);
  });
  if (laporanKegiatanSelected && laporanKegiatanSelected.Status === 'Selesai') {
    laporanTidakHadirList.forEach(w => {
      rows.push([w.Nama, w.NamaRumah || '', w.BlokRumah || '', w.NoRumah || '', '-', 'Tidak Hadir']);
    });
  }
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'rekap-absensi.csv';
  link.click();
});

document.getElementById('laporan-export-pdf').addEventListener('click', async () => {
  const idKegiatan = document.getElementById('laporan-kegiatan').value;
  if (!idKegiatan) { toast('Pilih kegiatan dulu', 'error'); return; }
  toast('Membuat PDF...');
  try {
    const res = await apiGet('exportLaporanPdf', { id_kegiatan: idKegiatan });
    const byteChars = atob(res.base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = res.fileName;
    link.click();
    toast('PDF siap diunduh');
  } catch (err) {
    toast('Gagal membuat PDF: ' + err.message, 'error');
  }
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
