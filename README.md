# shimonoseki-snap

React + TypeScript + Vite で構築したフロントエンドプロジェクトです。

## セットアップ

```bash
npm install
```

## 起動方法

### ローカルで起動

```bash
npm run dev
```

`http://localhost:5173` で開発サーバーが起動します。

### Dockerで起動

```bash
docker compose up -d
```

`http://localhost:5173` にアクセスすると確認できます。ポート5173が別プロセスで使用中の場合は `docker-compose.yml` の `ports` を変更してください。

ソースコードはボリュームマウントされているため、`src/`などを編集すると再ビルドなしでHMRが即座に反映されます。ただし以下の場合は再ビルドが必要です。

```bash
docker compose up -d --build
```

- `package.json` / `package-lock.json` を変更したとき(依存関係の変更)
- `Dockerfile` 自体を変更したとき

停止する場合:

```bash
docker compose down
```

## その他のコマンド

| コマンド | 説明 |
| --- | --- |
| `npm run build` | 型チェック(`tsc -b`)を行い本番用にビルド(`dist/`に出力) |
| `npm run preview` | ビルド済み(`dist/`)の内容をローカルでプレビュー |
| `npm run lint` | Oxlintによる静的解析を実行 |

## デプロイ時の注意(複数場所対応)

このアプリは `/spot/:id` のようなURLに直接アクセスされる前提(QRコード経由)です。本番環境で `dist/` を配信する場合、以下に注意してください。

- 静的ホスティング(S3、GitHub Pages、素のnginx等)では、`/spot/:id` のような存在しないファイルパスへのアクセスが404になってしまうため、**存在しない全てのパスを `index.html` にフォールバックさせるSPA用の書き換え設定**が必要です(例: nginxの`try_files`、Netlifyの`_redirects`等)。
- 現状、アプリはルートドメイン(サブパスなし)でのデプロイを前提としています。サブパス配信(Viteの`base`設定)は現在完全には対応していません。

なお、`npm run dev` および `docker compose up`(開発サーバー)では、Viteの開発サーバーがSPAフォールバックを標準で行うため、この設定なしでも動作します。

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
