import { test } from "node:test"
import assert from "node:assert/strict"
import { compile } from "../src/compiler.js"

test("ブロック要素前後の空行が1行トリムされる", () => {
	const src = `本文1

@# 見出し

本文2`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), "本文1\n<h1>見出し</h1>\n本文2")
})

test("空行が2行ある場合は1行分がトリムされ1行の<br>が残る", () => {
	const src = `本文1


@# 見出し


本文2`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), "本文1<br>\n<br>\n<h1>見出し</h1>\n<br>\n本文2")
})

test("ブロック要素が連続する場合の空行トリム", () => {
	const src = `@# 見出し1

@# 見出し2`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), "<h1>見出し1</h1>\n<h1>見出し2</h1>")
})

test("テキスト間の単一改行は<br>になる", () => {
	const src = `1行目
2行目
3行目`
	const { html } = compile(src)
	assert.strictEqual(html.trim(), "1行目<br>\n2行目<br>\n3行目")
})
