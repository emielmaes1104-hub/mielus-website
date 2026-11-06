// Stap 1: aanvraag van een kortingscode. Stuurt enkel een bevestigingsmail; de code volgt pas na de klik.
const { ORGANISATOREN, SITE, esc, geldigMailadres, ipVan, isActief, maakToken, mailOpmaak, stuur, tekst, teVeel, toegestaneHerkomst, verstuur } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return stuur(res, 405, { success: false });
  if (!toegestaneHerkomst(req)) return stuur(res, 403, { success: false });
  if (!isActief()) return stuur(res, 503, { success: false });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  // Honeypot of te snel ingevuld: doe alsof het lukte, zodat een bot niets leert.
  if (b.website || Date.now() - Number(b.start || 0) < 2500) return stuur(res, 200, { success: true });

  const email = tekst(b.email, 254).toLowerCase();
  const voornaam = tekst(b.voornaam, 60);
  const organisator = ORGANISATOREN.includes(b.organisator) ? b.organisator : '';
  if (!voornaam || !organisator || !geldigMailadres(email)) return stuur(res, 400, { success: false, fout: 'invoer' });
  if (teVeel(`ip:${ipVan(req)}`, 6, 60)) return stuur(res, 429, { success: false, fout: 'limiet' });
  if (teVeel(`mail:${email}`, 2, 60)) return stuur(res, 200, { success: true });

  const token = maakToken({ e: email, v: voornaam, o: organisator, n: b.nieuwsbrief === true ? 1 : 0 });
  const link = `${SITE}/api/bevestig?t=${encodeURIComponent(token)}`;
  const html = mailOpmaak('Nog één klik', `<p>Dag ${esc(voornaam)},</p><p>Bevestig je mailadres en je ontvangt meteen je persoonlijke kortingscode voor je eerste boeking.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#2873f2;color:#fff;padding:14px 24px;border-radius:3px;text-decoration:none;font-weight:700">Bevestig mijn mailadres</a></p>
<p>Deze link werkt 48 uur. Heb je dit niet aangevraagd? Dan hoef je niets te doen, je adres komt dan op geen enkele lijst.</p>`);

  try {
    const r = await verstuur({ email, name: voornaam }, 'Bevestig je mailadres voor je MIELUS-korting', html);
    if (r.status >= 300) return stuur(res, 502, { success: false });
    return stuur(res, 200, { success: true });
  } catch { return stuur(res, 502, { success: false }); }
};
