# AB マークアップ言語 実装方針・アーキテクチャ設計書

本ドキュメントは、軽量マークアップ言語「AB (`.ab`)」のパーサー、コンパイラ、CLI ツールチェーンにおけるアーキテクチャ設計、設計思想、機能仕様、およびコードベース構造を記録したものです。別エージェントがプロジェクトを引き継ぎ、拡張・保守を行うための完全なリファレンスとして機能します。

---

## 1. プロジェクト概要 & 設計哲学

### 理念
AB は、日本語の執筆体験に最適化された軽量マークアップ言語です。
従来の Markdown が抱える「日本語に密着した装飾の誤爆」「全角スペースや意図しない改行の扱い」「エスケープの煩雑さ」を解消し、自然な日本語入力と決定論的な構文解析を両立します。

### 基本方針
1. **ゼロ依存（Zero Dependencies）**:
   - 外部 npm パッケージを一切使用せず、Node.js 標準モジュール（`node:fs`, `node:path`, `node:http`, `node:url`, `node:test`, `node:assert/strict`）のみで完全動作。
2. **モダン環境前提（Node.js v22+ / v24+ / v26+）**:
   - `RegExp.escape` などの標準ネイティブ機能を活用し、ポリフィルや古い環境向けの互換レイヤーは作成しない。
3. **一貫したコードスタイル**:
   - すべての関数宣言はアロー関数（`const fn = (...) => {}`）で統一し、`function` キーワードは使用しない。
4. **1パス走査による超高速解析**:
   - 中間 AST（構文木）を構築せず、行スキャン・インラインパースとプラグインディスパッチを一体化した完全1パスストリーミング型アーキテクチャ。
5. **決定論的パースと自然な改行**:
   - 非対称ブラケット記法（`[...]...[/]`）、二重化エスケープ（`[[`, `]]`, `@@`）、ブロック要素前後の空行自動トリムにより、直感的かつ誤作動のないレンダリングを実現。

---

## 2. システムアーキテクチャ

パーサーの全体パイプラインは以下の通りです。

```
[AB ソーステキスト]
        │
        ▼
[compiler.js (compile)] ── メタデータコンテキストの初期化
        │
        ▼
[scanner.js (scanAndRender)] ── createReader による改行正規化・行リーダー生成と1パス走査
   ├── 空行の連続性判定 & 自然な改行（<br>）制御 / ブロック前後の空行自動トリム
   ├── @ ディレクティブ判定 (parseDirective)
   │     ├── 単行ディレクティブ ──> プラグイン実行 (renderDirective)
   │     └── 複数行ブロック ──> 終了デリミタまで即座に行吸い上げ (checkBlockClose) ──> プラグイン実行 (renderBlock)
   └── 通常テキスト行 (@@ エスケープ解除: @@ -> @)
         │
         ▼
[inline.js (parseInline)] ── インライン・ステートマシン（Consumer 連携）
   ├── 二重化エスケープ解除 ([[ -> [, ]] -> ])
   ├── HTML 特殊文字サニタイズ (< -> &lt;, > -> &gt;, & -> &amp;, " -> &quot;)
   └── タグヘッダー解析 (parseTagHeader) ──> 閉じタグまで reader から行吸い上げ ──> インラインプラグイン (b, d, a, s, t 等)
```

---

## 3. コンテキストとレキシカルスコープモデル

ブロックおよびインラインの処理において、親の設定を継承しつつ局所的な変更を内部に閉じる**レキシカルスコープ（ブロックスコープ）**を採用しています。

### スコープチェーン構造 (`parent` / `root`)
* **ルートコンテキスト (`rootContext`)**:
  * 文書のトップレベルで生成され、`parent: null`, `root: rootContext` を保持。
  * 文書全体で有効なメタデータ（`metadata`）、属性定義（`attrDefs`）、デリミタ設定（`delimiters`）を管理。
  * `render`, `renderInline`, `renderNested` の実行関数群を提供。
* **子コンテキスト (`childContext`)**:
  * ブロック実行（`renderBlock`）やインラインタグ実行（`processInlineTag`）ごとに生成。
  * `parent: parentContext`, `root: parentContext.root` により階層チェーンを保持。
  * **`metadata` と `attrDefs` のプロトタイプ継承**:
    ```javascript
    const childMetadata = Object.create(parentContext.metadata)
    const childAttrDefs = Object.create(parentContext.attrDefs)
    childMetadata.attrDefs = childAttrDefs
    ```
    親の設定を透過的に参照でき、子スコープで値を代入しても親を一切汚染しません。

### スコープ内での動作ルール
1. **デリミタ切り替え (`@bracket`)**:
   * ブロック内部で `@bracket <>` を呼ぶと、そのブロックの `context.delimiters` のみが変更され、ブロック終了後は自動的に親のデリミタに戻る。
2. **属性定義ブロック (`@attr`)**:
   * 親スコープの属性辞書（`context.parent.metadata.attrDefs`）に属性グループをマージする。
   * 子スコープ内で同名グループを定義しても、プロトタイプ継承により親スコープは汚染されない。
