document.addEventListener('DOMContentLoaded', init);

const VALID_PAGES = ['home', 'over', 'evenementen', 'mix', 'boeken', 'samenwerking'];
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

function showPage(pageId) {
  if (!VALID_PAGES.includes(pageId)) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const pageSection = document.getElementById('page-' + pageId);
  if (!pageSection) return;

  pageSection.classList.add('active');
  updateNavActive(pageId);

  const currentHash = window.location.hash.replace('#', '');
  if (currentHash !== pageId) {
    history.pushState(null, '', '#' + pageId);
  }

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
    showPage(pageId);
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

    if (response.ok && (data.success === 'true' || data.success === true)) {
      form.hidden = true;
      if (successEl) {
        successEl.removeAttribute('hidden');
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      throw new Error('server error');
    }
  } catch {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'form-error';
      submitBtn.insertAdjacentElement('afterend', errorEl);
    }
    errorEl.textContent = 'Er ging iets mis. Probeer opnieuw of mail naar info@mielus.be';
  }
}

function initFormHandling() {
  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
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
  const hash = window.location.hash.replace('#', '');
  const initialPage = VALID_PAGES.includes(hash) ? hash : 'home';

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const initialSection = document.getElementById('page-' + initialPage);
  if (initialSection) initialSection.classList.add('active');

  updateNavActive(initialPage);

  initNavLinks();
  initMobileMenu();
  initFormHandling();

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
  const hash = window.location.hash.replace('#', '') || 'home';
  if (VALID_PAGES.includes(hash)) showPage(hash);
});
