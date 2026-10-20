'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type PaymentOrder = {
  id: string; serviceName: string; customerName: string; totalIDR: number;
  paymentMethod: string; paymentStatus: string; status: string; createdAt: number;
  customerReportedAt?: number; paymentDate?: number; reference?: string;
};
const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal');
  return data;
};
const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0));
const dateTime = (value?: number) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export default function QRISPaymentPage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token || '');
  const router = useRouter();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const loadOrder = useCallback(async () => {
    const data = await request('/api/qris/' + encodeURIComponent(token));
    setOrder(data.order);
  }, [token]);
  useEffect(() => { if (token) loadOrder().catch((e: any) => setError(e.message)).finally(() => setLoading(false)); }, [token, loadOrder]);
  const reportPaid = async () => {
    setSending(true); setError(''); setNotice('');
    try {
      await request('/api/qris/' + encodeURIComponent(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'customer-reported-paid' }) });
      router.push('/pay/' + encodeURIComponent(token) + '/success');
    } catch (e: any) { setError(e.message || 'Konfirmasi gagal dikirim.'); }
    finally { setSending(false); }
  };
  const reported = order?.paymentStatus === 'CUSTOMER_REPORTED';
  const verified = order?.paymentStatus === 'PAID';
  return <main className="qrisPage"><div className="qrisShell"><a className="qrisBrand" href="/">✦ Commission Art</a><div className="qrisCard">
    <div className="qrisHead"><span className="qrisLogo">▦</span><div><p className="eyebrow">PAYMENT DETAILS</p><h1>QRIS</h1></div></div>
    {loading ? <p>Memuat detail pesanan…</p> : error && !order ? <><h2>Detail pembayaran tidak tersedia</h2><p>{error}</p></> : order ? <>
      <div className="qrisAmount">{rupiah(order.totalIDR)}</div>
      <div className="qrisDetails"><div><span>Nomor pesanan</span><b>{order.id}</b></div><div><span>Commission</span><b>{order.serviceName}</b></div><div><span>Nama pelanggan</span><b>{order.customerName}</b></div><div><span>Status pembayaran</span><b>{verified ? 'LUNAS — DIVERIFIKASI' : reported ? 'MENUNGGU VERIFIKASI' : 'MENUNGGU KONFIRMASI'}</b></div></div>
      <section className="qrisInstructions"><h2>Scan QRIS (tampilan demo)</h2><div className="qrisQR"><svg role="img" aria-label="QRIS demo tidak dapat dipindai" viewBox="0 0 210 210" width="210" height="210" style={{background:'#fff',shapeRendering:'crispEdges'}}><rect width="210" height="210" fill="white"/>{Array.from({length:21},(_,y)=>Array.from({length:21},(_,x)=>{const finder=(ox:number,oy:number)=>x>=ox&&x<ox+7&&y>=oy&&y<oy+7;const inFinder=finder(0,0)||finder(14,0)||finder(0,14);const local=(ox:number,oy:number)=>{const dx=x-ox,dy=y-oy;return dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4)};const dark=inFinder?((finder(0,0)&&local(0,0))||(finder(14,0)&&local(14,0))||(finder(0,14)&&local(0,14))):((x*7+y*11+x*y)%5<2);return dark?<rect key={`${x}-${y}`} x={x*10} y={y*10} width="10" height="10" fill="#111"/>:null}))}</svg><b>QRIS DEMO — TIDAK DAPAT DIPINDAI</b><small>Untuk demonstrasi alur checkout saja</small></div><p>Website belum terhubung ke penyedia QRIS. QR di atas hanya ilustrasi dan tidak memproses uang sungguhan.</p></section>
      {verified ? <section className="qrisSuccess"><span>✓</span><h2>Pembayaran berhasil</h2><p>Checkout demo selesai. Pesanan otomatis masuk ke antrean artist.</p></section> : <button className="btn primary wide" onClick={reportPaid} disabled={sending}>{sending ? 'Memproses…' : 'Konfirmasi Pembayaran'}</button>}
      {notice && <p role="status" className="qrisNotice">{notice}</p>}{error && order && <p role="alert" className="qrisNotice">{error}</p>}
    </> : null}
    <div className="qrisFooter"><a className="btn" href="/">Kembali ke Beranda</a></div></div><p className="qrisTiny">Mode demo: tidak ada dana yang diproses dan QR tidak dapat dipindai untuk membayar sungguhan.</p></div></main>;
}
