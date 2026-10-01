<div align="center">

# 🔔 쉬는시간

**대동제 부스 줄서기를 없애는 QR 주문 웹앱**

빌드 도구 없이 정적 HTML/CSS/JS와 Supabase만으로 동작하는 풀스택 주문 시스템입니다.

[![Live Demo](https://img.shields.io/badge/demo-live-2e4638?style=flat-square)](https://boisterous-churros-49b101.netlify.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg?style=flat-square)](LICENSE)

[Live Demo](https://boisterous-churros-49b101.netlify.app/) · [Features](#features) · [Getting Started](#getting-started) · [Architecture](#architecture)

</div>

---

## Overview

**쉬는시간**은 축제 부스에서 줄을 서지 않고 폰으로 주문할 수 있게 해주는 웹앱입니다. 손님은
QR을 찍고 → 메뉴를 담고 → 주문을 넣으면 번호표를 받고, 부스에서 조리하는 동안 상태가
실시간으로 바뀌다가 완료되면 소리·진동으로 알려줍니다. 운영자 쪽에는 들어오는 주문을
처리하고 메뉴·재고·영업 상태를 관리하는 별도 대시보드가 있습니다.

스마트콘텐츠학과 '쉬는시간' 부스가 실제로 운영하기 위해 만들었고, 메뉴·계좌·학과 이름이
전부 설정 가능해서 다른 부스나 행사에도 그대로 재사용할 수 있게 설계했습니다.

|  | Customer | Admin |
|---|---|---|
| **🧪 Demo** (로그인 불필요, 데이터는 브라우저에만 저장) | [바로가기](https://boisterous-churros-49b101.netlify.app/) | [바로가기](https://boisterous-churros-49b101.netlify.app/gyomusil-7x4m.html) |
| **🚀 실제 운영 사이트** (관리자 로그인 필요) | [바로가기](https://smartcontents-breaktime.netlify.app/) | [바로가기](https://smartcontents-breaktime.netlify.app/gyomusil-7x4m.html) |

Demo는 Supabase 연결 없이 데모 모드로 배포한 별도 사이트라 로그인 없이 바로 눌러볼 수
있고, 실제 주문 데이터와는 완전히 분리돼 있습니다.

---

## Features

### Customer app (`index.html`)

- 교시별로 분류된 메뉴판, 실시간 품절 / 준비중 상태
- 시즈닝처럼 **옵션을 하나 선택해야 하는 메뉴** 지원 (메뉴별로 옵션마다 독립된 담기 버튼)
- 계좌이체 / 현금 선택, 합계는 항상 서버에서 재계산 (클라이언트 금액 조작 불가)
- 실시간 주문 상태 추적 (접수 → 조리 중 → 준비 완료) + 대기 인원(앞에 몇 명 남았는지) 표시
- 백그라운드 상태 추적: 화면을 나가도 주문이 계속 감시되고, 준비 완료 시 소리 + 진동으로
  알림 (별도 푸시 권한 없이 탭이 열려 있는 동안 동작)
- 클라이언트 사이드 중복 주문 감지 및 확인 절차

### Admin dashboard (`gyomusil-7x4m.html`)

- Supabase Auth 기반 로그인, DB의 `admins` 화이트리스트로 접근 제어
- 실시간 주문 피드 + 새 주문 알림음
- 원클릭 상태 전이 (입금 확인 → 조리 시작 → 호출 → 전달 완료)
- 메뉴 CRUD (이름/가격/품절/옵션)를 코드 배포 없이 즉시 반영
- 휴리스틱 기반 중복 주문 탐지 (메뉴 구성 + 금액 + 시간 근접도)
- 날짜 경계에서 자동 리셋되는 일별 매출/주문 수 집계
- 날짜가 바뀌면 자동으로 초기화되는 순번 카운터, 이때 전날까지 못 끝낸 주문은 자동 취소
  (기록은 남고, 진행 중 목록에서만 사라짐)
- QR 포스터 생성 및 인쇄
- 외부 차트 라이브러리 없이 순수 SVG로 그리는 통계 대시보드 (일별 매출, 메뉴별 판매량,
  결제 수단 비율)

---

## Architecture

빌드 스텝이 없습니다. 브라우저가 그대로 실행할 수 있는 ES 모듈과 Supabase 프로젝트 하나가
전부입니다.

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│  index.html      │◀──────▶│   store.js        │◀──────▶│  Supabase            │
│  (customer app)  │        │  (data layer)      │        │  PostgreSQL + Auth   │
└─────────────────┘        │                    │        │  + Realtime          │
┌─────────────────┐        │  demo mode:        │        │                       │
│ gyomusil-7x4m    │◀──────▶│  localStorage      │        │  RPC:                │
│ .html (admin)    │        │  fallback          │        │  · place_order()      │
└─────────────────┘        └──────────────────┘        │  · get_order()        │
                                                          └─────────────────────┘
```

별도 백엔드 서버 없이, PostgreSQL 함수(RPC)와 Row Level Security로 인증·검증·가격 계산을
전부 처리합니다.

- **`place_order()`** — 손님이 주문을 넣을 때 호출. 그 시점 DB의 메뉴 가격으로 합계를
  서버에서 재계산하고, 번호를 원자적으로 발급합니다. 클라이언트가 보낸 가격은 신뢰하지
  않습니다.
- **`get_order()`** — 손님이 자기 주문 하나만 조회할 때 호출. 주문의 UUID를 알아야만
  조회할 수 있어서 다른 손님의 주문은 볼 수 없습니다.
- 관리자 전용 테이블(`orders`, `order_items`, `counters`, `admins`)은 Supabase Auth 로그인 +
  `admins` 테이블 화이트리스트 확인(`is_admin()`)을 통과해야만 RLS 정책으로 접근이
  허용됩니다.

즉 "백엔드"가 [`sql/schema.sql`](sql/schema.sql) 파일 하나로 존재하는 구조입니다.

### Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (ES Modules) — no framework, no bundler |
| Backend | [Supabase](https://supabase.com) — PostgreSQL, Auth, Realtime (free tier) |
| Data access | Supabase JS client (loaded via CDN, no `npm install`) |
| Realtime sync | Supabase Realtime subscriptions + polling fallback |
| QR generation | `qrcodejs` (CDN) |
| Charts | Hand-rolled SVG bar charts (no charting library) |
| Hosting | Any static host — deployed to [Netlify](https://netlify.com) |

### Project Structure

```
swi/
├─ index.html            Customer-facing order screen (QR entry point)
├─ gyomusil-7x4m.html     Admin dashboard ("교무실") — not linked from the customer app
├─ css/
│  └─ style.css           Full visual design (chalkboard / notebook theme)
├─ js/
│  ├─ store.js            Data layer — abstracts Supabase vs. demo (localStorage) backend
│  ├─ customer.js         Customer app logic
│  ├─ admin.js            Admin dashboard logic
│  └─ supabase-config.js  Supabase project URL + anon key (empty = demo mode)
├─ sql/
│  └─ schema.sql           Tables, RLS policies, RPC functions, and post-event analytics
│                           queries — everything runs from this one file
├─ LICENSE
└─ README.md
```

Each JS file starts with a header comment describing its responsibility — start there when
reading the code.

---

## Getting Started

### Try it without any setup

Easiest: just open the [hosted demo](https://boisterous-churros-49b101.netlify.app/) — no
login, no setup.

To run it locally instead: if `js/supabase-config.js` is empty, the app automatically runs in
**demo mode**, persisting everything to `localStorage` in your browser. No Supabase account
needed:

```bash
git clone <this-repo>
cd swi
# serve with any static server — opening the file directly (file://) breaks ES module imports
npx serve .
# or: python3 -m http.server 8080
```

Open `index.html` and `gyomusil-7x4m.html` in two tabs to try the customer and admin flows
side by side.

### Prerequisites

- A [Supabase](https://supabase.com) account (free tier is enough)
- Any static file host (Netlify, Vercel, GitHub Pages, etc.)

### Setup

1. **Create a Supabase project.** Region doesn't matter functionally; pick the closest one.
2. **Create an admin user** under `Authentication → Users → Add user` (check *Auto Confirm
   User*).
3. **Run the schema.** Edit the admin email at the bottom of [`sql/schema.sql`](sql/schema.sql)
   (replace `'admin@example.com'`), then paste the whole file into Supabase's **SQL Editor**
   and run it. This creates all tables, RLS policies, RPC functions, and seed menu data.
   Safe to re-run — tables/columns are only created if missing, functions are always replaced
   with the latest version.
4. **Configure the client.** Copy your Project URL and `anon public` key (or
   `sb_publishable_…` key) from **Project Settings → API** into `js/supabase-config.js`.
   Never put the `service_role` key here — it would be exposed to every visitor.
5. **Deploy.** Any static host works. Fastest no-login option: drag the `swi` folder onto
   [Netlify Drop](https://app.netlify.com/drop). The generated URL is the customer app; append
   `/gyomusil-7x4m.html` for the admin dashboard.
6. **Populate the menu.** A freshly created (empty) menu table gets seeded with demo items on
   first schema run. On the admin dashboard's **메뉴 · 가격** tab, edit names/prices/categories,
   and set the "옵션" field (comma-separated) on any item that needs a required choice, like a
   seasoning.

---

## Database Schema

| Table | Purpose |
|---|---|
| `menu` | Item name, category, description, price, sold-out flag, optional choice list |
| `settings` | Single-row table: open/closed toggle, announcement, payment account |
| `orders` | One row per order — number, payment method, total, status, timestamps per stage |
| `order_items` | One row per line item — name/price/qty/chosen option at order time |
| `counters` | Daily order-number counter (auto-resets when the date rolls over) |
| `admins` | Email whitelist checked by `is_admin()` |

Post-event analytics queries live at the bottom of [`sql/schema.sql`](sql/schema.sql) — daily
revenue, top menu items, busiest time slots, pairing analysis, cancellation rate, and more.
They're plain `select`s grouped under a "축제 끝나고" (after the festival) section; run the
whole file and the SQL Editor shows the last query's result, or copy out just the numbered
block you want to see. Export results via Supabase's Table Editor → CSV.

---

## Security Notes

- Order totals are always computed server-side from the `menu` table — a client can't submit
  an arbitrary price.
- Customers can only read their own order (by UUID via `get_order()`); the full order table is
  gated behind admin auth + RLS.
- The admin page filename was originally meant to be non-obvious and is never linked from the
  customer app — but it's linked directly above in this README, and the filename is visible in
  source either way once the repo is public. The real access control is Supabase Auth login +
  the `admins` table whitelist (RLS), not the filename. If you fork this for your own event,
  consider renaming `gyomusil-7x4m.html` anyway and keeping that README link out of your fork.
- Free Supabase projects auto-pause after 7 days of inactivity — if you provision ahead of your
  event, check the dashboard the day before to make sure it's awake.

---

## License

[MIT](LICENSE) © 박다현, 스마트콘텐츠학과 '쉬는시간'
