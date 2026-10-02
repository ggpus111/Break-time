// =============================================================================
// customer.js — 손님 화면 (index.html)
// -----------------------------------------------------------------------------
// QR을 찍으면 여는 페이지. 메뉴 보기 → 장바구니 담기 → 주문서 작성 → 번호표 받기,
// 그리고 번호표 화면을 닫고 나가도 백그라운드에서 계속 지켜보다가 주문이 "나왔어요"가
// 되면 소리 · 진동으로 알려주는 것까지 이 파일 하나에서 처리합니다.
// 데이터는 전부 store.js를 통해서만 주고받고, 여기서는 DOM만 신경 씁니다.
// =============================================================================
import store, { DEMO, CATEGORIES, STATUS, won } from './store.js';

const $ = (id) => document.getElementById(id);
// 사용자가 적은 텍스트를 그대로 innerHTML에 넣으면 위험하므로(XSS), 항상 이 함수로 이스케이프
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let menu = [];                                        // store.watchMenu가 채워줌
let settings = { open: true, notice: '', bank: '' };  // store.watchSettings가 채워줌
const cart = new Map(); // 장바구니: 장바구니 키(cartKey) -> 담은 개수

const d = new Date();
$('today').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
$('demo').hidden = !DEMO;

// 지금 주문할 수 있는 메뉴인가? (품절이 아니고, 관리자가 가격을 정해둔 상태)
const orderable = (m) => !m.soldOut && typeof m.price === 'number';

// 장바구니 키 만들기: 보통 메뉴는 메뉴id 그대로, 시즈닝처럼 "옵션 중 하나를 꼭 골라야"
// 하는 메뉴는 "메뉴id::옵션순번"으로 만들어서 옵션별로 따로 담기 버튼을 둡니다.
const cartKey = (id, optIdx) => (optIdx == null ? id : `${id}::${optIdx}`);
function parseCartKey(key) {
  const sep = key.indexOf('::');
  return sep === -1 ? { id: key, optIdx: null } : { id: key.slice(0, sep), optIdx: Number(key.slice(sep + 2)) };
}

/* ---------- 메뉴 ---------- */
function renderMenu() {
  const cats = [...CATEGORIES];
  const extra = menu.filter((m) => !cats.some((c) => c.id === m.category));
  if (extra.length) cats.push({ id: '__etc', period: '방과후', label: '기타' });

  $('menu').innerHTML = cats.map((c) => {
    const items = c.id === '__etc' ? extra : menu.filter((m) => m.category === c.id);
    if (!items.length) return '';
    return `<section class="period">
      <div class="period-head"><span class="period-no">${c.period}</span><h2 class="period-name">${c.label}</h2></div>
      <div class="items">${items.map(itemHTML).join('')}</div>
    </section>`;
  }).join('');
}

// +/- 버튼 한 쌍. data-inc/data-dec에 장바구니 키를 그대로 심어두면
// 아래 클릭 핸들러가 어떤 메뉴/옵션이든 똑같이 처리할 수 있어요.
function stepperHTML(key, qty, ok, label) {
  return `<div class="stepper">
      <button type="button" data-dec="${esc(key)}" aria-label="${esc(label)} 빼기" ${qty ? '' : 'disabled'}>−</button>
      <output aria-live="polite">${qty}</output>
      <button type="button" class="plus" data-inc="${esc(key)}" aria-label="${esc(label)} 담기" ${ok ? '' : 'disabled'}>+</button>
    </div>`;
}

// 메뉴 카드 하나. 옵션(시즈닝)이 있는 메뉴는 옵션 개수만큼 스테퍼를 나란히 보여주고,
// 없는 메뉴는 원래대로 스테퍼 하나만 보여줍니다.
function itemHTML(m) {
  const ok = orderable(m) && settings.open;
  const hasOptions = Array.isArray(m.options) && m.options.length > 0;
  const cls = ['item', m.soldOut ? 'off' : '', typeof m.price !== 'number' ? 'noprice off' : '', hasOptions ? 'has-options' : ''].join(' ');
  let right = '';
  if (m.soldOut) right = '<span class="stamp">품절</span>';
  else if (typeof m.price !== 'number') right = '<span class="off-note">준비 중</span>'; // 관리자가 아직 가격을 안 정함
  else if (hasOptions) {
    right = `<div class="item-options">${m.options.map((opt, idx) => {
      const key = cartKey(m.id, idx);
      const qty = cart.get(key) || 0;
      return `<div class="opt-row"><span class="opt-label">${esc(opt)}</span>${stepperHTML(key, qty, ok, `${m.name} ${opt}`)}</div>`;
    }).join('')}</div>`;
  }
  else right = stepperHTML(m.id, cart.get(m.id) || 0, ok, m.name);
  return `<article class="${cls}">
    <div class="item-main">
      <h3>${esc(m.name)}</h3>
      ${m.desc ? `<p class="desc">${esc(m.desc)}</p>` : ''}
      <p class="price">${won(m.price)}</p>
    </div>${right}
  </article>`;
}

