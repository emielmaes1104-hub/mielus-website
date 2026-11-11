// Wekelijkse mail voor de Bookerslijst: vrije data + optredens van de week.
// Bestanden met _ worden door Vercel niet als endpoint gepubliceerd.
const fs = require('fs');
const path = require('path');
const { SITE, esc } = require('./_lib');

const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAANDEN = ['jan', 'feb', 'maa', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEKEN_VOORUIT = 8;
const EXTRA_DATA = ['12-31']; // oudejaarsavond telt altijd mee als hij vrij is

function laadEvents() {
  const bron = fs.readFileSync(path.join(__dirname, '..', 'events.js'), 'utf8');
  return new Function(`${bron}; return EVENTS;`)();
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const leesbaar = d => `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
const dag = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function weeknummer(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

function bezetteData(events) {
  const bezet = new Set();
  events.forEach(ev => {
    const eind = dag(ev.end || ev.date);
    for (let d = dag(ev.date); d <= eind; d.setDate(d.getDate() + 1)) bezet.add(iso(d));
  });
  return bezet;
}

// maandag = de maandag waarop de mail vertrekt
function weekmail(maandag, events = laadEvents()) {
  const bezet = bezetteData(events);
  const zondag = new Date(maandag); zondag.setDate(zondag.getDate() + 6);

  const dezeWeek = events
    .filter(ev => dag(ev.date) >= maandag && dag(ev.date) <= zondag)
    .sort((a, b) => a.date.localeCompare(b.date));

  const vrij = [];
  const tot = new Date(maandag); tot.setDate(tot.getDate() + WEKEN_VOORUIT * 7);
  for (let d = new Date(maandag); d < tot; d.setDate(d.getDate() + 1)) {
    const extra = EXTRA_DATA.includes(iso(d).slice(5));
    if ((d.getDay() === 5 || d.getDay() === 6 || extra) && !bezet.has(iso(d))) vrij.push(new Date(d));
  }

  const week = weeknummer(maandag);
  const onderwerp = vrij.length
    ? `Nog ${vrij.length} vrije avonden bij MIELUS · week ${week}`
    : `MIELUS deze week · week ${week}`;

  const rij = (links, rechts, sterk) => `<tr><td style="padding:10px 0;border-bottom:1px solid #222;font-size:14px;color:#9a9a9a;width:96px;vertical-align:top">${links}</td><td style="padding:10px 0;border-bottom:1px solid #222;font-size:15px;color:${sterk ? '#fff' : '#d6d6d6'};font-weight:${sterk ? 700 : 400}">${rechts}</td></tr>`;

  // vrije data gegroepeerd per maand, als blokjes
  const perMaand = {};
  vrij.forEach(d => { (perMaand[MAANDEN[d.getMonth()]] = perMaand[MAANDEN[d.getMonth()]] || []).push(d); });
  const vrijBlok = Object.entries(perMaand).map(([m, ds]) => `
<p style="margin:18px 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#2873f2;font-weight:700">${m}</p>
<div>${ds.map(d => `<a href="${SITE}/?datum=${iso(d)}#boeken" style="display:inline-block;margin:0 6px 8px 0;padding:8px 12px;border:1px solid #2873f2;border-radius:3px;color:#fff;text-decoration:none;font-size:14px;font-weight:700">${leesbaar(d)}${EXTRA_DATA.includes(iso(d).slice(5)) ? ' 🎆' : ''}</a>`).join('')}</div>`).join('');

  const optredens = dezeWeek.length ? `
<h2 style="margin:36px 0 6px;font-size:18px;color:#fff">Deze week op de planning</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${dezeWeek.map(ev => rij(leesbaar(dag(ev.date)), `${esc(ev.name === 'Private Event' ? 'Privéfeest' : ev.name)}<br><span style="font-size:13px;color:#9a9a9a;font-weight:400">${esc(ev.place || '')}</span>`, true)).join('')}</table>` : '';

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(onderwerp)}</title></head>
<body style="margin:0;background:#080808;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#fff">
<div style="display:none;max-height:0;overflow:hidden">${vrij.length ? `Vrij op ${vrij.slice(0, 3).map(leesbaar).join(', ')} en meer.` : 'Waar MIELUS deze week draait.'}</div>
<table role="presentation" width="100%" style="max-width:560px;margin:auto;background:#0f0f0f;border:1px solid #222;border-radius:6px;overflow:hidden" cellspacing="0" cellpadding="0">
<tr><td><img src="${SITE}/Media/web/og-mielus.jpg" width="560" alt="MIELUS achter de decks" style="display:block;width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#2873f2;font-weight:700">Week ${week} · Bookerslijst</p>
<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2">${vrij.length ? 'Deze avonden zijn nog vrij' : 'Volle agenda deze periode'}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#d6d6d6">${vrij.length
    ? `Zoek je nog een DJ voor je fuif, galabal of feest? Dit zijn de vrijdagen en zaterdagen die de komende ${WEKEN_VOORUIT} weken nog open staan. Klik op een datum en je aanvraag staat meteen klaar.`
    : `De vrijdagen en zaterdagen van de komende ${WEKEN_VOORUIT} weken zijn volgeboekt. Een datum verder in het jaar? Vraag hem gerust aan.`}</p>
${vrijBlok}
${optredens}
<table role="presentation" width="100%" style="margin-top:32px;background:#101a2e;border:1px solid #1e3a6e;border-radius:4px" cellspacing="0" cellpadding="0"><tr><td style="padding:18px 20px">
<p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#fff">Eerste keer MIELUS boeken?</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#bcd5ff">Met je persoonlijke code krijg je 10% op de artiestenfee van je eerste boeking.</p>
</td></tr></table>
<p style="margin:28px 0 0"><a href="${SITE}/#boeken" style="display:inline-block;background:#2873f2;color:#fff;padding:14px 26px;border-radius:3px;text-decoration:none;font-weight:700;font-size:15px">Boek een datum</a></p>
<p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#9a9a9a">Liever even bellen of iets vragen? Antwoord gewoon op deze mail.<br>Emiel · MIELUS</p>
</td></tr></table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#777;text-align:center">Je krijgt deze mail omdat je je inschreef op de Bookerslijst van mielus.be.<br><a href="{{ unsubscribe }}" style="color:#777">Uitschrijven</a> · MIELUS, Emiel Maes · Roelandtstraat 5a, 9260 Wichelen · KBO 1031.182.551 · <a href="${SITE}/#privacy" style="color:#777">Privacy</a></p>
</body></html>`;

  return { onderwerp, html, vrij: vrij.map(iso), dezeWeek };
}

module.exports = { weekmail, laadEvents };
