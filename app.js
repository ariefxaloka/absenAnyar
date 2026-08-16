// =========================================================
// KONFIGURASI - GANTI DENGAN URL WEB APP GOOGLE APPS SCRIPT KAMU
// =========================================================
const CONFIG = {
APP_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyrdi1XQrfUd9xFZYdMf0JtIHss0BbF4n0wj3KVh-Baoe0LhjvwmeEDmVjj5tX1pvQbGw/exec'
};

// ---------------------- AUTH (PIN admin) ----------------------
const AUTH_KEY = 'rt_absensi_pin';
function getPin() { return localStorage.getItem(AUTH_KEY) || ''; }
function setPin(pin) { localStorage.setItem(AUTH_KEY, pin); }
function clearPin() { localStorage.removeItem(AUTH_KEY); }

// ---------------------- Helper fetch ----------------------
async function apiGet(action, params) {
const url = new URL(CONFIG.APP_SCRIPT_URL);
url.searchParams.set('action', action);
url.searchParams.set('pin', getPin());
if (params) {
Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
}
const res = await fetch(url.toString());
const json = await res.json();
if (!json.ok) throw new Error(json.error || 'Terjadi kesalahan');
return json.data;
}

async function apiPost(action, payload) {
const res = await fetch(CONFIG.APP_SCRIPT_URL, {
method: 'POST',
// WAJIB text/plain agar tidak memicu CORS preflight (Apps Script tidak support OPTIONS)
headers: { 'Content-Type': 'text/plain;charset=utf-8' },
body: JSON.stringify(Object.assign({ action, pin: getPin() }, payload))
});
const json = await res.json();
if (!json.ok) throw new Error(json.error || 'Terjadi kesalahan');
return json.data;
}

