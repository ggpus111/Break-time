// =============================================================================
// store.js — 쉬는시간 주문 앱의 "데이터 창고"
// -----------------------------------------------------------------------------
// customer.js(손님 화면)와 admin.js(관리자 화면) 둘 다 이 파일 하나만 보고
// 메뉴 · 설정 · 주문을 읽고 씁니다. 실제로 어디에 저장하는지는 이 파일 안에서만
// 갈립니다:
//   - js/supabase-config.js 에 url/anonKey 를 채워두면  → Supabase(PostgreSQL)
//   - 비워두면(둘 중 하나라도 없으면)                     → 이 브라우저의 localStorage(데모 모드)
// 두 구현 모두 아래와 같은 "똑같은 모양의 객체"를 반환하므로, 화면 쪽 코드는
// 지금 데모인지 실제 서버인지 신경 쓰지 않고 store.watchMenu(...) 처럼 그대로 쓰면 됩니다.
// =============================================================================
import { supabaseConfig } from './supabase-config.js';

// url/anonKey 가 비어 있으면 데모(로컬) 모드. index.html · gyomusil-7x4m.html 에서
// "데모 모드예요" 안내 문구를 보여줄 때도 이 값을 그대로 씁니다.
export const DEMO = !supabaseConfig.url || !supabaseConfig.anonKey;

// 메뉴판을 나눠 보여주는 "교시" 구분. 배열 순서 = 화면에 보이는 순서라서,
// 맨 위에 새 카테고리를 넣고 싶으면 이 배열 맨 앞에 추가하면 됩니다.
// (지금 '뽑기'가 맨 위 '0교시'로 있는 것도 이 순서 때문)
export const CATEGORIES = [
  { id: 'game', period: '0교시', label: '뽑기' },
  { id: 'drink', period: '1교시', label: '마실거리' },
  { id: 'fried', period: '2교시', label: '튀김' },
  { id: 'sweet', period: '3교시', label: '추억의 간식' },
];

// 처음 켤 때(데모 모드) 또는 Supabase 메뉴표가 완전히 비어 있을 때만 채워지는 기본 메뉴.
// 이미 데이터가 있는 실제 서비스에는 영향을 주지 않아요 — 새 메뉴는 관리자 화면에서 추가하세요.
// options: 시즈닝처럼 "여러 개 중 하나를 꼭 골라야 하는" 메뉴에만 넣습니다 (없으면 그냥 일반 메뉴).
export const DEFAULT_MENU = [
  {
    id: 'ppopgi', name: '뽑기', category: 'game', sort: 1,
    desc: '옛날 추억의 뽑기!', price: 1000, soldOut: false,
  },
  {
    id: 'sikhye', name: '식혜', category: 'drink', sort: 1,
    desc: '살얼음 동동, 밥알 동동 달달한 식혜 (한정수량)', price: 2500, soldOut: false,
  },
  {
    id: 'mixcoffee', name: '믹스커피', category: 'drink', sort: 2,
    desc: '교무실 선생님 책상 위 그 맛, 달달한 믹스커피', price: 1500, soldOut: false,
  },
  {
    id: 'jjondeugi', name: '쫀드기 튀김', category: 'fried', sort: 3,
    desc: '연탄불 대신 기름에 튀긴 쫀득바삭 쫀드기', price: 3500, soldOut: false,
    options: ['기본 시즈닝', '치즈 시즈닝'],
  },
  {
    id: 'sugamja', name: '슈감자', category: 'fried', sort: 4,
    desc: '쉐이크 감자, 시즈닝 골라서 톡톡 흔들어 먹기', price: 3500, soldOut: false,
    options: ['어니언 시즈닝', '허니버터 시즈닝', '치즈 시즈닝'],
  },
  {
    id: 'dalgona_plain', name: '달고나', category: 'sweet', sort: 5,
    desc: '설탕 녹여 부풀린 바삭달콤 달고나', price: 1000, soldOut: false,
  },
  {
    id: 'dalgona_success', name: '달고나 뽑기', category: 'sweet', sort: 6,
    desc: '조각성공하면 하나 더! 도전해 보세요', price: 1500, soldOut: false,
  },
  {
    id: 'bullyang', name: '불량식품', category: 'sweet', sort: 7,
    desc: '옛날 문방구에서 사 먹던 그 시절 간식 3개', price: 1500, soldOut: false,
  },
];

export const DEFAULT_BANK = '토스뱅크 1002-7828-0462 (쉬는시간(스마트콘텐츠학과))';
export const DEFAULT_SETTINGS = { open: true, notice: '', bank: DEFAULT_BANK };