// 메뉴 목록 전체에 이벤트 리스너 하나만 달아두고(이벤트 위임), 어떤 버튼을 눌렀는지는
// data-inc/data-dec 속성으로 구분 — 메뉴가 다시 그려져도 매번 새로 리스너를 안 달아도 됨.
$('menu').addEventListener('click', (e) => {
  const inc = e.target.closest('[data-inc]');
  const dec = e.target.closest('[data-dec]');
  if (inc) cart.set(inc.dataset.inc, Math.min(20, (cart.get(inc.dataset.inc) || 0) + 1)); // 한 종류 최대 20개
  else if (dec) { const q = (cart.get(dec.dataset.dec) || 0) - 1; q > 0 ? cart.set(dec.dataset.dec, q) : cart.delete(dec.dataset.dec); }
  else return;
  renderMenu(); renderCart();
});

/* ---------- 장바구니 ----------
 * cart(Map)는 화면 렌더링을 빠르게 하려고 "키 -> 개수"만 들고 있고,
 * 실제 주문에 필요한 이름 · 가격 · 옵션 이름 같은 정보는 필요할 때마다
 * cartLines()로 menu 배열과 합쳐서 만들어 냅니다.
 */
function cartLines() {
  return [...cart].map(([key, qty]) => {
    const { id, optIdx } = parseCartKey(key);
    const m = menu.find((x) => x.id === id);
    if (!m || !orderable(m)) return null;
    if (optIdx == null) return { id, name: m.name, price: m.price, qty };
    const option = Array.isArray(m.options) ? m.options[optIdx] : null;
    return option ? { id, name: m.name, price: m.price, qty, option } : null; // 옵션이 없어졌으면(관리자가 수정) 담지 않음
  }).filter(Boolean);
}
const sum = (lines) => lines.reduce((s, l) => s + l.price * l.qty, 0);

function renderCart() {
  // 품절/가격미정으로 바뀌었거나, 골랐던 옵션이 없어진 메뉴는 장바구니에서 뺌
  for (const key of [...cart.keys()]) {
    const { id, optIdx } = parseCartKey(key);
    const m = menu.find((x) => x.id === id);
    const ok = m && orderable(m) && (optIdx == null || (Array.isArray(m.options) && m.options[optIdx] != null));
    if (!ok) cart.delete(key);
  }
  const lines = cartLines();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  $('cartbar').hidden = !count;
  $('cartCount').textContent = `담은 간식 ${count}개`;
  $('cartTotal').textContent = won(sum(lines));
  $('openCheckout').disabled = !settings.open;
  $('openCheckout').textContent = settings.open ? '주문하기' : '주문 마감';
}

/* ---------- 시트 공통 ---------- */
function openSheet(el) { el.hidden = false; document.body.style.overflow = 'hidden'; }
function closeSheet(el) { el.hidden = true; document.body.style.overflow = ''; }
document.querySelectorAll('.sheet').forEach((s) => {
  s.addEventListener('click', (e) => { if (e.target === s || e.target.closest('[data-close]')) { closeSheet(s); if (s.id === 'ticketSheet') currentTicketId = null; } });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.sheet:not([hidden])').forEach((s) => { closeSheet(s); if (s.id === 'ticketSheet') currentTicketId = null; });
});

