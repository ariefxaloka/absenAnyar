/**
 * =========================================================
 *  ABSENSI RT - Backend (Google Apps Script + Google Sheets)
 * =========================================================
 *
 * Sheet yang dipakai (dibuat OTOMATIS saat pertama kali dipanggil):
 *  - Warga    : ID | Nama | NamaRumah | BlokRumah | NoRumah | NoHP | TanggalDaftar
 *  - Kegiatan : ID | Nama | Tanggal | Lokasi | Status
 *  - Absensi  : ID | ID_Kegiatan | ID_Warga | Nama | Waktu | Status   (Status: Hadir / Ijin)
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
 * MIGRASI DARI VERSI LAMA (kolom RT/RW/Alamat):
 *  Kalau sheet Warga kamu masih pakai kolom lama (RT, RW, Alamat), jalankan
 *  fungsi migrateWargaSheet() SEKALI secara manual di editor (pilih dari
 *  dropdown lalu klik Run ▶️). Ini akan mengganti nama kolom RT->NamaRumah,
 *  RW->BlokRumah, Alamat->NoRumah tanpa menghapus data yang sudah ada.
 *  Data lama di kolom tsb (misal RT berisi "01") TIDAK otomatis dikonversi
 *  ke JOLIN/PIRES - silakan sesuaikan manual di sheet setelah migrasi.
 *
 * CATATAN METODE HTTP:
 *  Semua aksi (baca & tulis) diakses lewat GET (query string), BUKAN POST,
 *  karena redirect 302 pada Web App Apps Script membuang body request POST
 *  di browser modern (method otomatis jadi GET tanpa data).
 * =========================================================
 */

const SHEET_WARGA = 'Warga';
const SHEET_KEGIATAN = 'Kegiatan';
const SHEET_ABSENSI = 'Absensi';

const BLOK_OPTIONS = { JOLIN: ['F', 'G'], PIRES: ['A', 'B', 'C', 'D', 'E'] };

// ---------------------- Spreadsheet helpers ----------------------
function getSS() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error(
    'Tidak menemukan Spreadsheet aktif. Pastikan script ini dibuat lewat menu ' +
    'Extensions > Apps Script DI DALAM Google Sheets, atau isi Script ' +
    'Properties "SPREADSHEET_ID" dengan ID spreadsheet tujuan.'
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
  return getOrCreateSheet(SHEET_WARGA, ['ID', 'Nama', 'NamaRumah', 'BlokRumah', 'NoRumah', 'NoHP', 'TanggalDaftar']);
}
function sheetKegiatan() {
  return getOrCreateSheet(SHEET_KEGIATAN, ['ID', 'Nama', 'Tanggal', 'Lokasi', 'Status']);
}
function sheetAbsensi() {
  return getOrCreateSheet(SHEET_ABSENSI, ['ID', 'ID_Kegiatan', 'ID_Warga', 'Nama', 'Waktu', 'Status']);
}

// Jalankan SEKALI manual (Run ▶️) untuk memastikan 3 sheet dasar dibuat.
function setupSheets() {
  sheetWarga();
  sheetKegiatan();
  sheetAbsensi();
  Logger.log('Sheet Warga, Kegiatan, Absensi berhasil dibuat/dipastikan ada.');
}

// Jalankan SEKALI manual kalau upgrade dari versi lama (kolom RT/RW/Alamat).
function migrateWargaSheet() {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEET_WARGA);
  if (!sheet) { Logger.log('Sheet Warga belum ada. Jalankan setupSheets() dulu.'); return; }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const renameMap = { RT: 'NamaRumah', RW: 'BlokRumah', Alamat: 'NoRumah' };
  let changed = false;
  const newHeaders = headers.map(function (h) {
    if (renameMap[h]) { changed = true; return renameMap[h]; }
    return h;
  });
  if (changed) {
    sheet.getRange(1, 1, 1, lastCol).setValues([newHeaders]);
    Logger.log('Header diperbarui: ' + newHeaders.join(', '));
  } else {
    Logger.log('Header sudah sesuai format baru.');
  }

  const headers2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers2.indexOf('NoRumah') === -1) {
    sheet.getRange(1, headers2.length + 1).setValue('NoRumah');
    Logger.log('Kolom NoRumah ditambahkan di akhir.');
  }
  Logger.log('SELESAI. Cek ulang isi kolom NamaRumah/BlokRumah - data lama mungkin perlu disesuaikan manual ke JOLIN/PIRES dan A-G.');
}

