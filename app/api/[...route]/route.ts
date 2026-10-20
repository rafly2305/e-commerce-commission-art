import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { currentUser } from '@/lib/session';

export const runtime = 'nodejs';
const json = (value: any, status = 200) => NextResponse.json(value, { status });
const uid = () => crypto.randomBytes(5).toString('hex');
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const parts = (req: NextRequest) => new URL(req.url).pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
const getRows = async (table: string) => {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  if (table === 'coupons') return (data || []).map((x: any) => ({ id: x.id, code: x.code, discount: x.discount, active: x.active }));
  return (data || []).map((x: any) => x.data ? JSON.parse(x.data) : x);
};
const getStudio = async () => {
  const { data, error } = await supabase.from('settings').select('data').eq('id', 'studio').maybeSingle();
  if (error) throw error;
  return data?.data ? JSON.parse(data.data) : {};
};
const getOrderRow = async (id: string) => {
  const { data, error } = await supabase.from('orders').select('id,user_id,data').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
};
const saveOrder = async (order: any, userId?: string) => {
  const owner = userId || order.userId || '';
  const { error } = await supabase.from('orders').upsert({ id: order.id, user_id: owner, data: JSON.stringify(order) });
  if (error) throw error;
};

const saveRows = async (table: string, items: any[]) => {
  if (table === 'coupons') {
    const values = items.map((x: any) => ({
      id: x.id || uid(),
      code: x.code || '',
      discount: Number(x.discount || 0),
      active: x.active !== false,
    }));

    if (values.length) {
      const { error } = await supabase
        .from(table)
        .upsert(values, { onConflict: 'id' });

      if (error) throw error;
    }
    return;
  }

  // Tabel services memakai kolom id dan data saja.
  // Tabel lain tetap menggunakan struktur masing-masing.
  const values = items.map((x: any) => {
    if (table === 'services') {
      return {
        id: String(x.id),
        data: JSON.stringify(x),
      };
    }

    if (table === 'orders') {
      return {
        id: x.id,
        user_id: x.userId || '',
        data: JSON.stringify(x),
      };
    }

    return {
      id: x.id,
      user_id: x.userId || undefined,
      data: JSON.stringify(x),
    };
  });

  if (values.length) {
    const { error } = await supabase
      .from(table)
      .upsert(values, { onConflict: 'id' });

    if (error) throw error;
  }

  // Sinkronkan koleksi yang dikirim lengkap agar item yang dihapus
  // dari editor tidak muncul kembali setelah halaman di-refresh.
  if (['services', 'portfolio', 'reviews'].includes(table)) {
    const ids = values.map((x: any) => x.id).filter(Boolean);

    let query = supabase.from(table).delete();

    if (ids.length) {
      query = query.not(
        'id',
        'in',
        `(${ids.map((id: string) => `"${String(id).replace(/"/g, '')}"`).join(',')})`
      );
    }

    const { error } = await query;
    if (error) throw error;
  }
};


export async function GET(req: NextRequest) {
  try {
    const p = parts(req), user = await currentUser();
    if (p[0] === 'qris' && p[1]) {
      const orders = await getRows('orders');
      const order: any = orders.find((x: any) => x.qrisToken === p[1]);
      if (!order) return json({ error: 'Link pembayaran tidak valid atau tidak tersedia.' }, 404);
      return json({ order: { id: order.id, serviceName: order.serviceName, customerName: order.customerName, totalIDR: Number(order.totalIDR || Math.round(Number(order.total || 0) * Number(order.exchangeRate || 16000))), paymentMethod: 'QRIS', paymentStatus: order.paymentStatus || 'WAITING_PAYMENT', status: order.status, createdAt: order.createdAt, customerReportedAt: order.customerReportedAt, paymentDate: order.paymentDate, reference: order.paymentReference, history: order.paymentHistory || [] } });
    }
    if (p[0] === 'public') {
      const [services, arts, reviews, orders, studio] = await Promise.all([getRows('services'), getRows('portfolio'), getRows('reviews'), getRows('orders'), getStudio()]);
      return json({ services, arts, reviews: reviews.filter((x: any) => x.published), studio, queue: orders.filter((x: any) => !['Completed', 'Cancelled', 'Declined'].includes(x.status)).map((x: any) => ({ id: String(x.id).slice(-4), serviceName: x.serviceName, status: x.status })) });
    }
    if (p[0] === 'me') return json({ user });
    if (p[0] === 'admin' && p[1] === 'data') {
      if (user?.role !== 'artist') return json({ error: 'Artist login required' }, 401);
      const [services, orders, arts, reviews, coupons, studio, customersResult] = await Promise.all([
        getRows('services'), getRows('orders'), getRows('portfolio'), getRows('reviews'), getRows('coupons'), getStudio(),
        supabase.from('users').select('id,name,email').eq('role', 'customer')
      ]);
      if (customersResult.error) throw customersResult.error;
      return json({ services, orders, arts, reviews, coupons, studio, customers: customersResult.data || [] });
    }
    if (p[0] === 'orders') {
      if (!user) return json({ error: 'Login required' }, 401);
      const orders = await getRows('orders');
      return json({ orders: user.role === 'artist' ? orders : orders.filter((x: any) => x.userId === user.id) });
    }
    if (p[0] === 'messages' && p[1]) {
      if (!user) return json({ error: 'Login required' }, 401);
      const order = await getOrderRow(p[1]);
      if (!order || (user.role !== 'artist' && order.user_id !== user.id)) return json({ error: 'Forbidden' }, 403);
      const { data, error } = await supabase.from('messages').select('id,sender,text,attachment,created_at').eq('order_id', p[1]).order('id');
      if (error) throw error;
      return json({ messages: (data || []).map((x: any) => ({ ...x, createdAt: x.created_at })) });
    }
    return json({ error: 'Not found' }, 404);
  } catch (e: any) { return json({ error: e?.message || 'Database request failed' }, 500); }
}

