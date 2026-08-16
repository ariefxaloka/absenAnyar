/**
 * =========================================================
 *  ABSENSI RT - Backend (Google Apps Script + Google Sheets)
 * =========================================================
 *
 * Sheet yang dipakai (dibuat OTOMATIS saat pertama kali dipanggil):
 *  - Warga    : ID | Nama | RT | RW | NoHP | Alamat | TanggalDaftar
 *  - Kegiatan : ID | Nama | Tanggal | Lokasi | Status
 *  - Absensi  : ID | ID_Kegiatan | ID_Warga | Nama | Waktu | Status
 *
 * CARA DEPLOY:
 *  1. Buka Google Sheets yang ingin dipakai sebagai database (boleh kosong).
 *  2. Extensions > Apps Script (WAJIB dari dalam Sheet ini, bukan project
 *     berdiri sendiri dari script.google.com langsung).
 *  3. Hapus isi default, tempel SELURUH isi file ini.
 *  4. Deploy > New deployment > Type: Web app.
 *       - Execute as     : Me
 *       - Who has access : Anyone
 *  5. Deploy, authorize akses. Salin "Web app URL", tempel ke
 *     CONFIG.APP_SCRIPT_URL di webapp/app.js.
 *  6. Setiap kali kode ini diubah, WAJIB Deploy > Manage deployments >
 *     Edit (pensil) > New version, supaya URL yang sama pakai kode terbaru.
 *
 * CATATAN PENTING SOAL METODE HTTP:
 *  Semua aksi (baca & tulis) di sini SENGAJA diakses lewat GET (query
 *  string), BUKAN POST. Alasannya: Apps Script Web App selalu me-redirect
 *  (302) ke script.googleusercontent.com, dan sesuai spesifikasi fetch()
 *  browser, body pada request POST HILANG saat redirect 302 diikuti
 *  (method otomatis berubah jadi GET tanpa body). Ini bikin data seperti
 *  PIN/action tidak pernah sampai ke server. GET tidak kena masalah ini,
 *  jadi jauh lebih andal untuk arsitektur Apps Script + fetch().
 *  doPost tetap disediakan sebagai fallback, tapi frontend resmi memakai GET.
 * =========================================================
 */

const SHEET_WARGA = 'Warga';
const SHEET_KEGIATAN = 'Kegiatan';
const SHEET_ABSENSI = 'Absensi';

// getSS() mencoba spreadsheet "container" script ini (kasus normal: dibuat
// lewat Extensions > Apps Script di dalam Sheet). Jika script dibuat sebagai
// project berdiri sendiri, getActiveSpreadsheet() null -> fallback ke ID
// yang disimpan di Script Properties (key: SPREADSHEET_ID).
function getSS() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  throw new Error(
    'Tidak menemukan Spreadsheet aktif. Pastikan script ini dibuat lewat menu ' +
    'Extensions > Apps Script DI DALAM Google Sheets (bukan project baru dari ' +
    'script.google.com langsung). Atau, isi Script Properties "SPREADSHEET_ID" ' +
    'dengan ID spreadsheet tujuan.'
  );
}

function getOrCreateSheet(name, headers) {
  const ss = getSS();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetWarga() {
  return getOrCreateSheet(SHEET_WARGA, ['ID', 'Nama', 'RT', 'RW', 'NoHP', 'Alamat', 'TanggalDaftar']);
}
function sheetKegiatan() {
  return getOrCreateSheet(SHEET_KEGIATAN, ['ID', 'Nama', 'Tanggal', 'Lokasi', 'Status']);
}
function sheetAbsensi() {
  return getOrCreateSheet(SHEET_ABSENSI, ['ID', 'ID_Kegiatan', 'ID_Warga', 'Nama', 'Waktu', 'Status']);
}

// Jalankan fungsi ini SEKALI secara manual di editor (pilih setupSheets lalu
// klik Run ▶️) untuk memastikan 3 sheet berhasil dibuat, tanpa lewat Web App.
function setupSheets() {
  sheetWarga();
  sheetKegiatan();
  sheetAbsensi();
  Logger.log('Sheet Warga, Kegiatan, Absensi berhasil dibuat/dipastikan ada.');
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = data.slice(1);
  return rows
    .filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); })
    .map(function (r) {
      const obj = {};
      headers.forEach(function (h, i) { obj[h] = r[i]; });
      return obj;
    });
}

function generateId(prefix) {
  const rand = Math.floor(Math.random() * 900 + 100);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss');
  return prefix + '-' + stamp + rand;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------- LOGIN ADMIN (PIN) ----------------------
// PIN default '000000' jika belum diatur. UBAH lewat:
// Project Settings (ikon gerigi kiri) > Script Properties > tambah
// key "ADMIN_PIN" dengan value PIN pilihanmu (mis. 6 digit angka).
function getAdminPin() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '000000';
}
function checkPin(pin) {
  return String(pin || '') === getAdminPin();
}

