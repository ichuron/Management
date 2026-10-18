# 家計簿＋資産運用アプリ

毎日の出費を記録する家計簿と、積立・運用の資産管理を1つにまとめた個人用Webアプリ。仕様は [SPEC.md](./SPEC.md)。

- フロント：Vite + React + TypeScript + Tailwind CSS
- DB・認証：Supabase（メール＋パスワード、自分のアカウントのみ）
- ホスティング：Cloudflare Pages

## 進み具合

- [x] Phase 1：土台（ログイン、RLS付きテーブル、初期データ、画面の枠）
- [x] Phase 2：家計簿（カレンダー、入力シート、テンプレート、連続入力、編集・削除・元に戻す、端末間の即時反映）
- [ ] Phase 3：実績
- [ ] Phase 4：資産
- [ ] Phase 5：仕上げ（定期記録、PWA、バックアップ、デプロイ）

## セットアップ

### 1. Supabase プロジェクトを作る

1. https://supabase.com で新しいプロジェクトを作る（リージョンは Tokyo がおすすめ）。
2. **SQL Editor** を開き、[`supabase/migrations/`](./supabase/migrations/) の SQL を番号順に1つずつ貼り付けて **Run**。
   - `0001_init.sql`：テーブル・RLS・初期データ
   - `0002_kakeibo.sql`：貯蓄口座の印、記録の即時反映（Realtime）
3. **Authentication → Users → Add user → Create new user** で自分のメールアドレスとパスワードを登録する（「Auto Confirm User」にチェック）。
4. **Authentication → Sign In / Providers**（Settings）で **「Allow new users to sign up」をオフ** にする。これで他人は登録できない。
5. **Project Settings → API** から `Project URL` と `anon public` キーを控える。
   `service_role` キーは絶対にアプリに入れないこと。

### 2. ローカルで動かす

```bash
npm install
cp .env.example .env.local   # 控えた URL と anon キーを書く
npm run dev                  # http://localhost:5173
```

初回ログイン時に、カテゴリ・予算・口座・定期ルール・一時出費の予定・目標が自動で作られます（2回目以降は何もしません）。

### 3. テスト

```bash
npm test          # 計算ロジック（Vitest）
npm run build     # 型チェック＋本番ビルド
```

## 使い方のメモ

- 「＋ 記録」はどの画面からでも開ける。家計簿タブで日付を選んでいれば、その日が初期値になる。
- 入力シートの「⚡」はテンプレート。タップするとその場で記録される（直後の「取り消す」で戻せる）。
- 「連続入力」にチェックすると、保存してもシートが閉じない（レシートをまとめて入れるとき用）。
- PC では数字キー・Backspace・Enter でも入力できる。
- カレンダーの色は「生活費の1日あたり予算」との比較。予算を超えた日は金額の前に「!」が付く。

## 安全のための設定

- 全テーブルで Row Level Security を有効にし、`user_id = auth.uid()` の行だけ読み書きできる。
- 未ログインではどのURLを開いてもログイン画面だけが表示される。
- `noindex`（`index.html` の meta、`public/_headers`、`public/robots.txt`）で検索エンジンに載せない。
