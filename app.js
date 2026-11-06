document.addEventListener('DOMContentLoaded', init);

const VALID_PAGES = ['home', 'over', 'evenementen', 'fotos', 'mix', 'boeken', 'samenwerking'];

/* ===== AGENDA (data in events.js) ===== */
const MONTHS = ['JAN', 'FEB', 'MRT', 'APR', 'MEI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];
const PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

function parseDay(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function dayLabel(ev) {
  const start = parseDay(ev.date);
  if (!ev.end) return String(start.getDate());
  return start.getDate() + '–' + parseDay(ev.end).getDate();
}

function shortDate(ev) {
  return dayLabel(ev) + ' ' + MONTHS[parseDay(ev.date).getMonth()];
}

const townOf = ev => ev.town || ev.place;

function splitEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sorted = [...EVENTS].sort((a, b) => a.date.localeCompare(b.date));
  return {
    upcoming: sorted.filter(ev => parseDay(ev.end || ev.date) >= today),
    past: sorted.filter(ev => parseDay(ev.end || ev.date) < today).reverse(),
  };
}

function renderUpcoming(upcoming) {
  const upcomingEl = document.getElementById('events-upcoming');
  if (upcomingEl) {
    upcomingEl.innerHTML = upcoming.length
      ? upcoming.map((ev, i) => {
          const d = parseDay(ev.date);
          return `
        <div class="event-card${i === 0 ? ' event-card--next' : ''}">
          <div class="event-date">
            <span class="event-day">${dayLabel(ev)}</span>
            <span class="event-month">${MONTHS[d.getMonth()]}</span>
            <span class="event-year">${d.getFullYear()}</span>
          </div>
          <div class="event-info">
            <h3 class="event-name">${escapeHtml(ev.name)}</h3>
            <p class="event-location">${PIN_SVG}${escapeHtml(ev.place || 'Locatie volgt')}</p>
          </div>
          ${i === 0 ? '<div class="event-badges"><span class="badge badge--festival">Volgende</span></div>' : ''}
        </div>`;
        }).join('')
      : `<p class="events-coming">Nieuwe data volgen binnenkort. Zelf een datum vrij? <a href="#boeken" data-page="boeken">Book MIELUS →</a></p>`;
  }

  const next = upcoming[0];
  const nextEl = document.getElementById('next-gig');
  if (nextEl && next) {
    document.getElementById('next-gig-date').textContent = shortDate(next);
    document.getElementById('next-gig-name').textContent = next.name;
    document.getElementById('next-gig-place').textContent = next.place || '';
    nextEl.hidden = false;
  }
}

/* Archief: tabbladen per jaar, die ook de kaart filteren */
let archiveYear = null;
let pastEvents = [];

function renderArchive() {
  const tabsEl = document.getElementById('archive-tabs');
  const listEl = document.getElementById('events-past');
  if (!tabsEl || !listEl) return;

  const years = [...new Set(pastEvents.map(ev => ev.date.slice(0, 4)))];
  if (!years.length) {
    listEl.closest('.events-archive').hidden = true;
    return;
  }
  if (!archiveYear) archiveYear = years[0];

  const tabs = ['alle', ...years];
  tabsEl.innerHTML = tabs.map(y => {
    const count = y === 'alle' ? pastEvents.length : pastEvents.filter(ev => ev.date.startsWith(y)).length;
    const label = y === 'alle' ? 'Alle jaren' : y;
    return `<button type="button" role="tab" class="archive-tab" data-year="${y}" aria-selected="${y === archiveYear}">${label}<span>${count}</span></button>`;
  }).join('');

  const shown = archiveYear === 'alle' ? pastEvents : pastEvents.filter(ev => ev.date.startsWith(archiveYear));
  let lastYear = null;
  listEl.innerHTML = shown.map(ev => {
    const y = ev.date.slice(0, 4);
    const head = archiveYear === 'alle' && y !== lastYear ? `<li class="past-year">${y}</li>` : '';
    lastYear = y;
    const album = albumForEvent(ev);
    const photos = album ? ` <a class="past-photos" href="#fotos/${album.slug}" data-page="fotos" data-album="${album.slug}">${CAMERA_SVG}Foto's</a>` : '';
    return `${head}<li><span class="past-date">${shortDate(ev)}</span><span class="past-name">${escapeHtml(ev.name)}${photos}</span><span class="past-place">${escapeHtml(ev.place || '')}</span></li>`;
  }).join('');

  const towns = new Set(shown.map(townOf).filter(t => TOWNS[t]));
  const statsEl = document.getElementById('archive-stats');
  if (statsEl) {
    const period = archiveYear === 'alle' ? 'sinds ' + years[years.length - 1] : 'in ' + archiveYear;
    statsEl.innerHTML = `<strong>${shown.length}</strong> optredens ${period} · <strong>${towns.size}</strong> gemeentes`;
  }

  updateMap(shown);
}

function initArchiveTabs() {
  const tabsEl = document.getElementById('archive-tabs');
  if (!tabsEl) return;
  tabsEl.addEventListener('click', e => {
    const tab = e.target.closest('.archive-tab');
    if (!tab) return;
    archiveYear = tab.dataset.year;
    renderArchive();
  });
}

/* Kaart: eigen SVG (Media/kaart-regio.svg, gemaakt met dezelfde projectie). Hover toont de events per gemeente */
const MAP_PROJ = { lon0: 2.95, lat1: 51.42, k: 882.787, cos: Math.cos(51 * Math.PI / 180) };
// middelpunt + breedte in kaarteenheden; de hoogte volgt uit de verhouding van het kader
const MAP_VIEWS = {
  alles: { cx: 500, cy: 335.5, w: 1000, wMobile: 720 },
  regio: { cx: 560, cy: 375, w: 500, wMobile: 330, cxMobile: 545 },
};
const SVG_NS = 'http://www.w3.org/2000/svg';
let mapEvents = [];
let mapView = null;
let mapReady = false;

function project([lat, lon]) {
  return [(lon - MAP_PROJ.lon0) * MAP_PROJ.cos * MAP_PROJ.k, (MAP_PROJ.lat1 - lat) * MAP_PROJ.k];
}

function initMap() {
  if (mapReady) return;
  const svg = document.getElementById('gig-svg');
  if (!svg) return;
  mapReady = true;

  setMapView(window.matchMedia('(max-width: 700px)').matches ? 'regio' : 'alles', false);

  document.querySelectorAll('.map-zoom button').forEach(btn => {
    btn.addEventListener('click', () => setMapView(btn.dataset.view, true));
  });

  window.addEventListener('resize', () => setMapView(mapView, false));

  const tip = document.getElementById('map-tooltip');
  document.addEventListener('click', e => {
    if (!e.target.closest('.gig-dot')) tip.hidden = true;
  });
  drawMap();
}

function setMapView(name, animate) {
  const svg = document.getElementById('gig-svg');
  const target = viewBoxFor(name);
  const from = mapView ? viewBoxFor(mapView) : target;
  mapView = name;
  document.querySelectorAll('.map-zoom button').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.view === name);
  });
  document.getElementById('map-tooltip').hidden = true;

  const apply = vb => {
    svg.setAttribute('viewBox', vb.map(v => v.toFixed(1)).join(' '));
    scaleDots(vb[2]);
  };
  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return apply(target);

  const start = performance.now();
  const step = now => {
    const t = Math.min((now - start) / 600, 1);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    apply(from.map((v, i) => v + (target[i] - v) * ease));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function viewBoxFor(name) {
  const svg = document.getElementById('gig-svg');
  const v = MAP_VIEWS[name];
  const ratio = svg.clientHeight / svg.clientWidth || 0.671;
  const mobile = ratio > 0.8;
  const w = mobile ? v.wMobile : v.w;
  const cx = mobile && v.cxMobile ? v.cxMobile : v.cx;
  const h = w * ratio;
  return [cx - w / 2, v.cy - h / 2, w, h];
}

function scaleDots(vbWidth) {
  const f = vbWidth / 1000;
  document.querySelectorAll('.gig-dot').forEach(dot => {
    dot.setAttribute('r', (dot.dataset.r * Math.max(f, 0.55)).toFixed(2));
    dot.setAttribute('stroke-width', (1.6 * f).toFixed(2));
  });
}

function updateMap(events) {
  mapEvents = events;
  if (mapReady) drawMap();
}

function drawMap() {
  const group = document.getElementById('gig-dots');
  const tip = document.getElementById('map-tooltip');
  const wrap = document.getElementById('gig-map');
  if (!group) return;
  group.innerHTML = '';
  tip.hidden = true;

  const byTown = {};
  mapEvents.forEach(ev => {
    const t = townOf(ev);
    if (TOWNS[t]) (byTown[t] = byTown[t] || []).push(ev);
  });

  const entries = Object.entries(byTown).sort((a, b) => b[1].length - a[1].length);
  entries.forEach(([town, evs]) => {
    const [x, y] = project(TOWNS[town]);
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'gig-dot');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
    dot.dataset.r = Math.min(4 + Math.sqrt(evs.length) * 2.4, 16);
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('aria-label', `${town}: ${evs.length} ${evs.length === 1 ? 'optreden' : 'optredens'}`);

    const show = () => {
      const MAX = 6;
      const withYear = archiveYear === 'alle';
      const rows = evs.slice(0, MAX).map(ev =>
        `<li><span>${shortDate(ev)}${withYear ? ' ’' + ev.date.slice(2, 4) : ''}</span>${escapeHtml(ev.name)}</li>`
      ).join('');
      const more = evs.length > MAX ? `<li class="map-tip-more">+ ${evs.length - MAX} meer</li>` : '';
      tip.innerHTML = `<strong>${escapeHtml(town)}</strong><em>${evs.length} ${evs.length === 1 ? 'optreden' : 'optredens'}</em><ul>${rows}${more}</ul>`;
      tip.hidden = false;

      const box = wrap.getBoundingClientRect();
      const d = dot.getBoundingClientRect();
      const cx = d.left + d.width / 2 - box.left;
      const top = d.top - box.top;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const left = Math.max(8, Math.min(cx - w / 2, box.width - w - 8));
      const above = top - h - 10;
      tip.style.left = left + 'px';
      tip.style.top = (above > 8 ? above : top + d.height + 10) + 'px';
    };
    dot.addEventListener('mouseenter', show);
    dot.addEventListener('focus', show);
    dot.addEventListener('click', e => { e.stopPropagation(); show(); });
    dot.addEventListener('mouseleave', () => { tip.hidden = true; });
    dot.addEventListener('blur', () => { tip.hidden = true; });
    group.appendChild(dot);
  });

  scaleDots(viewBoxFor(mapView || 'alles')[2]);
}

