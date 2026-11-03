import { test } from "node:test"
import assert from "node:assert/strict"
import { compile } from "../src/compiler.js"

test("見出し構文（単行形式と複数行ブロック形式）", () => {
	// 単行形式（インラインタグの展開含む）
	const singleSrc = `@# 大見出し
@## 中見出し
@### 小見出し
@# aa[b]bold[/]bb`
	const { html: singleHtml } = compile(singleSrc)
	assert.match(singleHtml, /<h1>大見出し<\/h1>/)
	assert.match(singleHtml, /<h2>中見出し<\/h2>/)
	assert.match(singleHtml, /<h3>小見出し<\/h3>/)
	assert.match(singleHtml, /<h1>aa<b>bold<\/b>bb<\/h1>/)

	// 複数行ブロック形式（クラス付与と改行<br>展開）
	const blockSrc = `@# c:title [[
第1行
第2行
]]`
	const { html: blockHtml } = compile(blockSrc)
	assert.strictEqual(blockHtml.trim(), '<h1 class="title">第1行<br>第2行</h1>')
})

test("コードブロック", () => {
	const src = `@\` js [[
const a = 1;
console.log(a < 2);
]]`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), '<pre><code class="js">const a = 1;\nconsole.log(a &lt; 2);</code></pre>')
})

test("リスト（モードA: マーカーあり）", () => {
	const src = `@list [[
- 項目1
	継続行です
	- 子項目1
- 項目2
]]`
	const { html } = compile(src)
	assert.match(html, /<ul><li>項目1<br>継続行です<ul><li>子項目1<\/li><\/ul><\/li><li>項目2<\/li><\/ul>/)
})

test("リスト（モードB: 改行区切り）", () => {
	const src = `@list [[
リンゴ
ゴリラ
ラッパ
]]`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), "<ul><li>リンゴ</li><li>ゴリラ</li><li>ラッパ</li></ul>")
})

test("テーブル", () => {
	const src = `@table , hr:1 c:price-table [[
商品,価格
リンゴ,150円
]]`
	const { html } = compile(src)
	assert.strictEqual(
		html.trim(),
		'<table class="price-table"><thead><tr><th>商品</th><th>価格</th></tr></thead><tbody><tr><td>リンゴ</td><td>150円</td></tr></tbody></table>',
	)
})

test("コールアウトとノート", () => {
	const src = `@! warn [[
注意メッセージ
]]`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), '<aside class="callout warn">注意メッセージ</aside>')
})

test("キー構文を用いたブロックのネスト（改行クローズ・同一行複数クローズ）", () => {
	// 改行して個別に閉じるパターン
	const src1 = `@note 補足 [:box[
注意メッセージ

@\` ts [[
const x = 1;
]]
]:box]`
	const res1 = compile(src1)
	assert.match(res1.html, /<aside class="note 補足">/)
	assert.match(res1.html, /<pre><code class="ts">const x = 1;<\/code><\/pre>/)

	// 同一行で連続して閉じるパターン (]] ]:box])
	const src2 = `@note 補足 [:box[
注意メッセージ

@\` ts [[
const x = 1;
]] ]:box]`
	const res2 = compile(src2)
	assert.match(res2.html, /<aside class="note 補足">/)
	assert.match(res2.html, /<pre><code class="ts">const x = 1;<\/code><\/pre>/)

	// 本文中のスペース付き ]] や行末の ]] がブロック終了と誤認されないこと
	const src3 = `@note [[
ブロックは @tag [[ ... ]] で定義します。
行末にスペース付き ]]
通常の文章です。
]]`
	const res3 = compile(src3)
	assert.match(
		res3.html,
		/ブロックは @tag \[ \.\.\. \] で定義します。<br>\n行末にスペース付き \]<br>\n通常の文章です。/,
	)
})

test("水平線と単行コメント", () => {
	const src = `テキスト1
@ これはコメント
@-
テキスト2
@--
テキスト3
@---
テキスト4
@---- c:dashed`
	const { html } = compile(src)
	assert.strictEqual(
		html.trim(),
		'テキスト1\n<hr>\nテキスト2\n<hr class="hr-2">\nテキスト3\n<hr class="hr-3">\nテキスト4\n<hr class="hr-4 dashed">',
	)
})

test("属性定義ブロック (@attr) の定義と参照展開（コメント、空グループ、複数ブロック結合）", () => {
	const src = `@attr [[
# コメント行
intro:
	id = intro
	data-role = main-header

ext:
	target = "_blank"
	rel = "noopener noreferrer"

qux:
]]

@attr [[
other:
  val = 'abc'
]]

@# c:chapter a:intro [[
はじめに
]]

@# a:other [[
その他
]]

[a a:ext https://example.com]外部サイト[/]

@list a:intro [[
- 項目1
]]

@\` js a:intro [[
console.log(1);
]]`

	const { html, metadata } = compile(src)

	// 見出しへの属性展開（クラスとの共存・クオートなし）
	assert.match(html, /<h1 class="chapter" id="intro" data-role="main-header">はじめに<\/h1>/)
	// クオート付き属性の展開
	assert.match(html, /<h1 val="abc">その他<\/h1>/)
	// インラインリンクへの展開
	assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">外部サイト<\/a>/)
	// リストおよびコードブロックへの展開
	assert.match(html, /<ul id="intro" data-role="main-header">/)
	assert.match(html, /<code class="js" id="intro" data-role="main-header">/)

	// 内部データ構造（複数ブロックのマージ結果）の検証
	assert.deepStrictEqual(metadata.attrDefs.intro, [
		{ key: "id", value: "intro" },
		{ key: "data-role", value: "main-header" },
	])
	assert.deepStrictEqual(metadata.attrDefs.qux, [])
	assert.deepStrictEqual(metadata.attrDefs.other, [{ key: "val", value: "abc" }])
})

