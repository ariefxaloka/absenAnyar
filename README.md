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

## Struktur Data Warga (Terbaru)

Setiap warga sekarang punya alamat terstruktur, bukan teks bebas:

- **Nama Rumah** (dropdown): `JOLIN` atau `PIRES`
- **Blok Rumah** (dropdown, tergantung Nama Rumah):
  - JOLIN → hanya `F`, `G`
  - PIRES → hanya `A`, `B`, `C`, `D`, `E`
- **No. Rumah** (teks bebas)

Validasi Blok Rumah vs Nama Rumah dicek di **backend** (bukan cuma di form), jadi data tidak bisa "nyasar" biarpun request dikirim manual.

### Migrasi dari versi lama (kolom RT/RW/Alamat)

Kalau spreadsheet kamu sudah pernah dipakai dengan skema lama:
1. Tempel ulang `Code.gs` terbaru ke Apps Script, **Deploy > New version**.
2. Di editor Apps Script, pilih fungsi **`migrateWargaSheet`** dari dropdown, klik **Run ▶️**.
3. Ini mengganti nama kolom `RT`→`NamaRumah`, `RW`→`BlokRumah`, `Alamat`→`NoRumah` **tanpa menghapus data lama**.
4. **Penting**: isi lama di kolom tsb (misal RT berisi angka "01") tidak otomatis berubah jadi `JOLIN`/`PIRES` — sesuaikan manual langsung di sheet untuk data lama.

## Fitur Baru — Menu Warga & QR
- Tabel warga sekarang menampilkan **nomor urut**, kolom **Rumah** (Nama Rumah + Blok + No. Rumah gabungan), dan aksi **Edit** / **Hapus** per baris.
- **Hapus massal**: centang beberapa baris (atau centang semua lewat header), lalu klik **Hapus Terpilih**.
- **Filter**: cari nama, atau filter berdasarkan Nama Rumah dan/atau Blok — kombinasi keduanya bisa dipakai sekaligus.

## Fitur Baru — Menu Scan Absensi
- Selain **Hadir** (lewat scan kamera), sekarang ada status **Ijin** — ditandai manual lewat form "Tandai manual" (pilih warga + pilih status Ijin/Hadir tanpa perlu scan).
- **Tidak Hadir** dihitung otomatis: total warga di database dikurangi yang sudah tercatat Hadir/Ijin untuk kegiatan yang sedang dipilih. Ditampilkan sebagai kartu ringkasan (Hadir / Ijin / Tidak Hadir) yang update real-time setiap ada scan/tandai baru, plus daftar nama yang belum tercatat (bisa dibuka lewat "Lihat daftar Tidak Hadir").
- Kalau warga yang sudah ditandai Ijin ternyata datang dan di-scan, statusnya otomatis diperbarui jadi Hadir.

## Fitur Baru — Menu Laporan
- Kolom **Nama** sekarang menampilkan alamat (Nama Rumah, Blok, No. Rumah) di bawah nama, dengan huruf lebih kecil & warna abu-abu supaya beda dari nama.
- Kartu ringkasan Hadir / Ijin / Tidak Hadir juga muncul di sini, dan Export CSV kini menyertakan kolom Nama Rumah, Blok, dan No. Rumah.
- **Tombol Export PDF**: membuat laporan absensi dalam bentuk PDF (nama file `Kegiatan_yyyyMMdd_HHmmss.pdf`) dan langsung diunduh browser — **tidak** disimpan ke Google Drive, cuma dibuat sementara lalu dikirim ke kamu sebagai file unduhan.
- Kalau kegiatan sudah berstatus **Selesai** (lewat jam selesai), tabel laporan (dan PDF-nya) otomatis menambahkan baris warga yang **Tidak Hadir**, dihitung dari total warga dikurangi yang sudah Hadir/Ijin.

## Fitur Baru — Format Tanggal Indonesia
Semua tanggal di aplikasi (tabel Kegiatan, log scan, laporan, dsb.) ditampilkan format **"Hari, Tanggal Bulan Tahun"**, contoh: `Senin, 8 Agustus 2026`. Untuk data yang menyertakan jam (log absensi), formatnya jadi `Senin, 8 Agustus 2026 10:15`.