function showMapWhenVisible() {
  if (!document.getElementById('page-evenementen').classList.contains('active')) return;
  initMap();
}

function renderEvents() {
  const { upcoming, past } = splitEvents();
  pastEvents = past;
  renderUpcoming(upcoming);
  renderArchive();
}

/* ===== FOTOALBUMS (data in albums.js) ===== */
const CAMERA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const albumPath = (album, n, small) => `Media/albums/${album.slug}/${String(n).padStart(2, '0')}${small ? '-sm' : ''}.jpg`;

function albumDateLabel(album) {
  const d = parseDay(album.date);
  return `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

function albumForEvent(ev) {
  if (typeof ALBUMS === 'undefined') return null;
  const same = ALBUMS.filter(a => a.date === ev.date && a.place === ev.place);
  return same.find(a => a.title === ev.name) || (same.length === 1 && EVENTS.filter(e => e.date === ev.date && e.place === ev.place)[0] === ev ? same[0] : null);
}

function renderFotos(slug) {
  const overview = document.getElementById('album-overview');
  const view = document.getElementById('album-view');
  if (!overview || typeof ALBUMS === 'undefined') return;
  const albums = [...ALBUMS].sort((a, b) => b.date.localeCompare(a.date));
  const album = albums.find(a => a.slug === slug);

  if (!album) {
    view.hidden = true;
    overview.hidden = false;
    const grid = document.getElementById('album-grid');
    if (!grid.children.length) {
      grid.innerHTML = albums.map(a => `
        <a class="album-card" href="#fotos/${a.slug}" data-page="fotos" data-album="${a.slug}">
          <span class="album-cover"><img src="${albumPath(a, a.cover, true)}" alt="" loading="lazy" /></span>
          <span class="album-info">
            <span class="album-date">${albumDateLabel(a)} · ${a.dims.length} foto's</span>
            <span class="album-name">${escapeHtml(a.title)}</span>
            <span class="album-place">${escapeHtml(a.place)}</span>
          </span>
        </a>`).join('');
    }
    return;
  }

  overview.hidden = true;
  view.hidden = false;
  document.getElementById('album-meta').textContent = `${albumDateLabel(album)} · ${album.dims.length} foto's`;
  document.getElementById('album-title').textContent = `${album.title} · ${album.place}`;
  document.getElementById('album-photos').innerHTML = album.dims.map(([w, h], i) => `
    <button class="gallery-item album-photo" type="button" data-full="${albumPath(album, i + 1)}" aria-label="Foto ${i + 1} van ${album.dims.length} vergroten">
      <img src="${albumPath(album, i + 1, true)}" alt="${escapeHtml(album.title)}, foto ${i + 1}" width="${w}" height="${h}" loading="lazy" />
    </button>`).join('');
}

