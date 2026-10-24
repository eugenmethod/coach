
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const LUNI = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
const fd = s => { if (!s) return '—'; const d = parse(s); return d.getDate() + ' ' + LUNI[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
const lei = n => Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei';
const daysSince = s => s ? Math.round((parse(today()) - parse(s)) / 864e5) : Infinity;
const latest = arr => (arr && arr.length) ? arr.reduce((a, b) => (b.d > a.d ? b : a)) : null;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const e1rm = (kg, r) => r <= 1 ? kg : kg * (1 + r / 30);

const TYPES = { sala: 'Sală', online: 'Online', hibrid: 'Sală + online' };
const STATUS = { activ: 'Activ', lead: 'Lead', pauza: 'Pauză', incheiat: 'Încheiat' };
const SOURCES = ['Instagram', 'TikTok', 'Recomandare', 'Sală', 'Altul'];
const EXS = ['Genuflexiuni', 'Împins la piept', 'Îndreptări', 'Îndreptări românești', 'Hip thrust', 'Tracțiuni', 'Ramat cu bara', 'Presa pentru picioare', 'Împins deasupra capului', 'Fandări'];

const S = { clients: [], settings: { goal: 10, from: '2026-10-22', to: '2026-12-22' }, view: 'panou', sel: null, tab: 'profil', filter: 'activi', q: '', loaded: false, mode: 'connecting' };
let db = null; const queue = {}; let lastKey = '';
let assets = null, downloads = null;
const POSES = { fata: 'Față', profil: 'Profil', spate: 'Spate', altul: 'Altă poză' };
const PHOTO = {}; const photoWait = {};
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
function ensurePhoto(id) {
  if (PHOTO[id]) return Promise.resolve(PHOTO[id]);
  if (!photoWait[id]) photoWait[id] = db.collection('photos').doc(id).get().then(d => { const u = d.exists ? d.data().data : BLANK; PHOTO[id] = u; return u; }).catch(() => { delete photoWait[id]; return BLANK; });
  return photoWait[id];
}
let photoRenderT = null;
const purl = id => { if (PHOTO[id]) return PHOTO[id]; ensurePhoto(id).then(() => { clearTimeout(photoRenderT); photoRenderT = setTimeout(render, 60); }); return BLANK; };
Object.assign(S, { upl: '', cmpA: null, cmpB: null, cmpMode: 'side', sl: 50, usage: null });
function assetErr(e) {
  const c = e && e.code;
  if (c === 'too_large') return 'Poza e prea mare.';
  if (c === 'quota_or_state') return 'Spațiul pentru poze e plin. Șterge poze vechi.';
  if (c === 'unsupported_type') return 'Format nesuportat. Folosește JPG sau PNG.';
  if (c === 'rate_limited') return 'Prea multe încărcări deodată. Așteaptă puțin.';
  return 'Nu s-a încărcat poza. Încearcă din nou.';
}
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function compress(file) {
  const u = URL.createObjectURL(file);
  try {
    const img = await loadImg(u);
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(u); }
}
async function refreshUsage() { if (!assets) return; try { S.usage = (await assets.list()).usage; render(); } catch (e) {} }
function cmpPick(c) {
  const ph = (c.photos || []);
  const byId = id => ph.find(p => p.id === id);
  if (byId(S.cmpA) && byId(S.cmpB)) return [byId(S.cmpA), byId(S.cmpB)];
  const count = {}; ph.forEach(p => { count[p.pose] = (count[p.pose] || 0) + 1; });
  const pose = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  const same = ph.filter(p => p.pose === pose).sort((a, b) => (a.d < b.d ? -1 : 1));
  const all = [...ph].sort((a, b) => (a.d < b.d ? -1 : 1));
  const list = same.length >= 2 ? same : all;
  S.cmpA = list[0].id; S.cmpB = list[list.length - 1].id;
  return [list[0], list[list.length - 1]];
}
function coverDraw(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / r, sh = h / r, sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
async function exportTransformation(c, A, B) {
  if (!downloads) { toast('Salvarea fișierelor nu merge în această vizualizare.'); return; }
  try {
    try { await document.fonts.load('80px Anton'); await document.fonts.load('800 30px Inter'); } catch (e) {}
    const [ia, ib] = await Promise.all([ensurePhoto(A.id).then(loadImg), ensurePhoto(B.id).then(loadImg)]);
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W, 0);
    [['0', '#F6EFE6'], ['.26', '#EBCFC1'], ['.5', '#E2A893'], ['.62', '#F8E7DD'], ['.8', '#D8957E'], ['1', '#EFC6B4']].forEach(([o, col]) => g.addColorStop(+o, col));
    x.fillStyle = g; x.font = '96px Anton, Impact, sans-serif'; x.textBaseline = 'alphabetic';
    x.fillText('TRANSFORMARE', 48, 150);
    const days = Math.round((parse(B.d) - parse(A.d)) / 864e5);
    x.fillStyle = 'rgba(244,241,234,0.62)'; x.font = '700 30px Inter, sans-serif';
    x.fillText(days >= 14 ? Math.round(days / 7) + ' SĂPTĂMÂNI' : days + ' ZILE', 52, 200);
    const pw = 480, ph = 640, py = 250;
    coverDraw(x, ia, 48, py, pw, ph); coverDraw(x, ib, W - 48 - pw, py, pw, ph);
    x.strokeStyle = 'rgba(230,174,156,0.55)'; x.lineWidth = 3; x.strokeRect(W - 48 - pw, py, pw, ph);
    x.font = '800 28px Inter, sans-serif';
    x.fillStyle = '#f4f1ea'; x.fillText('ÎNAINTE', 48, py + ph + 52); x.fillText('DUPĂ', W - 48 - pw, py + ph + 52);
    x.fillStyle = 'rgba(244,241,234,0.62)'; x.font = '600 26px Inter, sans-serif';
    x.fillText(fd(A.d), 48, py + ph + 90); x.fillText(fd(B.d), W - 48 - pw, py + ph + 90);
    x.font = '800 40px Inter, sans-serif'; x.fillStyle = '#f4f1ea';
    const w1 = x.measureText('eugen').width; x.fillText('eugen', 48, H - 70); x.fillStyle = g; x.fillText('.method', 48 + w1, H - 70);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
    await downloads.save({ filename: 'transformare-' + first(c.name).toLowerCase() + '-' + today() + '.jpg', data: blob });
  } catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') toast('Nu am putut crea imaginea.'); }
}
const first = n => String(n || '').trim().split(/\s+/)[0] || 'client';

function getC(id) { return S.clients.find(c => c.id === id); }
function cloneC(id) { return JSON.parse(JSON.stringify(getC(id))); }
function newId() { try { if (db) return db.collection('clients').doc().id; } catch (e) {} return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function errMsg(e) {
  if (e && e.code === 'permission-denied') return 'Nu ai acces. Verifică regulile Firestore (ghid, pasul 4).';
  if (e && e.code === 'resource-exhausted') return 'S-a atins limita gratuită pe azi. Încearcă mâine.';
  if (e && e.code === 'unavailable') return 'Ești offline. Se salvează când revine internetul.';
  if (e && e.code === 'quota_exceeded') return 'Spațiul de date e plin. Șterge clienți vechi și încearcă din nou.';
  if (e && e.code === 'invalid_argument') return 'Doar proprietarul paginii poate salva date.';
  return 'Nu s-a salvat. Verifică conexiunea și încearcă din nou.';
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600); }

function saveClient(c) {
  const i = S.clients.findIndex(x => x.id === c.id);
  if (i >= 0) S.clients[i] = c; else S.clients.push(c);
  render();
  if (!db) return;
  const body = JSON.parse(JSON.stringify(c)); delete body.id;
  queue[c.id] = (queue[c.id] || Promise.resolve()).then(() => db.collection('clients').doc(c.id).set(body)).catch(e => toast(errMsg(e)));
}
function removeClient(id) {
  S.clients = S.clients.filter(c => c.id !== id);
  render();
  if (!db) return;
  queue[id] = (queue[id] || Promise.resolve()).then(() => db.collection('clients').doc(id).delete()).catch(e => toast(errMsg(e)));
}
function saveSettings() {
  render();
  if (!db) return;
  queue.settings = (queue.settings || Promise.resolve()).then(() => db.doc('settings/main').set({ ...S.settings })).catch(e => toast(errMsg(e)));
}

/* ---------- derived ---------- */
function weekStart() { const t = parse(today()); const dow = (t.getDay() + 6) % 7; return iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - dow)); }
function attention() {
  const out = [];
  for (const c of S.clients) {
    if (c.status === 'lead') { out.push({ c, lvl: 'info', t: 'Lead', s: 'Sursa: ' + (c.source || '—') + (c.start ? ' · din ' + fd(c.start) : '') + '. Programează auditul.' }); continue; }
    if (c.status !== 'activ') continue;
    const p = c.pkg || {};
    if (p.total > 0 && p.left <= 0) out.push({ c, lvl: 'crit', t: 'Pachet terminat', s: 'Propune reînnoirea.' });
    else if (p.total > 0 && p.left <= 2) out.push({ c, lvl: 'warn', t: p.left + (p.left === 1 ? ' ședință rămasă' : ' ședințe rămase'), s: 'Pachetul se termină curând.' });
    if (c.type !== 'sala') { const k = latest(c.checkins); const d = k ? daysSince(k.d) : Infinity; if (d > 7) out.push({ c, lvl: 'warn', t: 'Check-in restant', s: k ? 'Ultimul acum ' + d + ' zile.' : 'Niciun check-in încă.' }); }
    if (c.type !== 'online') { const s = latest(c.sessions); const d = s ? daysSince(s.d) : Infinity; if (d > 14) out.push({ c, lvl: 'warn', t: 'Fără ședință', s: s ? 'Ultima acum ' + d + ' zile.' : 'Nicio ședință bifată.' }); }
  }
  const rank = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.lvl] - rank[b.lvl]);
}

/* ---------- views ---------- */
function vPanou() {
  const act = S.clients.filter(c => c.status === 'activ');
  const ws = weekStart(), td = today(), mo = td.slice(0, 7);
  let sw = 0, inc = 0;
  for (const c of S.clients) {
    for (const s of c.sessions || []) if (s.d >= ws && s.d <= td) sw++;
    for (const p of c.payments || []) if (String(p.d).startsWith(mo)) inc += Number(p.a) || 0;
  }
  const renew = act.filter(c => c.pkg && c.pkg.total > 0 && c.pkg.left <= 2).length;
  const g = S.settings;
  const social = S.clients.filter(c => ['Instagram', 'TikTok'].includes(c.source) && c.status !== 'lead' && c.start >= g.from && c.start <= g.to);
  const leadsSoc = S.clients.filter(c => ['Instagram', 'TikTok'].includes(c.source) && c.status === 'lead').length;
  const left = Math.max(0, Math.round((parse(g.to) - parse(td)) / 864e5));
  const blocks = Array.from({ length: Math.max(1, g.goal) }, (_, i) => `<i class="${i < social.length ? 'on' : ''}"></i>`).join('');
  const src = {}; S.clients.filter(c => c.status !== 'lead').forEach(c => { const k = c.source || 'Altul'; src[k] = (src[k] || 0) + 1; });
  const smax = Math.max(1, ...Object.values(src));
  const al = attention();
  const ex = S.clients.some(c => c.example);
  return `
  <div><div class="kicker">${esc(fd(td))} · săptămâna din ${esc(fd(ws))}</div><h1 style="margin-top:8px">Panou</h1></div>
  ${ex ? `<div class="note">Clienții marcați <span class="ex">Exemplu</span> sunt de probă, ca să vezi cum arată aplicația. Șterge-i când adaugi clienții tăi.</div>` : ''}
  <div class="kpis">
    <div class="kpi"><span class="v grad num">${act.length}</span><span class="l">Clienți activi</span></div>
    <div class="kpi"><span class="v grad num">${sw}</span><span class="l">Ședințe săptămâna asta</span></div>
    <div class="kpi"><span class="v grad num">${esc(lei(inc).replace(' lei', ''))}</span><span class="l">Lei încasați în ${LUNI[new Date().getMonth()]}</span></div>
    <div class="kpi"><span class="v grad num">${renew}</span><span class="l">Pachete de reînnoit</span></div>
  </div>
  <div class="grid2">
    <section class="panel">
      <div class="panel-h"><h2>De făcut</h2><span class="muted num">${al.length}</span></div>
      ${al.length ? `<div class="alerts">${al.map(a => `<button class="alert ${a.lvl}" data-act="open" data-id="${esc(a.c.id)}"><div><b>${esc(a.c.name)}</b> · ${esc(a.t)}<br><span>${esc(a.s)}</span></div><span class="go">›</span></button>`).join('')}</div>` : `<div class="empty">Nimic restant. Toți clienții sunt la zi.</div>`}
    </section>
    <div style="display:flex;flex-direction:column;gap:22px;min-width:0">
      <section class="panel">
        <div class="panel-h"><h2>Obiectiv</h2><button class="btn sm ghost" data-act="goal">Editează</button></div>
        <div class="goal-n num"><span class="grad">${social.length}</span><small> / ${esc(g.goal)}</small></div>
        <div class="blocks" style="grid-template-columns:repeat(${Math.max(1, g.goal)},minmax(0,1fr))">${blocks}</div>
        <div class="muted" style="font-size:14px">Clienți noi din Instagram și TikTok, ${esc(fd(g.from))} – ${esc(fd(g.to))}. ${left} zile rămase${leadsSoc ? ` · ${leadsSoc} ${leadsSoc === 1 ? 'lead' : 'leaduri'} în discuție` : ''}.</div>
      </section>
      <section class="panel">
        <h2>De unde vin clienții</h2>
        ${Object.keys(src).length ? `<div class="bars">${SOURCES.filter(k => src[k]).map(k => `<div class="bar-r"><span>${esc(k)}</span><div class="bar-t"><i style="width:${(src[k] / smax) * 100}%"></i></div><span class="num muted" style="text-align:right">${src[k]}</span></div>`).join('')}</div>` : `<div class="empty">Apare după primul client.</div>`}
      </section>
    </div>
  </div>`;
}

