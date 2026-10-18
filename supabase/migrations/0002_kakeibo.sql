-- Phase 2：家計簿
-- 0001 を適用したあとに、SQL Editor で実行する。

-- ---------------------------------------------------------------
-- 口座に「貯蓄・投資」の印をつける
-- この口座への振替を「貯蓄・投資に回した額」として集計する。
-- ---------------------------------------------------------------
alter table public.accounts add column is_savings boolean not null default false;

-- 運用口座は作成時に自動で貯蓄扱いにする（あとから設定で変えられる）
create or replace function public.default_savings_account()
returns trigger
language plpgsql
as $$
begin
  if new.kind in ('nisa_tsumitate', 'nisa_growth', 'taxable') then
    new.is_savings = true;
  end if;
  return new;
end;
$$;

create trigger accounts_default_savings before insert on public.accounts
  for each row execute function public.default_savings_account();

-- 既に初期データがある場合：運用口座と積立用預金を貯蓄扱いにする
update public.accounts set is_savings = true
where kind in ('nisa_tsumitate', 'nisa_growth', 'taxable') or name = '積立用預金';

-- 初期データ投入関数を更新（積立用預金を貯蓄扱いで作る）
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
  insert into accounts (name, kind, sort, is_savings) values ('積立用預金', 'bank', 2, true) returning id into acc_saving;
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

-- ---------------------------------------------------------------
-- 記録の変更を他の端末へすぐ届ける（Supabase Realtime）
-- RLS が効くので、自分の記録の変更だけが届く。
-- ---------------------------------------------------------------
alter publication supabase_realtime add table public.transactions;
