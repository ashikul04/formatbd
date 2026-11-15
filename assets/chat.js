// FormatBD chat assistant: answers common questions, gives an instant estimate from config prices,
// then hands the client to WhatsApp with every detail filled in. No server, no AI key, no cost.
// Prices come from cfg.js (written by ops/build.py from config.json); maths from quote.js (same as fbd.py).
import cfg from "./cfg.js";
import { estimate, advance, pyRound } from "./quote.js";

const B = cfg.business, P = cfg.pricing;
const PK = Object.fromEntries(cfg.packages.map(p => [p.id, p]));
const tk = n => "৳" + Math.round(n).toLocaleString("en-IN");
const wa = t => "https://wa.me/" + B.whatsapp + "?text=" + encodeURIComponent(t);
const SEG = { govt: "সরকারি অফিস", ngo: "NGO / INGO / Company", student: "Student / Thesis" };
const RUSH = (() => { const r = [...new Set(Object.values(P).filter(v => v && v.rush_pct).map(v => v.rush_pct))].sort((a, b) => a - b); return r.length > 1 ? r[0] + "–" + r[r.length - 1] + "%" : r[0] + "%"; })();
const ref = (() => { try { const r = JSON.parse(localStorage.getItem("fbd_ref")); return r && Date.now() - r.t < 30 * 864e5 ? r.code : ""; } catch (e) { return ""; } })();

const FAQ = [
  { q: "আপনারা কি লিখে দেন?", k: /লিখে|লেখা|likh|lekh|write|writing|content|research|গবেষণা|plagiar/i,
    a: "না। আমরা শুধু formatting আর presentation design করি — লেখা ও গবেষণা আপনার নিজের। তাই ভার্সিটি বা অফিসে কোনো সমস্যা হয় না।" },
  { q: "টাকা কীভাবে দেব?", k: /টাকা|পেমেন্ট|kivabe dib|taka|payment|pay|bkash|বিকাশ|advance|নগদ|nagad|bank|চেক/i,
    a: `দাম confirm হলে ${P.advance_pct}% advance bKash-এ দিলেই কাজ শুরু। Preview দেখে পছন্দ হলে বাকি টাকা, তারপর final file। অফিস/NGO কার্যাদেশ অনুযায়ী ব্যাংক বা চেকে দিতে পারে।` },
  { q: "কত দিনে পাব?", k: /কত দিন|কতদিন|koto din|kotodin|kobe|somoy|সময়|সময়|deadline|urgent|জরুরি|কবে|time|fast|delivery/i,
    a: `সাধারণত 24–72 ঘণ্টা; বড় report-এ file দেখে তারিখ লিখে দিই। Urgent হলে +${RUSH} চার্জে আগে দিই। দেরি হলে ২০% টাকা ফেরত।` },
  { q: "Revision আছে?", k: /revision|রিভিশন|ঠিক|thik|change|correction|সংশোধন|ভুল/i,
    a: "হ্যাঁ, ২ বার free revision। আর guideline না মানার কারণে ফেরত এলে বিনা খরচে ঠিক করে দিই।" },
  { q: "File কীভাবে পাঠাব?", k: /file|ফাইল|পাঠা|pathab|send|upload|drive|pdf|word|docx/i,
    a: `WhatsApp-এ সরাসরি, email-এ (${B.email}), অথবা Google Drive link। Word file হলে সবচেয়ে ভালো, তবে PDF বা ছবি থেকেও কাজ করি। সাথে আপনার guideline বা আগের কোনো approved কপি দিন।` },
  { q: "Free sample পাব?", k: /sample|নমুনা|nomuna|free|ফ্রি|demo|trial/i,
    a: "অফিস ও NGO হলে আপনার নিজের file-এর ৫ পেজ ফ্রি সাজিয়ে দেখাই — পছন্দ হলে তবেই order। আগে-পরের নমুনা এই পেজের Samples অংশে দেখতে পারেন।", go: "samples" },
  { q: "বিজয় → Unicode করেন?", k: /বিজয়|বিজয়|bijoy|sutonny|সুতন্নি|unicode|ইউনিকোড|nikosh|নিকস/i,
    a: `হ্যাঁ। SutonnyMJ/বিজয়ের লেখা Unicode-এ (নিকস বা সোলায়মানলিপি) রূপান্তর করি, যুক্তবর্ণ-বানান মিলিয়ে দেখি। ${tk(PK["gov-unicode"].price)}/page, প্রথম ${PK["gov-unicode"].free_pages} পেজ ফ্রি।` },
  { q: "অফিসের কোটেশন ও বিল?", k: /কোটেশন|quotation|quote|বিল|bill|invoice|ইনভয়েস|কার্যাদেশ|work order|ভ্যাট|vat/i,
    a: "নথির কপি আর প্রয়োজনীয় format জানালে লিখিত কোটেশন পাঠাই। কার্যাদেশ পেলে কাজ শুরু, শেষে আনুষ্ঠানিক বিল — হিসাব শাখার জন্য সব কাগজ দিই।" },
  { q: "Guideline মেনে করবেন?", k: /guideline|নিয়ম|নিয়ম|format|apa|ieee|harvard|margin|font|ফন্ট|reference|citation/i,
    a: "হ্যাঁ। আপনার ভার্সিটি/অফিসের guideline বা আগের কোনো approved কপি পাঠান, হুবহু সেই নিয়মে সাজাই — margin, font, TOC, page number, APA/IEEE/Harvard references সব।" },
  { q: "File কি গোপন থাকবে?", k: /গোপন|gopon|confidential|privacy|private|safe|নিরাপদ|share/i,
    a: "হ্যাঁ, সম্পূর্ণ গোপন। আপনার file কারো সাথে share হয় না, sample হিসেবেও কখনো দেখাই না।" },
  { q: "অফিস কোথায়?", k: /ঠিকানা|thikana|kothay|অফিস কোথায়|location|address|কোথায়|কোথায়|dhaka|ঢাকা/i,
    a: "আমরা ঢাকা থেকে পুরোটা online-এ কাজ করি — সারা বাংলাদেশ থেকে order নিই। প্রতিদিন 9am–11pm।" },
];
const PRICE_RX = /দাম|\bdam\b|daam|koto taka|khoroc|price|cost|rate|কত টাকা|খরচ|charge|package|প্যাকেজ|order|অর্ডার/i;
const HUMAN_RX = /মানুষ|human|agent|call|ফোন|phone|কথা বল|talk|whatsapp|হোয়াটস/i;