// ---------------------- Login screen ----------------------
document.getElementById('login-form').addEventListener('submit', async (e) => {
e.preventDefault();
const pinInput = document.getElementById('login-pin').value.trim();
const errEl = document.getElementById('login-error');
errEl.classList.add('hidden');
setPin(pinInput);
try {
await apiPost('login', {});
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
await apiPost('login', {});
document.getElementById('login-overlay').classList.add('hidden');
document.getElementById('app-root').classList.remove('hidden');
showTab('kegiatan');
} catch (err) {
clearPin();
}
}

// ---------------------- Toast ----------------------
function toast(msg, type = 'success') {
const el = document.getElementById('toast');
el.textContent = msg;
el.className = 'toast show ' + (type === 'error' ? 'toast-error' : 'toast-success');
clearTimeout(el._t);
el._t = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ---------------------- Tab navigation ----------------------
const tabs = ['kegiatan', 'warga', 'scan', 'laporan'];
function showTab(name) {
tabs.forEach(t => {
document.getElementById('panel-' + t).classList.toggle('hidden', t !== name);
document.getElementById('tab-' + t).classList.toggle('tab-active', t === name);
});
if (name === 'kegiatan') loadKegiatanList();
if (name === 'warga') loadWargaList();
if (name === 'scan') { loadKegiatanDropdown('scan-kegiatan'); }
if (name === 'laporan') { loadKegiatanDropdown('laporan-kegiatan'); }
}
tabs.forEach(t => document.getElementById('tab-' + t).addEventListener('click', () => showTab(t)));

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
tbody.innerHTML = data.map(k => &lt;tr class="border-b border-slate-100"&gt; &lt;td class="p-3 font-medium"&gt;${escapeHtml(k.Nama)}</td>
<td class="p-3">${escapeHtml(k.Tanggal)}&lt;/td&gt; &lt;td class="p-3"&gt;${escapeHtml(k.Lokasi)}</td>
<td class="p-3"><span class="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">${escapeHtml(k.Status)}&lt;/span&gt;&lt;/td&gt; &lt;/tr>).join('');
} catch (err) {
tbody.innerHTML = <tr&gt;&lt;td class="p-3 text-red-500" colspan="4"&gt;Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
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
data.map(k => <option value="${k.ID}">{escapeHtml(k.Tanggal)})</option>`).join('');
} catch (err) {
select.innerHTML = '<option value="">Gagal memuat</option>';
}
}

// ---------------------- WARGA ----------------------
let wargaCache = [];

async function loadWargaList() {
const tbody = document.getElementById('warga-tbody');
tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="4">Memuat...</td></tr>';
try {
wargaCache = await apiGet('getWarga');
renderWargaTable(wargaCache);
} catch (err) {
tbody.innerHTML = <tr&gt;&lt;td class="p-3 text-red-500" colspan="4"&gt;Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
}
}

function renderWargaTable(data) {
const tbody = document.getElementById('warga-tbody');
if (!data.length) {
tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="4">Belum ada warga terdaftar.</td></tr>';
return;
}
tbody.innerHTML = data.map(w => &lt;tr class="border-b border-slate-100"&gt; &lt;td class="p-3 font-medium"&gt;${escapeHtml(w.Nama)}</td>
<td class="p-3">RT {escapeHtml(w.RW)}</td>
<td class="p-3">{w.ID}','${escapeAttr(w.Nama)}')"&gt;Lihat QR&lt;/button&gt; &lt;/td&gt; &lt;/tr>).join('');
}

document.getElementById('warga-search').addEventListener('input', (e) => {
const q = e.target.value.toLowerCase();
renderWargaTable(wargaCache.filter(w => (w.Nama || '').toLowerCase().includes(q)));
});

document.getElementById('form-warga').addEventListener('submit', async (e) => {
e.preventDefault();
const f = e.target;
try {
await apiPost('addWarga', {
nama: f.nama.value.trim(),
rt: f.rt.value.trim(),
rw: f.rw.value.trim(),
nohp: f.nohp.value.trim(),
alamat: f.alamat.value.trim()
});
f.reset();
toast('Warga berhasil ditambahkan');
loadWargaList();
} catch (err) {
toast('Gagal: ' + err.message, 'error');
}
});

// ---------------------- QR Modal (generate + download + print) ----------------------
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
await handleScanResult(idKegiatan, decodedText);
setTimeout(() => { scanBusy = false; }, 1500);
},
() => {} // ignore per-frame decode errors
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

async function handleScanResult(idKegiatan, idWarga) {
try {
const result = await apiPost('absen', { id_kegiatan: idKegiatan, id_warga: idWarga });
if (result.duplikat) {
toast(``${result.nama} sudah absen (latex
{result.waktu})`, 'error'); } else { toast(`Hadir: 

{result.nama} — ${result.waktu});
}
addScanLog(result.nama, result.waktu, result.duplikat);
} catch (err) {
toast('Gagal absen: ' + err.message, 'error');
}
}

function addScanLog(nama, waktu, duplikat) {
const list = document.getElementById('scan-log');
const li = document.createElement('li');
li.className = 'px-3 py-2 rounded-lg ' + (duplikat ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700');
li.textContent = ``${nama} — {duplikat ? ' (sudah absen sebelumnya)' : ''}`;
list.prepend(li);
}

// Input manual ID (untuk perangkat tanpa kamera / testing)
document.getElementById('scan-manual-form').addEventListener('submit', async (e) => {
e.preventDefault();
const idKegiatan = document.getElementById('scan-kegiatan').value;
const idWarga = document.getElementById('scan-manual-input').value.trim();
if (!idKegiatan) { toast('Pilih kegiatan dulu', 'error'); return; }
if (!idWarga) return;
await handleScanResult(idKegiatan, idWarga);
e.target.reset();
});

// ---------------------- LAPORAN ----------------------
let laporanCache = [];

document.getElementById('laporan-kegiatan').addEventListener('change', loadLaporan);

async function loadLaporan() {
const idKegiatan = document.getElementById('laporan-kegiatan').value;
const tbody = document.getElementById('laporan-tbody');
document.getElementById('laporan-total').textContent = '';
if (!idKegiatan) {
tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="3">Pilih kegiatan untuk melihat rekap.</td></tr>';
return;
}
tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="3">Memuat...</td></tr>';
try {
laporanCache = await apiGet('getAbsensi', { id_kegiatan: idKegiatan });
if (!laporanCache.length) {
tbody.innerHTML = '<tr><td class="p-3 text-slate-400" colspan="3">Belum ada yang absen.</td></tr>';
return;
}
tbody.innerHTML = laporanCache.map(a => &lt;tr class="border-b border-slate-100"&gt; &lt;td class="p-3 font-medium"&gt;${escapeHtml(a.Nama)}</td>
<td class="p-3">${escapeHtml(a.Waktu)}&lt;/td&gt; &lt;td class="p-3"&gt;&lt;span class="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700"&gt;${escapeHtml(a.Status)}</span></td>
</tr>).join(''); document.getElementById('laporan-total').textContent =Total hadir: ${laporanCache.length} orang;
} catch (err) {
tbody.innerHTML = <tr&gt;&lt;td class="p-3 text-red-500" colspan="3"&gt;Gagal memuat: ${escapeHtml(err.message)}</td></tr>`;
}
}

document.getElementById('laporan-export').addEventListener('click', () => {
if (!laporanCache.length) { toast('Tidak ada data untuk diekspor', 'error'); return; }
const rows = [['Nama', 'Waktu', 'Status'], ...laporanCache.map(a => [a.Nama, a.Waktu, a.Status])];
const csv = rows.map(r => r.map(v => "${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
const link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.download = 'rekap-absensi.csv';
link.click();
});

// ---------------------- Utils ----------------------
function escapeHtml(str) {
return String(str ?? '').replace(/[&<>"']/g, c => ({
'&': '&', '<': '<', '>': '>', '"': '"', "'": '''
}[c]));
}
function escapeAttr(str) {
return String(str ?? '').replace(/'/g, "\'");
}

// ---------------------- Init ----------------------
tryAutoLogin();
