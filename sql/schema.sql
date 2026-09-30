-- =========================================================
-- 쉬는시간 · 대동제 QR 주문  (Supabase / PostgreSQL)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run
-- 실행 전에 맨 아래 "관리자 이메일" 한 줄을 꼭 바꾸세요.
-- 몇 번을 다시 실행해도 안전해요 (테이블/컬럼은 없을 때만 생성, 함수는 매번 최신으로 교체).
--
-- 큰 그림
-- -----------------------------------------------------------------------
--   menu, settings   : 손님도 읽을 수 있음(select). 손님은 못 고치고, 관리자만 고침.
--   orders, order_items, counters, admins
--                     : 손님은 직접 못 읽음 — 대신 아래 두 "관문" 함수로만 드나듦.
--     · place_order() : 손님이 주문 넣을 때. 번호 발급 + 가격은 여기서 서버가 다시 계산
--                        (손님 폰이 보낸 가격은 안 믿음). 이 함수 안에서만 orders에 insert.
--     · get_order()   : 손님이 자기 번호표 하나만 조회할 때. 주문 id(uuid)를 알아야만
--                        볼 수 있어서, 다른 손님 주문은 못 봄.
--   관리자는 Supabase Auth로 로그인 + admins 표에 이메일이 있어야(is_admin()) 주문/메뉴를
--   자유롭게 읽고 고칠 수 있음 (아래 RLS 정책 참고).
-- =========================================================

-- ---------- 테이블 ----------
create table if not exists public.menu (
  id          text primary key,
  name        text    not null check (char_length(name) between 1 and 20),
  category    text    not null default 'sweet',
  description text    not null default '',
  price       integer check (price >= 0),          -- null = 가격 미정(주문 불가)
  sold_out    boolean not null default false,
  sort        integer not null default 99,
  options     jsonb                                -- 시즈닝처럼 "하나 골라야" 하는 옵션들. null/빈 배열 = 없음
);
-- 이미 만든 프로젝트를 위한 안전한 추가
alter table public.menu add column if not exists options jsonb;

create table if not exists public.settings (
  id     int primary key default 1 check (id = 1), -- 한 줄짜리 설정표
  open   boolean not null default true,
  notice text    not null default '',
  bank   text    not null default '토스뱅크 1002-7828-0462 (쉬는시간(스마트콘텐츠학과))'
);

create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  number      integer not null,                    -- 번호표 번호
  pay         text    not null check (pay in ('transfer', 'cash')),
  depositor   text    not null default '' check (char_length(depositor) <= 20),  -- 입금자명 (계좌이체)
  memo       text    not null default '' check (char_length(memo) <= 100),
  total       integer not null default 0,
  status      text    not null default 'new'
              check (status in ('new', 'cooking', 'ready', 'done', 'canceled')),
  paid        boolean not null default false,
  created_at  timestamptz not null default now(),  -- 주문 시각
  paid_at     timestamptz,                         -- 결제 확인 시각
  cooking_at  timestamptz,                         -- 만들기 시작
  ready_at    timestamptz,                         -- 다 됐어요(호출)
  done_at     timestamptz,                         -- 전달 완료
  canceled_at timestamptz
);

-- 주문 한 건에 담긴 메뉴들 (분석용으로 한 줄씩)
create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid    not null references public.orders(id) on delete cascade,
  menu_id      text,                                 -- 메뉴가 나중에 지워져도 기록은 남도록 FK 없음
  name         text    not null,                     -- 주문 당시 이름
  unit_price   integer not null,                     -- 주문 당시 가격
  qty          integer not null check (qty between 1 and 20),
  option_label text check (option_label is null or char_length(option_label) <= 20)  -- 고른 시즈닝 등
);
alter table public.order_items add column if not exists option_label text
  check (option_label is null or char_length(option_label) <= 20);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists orders_created_at_idx on public.orders(created_at);

create table if not exists public.counters (id text primary key, n integer not null default 0);
create table if not exists public.admins   (email text primary key);
-- 날짜가 바뀌면 번호를 자동으로 001부터 다시 시작하기 위한 기준 날짜 (한국 시간)
alter table public.counters add column if not exists day date not null default (timezone('Asia/Seoul', now()))::date;

-- ---------- 상태가 바뀔 때 시각 자동 기록 ----------
create or replace function public.stamp_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'cooking'  then new.cooking_at  := coalesce(new.cooking_at, now());
      when 'ready'    then new.ready_at    := coalesce(new.ready_at, now());
      when 'done'     then new.done_at     := coalesce(new.done_at, now());
      when 'canceled' then new.canceled_at := now();
      else null;
    end case;
  end if;
  if new.paid and not old.paid then new.paid_at := now();
  elsif not new.paid then new.paid_at := null;
  end if;
  return new;
end $$;

drop trigger if exists orders_stamp on public.orders;
create trigger orders_stamp before update on public.orders
  for each row execute function public.stamp_status();

