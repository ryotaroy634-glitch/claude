# Tech News RSS Reader

US主要テック企業とテクノロジーメディアの最新情報を集約するRSSリーダーです。

## Features

- **20のRSSソース対応**
  - Tech Companies: Amazon (AWS), Apple, Google, Meta, Microsoft, OpenAI, Anthropic, xAI
  - Tech Media: TechCrunch, The Verge, Wired, Ars Technica, Engadget, CNET, Hacker News, VentureBeat

- **データベース永続化** (SQLite)
  - 記事の重複排除
  - 90日間の記事保持
  - 既読/未読管理

- **10分間隔の自動収集**
  - 条件付き取得 (ETag/Last-Modified) による効率的な更新
  - 新規記事のメール通知

- **Web UI**
  - Grid/Timeline表示切り替え
  - カテゴリフィルター
  - キーワード検索
  - 既読管理

## Setup

### 1. インストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .envを編集してメール設定を追加
```

### 3. 起動

```bash
npm start
```

Open http://localhost:3000

## Environment Variables

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `PORT` | サーバーポート | `3000` |
| `DB_PATH` | データベースファイルパス | `./data/rss.db` |
| `FETCH_INTERVAL_MINUTES` | 収集間隔（分） | `10` |
| `RETENTION_DAYS` | 記事保持期間（日） | `90` |
| `TZ` | タイムゾーン | `UTC` |

### Email Configuration

以下のいずれかを設定:

**SendGrid**
```
SENDGRID_API_KEY=your_api_key
MAIL_FROM=noreply@yourdomain.com
MAIL_TO=your_email@example.com
```

**Gmail**
```
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
MAIL_TO=your_email@example.com
```

**Generic SMTP**
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_username
SMTP_PASS=your_password
MAIL_FROM=noreply@yourdomain.com
MAIL_TO=your_email@example.com
```

## API Endpoints

### Items
- `GET /api/items` - 記事一覧取得
- `GET /api/items?search=keyword` - キーワード検索
- `POST /api/items/:id/read` - 既読にする
- `POST /api/items/read-all` - すべて既読にする

### Sources
- `GET /api/sources` - ソース一覧
- `POST /api/sources` - ソース追加
- `PATCH /api/sources/:id` - ソース有効/無効切り替え
- `DELETE /api/sources/:id` - ソース削除

### System
- `GET /api/stats` - 統計情報
- `POST /api/collect` - 手動収集実行
- `GET /api/email/status` - メール設定状態
- `POST /api/email/test` - テストメール送信

## Scripts

```bash
# サーバー起動（スケジューラ込み）
npm start

# データベース初期化
npm run init-db

# 手動収集実行
npm run collect

# 手動収集 + メール通知
npm run collect -- --notify
```

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **RSS Parser**: rss-parser
- **Scheduler**: node-cron
- **Email**: nodemailer
- **Frontend**: Vanilla JavaScript

## Architecture

```
├── server.js           # メインサーバー
├── src/
│   ├── database.js     # データベース操作
│   ├── collector.js    # RSS収集ジョブ
│   ├── notifier.js     # メール通知
│   └── scheduler.js    # スケジューラ
├── scripts/
│   ├── init-db.js      # DB初期化スクリプト
│   └── collect.js      # 手動収集スクリプト
├── public/
│   └── index.html      # フロントエンドUI
├── data/
│   └── rss.db          # SQLiteデータベース
└── feeds.json          # RSSフィード設定
```