// ---------- UI ----------
const css = `
#fc-btn{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;gap:10px;height:56px;padding:0 20px 0 16px;border:0;border-radius:28px;background:#13294B;color:#fff;font:600 16px 'Hind Siliguri',sans-serif;box-shadow:0 8px 24px rgba(19,41,75,.35);cursor:pointer;transition:transform .15s}
#fc-btn:hover{transform:translateY(-2px)} #fc-btn svg{width:24px;height:24px;fill:#fff} #fc-btn i{position:absolute;top:8px;left:36px;width:10px;height:10px;border-radius:50%;background:#2BC48A;border:2px solid #13294B}
#fc-tease{position:fixed;right:16px;bottom:82px;z-index:40;max-width:260px;background:#fff;color:#1E2329;border:1px solid #E4E0D6;border-radius:12px 12px 4px 12px;padding:12px 34px 12px 14px;font:15px/1.5 'Hind Siliguri',sans-serif;box-shadow:0 8px 24px rgba(19,41,75,.18);cursor:pointer}
#fc-tease button{position:absolute;top:4px;right:6px;border:0;background:none;font-size:18px;color:#8A93A0;cursor:pointer;padding:2px 6px}
#fc{position:fixed;right:16px;bottom:16px;z-index:50;width:380px;height:min(600px,calc(100vh - 32px));display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(19,41,75,.32);overflow:hidden;font-family:'Hind Siliguri',sans-serif}
#fc[hidden],#fc-btn[hidden],#fc-tease[hidden]{display:none!important}
#fc header{position:static;display:flex;align-items:center;gap:10px;background:#13294B;color:#fff;padding:12px 12px 12px 16px;border:0}
#fc header img{width:34px;height:34px;background:#fff;border-radius:50%;padding:4px} #fc header b{display:block;font:600 16px Poppins,sans-serif} #fc header small{font-size:12.5px;color:#9FD9BE}
#fc header button{margin-left:auto;border:0;background:none;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px} #fc header button:hover{background:rgba(255,255,255,.12)}
#fc-log{flex:1;overflow-y:auto;padding:16px 14px 8px;background:#F7F5F0;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}
.fm{max-width:86%;padding:9px 13px;border-radius:14px;font-size:15px;line-height:1.55;white-space:pre-line;word-wrap:break-word}
.fm.bot{background:#fff;color:#1E2329;border:1px solid #E4E0D6;border-bottom-left-radius:4px;align-self:flex-start}
.fm.me{background:#13294B;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}
.fm.est{padding:12px 14px;white-space:normal} .fm.est table{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0} .fm.est td{padding:3px 0;vertical-align:top} .fm.est td+td{text-align:right;white-space:nowrap;padding-left:10px}
.fm.est tr.t td{border-top:1.5px solid #13294B;font-weight:700;color:#13294B;font-size:16px;padding-top:6px} .fm.est small{display:block;color:#5A6472;font-size:12.5px;line-height:1.45}
.fm a{color:inherit}
.fc-typing{align-self:flex-start;background:#fff;border:1px solid #E4E0D6;border-radius:14px;padding:10px 14px;display:flex;gap:4px} .fc-typing i{width:6px;height:6px;border-radius:50%;background:#A9B0BA;animation:fcb 1s infinite} .fc-typing i:nth-child(2){animation-delay:.15s} .fc-typing i:nth-child(3){animation-delay:.3s}
@keyframes fcb{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-3px)}}
#fc-opts{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;background:#F7F5F0;border-top:1px solid #EEEAE0;max-height:40%;overflow-y:auto}
#fc-opts:empty{display:none}
#fc-opts button,#fc-opts a{border:1.5px solid #0B7A54;background:#fff;color:#0B7A54;border-radius:18px;padding:6px 13px;font:600 14px 'Hind Siliguri',sans-serif;cursor:pointer;text-decoration:none;line-height:1.35;text-align:left}
#fc-opts button:hover,#fc-opts a:hover{background:#EAF6F0} #fc-opts .pri{background:#1F9E55;border-color:#1F9E55;color:#fff} #fc-opts .pri:hover{background:#178246}
#fc form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #E4E0D6;background:#fff}
#fc input{flex:1;min-width:0;border:1.5px solid #D9D4C7;border-radius:22px;padding:9px 14px;font:15px 'Hind Siliguri',sans-serif;color:#1E2329;outline:none} #fc input:focus{border-color:#12A06E}
#fc form button{flex:none;width:42px;height:42px;border:0;border-radius:50%;background:#0B7A54;color:#fff;cursor:pointer;display:grid;place-items:center} #fc form button svg{width:20px;height:20px;fill:#fff}
@media (max-width:560px){#fc{right:0;bottom:0;width:100%;height:100%;max-height:100dvh;border-radius:0} #fc-btn span{display:none} #fc-btn{padding:0 16px} #fc-tease{right:12px;bottom:80px}}
@media (prefers-reduced-motion:reduce){.fc-typing i{animation:none}}`;
document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);
document.body.insertAdjacentHTML("beforeend", `
<button id="fc-btn" type="button" aria-label="Chat খুলুন: দাম ও প্রশ্ন"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg><i></i><span>দাম জানুন · Chat</span></button>
<div id="fc-tease" hidden role="status"><button type="button" aria-label="বন্ধ করুন">×</button>দাম জানতে চান? ১ মিনিটে estimate দিয়ে দিই।</div>
<section id="fc" hidden role="dialog" aria-label="FormatBD chat assistant">
  <header><img src="assets/logo-icon.svg" alt=""><div><b>FormatBD Assistant</b><small>● সাথে সাথে উত্তর · মানুষ WhatsApp-এ</small></div><button type="button" aria-label="Chat বন্ধ করুন">×</button></header>
  <div id="fc-log" aria-live="polite"></div>
  <div id="fc-opts"></div>
  <form autocomplete="off"><input aria-label="আপনার message" placeholder="প্রশ্ন বা উত্তর লিখুন…" maxlength="300"><button type="submit" aria-label="পাঠান"><svg viewBox="0 0 24 24"><path d="M3 20.5 21 12 3 3.5l.01 6.6L15 12 3.01 13.9z"/></svg></button></form>
</section>`);
const $ = id => document.getElementById(id);
const box = $("fc"), log = $("fc-log"), opts = $("fc-opts"), form = box.querySelector("form"), inp = form.querySelector("input");
const btn = $("fc-btn"), tease = $("fc-tease");