// 주문 하나가 거쳐가는 단계 (schema.sql의 orders.status 체크 제약과 이름을 맞춰야 함)
export const STATUS = {
  new: '주문 접수',
  cooking: '만드는 중',
  ready: '나왔어요',
  done: '수령 완료',
  canceled: '취소됨',
};

// 화면에 보여줄 금액 문자열 ("가격 미정"은 아직 관리자가 값을 안 넣은 메뉴)
export const won = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') + '원' : '가격 미정');
// 메뉴 목록을 "관리자가 정한 순서(sort)"대로 줄 세우기. sort가 없으면 맨 뒤로.
export const sortMenu = (list) => [...list].sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99));

/* =============================================================================
 * 데모 모드 — 이 브라우저의 localStorage 하나로 메뉴 · 설정 · 주문을 흉내 냅니다.
 * 서버가 없어도 화면을 바로 구경하거나, 두 탭(손님 화면 + 관리자 화면)을 열어
 * 실제처럼 테스트할 수 있게 하기 위한 용도입니다. (다른 브라우저·기기와는 공유되지 않음)
 * ========================================================================== */
function createLocal() {
  // localStorage에 실제로 쓰이는 키 이름들을 한 곳에 모아둠
  const K = { menu: 'swi_menu', settings: 'swi_settings', orders: 'swi_orders', counter: 'swi_counter', counterDay: 'swi_counter_day' };
  // 날짜(한국 로캘 기준 문자열)가 바뀌면 번호표를 자동으로 001부터 다시 시작하기 위한 기준값
  const today = () => new Date().toLocaleDateString('ko-KR');

  // localStorage read/write를 JSON으로 감싼 헬퍼. write()는 항상 구독자에게도 알림.
  const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} emit(k); };

  // "누가 이 키를 구독 중인가" — write()가 일어날 때마다 이 목록에 있는 콜백을 전부 실행.
  // (Supabase의 realtime 구독을 로컬에서 흉내 낸 것)
  const subs = { [K.menu]: new Set(), [K.settings]: new Set(), [K.orders]: new Set() };
  const emit = (k) => subs[k] && subs[k].forEach((fn) => fn());
  // 다른 탭에서 write()가 일어나도(예: 관리자 탭에서 주문 상태 변경) 이 탭까지 갱신되도록
  window.addEventListener('storage', (e) => { if (e.key) emit(e.key); });
  // sub(key, fn): 구독 등록 + 즉시 한 번 실행(현재 값으로) + 해지 함수 반환
  const sub = (k, fn) => { subs[k].add(fn); fn(); return () => subs[k].delete(fn); };

  // 메뉴표가 완전히 비어 있을 때만(첫 실행) 기본 메뉴를 채워 넣음
  if (!read(K.menu, null)) write(K.menu, DEFAULT_MENU);

  return {
    demo: true,
    watchMenu: (cb) => sub(K.menu, () => cb(sortMenu(read(K.menu, DEFAULT_MENU)))),
    watchSettings: (cb) => sub(K.settings, () => cb({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) })),

    // 손님이 "주문 넣기"를 눌렀을 때. 번호표 번호를 여기서 발급합니다.
    async placeOrder(o) {
      const settings = { ...DEFAULT_SETTINGS, ...read(K.settings, {}) };
      if (!settings.open) throw new Error('closed');
      // 마지막으로 번호를 매긴 날짜가 오늘이 아니면 0부터 다시 시작 (자정이 지나도 자동 초기화)
      const prev = read(K.counterDay, null) === today() ? (read(K.counter, 0) || 0) : 0;
      const number = prev + 1;
      write(K.counter, number);
      write(K.counterDay, today());
      const id = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const orders = read(K.orders, []);
      orders.push({ ...o, id, number, status: 'new', paid: false, createdAt: Date.now() });
      write(K.orders, orders);
      return { id, number };
    },

    // 손님 화면이 자기 번호표 하나만 지켜볼 때 씀. "내 앞에 몇 명 남았는지"도 여기서 계산.
    watchOrder: (id, cb) => sub(K.orders, () => {
      const all = read(K.orders, []);
      const mine = all.find((x) => x.id === id) || null;
      if (!mine) return cb(null);
      // 아직 안 만들어진(접수 · 만드는 중) 주문 중, 내 번호보다 앞선 것의 개수 = 대기 인원
      const ahead = all.filter((x) => ['new', 'cooking'].includes(x.status) && x.number < mine.number).length;
      cb({ ...mine, ahead });
    }),

    // ---- 아래는 관리자(교무실) 화면 전용 ----
    // 데모 모드는 비밀번호가 따로 없어요. sessionStorage에 로그인 여부만 표시(탭을 닫으면 풀림).
    onAuth(cb) { const f = () => cb(sessionStorage.getItem('swi_admin') ? { email: '데모 관리자' } : null); f(); this._auth = f; return () => {}; },
    async signIn() { sessionStorage.setItem('swi_admin', '1'); this._auth && this._auth(); },
    async signOut() { sessionStorage.removeItem('swi_admin'); this._auth && this._auth(); },
    // 관리자는 주문 전체를 최신순으로 봄 (손님의 watchOrder와 달리 필터 없이 다 보여줌)
    watchOrders: (cb) => sub(K.orders, () => cb([...read(K.orders, [])].sort((a, b) => b.createdAt - a.createdAt))),
    async updateOrder(id, patch) { write(K.orders, read(K.orders, []).map((x) => (x.id === id ? { ...x, ...patch } : x))); },
    async saveMenuItem(item) {
      const menu = read(K.menu, []);
      const id = item.id || 'm' + Date.now().toString(36); // 새 메뉴면 임시 id를 만들어 줌
      const i = menu.findIndex((m) => m.id === id);
      const next = { ...item, id };
      if (i >= 0) menu[i] = next; else menu.push(next);
      write(K.menu, menu);
      return id;
    },
    async deleteMenuItem(id) { write(K.menu, read(K.menu, []).filter((m) => m.id !== id)); },
    async saveSettings(patch) { write(K.settings, { ...read(K.settings, {}), ...patch }); },
    async resetCounter() { write(K.counter, 0); write(K.counterDay, today()); },
    async seedIfEmpty() {}, // 데모는 위에서 이미 채워 넣었으니 할 일 없음 (Supabase 쪽과 인터페이스만 맞춤)
    async checkAdmin() { return true; }, // 데모는 로그인만 하면 누구나 관리자
  };
}

