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

  -- 오늘의 첫 주문이면(= 방금 번호가 리셋됐으면), 전날까지 못 끝낸 주문은 자동으로 취소 처리
  -- (지워지지는 않아서 분석용 기록은 남지만, 진행 중 목록에선 사라짐)
  if v_no = 1 then
    update orders
       set status = 'canceled'
     where status in ('new', 'cooking', 'ready')
       and (created_at at time zone 'Asia/Seoul')::date < v_today;
  end if;

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
  ('ppopgi',     '뽑기',        'game',  '옛날 추억의 뽑기!', 1, 1000::int, null::jsonb),
  ('sikhye',            '식혜',            'drink', '살얼음 동동, 밥알 동동 달달한 식혜 (한정수량)', 1, 2500::int, null::jsonb),
  ('mixcoffee',         '믹스커피',       'drink', '교무실 선생님 책상 위 그 맛, 달달한 믹스커피', 2, 1500::int, null::jsonb),
  ('jjondeugi',         '쫀드기 튀김',    'fried', '연탄불 대신 기름에 튀긴 쫀득바삭 쫀드기', 3, 3500::int, '["기본 시즈닝", "치즈 시즈닝"]'::jsonb),
  ('sugamja',           '슈감자',         'fried', '쉐이크 감자, 시즈닝 골라서 톡톡 흔들어 먹기', 4, 3500::int, '["어니언 시즈닝", "허니버터 시즈닝", "치즈 시즈닝"]'::jsonb),
  ('dalgona_plain',     '달고나',         'sweet', '설탕 녹여 부풀린 바삭달콤 달고나', 5, 1000::int, null::jsonb),
  ('dalgona_success',   '달고나 뽑기',      'sweet', '조각성공하면 하나 더! 도전해 보세요', 6, 1500::int, null::jsonb),
  ('bullyang',          '불량식품',       'sweet', '옛날 문방구에서 사 먹던 그 시절 간식 3개', 7, 1500::int, null::jsonb)
) as v(id, name, category, description, sort, price, options)
where not exists (select 1 from public.menu);

-- 이미 메뉴가 있던 프로젝트(위 블록은 건너뜀)를 위해: 뽑기 · 슈감자를 새로 넣고,
-- 쫀드기 튀김엔 시즈닝 옵션을 걸어 줌. 몇 번을 다시 실행해도 안전해요.
insert into public.menu (id, name, category, description, sort, price, options)
values ('ppopgi', '뽑기', 'game', '옛날 추억의 뽑기!', 1, 1000, null)
on conflict (id) do update set
  name = excluded.name, category = excluded.category, description = excluded.description,
  sort = excluded.sort, price = excluded.price, options = excluded.options;

-- 식혜 · 믹스커피 · 쫀드기 · 슈감자 가격 + 달고나 분리 + 약과 제거 + 불량식품 업데이트
insert into public.menu (id, name, category, description, sort, price, options)
values
  ('sikhye', '식혜', 'drink', '살얼음 동동, 밥알 동동 달달한 식혜 (한정수량)', 1, 2500, null),
  ('mixcoffee', '믹스커피', 'drink', '교무실 선생님 책상 위 그 맛, 달달한 믹스커피', 2, 1500, null),
  ('jjondeugi', '쫀드기 튀김', 'fried', '연탄불 대신 기름에 튀긴 쫀득바삭 쫀드기', 3, 3500, '["기본 시즈닝", "치즈 시즈닝"]'::jsonb),
  ('sugamja', '슈감자', 'fried', '쉐이크 감자, 시즈닝 골라서 톡톡 흔들어 먹기', 4, 3500, '["어니언 시즈닝", "허니버터 시즈닝", "치즈 시즈닝"]'::jsonb),
  ('dalgona_plain', '달고나', 'sweet', '설탕 녹여 부풀린 바삭달콤 달고나', 5, 1000, null),
  ('dalgona_success', '달고나 뽑기', 'sweet', '조각성공하면 하나 더! 도전해 보세요', 6, 1500, null),
  ('bullyang', '불량식품', 'sweet', '옛날 문방구에서 사 먹던 그 시절 간식 3개', 7, 1500, null)
on conflict (id) do update set
  name = excluded.name, category = excluded.category, description = excluded.description,
  sort = excluded.sort, price = excluded.price, options = excluded.options;

-- 약과는 더 이상 사용하지 않으니 선택사항: 아래 한 줄로 삭제 (선택)
-- delete from public.menu where id = 'yakgwa';

-- ▼▼▼ 관리자 이메일: Authentication 에서 만든 계정 이메일로 바꾸세요 (여러 명이면 줄을 추가) ▼▼▼
insert into public.admins (email) values ('smartcontents@ptu.com') on conflict do nothing;

