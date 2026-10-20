
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { currentUser } from '@/lib/session';

export const runtime = 'nodejs';

const json = (value: any, status = 200) =>
  NextResponse.json(value, { status });

const imageKinds = new Set([
  'asset',
  'profile',
  'catalog',
  'portfolio',
  'reference',
]);

const allowedImages = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const allowedDocuments = new Set([
  'application/pdf',
  'application/zip',
]);

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return json(
        { error: 'Login terlebih dahulu untuk mengunggah file.' },
        401
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    const kind = String(form.get('kind') || 'asset');
    const orderId = String(form.get('orderId') || '');

    if (!(file instanceof File)) {
      return json({ error: 'File tidak ditemukan.' }, 400);
    }

    if (file.size === 0) {
      return json({ error: 'File kosong. Pilih file lain.' }, 400);
    }

    if (file.size > 15 * 1024 * 1024) {
      return json({ error: 'Ukuran file maksimal 15 MB.' }, 413);
    }

    if (!imageKinds.has(kind) &&
        !['proof', 'delivery', 'chat', 'invoice-email'].includes(kind)) {
      return json({ error: 'Jenis upload tidak dikenal.' }, 400);
    }

    if (imageKinds.has(kind)) {
      if (!allowedImages.has(file.type)) {
        return json({
          error: 'Gunakan gambar PNG, JPG, WEBP, GIF, atau AVIF.',
        }, 415);
      }
    } else if (
      kind === 'proof' ||
      kind === 'delivery' ||
      kind === 'chat' ||
      kind === 'invoice-email'
    ) {
      if (!allowedImages.has(file.type) &&
          !allowedDocuments.has(file.type)) {
        return json({
          error: 'Jenis file tidak didukung.',
        }, 415);
      }
    }

    if (['asset', 'profile', 'catalog', 'portfolio'].includes(kind) &&
        user.role !== 'artist') {
      return json({
        error: 'Hanya artist yang boleh mengunggah aset katalog atau portofolio.',
      }, 403);
    }

    if (kind === 'reference' && user.role !== 'customer') {
      return json({
        error: 'Gambar referensi hanya dapat diunggah pelanggan.',
      }, 403);
    }

    let bucket = 'commission-private';
    let path = '';

    if (['proof', 'delivery', 'chat', 'invoice-email'].includes(kind)) {
      if (!orderId) {
        return json({ error: 'ID commission diperlukan.' }, 400);
      }

      const { data: row, error } = await supabase
        .from('orders')
        .select('user_id,data')
        .eq('id', orderId)
        .maybeSingle();

      if (error) {
        return json({ error: error.message }, 500);
      }

      if (!row) {
        return json({ error: 'Commission tidak ditemukan.' }, 404);
      }

      if (user.role !== 'artist' && row.user_id !== user.id) {
        return json({ error: 'Akses ditolak.' }, 403);
      }

      let order: any;

      try {
        order = JSON.parse(row.data);
      } catch {
        return json({ error: 'Data commission tidak valid.' }, 500);
      }

      if (kind === 'invoice-email' && user.role !== 'artist') {
        return json({
          error: 'Bukti email invoice hanya boleh diunggah artist.',
        }, 403);
      }

      if (kind === 'proof' &&
          (user.role !== 'customer' || row.user_id !== user.id)) {
        return json({
          error: 'Bukti pembayaran hanya boleh diunggah pemilik commission.',
        }, 403);
      }

      if (kind === 'delivery' &&
          (user.role !== 'artist' || order.paymentStatus !== 'PAID')) {
        return json({
          error: 'Hasil akhir hanya dapat diunggah artist setelah pembayaran diverifikasi.',
        }, 403);
      }

      if (kind === 'proof') {
        path = `orders/${orderId}/proof`;
      } else if (kind === 'delivery') {
        path = `orders/${orderId}/delivery`;
      } else if (kind === 'invoice-email') {
        path = `orders/${orderId}/invoice-email`;
      } else {
        path = `orders/${orderId}/chat/${user.id}`;
      }
    } else {
      bucket = 'portfolio';
      path = `${user.id}/${kind}`;
    }

    const originalExt = file.name.split('.').pop() || 'file';
    const ext = originalExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'file';
    const filePath = `${path}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, bytes, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return json({
        error: `Upload Supabase gagal: ${uploadError.message}`,
      }, 500);
    }

    if (bucket === 'portfolio') {
      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      if (!data.publicUrl) {
        return json({
          error: 'File tersimpan, tetapi URL publik tidak tersedia.',
          path: filePath,
          bucket,
        }, 500);
      }

      return json({
        ok: true,
        url: data.publicUrl,
        path: filePath,
        bucket,
      });
    }

    return json({
      ok: true,
      url: `/api/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(filePath)}`,
      path: filePath,
      bucket,
    });
  } catch (error: any) {
    console.error('Upload error:', error);

    return json({
      error: error?.message || 'Upload gagal.',
    }, 500);
  }
}
