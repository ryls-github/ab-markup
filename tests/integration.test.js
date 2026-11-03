import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { compile } from "../src/compiler.js"

test("ab-markup-spec.ab の総合変換テスト", () => {
	const filePath = path.resolve(process.cwd(), "examples/ab-markup-spec.ab")
	const source = fs.readFileSync(filePath, "utf-8")
	const { html, metadata } = compile(source)

	// メタデータの抽出
	assert.strictEqual(metadata.title, "AB マークアップ言語 仕様書")

	// 外枠ラッパー（DOCTYPEやhtml, body）が含まれていない純粋な本文HTMLであること
	assert.doesNotMatch(html, /<!DOCTYPE html>/)
	assert.doesNotMatch(html, /<html/)
	assert.doesNotMatch(html, /<body/)

	// 主要要素のレンダリング
	assert.match(html, /<h1>AB \(At &amp; Bracket\) マークアップ言語 仕様書 \(Draft v0\.3\)<\/h1>/)
	assert.match(html, /<b>\.ab<\/b>/)
	assert.match(html, /<hr[\s>]/)
	assert.match(html, /<table/)
	assert.match(html, /<pre><code class="text">/)
})