async function copy(text, btn) {
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = '복사됨'; }
  catch { btn.textContent = '길게 눌러 복사'; }
  setTimeout(() => (btn.textContent = label), 1600);
}
// "국민은행 631201-04-238914 (…)" 에서 계좌번호만
const accountNo = (s) => ((s || '').match(/\d[\d-]{6,}\d/) || [s || ''])[0];
// "토스뱅크 1002-… (예금주)" → 계좌 줄 / 예금주 줄
function showBank(el, s) {
  const m = (s || '').match(/^(.*?)\s*(\(.*\))\s*$/);
  el.innerHTML = m ? `${esc(m[1])}<br>${esc(m[2])}` : esc(s);
}

/* ---------- 주문서 ---------- */
const lineHTML = (l) => `<li><span>${esc(l.name)}${l.option ? ' · ' + esc(l.option) : ''} × ${l.qty}</span><span>${won(l.price * l.qty)}</span></li>`;

function renderPay() {
  const transfer = $('payTransfer').checked;
  $('transferBox').hidden = !transfer;
  $('bankbox').hidden = !settings.bank;
  showBank($('bankText'), settings.bank);
  $('payHint').textContent = transfer
    ? (settings.bank ? '위 계좌로 합계 금액을 보내 주세요. 입금이 확인되면 바로 만들기 시작해요.' : '계좌 정보는 부스에서 안내해 드려요.')
    : '주문 넣고 부스에서 현금을 내 주세요. 결제가 확인되면 바로 만들기 시작해요.';
}

$('openCheckout').addEventListener('click', () => {
  const lines = cartLines();
  if (!lines.length) return;
  $('coLines').innerHTML = lines.map(lineHTML).join('');
  $('coTotal').textContent = won(sum(lines));
  $('coErr').hidden = true;
  dupArmed = false;
  renderPay();
  openSheet($('checkout'));
});
document.querySelectorAll('input[name=pay]').forEach((r) => r.addEventListener('change', renderPay));
$('copyBank').addEventListener('click', (e) => copy(accountNo(settings.bank), e.currentTarget));

/* ---------- 중복 주문 경고 ---------- */
const DUP_WINDOW_MS = 90 * 1000; // 90초 안에 똑같은 조합을 또 넣으면 한 번 물어봐요
let dupArmed = false; // 경고를 보고 한 번 더 누르면 그대로 진행
const orderSig = (lines) => lines.map((l) => `${l.id}:${l.option || ''}:${l.qty}`).sort().join(',');
function readLastOrder() { try { return JSON.parse(localStorage.getItem('swi_last_order') || 'null'); } catch { return null; } }
function writeLastOrder(sig) { try { localStorage.setItem('swi_last_order', JSON.stringify({ sig, at: Date.now() })); } catch {} }

$('coForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const lines = cartLines();
  const err = (msg) => { $('coErr').textContent = msg; $('coErr').hidden = false; };
  if (!lines.length) { err('담은 간식이 없어요. 메뉴에서 다시 골라 주세요.'); return; }
  if (!settings.open) { err('지금은 주문을 받지 않아요. 부스에 문의해 주세요.'); return; }
  const pay = document.querySelector('input[name=pay]:checked').value;
  const depositor = pay === 'transfer' ? $('coDepositor').value.trim() : '';
  if (pay === 'transfer' && !depositor) { err('입금 확인을 위해 입금자명을 적어 주세요.'); $('coDepositor').focus(); return; }

  const sig = orderSig(lines);
  const last = readLastOrder();
  if (!dupArmed && last && last.sig === sig && Date.now() - last.at < DUP_WINDOW_MS) {
    const secAgo = Math.max(1, Math.round((Date.now() - last.at) / 1000));
    err(`${secAgo}초 전에 똑같은 걸 주문했어요. 정말 또 주문하려면 "주문 넣기"를 한 번 더 눌러 주세요.`);
    dupArmed = true;
    setTimeout(() => { dupArmed = false; }, 8000);
    return;
  }
  dupArmed = false;
  $('coErr').hidden = true;

  const btn = $('coSubmit');
  btn.disabled = true; btn.textContent = '주문 넣는 중…';
  try {
    const { id, number } = await store.placeOrder({
      pay, depositor, memo: $('coMemo').value.trim(),
      items: lines, total: sum(lines),
    });
    writeLastOrder(sig);
    try {
      const mine = JSON.parse(localStorage.getItem('swi_my') || '[]');
      mine.unshift({ id, number });
      localStorage.setItem('swi_my', JSON.stringify(mine.slice(0, 6)));
    } catch {}
    cart.clear(); $('coMemo').value = '';
    renderMenu(); renderCart(); renderMine();
    closeSheet($('checkout'));
    showTicket(id);
  } catch (ex) {
    console.error(ex);
    const m = (ex && ex.message) || '';
    err(m === 'closed' ? '지금은 주문을 받지 않아요.'
      : m.startsWith('unavailable') ? `방금 품절되거나 가격이 바뀐 메뉴가 있어요 (${m.split(':')[1] || ''}). 메뉴를 다시 확인해 주세요.`
      : m.startsWith('need_option') || m.startsWith('bad_option') ? `방금 옵션(시즈닝)이 바뀐 메뉴가 있어요 (${m.split(':')[1] || ''}). 메뉴를 다시 확인해 주세요.`
      : '주문이 들어가지 않았어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
  } finally {
    btn.disabled = false; btn.textContent = '주문 넣기';
  }
});

