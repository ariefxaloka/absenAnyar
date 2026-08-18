/**
 * =========================================================
 *  ABSENSI RT - Backend (Google Apps Script + Google Sheets + Drive)
 * =========================================================
 *
 * Sheet yang dipakai (dibuat OTOMATIS saat pertama kali dipanggil):
 *  - Warga    : ID | Nama | NamaRumah | BlokRumah | NoRumah | NoHP | TanggalDaftar | QrUrl
 *  - Kegiatan : ID | Nama | Tanggal | JamMulai | JamSelesai | Lokasi
 *               (Status dihitung otomatis dari Tanggal+Jam, TIDAK disimpan statis)
 *  - Absensi  : ID | ID_Kegiatan | ID_Warga | Nama | Waktu | Status   (Hadir / Ijin)
 *
 * CARA DEPLOY:
 *  1. Buka Google Sheets yang ingin dipakai sebagai database.
 *  2. Extensions > Apps Script (WAJIB dari dalam Sheet ini).
 *  3. Hapus isi default, tempel SELURUH isi file ini.
 *  4. Deploy > New deployment > Type: Web app. Execute as: Me. Access: Anyone.
 *  5. Authorize akses (minta izin Google Drive & Google Docs untuk fitur QR/PDF).
 *  6. Salin Web App URL ke CONFIG.APP_SCRIPT_URL di webapp/app.js.
 *  7. Setiap ubah kode: Deploy > Manage deployments > Edit > New version.
 *
 * MIGRASI DARI VERSI LAMA:
 *  - migrateWargaSheet()    -> RT/RW/Alamat -> NamaRumah/BlokRumah/NoRumah, + tambah kolom QrUrl
 *  - migrateKegiatanSheet() -> tambah kolom JamMulai/JamSelesai
 *  Jalankan manual sekali (pilih fungsi di dropdown editor, klik Run ▶️).
 *
 * PASSWORD MENU FOLDER QR: default "4dmin54321", ganti lewat Script Properties
 * key FOLDER_QR_PASSWORD.
 *
 * CATATAN METODE HTTP: semua aksi (baca & tulis) lewat GET (query string),
 * bukan POST, karena redirect 302 Web App Apps Script membuang body POST.
 * =========================================================
 */

const SHEET_WARGA = 'Warga';
const SHEET_KEGIATAN = 'Kegiatan';
const SHEET_ABSENSI = 'Absensi';

const BLOK_OPTIONS = { JOLIN: ['F', 'G'], PIRES: ['A', 'B', 'C', 'D', 'E'] };
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatTanggalIndonesia(tanggalStr) {
  if (!tanggalStr) return '';
  const d = new Date(tanggalStr);
  if (isNaN(d.getTime())) return String(tanggalStr);
  return HARI_ID[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
}

// ---------------------- Spreadsheet helpers ----------------------
function getSS() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error(
    'Tidak menemukan Spreadsheet aktif. Pastikan script dibuat lewat Extensions > ' +
    'Apps Script DI DALAM Google Sheets, atau isi Script Properties "SPREADSHEET_ID".'
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
  return getOrCreateSheet(SHEET_WARGA, ['ID', 'Nama', 'NamaRumah', 'BlokRumah', 'NoRumah', 'NoHP', 'TanggalDaftar', 'QrUrl']);
}
function sheetKegiatan() {
  return getOrCreateSheet(SHEET_KEGIATAN, ['ID', 'Nama', 'Tanggal', 'JamMulai', 'JamSelesai', 'Lokasi']);
}
function sheetAbsensi() {
  return getOrCreateSheet(SHEET_ABSENSI, ['ID', 'ID_Kegiatan', 'ID_Warga', 'Nama', 'Waktu', 'Status']);
}

function setupSheets() {
  sheetWarga();
  sheetKegiatan();
  sheetAbsensi();
  Logger.log('Sheet Warga, Kegiatan, Absensi berhasil dibuat/dipastikan ada.');
}

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
  if (changed) sheet.getRange(1, 1, 1, lastCol).setValues([newHeaders]);
  let headers2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers2.indexOf('NoRumah') === -1) {
    sheet.getRange(1, headers2.length + 1).setValue('NoRumah');
    headers2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }
  if (headers2.indexOf('QrUrl') === -1) {
    sheet.getRange(1, headers2.length + 1).setValue('QrUrl');
  }
  Logger.log('Migrasi Warga selesai. Header saat ini: ' + sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].join(', '));
}