/* ===== LIGHTBOX ===== */
function initLightbox() {
  const box = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (!box) return;
  let items = [];
  let index = 0;
  let lastFocus = null;

  const show = i => {
    index = (i + items.length) % items.length;
    img.src = items[index].dataset.full;
    img.alt = items[index].querySelector('img').alt;
  };
  const close = () => {
    box.hidden = true;
    document.body.style.overflow = '';
    img.removeAttribute('src');
    if (lastFocus) lastFocus.focus();
  };

  document.addEventListener('click', e => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    items = [...item.closest('.page').querySelectorAll('.gallery-item')];
    lastFocus = item;
    show(items.indexOf(item));
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    box.querySelector('.lightbox-close').focus();
  });

  box.querySelector('.lightbox-close').addEventListener('click', close);
  box.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
  box.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
  box.addEventListener('click', e => { if (e.target === box) close(); });

  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  let touchX = null;
  box.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    touchX = null;
  });
}
let scrollObserver = null;

function splitHeroTitleChars() {
  // Hero title uses CSS keyframe animation
}

function runHeroAnimations(pageSection) {
  const elements = [...pageSection.querySelectorAll('.animate-hero')];
  const delays = [100, 300, 500, 650];

  elements.forEach((el, i) => {
    const delay = delays[i] ?? 650 + (i - 3) * 150;
    setTimeout(() => el.classList.add('visible'), delay);
  });

  const title = pageSection.querySelector('h1.hero-title');
  if (title) {
    setTimeout(() => title.classList.add('revealed'), 200);
  }
}