-- ---------- 관리자 확인 ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = auth.jwt() ->> 'email');
$$;

-- ---------- 손님 주문 넣기 ----------
-- 가격은 손님 폰이 아니라 DB의 menu 가격으로 계산합니다.
drop function if exists public.place_order(jsonb, text, text);
create or replace function public.place_order(p_items jsonb, p_pay text, p_depositor text default '', p_memo text default '')
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_order  uuid;
  v_no     int;
  v_total  int := 0;
  v_item   jsonb;
  v_qty    int;
  v_option text;
  m        menu%rowtype;
  v_today  date := (timezone('Asia/Seoul', now()))::date;
begin
  if not coalesce((select s.open from settings s where s.id = 1), false) then
    raise exception 'closed';
  end if;
  if p_pay is null or p_pay not in ('transfer', 'cash') then
    raise exception 'bad_pay';
  end if;
  p_depositor := left(btrim(coalesce(p_depositor, '')), 20);
  if p_pay = 'transfer' and p_depositor = '' then
    raise exception 'need_depositor';
  end if;
  if p_pay = 'cash' then p_depositor := ''; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'bad_items';
  end if;

  -- 날짜가 바뀌었으면(한국 시간 기준) 번호를 001부터 다시 시작
  update counters c
     set n   = case when c.day = v_today then c.n + 1 else 1 end,
         day = v_today
   where c.id = 'orders'
  returning c.n into v_no;

  insert into orders (number, pay, depositor, memo)
  values (v_no, p_pay, p_depositor, left(coalesce(p_memo, ''), 100))
  returning orders.id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::int;
    if v_qty is null or v_qty not between 1 and 20 then raise exception 'bad_items'; end if;

    select * into m from menu where menu.id = v_item ->> 'id';
    if not found or m.sold_out or m.price is null then
      raise exception 'unavailable:%', coalesce(m.name, v_item ->> 'id');
    end if;

    -- 시즈닝처럼 하나 골라야 하는 메뉴는, 메뉴에 등록된 옵션 중 하나인지 확인
    v_option := nullif(left(btrim(coalesce(v_item ->> 'option', '')), 20), '');
    if v_option is not null and not (coalesce(m.options, '[]'::jsonb) @> to_jsonb(v_option)) then
      raise exception 'bad_option:%', m.name;
    end if;
    if v_option is null and jsonb_array_length(coalesce(m.options, '[]'::jsonb)) > 0 then
      raise exception 'need_option:%', m.name;
    end if;

    insert into order_items (order_id, menu_id, name, unit_price, qty, option_label)
    values (v_order, m.id, m.name, m.price, v_qty, v_option);
    v_total := v_total + m.price * v_qty;
  end loop;

  update orders set total = v_total where orders.id = v_order;
  return json_build_object('id', v_order, 'number', v_no);
end $$;

-- ---------- 손님이 자기 번호표 보기 (주문 id를 아는 사람만) ----------
create or replace function public.get_order(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', o.id, 'number', o.number, 'pay', o.pay, 'depositor', o.depositor, 'memo', o.memo, 'total', o.total,
    'status', o.status, 'paid', o.paid, 'created_at', o.created_at,
    -- 아직 안 만들어진(접수 · 만드는 중) 주문 중에, 내 번호보다 앞선 게 몇 건인지 (오늘치만)
    'ahead', (
      select count(*)::int from orders o2
      where o2.status in ('new', 'cooking')
        and o2.number < o.number
        and (o2.created_at at time zone 'Asia/Seoul')::date = (o.created_at at time zone 'Asia/Seoul')::date
    ),
    'items', coalesce((
      select json_agg(json_build_object('name', i.name, 'price', i.unit_price, 'qty', i.qty, 'option', i.option_label) order by i.id)
      from order_items i where i.order_id = o.id), '[]'::json))
  from orders o where o.id = p_id;
$$;

-- ---------- 관리자: 주문 번호 초기화 ----------
create or replace function public.reset_counter() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update counters set n = 0, day = (timezone('Asia/Seoul', now()))::date where id = 'orders';
end $$;

