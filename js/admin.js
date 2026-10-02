// =============================================================================
// admin.js — 관리자 "교무실" 화면 (gyomusil-7x4m.html)
// -----------------------------------------------------------------------------
// 로그인 → 주문 현황(상태 바꾸기 · 결제 확인 · 중복 의심 표시) → 메뉴 · 가격 편집
// → 영업 on/off · 공지 · 번호 초기화 · QR 포스터, 이렇게 네 덩어리로 이뤄져 있어요.
// customer.js와 마찬가지로 데이터는 store.js를 통해서만 주고받습니다.
// =============================================================================

// [뽑기 상품 정보] — 페이지에는 노출하지 않으며, 관리자가 알아야 할 정보
// 1등(1): 배민 5만원권
// 2등(5): 쫀드기 or 슈감자 선택
// 3등(30): 믹스커피
// 4등(100): 불량식품(2개)
// 5등(364): 꽝 (총 500개 단위)

// [부스 운영진 일정] — 관리자만 볼 수 있는 정보
// 10월 7일(수)
//   08:00-09:00: 박다현, 이유민, 최유찬, 최은우, 이준서, 최성낙
//   09:00-10:00: 박다현, 최은우, 신예원, 이유민, 박건우
//   10:00-11:00: 박다현, 최은우, 이유민, 박건우, 신예원, 권아림
//   11:00-12:00: 박다현, 이나윤, 박현승, 이유민, 박건우, 신예원, 권아림, 오민석
//   12:00-13:00: 박현승, 최은우, 이유민, 박건우, 신예원
//   13:00-14:00: 박다현, 이나윤, 최은우, 신예원, 권아림
//   14:00-15:00: 박다현, 이나윤, 최유찬
//   15:00-16:00: 이예진, 최예리, 신가영
//   16:00-17:00: 이예진, 최유찬, 최예리, 신가영
//   17:00-18:00: 최유찬, 최예리, 최성낙, 최은우, 신가영
//   18:00-19:00: 이예진, 최유찬, 최예리, 최성낙, 최은우, 신가영
//
// 10월 8일(목)
//   08:00-09:00: 박다현, 이준서, 오민석, 신가영, 신재은, 최성낙, 이예진
//   09:00-10:00: 박다현, 이준서, 오민석, 신가영, 신재은, 최성낙, 이예진
//   10:00-11:00: 이준서, 오민석, 신가영, 유예은, 전준성, 최성낙
//   11:00-12:00: 박다현, 신재은, 오민석, 최예리, 신가영, 유예은, 전준성, 최성낙, 이준서
//   12:00-13:00: 신재은, 최예리, 신가영, 유예은, 전준성, 신예원, 권아림
//   13:00-14:00: 박다현, 이준서, 오민석, 최예리, 신가영, 유예은, 전준성, 신재은, 신예원, 권아림
//   14:00-15:00: 박다현, 신재은, 신예원, 권아림
//   15:00-16:00: 박다현, 이준서, 최예리, 박현승
//   16:00-17:00: 전준성, 이유민, 박건우, 유예은
//   17:00-18:00: 박다현, 유예은, 전준성, 이유민
//   18:00-19:00: 박다현, 이준서, 오민석, 유예은, 전준성, 이유민, 박건우
import store, { DEMO, CATEGORIES, STATUS, won } from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(3, '0');
const hhmm = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
// 두 시각이 "오늘"(브라우저 로컬 날짜) 안에 같이 있는지 — 통계에서 어제 이전 주문을 걸러낼 때 씀
const sameDay = (t) => { const d = new Date(t), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };

// 중복 주문 의심 표시: 취소되지 않은 다른 주문 중, 메뉴 구성(이름+옵션+개수) · 합계가
// 완전히 같고 5분 안에 들어온 게 있으면 "혹시 실수로 두 번 주문한 거 아니야?" 배지를 붙여줌.
// (자동으로 취소하진 않고, 사람이 보고 판단하도록 경고만 함)
const DUP_WINDOW_MS = 5 * 60 * 1000;
const dupSig = (o) => (o.items || []).map((l) => `${l.name}${l.option || ''}x${l.qty}`).sort().join(',') + '|' + o.total;
function findDup(o, list) {
  if (o.status === 'canceled') return null;
  const sig = dupSig(o);
  return list.find((x) => x.id !== o.id && x.status !== 'canceled' && dupSig(x) === sig && Math.abs(x.createdAt - o.createdAt) <= DUP_WINDOW_MS) || null;
}