function migrateKegiatanSheet() {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEET_KEGIATAN);
  if (!sheet) { Logger.log('Sheet Kegiatan belum ada. Jalankan setupSheets() dulu.'); return; }
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('JamMulai') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('JamMulai');
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }
  if (headers.indexOf('JamSelesai') === -1) {
    sheet.getRange(1, headers.length + 1).setValue('JamSelesai');
  }
  Logger.log('Migrasi Kegiatan selesai. Header saat ini: ' + sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].join(', '));
}

// ---------------------- Generic row helpers ----------------------
// Google Sheets sering menyimpan input tanggal/jam sebagai objek Date internal.
// Kalau dibiarkan, JSON.stringify akan mengubahnya jadi ISO string mentah
// (mis. "2026-08-17T17:00:00.000Z") yang salah tampil di frontend. Fungsi ini
// mengonversi setiap nilai Date jadi string yang sudah diformat dengan benar,
// konsisten memakai timezone script (bukan UTC).
function normalizeCellValue(value) {
  if (!(value instanceof Date)) return value;
  const tz = Session.getScriptTimeZone();
  // Sel "jam saja" (mis. input type=time) disimpan Sheets dengan tanggal basis 1899-12-30
  if (value.getFullYear() === 1899) {
    return Utilities.formatDate(value, tz, 'HH:mm');
  }
  const jamBerarti = value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
  if (jamBerarti) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd HH:mm:ss');
  }
  return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
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
      headers.forEach(function (h, i) { obj[h] = normalizeCellValue(r[i]); });
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
    if (String(data[i][0]) === String(id)) return i + 1;
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

function clearAllDataRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
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

// Cek duplikat alamat (NamaRumah-BlokRumah-NoRumah). excludeId dipakai saat edit
// supaya warga tidak dianggap duplikat terhadap dirinya sendiri.
function checkDuplicateAlamat(namaRumah, blokRumah, noRumah, excludeId, existingList) {
  const all = existingList || sheetToObjects(sheetWarga());
  const nr = String(namaRumah || '').trim().toUpperCase();
  const bl = String(blokRumah || '').trim().toUpperCase();
  const no = String(noRumah || '').trim().toUpperCase();
  const dup = all.find(function (w) {
    if (excludeId && w.ID === excludeId) return false;
    return String(w.NamaRumah || '').trim().toUpperCase() === nr &&
           String(w.BlokRumah || '').trim().toUpperCase() === bl &&
           String(w.NoRumah || '').trim().toUpperCase() === no;
  });
  if (dup) {
    throw new Error('DUPLIKAT: Alamat ' + namaRumah + ' ' + blokRumah + ' No. ' + (noRumah || '-') + ' sudah terdaftar atas nama ' + dup.Nama);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------- Status Kegiatan (dinamis dari jam) ----------------------
function computeKegiatanStatus(tanggal, jamMulai, jamSelesai) {
  try {
    if (!tanggal) return 'Aktif';
    const startStr = (tanggal + ' ' + (jamMulai || '00:00') + ':00').replace(/-/g, '/');
    const endStr = (tanggal + ' ' + (jamSelesai || '23:59') + ':59').replace(/-/g, '/');
    const start = new Date(startStr);
    const end = new Date(endStr);
    const now = new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Aktif';
    if (now < start) return 'Terjadwal';
    if (now > end) return 'Selesai';
    return 'Aktif';
  } catch (e) {
    return 'Aktif';
  }
}

// ---------------------- LOGIN ADMIN (PIN) ----------------------
function getAdminPin() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '000000';
}
function checkPin(pin) {
  return String(pin || '') === getAdminPin();
}

// Password khusus menu Folder QR (lapisan kedua, terpisah dari PIN utama)
function getFolderPassword() {
  return PropertiesService.getScriptProperties().getProperty('FOLDER_QR_PASSWORD') || '4dmin54321';
}

// ---------------------- NOTIFIKASI WHATSAPP (opsional) ----------------------
function sendWhatsAppNotif(pesan) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('WA_TOKEN');
  const target = props.getProperty('WA_TARGET');
  if (!token || !target) return;
  try {
    UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method: 'post', headers: { Authorization: token },
      payload: { target: target, message: pesan }, muteHttpExceptions: true
    });
  } catch (e) { /* jangan sampai gagal WA menggagalkan absensi */ }
}

