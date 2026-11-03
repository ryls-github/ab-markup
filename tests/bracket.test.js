import { test } from "node:test"
import assert from "node:assert/strict"
import { compile } from "../src/compiler.js"

test("bracket: 2文字指定 (@bracket <>) によるインラインとブロックの切り替え", () => {
	const src = `@bracket <>

これは <b:test>太字</:test> です。
エスケープは << と >> です。

@note メモ <:mybox<
ブロック内でも <d>打ち消し</> が有効です。
>:mybox>`

	const { html, metadata } = compile(src)

	assert.strictEqual(metadata.bracket, undefined)
	assert.match(html, /<b>太字<\/b>/)
	assert.match(html, /エスケープは &lt; と &gt; です/)
	assert.match(html, /<aside class="note メモ">/)
	assert.match(html, /<del>打ち消し<\/del>/)
})

test("bracket: スペース区切り2要素指定 (@bracket (* *)) による切り替え", () => {
	const src = `@bracket (* *)

これは (*b*)強調(*/*) です。
エスケープは (*(* と *)*) です。

@note メモ (*(*
ブロック内です。
*)*)`

	const { html, metadata } = compile(src)

	assert.strictEqual(metadata.bracket, undefined)
	assert.match(html, /<b>強調<\/b>/)
	assert.match(html, /エスケープは \(\* と \*\) です/)
	assert.match(html, /<aside class="note メモ">/)
	assert.match(html, /ブロック内です。/)
})

test("bracket: 不正な指定での構文エラー", () => {
	// 1文字のみ
	assert.throws(() => compile("@bracket <"), /不正な @bracket 指定です/)

	// 3文字でスペースなし
	assert.throws(() => compile("@bracket <<<"), /不正な @bracket 指定です/)

	// 3要素
	assert.throws(() => compile("@bracket a b c"), /不正な @bracket 指定です/)

	// 引数なし
	assert.throws(() => compile("@bracket"), /不正な @bracket 指定です/)
})
