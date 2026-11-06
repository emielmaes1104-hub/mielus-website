// Stap 2: bevestiging. GET toont enkel een knop, zodat mailscanners die links openen niets kunnen bevestigen.
const { GELDIG_DAGEN, SITE, TEKSTVERSIE, TOESTEMMINGSTEKST, basisadres, beveiligingsHeaders, brevo, contact, esc, geldigMailadres, instelling, isActief, kortingscode, leesToken, mailOpmaak, verstuur } = require('./_lib');

function pagina(res, status, titel, inhoud) {
  beveiligingsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.end(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titel)} | MIELUS</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080808;color:#fff;font-family:Arial,sans-serif;padding:24px;box-sizing:border-box"><main style="max-width:460px;background:#0f0f0f;border:1px solid #222;border-radius:6px;padding:36px">
<p style="margin:0 0 20px;font-size:24px;font-weight:800;letter-spacing:.04em">MIELUS</p><h1 style="font-size:24px;margin:0 0 14px">${esc(titel)}</h1><div style="color:#cfcfcf;line-height:1.6">${inhoud}</div></main></body></html>`);
}

const terug = `<p style="margin-top:24px"><a style="color:#bcd5ff" href="${SITE}">Terug naar mielus.be</a></p>`;
const ongeldig = res => pagina(res, 400, 'Deze link werkt niet meer', `<p>De link is verlopen of niet juist. Vraag je code opnieuw aan op de site.</p>${terug}`);

module.exports = async (req, res) => {
  const vraag = new URL(req.url, SITE).searchParams;
  const token = (req.body && typeof req.body === 'object' && req.body.t) || vraag.get('t');
  const data = leesToken(token);
  if (!isActief()) return pagina(res, 503, 'Even geduld', `<p>Dit werkt even niet. Probeer het later opnieuw.</p>${terug}`);
  if (!data || !geldigMailadres(String(data.e || ''))) return ongeldig(res);

  if (req.method === 'GET') {
    return pagina(res, 200, 'Bevestig je mailadres', `<p>Klik hieronder om <strong>${esc(data.e)}</strong> te bevestigen.</p>
<form method="post" action="/api/bevestig"><input type="hidden" name="t" value="${esc(token)}"><button style="margin-top:12px;background:#2873f2;color:#fff;border:0;border-radius:3px;padding:14px 24px;font-size:15px;font-weight:700;cursor:pointer">Bevestigen</button></form>`);
  }
  if (req.method !== 'POST') return ongeldig(res);

  try {
    const adres = basisadres(data.e); // een adres, een contact, ook met +tag of puntjes
    const bestaand = await contact(adres);
    const a = (bestaand && bestaand.attributes) || {};
    const code = a.KORTING_CODE || kortingscode(adres);
    const tot = a.KORTING_TOT || new Date(Date.now() + GELDIG_DAGEN * 86400000).toISOString().slice(0, 10);
    const eersteKeer = !a.KORTING_CODE;
    const lijsten = [Number(instelling('LIJST_KORTING_ID'))];
    const attributen = { FIRSTNAME: data.v, ORGANISATOR: data.o, KORTING_CODE: code, KORTING_TOT: tot };
    if (eersteKeer) attributen.KORTING_STATUS = 'open';
    if (data.n === 1) {
      lijsten.push(Number(instelling('LIJST_BOOKERS_ID')));
      attributen.TOESTEMMING_OP = new Date().toISOString();
      attributen.TOESTEMMING_TEKST = `${TEKSTVERSIE}: ${TOESTEMMINGSTEKST}`;
    }
    const r = await brevo('POST', '/contacts', { email: adres, attributes: attributen, listIds: lijsten, updateEnabled: true });
    if (r.status >= 300) throw new Error('brevo');

    if (eersteKeer) {
      const leesbaar = tot.split('-').reverse().join('/');
      await verstuur({ email: data.e, name: data.v }, 'Je MIELUS-kortingscode', mailOpmaak('Dit is je code', `<p>Dag ${esc(data.v)},</p><p>Bedankt om te bevestigen. Met deze code krijg je 10% op de artiestenfee van je eerste boeking:</p>
<p style="margin:24px 0;padding:16px;background:#141414;border:1px solid #2873f2;border-radius:3px;font-size:21px;font-weight:700;letter-spacing:.06em;text-align:center">${esc(code)}</p>
<p>Vul hem in bij je aanvraag op <a style="color:#bcd5ff" href="${SITE}/#boeken">mielus.be</a>, met dit mailadres. Geldig tot ${leesbaar}. <a style="color:#bcd5ff" href="${SITE}/#privacy">Voorwaarden</a></p>`));
    }
    return pagina(res, 200, 'Bevestigd', `<p>${eersteKeer ? 'Je kortingscode is onderweg naar je mailbox.' : 'Je mailadres is bevestigd. Je code kreeg je al eerder per mail.'}</p>${data.n === 1 ? '<p>Je staat ook op de Bookerslijst. Uitschrijven kan onderaan elke mail.</p>' : ''}${terug}`);
  } catch {
    return pagina(res, 502, 'Er ging iets mis', `<p>Probeer de link zo meteen opnieuw of mail naar info@mielus.be.</p>${terug}`);
  }
};