// ---------------------- FOLDER QR (Google Drive) ----------------------
function getDriveFolderId() {
  return PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID') || '';
}

function qrPdfFileName(warga) {
  return 'QR_' + (warga.NamaRumah || '-') + '_' + (warga.BlokRumah || '-') + '_' + (warga.NoRumah || '-') + '.pdf';
}

// Buat QR + PDF (QR & label rata TENGAH, ada ikon rumah) lalu simpan ke folder.
// Kalau file dengan nama sama sudah ada, file lama dibuang dulu (rewrite, bukan duplikat).
function generateWargaQrPdf(warga) {
  const folderId = getDriveFolderId();
  if (!folderId) throw new Error('Folder Google Drive belum diatur. Buka menu "Folder QR" untuk mengaturnya.');
  const folder = DriveApp.getFolderById(folderId);

  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(warga.ID);
  const qrResponse = UrlFetchApp.fetch(qrUrl, { muteHttpExceptions: true });
  if (qrResponse.getResponseCode() !== 200) throw new Error('Gagal membuat gambar QR untuk ' + warga.Nama);
  const qrBlob = qrResponse.getBlob().setName('qr.png');

  const label = '🏠 ' + (warga.NamaRumah || '-') + ' ' + (warga.BlokRumah || '-') + (warga.NoRumah ? ' No. ' + warga.NoRumah : '');
  const fileName = qrPdfFileName(warga);

  const doc = DocumentApp.create('TEMP_' + fileName);
  const body = doc.getBody();
  body.clear();

  const labelPara = body.appendParagraph(label);
  labelPara.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  labelPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  const img = body.appendImage(qrBlob);
  img.setWidth(250);
  img.setHeight(250);
  const imgParent = img.getParent();
  if (imgParent && imgParent.getType() === DocumentApp.ElementType.PARAGRAPH) {
    imgParent.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  }

  const namaPara = body.appendParagraph(warga.Nama || '');
  namaPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  doc.saveAndClose();

  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF).setName(fileName);

  const existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) { existing.next().setTrashed(true); }

  const savedFile = folder.createFile(pdfBlob);
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return { fileId: savedFile.getId(), fileUrl: savedFile.getUrl(), fileName: fileName };
}

function deleteWargaQrFile(warga) {
  const folderId = getDriveFolderId();
  if (!folderId || !warga) return;
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName(qrPdfFileName(warga));
    while (files.hasNext()) { files.next().setTrashed(true); }
  } catch (e) { /* jangan sampai gagal hapus file mengganggu hapus data warga */ }
}

// ---------------------- LAPORAN PDF (tidak disimpan permanen, langsung diunduh) ----------------------
function buildLaporanPdf(kegiatanNama, tanggalFormatted, rows) {
  const doc = DocumentApp.create('TEMP_LAPORAN_' + new Date().getTime());
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('Laporan Absensi - ' + kegiatanNama).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const tglPara = body.appendParagraph(tanggalFormatted);
  tglPara.editAsText().setItalic(true);
  body.appendParagraph(' ');

  const tableData = [['No', 'Nama', 'Alamat', 'Waktu', 'Status']];
  rows.forEach(function (r, i) { tableData.push([String(i + 1), r.nama, r.alamat, r.waktu, r.status]); });
  const table = body.appendTable(tableData);
  const headerRow = table.getRow(0);
  for (let c = 0; c < headerRow.getNumCells(); c++) headerRow.getCell(c).editAsText().setBold(true);

  doc.saveAndClose();
  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return pdfBlob;
}

// ---------------------- Cascade delete ----------------------
function cascadeDeleteAbsensiByKegiatan(idKegiatan) {
  const sheet = sheetAbsensi();
  const ids = sheetToObjects(sheet).filter(function (a) { return a.ID_Kegiatan === idKegiatan; }).map(function (a) { return a.ID; });
  ids.forEach(function (id) { deleteRowById(sheet, id); });
}