// ---------------------- NOTIFIKASI WHATSAPP (opsional) ----------------------
// Pakai gateway Fonnte (fonnte.com). Jika WA_TOKEN / WA_TARGET belum diatur
// di Script Properties, fitur ini otomatis dilewati (tidak error).
function sendWhatsAppNotif(pesan) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('WA_TOKEN');
  const target = props.getProperty('WA_TARGET');
  if (!token || !target) return;
  try {
    UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method: 'post',
      headers: { Authorization: token },
      payload: { target: target, message: pesan },
      muteHttpExceptions: true
    });
  } catch (e) {
    // Kegagalan kirim WA tidak boleh menggagalkan proses absensi
  }
}

// ---------------------- ROUTER ----------------------
// Semua request (GET maupun POST) diproses fungsi yang sama, "params" berisi
// gabungan query string (dan body JSON jika ada, untuk kompatibilitas).
function doGet(e) {
  return handleRequest(e.parameter);
}

function doPost(e) {
  const params = {};
  Object.keys(e.parameter || {}).forEach(function (k) { params[k] = e.parameter[k]; });
  if (e.postData && e.postData.contents) {
    try {
      const body = JSON.parse(e.postData.contents);
      Object.keys(body).forEach(function (k) { params[k] = body[k]; });
    } catch (err) { /* bukan JSON, abaikan */ }
  }
  return handleRequest(params);
}

function handleRequest(params) {
  try {
    const action = params.action;

    if (action === 'ping') return json({ ok: true, data: 'pong' });

    if (action === 'login') {
      if (!checkPin(params.pin)) throw new Error('PIN salah');
      return json({ ok: true, data: { login: true } });
    }

    // Semua action di bawah ini wajib PIN valid
    if (!checkPin(params.pin)) {
      return json({ ok: false, error: 'PIN salah atau sesi tidak valid' });
    }

    let result;

    switch (action) {
      case 'getWarga':
        result = sheetToObjects(sheetWarga());
        break;

      case 'getKegiatan':
        result = sheetToObjects(sheetKegiatan());
        break;

      case 'getAbsensi': {
        const idKegiatan = params.id_kegiatan;
        let data = sheetToObjects(sheetAbsensi());
        if (idKegiatan) {
          data = data.filter(function (r) { return r.ID_Kegiatan === idKegiatan; });
        }
        result = data;
        break;
      }

      case 'getWargaById': {
        const id = params.id;
        const data = sheetToObjects(sheetWarga());
        result = data.find(function (w) { return w.ID === id; }) || null;
        break;
      }

      case 'addWarga': {
        const sheet = sheetWarga();
        const id = generateId('WRG');
        sheet.appendRow([
          id,
          params.nama || '',
          params.rt || '',
          params.rw || '',
          params.nohp || '',
          params.alamat || '',
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
        ]);
        result = { id: id };
        break;
      }

      case 'addKegiatan': {
        const sheet = sheetKegiatan();
        const id = generateId('KEG');
        sheet.appendRow([id, params.nama || '', params.tanggal || '', params.lokasi || '', 'Aktif']);
        result = { id: id };
        break;
      }

      case 'absen': {
        const idKegiatan = params.id_kegiatan;
        const idWarga = params.id_warga;
        if (!idKegiatan || !idWarga) throw new Error('id_kegiatan dan id_warga wajib diisi');

        const warga = sheetToObjects(sheetWarga()).find(function (w) { return w.ID === idWarga; });
        if (!warga) throw new Error('QR tidak dikenali / warga tidak terdaftar');

        const absensiSheet = sheetAbsensi();
        const existing = sheetToObjects(absensiSheet).find(function (a) {
          return a.ID_Kegiatan === idKegiatan && a.ID_Warga === idWarga;
        });

        if (existing) {
          result = { duplikat: true, nama: warga.Nama, waktu: existing.Waktu };
          break;
        }

        const id = generateId('ABS');
        const waktu = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
        absensiSheet.appendRow([id, idKegiatan, idWarga, warga.Nama, waktu, 'Hadir']);
        result = { duplikat: false, nama: warga.Nama, waktu: waktu };

        const kegiatan = sheetToObjects(sheetKegiatan()).find(function (k) { return k.ID === idKegiatan; });
        const namaKegiatan = kegiatan ? kegiatan.Nama : idKegiatan;
        sendWhatsAppNotif(
          '✅ Absensi Baru\n' +
          'Kegiatan: ' + namaKegiatan + '\n' +
          'Nama: ' + warga.Nama + '\n' +
          'Waktu: ' + waktu
        );
        break;
      }

      default:
        return json({ ok: false, error: 'Action tidak dikenali: ' + action });
    }

    return json({ ok: true, data: result });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}