// ---------------------- Generic row helpers ----------------------
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

function appendRowByHeaders(sheet, dataObj) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row = headers.map(function (h) { return dataObj[h] !== undefined ? dataObj[h] : ''; });
  sheet.appendRow(row);
}

function findRowIndexById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1; // ID selalu kolom A
  }
  return -1;
}

function updateRowById(sheet, id, updates) {
  const rowIdx = findRowIndexById(sheet, id);
  if (rowIdx === -1) throw new Error('Data tidak ditemukan (ID: ' + id + ')');
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const rowValues = sheet.getRange(rowIdx, 1, 1, lastCol).getValues()[0];
  const rowObj = {};
  headers.forEach(function (h, i) { rowObj[h] = rowValues[i]; });
  Object.keys(updates).forEach(function (k) { if (updates[k] !== undefined) rowObj[k] = updates[k]; });
  const newRow = headers.map(function (h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sheet.getRange(rowIdx, 1, 1, lastCol).setValues([newRow]);
  return rowObj;
}

function deleteRowById(sheet, id) {
  const rowIdx = findRowIndexById(sheet, id);
  if (rowIdx === -1) return false;
  sheet.deleteRow(rowIdx);
  return true;
}

function generateId(prefix) {
  const rand = Math.floor(Math.random() * 900 + 100);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss');
  return prefix + '-' + stamp + rand;
}

function validateBlok(namaRumah, blokRumah) {
  if (!namaRumah || !blokRumah) throw new Error('Nama Rumah dan Blok Rumah wajib diisi');
  const allowed = BLOK_OPTIONS[namaRumah];
  if (!allowed) throw new Error('Nama Rumah tidak valid (harus JOLIN atau PIRES)');
  if (allowed.indexOf(blokRumah) === -1) {
    throw new Error('Blok Rumah "' + blokRumah + '" tidak sesuai untuk ' + namaRumah + ' (pilihan: ' + allowed.join(', ') + ')');
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------- LOGIN ADMIN (PIN) ----------------------
function getAdminPin() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '000000';
}
function checkPin(pin) {
  return String(pin || '') === getAdminPin();
}

// ---------------------- NOTIFIKASI WHATSAPP (opsional) ----------------------
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
  } catch (e) { /* jangan sampai gagal kirim WA menggagalkan absensi */ }
}

// ---------------------- ROUTER ----------------------
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

    if (!checkPin(params.pin)) {
      return json({ ok: false, error: 'PIN salah atau sesi tidak valid' });
    }

    let result;

    switch (action) {
      // ---------------- WARGA ----------------
      case 'getWarga':
        result = sheetToObjects(sheetWarga());
        break;

      case 'getWargaById': {
        const data = sheetToObjects(sheetWarga());
        result = data.find(function (w) { return w.ID === params.id; }) || null;
        break;
      }

      case 'addWarga': {
        const sheet = sheetWarga();
        const namaRumah = params.namaRumah || '';
        const blokRumah = params.blokRumah || '';
        validateBlok(namaRumah, blokRumah);
        const id = generateId('WRG');
        appendRowByHeaders(sheet, {
          ID: id,
          Nama: params.nama || '',
          NamaRumah: namaRumah,
          BlokRumah: blokRumah,
          NoRumah: params.noRumah || '',
          NoHP: params.nohp || '',
          TanggalDaftar: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
        });
        result = { id: id };
        break;
      }

      case 'updateWarga': {
        const sheet = sheetWarga();
        const namaRumah = params.namaRumah || '';
        const blokRumah = params.blokRumah || '';
        validateBlok(namaRumah, blokRumah);
        if (!params.id) throw new Error('id wajib diisi');
        updateRowById(sheet, params.id, {
          Nama: params.nama || '',
          NamaRumah: namaRumah,
          BlokRumah: blokRumah,
          NoRumah: params.noRumah || '',
          NoHP: params.nohp || ''
        });
        result = { id: params.id };
        break;
      }

      case 'deleteWarga': {
        const ok = deleteRowById(sheetWarga(), params.id);
        if (!ok) throw new Error('Warga tidak ditemukan');
        result = { deleted: true };
        break;
      }

      case 'deleteWargaMultiple': {
        const ids = String(params.ids || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        const sheet = sheetWarga();
        let count = 0;
        ids.forEach(function (id) { if (deleteRowById(sheet, id)) count++; });
        result = { deleted: count };
        break;
      }

      // ---------------- KEGIATAN ----------------
      case 'getKegiatan':
        result = sheetToObjects(sheetKegiatan());
        break;

      case 'addKegiatan': {
        const sheet = sheetKegiatan();
        const id = generateId('KEG');
        appendRowByHeaders(sheet, {
          ID: id, Nama: params.nama || '', Tanggal: params.tanggal || '',
          Lokasi: params.lokasi || '', Status: 'Aktif'
        });
        result = { id: id };
        break;
      }

      // ---------------- ABSENSI ----------------
      case 'getAbsensi': {
        const idKegiatan = params.id_kegiatan;
        let data = sheetToObjects(sheetAbsensi());
        if (idKegiatan) data = data.filter(function (r) { return r.ID_Kegiatan === idKegiatan; });
        result = data;
        break;
      }

      case 'absen': {
        const idKegiatan = params.id_kegiatan;
        const idWarga = params.id_warga;
        const status = params.status === 'Ijin' ? 'Ijin' : 'Hadir';
        if (!idKegiatan || !idWarga) throw new Error('id_kegiatan dan id_warga wajib diisi');

        const warga = sheetToObjects(sheetWarga()).find(function (w) { return w.ID === idWarga; });
        if (!warga) throw new Error('Data warga tidak ditemukan / QR tidak dikenali');

        const absensiSheet = sheetAbsensi();
        const allAbsensi = sheetToObjects(absensiSheet);
        const existing = allAbsensi.find(function (a) { return a.ID_Kegiatan === idKegiatan && a.ID_Warga === idWarga; });
        const waktu = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

        if (existing) {
          if (existing.Status === status) {
            result = { duplikat: true, nama: warga.Nama, waktu: existing.Waktu, status: existing.Status };
            break;
          }
          updateRowById(absensiSheet, existing.ID, { Status: status, Waktu: waktu });
          result = { duplikat: false, updated: true, nama: warga.Nama, waktu: waktu, status: status };
        } else {
          const id = generateId('ABS');
          appendRowByHeaders(absensiSheet, {
            ID: id, ID_Kegiatan: idKegiatan, ID_Warga: idWarga, Nama: warga.Nama, Waktu: waktu, Status: status
          });
          result = { duplikat: false, nama: warga.Nama, waktu: waktu, status: status };
        }

        if (status === 'Hadir') {
          const kegiatan = sheetToObjects(sheetKegiatan()).find(function (k) { return k.ID === idKegiatan; });
          const namaKegiatan = kegiatan ? kegiatan.Nama : idKegiatan;
          sendWhatsAppNotif('✅ Absensi Baru\nKegiatan: ' + namaKegiatan + '\nNama: ' + warga.Nama + '\nStatus: Hadir\nWaktu: ' + waktu);
        }
        break;
      }

      // Rekap Hadir / Ijin / Tidak Hadir untuk satu kegiatan, dihitung dari
      // seluruh data Warga dibandingkan data Absensi kegiatan tsb.
      case 'getRekapKehadiran': {
        const idKegiatan = params.id_kegiatan;
        if (!idKegiatan) throw new Error('id_kegiatan wajib diisi');
        const allWarga = sheetToObjects(sheetWarga());
        const absensiKegiatan = sheetToObjects(sheetAbsensi()).filter(function (a) { return a.ID_Kegiatan === idKegiatan; });
        const mapAbsen = {};
        absensiKegiatan.forEach(function (a) { mapAbsen[a.ID_Warga] = a; });

        const hadirList = [], ijinList = [], tidakHadirList = [];
        allWarga.forEach(function (w) {
          const rec = mapAbsen[w.ID];
          if (rec && rec.Status === 'Hadir') hadirList.push(w);
          else if (rec && rec.Status === 'Ijin') ijinList.push(w);
          else tidakHadirList.push(w);
        });

        result = {
          totalWarga: allWarga.length,
          hadir: hadirList.length,
          ijin: ijinList.length,
          tidakHadir: tidakHadirList.length,
          tidakHadirList: tidakHadirList
        };
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