let orders = [];
let menu = [];
let settings = { open: true, notice: '', bank: '' };
let filter = 'active';
let knownIds = null; // 처음 불러온 주문엔 종 안 울림
const unsubs = [];

$('demo').hidden = !DEMO;

/* ---------- 로그인 ---------- */
if (DEMO) {
  $('loginFields').hidden = true;
  $('loginHint').textContent = '데모 모드예요. 비밀번호 없이 들어갈 수 있어요. 실제 운영은 README의 Supabase 설정을 따라 주세요.';
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').hidden = true;
  $('loginBtn').disabled = true;
  try { await store.signIn($('email').value.trim(), $('pw').value); }
  catch (ex) {
    console.error(ex);
    $('loginErr').textContent = '이메일이나 비밀번호가 맞지 않아요. Supabase Authentication에 만든 계정인지 확인해 주세요.';
    $('loginErr').hidden = false;
  } finally { $('loginBtn').disabled = false; }
});
$('logout').addEventListener('click', () => store.signOut());

// 로그인 상태가 바뀔 때마다(로그인/로그아웃) 실행됨. 관리자 확인까지 통과해야
// 실제 데이터 구독(주문 · 메뉴 · 설정)을 시작합니다.
store.onAuth(async (user) => {
  while (unsubs.length) unsubs.pop()(); // 이전 구독은 전부 끊고 새로 시작
  if (user) {
    let ok = false;
    try { ok = await store.checkAdmin(); } catch (ex) { console.error(ex); }
    if (!ok) {
      $('loginErr').textContent = `${user.email} 은(는) 관리자 목록에 없어요. schema.sql 맨 아래 admins 에 이 이메일을 넣어 주세요.`;
      $('loginErr').hidden = false;
      await store.signOut();
      return;
    }
  }
  $('login').hidden = !!user;
  $('app').hidden = !user;
  $('who').hidden = !user;
  if (!user) return;
  $('whoName').textContent = user.email;
  try { await store.seedIfEmpty(); } catch (ex) { console.warn('seed', ex); }
  knownIds = null;
  unsubs.push(store.watchOrders((list) => { onOrders(list); }));
  unsubs.push(store.watchMenu((list) => { menu = list; renderMenu(); }));
  unsubs.push(store.watchSettings((s) => { settings = s; renderSettings(); }));
});

/* ---------- 탭 ---------- */
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  document.querySelectorAll('.tabs [data-tab]').forEach((t) => t.setAttribute('aria-selected', t === b));
  ['orders', 'menu', 'settings', 'schedule', 'stats'].forEach((t) => ($('tab-' + t).hidden = t !== b.dataset.tab));
  if (b.dataset.tab === 'settings') renderQR();
  if (b.dataset.tab === 'schedule') renderSchedule();
  if (b.dataset.tab === 'stats') renderStats();
});

/* ---------- 종소리 ----------
 * 새 주문이 들어올 때마다 짧은 3음 벨소리를 울려요(체크박스로 끌 수 있음).
 * Web Audio API로 직접 톤을 만들어서, 별도 mp3 파일 없이 동작합니다.
 */
let audio;
function bell() {
  if (!$('sound').checked) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime;
    [[784, 0], [659, 0.28], [523, 0.56]].forEach(([f, dt]) => {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.5);
      o.connect(g).connect(audio.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.55);
    });
  } catch {}
}
document.addEventListener('click', () => { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {} }, { once: true });