function createScrollObserver() {
  if (scrollObserver) scrollObserver.disconnect();

  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('visible'), delay);
      scrollObserver.unobserve(el);
    });
  }, { threshold: 0.15 });

  return scrollObserver;
}

function initScrollAnimations(pageSection) {
  const observer = createScrollObserver();
  pageSection.querySelectorAll('.animate-in').forEach(el => observer.observe(el));
}

function updateNavActive(pageId) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === pageId);
  });
}

function parseRoute() {
  const [page, sub] = window.location.hash.replace('#', '').split('/');
  return { page: VALID_PAGES.includes(page) ? page : 'home', sub: sub ? decodeURIComponent(sub) : null };
}

function showPage(pageId, sub = null) {
  if (!VALID_PAGES.includes(pageId)) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const pageSection = document.getElementById('page-' + pageId);
  if (!pageSection) return;

  pageSection.classList.add('active');
  updateNavActive(pageId);

  const route = sub ? pageId + '/' + sub : pageId;
  const currentHash = window.location.hash.replace('#', '');
  if (currentHash !== route) {
    history.pushState(null, '', '#' + route);
  }
  if (pageId === 'fotos') renderFotos(sub);

  window.scrollTo({ top: 0, behavior: 'instant' });

  pageSection.querySelectorAll('.animate-hero').forEach(el => el.classList.remove('visible'));
  const heroTitle = pageSection.querySelector('h1.hero-title');
  if (heroTitle) heroTitle.classList.remove('revealed');

  splitHeroTitleChars(pageSection);

  requestAnimationFrame(() => {
    runHeroAnimations(pageSection);
    initScrollAnimations(pageSection);
  });

  if (pageId === 'samenwerking') fetchLiveStats();
  if (pageId === 'evenementen') showMapWhenVisible();
}

