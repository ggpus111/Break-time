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

### 🙋 손님 화면 (`index.html`)

QR을 찍으면 바로 열리는 주문 화면입니다. 앱 설치나 회원가입이 필요 없습니다.

| 기능 | 설명 |
|---|---|
| 📋 교시별 메뉴판 | "0교시 뽑기 · 1교시 마실거리 · 2교시 튀김 · 3교시 추억의 간식"처럼 시간표 콘셉트로 분류 |
| 🧂 옵션 선택 메뉴 | 슈감자 시즈닝처럼 하나를 골라야 하는 메뉴는 옵션마다 따로 담기 |
| 🚫 품절 / 준비 중 | 관리자가 품절 처리하면 손님 화면에 즉시 "품절" 도장이 찍힘 |
| 💳 결제 방법 선택 | 계좌이체(입금자명 입력, 계좌번호 복사) 또는 현금 |
| 🎫 번호표 발급 | 주문하면 그날 기준 001번부터 번호표가 나옴 |
| ⏱️ 실시간 상태 확인 | 접수 → 만드는 중 → 나왔어요, 그리고 **내 앞에 몇 명** 남았는지 표시 |
| 🔔 완료 알림 | 음식이 나오면 소리 + 진동으로 알려줌 (화면을 다른 데 둬도 탭만 열려 있으면 동작) |
| ⚠️ 중복 주문 방지 | 90초 안에 똑같은 주문을 또 누르면 "방금 같은 주문 넣었어요" 하고 한 번 더 확인 |
| 📢 알림장 | 관리자가 쓴 공지("감자는 5분 걸려요" 등)가 메뉴판 위에 표시 |
| 🔒 영업 종료 | 관리자가 마감하면 주문 버튼이 잠김 |

### 🧑‍🏫 관리자 화면 "교무실" (`gyomusil-7x4m.html`)

부스 운영진만 로그인해서 쓰는 화면입니다. 탭 5개로 구성돼 있습니다.

| 탭 | 기능 |
|---|---|
| **주문 현황** | 실시간 주문 카드 + 새 주문 알림음 · 버튼 한 번으로 상태 변경 (만들기 시작 → 다 됐어요·호출 → 전달 완료) · 입금 확인 체크 · 실수 방지용 2번 눌러야 되는 주문 취소 · 5분 안에 똑같은 주문이 또 들어오면 "중복 의심" 표시 · 오늘 주문 수 / 오늘 매출 |
| **메뉴 · 가격** | 메뉴 추가·삭제, 이름·가격·설명·카테고리·옵션 수정, 품절 on/off — 저장하면 손님 화면에 바로 반영 |
| **영업 · QR** | 영업 시작/마감 스위치 · 알림장(공지) · 입금 계좌 · 주문 번호 초기화 · QR 포스터 생성/인쇄 · **모든 데이터 초기화** (테스트 주문 삭제) |
| **일정** | 부스 운영진 근무표 — 날짜별 시간대마다 부스/홍보 담당자, 지금 시간대 강조, 이름을 고르면 그 사람 근무만 보기 + 근무 시간 합계 |
| **통계** | 일별 매출, 메뉴별 판매량, 결제 수단 비율 막대그래프 (외부 라이브러리 없이 SVG로 직접 그림) |

### ⚙️ 자동으로 처리되는 것들

- **가격은 서버가 계산** — 손님 폰에서 보낸 금액은 무시하고, DB의 메뉴 가격으로 합계를 다시 계산
- **날짜가 바뀌면 번호 자동 리셋** — 둘째 날 첫 주문은 다시 001번 (한국 시간 기준). 이때 전날 못 끝낸
  주문은 자동 취소 처리 (기록은 남음)
- **실시간 동기화** — 주문/메뉴/설정이 바뀌면 모든 화면에 바로 반영 (Supabase Realtime + 끊겼을 때를
  대비한 주기적 새로고침)
- **데모 모드** — Supabase 설정이 비어 있으면 브라우저 안(localStorage)에서만 돌아가는 체험판으로 동작

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
- **`reset_counter()` / `reset_all_data()`** — 관리자 전용. 각각 주문 번호만 초기화 / 모든 주문
  기록 삭제. 함수 안에서 `is_admin()`을 다시 확인합니다.
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
│  ├─ schedule.example.js Staff schedule format (fake names) — copy to schedule.js (git-ignored)
│                          for the real one; falls back to this example when missing
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

## Admin Dashboard Guide

축제 당일 운영 순서 기준으로 정리했습니다.

**축제 전**
1. **영업 · QR** 탭에서 입금 계좌 확인 → QR 포스터 인쇄
2. 테스트 주문을 충분히 넣어 본 뒤, **영업 · QR → 모든 데이터 초기화**로 테스트 기록 삭제
   (경고창 2번 확인 후 삭제. 메뉴·설정·관리자 계정은 그대로 유지)

**운영 중**
1. 새 주문이 오면 알림음 + "주문 현황" 탭에 빨간 숫자 배지
2. 돈을 확인하면 **입금 확인**(계좌이체) / **현금 받음**(현금) 버튼 — 이걸 눌러야 만들기를 시작할 수 있음
3. **만들기 시작** → **다 됐어요 · 호출** (손님 폰에 소리·진동 알림) → **전달 완료**
4. 재료가 떨어지면 **메뉴 · 가격** 탭에서 품절 처리, 대기가 길면 알림장에 공지
5. 누가 근무 중인지는 **일정** 탭에서 확인 (지금 시간대가 노란색으로 표시)

**둘째 날 / 끝나고**
- 주문 번호는 날짜가 바뀌면 자동으로 001번부터 다시 시작 (수동으로 하려면 "번호 초기화")
- **통계** 탭에서 매출 확인, 더 자세한 분석은 `sql/schema.sql` 맨 아래 분석 쿼리 9개 사용

---

## License

[MIT](LICENSE) © 박다현, 스마트콘텐츠학과 '쉬는시간'