## Fitur Baru — Sinkronisasi Otomatis (tanpa refresh/logout)
Aplikasi mengecek data terbaru setiap **12 detik** secara otomatis selama kamu login:
- Dropdown **"Pilih Warga"** di menu Scan Absensi selalu ikut ter-update kalau ada warga baru/diubah/dihapus, walau kamu sedang di tab lain.
- Tab yang sedang aktif (Kegiatan, Warga, Scan, Laporan) ikut menyegarkan datanya sendiri secara diam-diam, tanpa mengganggu form yang sedang kamu isi atau filter yang sedang kamu pakai.

## Fitur Baru — Menu Kegiatan
- Field baru **Jam Mulai** & **Jam Selesai** — status kegiatan dihitung otomatis dari kombinasi Tanggal + rentang jam ini:
  - Sebelum Jam Mulai → **Terjadwal**
  - Di antara Jam Mulai s/d Jam Selesai → **Aktif**
  - Setelah Jam Selesai → **Selesai**
  - Status ini **tidak disimpan statis** di sheet, jadi selalu akurat tiap kali dibuka (termasuk lewat sinkronisasi otomatis di atas).
- Tabel sekarang punya **nomor urut**, tombol **Edit**, **Hapus** per baris, dan tombol **Hapus Semua**.
- Menghapus kegiatan (satu atau semua) otomatis ikut menghapus seluruh data absensi yang terkait kegiatan tsb (mencegah data "yatim").

## Fitur Baru — Menu Folder QR & Simpan QR ke Google Drive
- Menu utama baru **"Folder QR"**: masukkan ID folder Google Drive tujuan (disalin dari URL folder), klik Simpan.
- Di tabel Warga, tombol **"Simpan Drive"** per baris membuat QR + PDF berlabel *Nama Rumah Blok No. Rumah* di atas QR, lalu menyimpannya ke folder tsb. Nama file: `QR_NamaRumah_Blok_NoRumah.pdf` (contoh: `QR_JOLIN_F_12.pdf`).
- Kalau file dengan nama sama sudah ada di folder, file lama otomatis **dibuang dan diganti** (rewrite), bukan menumpuk jadi duplikat.
- Tombol **"Simpan Semua QR ke Drive"** di atas tabel Warga memproses seluruh warga sekaligus (laporan sukses/gagal ditampilkan setelah selesai — untuk jumlah warga sangat banyak, proses ini bisa memakan beberapa menit karena batas eksekusi Apps Script per panggilan ±6 menit).
- **Menghapus warga** (satu, terpilih, atau lewat aksi lain) otomatis ikut menghapus file QR PDF-nya di Google Drive, supaya tidak ada file "nyasar".

### Izin akses tambahan yang perlu di-otorisasi ulang
Karena ada fitur baru yang memakai Google Drive & Google Docs (simpan QR, buat laporan PDF), saat re-deploy kamu akan diminta **otorisasi ulang** dengan izin tambahan (Drive & Docs). Ini normal — cukup ikuti alur "Advanced > Go to (nama project) > Allow" seperti sebelumnya.


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

## Troubleshooting

### Sheet `Warga`/`Kegiatan`/`Absensi` tidak muncul otomatis

Sheet dibuat **otomatis saat pertama kali ada aksi berhasil** (misal buka tab Kegiatan setelah login). Kalau setelah dicoba tetap tidak muncul:

1. **Uji langsung di editor Apps Script** (tanpa lewat web app dulu):
   - Buka project Apps Script kamu.
   - Di dropdown pilih fungsi **`setupSheets`**, lalu klik **Run ▶️**.
   - Kalau berhasil, cek spreadsheet kamu — 3 sheet baru harus langsung muncul.
   - Kalau muncul error, baca pesannya di **Execution log** (menu View > Logs).

