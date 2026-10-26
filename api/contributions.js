const DB = 'https://kujulxyzgotulafuqoza.supabase.co';
const ADMIN_EMAIL = 'victordiego812@gmail.com';

async function db(path, options = {}) {
  const key = process.env.WEDDING_SUPABASE_SECRET_KEY;
  if (!key) throw new Error('database_not_configured');
  const r = await fetch(DB + '/rest/v1/' + path, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {
      apikey: key,
      authorization: 'Bearer ' + key,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers
    }
  });
  if (!r.ok) throw new Error('database_error');
  return r.status === 204 ? null : r.json();
}

function adminAllowed(req, body) {
  const expected = process.env.WEDDING_ADMIN_TOKEN || '';
  const received = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const email = String(body.admin_email || '').trim().toLowerCase();
  return !!expected && received.length === expected.length &&
    Buffer.from(received).equals(Buffer.from(expected)) &&
    email === ADMIN_EMAIL;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, body) => res.status(status).json(body);

  if (req.method === 'GET') {
    return send(200, { pixKey: process.env.WEDDING_PIX_KEY || '' });
  }
  if (req.method !== 'POST') return send(405, { error: 'Método não permitido.' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return send(400, { error: 'Dados inválidos.' }); }
  }

  try {
    if (body.action === 'report') {
      const donorName = String(body.donor_name || '').trim().replace(/\s+/g, ' ');
      const giftName = String(body.gift_name || '').trim().replace(/\s+/g, ' ');
      const amount = Number(body.amount);
      const cents = Math.round(amount * 100);
      if (donorName.length < 2 || donorName.length > 100) return send(400, { error: 'Informe seu nome (até 100 caracteres).' });
      if (giftName.length < 2 || giftName.length > 120) return send(400, { error: 'Escolha um presente válido.' });
      if (!Number.isFinite(amount) || Math.abs(amount * 100 - cents) > 0.00001 || cents < 100 || cents > 1000000) {
        return send(400, { error: 'Informe um valor entre R$ 1,00 e R$ 10.000,00.' });
      }
      if (!process.env.WEDDING_PIX_KEY) return send(503, { error: 'A chave Pix ainda não foi configurada pelos noivos.' });
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = await db('wedding_pix_contributions?created_at=gte.' + encodeURIComponent(since) + '&select=id&limit=100');
      if (recent.length >= 60) return send(429, { error: 'Muitas confirmações foram enviadas. Tente novamente mais tarde.' });
      const rows = await db('wedding_pix_contributions', {
        method: 'POST',
        body: JSON.stringify({ donor_name: donorName, gift_name: giftName, amount_cents: cents, status: 'pending' })
      });
      return send(201, { ok: true, id: rows[0].id });
    }

    if (!adminAllowed(req, body)) return send(401, { error: 'Acesso restrito aos noivos.' });

    if (body.action === 'admin_list') {
      const rows = await db('wedding_pix_contributions?select=id,donor_name,gift_name,amount_cents,status,created_at,confirmed_at&order=created_at.desc&limit=300');
      return send(200, { contributions: rows });
    }
    if (body.action === 'admin_confirm') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return send(400, { error: 'Registro inválido.' });
      const rows = await db('wedding_pix_contributions?id=eq.' + encodeURIComponent(id) + '&select=id', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      });
      if (!rows || !rows.length) return send(404, { error: 'Contribuição não encontrada.' });
      return send(200, { ok: true });
    }
    if (body.action === 'admin_unconfirm') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return send(400, { error: 'Registro inválido.' });
      const rows = await db('wedding_pix_contributions?id=eq.' + encodeURIComponent(id) + '&select=id', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending', confirmed_at: null })
      });
      if (!rows || !rows.length) return send(404, { error: 'Contribuição não encontrada.' });
      return send(200, { ok: true });
    }
    return send(400, { error: 'Ação inválida.' });
  } catch (error) {
    return send(503, { error: 'Não foi possível concluir agora. Verifique a configuração do banco e tente novamente.' });
  }
};