let S = {}, expect = null, started = false, busy = Promise.resolve();
const scroll = () => { log.scrollTop = log.scrollHeight; };
function addMsg(cls, text, html) {
  const d = document.createElement("div"); d.className = "fm " + cls;
  if (html) d.innerHTML = html; else d.textContent = text;
  log.appendChild(d); scroll(); return d;
}
// bot messages queue with a short "typing" pause so they read like a conversation
function bot(text, html) {
  busy = busy.then(() => new Promise(res => {
    const t = document.createElement("div"); t.className = "fc-typing"; t.innerHTML = "<i></i><i></i><i></i>";
    log.appendChild(t); scroll();
    setTimeout(() => { t.remove(); addMsg(html ? "bot est" : "bot", text, html); res(); }, Math.min(900, 300 + text.length * 6));
  }));
  return busy;
}
function options(list, placeholder) {
  busy.then(() => {
    opts.innerHTML = "";
    list.forEach(o => {
      const el = document.createElement(o.href ? "a" : "button");
      el.textContent = o.t; if (o.pri) el.className = "pri";
      if (o.href) { el.href = o.href; el.target = "_blank"; el.rel = "noopener"; el.onclick = () => o.fn && o.fn(); }
      else { el.type = "button"; el.onclick = () => { if (!o.silent) addMsg("me", o.t); opts.innerHTML = ""; o.fn(); }; }
      opts.appendChild(el);
    });
    inp.placeholder = placeholder || "প্রশ্ন বা উত্তর লিখুন…";
    scroll();
  });
}
const homeOpt = { t: "মেনুতে ফিরুন", fn: () => menu(true) };
const humanOpt = (txt) => ({ t: "WhatsApp-এ মানুষের সাথে কথা", href: wa(txt || "আসসালামু আলাইকুম, FormatBD — একটা প্রশ্ন ছিল।") });