export async function POST(req: NextRequest) {
  try {
    const p = parts(req), body = await req.json().catch(() => ({})), user = await currentUser();
    if (p[0] === 'qris' && p[1]) {
      const orders = await getRows('orders');
      const order: any = orders.find((x: any) => x.qrisToken === p[1]);
      if (!order) return json({ error: 'Link pembayaran tidak valid atau tidak tersedia.' }, 404);
      if (order.paymentMethod !== 'QRIS') return json({ error: 'Link ini bukan pembayaran QRIS.' }, 400);
      if (order.paymentStatus === 'PAID') return json({ ok: true, order: { id: order.id, paymentStatus: 'PAID', paymentDate: order.paymentDate } });
      // Demo flow only: no QRIS provider is connected, so this must never be treated as proof of real funds.
      const now = Date.now();
      order.paymentStatus = 'PAID';
      order.paymentDate = now;
      order.customerReportedAt = now;
      order.transactionId = 'DEMO-QRIS-' + String(order.id).slice(-8);
      order.status = 'In Queue';
      order.paymentHistory = [...(order.paymentHistory || []), { status: 'PAID', label: 'Demo QRIS checkout confirmed (not a real transaction)', at: now }];
      await saveOrder(order, order.userId);
      return json({ ok: true, order: { id: order.id, paymentStatus: order.paymentStatus, paymentDate: now } });
    }
    if (p[0] === 'auth' && p[1] === 'login') {
      const { data: account, error } = await supabase.from('users').select('id,name,email,role').eq('email', String(body.email || '').trim().toLowerCase()).eq('password', hash(String(body.password || ''))).maybeSingle();
      if (error) throw error;
      if (!account) return json({ error: 'Email atau password salah' }, 401);
      const token = crypto.randomBytes(24).toString('hex');
      const { error: sessionError } = await supabase.from('sessions').insert({ token, user_id: account.id, created_at: Date.now() });
      if (sessionError) throw sessionError;
      const response = json({ user: account });
      response.cookies.set('ca_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
      return response;
    }
    if (p[0] === 'auth' && p[1] === 'register') {
      if (!body.name || !body.email || String(body.password || '').length < 8) return json({ error: 'Isi nama, email, dan password minimal 8 karakter.' }, 400);
      const account = { id: 'u-' + uid(), name: String(body.name).trim(), email: String(body.email).trim().toLowerCase(), password: hash(String(body.password)), role: 'customer' };
      const { error } = await supabase.from('users').insert(account);
      if (error) return json({ error: error.code === '23505' ? 'Email sudah terdaftar' : error.message }, 400);
      return json({ ok: true });
    }
    if (p[0] === 'auth' && p[1] === 'logout') {
      const token = req.cookies.get('ca_session')?.value;
      if (token) { const { error } = await supabase.from('sessions').delete().eq('token', token); if (error) throw error; }
      const response = json({ ok: true }); response.cookies.delete('ca_session'); return response;
    }
    if (p[0] === 'orders' && p[1]) {
      if (!user) return json({ error: 'Login required' }, 401);
      const row = await getOrderRow(p[1]);
      if (!row) return json({ error: 'Commission not found' }, 404);
      if (user.role !== 'artist' && row.user_id !== user.id) return json({ error: 'Forbidden' }, 403);
      const order = JSON.parse(row.data), previousStatus = order.status, action = body.action;
      if (action === 'accept-request') {
        if (user.role !== 'artist') return json({ error: 'Artist action only' }, 403);
        if (!['New Request', 'Waitlist'].includes(order.status)) return json({ error: 'Only a new request can be accepted' }, 400);
        if (!String(body.invoiceSentTo || '').includes('@') || !String(body.invoiceEmailProof || '').trim()) return json({ error: 'Valid client email and proof that the invoice email was sent are required' }, 400);
        order.email = String(body.invoiceSentTo).trim().slice(0, 254); order.invoiceSentTo = order.email; order.invoiceEmailProof = String(body.invoiceEmailProof); order.invoiceProofName = String(body.invoiceProofName || 'email-sent-proof').slice(0, 180); order.invoiceSentAt = Date.now(); order.status = 'Accepted';
      } else if (action === 'submit-payment') {
        if (user.role !== 'customer') return json({ error: 'Customer action only' }, 403);
        if (order.status !== 'Accepted') return json({ error: 'Payment is available after the request is accepted' }, 400);
        if (body.method !== 'PayPal' || body.currency !== 'USD') return json({ error: 'Only manual PayPal payments in USD are supported until a QRIS provider is configured.' }, 400);
        if (!String(body.reference || '').trim() || !String(body.proof || '').trim()) return json({ error: 'Payment reference and proof are required' }, 400);
        if (order.paymentStatus === 'PAID') return json({ error: 'Payment has already been verified' }, 400);
        order.paymentStatus = 'WAITING_VERIFICATION'; order.paymentMethod = 'PayPal'; order.paymentCurrency = 'USD'; order.paymentReference = String(body.reference).slice(0, 180); order.paymentProof = String(body.proof); order.paymentSubmittedAt = Date.now();
      } else if (action === 'reject-payment') {
        if (user.role !== 'artist') return json({ error: 'Artist action only' }, 403);
        if (!['WAITING_VERIFICATION', 'CUSTOMER_REPORTED'].includes(order.paymentStatus)) return json({ error: 'Payment is not awaiting verification' }, 400);
        order.paymentStatus = 'PAYMENT_REJECTED'; order.paymentRejectedAt = Date.now(); order.paymentRejectedBy = user.id;
      } else if (action === 'verify-payment') {
        if (user.role !== 'artist') return json({ error: 'Artist action only' }, 403);
        if (!['WAITING_VERIFICATION', 'CUSTOMER_REPORTED'].includes(order.paymentStatus) || body.approved !== true) return json({ error: 'Payment verification requires an awaiting payment and explicit approval' }, 400);
        order.paymentStatus = 'PAID'; order.paymentDate = Date.now(); order.transactionId = order.paymentReference || (order.paymentMethod === 'QRIS' ? 'Artist-verified QRIS claim' : ''); order.paymentVerifiedBy = user.id; order.status = 'In Queue'; order.paymentHistory = [...(order.paymentHistory || []), { status: 'PAID', label: 'Artist memverifikasi pembayaran', at: order.paymentDate, by: user.id }];
      } else if (action === 'deliver-final') {
        if (user.role !== 'artist') return json({ error: 'Artist action only' }, 403);
        if (order.paymentStatus !== 'PAID') return json({ error: 'Commission must be paid before final delivery' }, 400);
        if (!body.fileData || String(body.fileData).length > 7_000_000) return json({ error: 'Final file is required and must be under about 5 MB' }, 400);
        order.finalFile = body.fileData; order.finalFileName = body.fileName || 'final-artwork'; order.finalMessage = body.message || ''; order.deliveredAt = Date.now(); order.status = 'Final Delivery';
      } else if (action === 'confirm-completion') {
        if (user.role !== 'customer' || order.status !== 'Final Delivery') return json({ error: 'Only the customer can confirm a delivered commission' }, 400);
        order.status = 'Completed'; order.completedAt = Date.now();
      } else if (action === 'request-revision') {
        if (user.role !== 'customer' || order.status !== 'Final Delivery') return json({ error: 'Revision can be requested after final delivery' }, 400);
        order.status = 'Revision'; order.revisionRequest = body.message || 'Revision requested'; order.revisionRequestedAt = Date.now();
      } else if (action === 'set-stage') {
        if (user.role !== 'artist' || !['Accepted', 'In Queue', 'Sketch', 'Line Art', 'Coloring', 'Revision'].includes(body.status)) return json({ error: 'Invalid stage or artist permission required' }, 400);
        order.status = body.status;
      } else return json({ error: 'Invalid action' }, 400);
      if (order.status !== previousStatus) order.paymentHistory = [...(order.paymentHistory || []), { status: order.status, at: Date.now(), by: user.id, note: 'Perubahan status pesanan' }];
      await saveOrder(order, row.user_id);
      return json({ order });
    }
    if (p[0] === 'orders') {
      if (!user || user.role !== 'customer') return json({ error: 'Customer login required' }, 401);
      const email = String(body.email || user.email || '').trim();
      if (!email.includes('@')) return json({ error: 'Masukkan alamat email yang valid untuk invoice dan update commission.' }, 400);
      const method = body.paymentMethod === 'QRIS' ? 'QRIS' : 'PayPal';
      const order: any = { ...body, id: 'ORD-' + uid().toUpperCase(), userId: user.id, customerName: user.name, email, status: body.status === 'Waitlist' ? 'Waitlist' : 'New Request', createdAt: Date.now(), paymentStatus: 'UNPAID', paymentMethod: method, paymentHistory: [{ status: body.status === 'Waitlist' ? 'Waitlist' : 'New Request', at: Date.now(), by: user.id }] };
      if (method === 'QRIS') { order.status = 'Accepted'; order.paymentStatus = 'WAITING_PAYMENT'; order.paymentNote = 'Demo checkout only; no real QRIS provider connected.'; order.qrisToken = crypto.randomBytes(32).toString('hex'); }
      await saveOrder(order, user.id);
      return json({ order, ...(method === 'QRIS' ? { payUrl: '/pay/' + order.qrisToken } : {}) });
    }
    if (p[0] === 'messages' && p[1]) {
      if (!user) return json({ error: 'Login required' }, 401);
      const order = await getOrderRow(p[1]);
      if (!order || (user.role !== 'artist' && order.user_id !== user.id)) return json({ error: 'Forbidden' }, 403);
      const { error } = await supabase.from('messages').insert({ order_id: p[1], user_id: user.id, sender: user.role, text: String(body.text || ''), attachment: String(body.attachment || ''), created_at: Date.now() });
      if (error) throw error;
      return json({ ok: true });
    }
    if (p[0] === 'reviews') {
      if (!user || user.role !== 'customer') return json({ error: 'Customer login required' }, 401);
      const row = await getOrderRow(String(body.orderId || ''));
      if (!row || row.user_id !== user.id) return json({ error: 'Commission not found' }, 404);
      const order = JSON.parse(row.data);
      if (order.status !== 'Completed') return json({ error: 'You can review only after confirming completion' }, 400);
      const reviews = await getRows('reviews');
      if (reviews.some((x: any) => x.orderId === body.orderId)) return json({ error: 'This commission already has a review' }, 400);
      const review = { id: 'r-' + uid(), orderId: body.orderId, name: user.name, rating: Math.min(5, Math.max(1, Number(body.rating) || 5)), text: body.text || '', published: false, verified: true };
      const { error } = await supabase.from('reviews').insert({ id: review.id, user_id: user.id, data: JSON.stringify(review) });
      if (error) throw error;
      return json({ review });
    }
    return json({ error: 'Not found' }, 404);
  } catch (e: any) { return json({ error: e?.message || 'Database request failed' }, 500); }
}

export async function PUT(req: NextRequest) {
  try {
    const p = parts(req), user = await currentUser(), body = await req.json().catch(() => ({}));
    if (user?.role !== 'artist') return json({ error: 'Artist login required' }, 401);
    if (p[0] === 'admin' && p[1] === 'data') {
      if (body.entity === 'settings') {
        const { error } = await supabase.from('settings').upsert({ id: 'studio', data: JSON.stringify(body.rows || {}) });
        if (error) throw error;
        return json({ ok: true });
      }
      const tableMap: Record<string, string> = { services: 'services', orders: 'orders', arts: 'portfolio', reviews: 'reviews', coupons: 'coupons' };
      const table = tableMap[body.entity];
      if (!table) return json({ error: 'Invalid entity' }, 400);
      await saveRows(table, Array.isArray(body.rows) ? body.rows : []);
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch (e: any) { return json({ error: e?.message || 'Database update failed' }, 500); }
}