3. **メタデータディレクティブ (`@title`, `@date`, `@tags`, `@template`)**:
   * メタデータディレクティブは現在のスコープの `context.metadata` に格納される。
   * ブロック内部で指定された場合も子スコープに閉じ、トップレベルの `compile().metadata` には漏れない。
4. **未定義ディレクティブの厳格なエラー検出**:
   * 未登録のディレクティブ（タイポ等）や未完結のタグは構文エラー（`SyntaxError`）をスローする。

---

## 4. プロジェクト・フォルダ構成

各ディレクトリの責務と主要な構成は以下の通りです（主要ファイルのみ抜粋）。

```
ab/
├── (ルート)                     # 設定、パッケージ定義、CLI エントリーポイント
│   ├── ab.js                  # CLI エントリーポイント (build, serve, 単体変換 -w)
│   ├── ab.config.js           # プロジェクト設定ファイル (include, output, template 等)
│   ├── package.json           # パッケージ定義 (type: module, ゼロ外部依存)
│   └── ...
├── src/                       # コアエンジン・ツールチェーン実装
│   ├── compiler.js            # compile(source) エントリーポイント
│   ├── scanner.js             # 行走査、ディレクティブ解析、空行トリム・改行制御
│   ├── inline.js              # インラインタグ解析、エスケープ解決、Consumer 行吸い上げ
│   ├── plugins.js             # プラグインレジストリ (register, get, getInline)
│   ├── builder.js             # プロジェクト一括ビルド、glob 判定、静的アセット同期
│   ├── server.js              # 開発用 HTTP サーバー、差分/フル自動リビルド
│   ├── watcher.js             # 単一ファイルのコンパイル (compileFile) および監視 (watchFile)
│   ├── template.js            # HTML テンプレート解決と {{content}}, {{metadata}} 展開
│   ├── config.js              # 設定ファイルの非同期読み込みとデフォルト値補完
│   ├── utils/                 # 共通ユーティリティ
│   │   ├── dom.js             # 仮想 DOM (el) および HTML シリアライザ (renderHtml)
│   │   └── escape.js          # escapeHtml, parseAttrsAndArgs
│   └── plugins/               # 組み込みプラグイン群
│       ├── basic.js           # 基本装飾 ([b], [d], [a], [t], [^], [*], [`]), 見出し, コールアウト, 生HTML/Raw 等
│       ├── list.js            # リスト (@list, @numlist)
│       ├── table.js           # テーブル (@table)
│       ├── style.js           # スマートスタイル ([s])
│       ├── attr.js            # 属性定義辞書 (@attr)
│       └── bracket.js         # デリミタ切り替え設定 (@bracket)
├── docs/                      # 仕様書・設計書・開発ガイドライン
│   ├── ab-markup-spec.ab      # AB 言語仕様書ソース
│   ├── ab-markup-spec.md      # 言語仕様書 Markdown 版
│   ├── implementation-plan.md # 本設計書
│   └── agent-guidelines.md    # エージェント向け開発・設計ガイドライン
├── examples/                  # サンプルAB文書およびHTMLテンプレート
│   ├── template.html          # サンプル用 HTML テンプレート
│   └── ...
├── tests/                     # 自動テストスイート (node:test, 全48テスト)
│   ├── integration.test.js    # 仕様書の完全変換総合テスト
│   ├── blocks.test.js         # ブロック要素、キー構文ネスト、@attr テスト
│   ├── inline.test.js         # インライン構文、エスケープ、スマートスタイル
│   ├── trim.test.js           # 空行トリムロジックの網羅的検証
│   ├── bracket.test.js        # @bracket によるデリミタ切り替えテスト
│   ├── scope.test.js          # ブロックスコープ、継承、プロトタイプ分離のテスト
│   └── cli.test.js            # config, template, builder, serve, watcher のテスト
└── dist/                      # ビルド成果物の出力先ディレクトリ
    └── ...