2. **Penyebab paling sering**: script dibuat sebagai project **berdiri sendiri** (New Project langsung dari [script.google.com](https://script.google.com)), bukan lewat **Extensions > Apps Script** *di dalam* Google Sheets yang ingin dipakai sebagai database. Akibatnya `SpreadsheetApp.getActiveSpreadsheet()` tidak tahu spreadsheet mana yang dimaksud.
   - **Solusi termudah**: hapus project itu, lalu buka Google Sheets kamu, pilih **Extensions > Apps Script** dari dalam Sheet tsb, baru tempel ulang kode.
   - **Solusi alternatif** (kalau ingin tetap pakai project berdiri sendiri): buka spreadsheet target, salin ID-nya dari URL (`.../d/`**`ID_INI`**`/edit`), lalu di Apps Script buka **Project Settings > Script Properties**, tambahkan key `SPREADSHEET_ID` dengan value ID tsb.

3. **Setelah menjalankan `setupSheets` manual**, kamu tetap perlu **Deploy ulang** (Deploy > Manage deployments > Edit ✏️ > New version) supaya Web App memakai kode terbaru, lalu coba lagi dari aplikasi web.

### Stuck di layar login walau PIN sudah benar (Script Properties sudah diset)

Ini bug arsitektur Apps Script, sudah diperbaiki di versi kode ini — tapi kalau kamu masih pakai kode versi lama, ini penyebabnya:

URL Web App Apps Script (`.../exec`) selalu me-**redirect (302)** ke `script.googleusercontent.com`. Sesuai spesifikasi `fetch()` browser, kalau request awalnya **POST**, redirect 302 membuat browser **mengubah method jadi GET dan membuang body**-nya. Karena PIN & action dulunya dikirim lewat body POST, data itu hilang sebelum sampai ke server — jadi PIN selalu dianggap salah walau kamu ketik dengan benar.

**Solusinya (sudah diterapkan)**: semua request — baik baca (list kegiatan/warga) maupun tulis (tambah warga, tambah kegiatan, absen, login) — sekarang memakai **GET** dengan data di query string. GET tidak kena masalah downgrade method saat redirect, jadi jauh lebih andal.

Kalau kamu meng-copy ulang `Code.gs` dan `app.js` versi terbaru ini:
1. Tempel ulang `Code.gs` ke editor Apps Script.
2. **Deploy > Manage deployments > Edit ✏️ > New version** (wajib, atau perubahan tidak aktif).
3. Ganti `app.js` di project Vercel kamu, lalu redeploy.
4. Coba login lagi.

### Apakah `index.html` perlu dimasukkan ke Apps Script?

**Tidak.** Apps Script hanya berperan sebagai backend/API — cukup berisi `Code.gs`, tidak ada file HTML sama sekali di sana. `index.html` dan `app.js` murni untuk **Vercel** (frontend). Alurnya:

```
Browser  →  index.html + app.js (hosting di Vercel)
              │  fetch() ke URL Apps Script
              ▼
         Code.gs (Web App Apps Script)  →  Google Sheets (database)
```

Dua project ini sepenuhnya terpisah — satu-satunya "penghubung" adalah URL Web App Apps Script yang kamu tempel ke `CONFIG.APP_SCRIPT_URL` di `app.js`.

### Muncul error "PIN salah atau sesi tidak valid"
- Pastikan `ADMIN_PIN` di Script Properties sama persis dengan PIN yang kamu ketik di layar login.
- Kalau baru saja mengganti `ADMIN_PIN`, PIN lama yang tersimpan di browser (localStorage) jadi tidak valid — klik **Keluar** lalu login ulang dengan PIN baru.

### Muncul error "Folder tidak ditemukan atau tidak bisa diakses" saat setup Folder QR
- Pastikan ID folder yang ditempel benar (bukan URL lengkap — cuma bagian ID setelah `/folders/`).
- Pastikan folder tsb bisa diakses oleh akun Google yang dipakai untuk deploy Apps Script (folder di My Drive akun sendiri, atau folder shared yang sudah kamu buka aksesnya).

### Simpan QR ke Drive gagal / lambat untuk banyak warga
- Apps Script punya batas eksekusi ±6 menit per pemanggilan. Kalau warga sangat banyak (ratusan), tombol "Simpan Semua QR ke Drive" bisa timeout. Solusinya: simpan bertahap lewat tombol "Simpan Drive" per baris, atau bagi proses dalam beberapa kali klik.

## Pengembangan lanjutan (opsional)
- Tambah foto warga saat daftar (disimpan ke Google Drive via Apps Script).
- PIN berbeda per peran (mis. PIN admin vs PIN panitia scan-only) dengan menambah level akses di `checkPin`.
- Notifikasi Telegram sebagai alternatif/tambahan WhatsApp.

## Catatan Keamanan
- PIN dikirim di setiap request (termasuk sebagai query param saat GET), jadi pastikan PIN tidak sama dengan PIN penting lain milik pengurus, dan ganti berkala.
- Karena ini aplikasi skala RT, PIN bersifat "shared secret" sederhana — bukan otentikasi tingkat enterprise. Cukup untuk mencegah orang iseng mengubah data, tapi URL Web App & PIN tetap sebaiknya hanya dibagikan ke pengurus terpercaya.