test("属性定義ブロック (@attr) のエラー検出", () => {
	// class 属性の指定は禁止
	assert.throws(() => {
		compile(`@attr [[
bad:
	class = forbidden
]]`)
	}, /class 属性は指定できません/)

	// グループ名なしで属性定義
	assert.throws(() => {
		compile(`@attr [[
	id = orphan
]]`)
	}, /グループ名が宣言されていません/)

	// = のない不正な行
	assert.throws(() => {
		compile(`@attr [[
foo:
	invalid line
]]`)
	}, /key = value 形式で指定してください/)

	// 最初の有効行がグループ宣言（末尾:）でない場合
	assert.throws(() => {
		compile(`@attr [[
# コメント
invalid_start
]]`)
	}, /グループ名が宣言されていません/)

	// インデント文字列プレフィックスの不整合（基準行と異なる種類のインデント）によるエラー検出
	assert.throws(() => {
		compile(`@attr [[
	foo:
    bar = baz
]]`)
	}, /@attr 内の書式が不正です/)

	// 基準行と同じ深さで = がある場合のエラー検出
	assert.throws(() => {
		compile(`@attr [[
  foo:
  bar = baz
]]`)
	}, /@attr 内の書式が不正です/)
})

test("行頭のエスケープ (@@)", () => {
	const src = `@@行頭のアットマーク
@@## 見出しではなく通常のテキスト`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), "@行頭のアットマーク<br>\n@## 見出しではなく通常のテキスト")
})

test("未定義ディレクティブの構文エラー検出（タイポ検出）", () => {
	// スペース抜けの見出しタイポ
	assert.throws(() => {
		compile("@#見出し")
	}, /未定義のディレクティブです: @#見出し/)

	// 存在しない見出しレベル
	assert.throws(() => {
		compile("@#h1 大見出し")
	}, /未定義のディレクティブです: @#h1/)

	// 未定義の単行ディレクティブ
	assert.throws(() => {
		compile("@unknown-tag 引数")
	}, /未定義のディレクティブです: @unknown-tag/)
})

test("基本メタデータディレクティブ (@title, @date, @tags, @template)", () => {
	const src = `@title サンプル文書
@date 2026-11-02
@tags markup, sample
@template ./custom-layout.html

@# 見出し

本文テキスト`

	const { html, metadata } = compile(src)
	assert.strictEqual(metadata.title, "サンプル文書")
	assert.strictEqual(metadata.date, "2026-11-02")
	assert.strictEqual(metadata.tags, "markup, sample")
	assert.strictEqual(metadata.template, "./custom-layout.html")
	assert.strictEqual(html.trim(), "<h1>見出し</h1>\n本文テキスト")
})

test("@html ブロックによる生のHTML出力", () => {
	const src = `@html [[
<div class="custom-widget" data-id="123">
  <p>Raw HTML Content & Special Chars: < > &</p>
</div>
]]`

	const { html } = compile(src)
	assert.strictEqual(
		html.trim(),
		`<div class="custom-widget" data-id="123">\n  <p>Raw HTML Content & Special Chars: < > &</p>\n</div>`,
	)
})

test("@raw ブロックによる構文無視テキスト出力", () => {
	const src = `@raw [[
ここでは [b]太字[/] や [a https://example.com]リンク[/] は解釈されず、
<script>alert(1)</script> は安全にエスケープされます。
]]`

	const { html } = compile(src)
	assert.match(html, /\[b\]太字\[\/\]/)
	assert.match(html, /\[a https:\/\/example\.com\]リンク\[\/\]/)
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
	assert.doesNotMatch(html, /<script>/)
})

test("@style ブロックのCSS出力と安全なエスケープ", () => {
	const src = `@style [[
div > p { color: red; }
.content { font-family: "Helvetica", sans-serif; }
/* 危険なタグ終了の試み */
</style><script>alert(1)</script>
]]`

	const { html } = compile(src)
	// CSSのセレクタ記号 (>) やクオート (") はエスケープされずにそのまま保持されること
	assert.match(html, /div > p \{ color: red; \}/)
	assert.match(html, /"Helvetica", sans-serif/)

	// </style> は <\/style> にエスケープされ、意図しないタグ終了を防ぐこと
	assert.match(html, /<\\\/style><script>alert\(1\)<\/script>/)
	assert.doesNotMatch(html, /<\/style><script>/)
})