function closeMobileMenu() {
  const nav = document.getElementById('main-nav');
  const hamburger = document.getElementById('hamburger');
  nav.classList.remove('menu-open');
  hamburger.classList.remove('open');
}

function initNavLinks() {
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-page]');
    if (!trigger) return;
    e.preventDefault();
    const pageId = trigger.dataset.page;
    closeMobileMenu();
    showPage(pageId, trigger.dataset.album || null);
  });
}

function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('main-nav');

  hamburger.addEventListener('click', e => {
    e.stopPropagation();
    hamburger.classList.toggle('open');
    nav.classList.toggle('menu-open');
  });

  document.addEventListener('click', e => {
    if (!nav.contains(e.target)) {
      closeMobileMenu();
    }
  });
}

async function submitForm(form, successEl) {
  if (!form.reportValidity()) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  let errorEl = form.querySelector('.form-error');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Versturen…';

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    });

    const data = await response.json().catch(() => ({}));

    if (data.success === 'true' || data.success === true) {
      form.classList.add('is-verstuurd');
      if (successEl) {
        successEl.removeAttribute('hidden');
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      const msg = typeof data.message === 'string' ? data.message.toLowerCase() : '';
      throw new Error(msg.includes('activat') ? 'activation' : 'server error');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'form-error';
      submitBtn.insertAdjacentElement('afterend', errorEl);
    }
    errorEl.textContent = err.message === 'activation'
      ? 'Formulier nog niet geactiveerd. Check de bevestigingsmail in info@mielus.be en klik op de link.'
      : 'Er ging iets mis. Probeer opnieuw of mail naar info@mielus.be';
  }
}