/* ---------- 주문 ---------- */
let fresh = new Set(); // 방금 막 들어온 주문 id (0.8초간 카드에 "fresh" 강조 표시)
function onOrders(list) {
  if (knownIds) {
    // 이전에 본 적 없는 id만 "새 주문"으로 취급 — 처음 로그인해서 목록을 불러올 때는
    // 종이 울리지 않게(knownIds가 null인 최초 1회는 건너뜀) 하기 위한 장치.
    const added = list.filter((o) => !knownIds.has(o.id));
    if (added.length) { bell(); added.forEach((o) => fresh.add(o.id)); }
  }
  knownIds = new Set(list.map((o) => o.id));
  orders = list;
  renderOrders();
  setTimeout(() => fresh.clear(), 800);
}

// 주문 상태 전이표: 지금 상태 -> (다음 상태, 버튼 문구). done/canceled는 다음 단계가 없음.
const NEXT = {
  new: { to: 'cooking', label: '만들기 시작' },
  cooking: { to: 'ready', label: '다 됐어요 · 호출' },
  ready: { to: 'done', label: '전달 완료' },
};
// 주문 현황 탭 위쪽 필터 버튼들이 각각 어떤 주문을 보여줄지
const FILTERS = {
  active: (o) => ['new', 'cooking', 'ready'].includes(o.status),
  new: (o) => o.status === 'new',
  cooking: (o) => o.status === 'cooking',
  ready: (o) => o.status === 'ready',
  finished: (o) => ['done', 'canceled'].includes(o.status),
  all: () => true,
};

// 상단 통계 칸 + 주문 카드 목록을 통째로 다시 그림. store.watchOrders가 새 데이터를
// 줄 때마다(=onOrders를 통해) 호출됩니다.
function renderOrders() {
  const live = orders.filter((o) => o.status !== 'canceled');
  const todayLive = live.filter((o) => sameDay(o.createdAt)); // 오늘 주문 수 · 매출은 날짜로 한 번 더 거름
  const nNew = orders.filter((o) => o.status === 'new').length;
  $('stNew').textContent = nNew;
  $('stCooking').textContent = orders.filter((o) => o.status === 'cooking').length;
  $('stUnpaid').textContent = live.filter((o) => !o.paid && o.status !== 'done').length;
  $('stTodayOrders').textContent = todayLive.length;
  $('stSales').textContent = won(todayLive.reduce((s, o) => s + (o.total || 0), 0));
  $('newBadge').hidden = !nNew; $('newBadge').textContent = nNew;
  document.title = (nNew ? `(${nNew}) ` : '') + '쉬는시간 교무실'; // 다른 탭 보고 있어도 새 주문 수 확인 가능

  // 진행 중은 오래된 주문이 먼저, 나머지는 최신이 먼저
  let list = orders.filter(FILTERS[filter]);
  if (filter !== 'finished' && filter !== 'all') list = [...list].sort((a, b) => a.createdAt - b.createdAt);

  $('ordersEmpty').hidden = !!list.length;
  $('ordersEmpty').textContent = orders.length ? '이 칸에 해당하는 주문이 없어요.' : '아직 주문이 없어요. 새 주문이 들어오면 종이 울려요.';
  $('orders').innerHTML = list.map((o) => {
    const nx = NEXT[o.status];
    const dup = findDup(o, orders);
    return `<article class="order st-${o.status} ${fresh.has(o.id) ? 'fresh' : ''} ${dup ? 'dup' : ''}">
      <div class="order-top">
        <div class="order-no">${pad(o.number)}</div>
        <div class="order-who"><b>${hhmm(o.createdAt)} 주문</b><small>${(o.items || []).reduce((s, l) => s + l.qty, 0)}개</small></div>
        <span class="pill ${o.status}">${STATUS[o.status]}</span>
      </div>
      ${dup ? `<p class="dup-warn">⚠ ${pad(dup.number)}번과 메뉴 · 금액이 똑같아요. 중복 주문인지 확인해 주세요.</p>` : ''}
      <div class="order-body">
        <ul>${(o.items || []).map((l) => `<li><span>${esc(l.name)}${l.option ? ` <em>· ${esc(l.option)}</em>` : ''}</span><b>× ${l.qty}</b></li>`).join('')}</ul>
        ${o.memo ? `<p class="memo">요청: ${esc(o.memo)}</p>` : ''}
      </div>
      <div class="order-pay">
        <span>${o.pay === 'transfer' ? '계좌이체' : '현금'} · <strong>${won(o.total)}</strong>
          ${o.pay === 'transfer' ? `<span class="order-dep">입금자명 <b>${esc(o.depositor) || '-'}</b></span>` : ''}</span>
        <button type="button" class="paybtn ${o.paid ? 'paid' : ''}" data-paid="${esc(o.id)}">${o.paid ? '결제 확인됨' : (o.pay === 'transfer' ? '입금 확인' : '현금 받음')}</button>
      </div>
      <div class="order-act">
        ${!nx ? '' : o.status === 'new' && !o.paid
          ? `<button type="button" class="btn" disabled>${o.pay === 'transfer' ? '입금 확인 후 시작' : '현금 받은 후 시작'}</button>`
          : `<button type="button" class="btn" data-next="${esc(o.id)}" data-to="${nx.to}">${nx.label}</button>`}
        ${o.status === 'canceled' || o.status === 'done'
          ? `<button type="button" class="cancel" data-restore="${esc(o.id)}">진행 중으로 되돌리기</button>`
          : `<button type="button" class="cancel" data-cancel="${esc(o.id)}">주문 취소</button>`}
      </div>
    </article>`;
  }).join('');

  // 통계 탭이 지금 보이는 중이면(=hidden이 아니면) 새 주문이 들어올 때마다 그래프도 같이 갱신
  if (!$('tab-stats').hidden) renderStats();
}

