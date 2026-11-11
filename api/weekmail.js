// Zondagavond (Vercel cron): weekmail voor de Bookerslijst klaarzetten tegen maandag 9:00
// en Emiel een voorbeeld sturen. Tot hij de campagne in Brevo annuleert, vertrekt ze vanzelf.
const { AFZENDER, brevo, instelling, isActief, stuur, verstuur } = require('./_lib');
const { weekmail } = require('./_weekmail');

// Pas op true zetten na Emiels "go". Zolang false: enkel een voorbeeld naar info@mielus.be.
const NAAR_LIJST = false;
const EMIEL = { email: 'info@mielus.be', name: 'Emiel' };

// Maandag 9:00 in Brussel, als ISO-tijd met de juiste zomer- of wintertijd.
function volgendeMaandagNegenUur(nu = new Date()) {
  const d = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  const probeer = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9));
  const brussel = new Date(probeer.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
  const utc = new Date(probeer.toLocaleString('en-US', { timeZone: 'UTC' }));
  const verschil = brussel - utc; // 1 of 2 uur
  return { maandag: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), tijdstip: new Date(probeer - verschil) };
}

function toegelaten(req) {
  const geheim = instelling('CRON_SECRET');
  if (geheim) return req.headers.authorization === `Bearer ${geheim}`;
  return /vercel-cron/i.test(req.headers['user-agent'] || '');
}

module.exports = async (req, res) => {
  if (!toegelaten(req)) return stuur(res, 401, { ok: false });
  if (!isActief()) return stuur(res, 503, { ok: false });

  const { maandag, tijdstip } = volgendeMaandagNegenUur();
  const mail = weekmail(maandag);
  const lijst = Number(instelling('LIJST_BOOKERS_ID'));
  const naam = `Weekmail ${maandag.getFullYear()}-W${mail.onderwerp.match(/week (\d+)/)[1]}`;
  let status = 'enkel voorbeeld (versturen naar de lijst staat nog uit)';

  try {
    const info = await brevo('GET', `/contacts/lists/${lijst}`);
    const aantal = (info.data && info.data.uniqueSubscribers) || 0;

    if (!mail.vrij.length && !mail.dezeWeek.length) {
      status = 'overgeslagen: geen vrije data en geen optredens';
    } else if (NAAR_LIJST && !aantal) {
      status = 'overgeslagen: de Bookerslijst is nog leeg';
    } else if (NAAR_LIJST) {
      const bestaand = await brevo('GET', '/emailCampaigns?type=classic&status=queued&limit=50');
      const al = ((bestaand.data && bestaand.data.campaigns) || []).find(c => c.name === naam);
      if (al) {
        status = `stond al klaar (campagne ${al.id})`;
      } else {
        const r = await brevo('POST', '/emailCampaigns', {
          name: naam, subject: mail.onderwerp, sender: AFZENDER, replyTo: AFZENDER.email,
          htmlContent: mail.html, recipients: { listIds: [lijst] }, scheduledAt: tijdstip.toISOString(),
        });
        if (r.status >= 300) throw new Error(`brevo ${r.status}`);
        status = `ingepland voor maandag 9:00 naar ${aantal} ${aantal === 1 ? 'contact' : 'contacten'} (campagne ${r.data.id}). Tegenhouden: Brevo → Campaigns → annuleren.`;
      }
    }

    const uitleg = `<div style="font-family:Arial,sans-serif;background:#fff3cd;color:#000;padding:12px 16px;font-size:14px"><strong>Voorbeeld weekmail.</strong> Status: ${status}. Klopt er een datum niet? Zet het optreden in events.js of annuleer de campagne in Brevo.</div>`;
    await verstuur(EMIEL, `[Voorbeeld] ${mail.onderwerp}`, mail.html.replace(/<body[^>]*>/, m => m + uitleg).replace('{{ unsubscribe }}', '#'));
    return stuur(res, 200, { ok: true, status });
  } catch (e) {
    await verstuur(EMIEL, 'Weekmail MIELUS mislukt', `<p>De weekmail kon niet klaargezet worden (${String(e.message).slice(0, 80)}). Er is niets naar de lijst vertrokken.</p>`).catch(() => {});
    return stuur(res, 502, { ok: false });
  }
};
module.exports.volgendeMaandagNegenUur = volgendeMaandagNegenUur;
