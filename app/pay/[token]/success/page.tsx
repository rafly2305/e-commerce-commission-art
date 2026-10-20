'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
export default function PaymentSuccessPage(){
 const params=useParams<{token:string}>(); const [order,setOrder]=useState<any>(null); const [error,setError]=useState('');
 useEffect(()=>{fetch('/api/qris/'+encodeURIComponent(String(params.token||''))).then(r=>r.json()).then(d=>{if(!d.order)throw new Error(d.error||'Pesanan tidak ditemukan');setOrder(d.order)}).catch(e=>setError(e.message||'Gagal memuat pesanan'))},[params.token]);
 const money=(n:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
 return <main className="qrisPage"><div className="qrisShell"><a className="qrisBrand" href="/">✦ Commission Art</a><section className="qrisCard qrisSuccess"><span>✓</span><h1>Pembayaran berhasil</h1><p>{order?'Checkout demo berhasil dikonfirmasi. Pesanan otomatis masuk ke antrean artist.':'Memuat bukti checkout…'}</p>{error&&<p role="alert">{error}</p>}{order&&<div className="qrisDetails"><div><span>Nomor pesanan</span><b>{order.id}</b></div><div><span>Commission</span><b>{order.serviceName}</b></div><div><span>Total</span><b>{money(order.totalIDR)}</b></div><div><span>Status</span><b>{order.paymentStatus==='PAID'?'BERHASIL (DEMO)':order.paymentStatus}</b></div><div><span>Referensi</span><b>DEMO-QRIS-{String(order.id).slice(-8)}</b></div></div>}<p className="qrisTiny">Ini adalah konfirmasi demo, bukan bukti transaksi QRIS sungguhan. Tidak ada dana yang diproses.</p><a className="btn primary wide" href="/">Kembali ke website</a></section></div></main>
}
