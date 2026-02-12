# Tech RSS Reader Aggregator

ブラウザで動作する RSS リーダー/アグリゲーターです。

## 実装概要

- フロントエンド: **React + TypeScript (Babel in-browser) + Tailwind CSS**
- バックエンド: **Node.js + Express**
- データ保存: **SQLite** (sqlite3 CLI を利用)
- RSS解析: **rss-parser**
- フィード不達時: **HTMLスクレイピングへフォールバック**
- スケジューラー: **30分間隔** + PT 5:00〜22:00 だけ更新

## API

- `GET /api/articles?page=1&pageSize=20&category=&sourceGroup=&sourceId=&read=`
- `GET /api/sources`
- `POST /api/refresh`
- `PATCH /api/articles/:id/read` (`{ "isRead": true|false }`)

## 実行

```bash
npm install
npm start
```

`http://localhost:3000` にアクセス。

## 補足

- 重複排除は `URL + タイトル` の SHA-256 ハッシュで実施。
- 取得リトライは最大3回（指数バックオフ）。
- 一部フィード失敗時も他フィード処理を継続。
- 失敗/成功ログは `fetch_logs` テーブルへ保存。