$('filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  filter = b.dataset.f;
  document.querySelectorAll('#filter [data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  renderOrders();
});

// "주문 취소" 버튼도 admin.js의 다른 곳(메뉴 삭제)과 같은 패턴: 한 번 누르면 문구만
// "한 번 더 누르면 취소"로 바뀌고, 3초 안에 진짜로 한 번 더 눌러야 실제로 취소됩니다.
const pendingCancel = new Set();
$('orders').addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const act = async (id, patch) => { t.disabled = true; try { await store.updateOrder(id, patch); } catch (ex) { console.error(ex); t.disabled = false; t.textContent = '실패 · 다시 눌러 주세요'; } };
  if (t.dataset.next) return act(t.dataset.next, { status: t.dataset.to });
  if (t.dataset.paid) { const o = orders.find((x) => x.id === t.dataset.paid); return act(o.id, { paid: !o.paid }); }
  if (t.dataset.restore) return act(t.dataset.restore, { status: 'new' });
  if (t.dataset.cancel) {
    const id = t.dataset.cancel;
    if (!pendingCancel.has(id)) {
      pendingCancel.add(id); t.textContent = '한 번 더 누르면 취소'; t.style.color = 'var(--red)';
      setTimeout(() => { pendingCancel.delete(id); if (t.isConnected) { t.textContent = '주문 취소'; t.style.color = ''; } }, 3000);
      return;
    }
    pendingCancel.delete(id);
    return act(id, { status: 'canceled' });
  }
});

/* ---------- 메뉴 편집 ----------
 * 메뉴 한 줄 = <input>들이 모인 폼(rowHTML). "저장"을 눌러야 store.saveMenuItem으로
 * 실제 반영되고, 그 전까지는 화면(입력값)에만 있는 상태입니다.
 */