// ---------- flow ----------
function menu(again) {
  expect = null; S = {};
  bot(again ? "আর কী জানতে চান?" : "আসসালামু আলাইকুম! আমি FormatBD-এর assistant।\n১ মিনিটে আপনার কাজের দাম বলে দিতে পারি, বা যেকোনো প্রশ্নের উত্তর।");
  options([
    { t: "Report formatting-এর দাম", fn: () => pickSeg("report") },
    { t: "Presentation-এর দাম", fn: () => pickSeg("slides") },
    { t: "Samples দেখব", fn: showSamples },
    { t: "প্রশ্ন আছে", fn: faqMenu },
    humanOpt(),
  ]);
}
function showSamples() {
  bot("নিচে Samples অংশে আগে-পরের ৬টি নমুনা আছে — মাঝের দাগ টেনে পার্থক্য দেখুন। Report আর Presentation দুটো tab।");
  const s = document.getElementById("samples");
  if (s) setTimeout(() => { if (matchMedia("(max-width:560px)").matches) close(); s.scrollIntoView({ behavior: "smooth" }); }, 900);
  options([{ t: "এবার দাম জানব", fn: () => menu(true) }, homeOpt]);
}
function faqMenu() {
  bot("কোন বিষয়ে জানতে চান? নিচে বাছুন, বা নিজের প্রশ্ন লিখুন।");
  options(FAQ.map(f => ({ t: f.q, fn: () => answer(f) })).concat([homeOpt]));
}
function answer(f) {
  bot(f.a);
  const o = [{ t: "দাম জানব", fn: () => menu(true) }, { t: "আরও প্রশ্ন", fn: faqMenu }];
  if (f.go === "samples") o.unshift({ t: "Samples দেখব", fn: showSamples });
  options(resume().concat(o, [humanOpt()]));
}
function pickSeg(svc) {
  S.svc = svc;
  bot(svc === "report" ? "Report formatting — কার জন্য কাজটা?" : "Presentation — কার জন্য?");
  options(Object.entries(SEG).map(([seg, label]) => ({ t: label, fn: () => pickPkg(seg) })).concat([homeOpt]));
}
function pickPkg(seg) {
  S.seg = seg;
  const svc = cfg.services.find(s => s.id === S.svc);
  const list = svc.items.map(id => PK[id]).filter(p => p && p.seg === seg);
  if (!list.length) { // e.g. no govt package in this service: use the per-page/per-slide rate
    const p = P[seg];
    bot(S.svc === "report" ? `এই ধরনের কাজে প্রতি পেজ ${tk(p.page)} (minimum ${tk(p.page_min)})।` : `প্রতি slide ${tk(p.slide)} (minimum ${tk(p.slides_min)})।`);
    S.pkg = null; return askQty();
  }
  if (list.length === 1) { bot(`আপনার জন্য: ${list[0].name}`); return choose(list[0].id); }
  bot("কোন package-টা মিলে যায়?");
  options(list.map(p => ({ t: `${p.name} — ${tk(p.price)}${p.free_pages ? "/page" : ""}`, fn: () => choose(p.id) })).concat([{ t: "পেছনে যান", fn: () => pickSeg(S.svc) }]));
}
function choose(id) {
  const p = PK[id]; S.pkg = id; S.seg = p.seg;
  if (!S.svc) S.svc = (cfg.services.find(s => s.items.includes(id)) || {}).id || "report";
  const inc = (p.inc || []).map(x => "• " + x).join("\n");
  const was = p.regular > p.price ? ` (আগে ${tk(p.regular)})` : "";
  bot(`${p.name}: ${tk(p.price)}${p.free_pages ? "/page" : ""}${was}\n${p.unit}${inc ? "\n\n" + inc : ""}`);
  askQty();
}
const isSlides = () => { const p = PK[S.pkg]; return p ? (!p.pages && !p.free_pages) : S.svc === "slides"; };
function askQty() {
  const p = PK[S.pkg];
  if (isSlides()) {
    bot("মোট কত slide লাগবে? (আনুমানিক বললেই হবে)");
    options([15, 20, 25, 30].map(n => ({ t: n === 15 ? "15 বা কম" : n + " slides", fn: () => setQty(n) })), "Slide সংখ্যা লিখুন, যেমন 18");
  } else {
    const base = p && p.pages ? p.pages : 0;
    bot(p && p.free_pages ? `মোট কত পেজ? প্রথম ${p.free_pages} পেজ ফ্রি।` : `আনুমানিক কত পেজ?${base ? ` (${base} পেজ পর্যন্ত package-এ ধরা)` : ""}`);
    const chips = base ? [base, base + 20, base + 40] : [20, 40, 80, 120];
    options(chips.map(n => ({ t: n === base ? `${n} বা কম` : `${n} পেজ`, fn: () => setQty(n) })), "পেজ সংখ্যা লিখুন, যেমন 55");
  }
  expect = "qty";
}
function setQty(n) {
  expect = null; S.qty = Math.max(1, Math.min(2000, Math.round(n)));
  bot("কবে লাগবে?");
  options([
    { t: "Normal (সময় file দেখে confirm)", fn: () => { S.rush = false; quote(); } },
    { t: `Urgent (+${P[S.seg].rush_pct}%)`, fn: () => { S.rush = true; quote(); } },
  ]);
}
function calc() {
  const p = PK[S.pkg], seg = S.seg, rate = P[seg];
  let o;
  if (!p) o = isSlides() ? { seg, slides: S.qty } : { seg, pages: S.qty };
  else if (isSlides()) o = { seg, pkg: S.pkg };
  else o = { seg, pkg: S.pkg, pages: S.qty };
  const e = estimate(cfg, o);
  const lines = e.lines.slice();
  if (p && isSlides() && S.qty > 15) lines.push([`Extra slides x${S.qty - 15}`, (S.qty - 15) * rate.slide]);
  const sum = () => lines.reduce((s, [, v]) => s + v, 0);
  if (S.rush) lines.push([`Urgent delivery (+${rate.rush_pct}%)`, pyRound(sum() * rate.rush_pct / 100)]);
  const total = pyRound(sum(), -1);
  return { lines, total, adv: advance(cfg, total) };
}
function quote() {
  const q = S.q = calc();
  const rows = q.lines.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${tk(v)}</td></tr>`).join("");
  bot("estimate", `<b>আপনার estimate</b><table>${rows}<tr class="t"><td>মোট</td><td>${tk(q.total)}</td></tr></table>
<small>Advance মাত্র ${tk(q.adv)} (${P.advance_pct}%) — দাম confirm হওয়ার পর। File দেখে final দাম জানাই, এই দামের বেশি না (extra page/slide ছাড়া)।${ref ? `<br>Referral code ${esc(ref)}: ${cfg.referral.customer_pct}% ছাড়, confirm-এর সময় বাদ দেওয়া হবে।` : ""}</small>`);
  askName();
}
function askName() {
  bot("Order করতে আপনার নামটা লিখুন (অফিস/ভার্সিটির নামও দিতে পারেন)।");
  options([{ t: "নাম ছাড়াই এগোই", fn: () => finish("") }, { t: "আগে প্রশ্ন আছে", fn: faqMenu }], "আপনার নাম লিখুন");
  expect = "name";
}
// after an estimate, side questions keep a button back to the unfinished order
const resume = () => (S.q && !S.done ? [{ t: "Order শেষ করি", pri: true, fn: askName }] : []);
function orderText(name) {
  const p = PK[S.pkg], q = S.q;
  return ["আসসালামু আলাইকুম, FormatBD — order করতে চাই।",
    name && "নাম: " + name,
    "কাজ: " + (p ? p.name : (S.svc === "slides" ? "Presentation" : "Report formatting") + " (" + SEG[S.seg] + ")"),
    (isSlides() ? "Slides: " : "Pages: ") + S.qty,
    "Delivery: " + (S.rush ? "Urgent" : "Normal"),
    "Website estimate: " + tk(q.total) + " (advance " + tk(q.adv) + ")",
    ref && "Referral code: " + ref,
    "File পাঠাচ্ছি।"].filter(Boolean).join("\n");
}
function finish(name) {
  expect = null; S.name = name; S.done = true;
  const txt = orderText(name);
  bot(`ধন্যবাদ${name ? ", " + name : ""}! শেষ ধাপ: নিচের সবুজ button চাপলে WhatsApp খুলবে, আপনার order-এর সব তথ্য লেখা থাকবে। শুধু Send করুন আর file পাঠান।\nআমরা দাম ও তারিখ লিখিতভাবে confirm করব।`);
  options([
    { t: "WhatsApp-এ order পাঠান", pri: true, href: wa(txt), fn: () => track("wa_order") },
    { t: "Email করব", href: "mailto:" + B.email + "?subject=" + encodeURIComponent("Order: " + (PK[S.pkg] ? PK[S.pkg].name : "FormatBD")) + "&body=" + encodeURIComponent(txt) },
    { t: "নতুন করে শুরু", fn: () => menu(true) },
  ]);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const track = ev => { try { window.fbq && window.fbq("track", "Lead"); window.gtag && window.gtag("event", ev); } catch (e) {} };

// free text: numbers/names when a step expects them, otherwise match the FAQ, then fall back to a human
function onText(raw) {
  const t = raw.trim(); if (!t) return;
  addMsg("me", t); opts.innerHTML = "";
  if (expect === "qty") {
    const n = parseInt(t.replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d)).replace(/\D+/g, " ").trim().split(" ")[0], 10);
    if (n > 0) return setQty(n);
    bot("সংখ্যাটা বুঝিনি — শুধু সংখ্যা লিখুন, যেমন 40।"); return askQty();
  }
  if (expect === "name") {
    const isQ = /[?？]/.test(t) || /\b(ki|kivabe|koto|kobe|can|do you|how|what|when)\b|কি |কী|কীভাবে|কত|কবে/i.test(t) || t.split(/\s+/).length > 8;
    if (!isQ) return finish(t.slice(0, 80));
    expect = null; // a question, not a name: answer it below, resume() offers the way back
  }
  const f = FAQ.find(x => x.k.test(t));
  if (f && !PRICE_RX.test(t)) return answer(f);
  if (PRICE_RX.test(t)) {
    if (/slide|স্লাইড|presentation|প্রেজেন্টেশন|ppt|deck|defen[cs]e/i.test(t)) return pickSeg("slides");
    if (/report|রিপোর্ট|thesis|থিসিস|প্রতিবেদন|internship/i.test(t)) return pickSeg("report");
    bot("কোন কাজের দাম জানতে চান?");
    return options([{ t: "Report formatting", fn: () => pickSeg("report") }, { t: "Presentation", fn: () => pickSeg("slides") }]);
  }
  if (/^(hi|hello|hey|salam|assalam|আসসালাম|সালাম|হ্যালো|হাই)/i.test(t)) return menu();
  if (HUMAN_RX.test(t)) { bot("অবশ্যই — নিচের button চাপলে সরাসরি WhatsApp-এ আমাদের সাথে কথা বলতে পারবেন।"); return options(resume().concat([humanOpt(), homeOpt])); }
  bot("এই প্রশ্নটা আমাদের টিমকে সরাসরি জিজ্ঞেস করাই ভালো — নিচের button চাপলে আপনার প্রশ্নসহ WhatsApp খুলবে। সাধারণত ৩০ মিনিটের মধ্যে উত্তর দিই (9am–11pm)।");
  options(resume().concat([humanOpt("আসসালামু আলাইকুম, FormatBD — " + t), homeOpt]));
}
form.addEventListener("submit", e => { e.preventDefault(); const v = inp.value; inp.value = ""; onText(v); });

// ---------- open / close ----------
function open(pkg) {
  box.hidden = false; btn.hidden = true; tease.hidden = true;
  try { sessionStorage.setItem("fc_seen", "1"); } catch (e) {}
  const svc = /^svc:/.test(pkg || "") && pkg.slice(4);
  if (svc) { opts.innerHTML = ""; if (!started) bot("আসসালামু আলাইকুম! আমি FormatBD-এর assistant।"); started = true; S = {}; pickSeg(svc); }
  else if (pkg && PK[pkg]) { opts.innerHTML = ""; if (!started) bot("আসসালামু আলাইকুম! আমি FormatBD-এর assistant।"); started = true; S = {}; choose(pkg); }
  else if (!started) { started = true; menu(); }
  if (!matchMedia("(max-width:560px)").matches) setTimeout(() => inp.focus(), 50);
}
function close() { box.hidden = true; btn.hidden = false; btn.focus(); }
btn.onclick = () => open();
box.querySelector("header button").onclick = close;
document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) close(); });
tease.onclick = e => { tease.hidden = true; if (!e.target.closest("button")) open(); };
let seen = false; try { seen = !!sessionStorage.getItem("fc_seen"); } catch (e) {}
if (!seen) setTimeout(() => { if (box.hidden) { tease.hidden = false; try { sessionStorage.setItem("fc_seen", "1"); } catch (e) {} } }, 9000);
window.fbdChat = { open };
