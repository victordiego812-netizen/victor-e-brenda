const DB='https://kujulxyzgotulafuqoza.supabase.co';
const EMAIL='victordiego812@gmail.com';
async function db(path,options={}){const key=process.env.WEDDING_SUPABASE_SECRET_KEY;if(!key)throw new Error('Banco não configurado.');const r=await fetch(DB+'/rest/v1/'+path,{...options,headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json',Prefer:'return=representation',...options.headers}});if(!r.ok)throw new Error('Falha ao acessar o banco.');return r.status===204?null:r.json()}
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});let b=req.body||{};if(typeof b==='string'){try{b=JSON.parse(b)}catch{return res.status(400).json({error:'Dados inválidos.'})}}
const expected=process.env.WEDDING_ADMIN_TOKEN||'',auth=req.headers.authorization||'',received=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
try{
if(b.action==='list'){const [gifts,reservations]=await Promise.all([db('gifts?select=*&active=eq.true&order=sort_order.asc,name.asc'),db('gift_reservations?select=id,gift_id,invitee_id,status,reservation_method,purchaser_name,purchase_note,reserved_at,gifted_at,gift:gifts(name),invitee:invitees(display_name)&order=reserved_at.desc')]);return res.status(200).json({gifts,reservations})}
if([url,image].some(u=>u&&!u.startsWith('https://')))return res.status(400).json({error:'Os links precisam começar com https://'});
if(b.action==='reservation'){const id=String(b.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Reserva inválida.'});const status=b.status==='gifted'?'gifted':'cancelled';await db('gift_reservations?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status,gifted_at:status==='gifted'?new Date().toISOString():null})});return res.status(200).json({ok:true})}
return res.status(400).json({error:'Ação inválida.'})
}catch(e){return res.status(503).json({error:e.message||'Não foi possível concluir.'})}};
