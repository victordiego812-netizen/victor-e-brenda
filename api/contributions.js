const { createHmac, timingSafeEqual } = require('node:crypto');
const BASE = 'https://victor-e-brenda.vercel.app';
const DB = 'https://kujulxyzgotulafuqoza.supabase.co';
function enabled() { return process.env.WEDDING_PAYMENTS_ENABLED === 'true' && !!process.env.MP_ACCESS_TOKEN && !!process.env.MP_WEBHOOK_SECRET && !!process.env.WEDDING_SUPABASE_SECRET_KEY; }
async function db(path, options = {}) {
  const r = await fetch(DB + '/rest/v1/' + path, { ...options, signal: AbortSignal.timeout(15000), headers: { apikey: process.env.WEDDING_SUPABASE_SECRET_KEY, authorization: 'Bearer ' + process.env.WEDDING_SUPABASE_SECRET_KEY, 'content-type': 'application/json', Prefer: 'return=representation', ...options.headers } });
  if (!r.ok) throw new Error('database');
  return r.status === 204 ? null : r.json();
}
async function mp(path, options = {}) {
  const r = await fetch('https://api.mercadopago.com' + path, { ...options, signal: AbortSignal.timeout(15000), headers: { authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN, 'content-type': 'application/json', ...options.headers } });
  if (!r.ok) throw new Error('payment_provider');
  return r.json();
}
function validSignature(id, requestId, signature, secret) {
  if (!id || !requestId || !signature || !secret) return false;
  const parts = Object.fromEntries(signature.split(',').map(v => v.trim().split('=')));
  if (!/^\d+$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false;
  const manifest = 'id:' + String(id).toLowerCase() + ';request-id:' + requestId + ';ts:' + parts.ts + ';';
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'));
}
function contributionNet(p) {
  if (p.status !== 'approved') return 0;
  const gross = Math.round(Number(p.transaction_amount) * 100);
  const refunded = Math.round(Number(p.transaction_amount_refunded || 0) * 100);
  const fees = (p.fee_details || []).reduce((s, f) => s + Math.round(Number(f.amount) * 100), 0);
  return Math.max(0, gross - refunded - fees);
}
async function reconcile(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('invalid_payment');
  const p = await mp('/v1/payments/' + id);
  const ref = String(p.external_reference || '');
  if (!/^vb_[0-9a-f-]{36}$/.test(ref)) return;
  const rows = await db('wedding_contributions?id=eq.' + ref.slice(3) + '&select=*');
  const c = rows[0];
  if (!c) return;
  if (p.currency_id !== 'BRL' || Math.round(Number(p.transaction_amount) * 100) !== c.amount_cents) throw new Error('invalid_payment');
  if (Boolean(p.live_mode) !== (process.env.MP_MODE === 'live')) throw new Error('wrong_mode');
  const profile = await mp('/users/me');
  if (String(p.collector_id) !== String(profile.id)) throw new Error('wrong_collector');
  const update = { contribution_id: c.id, mp_payment_id: String(p.id), status: p.status, gross_cents: c.amount_cents, refunded_cents: Math.round(Number(p.transaction_amount_refunded || 0) * 100), net_cents: contributionNet(p), provider_updated_at: p.date_last_updated, donor_name: [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ') || null, donor_document: p.payer?.identification?.number || null };
  // Database function ignores older provider states and serializes duplicate notifications.
  await db('rpc/wedding_record_payment', { method: 'POST', body: JSON.stringify({ payload: update }) });
}
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, body) => res.status(code).json(body);
  if (req.method === 'GET') return send(200, { enabled: enabled() });
  if (req.method !== 'POST') return send(405, { error: 'Método não permitido.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (req.query.webhook === '1') {
      if (!enabled()) return send(503, { error: 'Pagamentos desativados.' });
      const id = req.query['data.id'];
      if (!validSignature(id, req.headers['x-request-id'], req.headers['x-signature'], process.env.MP_WEBHOOK_SECRET)) return send(401, { error: 'Assinatura inválida.' });
      if (String(body.data?.id) !== String(id)) return send(400, { error: 'Notificação inválida.' });
      if (body.type !== 'payment') return send(200, { received: true });
      await reconcile(id);
      return send(200, { received: true });
    }
    if (!enabled()) return send(503, { error: 'As contribuições online estarão disponíveis em breve.' });
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token || token.length > 500) return send(401, { error: 'Acesse com o código do convite.' });
    const sessions = await db('invite_sessions?token=eq.' + encodeURIComponent(token) + '&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&select=invitee_id');
    if (!sessions[0]) return send(401, { error: 'Acesso expirado. Digite novamente o código do convite.' });
    const invitee = sessions[0].invitee_id;
    if (body.action === 'progress') {
      const rows = await db('rpc/wedding_gift_progress', { method: 'POST', body: '{}' });
      return send(200, { gifts: rows, enabled: true });
    }
    if (body.action === 'status') {
      const id = String(body.contribution_id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return send(400, { error: 'Contribuição inválida.' });
      const rows = await db('wedding_contributions?id=eq.' + id + '&invitee_id=eq.' + encodeURIComponent(invitee) + '&select=id');
      if (!rows[0]) return send(404, { error: 'Contribuição não encontrada.' });
      const payments = await mp('/v1/payments/search?external_reference=vb_' + id + '&sort=date_created&criteria=desc');
      for (const p of (payments.results || []).slice(0, 10)) await reconcile(p.id);
      const data = await db('wedding_payments?contribution_id=eq.' + id + '&select=status,net_cents');
      return send(200, { approved: data.some(p => p.status === 'approved' && p.net_cents > 0), net_cents: data.reduce((s,p) => s + p.net_cents,0) });
    }
    if (body.action !== 'create') return send(400, { error: 'Ação inválida.' });
    const value = Number(body.amount);
    const cents = Math.round(value * 100);
    if (!Number.isFinite(value) || Math.abs(value * 100 - cents) > 0.00001 || cents < 100 || cents > 1000000) return send(400, { error: 'Informe um valor entre R$ 1 e R$ 10.000, com até duas casas decimais.' });
    const giftId = String(body.gift_id || '');
    if (!giftId || giftId.length > 100) return send(400, { error: 'Presente inválido.' });
    const gifts = await db('gifts?id=eq.' + encodeURIComponent(giftId) + '&active=eq.true&select=id,name,suggested_value,gift_type');
    if (!gifts[0]) return send(404, { error: 'Presente não encontrado.' });
    const reserved = await db('gift_reservations?gift_id=eq.' + encodeURIComponent(giftId) + '&status=in.(reserved,gifted)&select=id&limit=1');
    if (reserved.length) return send(409, { error: 'Este item está reservado para entrega pessoal.' });
    const progress = await db('rpc/wedding_gift_progress', { method: 'POST', body: '{}' });
    const raised = Number(progress.find(g => g.gift_id === String(giftId))?.raised_cents || 0);
    const goal = Math.round(Number(gifts[0].suggested_value || 0) * 100);
    if (goal > 0 && raised >= goal) return send(409, { error: 'A meta deste presente já foi alcançada.' });
    const key = String(body.request_id || '');
    if (!/^[0-9a-f-]{36}$/.test(key)) return send(400, { error: 'Solicitação inválida.' });
    // The unique request ID makes retries reuse the same checkout.
    const existing = await db('wedding_contributions?id=eq.' + key + '&select=*');
    let c = existing[0];
    if (c && (c.invitee_id !== String(invitee) || c.gift_id !== String(giftId) || c.amount_cents !== cents)) return send(409, { error: 'Solicitação já utilizada.' });
    if (!c) {
      const recent = await db('wedding_contributions?invitee_id=eq.' + encodeURIComponent(invitee) + '&created_at=gt.' + encodeURIComponent(new Date(Date.now()-3600000).toISOString()) + '&select=id&limit=11');
      if (recent.length >= 10) return send(429, { error: 'Aguarde para iniciar outra contribuição.' });
      const rows = await db('wedding_contributions', { method: 'POST', body: JSON.stringify({ id: key, invitee_id: String(invitee), gift_id: String(giftId), amount_cents: cents }) });
      c = rows[0];
    }
    if (c.checkout_url) return send(200, { checkout_url: c.checkout_url, contribution_id: c.id });
    const p = await mp('/checkout/preferences', { method: 'POST', headers: { 'X-Idempotency-Key': c.id }, body: JSON.stringify({
      items: [{ id: giftId, title: 'Presente de casamento — ' + gifts[0].name, quantity: 1, currency_id: 'BRL', unit_price: cents / 100 }],
      external_reference: 'vb_' + c.id,
      notification_url: BASE + '/api/contributions?webhook=1',
      back_urls: { success: BASE + '/?contribution=' + c.id + '#presentes', pending: BASE + '/?contribution=' + c.id + '#presentes', failure: BASE + '/?contribution=' + c.id + '#presentes' },
      auto_return: 'approved',
      payment_methods: { default_payment_method_id: 'pix', excluded_payment_types: ['credit_card','debit_card','prepaid_card','ticket','atm'].map(id => ({id})) }
    }) });
    const url = process.env.MP_MODE === 'live' ? p.init_point : p.sandbox_init_point;
    const target = new URL(url);
    if (target.protocol !== 'https:' || !(target.hostname === 'mercadopago.com.br' || target.hostname.endsWith('.mercadopago.com.br'))) throw new Error('invalid_checkout');
    await db('wedding_contributions?id=eq.' + c.id, { method: 'PATCH', body: JSON.stringify({ mp_preference_id: p.id, checkout_url: url }) });
    return send(200, { checkout_url: url, contribution_id: c.id });
  } catch (_) { return send(503, { error: 'Não foi possível concluir agora. Tente novamente em instantes.' }); }
}
module.exports = handler;
module.exports.validSignature = validSignature;
module.exports.contributionNet = contributionNet;
