// Gedeelde code voor de MIELUS-functies. Bestanden met _ worden door Vercel niet als endpoint gepubliceerd.
// Geheimen staan enkel in de omgevingsvariabelen van Vercel, nooit in deze publieke repo.
const crypto = require('crypto');

const TEKSTVERSIE = 'bookerslijst-v1-2026-11-06';
const TOESTEMMINGSTEKST = 'Ja, stuur me ook vrije data en acties van MIELUS per mail. Uitschrijven kan altijd.';
const GELDIG_DAGEN = 183;
const LINK_UUR = 48;
const SITE = 'https://mielus.be';
const AFZENDER = { name: 'MIELUS', email: 'info@mielus.be' };
const ORGANISATOREN = ['Jeugdbeweging of jeugdhuis', 'Studentenclub of school', 'Club of festival', 'Horeca', 'Bedrijf', 'Particulier', 'Andere vereniging'];
const WEGWERP = new Set(['mailinator.com', 'yopmail.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'mohmal.com']);

const instelling = naam => process.env[naam] || '';
const isActief = () => Boolean(instelling('BREVO_API_KEY') && instelling('MIELUS_GEHEIM').length >= 32 && Number(instelling('LIJST_KORTING_ID')) && Number(instelling('LIJST_BOOKERS_ID')));

function toegestaneHerkomst(req) {
  const extra = instelling('EXTRA_HERKOMST');
  const herkomst = req.headers.origin || '';
  return [SITE, 'https://www.mielus.be', extra].filter(Boolean).includes(herkomst);
}

function beveiligingsHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}

function stuur(res, status, data) {
  beveiligingsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

// Eenvoudige rem per serverinstantie. Niet waterdicht, wel een drempel; de code vertrekt pas na bevestiging.
const tellers = new Map();
function teVeel(sleutel, max, minuten) {
  const nu = Date.now();
  const venster = minuten * 60000;
  const lijst = (tellers.get(sleutel) || []).filter(t => nu - t < venster);
  lijst.push(nu);
  tellers.set(sleutel, lijst);
  if (tellers.size > 5000) tellers.clear();
  return lijst.length > max;
}

function ipVan(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
}

const tekst = (waarde, max) => String(waarde == null ? '' : waarde).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function geldigMailadres(adres) {
  if (adres.length > 254 || !/^[^\s@"<>]+@[^\s@"<>]+\.[a-z]{2,}$/i.test(adres)) return false;
  return !WEGWERP.has(adres.split('@')[1].toLowerCase());
}

// Zelfde mens = zelfde code: naam+test@gmail.com en n.aam@gmail.com geven geen extra korting.
function basisadres(adres) {
  const [lokaal, domein] = adres.trim().toLowerCase().split('@');
  const dom = domein === 'googlemail.com' ? 'gmail.com' : domein;
  let l = lokaal.split('+')[0];
  if (dom === 'gmail.com') l = l.replace(/\./g, '');
  return `${l}@${dom}`;
}

const hmac = (doel, waarde) => crypto.createHmac('sha256', `${doel}:${instelling('MIELUS_GEHEIM')}`).update(waarde).digest();

// Persoonlijke code: afgeleid van het adres, dus niet te raden en niet overdraagbaar.
function kortingscode(adres) {
  const teken = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = hmac('code', basisadres(adres));
  const c = Array.from(bytes.subarray(0, 10), b => teken[b % 32]).join('');
  return `MIELUS-${c.slice(0, 5)}-${c.slice(5, 10)}`;
}

function gelijk(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function maakToken(gegevens) {
  const inhoud = Buffer.from(JSON.stringify({ ...gegevens, exp: Date.now() + LINK_UUR * 3600000 })).toString('base64url');
  return `${inhoud}.${hmac('token', inhoud).toString('base64url')}`;
}

function leesToken(token) {
  const [inhoud, handtekening, rest] = String(token || '').slice(0, 2000).split('.');
  if (!inhoud || !handtekening || rest !== undefined) return null;
  if (!gelijk(handtekening, hmac('token', inhoud).toString('base64url'))) return null;
  try {
    const data = JSON.parse(Buffer.from(inhoud, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

async function brevo(methode, pad, body) {
  const antwoord = await fetch(`${instelling('BREVO_BASIS') || 'https://api.brevo.com/v3'}${pad}`, {
    method: methode,
    headers: { 'api-key': instelling('BREVO_API_KEY'), accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const ruw = await antwoord.text();
  let data = null;
  try { data = ruw ? JSON.parse(ruw) : null; } catch { data = null; }
  return { status: antwoord.status, data };
}

const contact = async adres => {
  const r = await brevo('GET', `/contacts/${encodeURIComponent(adres)}`);
  return r.status === 200 ? r.data : null;
};

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mailOpmaak(titel, inhoud) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#080808;padding:32px 12px;font-family:Arial,sans-serif;color:#fff">
<table role="presentation" width="100%" style="max-width:560px;margin:auto;background:#0f0f0f;border:1px solid #222;border-radius:6px"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:24px;font-weight:800;letter-spacing:.04em">MIELUS</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${titel}</h1>
<div style="font-size:15px;line-height:1.6;color:#d6d6d6">${inhoud}</div>
</td></tr></table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#777;text-align:center">MIELUS, Emiel Maes · Roelandtstraat 5a, 9260 Wichelen · KBO 1031.182.551 · <a href="${SITE}/#privacy" style="color:#777">Privacy</a></p>
</body></html>`;
}

const verstuur = (naar, onderwerp, htmlContent, replyTo) => brevo('POST', '/smtp/email', {
  sender: AFZENDER, to: [naar], subject: onderwerp, htmlContent, ...(replyTo ? { replyTo } : {}),
});

module.exports = { AFZENDER, GELDIG_DAGEN, ORGANISATOREN, SITE, TEKSTVERSIE, TOESTEMMINGSTEKST, basisadres, beveiligingsHeaders, brevo, contact, esc, geldigMailadres, gelijk, instelling, ipVan, isActief, kortingscode, leesToken, maakToken, mailOpmaak, stuur, tekst, teVeel, toegestaneHerkomst, verstuur };