/* =============================================================================
 * 번호표
 * -----------------------------------------------------------------------------
 * 핵심 아이디어: "번호표 시트가 화면에 떠 있는지"와 "그 주문을 지켜보는지"를 분리했습니다.
 *   - bgWatchers: 주문 id별로 store.watchOrder 구독을 하나씩 들고 있음. 시트를 닫아도
 *     끊지 않고 계속 지켜봐서, 다른 메뉴를 보는 중에도 "나왔어요" 알림이 울리게 합니다.
 *   - currentTicketId: 지금 화면에 떠 있는 시트가 어떤 주문인지. 이 값과 같을 때만
 *     실제로 DOM(renderTicket)을 갱신합니다.
 *   - lastOrder: 주문별 가장 최근 상태 캐시. 시트를 다시 열 때 서버 응답을 기다리지 않고
 *     바로 보여주기 위한 용도.
 *   - notified: 이미 "나왔어요" 소리를 울린 주문 id 모음 — 같은 주문에 소리가 여러 번
 *     안 울리게 막아줌.
 * ========================================================================== */
const pad = (n) => String(n).padStart(3, '0');
let currentTicketId = null;         // 지금 열려 있는 번호표 시트의 주문 (없으면 null)
const bgWatchers = new Map();       // 주문 id -> 감시 끄는 함수 (시트를 닫아도 계속 지켜봄)
const notified = new Set();         // 이미 "나왔어요" 소리를 울린 주문
const lastOrder = new Map();        // 주문 id -> 가장 최근에 받은 상태 (다시 열 때 바로 보여주기용)

/* 팝업 권한 없이도 알 수 있게: 소리 + 진동. 화면(탭)이 열려 있는 동안만 동작해요. */
let audioCtx;
function ding() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    [[880, 0], [1175, 0.15]].forEach(([f, dt]) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.45, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.4);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.45);
    });
  } catch {}
  try { navigator.vibrate && navigator.vibrate([120, 60, 120, 60, 220]); } catch {}
}
// 브라우저는 사용자가 화면을 한 번 눌러야 소리를 허락해요. 첫 탭에서 미리 준비.
document.addEventListener('click', () => { try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch {} }, { once: true });

