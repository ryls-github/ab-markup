import { test } from "node:test"
import assert from "node:assert/strict"
import { parseInline } from "../src/inline.js"
import { createRootContext } from "../src/scanner.js"

test("インライン構文の基本", () => {
	const ctx = createRootContext()
	assert.strictEqual(parseInline("これは [b]太字[/] です", ctx), "これは <b>太字</b> です")

	assert.strictEqual(
		parseInline("リンク: [a https://example.com]Example[/]", ctx),
		'リンク: <a href="https://example.com">Example</a>',
	)

	assert.strictEqual(
		parseInline("漢字 [^ かんじ]漢字[/] のルビ", ctx),
		"漢字 <ruby>漢字<rt>かんじ</rt></ruby> のルビ",
	)

	assert.strictEqual(parseInline("打ち消し: [d]古いテキスト[/]", ctx), "打ち消し: <del>古いテキスト</del>")
})

test("コードとリテラル保護", () => {
	const ctx = createRootContext()
	assert.strictEqual(
		parseInline('コード: [`]console.log("hello");[/]', ctx),
		"コード: <code>console.log(&quot;hello&quot;);</code>",
	)

	assert.strictEqual(
		parseInline("キー付き: [`:raw]文中に [/] を含む[/:raw]", ctx),
		"キー付き: <code>文中に [/] を含む</code>",
	)

	assert.strictEqual(
		parseInline("[b:foo]文中の [/:bar] は無視される[/:foo]", ctx),
		"<b>文中の [/:bar] は無視される</b>",
	)
})

test("エスケープの動作", () => {
	const ctx = createRootContext()
	assert.strictEqual(parseInline("ブラケット [[ と ]]", ctx), "ブラケット [ と ]")

	assert.strictEqual(
		parseInline('<script>alert("xss")</script> & "test"', ctx),
		"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;test&quot;",
	)
})

test("スマートスタイル構文", () => {
	const ctx = createRootContext()
	assert.strictEqual(
		parseInline("[s 14px #ff0000 b]テキスト[/]", ctx),
		'<span style="font-size:14px; color:#ff0000; font-weight:bold;">テキスト</span>',
	)

	assert.strictEqual(parseInline("[s c:marker]テキスト[/]", ctx), '<span class="marker">テキスト</span>')
})

test("インラインコメント", () => {
	const ctx = createRootContext()
	assert.strictEqual(parseInline("表示テキスト[] ここはコメント [/]表示続き", ctx), "表示テキスト表示続き")
})

test("構文エラーの検出", () => {
	const ctx = createRootContext()
	assert.throws(() => parseInline("[todo]不正なタグ[/]", ctx), /未定義のインラインタグ/)
	assert.throws(() => parseInline("開始タグなし[/]", ctx), /対応する開始タグがありません/)
	assert.throws(() => parseInline("[b]閉じ忘れ", ctx), /閉じられていないタグ/)
	assert.throws(() => parseInline("[b:foo]キー不一致[/:bar]", ctx), /閉じられていないタグ/)
})

test("カスタムインラインプラグインの登録と実行", async () => {
	const { register } = await import("../src/plugins.js")
	const { el } = await import("../src/utils/dom.js")

	// オブジェクト形式でのプラグイン定義・登録
	register({
		name: "badge",
		tag: "badge",
		inline(body, args) {
			return el("span", { class: `badge badge-${args.trim()}` }, body)
		},
	})

	const ctx = createRootContext()
	assert.strictEqual(parseInline("[badge success]完了[/]", ctx), '<span class="badge badge-success">完了</span>')
})

test("インライン [html] と [raw]", () => {
	const ctx = createRootContext()

	// [html] はエスケープなしでそのまま
	assert.strictEqual(parseInline('[html]<span class="badge">Raw</span>[/]', ctx), '<span class="badge">Raw</span>')

	// [raw] は構文無視・エスケープあり（[/] を含む場合はキー構文を使用）
	assert.strictEqual(parseInline("[raw:k][b]太字[/] & <script>[/:k]", ctx), "[b]太字[/] &amp; &lt;script&gt;")
})

test("改行を跨ぐ複数行インラインタグ (Consumerパターン)", async () => {
	const { compile } = await import("../src/compiler.js")

	// 基本的な複数行インラインタグ
	const src1 = `aa[b]1行目
2行目[/]aa`
	assert.strictEqual(compile(src1).html.trim(), "aa<b>1行目<br>\n2行目</b>aa")

	// タグ内部に @ から始まる行が含まれても誤爆せず吸い上げられること
	const src2 = `テキスト[b]1行目
@not-directive
3行目[/]テキスト`
	assert.strictEqual(compile(src2).html.trim(), "テキスト<b>1行目<br>\n@not-directive<br>\n3行目</b>テキスト")

	// 複数行インラインの後に続く通常行の改行制御
	const src3 = `[b]1行目
2行目[/]
3行目`
	assert.strictEqual(compile(src3).html.trim(), "<b>1行目<br>\n2行目</b><br>\n3行目")

	// タグ内部に @@ が含まれても解除されずにそのまま保持されること
	const src4 = `[b]1行目
@@escape
2行目[/]`
	assert.strictEqual(compile(src4).html.trim(), "<b>1行目<br>\n@@escape<br>\n2行目</b>")

	// 複数行インラインの後にブロックディレクティブが続く場合
	const src5 = `[b]1行目
2行目[/]

@# 見出し`
	assert.strictEqual(compile(src5).html.trim(), "<b>1行目<br>\n2行目</b>\n<h1>見出し</h1>")
})