/* =============================================================================
 * Supabase(PostgreSQL) 모드 — 실제 축제 당일에 쓰는 진짜 구현.
 * 메뉴/주문 읽기는 테이블에서 직접, 주문 넣기 · 번호표 조회는 sql/schema.sql에 정의된
 * "RPC 함수"(place_order/get_order)를 통해서만 합니다 — 가격 조작 방지 + 보안 규칙(RLS)을
 * 우회하지 않고도 손님이 자기 주문 하나만 볼 수 있게 하기 위해서입니다.
 * ========================================================================== */
async function createSupabase() {
  // Supabase JS 라이브러리를 CDN에서 그때그때 불러옴 (빌드 도구 없이 그냥 정적 파일로 배포하기 위해)
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  // Supabase 응답은 { data, error } 형태 — 에러면 던지고, 아니면 data만 꺼내 쓰는 헬퍼
  const check = ({ data, error }) => { if (error) throw error; return data; };

  // DB 컬럼 이름(snake_case) ↔ 화면에서 쓰는 필드 이름(camelCase) 변환
  const toMenu = (r) => ({ id: r.id, name: r.name, category: r.category, desc: r.description, price: r.price, soldOut: r.sold_out, sort: r.sort, options: r.options || null });
  const fromMenu = (m) => ({ name: m.name, category: m.category, description: m.desc || '', price: m.price, sold_out: !!m.soldOut, sort: m.sort ?? 99, options: m.options && m.options.length ? m.options : null });
  const toOrder = (o) => o && ({
    id: o.id, number: o.number, pay: o.pay, depositor: o.depositor || '', memo: o.memo, total: o.total,
    status: o.status, paid: o.paid, createdAt: Date.parse(o.created_at),
    ahead: typeof o.ahead === 'number' ? o.ahead : null, // 손님 화면(get_order)에서만 내려줌
    items: (o.items || o.order_items || []).map((i) => ({ name: i.name, price: i.price ?? i.unit_price, qty: i.qty, option: i.option ?? i.option_label ?? null })),
  });

  // 테이블 하나를 "실시간처럼" 구독하는 공통 로직.
  // 1) 지금 즉시 한 번 불러오고
  // 2) Supabase Realtime으로 그 테이블이 바뀔 때마다(150ms 안에 몰아서) 다시 불러오고
  // 3) 혹시 realtime 이벤트를 놓치더라도 15초마다 한 번씩은 다시 확인
  function watch(table, fetcher, cb) {
    let alive = true, seq = 0, timer = null;
    const run = async () => {
      const my = ++seq;
      try { const v = await fetcher(); if (alive && my === seq) cb(v); } catch (e) { console.error(table, e); }
    };
    const soon = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
    run();
    const ch = sb.channel(`${table}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, soon)
      .subscribe();
    const poll = setInterval(run, 15000);
    return () => { alive = false; clearInterval(poll); clearTimeout(timer); sb.removeChannel(ch); };
  }

  return {
    demo: false,
    watchMenu: (cb) => watch('menu', async () => check(await sb.from('menu').select('*').order('sort')).map(toMenu), cb),
    watchSettings: (cb) => watch('settings', async () => {
      const s = check(await sb.from('settings').select('open, notice, bank').eq('id', 1).maybeSingle());
      return { ...DEFAULT_SETTINGS, ...(s || {}) };
    }, cb),
    // 손님이 "주문 넣기"를 누르면 여기로. 합계 금액 계산 · 번호 발급 · 재고(품절) 확인은
    // 전부 place_order 함수(schema.sql) 안, 즉 서버에서 이뤄집니다 — 손님 폰이 보낸 가격은
    // 안 믿고, 그 시점 DB의 menu.price로 다시 계산해요.
    async placeOrder(o) {
      const { data, error } = await sb.rpc('place_order', {
        p_items: o.items.map((l) => ({ id: l.id, qty: l.qty, option: l.option || null })),
        p_pay: o.pay,
        p_depositor: o.depositor || '',
        p_memo: o.memo || '',
      });
      if (error) throw new Error(error.message || 'failed');
      return data; // { id, number }
    },
    // 손님은 보안 규칙(RLS)상 주문 표 전체를 못 보고, 자기 주문 하나만 get_order로 확인.
    // 화면이 보일 때만(탭이 백그라운드면 쉬었다가) 4초마다 폴링 — 배터리 아끼려고.
    watchOrder(id, cb) {
      let alive = true;
      const run = async () => {
        if (document.hidden) return;
        const { data, error } = await sb.rpc('get_order', { p_id: id });
        if (alive && !error) cb(toOrder(data));
      };
      run();
      const t = setInterval(run, 4000);
      const vis = () => { if (!document.hidden) run(); }; // 탭을 다시 보면 바로 한 번 더 확인
      document.addEventListener('visibilitychange', vis);
      return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
    },

    // ---- 아래는 관리자(교무실) 화면 전용. 로그인은 Supabase Auth를 그대로 씀 ----
    onAuth(cb) {
      let last;
      const emit = (session) => {
        const email = session?.user?.email || null;
        if (email === last) return; // 같은 이메일로 또 알림 오는 건 무시(중복 방지)
        last = email;
        setTimeout(() => cb(email ? { email } : null), 0); // 콜백 안에서 바로 DB 호출하지 않도록
      };
      sb.auth.getSession().then(({ data }) => emit(data.session));
      const { data } = sb.auth.onAuthStateChange((_e, session) => emit(session));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    // 로그인했다고 다 관리자는 아님 — schema.sql의 admins 표에 이메일이 있어야 통과 (is_admin() RPC)
    async checkAdmin() { return !!check(await sb.rpc('is_admin')); },
    // 관리자는 주문 전체(최근 500건)를 봄 — 손님과 달리 RLS 정책(orders admin)이 전체 조회를 허용
    watchOrders: (cb) => watch('orders', async () => check(
      await sb.from('orders').select('*, order_items(name, unit_price, qty, option_label)').order('created_at', { ascending: false }).limit(500)
    ).map(toOrder), cb),
    async updateOrder(id, patch) { check(await sb.from('orders').update(patch).eq('id', id)); },
    async saveMenuItem(item) {
      const id = item.id || 'm' + Date.now().toString(36);
      check(await sb.from('menu').upsert({ id, ...fromMenu(item) }));
      return id;
    },
    async deleteMenuItem(id) { check(await sb.from('menu').delete().eq('id', id)); },
    async saveSettings(patch) { check(await sb.from('settings').update(patch).eq('id', 1)); },
    async resetCounter() { check(await sb.rpc('reset_counter')); },
    async seedIfEmpty() {}, // 처음 데이터는 schema.sql 이 넣어 줌
  };
}

// 앱이 시작될 때 딱 한 번 결정: 데모로 갈지, 진짜 Supabase에 붙을지.
// 이후로는 이 store 하나만 export 하고, customer.js/admin.js는 이 안에서 뭘 쓰는지 몰라도 됨.
const store = DEMO ? createLocal() : await createSupabase();
export default store;
