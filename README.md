# Commission Art — Supabase edition

Single-artist commission website built with Next.js, React, TypeScript, Supabase Postgres and Supabase Storage.

## Features
- Artist and customer accounts, sessions and role checks
- Service catalog, portfolio, orders, messages, reviews, coupons and studio settings stored in Supabase Postgres
- Supabase Storage for portfolio images, references, invoice email evidence, payment proofs, chat attachments and final delivery files
- Manual PayPal workflow: customer submits a reference and proof; the artist must verify receipt before the order is marked paid
- Checkout lets customers select PayPal or QRIS. QRIS is not connected to a payment provider in this build, so the site does not generate a fake payment QR or mark QRIS orders paid.
- Currency display settings (USD/IDR)

## Setup
1. In Supabase, open SQL Editor and run `supabase/setup.sql`. This creates the required tables and storage buckets and seeds the starter catalog, studio settings and starter accounts without replacing existing rows.
2. Copy `.env.example` to `.env.local` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` using your project's URL and server-side secret key. Never use the secret key in a `NEXT_PUBLIC_` variable or expose it in browser code.
3. Install dependencies: `npm install`.
4. Run locally: `npm run dev`, then open `http://localhost:3000`.
5. Before production use, change the starter account passwords or remove the starter customer account.

## Starter accounts
- Artist: `artist@commissionart.com` / `artist123`
- Customer: `customer@commissionart.com` / `customer123`

These are starter credentials and should be changed before public use.

## Vercel deployment
1. Push this project to a private GitHub repository. Make sure `.env.local` is not committed.
2. Import the repository into Vercel.
3. In Vercel → Project Settings → Environment Variables, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for Production (and Preview if needed).
4. Deploy. If environment variables are changed later, redeploy the project.
5. Test login, registration, service catalog, order creation, chat, uploads and final delivery on the deployed URL.

## Payments
PayPal is manual; the artist must independently verify the actual PayPal transaction. QRIS is a selectable method for workflow planning, but this build does not connect to a QRIS merchant or payment provider. It will clearly report that QRIS is not active and will not claim that a payment succeeded. To accept real QRIS payments, integrate a licensed payment provider and verify server-side payment notifications before marking orders as paid.

## Security
The application uses a server-only Supabase secret key, which bypasses table RLS. Do not expose this key to the browser, share it publicly, or commit it to source control. If the key was included in an uploaded archive or shared accidentally, rotate it in Supabase and update the local/Vercel environment variables.

## Catatan audit dan perbaikan

- Penyimpanan daftar service/portfolio/review kini menyelaraskan baris yang dihapus dari daftar yang dikirim artist, sehingga item yang dihapus tidak muncul kembali setelah refresh. Sinkronisasi penghapusan ini tidak diterapkan ke tabel pesanan.
- Preview file final juga mengenali tipe gambar dari nama file, karena URL file privat `/api/file` tidak selalu berakhiran ekstensi gambar.
- Referensi pelanggan saat ini disimpan pada bucket `portfolio` yang publik karena alur UI memakai URL publik. Artinya, siapa pun yang memperoleh URL dapat membuka gambar referensi. Jika referensi bersifat sensitif, diperlukan migrasi ke bucket privat dan signed URL sebelum penggunaan produksi.
- Build production dan alur upload end-to-end memerlukan dependency terpasang serta konfigurasi Supabase yang valid. Pengujian tersebut tidak dapat dinyatakan lulus hanya dari source code.

## Checklist sebelum deploy

1. Pastikan `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` diatur sebagai environment variables server pada hosting.
2. Pastikan SQL `supabase/setup.sql` sudah diterapkan pada project Supabase yang benar. Tinjau skrip sebelum menjalankannya dan jangan menghapus database lama.
3. Ganti atau hapus akun demo dan password bawaan sebelum membuka website ke publik.
4. Jalankan `npm ci`, lalu `npm run build` di lingkungan lokal atau CI.
5. Setelah deploy, uji pembuatan service, refresh katalog, request dengan gambar referensi, serta upload dan akses hasil final menggunakan akun customer dan artist.