function meter(c) {
  const p = c.pkg || {};
  if (!(p.total > 0)) return `<div class="meter"><span>fără pachet</span></div>`;
  const cls = p.left <= 0 ? 'out' : p.left <= 2 ? 'low' : '';
  return `<div class="meter ${cls}"><span class="num">${p.left} / ${p.total} ședințe</span><div class="bar-t"><i style="width:${Math.max(0, Math.min(100, (p.left / p.total) * 100))}%"></i></div></div>`;
}
function vClienti() {
  const F = { toti: () => true, activi: c => c.status === 'activ', sala: c => c.type !== 'online' && c.status === 'activ', online: c => c.type !== 'sala' && c.status === 'activ', leaduri: c => c.status === 'lead', inactivi: c => c.status === 'pauza' || c.status === 'incheiat' };
  const q = S.q.trim().toLowerCase();
  const list = S.clients.filter(F[S.filter] || F.toti).filter(c => !q || (c.name + ' ' + (c.goal || '') + ' ' + (c.phone || '')).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  const chips = [['activi', 'Activi'], ['sala', 'Sală'], ['online', 'Online'], ['leaduri', 'Leaduri'], ['inactivi', 'Inactivi'], ['toti', 'Toți']];
  return `
  <div class="dhead"><div><div class="kicker">${S.clients.length} în total</div><h1 style="margin-top:8px">Clienți</h1></div><button class="btn pri" data-act="new">+ Client nou</button></div>
  <div class="tools"><input id="q" class="search" type="search" placeholder="Caută după nume, obiectiv, telefon" value="${esc(S.q)}" aria-label="Caută client"><div class="chips">${chips.map(([k, l]) => `<button class="chip" data-act="filt" data-v="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div></div>
  ${list.length ? `<div class="list">${list.map(c => { const s = latest(c.sessions); return `
    <button class="row" data-act="open" data-id="${esc(c.id)}">
      <div style="min-width:0"><div class="nm">${esc(c.name)} ${c.example ? '<span class="ex">Exemplu</span>' : ''}</div><div class="meta">${esc(TYPES[c.type] || '')} · ${esc(c.source || '—')}${c.goal ? ' · ' + esc(c.goal) : ''}</div></div>
      <div class="rt">${meter(c)}<div class="meta" style="width:96px">${s ? 'ultima: ' + esc(fd(s.d)) : 'nicio ședință'}</div><span class="pill ${esc(c.status)}">${esc(STATUS[c.status] || '')}</span></div>
    </button>`; }).join('')}</div>` : `<div class="empty">${S.clients.length ? 'Niciun client pentru filtrul ăsta.' : 'Niciun client încă. Apasă „+ Client nou” ca să-l adaugi pe primul.'}</div>`}`;
}

function sorted(arr) { return (arr || []).map((x, i) => ({ ...x, _i: i })).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b._i - a._i)); }
function delBtn(k, i) { return `<button class="x" data-act="dele" data-k="${k}" data-i="${i}" aria-label="Șterge">×</button>`; }

function spark(ms) {
  return sparkSeries((ms || []).filter(m => num(m.w) != null).map(m => ({ d: m.d, w: num(m.w) })), 'kg', 'Evoluția greutății');
}
function sparkSeries(raw, unit, label) {
  const pts = [...raw].sort((a, b) => (a.d < b.d ? -1 : 1));
  if (pts.length < 2) return '';
  const W = 600, H = 120, P = 14, ys = pts.map(p => num(p.w));
  let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const t0 = parse(pts[0].d).getTime(), t1 = parse(pts[pts.length - 1].d).getTime() || t0 + 1;
  const X = d => P + ((parse(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - P * 2 - 60);
  const Y = v => P + (1 - (v - lo) / (hi - lo)) * (H - P * 2);
  const line = pts.map(p => X(p.d).toFixed(1) + ',' + Y(num(p.w)).toFixed(1)).join(' ');
  const lp = pts[pts.length - 1], lx = X(lp.d), ly = Y(num(lp.w));
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
    <line x1="${P}" x2="${W - P - 60}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="var(--faint)" stroke-width="1"/>
    <line x1="${P}" x2="${W - P - 60}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="var(--faint)" stroke-width="1"/>
    <polygon points="${X(pts[0].d)},${H - P} ${line} ${lx},${H - P}" fill="rgba(230,174,156,0.12)"/>
    <polyline points="${line}" fill="none" stroke="var(--rose)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="4.5" fill="var(--rose)"/>
    <text x="${W - P - 52}" y="${Math.min(H - 6, Math.max(14, ly + 5))}" fill="var(--bone)" font-size="15" font-weight="700" font-family="Inter, sans-serif">${esc(Math.round(num(lp.w) * 10) / 10)} ${esc(unit)}</text>
  </svg>`;
}

/* ---------- antrenamente ---------- */
const rid = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const fmtSet = s => `${s.kg}×${s.reps}`;
const fmtSets = sets => sets.map(fmtSet).join(' · ');
const topE1 = sets => Math.max(0, ...sets.map(s => e1rm(num(s.kg) || 0, parseInt(s.reps) || 1)));
function allSets(c) {
  const out = (c.lifts || []).map(l => ({ d: l.d, ex: l.ex, kg: num(l.kg), reps: parseInt(l.reps) }));
  for (const w of c.workouts || []) for (const e of w.ex || []) for (const s of e.sets || []) out.push({ d: w.d, ex: e.name, kg: num(s.kg), reps: parseInt(s.reps) });
  return out.filter(s => s.ex && s.kg != null && s.reps > 0);
}
function prevFor(c, name, d, exclId) {
  let best = null;
  for (const w of c.workouts || []) {
    if (w.id === exclId || !(w.d < d)) continue;
    const e = (w.ex || []).find(x => same(x.name, name));
    if (e && e.sets && e.sets.length && (!best || w.d > best.d)) best = { d: w.d, sets: e.sets };
  }
  return best;
}
function deltaBadge(now, prev) {
  if (!prev) return `<span class="delta eq">prima dată</span>`;
  const dv = topE1(now) - topE1(prev.sets);
  if (Math.abs(dv) < 0.05) return `<span class="delta eq">= ca data trecută</span>`;
  return `<span class="delta ${dv > 0 ? 'up' : 'down'}">${dv > 0 ? '↑ +' : '↓ '}${dv.toFixed(1)} kg 1RM</span>`;
}
function vWorkouts(c) {
  const ws = [...(c.workouts || [])].sort((a, b) => (a.d < b.d ? 1 : -1));
  return `<div class="dhead"><div><h2>Antrenamente</h2><div class="muted small">${ws.length ? ws.length + ' înregistrate · ultimul pe ' + esc(fd(ws[0].d)) : 'Notează kg și repetări la fiecare serie.'}</div></div><button class="btn pri" data-act="neww">+ Antrenament nou</button></div>
  ${ws.length ? ws.slice(0, 40).map(w => `<article class="wcard">
    <div class="panel-h"><div><div class="kicker">${esc(fd(w.d))}</div><h2 style="margin-top:4px">${esc(w.title || 'Antrenament')}</h2></div><div class="tools"><button class="btn sm" data-act="editw" data-id="${esc(w.id)}">Editează</button><button class="x" data-act="delw" data-id="${esc(w.id)}" aria-label="Șterge antrenamentul">×</button></div></div>
    ${(w.ex || []).map(e => { const p = prevFor(c, e.name, w.d, w.id); return `<div class="wex"><div style="min-width:0"><b>${esc(e.name)}</b><div class="sets">${esc(fmtSets(e.sets || []))}${(e.sets || []).some(s => s.n) ? `<span class="muted small"> · ${esc(e.sets.filter(s => s.n).map(s => s.n).join('; '))}</span>` : ''}</div>${p ? `<div class="muted small">data trecută (${esc(fd(p.d))}): ${esc(fmtSets(p.sets))}</div>` : ''}</div><div>${deltaBadge(e.sets || [], p)}</div></div>`; }).join('')}
    ${w.note ? `<div class="muted small" style="white-space:pre-wrap">${esc(w.note)}</div>` : ''}
  </article>`).join('') : `<div class="empty">Niciun antrenament încă. Apasă „+ Antrenament nou”, iar data viitoare îți arăt automat ce a făcut ultima dată.</div>`}`;
}
function exHistory(c) {
  const sets = allSets(c); if (!sets.length) return '';
  const cnt = {}; sets.forEach(s => { cnt[s.ex] = (cnt[s.ex] || 0) + 1; });
  const names = Object.keys(cnt).sort((a, b) => a.localeCompare(b, 'ro'));
  const exn = names.includes(S.exh) ? S.exh : Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  const byDay = {};
  sets.filter(s => same(s.ex, exn)).forEach(s => { const g = byDay[s.d] = byDay[s.d] || { d: s.d, sets: [], vol: 0 }; g.sets.push(s); g.vol += s.kg * s.reps; });
  const days = Object.values(byDay).sort((a, b) => (a.d < b.d ? 1 : -1));
  const pts = days.map(g => ({ d: g.d, w: topE1(g.sets) }));
  return `<section class="panel"><div class="panel-h"><h2>Istoric pe exercițiu</h2><label class="f" style="min-width:200px"><span class="sr">Exercițiu</span><select id="exh">${names.map(n => `<option${n === exn ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>
    ${sparkSeries(pts, 'kg', '1RM estimat în timp') || '<div class="muted small">Graficul apare de la a doua zi cu acest exercițiu.</div>'}
    <div class="tbl-w"><table><thead><tr><th>Data</th><th>Serii</th><th class="r">Volum</th><th class="r">1RM estimat</th></tr></thead><tbody>${days.map(g => `<tr><td>${esc(fd(g.d))}</td><td>${esc(fmtSets(g.sets))}</td><td class="r">${Math.round(g.vol).toLocaleString('ro-RO')} kg</td><td class="r">${topE1(g.sets).toFixed(1)} kg</td></tr>`).join('')}</tbody></table></div>
    <div class="muted" style="font-size:12px">Volum = kg × repetări, adunat pe toate seriile.</div>
  </section>`;
}
let editingW = null;
function setRow(s, i, ph) {
  s = s || {}; ph = ph || {};
  return `<div class="setr"><span class="sn">${i + 1}</span><input class="s-kg" inputmode="decimal" placeholder="${esc(ph.kg ?? 'kg')}" value="${esc(s.kg ?? '')}" aria-label="Kg"><span class="muted">×</span><input class="s-r" inputmode="numeric" placeholder="${esc(ph.reps ?? 'rep')}" value="${esc(s.reps ?? '')}" aria-label="Repetări"><input class="s-n" placeholder="notă" value="${esc(s.n || '')}" aria-label="Notă"><button type="button" class="x" data-act="rmset" aria-label="Scoate seria">×</button></div>`;
}
function exBlock(e, prevSets) {
  e = e || { name: '', sets: [] }; const sets = e.sets && e.sets.length ? e.sets : [{}, {}, {}];
  return `<div class="exb"><div class="exb-h"><input class="exb-n" readonly inputmode="none" data-act="pickex" placeholder="Alege exercițiu ▾" value="${esc(e.name || '')}" aria-label="Exercițiu, apasă ca să alegi"><button type="button" class="x" data-act="rmex" aria-label="Scoate exercițiul">×</button></div>
    <div class="prev muted small"></div><div class="sets">${sets.map((s, i) => setRow(s, i, prevSets ? prevSets[Math.min(i, prevSets.length - 1)] : null)).join('')}</div>
    <div><button type="button" class="btn sm ghost" data-act="addset">+ Serie</button></div></div>`;
}
function updatePrev(bl) {
  const c = getC(S.sel); if (!c || !bl) return;
  const name = bl.querySelector('.exb-n').value.trim(); const d = ($('#wd') || {}).value || today();
  const p = name ? prevFor(c, name, d, editingW) : null;
  bl.querySelector('.prev').textContent = p ? `Data trecută (${fd(p.d)}): ${fmtSets(p.sets)}` : (name ? 'Prima dată pe exercițiul ăsta.' : '');
  bl.querySelectorAll('.setr').forEach((r, i) => { const s = p && p.sets[Math.min(i, p.sets.length - 1)]; r.querySelector('.s-kg').placeholder = s ? s.kg : 'kg'; r.querySelector('.s-r').placeholder = s ? s.reps : 'rep'; });
}
function renumber(bl) { bl.querySelectorAll('.setr .sn').forEach((n, i) => { n.textContent = i + 1; }); }
function workoutForm(id) {
  const c = getC(S.sel); const w = id ? (c.workouts || []).find(x => x.id === id) : null; editingW = w ? w.id : null;
  const prev = [...(c.workouts || [])].sort((a, b) => (a.d < b.d ? 1 : -1));
  const names = [...new Set([...EXS, ...allSets(c).map(s => s.ex)])];
  openOv(`<h2>${w ? 'Editează antrenamentul' : 'Antrenament nou'}</h2>
  <form class="stack" data-form="workout">
    <div class="cmp"><label class="f">Data<input id="wd" type="date" value="${esc(w ? w.d : today())}" required></label><label class="f">Titlu<input id="wt" value="${esc(w ? w.title : '')}" placeholder="ex: Picioare A"></label></div>
    ${!w && prev.length ? `<label class="f">Pornește de la un antrenament anterior<select id="wtpl"><option value="">— gol —</option>${prev.slice(0, 30).map(x => `<option value="${esc(x.id)}">${esc(fd(x.d))} · ${esc(x.title || 'Antrenament')}</option>`).join('')}</select></label>` : ''}
    <div id="wex" style="display:flex;flex-direction:column;gap:10px">${(w ? w.ex : [null]).map(e => exBlock(e)).join('')}</div>
    <div><button type="button" class="btn sm" data-act="addex">+ Exercițiu</button></div>
    <label class="f">Note<textarea id="wn" placeholder="cum s-a simțit, ce corectăm data viitoare">${esc(w ? w.note || '' : '')}</textarea></label>
    ${!w && c.type !== 'online' ? `<label class="f chk"><input id="wsess" type="checkbox" checked> Bifează și ședința (scade din pachet)</label>` : ''}
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Renunță</button><button class="btn pri">Salvează antrenamentul</button></div>
  </form>`, true);
  document.querySelectorAll('#wex .exb').forEach(updatePrev);
}
function applyTemplate(id) {
  const c = getC(S.sel); const t = (c.workouts || []).find(x => x.id === id); const box = $('#wex'); if (!box) return;
  if (!t) { box.innerHTML = exBlock(null); return; }
  if (!v('wt')) $('#wt').value = t.title || '';
  box.innerHTML = (t.ex || []).map(e => exBlock({ name: e.name, sets: (e.sets || []).map(() => ({})) })).join('');
  box.querySelectorAll('.exb').forEach(updatePrev);
}

/* ---------- nutriție ---------- */
const MAC = [['kcal', 'kcal', 'Calorii'], ['p', 'g', 'Proteine'], ['c', 'g', 'Carbohidrați'], ['f', 'g', 'Grăsimi']];
function mealTotals(m) { const t = { kcal: 0, p: 0, c: 0, f: 0, has: {} }; let any = false; for (const it of m.items || []) for (const k of ['kcal', 'p', 'c', 'f']) { const n = num(it[k]); if (n != null) { t[k] += n; t.has[k] = 1; any = true; } } return any ? t : null; }
function planTotals(pl) { const t = { kcal: 0, p: 0, c: 0, f: 0, has: {} }; let any = false; for (const m of pl.meals || []) { const mt = mealTotals(m); if (mt) { any = true; for (const k of ['kcal', 'p', 'c', 'f']) t[k] += mt[k]; Object.assign(t.has, mt.has); } } return any ? t : null; }
const macroLine = t => t ? [['kcal', v => v + ' kcal'], ['p', v => 'P ' + v + ' g'], ['c', v => 'C ' + v + ' g'], ['f', v => 'G ' + v + ' g']].filter(([k]) => t.has[k]).map(([k, fn]) => fn(Math.round(t[k]))).join(' · ') : '';
function vNutrition(c) {
  const pl = c.nutrition;
  if (!pl) return `<div class="dhead"><h2>Nutriție</h2><button class="btn pri" data-act="nplan">+ Creează planul</button></div><div class="empty">Niciun plan încă. Alegi alimentele din bază, pui gramajul și totul se calculează singur.</div><div class="muted small">Alimentele tale le adaugi din fereastra de alegere sau din <button class="link" data-act="go" data-v="biblioteca">Bibliotecă</button>.</div>`;
  const tot = planTotals(pl);
  return `<div class="dhead"><h2>Nutriție</h2><div class="tools"><button class="btn" data-act="nplan">Editează planul</button><button class="btn pri" data-act="nexport" ${downloads ? '' : 'disabled'}>Salvează ca imagine</button></div></div>
  <article class="np">
    <div><div class="kicker">Plan alimentar · ${esc(c.name)}${pl.updated ? ' · actualizat ' + esc(fd(pl.updated)) : ''}</div><div class="np-title grad" style="margin-top:10px">${esc(pl.title || 'Planul tău')}</div></div>
    ${MAC.some(([k]) => pl[k]) ? `<div class="macros">${MAC.filter(([k]) => pl[k]).map(([k, u, l]) => `<div class="macro"><span class="v grad num">${esc(pl[k])}<small> ${u}</small></span><span class="l">${l}</span></div>`).join('')}</div>` : ''}
    ${tot ? `<div class="muted small">Total din alimentele trecute: ${esc(macroLine(tot))}</div>` : ''}
    ${pl.note ? `<p style="white-space:pre-wrap;max-width:68ch">${esc(pl.note)}</p>` : ''}
    <div class="meals">${(pl.meals || []).map(m => { const mt = mealTotals(m); return `<div class="meal"><div class="t num">${esc(m.time || '')}</div><div style="min-width:0"><div class="mn">${esc(m.name || 'Masă')}</div>
      ${(m.items || []).map(it => `<div class="food"><span>${esc(it.food)}</span><span class="q">${esc(it.qty || '')}</span></div>`).join('')}
      ${mt ? `<div class="mm">${esc(macroLine(mt))}</div>` : ''}${m.alt ? `<div class="alt">Variantă: ${esc(m.alt)}</div>` : ''}</div></div>`; }).join('')}</div>
    ${(pl.rules || []).length ? `<div class="rules"><div class="kicker" style="color:var(--rose)">Reguli</div><ul>${pl.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    <div class="wm" style="font-size:20px">eugen<b>.method</b></div>
  </article>
  <div><button class="btn sm danger" data-act="delplan">Șterge planul</button></div>
  <div class="muted small">Alimentele și exercițiile tale le găsești în <button class="link" data-act="go" data-v="biblioteca">Bibliotecă</button>.</div>`;
}
/* Baza de alimente: valori la 100 g (kcal, proteine, carbohidrați, grăsimi) după USDA FoodData Central (SR Legacy).
   Ultima coloană = greutatea unei bucăți, în grame, unde are sens. */
const FOODS = [
  ['Carne și pește', 'Piept de pui, crud', 120, 22.5, 0, 2.6],
  ['Carne și pește', 'Piept de pui, gătit', 165, 31, 0, 3.6],
  ['Carne și pește', 'Pulpă de pui fără piele, crudă', 121, 19.9, 0, 4.1],
  ['Carne și pește', 'Pulpă de pui fără piele, gătită', 209, 25.9, 0, 10.9],
  ['Carne și pește', 'Piept de curcan, crud', 114, 23.7, 0.1, 1.5],
  ['Carne și pește', 'Carne tocată de vită 5% grăsime, crudă', 137, 21.4, 0, 5],
  ['Carne și pește', 'Carne tocată de vită 10% grăsime, crudă', 176, 20, 0, 10],
  ['Carne și pește', 'Carne tocată de vită 20% grăsime, crudă', 254, 17.2, 0, 20],
  ['Carne și pește', 'Mușchiuleț de porc, crud', 120, 20.9, 0, 3.5],
  ['Carne și pește', 'Ficat de pui, crud', 119, 16.9, 0.7, 4.8],
  ['Carne și pește', 'Somon de crescătorie, crud', 208, 20.4, 0, 13.4],
  ['Carne și pește', 'Somon sălbatic, crud', 142, 19.8, 0, 6.3],
  ['Carne și pește', 'Ton în apă (conservă), scurs', 116, 25.5, 0, 0.8],
  ['Carne și pește', 'Ton în ulei (conservă), scurs', 198, 29.1, 0, 8.2],
  ['Carne și pește', 'Cod, crud', 82, 17.8, 0, 0.7],
  ['Carne și pește', 'Păstrăv, crud', 141, 19.9, 0, 6.2],
  ['Carne și pește', 'Macrou, crud', 205, 18.6, 0, 13.9],
  ['Carne și pește', 'Creveți, cruzi', 85, 20.1, 0, 0.5],
  ['Ouă și lactate', 'Ou întreg', 143, 12.6, 0.7, 9.5, 50],
  ['Ouă și lactate', 'Albuș de ou', 52, 10.9, 0.7, 0.2, 33],
  ['Ouă și lactate', 'Gălbenuș de ou', 322, 15.9, 3.6, 26.5, 17],
  ['Ouă și lactate', 'Lapte integral 3,25%', 61, 3.2, 4.8, 3.3],
  ['Ouă și lactate', 'Lapte 2%', 50, 3.3, 4.8, 2],
  ['Ouă și lactate', 'Lapte degresat', 34, 3.4, 5, 0.1],
  ['Ouă și lactate', 'Iaurt grecesc 0%', 59, 10.2, 3.6, 0.4],
  ['Ouă și lactate', 'Iaurt grecesc 2%', 73, 10, 3.9, 1.9],
  ['Ouă și lactate', 'Iaurt grecesc integral', 97, 9, 4, 5],
  ['Ouă și lactate', 'Iaurt simplu integral', 61, 3.5, 4.7, 3.3],
  ['Ouă și lactate', 'Brânză cottage 2%', 81, 10.5, 4.8, 2.3],
  ['Ouă și lactate', 'Brânză cottage 4%', 98, 11.1, 3.4, 4.3],
  ['Ouă și lactate', 'Mozzarella light', 254, 24.3, 2.8, 15.9],
  ['Ouă și lactate', 'Mozzarella', 300, 22.2, 2.2, 22.4],
  ['Ouă și lactate', 'Brânză feta', 264, 14.2, 4.1, 21.3],
  ['Ouă și lactate', 'Cheddar', 403, 24.9, 1.3, 33.1],
  ['Ouă și lactate', 'Parmezan ras', 431, 38.5, 4.1, 28.6],
  ['Ouă și lactate', 'Smântână 20%', 198, 2.4, 4.6, 19.4],
  ['Ouă și lactate', 'Unt', 717, 0.9, 0.1, 81.1],
  ['Cereale și carbohidrați', 'Fulgi de ovăz', 389, 16.9, 66.3, 6.9],
  ['Cereale și carbohidrați', 'Orez alb, crud', 365, 7.1, 80, 0.7],
  ['Cereale și carbohidrați', 'Orez alb, fiert', 130, 2.7, 28.2, 0.3],
  ['Cereale și carbohidrați', 'Orez brun, crud', 370, 7.9, 77.2, 2.9],
  ['Cereale și carbohidrați', 'Orez brun, fiert', 123, 2.7, 25.6, 1],
  ['Cereale și carbohidrați', 'Paste, crude', 371, 13, 74.7, 1.5],
  ['Cereale și carbohidrați', 'Paste, fierte', 158, 5.8, 30.9, 0.9],
  ['Cereale și carbohidrați', 'Cartofi, cruzi', 77, 2, 17.5, 0.1],
  ['Cereale și carbohidrați', 'Cartofi fierți', 86, 1.7, 20, 0.1],
  ['Cereale și carbohidrați', 'Cartofi copți cu coajă', 93, 2.5, 21.2, 0.1],
  ['Cereale și carbohidrați', 'Cartof dulce, crud', 86, 1.6, 20.1, 0.1],
  ['Cereale și carbohidrați', 'Cartof dulce, copt', 90, 2, 20.7, 0.2],
  ['Cereale și carbohidrați', 'Pâine albă', 266, 7.6, 49.4, 3.3, 25],
  ['Cereale și carbohidrați', 'Pâine integrală', 247, 13, 41.3, 3.4, 30],
  ['Cereale și carbohidrați', 'Mălai', 370, 7.1, 79.5, 1.8],
  ['Cereale și carbohidrați', 'Quinoa, crudă', 368, 14.1, 64.2, 6.1],
  ['Cereale și carbohidrați', 'Quinoa, fiartă', 120, 4.4, 21.3, 1.9],
  ['Cereale și carbohidrați', 'Hrișcă, crudă', 343, 13.3, 71.5, 3.4],
  ['Cereale și carbohidrați', 'Hrișcă, fiartă', 92, 3.4, 19.9, 0.6],
  ['Cereale și carbohidrați', 'Bulgur, crud', 342, 12.3, 75.9, 1.3],
  ['Cereale și carbohidrați', 'Cuscus, crud', 376, 12.8, 77.4, 0.6],
  ['Cereale și carbohidrați', 'Rondele de orez expandat', 387, 8.2, 81.5, 2.8, 9],
  ['Cereale și carbohidrați', 'Făină albă', 364, 10.3, 76.3, 1],
  ['Cereale și carbohidrați', 'Miere', 304, 0.3, 82.4, 0],
  ['Cereale și carbohidrați', 'Zahăr', 387, 0, 100, 0],
  ['Cereale și carbohidrați', 'Gem', 278, 0.4, 68.9, 0.1],
  ['Leguminoase', 'Linte, uscată', 352, 24.6, 63.4, 1.1],
  ['Leguminoase', 'Linte, fiartă', 116, 9, 20.1, 0.4],
  ['Leguminoase', 'Năut, uscat', 378, 20.5, 63, 6],
  ['Leguminoase', 'Năut, fiert', 164, 8.9, 27.4, 2.6],
  ['Leguminoase', 'Fasole roșie, fiartă', 127, 8.7, 22.8, 0.5],
  ['Leguminoase', 'Fasole albă, fiartă', 140, 8.2, 26.1, 0.6],
  ['Leguminoase', 'Mazăre verde congelată', 77, 5.2, 13.6, 0.4],
  ['Leguminoase', 'Tofu ferm', 144, 17.3, 2.8, 8.7],
  ['Leguminoase', 'Hummus', 166, 7.9, 14.3, 9.6],
  ['Legume', 'Broccoli', 34, 2.8, 6.6, 0.4],
  ['Legume', 'Conopidă', 25, 1.9, 5, 0.3],
  ['Legume', 'Spanac', 23, 2.9, 3.6, 0.4],
  ['Legume', 'Roșii', 18, 0.9, 3.9, 0.2],
  ['Legume', 'Castraveți', 15, 0.7, 3.6, 0.1],
  ['Legume', 'Ardei gras roșu', 31, 1, 6, 0.3],
  ['Legume', 'Ardei gras verde', 20, 0.9, 4.6, 0.2],
  ['Legume', 'Morcovi', 41, 0.9, 9.6, 0.2],
  ['Legume', 'Ceapă', 40, 1.1, 9.3, 0.1],
  ['Legume', 'Usturoi', 149, 6.4, 33.1, 0.5],
  ['Legume', 'Dovlecei', 17, 1.2, 3.1, 0.3],
  ['Legume', 'Vinete', 25, 1, 5.9, 0.2],
  ['Legume', 'Varză albă', 25, 1.3, 5.8, 0.1],
  ['Legume', 'Salată verde', 17, 1.2, 3.3, 0.3],
  ['Legume', 'Ciuperci champignon', 22, 3.1, 3.3, 0.3],
  ['Legume', 'Fasole verde', 31, 1.8, 7, 0.2],
  ['Legume', 'Sfeclă roșie', 43, 1.6, 9.6, 0.2],
  ['Legume', 'Porumb dulce', 86, 3.3, 18.7, 1.4],
  ['Legume', 'Passata de roșii', 38, 1.7, 9, 0.2],
  ['Legume', 'Avocado', 160, 2, 8.5, 14.7],
  ['Fructe', 'Măr', 52, 0.3, 13.8, 0.2, 180],
  ['Fructe', 'Banană', 89, 1.1, 22.8, 0.3, 118],
  ['Fructe', 'Portocală', 47, 0.9, 11.8, 0.1, 130],
  ['Fructe', 'Kiwi', 61, 1.1, 14.7, 0.5, 70],
  ['Fructe', 'Căpșuni', 32, 0.7, 7.7, 0.3],
  ['Fructe', 'Afine', 57, 0.7, 14.5, 0.3],
  ['Fructe', 'Zmeură', 52, 1.2, 11.9, 0.7],
  ['Fructe', 'Struguri', 69, 0.7, 18.1, 0.2],
  ['Fructe', 'Pară', 57, 0.4, 15.2, 0.1, 180],
  ['Fructe', 'Ananas', 50, 0.5, 13.1, 0.1],
  ['Fructe', 'Pepene roșu', 30, 0.6, 7.6, 0.2],
  ['Fructe', 'Piersică', 39, 0.9, 9.5, 0.3, 150],
  ['Fructe', 'Prune', 46, 0.7, 11.4, 0.3],
  ['Fructe', 'Mango', 60, 0.8, 15, 0.4],
  ['Fructe', 'Curmale Medjool', 277, 1.8, 75, 0.2, 24],
  ['Fructe', 'Stafide', 299, 3.1, 79.2, 0.5],
  ['Fructe', 'Suc de portocale', 45, 0.7, 10.4, 0.2],
  ['Nuci, semințe și grăsimi', 'Migdale', 579, 21.2, 21.6, 49.9],
  ['Nuci, semințe și grăsimi', 'Nuci', 654, 15.2, 13.7, 65.2],
  ['Nuci, semințe și grăsimi', 'Caju', 553, 18.2, 30.2, 43.9],
  ['Nuci, semințe și grăsimi', 'Alune de pădure', 628, 15, 16.7, 60.8],
  ['Nuci, semințe și grăsimi', 'Arahide', 567, 25.8, 16.1, 49.2],
  ['Nuci, semințe și grăsimi', 'Unt de arahide', 588, 25.1, 19.6, 50.4],
  ['Nuci, semințe și grăsimi', 'Semințe de chia', 486, 16.5, 42.1, 30.7],
  ['Nuci, semințe și grăsimi', 'Semințe de in', 534, 18.3, 28.9, 42.2],
  ['Nuci, semințe și grăsimi', 'Semințe de floarea-soarelui', 584, 20.8, 20, 51.5],
  ['Nuci, semințe și grăsimi', 'Semințe de dovleac', 559, 30.2, 10.7, 49],
  ['Nuci, semințe și grăsimi', 'Ulei de măsline', 884, 0, 0, 100],
  ['Nuci, semințe și grăsimi', 'Ulei de floarea-soarelui', 884, 0, 0, 100],
  ['Nuci, semințe și grăsimi', 'Ulei de cocos', 892, 0, 0, 99.1],
  ['Nuci, semințe și grăsimi', 'Ciocolată neagră 70–85%', 598, 7.8, 45.9, 42.6],
  ['Altele', 'Ciocolată cu lapte', 535, 7.7, 59.4, 29.7],
  ['Altele', 'Maioneză', 680, 1, 0.6, 74.9],
  ['Altele', 'Ketchup', 101, 1, 27.4, 0.1],
  ['Altele', 'Muștar', 60, 3.7, 5.8, 3.3],
  ['Altele', 'Bere', 43, 0.5, 3.6, 0],
  ['Altele', 'Vin roșu', 85, 0.1, 2.6, 0]
];
let CUSTOM = []; let FMAP = null;
function fmap() {
  if (FMAP) return FMAP;
  FMAP = new Map();
  FOODS.forEach(([cat, name, kcal, p, c, f, piece]) => FMAP.set(name.toLowerCase(), { cat, name, kcal, p, c, f, piece: piece || 0, src: 'USDA' }));
  CUSTOM.forEach(x => FMAP.set(String(x.name).toLowerCase(), { cat: 'Alimentele mele', name: x.name, kcal: num(x.kcal) || 0, p: num(x.p) || 0, c: num(x.c) || 0, f: num(x.f) || 0, piece: num(x.piece) || 0, src: 'etichetă', id: x.id }));
  return FMAP;
}
const findFood = n => fmap().get(String(n || '').trim().toLowerCase()) || null;
const r1 = n => Math.round(n * 10) / 10;
function calcFood(fo, amount, unit) {
  const g = unit === 'buc' ? amount * (fo.piece || 0) : amount, k = g / 100;
  return { g: r1(g), kcal: Math.round(fo.kcal * k), p: r1(fo.p * k), c: r1(fo.c * k), f: r1(fo.f * k) };
}
/* ---------- biblioteca de exerciții ---------- */
const EXLIB = {
  'Piept': ['Împins cu bara la orizontală', 'Împins cu bara la înclinat', 'Împins cu bara la declinat', 'Împins cu gantere la orizontală', 'Împins cu gantere la înclinat', 'Împins cu gantere la declinat', 'Împins la aparat', 'Împins înclinat la aparat', 'Împins la Smith la orizontală', 'Împins la Smith la înclinat', 'Fluturări cu gantere la orizontală', 'Fluturări cu gantere la înclinat', 'Fluturări la aparat (pec deck)', 'Crossover la cablu de sus', 'Crossover la cablu de jos', 'Fluturări la cablu din poziție medie', 'Flotări', 'Flotări cu greutate', 'Paralele pentru piept', 'Pullover cu gantera'],
  'Spate': ['Tracțiuni priză largă', 'Tracțiuni priză neutră', 'Tracțiuni priză supinată', 'Tracțiuni asistate', 'Tracțiuni la helcometru priză largă', 'Tracțiuni la helcometru priză neutră', 'Tracțiuni la helcometru cu un braț', 'Ramat cu bara', 'Ramat cu bara priză supinată', 'Ramat Pendlay', 'Ramat cu gantera cu un braț', 'Ramat la cablu așezat', 'Ramat la cablu cu un braț', 'Ramat la aparat cu pieptul sprijinit', 'Ramat T-bar', 'Ramat Meadows', 'Seal row', 'Ramat la Smith', 'Pullover la cablu cu brațele întinse', 'Îndreptări', 'Hiperextensii', 'Shrugs cu bara', 'Shrugs cu gantere'],
  'Umeri': ['Împins militar cu bara', 'Împins cu gantere deasupra capului', 'Împins la aparat pentru umeri', 'Arnold press', 'Ridicări laterale cu gantere', 'Ridicări laterale la cablu', 'Ridicări laterale la aparat', 'Ridicări laterale din aplecat', 'Ridicări frontale cu gantere', 'Ridicări frontale la cablu', 'Fluturări inverse cu gantere', 'Fluturări inverse la aparat', 'Face pull', 'Ramat vertical', 'Y-raise'],
  'Biceps': ['Flexii cu bara', 'Flexii cu bara EZ', 'Flexii cu gantere alternativ', 'Flexii ciocan', 'Flexii la banca Scott', 'Flexii la aparat', 'Flexii la cablu', 'Flexii Bayesian la cablu', 'Flexii înclinate cu gantere', 'Flexii concentrate', 'Flexii spider'],
  'Triceps': ['Extensii la cablu cu frânghie', 'Extensii la cablu cu bara', 'Extensii deasupra capului la cablu', 'Extensii deasupra capului cu gantera', 'Skull crusher cu bara EZ', 'Împins cu priză îngustă', 'Paralele pentru triceps', 'Dips la bancă', 'Kickback cu gantera', 'Extensii la aparat', 'JM press'],
  'Cvadricepși': ['Genuflexiuni cu bara', 'Genuflexiuni frontale', 'Genuflexiuni la Smith', 'Goblet squat', 'Hack squat', 'Pendulum squat', 'Belt squat', 'Presa pentru picioare', 'Presa pentru picioare la 45°', 'Genuflexiuni bulgărești', 'Fandări cu gantere', 'Fandări mergând', 'Fandări inverse', 'Step-up pe bancă', 'Extensii pentru cvadricepși la aparat', 'Sissy squat'],
  'Femurali și fesieri': ['Îndreptări românești cu bara', 'Îndreptări românești cu gantere', 'Îndreptări cu picioarele întinse', 'Îndreptări sumo', 'Îndreptări cu bara hexagonală', 'Good morning', 'Flexii femurale așezat', 'Flexii femurale culcat', 'Flexii femurale din picioare', 'Nordic curl', 'Hip thrust cu bara', 'Hip thrust la aparat', 'Pod pentru fesieri', 'Kickback pentru fesieri la cablu', 'Pull-through la cablu', 'Extensii de șold la 45°', 'Abducții la aparat', 'Adducții la aparat'],
  'Gambe': ['Ridicări pe vârfuri din picioare', 'Ridicări pe vârfuri așezat', 'Ridicări pe vârfuri la presa pentru picioare', 'Ridicări pe vârfuri la Smith', 'Ridicări pe vârfuri pe un picior'],
  'Abdomen': ['Crunch la cablu', 'Abdomene la aparat', 'Abdomene inverse', 'Ridicări de picioare la bară', 'Ridicări de genunchi la paralele', 'Ab wheel', 'Plank', 'Plank lateral', 'Dead bug', 'Pallof press', 'Woodchop la cablu', 'Russian twist'],
  'Altele': ['Farmer’s walk', 'Kettlebell swing', 'Sled push', 'Flexii de încheietură', 'Extensii de încheietură']
};
let CUSTOMEX = [];
function exItems() {
  const m = new Map();
  Object.entries(EXLIB).forEach(([cat, arr]) => arr.forEach(n => m.set(n.toLowerCase(), { name: n, cat })));
  CUSTOMEX.forEach(x => m.set(String(x.name).toLowerCase(), { name: x.name, cat: 'Exercițiile mele', group: x.cat || '', id: x.id }));
  const c = getC(S.sel);
  if (c) allSets(c).forEach(s => { if (!m.has(String(s.ex).toLowerCase())) m.set(String(s.ex).toLowerCase(), { name: s.ex, cat: 'Exercițiile mele' }); });
  return [...m.values()];
}
async function addCustomEx(name, cat) {
  if (CUSTOMEX.some(x => same(x.name, name)) || Object.values(EXLIB).flat().some(n => same(n, name))) return false;
  const id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const doc = { name, cat: cat || '' };
  CUSTOMEX = [...CUSTOMEX, { ...doc, id }];
  if (db) { try { await db.collection('exercises').doc(id).set(doc); } catch (e) { toast(errMsg(e)); } }
  return true;
}
function choosePick(name) {
  if (!pick) return; const { kind, input } = pick; closePicker();
  input.value = name;
  if (kind === 'food') {
    const row = input.closest('.fr'); if (!row) return; const nx = row.nextElementSibling; if (nx && nx.classList.contains('qf')) nx.remove();
    const fo = findFood(name), amt = row.querySelector('.f-amt');
    if (fo && fo.piece && !amt.value) row.querySelector('.f-unit').value = 'buc';
    recalcNutri(); amt.focus();
  } else {
    const bl = input.closest('.exb'); if (bl) { updatePrev(bl); const k = bl.querySelector('.s-kg'); if (k) k.focus(); }
    else { const n = document.getElementById('lkg'); if (n) n.focus(); }
  }
}
function pickNewForm(q) {
  const box = $('#plist'); if (!box || !pick) return;
  box.innerHTML = pick.kind === 'ex'
    ? `<form class="stack pkf" data-form="pkex"><h3 class="pkf-t">Exercițiu nou</h3><label class="f">Nume<input id="pxn" required value="${esc(q || '')}" placeholder="ex: Ramat la aparat Hammer, priză neutră"></label><label class="f">Grupa musculară<select id="pxg">${Object.keys(EXLIB).map(k => `<option>${esc(k)}</option>`).join('')}</select></label><p class="muted small">Rămâne salvat în biblioteca ta și apare la toți clienții.</p><div class="tools"><button type="button" class="btn ghost" data-act="pkback">Înapoi la listă</button><button class="btn pri">Salvează și alege</button></div></form>`
    : `<form class="stack pkf" data-form="pkfood"><h3 class="pkf-t">Aliment nou</h3><label class="f">Nume<input id="pfn" required value="${esc(q || '')}" placeholder="ex: Iaurt proteic, vanilie"></label><div class="muted small">Valorile de pe etichetă, la 100 g:</div><div class="pkf-g"><label class="f">kcal<input id="pfk" inputmode="decimal" required></label><label class="f">Proteine<input id="pfp" inputmode="decimal" required></label><label class="f">Carbohidrați<input id="pfc" inputmode="decimal" required></label><label class="f">Grăsimi<input id="pff" inputmode="decimal" required></label></div><label class="f">1 bucată = câte grame (opțional)<input id="pfpc" inputmode="decimal" placeholder="ex: 150 pentru un iaurt"></label><div class="tools"><button type="button" class="btn ghost" data-act="pkback">Înapoi la listă</button><button class="btn pri">Salvează și alege</button></div></form>`;
  const f = box.querySelector('input'); f.focus(); if (q) f.select();
}

/* ---------- selector comun (alimente și exerciții) ---------- */
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stem = w => w.length >= 3 ? (w.replace(/(urile|ele|ile|uri|le|ii|i|e|a)$/, '') || w) : w;
let pick = null;
function openPicker(kind, input) {
  pick = { kind, input, cat: 'Toate' };
  let el = $('#picker'); if (!el) { el = document.createElement('div'); el.id = 'picker'; el.className = 'picker'; document.body.appendChild(el); }
  const items = kind === 'food' ? [...fmap().values()] : exItems();
  const cats = ['Toate', ...new Set(items.map(f => f.cat))];
  const recent = kind === 'ex' ? [] : null;
  el.innerHTML = `<div class="pk" role="dialog" aria-modal="true" aria-label="${kind === 'food' ? 'Alege aliment' : 'Alege exercițiu'}"><div class="pk-h"><div class="panel-h"><h2>${kind === 'food' ? 'Alege aliment' : 'Alege exercițiu'}</h2><div class="tools" style="flex-wrap:nowrap"><button type="button" class="btn sm" data-act="pknew">+ ${kind === 'food' ? 'Aliment nou' : 'Exercițiu nou'}</button><button type="button" class="mx" data-act="pkclose" aria-label="Închide">×</button></div></div>
    <input id="pq" type="search" placeholder="${kind === 'food' ? 'Caută: ovaz, pui, oua…' : 'Caută: impins, genuflexiuni, ramat…'}" autocomplete="off" value="${esc(input.value)}">
    <div class="chips">${cats.map(c => `<button type="button" class="chip" data-act="pkcat" data-v="${esc(c)}" aria-pressed="${c === 'Toate'}">${esc(c)}</button>`).join('')}</div></div>
    <div class="pk-l" id="plist"></div></div>`;
  el.hidden = false; lockScroll(); renderPickList(); const q = $('#pq'); q.focus(); q.select();
}
function closePicker() { const el = $('#picker'); if (el) { el.hidden = true; el.innerHTML = ''; } pick = null; lockScroll(); }
function renderPickList() {
  if (!pick) return;
  const raw = (($('#pq') || {}).value || '').trim();
  const words = norm(raw).split(/\s+/).filter(Boolean).map(stem);
  const items = pick.kind === 'food' ? [...fmap().values()] : exItems();
  const all = items.filter(f => (pick.cat === 'Toate' || f.cat === pick.cat) && words.every(w => norm(f.name).includes(w)));
  const score = f => { const n = norm(f.name), ws = n.split(/[\s,()]+/); if (words[0] && n.startsWith(words[0])) return 0; return words.every(w => ws.some(x => x.startsWith(w))) ? 1 : 2; };
  const groups = {};
  if (pick.kind === 'ex' && !words.length && pick.cat === 'Toate') {
    const c = getC(S.sel); const used = c ? [...new Set([...(c.workouts || [])].sort((a, b) => (a.d < b.d ? 1 : -1)).flatMap(w => (w.ex || []).map(e => e.name)))].slice(0, 8) : [];
    if (used.length) groups['Folosite recent de client'] = used.map(n => items.find(x => same(x.name, n)) || { name: n, cat: '' });
  }
  if (words.length) groups['Rezultate'] = all.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, 'ro'));
  else all.forEach(f => { (groups[f.cat] = groups[f.cat] || []).push(f); });
  const order = pick.kind === 'food' ? ['Rezultate', 'Alimentele mele', ...new Set(FOODS.map(f => f[0]))] : ['Folosite recent de client', 'Rezultate', 'Exercițiile mele', ...Object.keys(EXLIB)];
  const line = (f, g) => pick.kind === 'food'
    ? `<button type="button" class="pk-i" data-act="pickitem" data-name="${esc(f.name)}"><b>${esc(f.name)}</b><span>${f.kcal} kcal · P ${f.p} · C ${f.c} · G ${f.f}</span>${f.piece ? `<small>1 buc ≈ ${f.piece} g</small>` : ''}</button>`
    : `<button type="button" class="pk-i" data-act="pickitem" data-name="${esc(f.name)}"><b>${esc(f.name)}</b>${f.group ? `<span>${esc(f.group)}</span>` : (g === 'Rezultate' || g.startsWith('Folosite')) ? `<span>${esc(f.cat || '')}</span>` : ''}</button>`;
  let html = order.filter(c => groups[c] && groups[c].length).map(c => `<div class="pk-cat">${esc(c)}</div>` + groups[c].map(f => line(f, c)).join('')).join('');
  if (raw && !items.some(x => same(x.name, raw))) html += `<div class="pk-cat">Nu găsești?</div><button type="button" class="pk-i" data-act="picknew"><b>+ Adaugă „${esc(raw)}”</b><small>${pick.kind === 'food' ? 'Treci valorile de pe etichetă o dată și apare la toți clienții.' : 'Îl salvez în exercițiile tale și apare la toți clienții.'}</small></button>`;
  if (!html) html = `<div class="empty">Nimic aici încă.</div>`;
  $('#plist').innerHTML = html + (pick.kind === 'food' ? `<div class="muted small" style="padding:12px 8px">Valori la 100 g.</div>` : '');
}
function lockScroll() {
  const open = !$('#ov').hidden || ($('#picker') && !$('#picker').hidden);
  document.documentElement.style.overflow = open ? 'hidden' : '';
}
function foodDatalist() { return `<datalist id="fdl">${[...fmap().values()].map(f => `<option value="${esc(f.name)}"></option>`).join('')}</datalist>`; }
function foodRow(it) {
  it = it || {};
  const n = it.n ?? (it.qty ? num(String(it.qty)) : '');
  const unit = it.unit || 'g';
  return `<div class="fr"><input class="f-food" readonly inputmode="none" data-act="pick" placeholder="Alege aliment ▾" value="${esc(it.food || '')}" aria-label="Aliment, apasă ca să alegi"><input class="f-amt" inputmode="decimal" placeholder="100" value="${esc(n ?? '')}" aria-label="Cantitate"><select class="f-unit" aria-label="Unitate"><option value="g"${unit === 'g' ? ' selected' : ''}>g</option><option value="buc"${unit === 'buc' ? ' selected' : ''}>buc</option></select><span class="f-out"></span><button type="button" class="x" data-act="rmfood" aria-label="Scoate alimentul">×</button></div>`;
}
function mealBlock(m) {
  m = m || { items: [{}, {}] };
  return `<div class="exb mealb"><div class="exb-h"><input class="m-time" placeholder="08:00" value="${esc(m.time || '')}" style="max-width:96px" aria-label="Ora"><input class="m-name" placeholder="Mic dejun" value="${esc(m.name || '')}" aria-label="Numele mesei"><button type="button" class="x" data-act="rmmeal" aria-label="Scoate masa">×</button></div>
    <div class="foods">${(m.items && m.items.length ? m.items : [{}]).map(foodRow).join('')}</div>
    <div class="panel-h"><button type="button" class="btn sm ghost" data-act="addfood">+ Aliment</button><span class="m-tot mm" style="margin:0"></span></div>
    <input class="m-alt" placeholder="Variantă (opțional): ex. 200 g iaurt grecesc în loc de ouă" value="${esc(m.alt || '')}" aria-label="Variantă"></div>`;
}
const fmtMac = t => `${Math.round(t.kcal)} kcal · P ${Math.round(t.p)} · C ${Math.round(t.c)} · G ${Math.round(t.f)}`;
function recalcNutri() {
  const day = { kcal: 0, p: 0, c: 0, f: 0 };
  document.querySelectorAll('#nmeals .mealb').forEach(mb => {
    const mt = { kcal: 0, p: 0, c: 0, f: 0 }; let any = false;
    mb.querySelectorAll('.fr').forEach(r => {
      const name = r.querySelector('.f-food').value, fo = findFood(name), out = r.querySelector('.f-out'), sel = r.querySelector('.f-unit');
      const bucOpt = sel.querySelector('option[value=buc]'); bucOpt.disabled = !(fo && fo.piece);
      if (bucOpt.disabled && sel.value === 'buc') sel.value = 'g';
      const amt = num(r.querySelector('.f-amt').value);
      const next = r.nextElementSibling; const hasQf = next && next.classList.contains('qf');
      const setOut = h => { if (out.dataset.h !== h) { out.dataset.h = h; out.innerHTML = h; } };
      if (!name.trim()) { setOut(''); return; }
      if (!fo) { setOut(hasQf ? '<span class="muted">completează valorile mai jos</span>' : '<button type="button" class="link" data-act="quickfood">nu e în bază · adaugă-l</button>'); return; }
      out.dataset.h = '';
      if (hasQf) next.remove();
      if (amt == null) { out.textContent = `${fo.kcal} kcal / 100 g` + (fo.piece ? ` · 1 buc = ${fo.piece} g` : ''); return; }
      const v = calcFood(fo, amt, sel.value); any = true;
      for (const k in mt) mt[k] += v[k];
      out.textContent = fmtMac(v) + (sel.value === 'buc' ? ` (${v.g} g)` : '');
    });
    mb.querySelector('.m-tot').textContent = any ? 'Total masă: ' + fmtMac(mt) : '';
    for (const k in day) day[k] += mt[k];
  });
  const box = $('#ntot'); if (!box) return;
  const tgt = k => num(($('#n_' + k) || {}).value);
  box.innerHTML = `<div class="kicker" style="color:var(--rose)">Total pe zi</div><div class="tot-grid">${MAC.map(([k, u, l]) => {
    const t = tgt(k), val = day[k], pct = t ? Math.min(100, (val / t) * 100) : 0, diff = t ? Math.round(val - t) : null;
    return `<div class="tot"><div class="l">${l}</div><div class="v num">${Math.round(val)}${t ? `<small> / ${Math.round(t)} ${u}</small>` : `<small> ${u}</small>`}</div>${t ? `<div class="bar-t"><i style="width:${pct}%;${Math.abs(val - t) <= t * 0.05 ? 'background:var(--ok)' : ''}"></i></div><div class="d num ${Math.abs(val - t) <= t * 0.05 ? 'ok' : ''}">${diff > 0 ? '+' : ''}${diff} ${u}</div>` : ''}</div>`;
  }).join('')}</div>`;
}
function nutritionForm() {
  const c = getC(S.sel); const pl = c.nutrition || { title: 'Plan alimentar', meals: [{ name: 'Mic dejun', time: '08:00', items: [{}, {}] }, { name: 'Prânz', time: '13:00', items: [{}, {}] }, { name: 'Cină', time: '19:00', items: [{}, {}] }], rules: [] };
  openOv(`<h2>Plan alimentar</h2>
  <form class="stack" data-form="nutrition">
    <label class="f">Titlu<input id="nt" value="${esc(pl.title || '')}" placeholder="ex: Recompoziție · 2.300 kcal"></label>
    <div class="macros">${MAC.map(([k, u, l]) => `<label class="f">${l} țintă (${u})<input id="n_${k}" inputmode="numeric" value="${esc(pl[k] ?? '')}"></label>`).join('')}</div>
    <div id="ntot" class="ntot"></div>
    <label class="f">Mesaj pentru client<textarea id="nn" placeholder="ex: Cântărește alimentele crude. Dacă sari o masă, nu dubla porția la următoarea.">${esc(pl.note || '')}</textarea></label>
    <div class="sec" style="font-size:12px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--rose)">Mese</div>
    <div class="muted small">Apeși pe „Alege aliment”, cauți sau răsfoiești pe categorii, apoi pui cantitatea. Valorile se calculează singure. Unde vezi „buc”, poți pune bucăți (ouă, banane, felii de pâine).</div>
    <div id="nmeals" style="display:flex;flex-direction:column;gap:10px">${(pl.meals || []).map(mealBlock).join('')}</div>
    <div><button type="button" class="btn sm" data-act="addmeal">+ Masă</button></div>
    <label class="f">Reguli, câte una pe rând<textarea id="nr" placeholder="2,5–3 L apă pe zi&#10;Creatină 5 g zilnic">${esc((pl.rules || []).join('\n'))}</textarea></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Renunță</button><button class="btn pri">Salvează planul</button></div>
  </form>`, true);
  recalcNutri();
}
function quickFoodRow(name) {
  return `<div class="qf"><div class="muted small">„${esc(name)}” nu e în bază. Trece valorile de pe etichetă, la 100 g:</div><div class="qf-g"><input class="q-kcal" inputmode="decimal" placeholder="kcal" aria-label="Calorii la 100 g"><input class="q-p" inputmode="decimal" placeholder="Proteine" aria-label="Proteine la 100 g"><input class="q-c" inputmode="decimal" placeholder="Carbohidrați" aria-label="Carbohidrați la 100 g"><input class="q-f" inputmode="decimal" placeholder="Grăsimi" aria-label="Grăsimi la 100 g"><input class="q-pc" inputmode="decimal" placeholder="1 buc = g (opț.)" aria-label="Greutatea unei bucăți"><button type="button" class="btn sm pri" data-act="saveqf">Salvează alimentul</button></div></div>`;
}
async function addCustomFood(f) {
  const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  CUSTOM = [...CUSTOM.filter(x => String(x.name).toLowerCase() !== f.name.toLowerCase()), { ...f, id }]; FMAP = null;
  if (db) { try { await db.collection('foods').doc(id).set(f); } catch (e) { toast(errMsg(e)); } }
}
function vLibrary() {
  const list = [...CUSTOMEX].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ro'));
  return `<section class="panel"><div class="panel-h"><h2>Backup</h2><div class="tools"><button class="btn" data-act="backup">Descarcă backup</button><button class="btn ghost" data-act="importpick">Importă backup</button></div></div><p class="muted small">Un fișier cu toți clienții, antrenamentele, planurile și pozele. Fă unul o dată pe lună și păstrează-l în Google Drive sau pe laptop.</p><input id="importfile" type="file" accept="application/json,.json" hidden></section>
  <div><div class="kicker">${Object.values(EXLIB).flat().length + list.length} exerciții · ${FOODS.length + CUSTOM.length} alimente</div><h1 style="margin-top:8px">Bibliotecă</h1></div>
  <section class="panel"><div class="panel-h"><h2>Exercițiile mele</h2><span class="muted small">${list.length} create de tine</span></div>
    <p class="muted small">Variante de aparat, exerciții de-ale tale, orice nu e în lista standard. Apar în căutare la toți clienții.</p>
    <form class="inl" data-form="myex"><label class="f" style="grid-column:span 2">Nume<input id="mxn" required placeholder="ex: Ramat la aparat Hammer, priză neutră"></label><label class="f">Grupa musculară<select id="mxg">${Object.keys(EXLIB).map(k => `<option>${esc(k)}</option>`).join('')}</select></label><button class="btn pri">Adaugă</button></form>
    ${list.length ? `<div class="tbl-w"><table><thead><tr><th>Exercițiu</th><th>Grupă</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td>${esc(x.name)}</td><td class="muted">${esc(x.cat || '—')}</td><td class="r"><button class="x" data-act="delex" data-id="${esc(x.id)}" aria-label="Șterge exercițiul">×</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>
  ${vMyFoods()}`;
}
function vMyFoods() {
  const list = [...CUSTOM].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ro'));
  return `<section class="panel"><div class="panel-h"><h2>Alimentele mele</h2><span class="muted small">${FOODS.length} alimente de bază + ${list.length} adăugate de tine</span></div>
    <p class="muted small">Produsele de marcă (whey, batoane, iaurturi anume) le adaugi aici cu valorile de pe etichetă. Apoi apar în căutare la orice client.</p>
    <form class="inl" data-form="myfood"><label class="f" style="grid-column:span 2">Aliment<input id="mfn" required placeholder="ex: Whey Gold Standard"></label><label class="f">kcal / 100 g<input id="mfk" inputmode="decimal" required></label><label class="f">Proteine<input id="mfp" inputmode="decimal" required></label><label class="f">Carbohidrați<input id="mfc" inputmode="decimal" required></label><label class="f">Grăsimi<input id="mff" inputmode="decimal" required></label><label class="f">1 buc = g<input id="mfpc" inputmode="decimal" placeholder="opțional"></label><button class="btn pri">Adaugă</button></form>
    ${list.length ? `<div class="tbl-w"><table><thead><tr><th>Aliment</th><th class="r">kcal</th><th class="r">P</th><th class="r">C</th><th class="r">G</th><th class="r">Buc</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${esc(x.kcal)}</td><td class="r">${esc(x.p)}</td><td class="r">${esc(x.c)}</td><td class="r">${esc(x.f)}</td><td class="r">${x.piece ? esc(x.piece) + ' g' : '—'}</td><td class="r"><button class="x" data-act="delfood" data-id="${esc(x.id)}" aria-label="Șterge alimentul">×</button></td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="muted" style="font-size:12px">Valorile din baza inclusă sunt după USDA FoodData Central, la 100 g. Sunt valori medii, deci pot diferi puțin de eticheta unui anumit produs.</div>
  </section>`;
}
function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
function wrapLines(x, t, mw) { const words = String(t || '').split(/\s+/).filter(Boolean); const out = []; let cur = ''; for (const w of words) { const tr = cur ? cur + ' ' + w : w; if (x.measureText(tr).width > mw && cur) { out.push(cur); cur = w; } else cur = tr; } if (cur) out.push(cur); return out; }
async function exportPlan(c) {
  if (!downloads) { toast('Salvarea fișierelor nu merge în această vizualizare.'); return; }
  const pl = c.nutrition; if (!pl) return;
  try {
    try { await Promise.all([document.fonts.load('80px Anton'), document.fonts.load('800 30px Inter'), document.fonts.load('500 30px Inter')]); } catch (e) {}
    const W = 1080, P = 72, IW = W - 2 * P, BONE = '#f4f1ea', MUT = 'rgba(244,241,234,0.62)', ROSE = '#e6ae9c';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = 100;
    const grad = x => { const g = x.createLinearGradient(0, 0, W, 0); [[0, '#F6EFE6'], [.26, '#EBCFC1'], [.5, '#E2A893'], [.62, '#F8E7DD'], [.8, '#D8957E'], [1, '#EFC6B4']].forEach(([o, col]) => g.addColorStop(o, col)); return g; };
    const heights = [];
    const layout = (x, draw) => {
      let y = P + 10; x.textBaseline = 'alphabetic';
      x.font = '800 24px Inter, sans-serif'; if (draw) { x.fillStyle = MUT; x.fillText(('Plan alimentar · ' + c.name).toUpperCase(), P, y); }
      y += 14; x.font = '96px Anton, Impact, sans-serif';
      for (const l of wrapLines(x, (pl.title || 'Planul tău').toUpperCase(), IW)) { y += 100; if (draw) { x.fillStyle = grad(x); x.fillText(l, P, y); } }
      y += 40;
      const mac = MAC.filter(([k]) => pl[k]);
      if (mac.length) {
        const gap = 16, bw = (IW - gap * (mac.length - 1)) / mac.length, bh = 136;
        if (draw) mac.forEach(([k, u, l], i) => {
          const bx = P + i * (bw + gap); rr(x, bx, y, bw, bh, 18); x.strokeStyle = 'rgba(244,241,234,0.16)'; x.lineWidth = 2; x.stroke();
          x.font = '60px Anton, Impact, sans-serif'; x.fillStyle = grad(x); const val = String(pl[k]); x.fillText(val, bx + 22, y + 76);
          const vw = x.measureText(val).width; x.font = '700 22px Inter, sans-serif'; x.fillStyle = MUT; x.fillText(u, bx + 30 + vw, y + 76); x.fillText(l.toUpperCase(), bx + 22, y + 114);
        });
        y += bh + 30;
      }
      if (pl.note) { x.font = '500 28px Inter, sans-serif'; for (const l of wrapLines(x, pl.note, IW)) { y += 42; if (draw) { x.fillStyle = 'rgba(244,241,234,0.85)'; x.fillText(l, P, y); } } y += 26; }
      (pl.meals || []).forEach((m, mi) => {
        const top = y + 16, pad = 32, qw = 230; let yy = top + pad;
        if (draw) { rr(x, P, top, IW, heights[mi], 22); x.fillStyle = '#151313'; x.fill(); x.strokeStyle = 'rgba(230,174,156,0.38)'; x.lineWidth = 2; x.stroke(); }
        x.font = '48px Anton, Impact, sans-serif'; const tw = m.time ? x.measureText(m.time).width + 22 : 0;
        yy += 44; if (draw && m.time) { x.fillStyle = ROSE; x.fillText(m.time, P + pad, yy); }
        x.font = '800 32px Inter, sans-serif'; if (draw) { x.fillStyle = BONE; x.fillText(m.name || 'Masă', P + pad + tw, yy - 4); }
        yy += 18;
        for (const it of m.items || []) {
          x.font = '500 30px Inter, sans-serif'; const lines = wrapLines(x, it.food, IW - 2 * pad - qw);
          lines.forEach((l, li) => { yy += 46; if (draw) { x.fillStyle = BONE; x.font = '500 30px Inter, sans-serif'; x.fillText(l, P + pad, yy); if (li === 0 && it.qty) { x.font = '600 30px Inter, sans-serif'; x.fillStyle = MUT; const qwid = x.measureText(it.qty).width; x.fillText(it.qty, P + IW - pad - qwid, yy); } } });
          yy += 10; if (draw) { x.strokeStyle = 'rgba(244,241,234,0.08)'; x.lineWidth = 1; x.beginPath(); x.moveTo(P + pad, yy); x.lineTo(P + IW - pad, yy); x.stroke(); }
        }
        const mt = mealTotals(m);
        if (mt) { yy += 40; x.font = '700 22px Inter, sans-serif'; if (draw) { x.fillStyle = MUT; x.fillText(macroLine(mt).toUpperCase(), P + pad, yy); } }
        if (m.alt) { x.font = '500 26px Inter, sans-serif'; wrapLines(x, 'Variantă: ' + m.alt, IW - 2 * pad).forEach(l => { yy += 38; if (draw) { x.fillStyle = MUT; x.fillText(l, P + pad, yy); } }); }
        yy += pad; if (!draw) heights[mi] = yy - top; y = top + heights[mi];
      });
      if ((pl.rules || []).length) {
        y += 64; x.font = '800 24px Inter, sans-serif'; if (draw) { x.fillStyle = ROSE; x.fillText('REGULI', P, y); }
        y += 8;
        for (const r of pl.rules) { x.font = '500 28px Inter, sans-serif'; wrapLines(x, r, IW - 36).forEach((l, li) => { y += 42; if (draw) { x.fillStyle = BONE; if (li === 0) { x.fillStyle = ROSE; x.fillRect(P, y - 10, 16, 3); x.fillStyle = BONE; } x.fillText(l, P + 36, y); } }); }
      }
      y += 96; x.font = '800 40px Inter, sans-serif';
      if (draw) { x.fillStyle = BONE; x.fillText('eugen', P, y); const w1 = x.measureText('eugen').width; x.fillStyle = grad(x); x.fillText('.method', P + w1, y); }
      return y + P;
    };
    let x = cv.getContext('2d'); const H = Math.ceil(layout(x, false));
    cv.height = H; x = cv.getContext('2d'); x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H); layout(x, true);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
    await downloads.save({ filename: 'plan-alimentar-' + first(c.name).toLowerCase() + '.jpg', data: blob });
  } catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') toast('Nu am putut crea imaginea.'); }
}

function vDetail() {
  const c = getC(S.sel);
  if (!c) return `<button class="back" data-act="go" data-v="clienti">‹ Clienți</button><div class="empty">Clientul nu mai există.</div>`;
  const tabs = [['profil', 'Profil'], ['antrenament', 'Antrenament'], ['progres', 'Progres'], ['poze', 'Poze'], ['nutritie', 'Nutriție'], ['sedinte', 'Ședințe'], ['plati', 'Plăți'], ['checkin', 'Check-in']];
  const p = c.pkg || {};
  let body = '';
  if (S.tab === 'profil') {
    body = `<section class="panel"><div class="facts">
      <div class="fact"><div class="k">Telefon</div><div class="v num">${esc(c.phone || '—')}</div></div>
      <div class="fact"><div class="k">Email</div><div class="v">${esc(c.email || '—')}</div></div>
      <div class="fact"><div class="k">Început</div><div class="v">${esc(fd(c.start))}</div></div>
      <div class="fact"><div class="k">Vârstă</div><div class="v num">${esc(c.age || '—')}</div></div>
      <div class="fact wide"><div class="k">Obiectiv</div><div class="v">${esc(c.goal || '—')}</div></div>
    </div></section>
    <section class="panel"><h2>Evaluare biomecanică</h2><div class="facts">
      <div class="fact wide"><div class="k">Accidentări, dureri, limitări</div><div class="v">${esc(c.injuries || '—')}</div></div>
      <div class="fact wide"><div class="k">Mobilitate și asimetrii</div><div class="v">${esc(c.mobility || '—')}</div></div>
      <div class="fact wide"><div class="k">Note de tehnică și program</div><div class="v">${esc(c.notes || '—')}</div></div>
    </div></section>`;
  } else if (S.tab === 'sedinte') {
    const ss = sorted(c.sessions);
    body = `<section class="panel">
      <div class="panel-h"><h2>Pachet</h2><button class="btn sm" data-act="pkg">Pachet nou</button></div>
      ${p.total > 0 ? `<div class="pkg"><div><div class="muted" style="font-size:14px">${esc(p.name || 'Pachet')} · din ${esc(fd(p.start))}${p.price ? ' · ' + esc(lei(p.price)) : ''}</div><div class="bar-t"><i style="width:${Math.max(0, Math.min(100, (p.left / p.total) * 100))}%;${p.left <= 0 ? 'background:var(--crit)' : p.left <= 2 ? 'background:var(--warn)' : ''}"></i></div></div><div class="big num"><span class="grad">${p.left}</span><span class="muted" style="font-size:22px"> / ${p.total}</span></div></div>` : `<div class="empty">Niciun pachet activ. Ședințele se bifează oricum.</div>`}
    </section>
    <section class="panel"><h2>Bifează ședința</h2>
      <form class="inl" data-form="sess"><label class="f">Data<input id="sd" type="date" value="${today()}" required></label><label class="f" style="grid-column:span 2">Ce ați lucrat<input id="sn" placeholder="ex: picioare, corectat poziția genunchilor la genuflexiuni"></label><button class="btn pri">Bifează</button></form>
    </section>
    <section class="panel"><div class="panel-h"><h2>Istoric</h2><span class="muted num">${ss.length}</span></div>
      ${ss.length ? `<div class="tbl-w"><table><thead><tr><th>Data</th><th>Note</th><th></th></tr></thead><tbody>${ss.map(s => `<tr><td>${esc(fd(s.d))}</td><td>${esc(s.n || '')}</td><td class="r">${delBtn('sessions', s._i)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">Nicio ședință bifată.</div>`}
    </section>`;
  } else if (S.tab === 'progres') {
    const ms = sorted(c.measures), ls = sorted(c.lifts);
    const best = {};
    const AS = allSets(c);
    for (const l of AS) { const v = e1rm(num(l.kg) || 0, num(l.reps) || 1); if (!best[l.ex] || v > best[l.ex].v) best[l.ex] = { ...l, v }; }
    const first = {};
    for (const l of [...AS].sort((a, b) => (a.d < b.d ? -1 : 1))) if (!first[l.ex]) first[l.ex] = e1rm(num(l.kg) || 0, num(l.reps) || 1);
    const exOpts = [...new Set([...EXS, ...AS.map(l => l.ex)])];
    body = `<section class="panel"><h2>Măsurători</h2>
      ${spark(c.measures)}
      <form class="inl" data-form="meas"><label class="f">Data<input id="md" type="date" value="${today()}" required></label><label class="f">Greutate kg<input id="mw" inputmode="decimal" placeholder="82.5"></label><label class="f">Talie cm<input id="mwaist" inputmode="decimal" placeholder="86"></label><label class="f">% grăsime<input id="mbf" inputmode="decimal" placeholder="18"></label><button class="btn pri">Adaugă</button></form>
      ${ms.length ? `<div class="tbl-w"><table><thead><tr><th>Data</th><th class="r">Kg</th><th class="r">Talie</th><th class="r">% grăsime</th><th></th></tr></thead><tbody>${ms.map(m => `<tr><td>${esc(fd(m.d))}</td><td class="r">${esc(m.w ?? '—')}</td><td class="r">${esc(m.waist ?? '—')}</td><td class="r">${esc(m.bf ?? '—')}</td><td class="r">${delBtn('measures', m._i)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">Nicio măsurătoare încă.</div>`}
    </section>
    <section class="panel"><h2>Forță</h2>
      <form class="inl" data-form="lift"><label class="f">Data<input id="ld" type="date" value="${today()}" required></label><label class="f" style="grid-column:span 2">Exercițiu<input id="lex" readonly inputmode="none" data-act="pickex" required placeholder="Alege exercițiu ▾"></label><label class="f">Kg<input id="lkg" inputmode="decimal" required placeholder="100"></label><label class="f">Repetări<input id="lreps" inputmode="numeric" required placeholder="5"></label><button class="btn pri">Adaugă</button></form>
      ${Object.keys(best).length ? `<div class="tbl-w"><table><thead><tr><th>Exercițiu</th><th>Cel mai bun set</th><th class="r">1RM estimat</th><th class="r">Față de început</th></tr></thead><tbody>${Object.values(best).sort((a, b) => a.ex.localeCompare(b.ex, 'ro')).map(b => { const dlt = b.v - first[b.ex]; return `<tr><td><b>${esc(b.ex)}</b></td><td>${esc(b.kg)} kg × ${esc(b.reps)} · ${esc(fd(b.d))}</td><td class="r">${b.v.toFixed(1)} kg</td><td class="r" style="color:${dlt > 0 ? 'var(--ok)' : 'var(--muted)'}">${dlt > 0 ? '+' + dlt.toFixed(1) + ' kg' : '—'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="muted" style="font-size:12px">1RM estimat cu formula Epley: kg × (1 + repetări / 30).</div>
      <details><summary class="muted" style="cursor:pointer;font-size:14px">Toate seturile (${ls.length})</summary><div class="tbl-w"><table><tbody>${ls.map(l => `<tr><td>${esc(fd(l.d))}</td><td>${esc(l.ex)}</td><td class="r">${esc(l.kg)} kg × ${esc(l.reps)}</td><td class="r">${delBtn('lifts', l._i)}</td></tr>`).join('')}</tbody></table></div></details>` : `<div class="empty">Notează seturile grele ca să vezi progresul pe fiecare exercițiu.</div>`}
    </section>`;
    body += exHistory(c);
  } else if (S.tab === 'antrenament') {
    body = vWorkouts(c);
  } else if (S.tab === 'nutritie') {
    body = vNutrition(c);
  } else if (S.tab === 'poze') {
    const ph = sorted(c.photos);
    const groups = {}; ph.forEach(p => { (groups[p.d] = groups[p.d] || []).push(p); });
    const opt = (p, selId) => `<option value="${esc(p.id)}"${p.id === selId ? ' selected' : ''}>${esc(fd(p.d))} · ${esc(POSES[p.pose] || '')}</option>`;
    let cmp = '';
    if (ph.length >= 2) {
      const [A, B] = cmpPick(c);
      const chron = [...ph].sort((a, b) => (a.d < b.d ? -1 : 1));
      cmp = `<section class="panel"><div class="panel-h"><h2>Transformare</h2><div class="chips"><button class="chip" data-act="cmode" data-v="side" aria-pressed="${S.cmpMode === 'side'}">Alăturat</button><button class="chip" data-act="cmode" data-v="slide" aria-pressed="${S.cmpMode === 'slide'}">Glisor</button></div></div>
        <div class="cmp"><label class="f">Înainte<select id="cmpa">${chron.map(p => opt(p, A.id)).join('')}</select></label><label class="f">După<select id="cmpb">${chron.map(p => opt(p, B.id)).join('')}</select></label></div>
        ${S.cmpMode === 'side'
          ? `<div class="cmp"><figure><img src="${purl(A.id)}" alt="Înainte, ${esc(fd(A.d))}"><figcaption>Înainte · <b>${esc(fd(A.d))}</b></figcaption></figure><figure><img src="${purl(B.id)}" alt="După, ${esc(fd(B.d))}"><figcaption>După · <b>${esc(fd(B.d))}</b></figcaption></figure></div>`
          : `<div class="slide"><img src="${purl(A.id)}" alt="Înainte"><img id="slafter" src="${purl(B.id)}" alt="După" style="clip-path:inset(0 0 0 ${S.sl}%)"><span class="handle" id="slh" style="left:${S.sl}%"></span><span class="lbl" style="left:8px">ÎNAINTE</span><span class="lbl" style="right:8px">DUPĂ</span></div><input id="sl" type="range" min="0" max="100" value="${S.sl}" aria-label="Glisor înainte / după">`}
        <label class="f chk"><input id="pcons" type="checkbox" ${c.photoConsent ? 'checked' : ''}> Clientul a fost de acord să public pozele lui</label>
        <div class="tools"><button class="btn pri" data-act="export" ${downloads ? '' : 'disabled'}>Salvează imaginea pentru Instagram</button>${c.photoConsent ? '' : '<span class="muted small">Cere-i acordul în scris înainte să postezi.</span>'}</div>
      </section>`;
    }
    const u = S.usage;
    body = `<section class="panel"><div class="panel-h"><h2>Adaugă poze</h2>${u ? `<span class="muted small num">${u.files} fișiere · ${(u.bytes / 1048576).toFixed(0)} din ${(u.maxBytes / 1048576).toFixed(0)} MB</span>` : ''}</div>
      ${assets ? `<form class="inl" data-form="photo"><label class="f">Data<input id="phd" type="date" value="${today()}" required></label><label class="f">Unghi<select id="php">${Object.entries(POSES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label class="f" style="grid-column:span 2">Poze<input id="phf" type="file" accept="image/*" multiple required></label><label class="f" style="grid-column:1/-1">Notă<input id="phn" placeholder="ex: dimineața, pe nemâncate, aceeași lumină"></label><button class="btn pri" ${S.upl ? 'disabled' : ''}>Încarcă</button></form>${S.upl ? `<div class="note">${esc(S.upl)}</div>` : ''}<div class="muted small">Pentru comparații corecte: același loc, aceeași lumină, aceeași distanță.</div>`
      : `<div class="note">Încărcarea pozelor merge doar când deschizi pagina din contul tău claude.ai.</div>`}
    </section>
    ${cmp}
    <section class="panel"><div class="panel-h"><h2>Galerie</h2><span class="muted num">${ph.length}</span></div>
      ${ph.length ? Object.keys(groups).map(d => `<div class="dgroup"><div class="kicker">${esc(fd(d))}</div><div class="photos">${groups[d].map(p => `<button class="ph" data-act="viewph" data-id="${esc(p.id)}"><img src="${purl(p.id)}" alt="${esc(POSES[p.pose] || '')}, ${esc(fd(p.d))}" loading="lazy"><span>${esc(POSES[p.pose] || '')}</span></button>`).join('')}</div></div>`).join('') : `<div class="empty">Nicio poză încă. Fă prima serie (față, profil, spate) la începutul colaborării.</div>`}
    </section>`;
  } else if (S.tab === 'plati') {
    const ps = sorted(c.payments); const tot = (c.payments || []).reduce((s, x) => s + (Number(x.a) || 0), 0);
    body = `<section class="panel"><div class="panel-h"><h2>Plăți</h2><span class="grad num" style="font-family:var(--display);font-size:28px">${esc(lei(tot))}</span></div>
      <form class="inl" data-form="pay"><label class="f">Data<input id="pd" type="date" value="${today()}" required></label><label class="f">Sumă lei<input id="pa" inputmode="decimal" required placeholder="800"></label><label class="f" style="grid-column:span 2">Pentru<input id="pn" placeholder="ex: pachet 10 ședințe"></label><button class="btn pri">Adaugă</button></form>
      ${ps.length ? `<div class="tbl-w"><table><thead><tr><th>Data</th><th>Pentru</th><th class="r">Sumă</th><th></th></tr></thead><tbody>${ps.map(x => `<tr><td>${esc(fd(x.d))}</td><td>${esc(x.n || '')}</td><td class="r">${esc(lei(x.a))}</td><td class="r">${delBtn('payments', x._i)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">Nicio plată înregistrată.</div>`}
    </section>`;
  } else {
    const ks = sorted(c.checkins);
    body = `<section class="panel"><h2>Check-in săptămânal</h2>
      <form class="inl" data-form="chk"><label class="f">Data<input id="kd" type="date" value="${today()}" required></label><label class="f">Energie 1–5<select id="ke"><option></option>${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select></label><label class="f">Somn ore/noapte<input id="ks" inputmode="decimal" placeholder="7"></label><label class="f">Antrenamente făcute<input id="ka" placeholder="3 din 4"></label><label class="f" style="grid-column:1/-1">Ce a spus clientul<input id="kn" placeholder="dureri, poze trimise, foame, stres"></label><button class="btn pri">Salvează</button></form>
      ${ks.length ? `<div class="tbl-w"><table><thead><tr><th>Data</th><th class="r">Energie</th><th class="r">Somn</th><th>Antrenamente</th><th>Note</th><th></th></tr></thead><tbody>${ks.map(k => `<tr><td>${esc(fd(k.d))}</td><td class="r">${esc(k.e || '—')}</td><td class="r">${k.s ? esc(k.s) + ' h' : '—'}</td><td>${esc(k.a || '—')}</td><td>${esc(k.n || '')}</td><td class="r">${delBtn('checkins', k._i)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">Niciun check-in încă.</div>`}
    </section>`;
  }
  return `
  <button class="back" data-act="go" data-v="clienti">‹ Clienți</button>
  <div class="dhead">
    <div style="min-width:0"><h1>${esc(c.name)}</h1><div class="pills"><span class="pill ${esc(c.status)}">${esc(STATUS[c.status] || '')}</span><span class="pill tag">${esc(TYPES[c.type] || '')}</span><span class="pill tag">${esc(c.source || '—')}</span>${c.example ? '<span class="ex">Exemplu</span>' : ''}</div></div>
    <div class="tools"><button class="btn" data-act="edit">Editează</button>${c.type !== 'online' ? `<button class="btn pri" data-act="quick">Bifează ședința de azi</button>` : ''}</div>
  </div>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" data-act="tab" data-v="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}</div>
  ${body}
  <div><button class="btn sm danger" data-act="delc">Șterge clientul</button></div>`;
}

function render() {
  if (S.auth !== 'in') { $('#main').innerHTML = vAuth(); $('#nav').hidden = true; lastKey = ''; return; }
  $('#nav').hidden = false;
  const m = $('#main');
  const key = S.view + '|' + S.sel + '|' + S.tab;
  const keep = {}; let focus = null, ss = null, se = null;
  if (key === lastKey) {
    m.querySelectorAll('input[id],select[id],textarea[id]').forEach(el => { if (el.type !== 'file' && el.type !== 'checkbox' && el.type !== 'range' && !el.id.startsWith('cmp')) keep[el.id] = el.value; });
    const a = document.activeElement;
    if (a && a.id && m.contains(a)) { focus = a.id; try { ss = a.selectionStart; se = a.selectionEnd; } catch (e) {} }
  }
  let html = '';
  if (S.mode === 'local') html += `<div class="note">Previzualizare: datele de aici nu se salvează. Deschide pagina din claude.ai ca să-ți păstrezi clienții.</div>`;
  if (!S.loaded) html += `<p class="muted">Se încarcă clienții…</p>`;
  else html += S.view === 'detail' ? vDetail() : S.view === 'clienti' ? vClienti() : S.view === 'biblioteca' ? vLibrary() : vPanou();
  m.innerHTML = html;
  for (const id in keep) { const el = document.getElementById(id); if (el && el.id !== 'q') el.value = keep[id]; }
  if (focus) { const el = document.getElementById(focus); if (el) { el.focus(); try { if (ss != null) el.setSelectionRange(ss, se); } catch (e) {} } }
  if (key !== lastKey) window.scrollTo(0, 0);
  lastKey = key;
  document.querySelectorAll('#nav .nav-b[data-v]').forEach(b => { const v = b.dataset.v; b.setAttribute('aria-current', (S.view === v || (v === 'clienti' && S.view === 'detail')) ? 'page' : 'false'); });
}

/* ---------- overlays ---------- */
function openOv(html, wide) {
  const o = $('#ov'); let title = '';
  const m = html.match(/^\s*<h2>([\s\S]*?)<\/h2>/); if (m) { title = m[1]; html = html.slice(m[0].length); }
  o.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true"${title ? ` aria-label="${title.replace(/<[^>]+>/g, '')}"` : ''}><div class="mhead"><h2>${title}</h2><button type="button" class="mx" data-act="close" aria-label="Închide">×</button></div>${html}</div>`;
  o.dataset.wide = wide ? '1' : ''; o.hidden = false; o.scrollTop = 0; lockScroll();
  if (!wide) { const f = o.querySelector('.modal input:not([type=checkbox]):not([readonly]),.modal select,.modal textarea'); if (f && matchMedia('(pointer:fine)').matches) f.focus(); }
}
function closeOv() { const o = $('#ov'); o.hidden = true; o.innerHTML = ''; lockScroll(); }
const sel = (id, opts, v) => `<select id="${id}">${Object.entries(opts).map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
function clientForm(c) {
  const e = !!c; c = c || { type: 'sala', status: 'activ', source: 'Instagram', start: today() };
  openOv(`<h2>${e ? 'Editează clientul' : 'Client nou'}</h2>
  <form data-form="client" data-id="${e ? esc(c.id) : ''}">
    <label class="f full">Nume<input id="cname" required value="${esc(c.name || '')}" placeholder="Prenume Nume"></label>
    <label class="f">Telefon<input id="cphone" inputmode="tel" value="${esc(c.phone || '')}"></label>
    <label class="f">Email<input id="cemail" type="email" value="${esc(c.email || '')}"></label>
    <label class="f">Tip<span>${sel('ctype', TYPES, c.type)}</span></label>
    <label class="f">Status<span>${sel('cstatus', STATUS, c.status)}</span></label>
    <label class="f">De unde a venit<span>${sel('csource', Object.fromEntries(SOURCES.map(s => [s, s])), c.source)}</span></label>
    <label class="f">Data începerii<input id="cstart" type="date" value="${esc(c.start || '')}"></label>
    <label class="f">Vârstă<input id="cage" inputmode="numeric" value="${esc(c.age || '')}"></label>
    <label class="f">Obiectiv<input id="cgoal" value="${esc(c.goal || '')}" placeholder="ex: masă musculară, fără dureri de spate"></label>
    <div class="sec">Evaluare biomecanică</div>
    <label class="f full">Accidentări, dureri, limitări<textarea id="cinj">${esc(c.injuries || '')}</textarea></label>
    <label class="f full">Mobilitate și asimetrii<textarea id="cmob">${esc(c.mobility || '')}</textarea></label>
    <label class="f full">Note de tehnică și program<textarea id="cnotes">${esc(c.notes || '')}</textarea></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Renunță</button><button class="btn pri">${e ? 'Salvează' : 'Adaugă clientul'}</button></div>
  </form>`);
}
function pkgForm() {
  openOv(`<h2>Pachet nou</h2>
  <form data-form="pkg">
    <label class="f full">Nume pachet<input id="pname" value="10 ședințe" required></label>
    <label class="f">Nr. ședințe<input id="ptotal" inputmode="numeric" value="10" required></label>
    <label class="f">Preț lei<input id="pprice" inputmode="decimal" placeholder="opțional"></label>
    <label class="f">Începe pe<input id="pstart" type="date" value="${today()}" required></label>
    <label class="f chk" style="align-self:end"><input id="ppaid" type="checkbox" checked> Înregistrează și plata</label>
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Renunță</button><button class="btn pri">Pornește pachetul</button></div>
  </form>`);
}
function goalForm() {
  const g = S.settings;
  openOv(`<h2>Obiectiv</h2>
  <form data-form="goal">
    <label class="f full">Clienți noi din Instagram + TikTok<input id="gcount" inputmode="numeric" value="${esc(g.goal)}" required></label>
    <label class="f">De la<input id="gfrom" type="date" value="${esc(g.from)}" required></label>
    <label class="f">Până la<input id="gto" type="date" value="${esc(g.to)}" required></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="close">Renunță</button><button class="btn pri">Salvează</button></div>
  </form>`);
}
function confirmDel(c) {
  openOv(`<h2>Ștergi clientul?</h2><p class="muted" style="margin:0">${esc(c.name)} și tot istoricul lui (ședințe, progres, plăți, check-in-uri) dispar definitiv.</p>
  <div class="actions"><button class="btn ghost" data-act="close">Renunță</button><button class="btn danger" data-act="confirmdel">Șterge definitiv</button></div>`);
}

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) { if (ev.target.id === 'picker') closePicker(); else if (ev.target.id === 'ov' && !$('#ov').dataset.wide) closeOv(); return; }
  const a = b.dataset.act;
  if (a === 'go') { S.view = b.dataset.v; S.sel = null; render(); }
  else if (a === 'open') { S.view = 'detail'; S.sel = b.dataset.id; S.tab = 'profil'; render(); }
  else if (a === 'tab') { S.tab = b.dataset.v; render(); }
  else if (a === 'filt') { S.filter = b.dataset.v; render(); }
  else if (a === 'new') clientForm(null);
  else if (a === 'edit') clientForm(getC(S.sel));
  else if (a === 'goal') goalForm();
  else if (a === 'pkg') pkgForm();
  else if (a === 'close') closeOv();
  else if (a === 'delc') confirmDel(getC(S.sel));
  else if (a === 'confirmdel') { const id = S.sel; closeOv(); S.view = 'clienti'; S.sel = null; removeClient(id); toast('Client șters'); }
  else if (a === 'quick') { const c = cloneC(S.sel); addSession(c, today(), ''); saveClient(c); toast('Ședință bifată'); }
  else if (a === 'neww') workoutForm(null);
  else if (a === 'editw') workoutForm(b.dataset.id);
  else if (a === 'delw') openOv(`<h2>Ștergi antrenamentul?</h2><p class="muted" style="margin:0">Seriile lui dispar și din istoricul de progres.</p><div class="actions"><button class="btn ghost" data-act="close">Renunță</button><button class="btn danger" data-act="confirmdelw" data-id="${esc(b.dataset.id)}">Șterge</button></div>`);
  else if (a === 'confirmdelw') { const c = cloneC(S.sel); c.workouts = (c.workouts || []).filter(w => w.id !== b.dataset.id); closeOv(); saveClient(c); toast('Antrenament șters'); }
  else if (a === 'addex') { const box = $('#wex'); box.insertAdjacentHTML('beforeend', exBlock(null)); box.lastElementChild.querySelector('.exb-n').focus(); }
  else if (a === 'rmex') { b.closest('.exb').remove(); }
  else if (a === 'addset') {
    const bl = b.closest('.exb'), sets = bl.querySelector('.sets'), rows = sets.querySelectorAll('.setr'), lastR = rows[rows.length - 1];
    const s = lastR ? { kg: lastR.querySelector('.s-kg').value, reps: lastR.querySelector('.s-r').value } : {};
    sets.insertAdjacentHTML('beforeend', setRow(s, rows.length)); updatePrev(bl);
  }
  else if (a === 'rmset') { const bl = b.closest('.exb'); b.closest('.setr').remove(); renumber(bl); }
  else if (a === 'nplan') nutritionForm();
  else if (a === 'addmeal') { const box = $('#nmeals'); box.insertAdjacentHTML('beforeend', mealBlock(null)); box.lastElementChild.querySelector('.m-time').focus(); }
  else if (a === 'rmmeal') { b.closest('.mealb').remove(); }
  else if (a === 'addfood') { const f = b.closest('.mealb').querySelector('.foods'); f.insertAdjacentHTML('beforeend', foodRow()); f.lastElementChild.querySelector('.f-food').focus(); }
  else if (a === 'rmfood') { b.closest('.fr').remove(); }
  else if (a === 'nexport') exportPlan(getC(S.sel));
  else if (a === 'pick') openPicker('food', b);
  else if (a === 'pickex') openPicker('ex', b);
  else if (a === 'pkclose') closePicker();
  else if (a === 'pkcat') { pick.cat = b.dataset.v; document.querySelectorAll('#picker [data-act=pkcat]').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === pick.cat)); renderPickList(); }
  else if (a === 'pickitem') choosePick(b.dataset.name);
  else if (a === 'pknew' || a === 'picknew') pickNewForm((($('#pq') || {}).value || '').trim());
  else if (a === 'pkback') renderPickList();
  else if (a === 'delex') { const id = b.dataset.id; CUSTOMEX = CUSTOMEX.filter(x => x.id !== id); render(); if (db) db.collection('exercises').doc(id).delete().catch(e => toast(errMsg(e))); }
  else if (a === 'quickfood') { const r = b.closest('.fr'); r.insertAdjacentHTML('afterend', quickFoodRow(r.querySelector('.f-food').value.trim())); recalcNutri(); r.nextElementSibling.querySelector('.q-kcal').focus(); }
  else if (a === 'saveqf') {
    const q = b.closest('.qf'), r = q.previousElementSibling, name = r.querySelector('.f-food').value.trim();
    const vals = ['kcal', 'p', 'c', 'f'].map(k => num(q.querySelector('.q-' + k).value));
    if (!name || vals.some(x => x == null)) { toast('Completează kcal, proteine, carbohidrați și grăsimi'); return; }
    const fo = { name, kcal: vals[0], p: vals[1], c: vals[2], f: vals[3] }; const pc = num(q.querySelector('.q-pc').value); if (pc) fo.piece = pc;
    await addCustomFood(fo); const dl = $('#fdl'); if (dl) dl.insertAdjacentHTML('beforeend', `<option value="${esc(name)}"></option>`);
    q.remove(); recalcNutri(); toast('Aliment adăugat în bază');
  }
  else if (a === 'delfood') { const id = b.dataset.id; CUSTOM = CUSTOM.filter(x => x.id !== id); FMAP = null; render(); if (db) db.collection('foods').doc(id).delete().catch(e => toast(errMsg(e))); }
  else if (a === 'delplan') openOv(`<h2>Ștergi planul?</h2><p class="muted" style="margin:0">Planul alimentar al clientului dispare definitiv.</p><div class="actions"><button class="btn ghost" data-act="close">Renunță</button><button class="btn danger" data-act="confirmdelplan">Șterge</button></div>`);
  else if (a === 'confirmdelplan') { const c = cloneC(S.sel); delete c.nutrition; closeOv(); saveClient(c); }
  else if (a === 'cmode') { S.cmpMode = b.dataset.v; render(); }
  else if (a === 'export') { const c = getC(S.sel); const [A, B] = cmpPick(c); exportTransformation(c, A, B); }
  else if (a === 'viewph') {
    const c = getC(S.sel); const p = (c.photos || []).find(x => x.id === b.dataset.id); if (!p) return;
    openOv(`<h2>${esc(POSES[p.pose] || 'Poză')} · ${esc(fd(p.d))}</h2><div class="viewer"><img src="${purl(p.id)}" alt="${esc(POSES[p.pose] || '')}, ${esc(fd(p.d))}"></div><div><b>${esc(POSES[p.pose] || '')}</b> · ${esc(fd(p.d))}${p.note ? `<div class="muted small">${esc(p.note)}</div>` : ''}</div>
      <div class="actions"><button class="btn sm danger" data-act="delph" data-id="${esc(p.id)}">Șterge poza</button><button class="btn pri" data-act="close">Închide</button></div>`);
  }
  else if (a === 'delph') {
    openOv(`<h2>Ștergi poza?</h2><p class="muted" style="margin:0">Dispare definitiv din galerie și din comparații.</p><div class="actions"><button class="btn ghost" data-act="close">Renunță</button><button class="btn danger" data-act="confirmdelph" data-id="${esc(b.dataset.id)}">Șterge definitiv</button></div>`);
  }
  else if (a === 'confirmdelph') {
    const id = b.dataset.id, c = cloneC(S.sel); closeOv();
    c.photos = (c.photos || []).filter(p => p.id !== id); if (S.cmpA === id) S.cmpA = null; if (S.cmpB === id) S.cmpB = null;
    saveClient(c);
    if (assets) assets.delete(id).then(refreshUsage).catch(() => {});
    toast('Poză ștearsă');
  }
  else if (a === 'dele') {
    const c = cloneC(S.sel), k = b.dataset.k, i = +b.dataset.i; const it = (c[k] || [])[i]; if (!it) return;
    if (k === 'sessions' && it.p && c.pkg && c.pkg.total > 0) c.pkg.left = Math.min(c.pkg.total, c.pkg.left + 1);
    c[k].splice(i, 1); saveClient(c);
  }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'q') { S.q = ev.target.value; render(); }
  if (ev.target.closest && (ev.target.closest('#nmeals') || /^n_/.test(ev.target.id))) recalcNutri();
  if (ev.target.id === 'pq') { renderPickList(); return; }
  if (ev.target.id === 'sl') { S.sl = +ev.target.value; const a = $('#slafter'), h = $('#slh'); if (a) a.style.clipPath = `inset(0 0 0 ${S.sl}%)`; if (h) h.style.left = S.sl + '%'; }
});
document.addEventListener('change', ev => {
  const id = ev.target.id;
  if (id === 'cmpa') { S.cmpA = ev.target.value; render(); }
  if (id === 'cmpb') { S.cmpB = ev.target.value; render(); }
  if (ev.target.classList.contains('exb-n')) updatePrev(ev.target.closest('.exb'));
  if (id === 'wd') document.querySelectorAll('#wex .exb').forEach(updatePrev);
  if (id === 'wtpl') applyTemplate(ev.target.value);
  if (ev.target.closest && ev.target.closest('#nmeals')) recalcNutri();
  if (id === 'exh') { S.exh = ev.target.value; render(); }
  if (id === 'pcons') { const c = cloneC(S.sel); c.photoConsent = ev.target.checked; saveClient(c); }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') { const pk = $('#picker'); if (pk && !pk.hidden) { closePicker(); return; } if (!$('#ov').hidden) closeOv(); }
  if (ev.key === 'Enter' && ev.target.id === 'pq') { ev.preventDefault(); const firstI = document.querySelector('#plist [data-act=pickitem]'); if (firstI) firstI.click(); }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.dataset && (ev.target.dataset.act === 'pick' || ev.target.dataset.act === 'pickex')) { ev.preventDefault(); openPicker(ev.target.dataset.act === 'pick' ? 'food' : 'ex', ev.target); }
});

function addSession(c, d, n) {
  c.sessions = c.sessions || []; const s = { d, n };
  if (c.pkg && c.pkg.total > 0 && c.pkg.left > 0) { c.pkg.left -= 1; s.p = true; }
  c.sessions.push(s);
}
const v = id => (document.getElementById(id)?.value ?? '').trim();
document.addEventListener('submit', async ev => {
  const f = ev.target.closest('form[data-form]'); if (!f) return; ev.preventDefault();
  const t = f.dataset.form;
  if (t === 'pkex') { const name = v('pxn'); if (!name) return; const ok = await addCustomEx(name, v('pxg')); toast(ok ? 'Exercițiu salvat în bibliotecă' : 'Exercițiul există deja'); choosePick(name); return; }
  if (t === 'pkfood') {
    const fo = { name: v('pfn'), kcal: num(v('pfk')), p: num(v('pfp')), c: num(v('pfc')), f: num(v('pff')) }; const pc = num(v('pfpc')); if (pc) fo.piece = pc;
    if (!fo.name || [fo.kcal, fo.p, fo.c, fo.f].some(x => x == null)) { toast('Completează toate valorile'); return; }
    await addCustomFood(fo); toast('Aliment salvat în bibliotecă'); choosePick(fo.name); return;
  }
  if (t === 'myex') { const name = v('mxn'); if (!name) return; const ok = await addCustomEx(name, v('mxg')); f.reset(); render(); toast(ok ? 'Exercițiu adăugat' : 'Exercițiul există deja'); return; }
  if (t === 'workout') {
    const c = cloneC(S.sel); if (!c) return;
    const ex = [...f.querySelectorAll('#wex .exb')].map(bl => ({
      name: bl.querySelector('.exb-n').value.trim(),
      sets: [...bl.querySelectorAll('.setr')].map(r => {
        const kgEl = r.querySelector('.s-kg'), rEl = r.querySelector('.s-r');
        const kg = num(kgEl.value), reps = parseInt(rEl.value);
        const s = { kg, reps }; const n = r.querySelector('.s-n').value.trim(); if (n) s.n = n;
        return s;
      }).filter(s => s.kg != null && s.reps > 0)
    })).filter(e => e.name && e.sets.length);
    if (!ex.length) { toast('Completează cel puțin un exercițiu cu kg și repetări'); return; }
    const w = { id: editingW || rid(), d: v('wd'), title: v('wt'), ex, note: v('wn') };
    c.workouts = c.workouts || [];
    const i = c.workouts.findIndex(x => x.id === w.id);
    if (i >= 0) c.workouts[i] = w; else c.workouts.push(w);
    const sess = document.getElementById('wsess');
    if (i < 0 && sess && sess.checked) addSession(c, w.d, w.title || 'Antrenament');
    editingW = null; closeOv(); saveClient(c); toast('Antrenament salvat'); return;
  }
  if (t === 'nutrition') {
    const c = cloneC(S.sel); if (!c) return;
    const meals = [...f.querySelectorAll('#nmeals .mealb')].map(mb => ({
      time: mb.querySelector('.m-time').value.trim(), name: mb.querySelector('.m-name').value.trim(), alt: mb.querySelector('.m-alt').value.trim(),
      items: [...mb.querySelectorAll('.fr')].map(r => {
        const name = r.querySelector('.f-food').value.trim(); if (!name) return null;
        const fo = findFood(name), n = num(r.querySelector('.f-amt').value), unit = r.querySelector('.f-unit').value;
        if (!fo) return { food: name, n, unit: 'g', qty: n != null ? n + ' g' : '' };
        if (n == null) return { food: fo.name, unit, qty: '' };
        const v = calcFood(fo, n, unit);
        return { food: fo.name, n, unit, g: v.g, qty: unit === 'buc' ? `${n} buc` : `${n} g`, kcal: v.kcal, p: v.p, c: v.c, f: v.f };
      }).filter(Boolean)
    })).filter(m => m.name || m.items.length);
    const pl = { title: v('nt'), note: v('nn'), meals, rules: v('nr').split('\n').map(s => s.trim()).filter(Boolean), updated: today() };
    MAC.forEach(([k]) => { const n = num(v('n_' + k)); if (n != null) pl[k] = n; });
    c.nutrition = pl; closeOv(); saveClient(c); toast('Plan salvat'); return;
  }
  if (t === 'myfood') {
    const fo = { name: v('mfn'), kcal: num(v('mfk')), p: num(v('mfp')), c: num(v('mfc')), f: num(v('mff')) }; const pc = num(v('mfpc')); if (pc) fo.piece = pc;
    if (!fo.name || [fo.kcal, fo.p, fo.c, fo.f].some(x => x == null)) { toast('Completează toate valorile'); return; }
    f.reset(); await addCustomFood(fo); render(); toast('Aliment adăugat'); return;
  }
  if (t === 'photo') {
    if (!assets) { toast('Încărcarea pozelor nu merge în această vizualizare.'); return; }
    const files = [...(document.getElementById('phf').files || [])]; if (!files.length) { toast('Alege cel puțin o poză'); return; }
    const cid = S.sel, d = v('phd'), pose = v('php'), note = v('phn'); const added = [];
    for (let i = 0; i < files.length; i++) {
      S.upl = `Se încarcă poza ${i + 1} din ${files.length}…`; render();
      try { const blob = await compress(files[i]); const r = await assets.upload(blob, { type: 'image/jpeg' }); added.push({ id: r.id, d, pose, note }); }
      catch (e) { toast(assetErr(e)); }
    }
    S.upl = '';
    const c = cloneC(cid);
    if (c && added.length) { c.photos = [...(c.photos || []), ...added]; S.cmpA = null; S.cmpB = null; saveClient(c); toast(added.length === 1 ? 'Poză adăugată' : added.length + ' poze adăugate'); }
    else render();
    const pf = document.getElementById('phf'); if (pf) pf.value = '';
    refreshUsage();
    return;
  }
  if (t === 'client') {
    const id = f.dataset.id; const c = id ? cloneC(id) : { id: newId(), created: today(), sessions: [], payments: [], measures: [], lifts: [], checkins: [], pkg: {} };
    Object.assign(c, { name: v('cname'), phone: v('cphone'), email: v('cemail'), type: v('ctype'), status: v('cstatus'), source: v('csource'), start: v('cstart'), age: v('cage'), goal: v('cgoal'), injuries: v('cinj'), mobility: v('cmob'), notes: v('cnotes') });
    if (!c.name) return;
    closeOv(); saveClient(c);
    if (!id) { S.view = 'detail'; S.sel = c.id; S.tab = 'profil'; render(); toast('Client adăugat'); } else toast('Salvat');
    return;
  }
  if (t === 'goal') { S.settings = { goal: Math.max(1, parseInt(v('gcount')) || 10), from: v('gfrom'), to: v('gto') }; closeOv(); saveSettings(); toast('Obiectiv salvat'); return; }
  const c = cloneC(S.sel); if (!c) return;
  if (t === 'pkg') {
    const total = Math.max(1, parseInt(v('ptotal')) || 1), price = num(v('pprice'));
    c.pkg = { name: v('pname'), total, left: total, price: price || 0, start: v('pstart') };
    if (document.getElementById('ppaid').checked && price) { c.payments = c.payments || []; c.payments.push({ d: v('pstart'), a: price, n: v('pname') }); }
    closeOv(); saveClient(c); toast('Pachet pornit'); return;
  }
  if (t === 'sess') { addSession(c, v('sd'), v('sn')); f.reset(); f.querySelector('#sd').value = today(); saveClient(c); toast('Ședință bifată'); return; }
  if (t === 'meas') {
    const m = { d: v('md') }; ['w', 'waist', 'bf'].forEach((k, i) => { const n = num(v(['mw', 'mwaist', 'mbf'][i])); if (n != null) m[k] = n; });
    if (Object.keys(m).length < 2) { toast('Completează cel puțin o valoare'); return; }
    c.measures = c.measures || []; c.measures.push(m); f.reset(); f.querySelector('#md').value = today(); saveClient(c); return;
  }
  if (t === 'lift') {
    const kg = num(v('lkg')), reps = parseInt(v('lreps')); if (kg == null || !reps) { toast('Completează kg și repetări'); return; }
    c.lifts = c.lifts || []; c.lifts.push({ d: v('ld'), ex: v('lex'), kg, reps }); f.reset(); f.querySelector('#ld').value = today(); saveClient(c); return;
  }
  if (t === 'pay') {
    const a = num(v('pa')); if (a == null) return;
    c.payments = c.payments || []; c.payments.push({ d: v('pd'), a, n: v('pn') }); f.reset(); f.querySelector('#pd').value = today(); saveClient(c); toast('Plată adăugată'); return;
  }
  if (t === 'chk') {
    c.checkins = c.checkins || []; c.checkins.push({ d: v('kd'), e: v('ke'), s: v('ks'), a: v('ka'), n: v('kn') }); f.reset(); f.querySelector('#kd').value = today(); saveClient(c); toast('Check-in salvat'); return;
  }
});

/* ---------- autentificare ---------- */
const CFG = window.EM_CONFIG || {};
const COACH = String(CFG.coachEmail || '').trim().toLowerCase();
const CONFIGURED = !!(CFG.firebase && CFG.firebase.apiKey && !String(CFG.firebase.apiKey).includes('LIPESTE'));
Object.assign(S, { auth: CONFIGURED ? 'loading' : 'setup', authView: 'login', authMsg: '', authErr: '', busy: false });
let auth = null, fdb = null;
function authErrMsg(e) {
  return ({
    'auth/invalid-credential': 'Email sau parolă greșită.', 'auth/wrong-password': 'Email sau parolă greșită.',
    'auth/user-not-found': 'Nu există cont cu acest email. Apasă „Prima dată aici”.',
    'auth/email-already-in-use': 'Contul există deja. Intră cu parola sau resetează parola.',
    'auth/weak-password': 'Parola trebuie să aibă cel puțin 6 caractere.', 'auth/invalid-email': 'Adresa de email nu e validă.',
    'auth/too-many-requests': 'Prea multe încercări. Așteaptă câteva minute.', 'auth/network-request-failed': 'Nu ai internet.',
    'auth/operation-not-allowed': 'Logarea cu email nu e activată în Firebase (ghid, pasul 3).',
    'auth/unauthorized-domain': 'Linkul aplicației nu e autorizat în Firebase (ghid, pasul 7).'
  })[e && e.code] || 'Ceva n-a mers. Încearcă din nou.';
}
function vAuth() {
  const hero = t => `<div><div class="kicker">eugen.method · coach</div><div class="auth-hero">${t}</div></div>`;
  if (S.auth === 'setup') return `<div class="auth">${hero('Aproape <span class="grad">gata</span>')}<section class="panel"><p class="muted">Aplicația nu e conectată încă la Firebase. Completează fișierul <b>config.js</b> după ghid.</p></section></div>`;
  if (S.auth === 'loading') return `<div class="auth">${hero('eugen<span class="grad">.method</span>')}<p class="muted">Se încarcă…</p></div>`;
  if (S.auth === 'denied') return `<div class="auth">${hero('Acces <span class="grad">restricționat</span>')}<section class="panel"><p>Contul <b>${esc(auth.currentUser && auth.currentUser.email)}</b> nu are acces la panoul de antrenor.</p><button class="btn ghost" data-act="logout">Ieși</button></section></div>`;
  if (S.auth === 'verify') return `<div class="auth">${hero('Confirmă <span class="grad">emailul</span>')}<section class="panel"><p>Ți-am trimis un link pe <b>${esc(auth.currentUser.email)}</b>. Deschide-l, apoi apasă butonul de mai jos.</p><p class="muted small">Nu-l găsești? Uită-te în Spam.</p>${S.authMsg ? `<div class="note">${esc(S.authMsg)}</div>` : ''}<button class="btn pri" data-act="verified">Am confirmat</button><div class="tools"><button class="btn ghost" data-act="resend">Retrimite emailul</button><button class="btn ghost" data-act="logout">Ieși</button></div></section></div>`;
  const t = { login: 'Intră în cont', signup: 'Prima dată aici', reset: 'Resetează parola' }[S.authView];
  return `<div class="auth">${hero('Panoul tău de <span class="grad">antrenor</span>')}
    <section class="panel"><h2>${t}</h2>
      ${S.authErr ? `<div class="note crit">${esc(S.authErr)}</div>` : ''}${S.authMsg ? `<div class="note">${esc(S.authMsg)}</div>` : ''}
      <form class="stack" data-form="${S.authView}">
        <label class="f">Email<input id="aemail" type="email" autocomplete="email" required value="${esc(COACH)}"></label>
        ${S.authView !== 'reset' ? `<label class="f">Parolă<input id="apass" type="password" autocomplete="${S.authView === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required></label>` : ''}
        ${S.authView === 'signup' ? `<label class="f">Repetă parola<input id="apass2" type="password" autocomplete="new-password" minlength="6" required></label>` : ''}
        <button class="btn pri" ${S.busy ? 'disabled' : ''}>${{ login: 'Intră', signup: 'Creează contul', reset: 'Trimite link de resetare' }[S.authView]}</button>
      </form>
      <div class="tools small">${S.authView !== 'login' ? '<button class="link" data-act="authv" data-v="login">Am deja cont</button>' : '<button class="link" data-act="authv" data-v="signup">Prima dată aici</button><button class="link" data-act="authv" data-v="reset">Am uitat parola</button>'}</div>
    </section></div>`;
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b || !auth) return;
  const a = b.dataset.act;
  if (a === 'authv') { S.authView = b.dataset.v; S.authErr = ''; S.authMsg = ''; render(); }
  else if (a === 'logout') { closeOv(); await auth.signOut(); }
  else if (a === 'resend') { try { await auth.currentUser.sendEmailVerification(); S.authMsg = 'Am retrimis emailul.'; } catch (e) { S.authMsg = authErrMsg(e); } render(); }
  else if (a === 'verified') {
    try { await auth.currentUser.reload(); if (auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); onUser(auth.currentUser); } else { S.authMsg = 'Încă nu apare confirmat. Deschide linkul din email și încearcă iar.'; render(); } }
    catch (e) { S.authMsg = authErrMsg(e); render(); }
  }
});
document.addEventListener('submit', async ev => {
  const f = ev.target.closest('form[data-form]'); if (!f) return;
  const t = f.dataset.form; if (!['login', 'signup', 'reset'].includes(t)) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  S.authErr = ''; S.authMsg = ''; const email = $('#aemail').value.trim().toLowerCase();
  if (t === 'signup' && $('#apass').value !== $('#apass2').value) { S.authErr = 'Parolele nu sunt la fel.'; render(); return; }
  S.busy = true; render();
  try {
    if (t === 'login') await auth.signInWithEmailAndPassword(email, ($('#apass') || {}).value || '');
    else if (t === 'signup') { const cr = await auth.createUserWithEmailAndPassword(email, $('#apass').value); await cr.user.sendEmailVerification(); }
    else { await auth.sendPasswordResetEmail(email); S.authMsg = 'Dacă există un cont cu adresa asta, ți-am trimis linkul de resetare.'; }
  } catch (e) { S.authErr = authErrMsg(e); }
  S.busy = false; render();
}, true);

/* ---------- adaptoare: poze și descărcări ---------- */
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function shrink(dataUrl, max, q) {
  const img = await loadImg(dataUrl); const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', q);
}
const photoStore = {
  async upload(blob) {
    let data = await blobToDataURL(blob);
    for (const [m, q] of [[1400, 0.82], [1200, 0.78], [1000, 0.72]]) { if (data.length <= 900000) break; data = await shrink(data, m, q); }
    if (data.length > 1000000) throw { code: 'too_large' };
    const ref = db.collection('photos').doc();
    await ref.set({ data, created: new Date().toISOString() });
    PHOTO[ref.id] = data; return { id: ref.id, url: data };
  },
  async list() { throw { code: 'unsupported' }; },
  async delete(id) { delete PHOTO[id]; await db.collection('photos').doc(id).delete(); return { deleted: true }; }
};
const fileSaver = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    try {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer:coarse)').matches) { await navigator.share({ files: [file] }); return { saved: true }; }
    } catch (e) { if (e && e.name === 'AbortError') return { saved: false }; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return { saved: true };
  }
};

/* ---------- backup ---------- */
async function backupAll() {
  toast('Pregătesc backup-ul…');
  const out = { app: 'eugen.method', exportat: new Date().toISOString(), settings: S.settings, clients: S.clients, foods: CUSTOM, exercises: CUSTOMEX, photos: {} };
  for (const c of S.clients) for (const p of c.photos || []) out.photos[p.id] = await ensurePhoto(p.id);
  await fileSaver.save({ filename: 'eugen-method-backup-' + today() + '.json', data: new Blob([JSON.stringify(out)], { type: 'application/json' }) });
}
async function importBackup(file) {
  const d = JSON.parse(await file.text());
  if (!d || !Array.isArray(d.clients)) throw new Error('format');
  let n = 0;
  for (const [id, data] of Object.entries(d.photos || {})) if (data && data !== BLANK) { await db.collection('photos').doc(id).set({ data, created: new Date().toISOString() }); n++; }
  for (const c of d.clients) { const body = JSON.parse(JSON.stringify(c)); const id = body.id; delete body.id; if (id) await db.collection('clients').doc(id).set(body); }
  for (const x of d.foods || []) { const b = { ...x }; const id = b.id; delete b.id; if (id) await db.collection('foods').doc(id).set(b); }
  for (const x of d.exercises || []) { const b = { ...x }; const id = b.id; delete b.id; if (id) await db.collection('exercises').doc(id).set(b); }
  if (d.settings) await db.doc('settings/main').set(d.settings);
  return { clients: d.clients.length, photos: n };
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'backup') backupAll().catch(() => toast('Nu am putut face backup-ul.'));
  if (b.dataset.act === 'importpick') $('#importfile').click();
});
document.addEventListener('change', async ev => {
  if (ev.target.id !== 'importfile' || !ev.target.files[0]) return;
  try { toast('Import în curs…'); const r = await importBackup(ev.target.files[0]); toast(`Importat: ${r.clients} clienți, ${r.photos} poze`); }
  catch (e) { toast('Fișierul nu e un backup eugen.method valid.'); }
  ev.target.value = '';
});

/* ---------- pornire ---------- */
let unsubs = [];
function onUser(u) {
  unsubs.forEach(f => { try { f(); } catch (e) {} }); unsubs = [];
  S.clients = []; S.loaded = false; S.authErr = ''; lastKey = '';
  if (!u) { S.auth = 'out'; db = null; render(); return; }
  if (!u.emailVerified) { S.auth = 'verify'; render(); return; }
  if (String(u.email).toLowerCase() !== COACH) { S.auth = 'denied'; render(); return; }
  S.auth = 'in'; S.mode = 'db'; db = fdb; assets = photoStore; downloads = fileSaver; S.view = 'panou'; S.sel = null;
  unsubs.push(db.collection('clients').onSnapshot(snap => {
    S.clients = snap.docs.map(x => ({ ...JSON.parse(JSON.stringify(x.data() || {})), id: x.id })); S.loaded = true; render();
  }, e => { S.loaded = true; toast(errMsg(e)); render(); }));
  unsubs.push(db.collection('exercises').onSnapshot(snap => { CUSTOMEX = snap.docs.map(x => ({ ...x.data(), id: x.id })); }, () => {}));
  unsubs.push(db.collection('foods').onSnapshot(snap => { CUSTOM = snap.docs.map(x => ({ ...x.data(), id: x.id })); FMAP = null; if (S.loaded) render(); }, () => {}));
  unsubs.push(db.doc('settings/main').onSnapshot(s => { if (s.exists) { S.settings = { ...S.settings, ...s.data() }; if (S.loaded) render(); } }, () => {}));
  render();
}
if (CONFIGURED) {
  firebase.initializeApp(CFG.firebase);
  auth = firebase.auth(); auth.languageCode = 'ro';
  fdb = firebase.firestore();
  try { fdb.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
  auth.onAuthStateChanged(onUser);
}
render();