let drafts = []; // 아직 "저장"을 안 눌러서 store에는 없는, 새로 추가 중인 메뉴 줄
function rowHTML(m, isNew) {
  const key = esc(m.id || m._tmp);
  return `<div class="mrow" data-row="${key}" data-new="${isNew ? 1 : ''}">
    <div class="field"><label for="n-${key}">메뉴 이름</label><input id="n-${key}" type="text" data-k="name" maxlength="20" value="${esc(m.name)}"></div>
    <div class="field"><label for="c-${key}">교시(분류)</label><select id="c-${key}" data-k="category">
      ${CATEGORIES.map((c) => `<option value="${c.id}" ${m.category === c.id ? 'selected' : ''}>${c.period} ${c.label}</option>`).join('')}
    </select></div>
    <div class="field desc-f"><label for="d-${key}">설명</label><input id="d-${key}" type="text" data-k="desc" maxlength="60" value="${esc(m.desc)}"></div>
    <div class="field"><label for="p-${key}">가격 (원)</label><input id="p-${key}" type="number" data-k="price" min="0" step="100" inputmode="numeric" placeholder="미정" value="${typeof m.price === 'number' ? m.price : ''}"></div>
    <div class="field desc-f"><label for="o-${key}">시즈닝처럼 골라야 하는 옵션 (쉼표로 구분, 없으면 비워두기)</label><input id="o-${key}" type="text" data-k="options" maxlength="120" placeholder="예: 기본 시즈닝, 치즈 시즈닝" value="${esc((m.options || []).join(', '))}"></div>
    <div class="row-act">
      <button type="button" class="soldbtn" data-sold aria-pressed="${!!m.soldOut}">${m.soldOut ? '품절' : '판매 중'}</button>
      <button type="button" class="btn" data-save>저장</button>
      <button type="button" class="delbtn" data-del>삭제</button>
      <span class="saved" data-msg></span>
    </div>
  </div>`;
}
function renderMenu() {
  // 입력 중인 칸이 있으면 덮어쓰지 않음
  if ($('menuEdit').contains(document.activeElement) && document.activeElement.matches('input,select')) return;
  $('menuEdit').innerHTML = menu.map((m) => rowHTML(m, false)).join('') + drafts.map((m) => rowHTML(m, true)).join('');
}
$('addMenu').addEventListener('click', () => {
  drafts.push({ _tmp: 'new' + Date.now(), name: '', category: 'sweet', desc: '', price: null, soldOut: false, options: null });
  renderMenu();
  $('menuEdit').lastElementChild.querySelector('input').focus();
});

// 메뉴 편집 줄 하나의 입력값을 읽어서 store.saveMenuItem에 넘길 객체로 만듦
function readRow(row) {
  const get = (k) => row.querySelector(`[data-k=${k}]`).value;
  const p = get('price').trim();
  // "기본 시즈닝, 치즈 시즈닝" 같은 텍스트를 배열로. 최대 6개, 각각 20자까지만.
  const options = get('options').split(',').map((s) => s.trim().slice(0, 20)).filter(Boolean).slice(0, 6);
  return {
    name: get('name').trim(),
    category: get('category'),
    desc: get('desc').trim(),
    price: p === '' ? null : Math.max(0, Math.round(Number(p))),
    soldOut: row.querySelector('[data-sold]').getAttribute('aria-pressed') === 'true',
    options: options.length ? options : null,
  };
}

$('menuEdit').addEventListener('click', async (e) => {
  const row = e.target.closest('.mrow'); if (!row) return;
  const id = row.dataset.row; const isNew = !!row.dataset.new;
  const msg = row.querySelector('[data-msg]');
  const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? 'var(--red)' : ''; };

  if (e.target.closest('[data-sold]')) {
    const b = e.target.closest('[data-sold]');
    const v = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', v); b.textContent = v ? '품절' : '판매 중';
    if (!isNew) { try { await store.saveMenuItem({ ...menu.find((m) => m.id === id), soldOut: v }); say(v ? '품절 처리됨' : '다시 판매 중'); } catch { say('저장 실패', true); } }
    return;
  }
  if (e.target.closest('[data-save]')) {
    const data = readRow(row);
    if (!data.name) return say('이름을 적어 주세요', true);
    if (data.price !== null && !Number.isFinite(data.price)) return say('가격은 숫자로 적어 주세요', true);
    const old = menu.find((m) => m.id === id);
    const sort = old?.sort ?? (Math.max(0, ...menu.map((m) => m.sort || 0)) + 1);
    try {
      document.activeElement.blur();
      await store.saveMenuItem({ ...(isNew ? {} : { id }), ...data, sort });
      if (isNew) drafts = drafts.filter((d) => d._tmp !== id);
      renderMenu();
      const r = [...$('menuEdit').children].find((x) => x.querySelector('[data-k=name]').value === data.name);
      r && (r.querySelector('[data-msg]').textContent = '저장됨');
    } catch (ex) { console.error(ex); say('저장 실패', true); }
    return;
  }
  if (e.target.closest('[data-del]')) {
    const b = e.target.closest('[data-del]');
    if (isNew) { drafts = drafts.filter((d) => d._tmp !== id); renderMenu(); return; }
    if (b.dataset.armed) { try { await store.deleteMenuItem(id); } catch { say('삭제 실패', true); } return; }
    b.dataset.armed = 1; b.textContent = '한 번 더 누르면 삭제'; b.style.color = 'var(--red)';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = '삭제'; b.style.color = ''; } }, 3000);
  }
});
$('menuEdit').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.closest('.mrow').querySelector('[data-save]').click(); }
});

