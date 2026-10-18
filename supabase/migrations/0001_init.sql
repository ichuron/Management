-- 家計簿＋資産運用アプリ 初期スキーマ
-- Supabase の SQL Editor に貼り付けて実行するか、`supabase db push` で適用する。
-- 金額はすべて integer（円）。全テーブルで RLS を有効にし、自分の行だけ読み書きできる。

-- ---------------------------------------------------------------
-- 共通：updated_at を自動更新するトリガー関数
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bank', 'cash', 'nisa_tsumitate', 'nisa_growth', 'taxable')),
  opening_balance integer not null default 0,
  opening_date date,
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default '',
  color text not null default '#64748b',
  grp text not null check (grp in ('fixed', 'living', 'income')),
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date check (month is null or extract(day from month) = 1), -- 月初の日付。null は既定値
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 同じカテゴリ・同じ月の予算は1件だけ（既定値 month is null も1件だけ）
create unique index budgets_category_month_key on public.budgets (user_id, category_id, month) nulls not distinct;

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount integer not null check (amount >= 0),
  category_id uuid references public.categories (id) on delete set null,
  from_account_id uuid references public.accounts (id) on delete set null,
  to_account_id uuid references public.accounts (id) on delete set null,
  payment_method text,
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_month date not null,
  end_month date,
  active boolean not null default true,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planned_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount integer not null check (amount >= 0),
  planned_month date,
  fiscal_year integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  type text not null check (type in ('expense', 'income', 'transfer', 'adjustment')),
  amount integer not null, -- adjustment のみ負の値を許す（下の check）
  category_id uuid references public.categories (id) on delete set null,
  from_account_id uuid references public.accounts (id) on delete set null,
  to_account_id uuid references public.accounts (id) on delete set null,
  payment_method text,
  memo text not null default '',
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  planned_expense_id uuid references public.planned_expenses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type = 'adjustment' or amount >= 0)
);
create index transactions_user_date_idx on public.transactions (user_id, date);
-- 定期ルールの自動記録は同じ月に二重に作らない
create unique index transactions_recurring_month_key
  on public.transactions (recurring_rule_id, (date_trunc('month', date::timestamp)))
  where recurring_rule_id is not null;

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount integer not null check (amount >= 0),
  category_id uuid references public.categories (id) on delete set null,
  payment_method text,
  memo text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null,
  value integer not null check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount integer not null check (amount >= 0),
  target_date date,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.month_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

-- 1ユーザー1行
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  month_start_day integer not null default 1 check (month_start_day between 1 and 28),
  assumed_returns integer[] not null default '{0,300,500}', -- 万分率（300 = 3%）
  yearly_contribution_increase integer not null default 0,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  nisa_limits jsonb not null default '{"tsumitate_annual":1200000,"growth_annual":2400000,"lifetime":18000000,"growth_lifetime":12000000}',
  -- 支払い方法と、その支払いで残高が減る口座の対応 [{ "name": "現金", "account_id": "..." }]
  payment_methods jsonb not null default '[]',
  last_export_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- RLS とトリガーを全テーブルに設定
-- ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'budgets', 'recurring_rules', 'planned_expenses',
    'transactions', 'templates', 'valuations', 'goals', 'month_notes', 'settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_updated_at', t
    );
    -- 未ログイン（anon）からは一切触れない
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------
-- 初期データの投入（初回ログイン時にアプリから呼ぶ）
-- settings 行がまだ無いときだけ作る。スマホとPCで同時に呼んでも二重にならない。
-- security invoker なので RLS がそのまま効く。
-- ---------------------------------------------------------------
create or replace function public.ensure_initial_data()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  acc_salary uuid;
  acc_saving uuid;
  acc_cash uuid;
  acc_nisa_t uuid;
  cat_rent uuid;
  cat_phone uuid;
  cat_net uuid;
  cat_subsc uuid;
  cat_salary uuid;
  cat_tmp uuid;
  r_name text;
  r_icon text;
  r_color text;
  r_sort integer;
  r_amount integer;
  start_m date := date '2027-04-01';
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- settings 行の作成を「ロック」として使う。既にあれば何もしない。
  insert into settings (user_id) values (uid) on conflict (user_id) do nothing;
  if not found then
    return false;
  end if;

  -- 口座
  insert into accounts (name, kind, sort) values ('給与口座', 'bank', 1) returning id into acc_salary;
  insert into accounts (name, kind, sort) values ('積立用預金', 'bank', 2) returning id into acc_saving;
  insert into accounts (name, kind, sort) values ('現金', 'cash', 3) returning id into acc_cash;
  insert into accounts (name, kind, sort) values ('NISA（つみたて投資枠）', 'nisa_tsumitate', 4) returning id into acc_nisa_t;
  insert into accounts (name, kind, sort) values ('NISA（成長投資枠）', 'nisa_growth', 5);

  -- 支払い方法（カード・PayPay は給与口座から出たものとみなす）
  update settings set payment_methods = jsonb_build_array(
    jsonb_build_object('name', '現金', 'account_id', acc_cash),
    jsonb_build_object('name', 'クレジットカード', 'account_id', acc_salary),
    jsonb_build_object('name', 'PayPay', 'account_id', acc_salary)
  ) where user_id = uid;

  -- カテゴリと既定の予算
  insert into categories (name, icon, color, grp, sort) values ('社宅家賃', '🏠', '#64748b', 'fixed', 1) returning id into cat_rent;
  insert into budgets (category_id, amount) values (cat_rent, 10000);
  with c as (insert into categories (name, icon, color, grp, sort) values ('水道光熱費', '💡', '#eab308', 'fixed', 2) returning id)
    insert into budgets (category_id, amount) select id, 10000 from c;
  insert into categories (name, icon, color, grp, sort) values ('スマホ', '📱', '#6366f1', 'fixed', 3) returning id into cat_phone;
  insert into budgets (category_id, amount) values (cat_phone, 3000);
  insert into categories (name, icon, color, grp, sort) values ('ネット回線', '🌐', '#0ea5e9', 'fixed', 4) returning id into cat_net;
  insert into budgets (category_id, amount) values (cat_net, 4000);
  insert into categories (name, icon, color, grp, sort) values ('サブスク', '🎬', '#a855f7', 'fixed', 5) returning id into cat_subsc;
  insert into budgets (category_id, amount) values (cat_subsc, 2000);

  for r_name, r_icon, r_color, r_sort, r_amount in
    select * from (values
      ('食費', '🍙', '#f97316', 11, 35000),
      ('日用品', '🧻', '#14b8a6', 12, 4000),
      ('交通費', '🚃', '#3b82f6', 13, 5000),
      ('交際費', '🍻', '#ec4899', 14, 15000),
      ('趣味・娯楽', '🎮', '#8b5cf6', 15, 10000),
      ('服・美容', '👕', '#f43f5e', 16, 5000),
      ('医療・雑費', '💊', '#10b981', 17, 3000)
    ) as v
  loop
    insert into categories (name, icon, color, grp, sort)
      values (r_name, r_icon, r_color, 'living', r_sort) returning id into cat_tmp;
    insert into budgets (category_id, amount) values (cat_tmp, r_amount);
  end loop;

  insert into categories (name, icon, color, grp, sort) values ('給与', '💴', '#16a34a', 'income', 21) returning id into cat_salary;
  insert into categories (name, icon, color, grp, sort) values ('その他収入', '🪙', '#22c55e', 'income', 22);

  -- 定期ルール（2027年4月から）
  insert into recurring_rules (type, amount, category_id, from_account_id, to_account_id, payment_method, day_of_month, start_month, memo) values
    ('income',   208200, cat_salary, null,       acc_salary, null, 25, start_m, '給与'),
    ('expense',   10000, cat_rent,   acc_salary, null,       '給与天引き', 25, start_m, '社宅家賃（給与天引き）'),
    ('transfer',  66400, null,       acc_salary, acc_nisa_t, null,  1, date '2027-05-01', 'NISA積立'),
    ('transfer',  16600, null,       acc_salary, acc_saving, null, 25, start_m, '預金積立'),
    ('expense',    3000, cat_phone,  acc_salary, null,       'クレジットカード', 27, start_m, 'スマホ代'),
    ('expense',    4000, cat_net,    acc_salary, null,       'クレジットカード', 27, start_m, 'ネット回線'),
    ('expense',    2000, cat_subsc,  acc_salary, null,       'クレジットカード', 27, start_m, 'サブスク');

  -- 一時出費の予定（2027年度）
  insert into planned_expenses (name, amount, planned_month, fiscal_year) values
    ('引っ越し（入社前）', 50000, date '2027-03-01', 2027),
    ('家具・家電（入社前）', 100000, date '2027-03-01', 2027),
    ('スーツ・仕事用品（入社前）', 40000, date '2027-03-01', 2027),
    ('帰省・夏', 20000, date '2027-08-01', 2027),
    ('帰省・年末年始', 20000, date '2027-12-01', 2027),
    ('冠婚葬祭・プレゼント', 30000, null, 2027);

  -- 目標
  insert into goals (name, amount, target_date, sort) values
    ('30歳で1000万円', 10000000, date '2035-05-01', 1),
    ('サイドFIRE', 21000000, null, 2);

  -- テンプレート
  insert into templates (name, type, amount, category_id, payment_method, memo, sort)
  select '昼ごはん', 'expense', 800, id, 'PayPay', '昼ごはん', 1 from categories where name = '食費' and user_id = uid;

  return true;
end;
$$;

revoke all on function public.ensure_initial_data() from public, anon;
grant execute on function public.ensure_initial_data() to authenticated;