function renderTicket(o) {
  $('tkTitle').textContent = o.status === 'ready' ? '나왔어요! 부스로 오세요' : '주문 완료';
  $('tkNo').textContent = pad(o.number);
  $('tkTime').textContent = new Date(o.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 주문';
  const payWait = !o.paid && o.status === 'new';
  $('tkStatus').textContent = o.status === 'ready' ? '나왔어요! 받으러 오세요'
    : payWait ? (o.pay === 'transfer' ? '입금 확인을 기다리는 중' : '부스에서 현금 결제해 주세요')
    : o.status === 'new' ? '결제 확인! 곧 만들어요' : STATUS[o.status];
  $('ticket').className = 'ticket ' + o.status;
  const idx = { new: 0, cooking: 1, ready: 2, done: 3 }[o.status] ?? -1;
  [...$('tkSteps').children].forEach((li, i) => {
    li.className = i < idx || (idx === 3) ? 'on' : i === idx ? 'on now' : '';
  });
  $('tkSteps').hidden = o.status === 'canceled';
  const showQueue = ['new', 'cooking'].includes(o.status) && typeof o.ahead === 'number';
  $('tkQueue').hidden = !showQueue;
  if (showQueue) $('tkQueue').textContent = o.ahead === 0 ? '내 앞엔 아무도 없어요, 곧 시작해요' : `내 앞에 ${o.ahead}명 남았어요`;
  $('tkLines').innerHTML = o.items.map(lineHTML).join('');
  $('tkPay').textContent = (o.pay === 'transfer' ? '계좌이체' : '현금') + (o.paid ? ' · 결제 완료' : '');
  $('tkTotal').textContent = won(o.total);
  $('tkBank').hidden = !(payWait && o.pay === 'transfer' && settings.bank);
  showBank($('tkBankText'), settings.bank);
  $('tkDepositor').textContent = o.depositor ? `입금자명: ${o.depositor}` : '';
}

function markMineReady(id) {
  const b = $('mineList').querySelector(`[data-ticket="${id}"]`);
  if (b) b.classList.add('ready');
}

// 번호표 시트를 닫아도(메뉴를 보는 중이어도) 계속 지켜보다가, 나왔을 때 소리 · 진동으로 알려줘요
function trackOrder(id) {
  if (bgWatchers.has(id)) return;
  let prevStatus = null;
  const unwatch = store.watchOrder(id, (o) => {
    if (!o) { if (id === currentTicketId) $('tkStatus').textContent = '주문을 찾을 수 없어요'; return; }
    lastOrder.set(id, o);

    // 상태 전환 감지 — 첫 번체는 prevStatus가 null이라 스킵, 이후부터만 알림
    if (prevStatus !== null && prevStatus !== o.status) {
      if (o.status === 'ready' && !notified.has(id)) {
        notified.add(id);
        ding();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]); // 진동: 200ms on, 100ms off, 200ms on
        markMineReady(id);
      } else if (o.status === 'cooking') {
        if (navigator.vibrate) navigator.vibrate(100); // 가벼운 진동
      }
    }
    prevStatus = o.status;

    if (id === currentTicketId) renderTicket(o);
    if (o.status === 'done' || o.status === 'canceled') {
      // 데모 모드는 store.watchOrder가 콜백을 즉시(동기) 한 번 부르기 때문에,
      // 지금 이 시점엔 아직 unwatch가 다 만들어지지 않았을 수 있어요. 한 틱 미뤄서 안전하게 정리.
      queueMicrotask(() => { const w = bgWatchers.get(id); if (w) { w(); bgWatchers.delete(id); } });
    }
  });
  bgWatchers.set(id, unwatch);
}

function showTicket(id) {
  currentTicketId = id;
  openSheet($('ticketSheet'));
  const cached = lastOrder.get(id);
  if (cached) renderTicket(cached); else $('tkNo').textContent = '···';
  trackOrder(id);
}
$('tkCopy').addEventListener('click', (e) => copy(accountNo(settings.bank), e.currentTarget));

// 이 화면을 나갔다가(다른 탭 · 새로고침 · 나중에 다시 열기) 돌아와도 자기 번호표를 다시 볼 수 있어요.
function renderMine() {
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem('swi_my') || '[]'); } catch {}
  $('mine').hidden = !mine.length;
  $('mineList').innerHTML = mine.map((m) => `<button type="button" data-ticket="${esc(m.id)}" class="${notified.has(m.id) ? 'ready' : ''}">No. ${pad(m.number)}</button>`).join('');
  mine.forEach((m) => trackOrder(m.id)); // 새로고침해도 계속 지켜봐서, 시트를 안 열어도 나왔을 때 알려줘요
}
$('mineList').addEventListener('click', (e) => { const b = e.target.closest('[data-ticket]'); if (b) showTicket(b.dataset.ticket); });

/* ---------- 구독 ---------- */
store.watchMenu((list) => { menu = list; renderMenu(); renderCart(); });
store.watchSettings((s) => {
  settings = s;
  $('openChip').className = 'chip ' + (s.open ? 'open' : 'closed');
  $('openChip').textContent = s.open ? '지금 주문 받는 중' : '잠시 주문 마감';
  $('notice').hidden = !s.notice;
  $('notice').innerHTML = `<b>알림장</b>${esc(s.notice)}`;
  renderMenu(); renderCart();
});
renderMine();