/* ---------- 설정(영업 · QR) ---------- */
function renderSettings() {
  $('openBtn').className = settings.open ? 'off' : 'on';
  $('openBtn').textContent = settings.open ? '주문 마감하기' : '주문 다시 받기';
  $('openText').textContent = settings.open ? '지금 주문 받는 중' : '지금 주문 마감 상태';
  if (!$('setForm').contains(document.activeElement)) {
    $('setBank').value = settings.bank || '';
    $('setNotice').value = settings.notice || '';
  }
}
$('openBtn').addEventListener('click', () => store.saveSettings({ open: !settings.open }));
$('setForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await store.saveSettings({ bank: $('setBank').value.trim(), notice: $('setNotice').value.trim() });
    $('setSaved').textContent = '저장됨. 손님 화면에 바로 반영돼요.';
  } catch { $('setSaved').textContent = '저장 실패'; }
  document.activeElement.blur();
});

$('resetBtn').addEventListener('click', () => { $('resetYes').hidden = $('resetNo').hidden = false; $('resetBtn').hidden = true; });
$('resetNo').addEventListener('click', () => { $('resetYes').hidden = $('resetNo').hidden = true; $('resetBtn').hidden = false; });
$('resetYes').addEventListener('click', async () => {
  try { await store.resetCounter(); $('resetDone').textContent = '다음 주문은 001번이에요.'; }
  catch { $('resetDone').textContent = '초기화 실패'; }
  $('resetNo').click();
});

/* ---------- QR 포스터 ---------- */
// 기본값: 지금 이 관리자 페이지가 올라간 주소에서 파일 이름만 뺀 것(= 손님 페이지 주소)
$('qrUrl').value = new URL('./', location.href).href;
function renderQR() {
  const url = $('qrUrl').value.trim();
  $('qr').innerHTML = '';
  $('qrText').textContent = url;
  if (!url || typeof QRCode === 'undefined') return;
  new QRCode($('qr'), { text: url, width: 220, height: 220, colorDark: '#26221c', colorLight: '#f4ecd8', correctLevel: QRCode.CorrectLevel.M });
}
$('qrUrl').addEventListener('input', renderQR);
$('printBtn').addEventListener('click', () => {
  const clone = document.createElement('div');
  clone.className = 'print-clone';
  clone.innerHTML = $('posterWrap').innerHTML;
  document.body.appendChild(clone);
  document.body.classList.add('printing');
  window.print();
  document.body.classList.remove('printing');
  clone.remove();
});

/* =============================================================================
 * 통계 — 외부 차트 라이브러리 없이, 지금 불러온 주문 데이터로 SVG 막대그래프를 그림.
 * 정확한 값이 필요하면 sql/analysis.sql을 돌리는 게 낫고, 이건 "감 잡기용" 요약이라
 * store.watchOrders가 주는 최근 500건 범위 안에서만 집계합니다.
 * ========================================================================== */
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayLabel = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

// 날짜별 매출 합계 (취소 제외), 날짜 순서대로
function statsByDay(list) {
  const map = new Map(); // 'YYYY-MM-DD' -> { label, value }
  list.forEach((o) => {
    const d = new Date(o.createdAt);
    const key = dayKey(d);
    const row = map.get(key) || { label: dayLabel(d), value: 0 };
    row.value += o.total || 0;
    map.set(key, row);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, row]) => row);
}