function initFormHandling() {
  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    const type = document.getElementById('type');
    const eventVelden = document.getElementById('event-velden');
    const datum = document.getElementById('datum');

    // Deze velden gaan over een optreden, dus niet tonen (of verplichten) bij een privéles.
    type.addEventListener('change', () => {
      const isLes = type.value === 'Privéles';
      eventVelden.hidden = isLes;
      eventVelden.disabled = isLes;
    });

    const nu = new Date();
    datum.min = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`;

    bookingForm.addEventListener('submit', e => {
      e.preventDefault();
      submitForm(bookingForm, document.getElementById('form-success'));
    });
  }

  const collabForm = document.getElementById('collab-form');
  if (collabForm) {
    const successMsg = document.createElement('div');
    successMsg.className = 'form-success';
    successMsg.hidden = true;
    successMsg.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><p>Bedankt voor je voorstel! Emiel neemt zo snel mogelijk contact met je op.</p>';
    collabForm.appendChild(successMsg);

    collabForm.addEventListener('submit', e => {
      e.preventDefault();
      submitForm(collabForm, successMsg);
    });
  }
}

function init() {
  const { page: initialPage, sub: initialSub } = parseRoute();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const initialSection = document.getElementById('page-' + initialPage);
  if (initialSection) initialSection.classList.add('active');

  updateNavActive(initialPage);

  initNavLinks();
  initMobileMenu();
  initFormHandling();
  renderEvents();
  initArchiveTabs();
  initLightbox();
  showMapWhenVisible();
  if (initialPage === 'fotos') renderFotos(initialSub);

  splitHeroTitleChars(initialSection);

  setTimeout(() => {
    runHeroAnimations(initialSection);
    initScrollAnimations(initialSection);
  }, 100);

  if (initialPage === 'samenwerking') fetchLiveStats();
}

/* ===== LIVE SOCIAL STATS ===== */
async function fetchLiveStats() {
  const CACHE_KEY = 'mielus_stats_v1';
  const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

  const cached = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } })();
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    renderStats(cached);
    return;
  }

  const proxy = url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const results = { instagram: null, tiktok: null, soundcloud: null, ts: Date.now() };

  const [igRes, ttRes, scRes] = await Promise.allSettled([
    fetch(proxy('https://www.instagram.com/deejay_mielus/')).then(r => r.json()),
    fetch(proxy('https://www.tiktok.com/@deejay_mielus')).then(r => r.json()),
    fetch(proxy('https://soundcloud.com/emiel-maes-786564150')).then(r => r.json()),
  ]);

  if (igRes.status === 'fulfilled') {
    const html = igRes.value.contents || '';
    const m = html.match(/"edge_followed_by":\{"count":(\d+)\}/)
           || html.match(/"follower_count":(\d+)/)
           || html.match(/content="([\d,.]+) Followers/i);
    if (m) results.instagram = parseStatNum(m[1]);
  }

  if (ttRes.status === 'fulfilled') {
    const html = ttRes.value.contents || '';
    const m = html.match(/"followerCount":(\d+)/)
           || html.match(/"fans":(\d+)/);
    if (m) results.tiktok = parseInt(m[1]);
  }

  if (scRes.status === 'fulfilled') {
    const html = scRes.value.contents || '';
    const m = html.match(/"followers_count":(\d+)/)
           || html.match(/"playback_count":(\d+)/);
    if (m) results.soundcloud = parseInt(m[1]);
  }

  try { localStorage.setItem(CACHE_KEY, JSON.stringify(results)); } catch {}
  renderStats(results);
}

function parseStatNum(str) {
  const s = String(str).replace(/,/g, '').trim();
  if (/M$/i.test(s)) return Math.round(parseFloat(s) * 1_000_000);
  if (/K$/i.test(s)) return Math.round(parseFloat(s) * 1_000);
  return parseInt(s) || null;
}

function formatStatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' M';
  if (n >= 10_000)    return (Math.round(n / 1000) * 1000).toLocaleString('nl-BE');
  if (n >= 1_000)     return n.toLocaleString('nl-BE');
  return String(n);
}

function renderStats(data) {
  const map = { instagram: '.stat-instagram .stat-num', tiktok: '.stat-tiktok .stat-num', soundcloud: '.stat-soundcloud .stat-num' };
  for (const [key, sel] of Object.entries(map)) {
    if (data[key] != null) {
      const el = document.querySelector(sel);
      if (el) el.textContent = formatStatNum(data[key]);
    }
  }
}

window.addEventListener('popstate', () => {
  const { page, sub } = parseRoute();
  showPage(page, sub);
});
