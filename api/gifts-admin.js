const DB = 'https://kujulxyzgotulafuqoza.supabase.co';
const ADMIN_EMAIL = 'victordiego812@gmail.com';

async function db(path, options = {}) {
  const key = process.env.WEDDING_SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Banco não configurado.');
  const response = await fetch(DB + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: key,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers
    }
  });
  if (!response.ok) throw new Error('Falha ao acessar o banco.');
  return response.status === 204 ? null : response.json();
}

function isAdmin(req, body) {
  const expected = process.env.WEDDING_ADMIN_TOKEN || '';
  const authorization = req.headers.authorization || '';
  const received = authorization.replace(/^Bearer\\s+/i, '').trim();
  const email = String(body.admin_email || '').trim().toLowerCase();
  return Boolean(expected) &&
    received.length === expected.length &&
    Buffer.from(received).equals(Buffer.from(expected)) &&
    email === ADMIN_EMAIL;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: 'Dados inválidos.' }); }
  }

  if (!isAdmin(req, body)) {
    return res.status(401).json({ error: 'Acesso restrito aos noivos.' });
  }

  try {
    if (body.action === 'list') {
      const [gifts, reservations] = await Promise.all([
        db('gifts?select=*&active=eq.true&order=sort_order.asc,name.asc'),
        db('gift_reservations?select=id,gift_id,invitee_id,status,reservation_method,purchaser_name,purchase_note,reserved_at,gifted_at,gift:gifts(name),invitee:invitees(display_name)&order=reserved_at.desc')
      ]);
      return res.status(200).json({ gifts, reservations });
    }

    if (body.action === 'save') {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim().replace(/\\s+/g, ' ');
      const description = String(body.description || '').trim();
      const storeName = String(body.store_name || '').trim();
      const storeUrl = String(body.store_url || '').trim();
      const imageUrl = String(body.image_url || '').trim();

      if (name.length < 2 || name.length > 120) {
        return res.status(400).json({ error: 'Informe o nome do presente (até 120 caracteres).' });
      }
      if (description.length > 500 || storeName.length > 100) {
        return res.status(400).json({ error: 'Confira a descrição e o nome da loja.' });
      }
      for (const value of [storeUrl, imageUrl]) {
        if (value) {
          try {
            if (new URL(value).protocol !== 'https:') throw new Error('invalid_url');
          } catch {
            return res.status(400).json({ error: 'Os links precisam ser endereços HTTPS válidos.' });
          }
        }
      }

      const payload = {
        name,
        description: description || null,
        store_name: storeName || null,
        store_url: storeUrl || null,
        image_url: imageUrl || null,
        category: 'Para nossa casa',
        gift_type: 'physical',
        active: true
      };
      let rows;
      if (id) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return res.status(400).json({ error: 'Presente inválido.' });
        }
        rows = await db('gifts?id=eq.' + encodeURIComponent(id) + '&select=id,name', {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        rows = await db('gifts?select=id,name', {
          method: 'POST',
          body: JSON.stringify({ ...payload, sort_order: 999 })
        });
      }
      if (!rows || !rows.length) {
        return res.status(404).json({ error: 'Presente não encontrado para salvar.' });
      }
      return res.status(200).json({ ok: true, gift: rows[0] });
    }

    if (body.action === 'reservation') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return res.status(400).json({ error: 'Reserva inválida.' });
      }
      const status = body.status === 'gifted' ? 'gifted' : 'cancelled';
      const rows = await db('gift_reservations?id=eq.' + encodeURIComponent(id) + '&select=id', {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          gifted_at: status === 'gifted' ? new Date().toISOString() : null
        })
      });
      if (!rows || !rows.length) {
        return res.status(404).json({ error: 'Reserva não encontrada.' });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (error) {
    return res.status(503).json({ error: error.message || 'Não foi possível concluir.' });
  }
};
