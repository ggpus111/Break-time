-- =========================================================
-- 쉬는시간 · 축제 끝나고 돌려 볼 분석 쿼리
-- SQL Editor 에서 필요한 블록만 골라 실행하세요. (시간은 한국 시간 기준)
-- 취소된 주문은 모두 제외합니다.
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
