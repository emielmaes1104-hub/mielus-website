// Boekings- en samenwerkingsaanvragen: gaan via Brevo naar info@mielus.be. De klant krijgt geen automatische mail.
const { AFZENDER, SITE, basisadres, contact, esc, geldigMailadres, gelijk, ipVan, isActief, kortingscode, maakToken, mailOpmaak, stuur, tekst, teVeel, toegestaneHerkomst, verstuur } = require('./_lib');

const VELDEN = ['naam', 'email', 'telefoon', 'type', 'datum', 'locatie', 'organisator', 'organisatie', 'setduur', 'uur_set', 'aanwezigen', 'dj_materiaal', 'budget', 'kortingscode', 'bericht', 'voorstel', 'merk', 'website_samenwerking'];

async function controleerCode(code, email) {
  const c = tekst(code, 32).toUpperCase();
  if (!c) return '';
  if (!gelijk(c, kortingscode(email))) return 'ONGELDIG: code hoort niet bij dit mailadres';
  const a = ((await contact(basisadres(email)).catch(() => null)) || {}).attributes;
  if (!a || !a.KORTING_CODE) return 'ONGELDIG: code niet gevonden in Brevo';
  if (a.KORTING_STATUS === 'gebruikt') return 'AL GEBRUIKT';
  if (a.KORTING_TOT && a.KORTING_TOT < new Date().toISOString().slice(0, 10)) return `VERLOPEN op ${a.KORTING_TOT}`;
  return `GELDIG tot ${a.KORTING_TOT}. Kijk nog na of dit een nieuwe klant is.`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return stuur(res, 405, { success: false });
  if (!toegestaneHerkomst(req)) return stuur(res, 403, { success: false });
  if (!isActief()) return stuur(res, 503, { success: false });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (b._honey) return stuur(res, 200, { success: true });

  const email = tekst(b.email, 254).toLowerCase();
  if (!tekst(b.naam, 80) && !tekst(b.merk, 80)) return stuur(res, 400, { success: false });
  if (!geldigMailadres(email)) return stuur(res, 400, { success: false });
  if (teVeel(`aanvraag:${ipVan(req)}`, 5, 60)) return stuur(res, 429, { success: false });

  try {
    const code = await controleerCode(b.kortingscode, email);
    const rijen = VELDEN.filter(v => tekst(b[v], 2000)).map(v => `<tr><td style="padding:6px 12px 6px 0;color:#999;vertical-align:top">${esc(v)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(tekst(b[v], 2000))}</td></tr>`).join('');
    const extra = code ? `<p><strong>Kortingscode: ${esc(code)}</strong></p>` : '';
    const onderwerp = tekst(b._subject, 90) || 'Nieuwe aanvraag MIELUS';
    const r = await verstuur(AFZENDER, onderwerp, mailOpmaak(esc(onderwerp), `${extra}<table>${rijen}</table>`), { email });
    if (r.status >= 300) return stuur(res, 502, { success: false });

    if (b.nieuwsbrief === true || b.nieuwsbrief === 'ja') {
      const voornaam = tekst(b.naam, 60).split(' ')[0] || 'daar';
      const token = maakToken({ e: email, v: voornaam, o: tekst(b.organisator, 40) || 'Andere vereniging', n: 1 });
      await verstuur({ email, name: voornaam }, 'Bevestig je inschrijving op de MIELUS Bookerslijst', mailOpmaak('Nog één klik', `<p>Dag ${esc(voornaam)},</p><p>Je vroeg om op de Bookerslijst te komen. Bevestig dat hieronder.</p><p style="margin:28px 0"><a href="${SITE}/api/bevestig?t=${encodeURIComponent(token)}" style="background:#2873f2;color:#fff;padding:14px 24px;border-radius:3px;text-decoration:none;font-weight:700">Bevestigen</a></p><p>Niet aangevraagd? Dan hoef je niets te doen.</p>`)).catch(() => null);
    }
    return stuur(res, 200, { success: true });
  } catch { return stuur(res, 502, { success: false }); }
};