-- 사이트가 새 테이블을 바로 알아보도록
notify pgrst, 'reload schema';


-- =========================================================
-- 축제 끝나고 돌려 볼 분석 쿼리
-- -----------------------------------------------------------------------
-- 여기부터는 설정이 아니라 "조회용"이에요. 이 블록까지 포함해서 파일 전체를
-- 한 번에 Run 해도 테이블/함수에는 아무 영향 없지만(뷰 하나만 새로 생김),
-- SQL Editor는 결과를 마지막 쿼리(9번) 것만 보여줘요. 날짜별 매출처럼 중간
-- 블록 결과가 보고 싶으면, 그 번호 쿼리만 따로 긁어서 Run 하세요.
-- 시간은 전부 한국 시간 기준이고, 취소된 주문은 모두 제외합니다.
-- =========================================================

-- 편하게 쓰려고 만드는 뷰: 주문 한 줄 = 메뉴 한 줄
create or replace view public.sales as
select
  o.id                                         as order_id,
  o.number,
  (o.created_at at time zone 'Asia/Seoul')     as ordered_at,
  (o.created_at at time zone 'Asia/Seoul')::date as day,
  o.pay,
  o.status,
  i.menu_id,
  i.name,
  i.unit_price,
  i.qty,
  i.unit_price * i.qty                         as amount
from orders o
join order_items i on i.order_id = o.id
where o.status <> 'canceled';
-- 뷰는 관리자 로그인 없이 API로 보이지 않게 막아 둡니다
revoke all on public.sales from anon, authenticated;


-- 1) 날짜별 매출 · 주문 수
select day,
       count(distinct order_id) as 주문수,
       sum(qty)                 as 판매개수,
       sum(amount)              as 매출
from sales group by day order by day;


-- 2) 메뉴별 판매량 · 매출 · 매출 비중
select name as 메뉴,
       sum(qty)    as 판매개수,
       sum(amount) as 매출,
       round(100.0 * sum(amount) / sum(sum(amount)) over (), 1) as 매출비중_퍼센트
from sales group by name order by 매출 desc;


-- 3) 날짜 × 메뉴 판매 개수 (둘째 날에 뭐가 더 팔렸나)
with d as (select min(day) as d1, max(day) as d2 from sales)
select s.name as 메뉴,
       coalesce(sum(s.qty) filter (where s.day = d.d1), 0) as 첫째날,
       coalesce(sum(s.qty) filter (where s.day = d.d2 and d.d2 <> d.d1), 0) as 둘째날
from sales s cross join d
group by s.name order by s.name;


-- 4) 30분 단위 시간대별 주문 수 (언제 가장 바빴나)
select day,
       to_char(date_bin('30 minutes', ordered_at, timestamp '2000-01-01'), 'HH24:MI') as 시간대,
       count(distinct order_id) as 주문수,
       sum(amount)              as 매출
from sales group by 1, 2 order by 1, 2;


-- 5) 결제 방법 비율
select case pay when 'transfer' then '계좌이체' else '현금' end as 결제방법,
       count(*) as 주문수,
       sum(total) as 매출,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as 비율_퍼센트
from orders where status <> 'canceled' group by pay;


-- 6) 평균 대기 시간 (주문 → 호출) , 시간대별
select to_char(date_bin('1 hour', created_at at time zone 'Asia/Seoul', timestamp '2000-01-01'), 'MM-DD HH24"시"') as 시간대,
       count(*) as 완료주문,
       round(avg(extract(epoch from ready_at - created_at)) / 60, 1)  as 평균대기_분,
       round(max(extract(epoch from ready_at - created_at)) / 60, 1)  as 최장대기_분,
       round(avg(extract(epoch from ready_at - cooking_at)) / 60, 1)  as 평균조리_분
from orders
where ready_at is not null
group by 1 order by 1;


-- 7) 한 주문의 평균 금액 · 평균 개수 (객단가)
select round(avg(total))           as 평균주문금액,
       round(avg(items), 2)        as 평균메뉴개수
from (select o.total, sum(i.qty) as items
      from orders o join order_items i on i.order_id = o.id
      where o.status <> 'canceled' group by o.id, o.total) t;


-- 8) 같이 많이 시킨 메뉴 조합 TOP 10
select a.name as 메뉴1, b.name as 메뉴2, count(*) as 같이주문한횟수
from sales a
join sales b on a.order_id = b.order_id and a.name < b.name
group by a.name, b.name
order by 같이주문한횟수 desc
limit 10;


-- 9) 취소율
select count(*) filter (where status = 'canceled') as 취소,
       count(*)                                     as 전체,
       round(100.0 * count(*) filter (where status = 'canceled') / nullif(count(*), 0), 1) as 취소율_퍼센트
from orders;
