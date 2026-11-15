// FormatBD quote + deadline logic, shared by the website (order.html) and the Edge Function (supabase/functions/fbd).
// estimate() is a line-for-line port of price_lines() in ops/fbd.py; ops/test_quote.py checks they agree.
// cfg = { pricing, packages, referral, capacity } from config.json (ops/build.py writes the copies).

// Python's round(): half to even, and round(x, -1) for tens
export function pyRound(x, nd = 0) {
  const v = nd < 0 ? x / 10 ** -nd : x * 10 ** nd;
  let r = Math.round(v);
  if (Math.abs(v % 1) === 0.5) r = 2 * Math.round(v / 2);
  return nd < 0 ? r * 10 ** -nd : r / 10 ** nd;
}

// order = { seg, pkg, pages, slides, cover, info, bijoy, rush, ref }  (ref = an already-checked partner code)
export function estimate(cfg, order) {
  const o = { pages: 0, slides: 0, info: 0, bijoy: 0, ...order };
  let p = cfg.pricing[o.seg];
  const lines = [];
  if (o.pkg) {
    const pk = cfg.packages.find(x => x.id === o.pkg);
    p = cfg.pricing[pk.seg];
    if (pk.pages === 0 && o.pages) { // per-page package (e.g. Bijoy -> Unicode)
      const free = Math.min(pk.free_pages || 0, o.pages);
      lines.push([`${pk.en} x${o.pages}` + (free ? ` (${free} free)` : ""), pk.price * (o.pages - free)]);
    } else {
      lines.push([pk.en, pk.price]);
      if (pk.pages && o.pages > pk.pages) lines.push([`Extra pages x${o.pages - pk.pages}`, (o.pages - pk.pages) * p.page]);
    }
    o.pages = 0;
  }
  if (o.pages) lines.push([`Formatting/layout, ${o.pages} pages`, Math.max(o.pages * p.page, p.page_min)]);
  if (o.cover) lines.push(["Cover design", p.cover]);
  if (o.slides) lines.push([`Presentation, ${o.slides} slides`, Math.max(o.slides * p.slide, p.slides_min)]);
  if (o.info) lines.push([`Infographics/charts x${o.info}`, o.info * p.infographic]);
  if (o.bijoy) lines.push([`Bijoy to Unicode, ${o.bijoy} pages`, o.bijoy * p.bijoy_page]);
  const sum = () => lines.reduce((s, [, v]) => s + v, 0);
  if (o.rush) lines.push([`Rush delivery (+${p.rush_pct}%)`, pyRound(sum() * p.rush_pct / 100)]);
  if (o.ref) {
    const pct = cfg.referral.customer_pct;
    lines.push([`Referral code ${o.ref} (-${pct}%)`, -pyRound(sum() * pct / 100)]);
  }
  return { lines, total: pyRound(sum(), -1) };
}

export const advance = (cfg, total) => pyRound(total * cfg.pricing.advance_pct / 100, -1);

// rough work hours for one job, used to place it in the queue
export function jobHours(cfg, order) {
  const h = cfg.capacity.hours, o = order;
  const pk = o.pkg ? cfg.packages.find(x => x.id === o.pkg) : null;
  if (pk && pk.id.startsWith("dsn-")) return Math.max(h.design, h.min);
  let pages = +o.pages || 0, slides = +o.slides || 0;
  if (pk && pk.pages) pages = Math.max(pages, pk.pages);
  if (pk && /meeting|deck|slides|defense/.test(pk.id) && !slides) slides = 15;
  const t = pages * h.page + slides * h.slide + (o.cover ? h.cover : 0) + (+o.info || 0) * h.infographic + (+o.bijoy || 0) * h.bijoy_page;
  return Math.max(t, h.min);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dhakaToday = () => new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10);

// the date after n working days from today (days_off skipped)
export function addWorkDays(cfg, today, n) {
  const d = new Date(today + "T00:00:00Z");
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!cfg.capacity.days_off.includes(DAYS[d.getUTCDay()])) n--;
  }
  return d.toISOString().slice(0, 10);
}

// normal: after the current queue; rush: jumps the queue (costs rush_pct more)
export function earliest(cfg, queueHours, hours, today = dhakaToday()) {
  const c = cfg.capacity, per = c.hours_per_day;
  return {
    normal: addWorkDays(cfg, today, Math.ceil((queueHours + hours) / per) + c.buffer_days),
    rush: addWorkDays(cfg, today, Math.max(1, Math.ceil(hours / per))),
  };
}

// what the wanted date means: "ok" (normal price), "rush" (+rush_pct) or "tight" (sooner than even rush; Ashik decides)
export function dueKind(cfg, queueHours, hours, wanted, today = dhakaToday()) {
  const e = earliest(cfg, queueHours, hours, today);
  if (!wanted || wanted >= e.normal) return { kind: "ok", ...e };
  return { kind: wanted >= e.rush ? "rush" : "tight", ...e };
}