```

---

## 5. 主要な構文と機能仕様

### インライン構文
* **非対称ブラケット記法**: `[tag 引数]本文[/]`
* **複数行インライン対応**: Consumer パターンにより、閉じタグ（`[/]`）が出現するまで後続行を貪欲に吸い上げ（タグ内の改行は `<br>\n` に変換）。
* **キー構文（ネスト対応）**: `[tag:key]...[/:key]`
* **二重化エスケープ**: `[[` → `[`, `]]` → `]`, `@@` → `@`
* **スマートスタイル (`[s]`)**:
  * `[s 14px #ff0000 b]テキスト[/]` → `<span style="font-size:14px; color:#ff0000; font-weight:bold;">テキスト</span>`
  * サイズ（`px`, `em`, `rem` 等）、カラー（HEX、基本色名）、`b`（太字）を順不同で自動解釈。
* **インラインコメント**: `[]コメント[/]` または `[:key]コメント[/:key]` → HTML 出力なし。
* **ルビ (`[^]`)**: `[^ 読み]漢字[/]` → `<ruby>漢字<rt>読み</rt></ruby>`
* **メディア埋め込み (`[*]`)**:
  * `[* URL]キャプション[/]`
  * 動画拡張子（`.mp4`, `.webm` 等）は `<video src="..." controls>キャプション</video>`、画像は `<img src="..." alt="キャプション">` を自動判別。
* **生 HTML / Raw テキスト**:
  * `[html]<b>生HTML</b>[/]` → エスケープせずそのまま出力。
  * `[raw]<b>エスケープテキスト</b>[/]` → AB構文を無視し HTML 特殊文字をエスケープして出力。
* **汎用 HTML タグ (`[t]`)**:
  * `[t c:badge span]テキスト[/]` → 任意の HTML タグ名とクラス/属性を指定可能（デフォルトは `span`）。

### ブロック構文
* **複数行ブロック**:
  ```ab
  @tag 引数 [[
  行1
  行2
  ]]
  ```
* **ブロックのネスト（キー構文）**:
  ```ab
  @box:outer [:outer[
  外側テキスト
  @box:inner [:inner[
  内側テキスト
  ]:inner]
  ]:outer]
  ```
* **単行ディレクティブ**: `@tag 引数または本文`（改行を伴わず即座に実行）。
* **見出し (@#, @##, @###)**:
  * 単行形式 `@# 見出し`、ブロック形式 `@# [[ 見出し ]]` の双方をサポート。
* **コードブロック (@`)**:
  * @` lang [[ ... ]] → `<pre><code class="lang">...</code></pre>`
* **リスト (@list, @numlist)**:
  * モードA（マーカーあり: `- `, `* `, `1. `）とモードB（改行区切り）を自動判別。
  * タブ文字（`\t`）による階層ネストに対応。
* **テーブル (@table)**:
  * 区切り文字（デフォルト `,`、`\t` 等）、ヘッダー行数（`hr:N`）、ヘッダー列数（`hc:N`）に対応し `<thead>` / `<tbody>` を生成。
* **コールアウト / ノート (@!, @note)**:
  * `@! [[ ... ]]` → `<aside class="callout">...</aside>`
  * `@note [[ ... ]]` → `<aside class="note">...</aside>`
* **水平線 (@-, @--, @---, @----)**:
  * 複数ハイフンの場合、本数に応じたクラス（`hr-2`, `hr-3`, `hr-4`）を自動付与。
* **スタイルブロック (@style)**:
  * CSS 構文内の `>` や `&` を壊さず、`</style>` のみ `<\\/style` に安全にエスケープして `<style>` タグを出力。
* **空行トリムロジック**:
  * ブロック要素前後の空行は、可読性のための改行として1行分が自動トリムされる。
  * 空行が2行連続する場合は、1行分がトリムされて `<br>` が1つ残る。
  * 通常テキスト間の単一改行は、そのまま `<br>` に変換される。

### 属性定義ブロック (`@attr`)
* `a:groupname` で参照可能な属性辞書を定義。
* `c:classname` によるクラス指定も併用可能。
  ```ab
  @attr [[
  btn:
  	role = button
  	tabindex = 0
  ]]

  [t c:primary a:btn button]ボタン[/]
  ```

### デリミタ切り替え (`@bracket`)
* デフォルトの `[` と `]` を任意の文字に変更可能。
* 2文字指定: `@bracket <>`（インライン `<tag>...</>`, ブロック `@tag << ... >>`）
* 2要素指定: `@bracket (* *)`（インライン `(*tag*)...(*/*)`, ブロック `@tag (*(* ... *)*)`）

---

## 6. CLI ツールチェーン

`node ab.js`（または `npm run ...`）で利用可能なコマンド一覧：

1. **プロジェクト一括ビルド (`ab build`)**:
   * `ab.config.js` を読み込み、`include` にマッチするファイルをコンパイル。
   * 静的アセット（画像、CSS等）はそのまま出力先にコピー。
   * 元ファイルが削除された場合、出力先の対応ファイルも自動削除。
2. **開発サーバー (`ab serve`)**:
   * 内蔵 HTTP サーバーを起動し成果物を配信（MIMEタイプ自動判別、拡張子補完、パストラバーサル防止）。
   * `fs.watch` による自動リビルド（`template` 変更時はフルリビルド、それ以外は変更ファイルのみ差分リビルド）。
   * 起動時や監視中に構文エラーが発生してもサーバープロセスは終了せず、エラーを出力して次の修正保存を待機。
3. **単体ファイルコンパイル & 監視 (`ab <file.ab> [-o out.html] [-w]`)**:
   * 単一の `.ab` ファイルを即座にコンパイル。
   * `-w`（`--watch`）指定時、親ディレクトリを監視し、ファイル保存時（atomic write に対応）に自動再コンパイル。

---

## 7. テストと動作検証

Node.js 標準のテストランナー（`node:test`）により全テストスイートを実行します。

```bash
# 全テストの実行
docker run --rm -v "$(pwd)":/app -w /app node npm test

# 仕様書 HTML の一括ビルド確認
docker run --rm -v "$(pwd)":/app -w /app node npm run build
```

---

*Built with the assistance of Gemini.*
