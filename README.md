# AB Markup Language (`.ab`)

日本語の執筆体験に最適化された軽量マークアップ言語「AB」のパーサー、コンパイラ、およびツールチェーンです。

## 特徴
- **ゼロ依存（Zero Dependencies）**: 外部 npm パッケージを一切使用せず、Node.js 標準モジュールのみで動作。
- **決定論的な構文解析**: 日本語文字に密着したインライン装飾、非対称ブラケット記法（`[...]...[/]`）、二重化エスケープ（`[[`, `]]`, `@@`）。
- **自然な改行**: 書いたままの改行が直感的に反映され、ブロック要素前後の空行は自動トリム。
- **柔軟なテンプレートシステム**: メタデータ（`@title` 等）や本文（`{{content}}`）を HTML テンプレートに埋め込み可能。
- **開発ツール**: プロジェクト全体の一括ビルド（`ab build`）および自動再ビルド付き開発サーバー（`ab serve`）。

---

## コマンド一覧

### プロジェクトのビルド (`ab build`)
カレントディレクトリの `ab.config.js` を読み込み、対象ファイルをコンパイルして出力先フォルダへビルドします。

```bash
node ab.js build
# または
npm run build
```

### 開発サーバーの起動 (`ab serve`)
初回ビルド後、HTTP サーバーを起動して成果物を配信します。対象ファイルやテンプレートの変更を検知して自動で再ビルドされます。

```bash
node ab.js serve
# または
npm run serve
```

### 単一ファイルのコンパイル
特定の `.ab` ファイルを単体で HTML に変換します（テンプレートは適用されず本文のみ出力）。`-w` オプションを指定すると、ファイルの変更を監視して自動再コンパイルします。

```bash
# 同名 .html へ変換
node ab.js docs/ab-markup-spec.ab

# 出力先を指定して変換
node ab.js docs/ab-markup-spec.ab -o dist/spec.html

# ファイル変更を監視して自動再コンパイル
node ab.js docs/ab-markup-spec.ab -w
```

---

## 設定ファイル (`ab.config.js`)

プロジェクトルートに `ab.config.js` を配置して動作を設定できます。

```javascript
export default {
  host: "localhost",   // 開発サーバーのホスト（デフォルト: "localhost"）
  port: 3000,          // 開発サーバーのポート（デフォルト: 3000）
  output: "dist",      // 出力先フォルダ（デフォルト: "dist"）

  include: ["docs/**/*.ab"], // 対象ファイル（省略時は全 *.ab）
  exclude: ["node_modules/**", "dist/**"], // 除外パターン

  template: "docs/template.html" // デフォルトテンプレート（省略時は本文のみ出力）
};
```

### テンプレート機能
`.ab` ファイル内で個別にテンプレートを指定することも可能です：
- **相対パス**: `@template ../custom-tpl.html` （`.ab` ファイルからの相対パス）
- **絶対パス**: `@template /templates/base.html` （`ab.config.js` のあるプロジェクトルート起点）

テンプレート内では `{{content}}`（本文 HTML）や、`.ab` ファイル内のディレクティブで定義されたメタデータ（`{{title}}` など）が展開されます。

---

## テストの実行

```bash
# Docker 経由でのテスト実行
docker run --rm -v "$(pwd)":/app -w /app node npm test
```

---

*Built with the assistance of Gemini.*
