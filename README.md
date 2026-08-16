# Absensi RT — QR Code (Google Apps Script + Vercel)

Aplikasi absensi kegiatan RT berbasis QR Code.
- **Database & API**: Google Sheets + Google Apps Script (gratis, tidak perlu server sendiri)
- **Frontend**: HTML/JS statis di-hosting di Vercel, komunikasi ke API via `fetch()`
- **Scan QR**: kamera HP/laptop (library `html5-qrcode`)
- **Generate QR**: otomatis per warga (library `qrcode`), bisa diunduh/dicetak

## Struktur folder
```
absensi-rt/
├── apps-script/
│   └── Code.gs        # tempel ke Google Apps Script
└── webapp/
    ├── index.html      # deploy ke Vercel
    ├── app.js
    └── vercel.json
```

## LANGKAH 1 — Setup Backend (Google Apps Script)

1. Buka [Google Sheets](https://sheets.new), buat spreadsheet baru (boleh kosong), beri nama misalnya **"Database Absensi RT"**.
2. Menu **Extensions > Apps Script**.
3. Hapus semua isi editor, lalu **copy-paste seluruh isi file `apps-script/Code.gs`** ke sana.
4. Klik **Deploy > New deployment**.
   - Klik ikon gerigi ⚙️ di "Select type" → pilih **Web app**.
   - **Execute as**: *Me (email kamu)*
   - **Who has access**: *Anyone*
5. Klik **Deploy**, lalu **Authorize access** (izinkan akun Google kamu — akan muncul warning "Google hasn't verified this app", klik *Advanced > Go to (nama project) > Allow*, ini normal untuk skrip pribadi).
6. Setelah deploy sukses, **salin URL Web App** — bentuknya seperti:
   `https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec`
7. Sheet `Warga`, `Kegiatan`, `Absensi` akan otomatis dibuat saat pertama kali API dipanggil.

> Catatan: setiap kali kamu **mengedit ulang** Code.gs, kamu harus **Deploy > Manage deployments > Edit (pensil) > New version** agar perubahan aktif di URL yang sama.

## LANGKAH 1B — Atur PIN Admin & Notifikasi WhatsApp (opsional tapi disarankan)

Di editor Apps Script, klik ikon **⚙️ Project Settings** di sidebar kiri, scroll ke **Script Properties**, klik **Add script property**, lalu tambahkan:

| Property    | Value                          | Wajib? |
|-------------|----------------------------------|--------|
| `ADMIN_PIN` | PIN pilihanmu, mis. `246810`      | Disarankan (default `000000` jika tidak diisi) |
| `WA_TOKEN`  | Token API dari [fonnte.com](https://fonnte.com) | Opsional — untuk notifikasi WA |
| `WA_TARGET` | Nomor WA/ID grup pengurus RT, mis. `6281234567890` | Opsional — wajib diisi bersama `WA_TOKEN` |

- **PIN** ini dipakai untuk layar login di aplikasi — dibagikan hanya ke pengurus/panitia RT yang berwenang mengelola data & scan absensi.
- **Notifikasi WhatsApp**: kalau `WA_TOKEN` & `WA_TARGET` diisi, setiap ada warga yang berhasil absen, pesan otomatis terkirim ke nomor/grup WA tsb (format: nama kegiatan, nama warga, waktu). Kalau tidak diisi, fitur ini otomatis dilewati tanpa error — aplikasi tetap jalan normal.
- Fonnte punya free trial; alternatif lain (Wablas, Woowa, dsb.) juga bisa dipakai — cukup sesuaikan endpoint & payload di fungsi `sendWhatsAppNotif` pada `Code.gs`.

## LANGKAH 2 — Hubungkan Frontend ke Backend

Buka `webapp/app.js`, ganti baris paling atas:

```js
const CONFIG = {
  APP_SCRIPT_URL: 'PASTE_URL_WEB_APP_APPS_SCRIPT_DI_SINI'
};
```

dengan URL Web App dari Langkah 1.

## LANGKAH 3 — Deploy Frontend ke Vercel

**Opsi A — via Vercel CLI (paling cepat)**
```bash
cd webapp
npx vercel --prod
```
Ikuti instruksi login, pilih folder `webapp` sebagai project root. Karena ini situs statis murni, Vercel tidak butuh build command apa pun.

**Opsi B — via GitHub**
1. Push folder `webapp/` ini ke repo GitHub.
2. Buka [vercel.com/new](https://vercel.com/new), import repo tsb.
3. Framework preset: **Other** (tidak perlu build command / output directory khusus, karena `index.html` ada di root).
4. Deploy.

Setelah selesai, kamu akan dapat URL seperti `https://absensi-rt.vercel.app`.

## Cara Pakai Aplikasi

0. **Login** — buka aplikasi, masukkan PIN pengurus (yang diatur di Langkah 1B) untuk masuk. Sesi tersimpan di browser sampai kamu klik **Keluar**.
1. **Tab Kegiatan** — buat kegiatan (mis. "Kerja Bakti Agustus", tanggal, lokasi).
2. **Tab Warga & QR** — daftarkan warga satu per satu. Setiap warga otomatis punya QR Code unik (isi QR = ID warga). Klik **"Lihat QR"** untuk mengunduh PNG-nya, lalu cetak/bagikan ke warga (misal ditempel di kartu warga atau dikirim via WhatsApp).
3. **Tab Scan Absensi** — saat acara berlangsung, panitia buka tab ini di HP, pilih kegiatan yang sedang berjalan, klik **Mulai Kamera**, lalu scan QR tiap warga yang datang. Sistem otomatis mencatat waktu hadir dan mencegah absen dobel.
4. **Tab Laporan** — pilih kegiatan untuk melihat rekap kehadiran, dan bisa **Export CSV** untuk arsip RT.

## Kenapa arsitekturnya begini?

- **Google Sheets sebagai database**: gratis, mudah diaudit langsung oleh pengurus RT tanpa perlu tools tambahan, dan Apps Script Web App berfungsi sebagai REST API sederhana di atasnya.
- **Vercel untuk frontend**: hosting statis cepat & gratis, cocok untuk halaman scan QR yang perlu diakses banyak panitia dari HP masing-masing dengan koneksi HTTPS (wajib untuk akses kamera browser).
- **Kenapa POST pakai `text/plain`?** Google Apps Script tidak menangani *preflight request* (`OPTIONS`) yang otomatis dikirim browser saat `Content-Type: application/json`. Dengan mengirim sebagai `text/plain`, browser menganggapnya "simple request" sehingga tidak ada preflight, dan datanya tetap di-parse sebagai JSON di sisi server.

## Pengembangan lanjutan (opsional)
- Tambah foto warga saat daftar (disimpan ke Google Drive via Apps Script).
- PIN berbeda per peran (mis. PIN admin vs PIN panitia scan-only) dengan menambah level akses di `checkPin`.
- Notifikasi Telegram sebagai alternatif/tambahan WhatsApp.

## Catatan Keamanan
- PIN dikirim di setiap request (termasuk sebagai query param saat GET), jadi pastikan PIN tidak sama dengan PIN penting lain milik pengurus, dan ganti berkala.
- Karena ini aplikasi skala RT, PIN bersifat "shared secret" sederhana — bukan otentikasi tingkat enterprise. Cukup untuk mencegah orang iseng mengubah data, tapi URL Web App & PIN tetap sebaiknya hanya dibagikan ke pengurus terpercaya.