// ---------------------- ROUTER ----------------------
function doGet(e) { return handleRequest(e.parameter); }

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
    if (!checkPin(params.pin)) return json({ ok: false, error: 'PIN salah atau sesi tidak valid' });

    let result;

    switch (action) {
      // ---------------- WARGA ----------------
      case 'getWarga':
        result = sheetToObjects(sheetWarga());
        break;

      case 'addWarga': {
        const sheet = sheetWarga();
        const namaRumah = params.namaRumah || '';
        const blokRumah = params.blokRumah || '';
        validateBlok(namaRumah, blokRumah);
        checkDuplicateAlamat(namaRumah, blokRumah, params.noRumah, null);

        const id = generateId('WRG');
        appendRowByHeaders(sheet, {
          ID: id, Nama: params.nama || '', NamaRumah: namaRumah, BlokRumah: blokRumah,
          NoRumah: params.noRumah || '', NoHP: params.nohp || '',
          TanggalDaftar: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
          QrUrl: ''
        });

        let qrSaved = false, qrUrl = '';
        try {
          const saved = generateWargaQrPdf({ ID: id, Nama: params.nama || '', NamaRumah: namaRumah, BlokRumah: blokRumah, NoRumah: params.noRumah || '' });
          updateRowById(sheet, id, { QrUrl: saved.fileUrl });
          qrSaved = true; qrUrl = saved.fileUrl;
        } catch (e) { /* folder belum diatur - warga tetap tersimpan, QR bisa dibuat manual nanti */ }

        result = { id: id, qrSaved: qrSaved, qrUrl: qrUrl };
        break;
      }

      case 'updateWarga': {
        if (!params.id) throw new Error('id wajib diisi');
        const namaRumah = params.namaRumah || '';
        const blokRumah = params.blokRumah || '';
        validateBlok(namaRumah, blokRumah);
        checkDuplicateAlamat(namaRumah, blokRumah, params.noRumah, params.id);

        const sheet = sheetWarga();
        const oldWarga = sheetToObjects(sheet).find(function (w) { return w.ID === params.id; });

        updateRowById(sheet, params.id, {
          Nama: params.nama || '', NamaRumah: namaRumah, BlokRumah: blokRumah,
          NoRumah: params.noRumah || '', NoHP: params.nohp || ''
        });

        const newWarga = { ID: params.id, Nama: params.nama || '', NamaRumah: namaRumah, BlokRumah: blokRumah, NoRumah: params.noRumah || '' };
        let qrSaved = false, qrUrl = '';
        try {
          if (oldWarga && qrPdfFileName(oldWarga) !== qrPdfFileName(newWarga)) {
            deleteWargaQrFile(oldWarga);
          }
          const saved = generateWargaQrPdf(newWarga);
          updateRowById(sheet, params.id, { QrUrl: saved.fileUrl });
          qrSaved = true; qrUrl = saved.fileUrl;
        } catch (e) { /* folder belum diatur - lanjut tanpa memperbarui QR */ }

        result = { id: params.id, qrSaved: qrSaved, qrUrl: qrUrl };
        break;
      }

      case 'deleteWarga': {
        const sheet = sheetWarga();
        const warga = sheetToObjects(sheet).find(function (w) { return w.ID === params.id; });
        const ok = deleteRowById(sheet, params.id);
        if (!ok) throw new Error('Warga tidak ditemukan');
        if (warga) deleteWargaQrFile(warga);
        result = { deleted: true };
        break;
      }

      case 'deleteWargaMultiple': {
        const ids = String(params.ids || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        const sheet = sheetWarga();
        const allWarga = sheetToObjects(sheet);
        let count = 0;
        ids.forEach(function (id) {
          const warga = allWarga.find(function (w) { return w.ID === id; });
          if (deleteRowById(sheet, id)) {
            count++;
            if (warga) deleteWargaQrFile(warga);
          }
        });
        result = { deleted: count };
        break;
      }

      // Import massal dari CSV. data = JSON string array of {nama,namaRumah,blokRumah,noRumah}
      case 'importWarga': {
        let records;
        try { records = JSON.parse(params.data || '[]'); } catch (e) { throw new Error('Format data import tidak valid'); }
        if (!Array.isArray(records)) throw new Error('Format data import tidak valid');

        const sheet = sheetWarga();
        const existing = sheetToObjects(sheet);
        let imported = 0, skipped = 0, gagal = 0;
        const errors = [];

        records.forEach(function (r) {
          try {
            const nama = (r.nama || '').toString().trim();
            const namaRumah = (r.namaRumah || '').toString().trim().toUpperCase();
            const blokRumah = (r.blokRumah || '').toString().trim().toUpperCase();
            const noRumah = (r.noRumah || '').toString().trim();

            if (!nama || !namaRumah || !blokRumah) { gagal++; errors.push((nama || '(tanpa nama)') + ': data tidak lengkap'); return; }
            validateBlok(namaRumah, blokRumah);

            const isDup = existing.some(function (w) {
              return String(w.NamaRumah || '').toUpperCase() === namaRumah &&
                     String(w.BlokRumah || '').toUpperCase() === blokRumah &&
                     String(w.NoRumah || '').trim().toUpperCase() === noRumah.toUpperCase();
            });
            if (isDup) { skipped++; return; }

            const id = generateId('WRG');
            appendRowByHeaders(sheet, {
              ID: id, Nama: nama, NamaRumah: namaRumah, BlokRumah: blokRumah, NoRumah: noRumah,
              NoHP: '', TanggalDaftar: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), QrUrl: ''
            });
            existing.push({ ID: id, Nama: nama, NamaRumah: namaRumah, BlokRumah: blokRumah, NoRumah: noRumah });

            try {
              const saved = generateWargaQrPdf({ ID: id, Nama: nama, NamaRumah: namaRumah, BlokRumah: blokRumah, NoRumah: noRumah });
              updateRowById(sheet, id, { QrUrl: saved.fileUrl });
            } catch (eQr) { /* folder mungkin belum diatur, lanjutkan tanpa QR */ }

            imported++;
          } catch (eRow) {
            gagal++;
            errors.push((r.nama || '(tanpa nama)') + ': ' + eRow.message);
          }
        });

        result = { imported: imported, skipped: skipped, gagal: gagal, errors: errors };
        break;
      }

      // ---------------- FOLDER QR ----------------
      case 'checkFolderPassword': {
        if (String(params.password || '') !== getFolderPassword()) throw new Error('Password salah');
        result = { ok: true };
        break;
      }

      case 'setFolderId': {
        const folderId = String(params.folderId || '').trim();
        if (!folderId) throw new Error('ID Folder wajib diisi');
        let folderName;
        try { folderName = DriveApp.getFolderById(folderId).getName(); }
        catch (e) { throw new Error('Folder tidak ditemukan / tidak bisa diakses. Cek ID dan pastikan akun ini punya akses.'); }
        PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_ID', folderId);
        result = { folderId: folderId, folderName: folderName };
        break;
      }

      case 'getFolderId': {
        const folderId = getDriveFolderId();
        let folderName = '';
        if (folderId) {
          try { folderName = DriveApp.getFolderById(folderId).getName(); }
          catch (e) { folderName = '(folder tidak ditemukan)'; }
        }
        result = { folderId: folderId, folderName: folderName };
        break;
      }

      case 'generateQrPdf': {
        const warga = sheetToObjects(sheetWarga()).find(function (w) { return w.ID === params.id_warga; });
        if (!warga) throw new Error('Warga tidak ditemukan');
        const saved = generateWargaQrPdf(warga);
        updateRowById(sheetWarga(), warga.ID, { QrUrl: saved.fileUrl });
        result = saved;
        break;
      }

      case 'generateAllQrPdf': {
        const sheet = sheetWarga();
        const allWarga = sheetToObjects(sheet);
        let sukses = 0, gagal = 0;
        const errors = [];
        allWarga.forEach(function (w) {
          try {
            const saved = generateWargaQrPdf(w);
            updateRowById(sheet, w.ID, { QrUrl: saved.fileUrl });
            sukses++;
          } catch (e) { gagal++; errors.push(w.Nama + ': ' + e.message); }
        });
        result = { sukses: sukses, gagal: gagal, errors: errors };
        break;
      }

      // ---------------- KEGIATAN ----------------
      case 'getKegiatan': {
        const data = sheetToObjects(sheetKegiatan());
        result = data.map(function (k) {
          k.Status = computeKegiatanStatus(k.Tanggal, k.JamMulai, k.JamSelesai);
          return k;
        });
        break;
      }

      case 'addKegiatan': {
        const id = generateId('KEG');
        appendRowByHeaders(sheetKegiatan(), {
          ID: id, Nama: params.nama || '', Tanggal: params.tanggal || '',
          JamMulai: params.jamMulai || '', JamSelesai: params.jamSelesai || '', Lokasi: params.lokasi || ''
        });
        result = { id: id };
        break;
      }

      case 'updateKegiatan': {
        if (!params.id) throw new Error('id wajib diisi');
        updateRowById(sheetKegiatan(), params.id, {
          Nama: params.nama || '', Tanggal: params.tanggal || '',
          JamMulai: params.jamMulai || '', JamSelesai: params.jamSelesai || '', Lokasi: params.lokasi || ''
        });
        result = { id: params.id };
        break;
      }

      case 'deleteKegiatan': {
        const ok = deleteRowById(sheetKegiatan(), params.id);
        if (!ok) throw new Error('Kegiatan tidak ditemukan');
        cascadeDeleteAbsensiByKegiatan(params.id);
        result = { deleted: true };
        break;
      }

      case 'deleteAllKegiatan': {
        clearAllDataRows(sheetKegiatan());
        clearAllDataRows(sheetAbsensi());
        result = { deleted: true };
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
          appendRowByHeaders(absensiSheet, { ID: id, ID_Kegiatan: idKegiatan, ID_Warga: idWarga, Nama: warga.Nama, Waktu: waktu, Status: status });
          result = { duplikat: false, nama: warga.Nama, waktu: waktu, status: status };
        }

        if (status === 'Hadir') {
          const kegiatan = sheetToObjects(sheetKegiatan()).find(function (k) { return k.ID === idKegiatan; });
          const namaKegiatan = kegiatan ? kegiatan.Nama : idKegiatan;
          sendWhatsAppNotif('✅ Absensi Baru\nKegiatan: ' + namaKegiatan + '\nNama: ' + warga.Nama + '\nStatus: Hadir\nWaktu: ' + waktu);
        }
        break;
      }

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
          totalWarga: allWarga.length, hadir: hadirList.length, ijin: ijinList.length,
          tidakHadir: tidakHadirList.length, tidakHadirList: tidakHadirList
        };
        break;
      }

      case 'exportLaporanPdf': {
        const idKegiatan = params.id_kegiatan;
        if (!idKegiatan) throw new Error('id_kegiatan wajib diisi');
        const kegiatan = sheetToObjects(sheetKegiatan()).find(function (k) { return k.ID === idKegiatan; });
        if (!kegiatan) throw new Error('Kegiatan tidak ditemukan');

        const allWarga = sheetToObjects(sheetWarga());
        const wargaMap = {};
        allWarga.forEach(function (w) { wargaMap[w.ID] = w; });

        const absensiKegiatan = sheetToObjects(sheetAbsensi()).filter(function (a) { return a.ID_Kegiatan === idKegiatan; });
        const rows = absensiKegiatan.map(function (a) {
          const w = wargaMap[a.ID_Warga];
          const alamat = w ? ((w.NamaRumah || '') + ' ' + (w.BlokRumah || '') + (w.NoRumah ? ', No. ' + w.NoRumah : '')) : '';
          return { nama: a.Nama, alamat: alamat, waktu: a.Waktu, status: a.Status };
        });

        const status = computeKegiatanStatus(kegiatan.Tanggal, kegiatan.JamMulai, kegiatan.JamSelesai);
        if (status === 'Selesai') {
          const sudahTercatat = {};
          absensiKegiatan.forEach(function (a) { sudahTercatat[a.ID_Warga] = true; });
          allWarga.forEach(function (w) {
            if (!sudahTercatat[w.ID]) {
              const alamat = (w.NamaRumah || '') + ' ' + (w.BlokRumah || '') + (w.NoRumah ? ', No. ' + w.NoRumah : '');
              rows.push({ nama: w.Nama, alamat: alamat, waktu: '-', status: 'Tidak Hadir' });
            }
          });
        }

        const tanggalFormatted = formatTanggalIndonesia(kegiatan.Tanggal);
        const pdfBlob = buildLaporanPdf(kegiatan.Nama, tanggalFormatted, rows);
        const base64 = Utilities.base64Encode(pdfBlob.getBytes());
        const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
        const fileName = (kegiatan.Nama || 'Kegiatan').replace(/[^a-zA-Z0-9]+/g, '_') + '_' + stamp + '.pdf';

        result = { base64: base64, fileName: fileName };
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