// 메뉴(+옵션)별 판매 개수, 많이 팔린 순으로 상위 N개
function statsByMenu(list, limit = 10) {
  const map = new Map(); // 표시 이름 -> 개수
  list.forEach((o) => (o.items || []).forEach((l) => {
    const label = l.name + (l.option ? ` · ${l.option}` : '');
    map.set(label, (map.get(label) || 0) + l.qty);
  }));
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 계좌이체 / 현금 건수
function statsByPay(list) {
  const transfer = list.filter((o) => o.pay === 'transfer').length;
  return [
    { label: '계좌이체', value: transfer },
    { label: '현금', value: list.length - transfer },
  ];
}

// rows: [{label, value}] -> 가로 막대그래프 SVG 문자열. 값이 다 0이면 안내 문구만 보여줌.
function barChartSVG(rows, valueFmt) {
  if (!rows.length || rows.every((r) => r.value === 0)) return '<p class="hint">아직 데이터가 없어요.</p>';
  const width = 520, barH = 26, gap = 10, labelW = 130;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const barMaxW = width - labelW - 70;
  const height = rows.length * (barH + gap) + gap;
  const bars = rows.map((r, i) => {
    const y = gap + i * (barH + gap);
    const w = Math.max(2, (r.value / max) * barMaxW);
    return `
      <text x="${labelW - 8}" y="${y + barH / 2 + 5}" text-anchor="end" class="chart-label">${esc(r.label)}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="3" class="chart-bar" />
      <text x="${labelW + w + 8}" y="${y + barH / 2 + 5}" class="chart-value">${esc(valueFmt(r.value))}</text>
    `;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="막대 그래프">${bars}</svg>`;
}

function renderStats() {
  const live = orders.filter((o) => o.status !== 'canceled');
  $('statDaily').innerHTML = barChartSVG(statsByDay(live), won);
  $('statMenu').innerHTML = barChartSVG(statsByMenu(live), (v) => `${v}개`);
  $('statPay').innerHTML = barChartSVG(statsByPay(live), (v) => `${v}건`);
}

// 부스 운영진 일정 표시
function renderSchedule() {
  const schedule = `
<div style="white-space: pre-wrap; font-family: monospace; font-size: 13px; line-height: 1.6;">
<strong>📅 10월 7일(수)</strong>
08:00-09:00  박다현, 이유민, 최유찬, 최은우, 이준서, 최성낙
09:00-10:00  박다현, 최은우, 신예원, 이유민, 박건우
10:00-11:00  박다현, 최은우, 이유민, 박건우, 신예원, 권아림
11:00-12:00  박다현, 이나윤, 박현승, 이유민, 박건우, 신예원, 권아림, 오민석
12:00-13:00  박현승, 최은우, 이유민, 박건우, 신예원
13:00-14:00  박다현, 이나윤, 최은우, 신예원, 권아림
14:00-15:00  박다현, 이나윤, 최유찬
15:00-16:00  이예진, 최예리, 신가영
16:00-17:00  이예진, 최유찬, 최예리, 신가영
17:00-18:00  최유찬, 최예리, 최성낙, 최은우, 신가영
18:00-19:00  이예진, 최유찬, 최예리, 최성낙, 최은우, 신가영

<strong>📅 10월 8일(목)</strong>
08:00-09:00  박다현, 이준서, 오민석, 신가영, 신재은, 최성낙, 이예진
09:00-10:00  박다현, 이준서, 오민석, 신가영, 신재은, 최성낙, 이예진
10:00-11:00  이준서, 오민석, 신가영, 유예은, 전준성, 최성낙
11:00-12:00  박다현, 신재은, 오민석, 최예리, 신가영, 유예은, 전준성, 최성낙, 이준서
12:00-13:00  신재은, 최예리, 신가영, 유예은, 전준성, 신예원, 권아림
13:00-14:00  박다현, 이준서, 오민석, 최예리, 신가영, 유예은, 전준성, 신재은, 신예원, 권아림
14:00-15:00  박다현, 신재은, 신예원, 권아림
15:00-16:00  박다현, 이준서, 최예리, 박현승
16:00-17:00  전준성, 이유민, 박건우, 유예은
17:00-18:00  박다현, 유예은, 전준성, 이유민
18:00-19:00  박다현, 이준서, 오민석, 유예은, 전준성, 이유민, 박건우
</div>
  `;
  $('scheduleContent').innerHTML = schedule;
}
