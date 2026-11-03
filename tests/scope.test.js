import { test } from "node:test"
import assert from "node:assert/strict"
import { compile } from "../src/compiler.js"
import { registry } from "../src/plugins.js"

test("scope: ブロック内での @bracket 切り替えがブロック内に閉じること", () => {
	const src = `外側は [b]太字[/]

@t div [[
@bracket <>
div内は <s red>赤字</> です
]]

外側に戻ると再び [d]打ち消し[/] が有効で <s red>タグ</> はエスケープされる`

	const { html } = compile(src)

	assert.match(html, /外側は <b>太字<\/b>/)
	assert.match(html, /<div>\s*div内は <span style="color:red;">赤字<\/span> です\s*<\/div>/)
	assert.match(html, /外側に戻ると再び <del>打ち消し<\/del> が有効で &lt;s red&gt;タグ&lt;\/&gt; はエスケープされる/)
})

test("scope: ブロック内での @attr 定義がブロック内に閉じ、親の attrDefs を継承すること", () => {
	const src = `@attr [[
global:
	target = _blank
]]

[a a:global https://example.com]トップレベルリンク[/]

@t div [:box[
@attr [[
local:
	rel = nofollow
]]
親の属性: [a a:global https://parent.com]親[/]
ローカル属性: [a a:local https://child.com]子[/]
]:box]

外側では global は有効: [a a:global https://example.com]グローバル[/]
外側では local は未定義扱い: [a a:local https://example.com]未定義[/]`

	const { html } = compile(src)

	// トップレベルで global が使える
	assert.match(html, /<a href="https:\/\/example\.com" target="_blank">トップレベルリンク<\/a>/)
	// div 内で global が継承され、local も使える
	assert.match(html, /親の属性: <a href="https:\/\/parent\.com" target="_blank">親<\/a>/)
	assert.match(html, /ローカル属性: <a href="https:\/\/child\.com" rel="nofollow">子<\/a>/)
	// div を抜けた後、global は有効だが local は使えない
	assert.match(html, /外側では global は有効: <a href="https:\/\/example\.com" target="_blank">グローバル<\/a>/)
	assert.match(html, /外側では local は未定義扱い: <a href="https:\/\/example\.com">未定義<\/a>/)
})

test("scope: ブロック内で既存グループと同名で再定義しても親のグループは汚染されないこと", () => {
	const src = `@attr [[
btn:
	title = 親ボタン
	data-level = 1
]]

親: [a a:btn https://example.com]親[/]

@t div [:inner[
@attr [[
btn:
	title = 子ボタン
]]
子: [a a:btn https://example.com]子[/]
]:inner]

親復帰: [a a:btn https://example.com]親復帰[/]`

	const { html } = compile(src)

	assert.match(html, /親: <a href="https:\/\/example\.com" title="親ボタン" data-level="1">親<\/a>/)
	// 子では title が置き換わり、丸ごと上書きなので data-level は存在しない
	assert.match(html, /子: <a href="https:\/\/example\.com" title="子ボタン">子<\/a>/)
	// 親に戻ると元の title と data-level がそのまま復帰している
	assert.match(html, /親復帰: <a href="https:\/\/example\.com" title="親ボタン" data-level="1">親復帰<\/a>/)
})

test("scope: ブロック内でのメタデータ設定がブロック内に閉じ、親の metadata には漏れないこと", () => {
	// プラグイン内部で context.metadata を参照するカスタムブロックプラグイン
	registry.register({
		name: "card",
		tag: "card",
		block: (body, args, context) => {
			const content = context.render(body)
			const title = context.metadata.title || "Default Title"
			return `<div class="card"><h3>${title}</h3>${content}</div>`
		},
	})

	const src = `@title 全体タイトル

@card [[
@title カードのタイトル
カードの本文テキスト
]]

外側の本文`

	const { html, metadata } = compile(src)

	// 全体メタデータは '全体タイトル' のまま上書きされない
	assert.strictEqual(metadata.title, "全体タイトル")

	// card プラグインはブロック内のメタデータを取得して HTML に反映できている
	assert.match(html, /<div class="card"><h3>カードのタイトル<\/h3>カードの本文テキスト<\/div>/)
	assert.match(html, /外側の本文/)
})

test("scope: ネストしたブロックでの階層的スコープ分離", () => {
	const src = `@t div [:outer[
@bracket <>
outer は <b:o>太字</:o>

@t section <:inner<
@bracket (* *)
inner は (*b:i*)内側太字(*/:i*)
>:inner>

outer に戻ると <d:o>打ち消し</:o> が有効
]:outer]

最外側は [b]元のブラケット[/]`

	const { html } = compile(src)

	assert.match(html, /outer は <b>太字<\/b>/)
	assert.match(html, /inner は <b>内側太字<\/b>/)
	assert.match(html, /outer に戻ると <del>打ち消し<\/del> が有効/)
	assert.match(html, /最外側は <b>元のブラケット<\/b>/)
})