grant execute on function public.place_order(jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_order(uuid)                to anon, authenticated;
grant execute on function public.is_admin()                     to anon, authenticated;
grant execute on function public.reset_counter()                to authenticated;

-- ---------- 접근 규칙 (RLS) ----------
alter table public.menu        enable row level security;
alter table public.settings    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.counters    enable row level security;  -- 정책 없음 = 함수로만 접근
alter table public.admins      enable row level security;  -- 정책 없음 = 아무도 못 봄

grant select on public.menu, public.settings to anon, authenticated;
grant insert, update, delete on public.menu, public.settings to authenticated;
grant select, update, delete on public.orders, public.order_items to authenticated;

drop policy if exists "menu read"      on public.menu;
drop policy if exists "menu admin"     on public.menu;
drop policy if exists "settings read"  on public.settings;
drop policy if exists "settings admin" on public.settings;
drop policy if exists "orders admin"   on public.orders;
drop policy if exists "items admin"    on public.order_items;

create policy "menu read"      on public.menu        for select to anon, authenticated using (true);
create policy "menu admin"     on public.menu        for all    to authenticated using (is_admin()) with check (is_admin());
create policy "settings read"  on public.settings    for select to anon, authenticated using (true);
create policy "settings admin" on public.settings    for all    to authenticated using (is_admin()) with check (is_admin());
create policy "orders admin"   on public.orders      for all    to authenticated using (is_admin()) with check (is_admin());
create policy "items admin"    on public.order_items for all    to authenticated using (is_admin()) with check (is_admin());

-- ---------- 실시간 반영 ----------
do $$
begin
  begin alter publication supabase_realtime add table public.menu;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.orders;   exception when duplicate_object then null; end;
end $$;

-- ---------- 처음 데이터 ----------
insert into public.settings (id) values (1) on conflict do nothing;
insert into public.counters (id, n) values ('orders', 0) on conflict do nothing;

-- 기본 메뉴는 메뉴가 하나도 없을 때만 넣어요 (다시 실행해도 관리자 화면에서 고친 메뉴는 그대로)
insert into public.menu (id, name, category, description, sort, price, options)
select * from (values
  ('ppopgi',     '뽑기',        'game',  '설탕 녹여 모양대로, 성공하면 하나 더!', 1, 1000::int, null::jsonb),
  ('sikhye',     '식혜',        'drink', '살얼음 동동, 밥알 동동 달달한 식혜', 1, null::int, null::jsonb),
  ('mixcoffee',  '믹스커피',    'drink', '교무실 선생님 책상 위 그 맛, 종이컵 믹스커피', 2, null::int, null::jsonb),
  ('jjondeugi',  '쫀드기 튀김', 'fried', '연탄불 대신 기름에 튀긴 쫀득바삭 쫀드기', 3, null::int, '["기본 시즈닝", "치즈 시즈닝"]'::jsonb),
  ('fries',      '감자튀김',    'fried', '갓 튀겨서 따끈한 감자튀김', 4, null::int, null::jsonb),
  ('sugamja',    '슈감자',      'fried', '쉐이크 감자, 시즈닝 골라서 톡톡 흔들어 먹기', 5, null::int, '["어니언 시즈닝", "허니버터 시즈닝", "치즈 시즈닝"]'::jsonb),
  ('dalgona',    '달고나',      'sweet', '설탕 녹여 부풀린 바삭달콤 달고나', 6, null::int, null::jsonb),
  ('yakgwa',     '약과',        'sweet', '쫀득하고 달콤한 약과', 7, null::int, null::jsonb),
  ('bullyang',   '불량식품',    'sweet', '문방구 앞에서 사 먹던 그 시절 간식', 8, null::int, null::jsonb)
) as v(id, name, category, description, sort, price, options)
where not exists (select 1 from public.menu);

-- 이미 메뉴가 있던 프로젝트(위 블록은 건너뜀)를 위해: 뽑기 · 슈감자를 새로 넣고,
-- 쫀드기 튀김엔 시즈닝 옵션을 걸어 줌. 몇 번을 다시 실행해도 안전해요.
insert into public.menu (id, name, category, description, sort, price, options)
values ('ppopgi', '뽑기', 'game', '설탕 녹여 모양대로, 성공하면 하나 더!', 1, 1000, null)
on conflict (id) do update set
  name = excluded.name, category = excluded.category, description = excluded.description,
  sort = excluded.sort, price = excluded.price, options = excluded.options;

-- 슈감자 가격은 일부러 비워둬요(준비 중으로 보임) — 가격 정해지면 관리자 화면에서 채우면 됩니다.
insert into public.menu (id, name, category, description, sort, price, options)
values ('sugamja', '슈감자', 'fried', '쉐이크 감자, 시즈닝 골라서 톡톡 흔들어 먹기', 5, null, '["어니언 시즈닝", "허니버터 시즈닝", "치즈 시즈닝"]')
on conflict (id) do update set
  name = excluded.name, category = excluded.category, description = excluded.description,
  sort = excluded.sort, options = excluded.options; -- price는 이미 정해뒀을 수 있으니 안 건드림

update public.menu
set options = '["기본 시즈닝", "치즈 시즈닝"]'::jsonb
where id = 'jjondeugi';

-- ▼▼▼ 관리자 이메일: Authentication 에서 만든 계정 이메일로 바꾸세요 (여러 명이면 줄을 추가) ▼▼▼
insert into public.admins (email) values ('smartcontents@ptu.com') on conflict do nothing;

-- 사이트가 새 테이블을 바로 알아보도록
notify pgrst, 'reload schema';
