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
 *  1. Buat Google Spreadsheet baru (kosong juga tidak apa-apa).
 *  2. Extensions > Apps Script, hapus isi default, tempel SELURUH isi file ini.
 *  3. Klik Deploy > New deployment.
 *       - Select type: Web app
 *       - Execute as     : Me (akun kamu)
 *       - Who has access : Anyone
 *  4. Klik Deploy, izinkan akses (authorize). Salin "Web app URL".
 *  5. Tempel URL tsb ke CONFIG.APP_SCRIPT_URL di file webapp/app.js.
 *
 * CATATAN PENTING SOAL CORS:
 *  Apps Script tidak mendukung preflight (OPTIONS request). Karena itu,
 *  di frontend semua request POST WAJIB dikirim dengan header
 *  Content-Type: 'text/plain;charset=utf-8' (BUKAN application/json),
 *  supaya browser menganggapnya "simple request" dan tidak melakukan
 *  preflight. Isi body tetap string JSON, nanti di-parse manual di sini
 *  lewat e.postData.contents. Ini sudah diimplementasikan di app.js.
 * =========================================================
 */

const SHEET_WARGA = 'Warga';
const SHEET_KEGIATAN = 'Kegiatan';
const SHEET_ABSENSI = 'Absensi';

// getSS() akan mencoba spreadsheet yang menjadi "container" script ini
// (kasus normal: dibuat lewat Extensions > Apps Script di dalam Sheet).
// Jika script dibuat sebagai project berdiri sendiri (dari script.google.com
// langsung, tidak lewat Sheet), getActiveSpreadsheet() akan null -> fallback
// ke ID yang disimpan di Script Properties (key: SPREADSHEET_ID).
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

// Jalankan fungsi ini SEKALI secara manual di editor (pilih setupSheets lalu klik Run ▶️)
// untuk memastikan 3 sheet (Warga, Kegiatan, Absensi) berhasil dibuat, tanpa
// perlu lewat Web App / PIN. Kalau ini gagal, cek pesan error di execution log —
// biasanya soal binding spreadsheet seperti dijelaskan di getSS() di atas.
function setupSheets() {
  sheetWarga();
  sheetKegiatan();
  sheetAbsensi();
  Logger.log('Sheet Warga, Kegiatan, Absensi berhasil dibuat/dipastikan ada.');
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
// Script Properties yang dipakai:
//   WA_TOKEN  -> token API dari dashboard Fonnte
//   WA_TARGET -> nomor WA admin/grup tujuan notifikasi (format 62xxxxxxxxxx atau ID grup)
function sendWhatsAppNotif(pesan) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('WA_TOKEN');
  const target = props.getProperty('WA_TARGET');
  if (!token || !target) return; // belum dikonfigurasi, lewati diam-diam
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

// ---------------------- GET (baca data) ----------------------
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'ping') return json({ ok: true, data: 'pong' });
    if (!checkPin(e.parameter.pin)) {
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
        const idKegiatan = e.parameter.id_kegiatan;
        let data = sheetToObjects(sheetAbsensi());
        if (idKegiatan) {
          data = data.filter(function (r) { return r.ID_Kegiatan === idKegiatan; });
        }
        result = data;
        break;
      }

      case 'getWargaById': {
        const id = e.parameter.id;
        const data = sheetToObjects(sheetWarga());
        result = data.find(function (w) { return w.ID === id; }) || null;
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

// ---------------------- POST (tulis data) ----------------------
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    if (action === 'login') {
      if (!checkPin(body.pin)) throw new Error('PIN salah');
      return json({ ok: true, data: { login: true } });
    }

    // Semua aksi di bawah ini mengubah data -> wajib PIN valid
    if (!checkPin(body.pin)) throw new Error('PIN salah atau sesi tidak valid');

    switch (action) {
      case 'addWarga': {
        const sheet = sheetWarga();
        const id = generateId('WRG');
        sheet.appendRow([
          id,
          body.nama || '',
          body.rt || '',
          body.rw || '',
          body.nohp || '',
          body.alamat || '',
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
        ]);
        result = { id: id };
        break;
      }

      case 'addKegiatan': {
        const sheet = sheetKegiatan();
        const id = generateId('KEG');
        sheet.appendRow([id, body.nama || '', body.tanggal || '', body.lokasi || '', 'Aktif']);
        result = { id: id };
        break;
      }

      case 'absen': {
        const idKegiatan = body.id_kegiatan;
        const idWarga = body.id_warga;
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
