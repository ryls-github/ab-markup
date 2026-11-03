import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import { loadConfig } from "../src/config.js"
import { applyTemplate } from "../src/template.js"
import { matchesAny, build, buildFile } from "../src/builder.js"
import { serve } from "../src/server.js"
import { compileFile, watchFile } from "../src/watcher.js"

test("loadConfig: 設定ファイルが存在しない場合はエラー", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-config-test-"))
	try {
		await assert.rejects(async () => await loadConfig(tmpDir), /設定ファイルが見つかりません/)
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("loadConfig: 正常な設定読み込みとデフォルト値補完", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-config-test-"))
	try {
		const configContent = `export default {
  port: 8080,
  output: 'build',
  include: 'pages/**/*.ab'
};`
		fs.writeFileSync(path.join(tmpDir, "ab.config.js"), configContent, "utf-8")

		const config = await loadConfig(tmpDir)
		assert.strictEqual(config.host, "localhost")
		assert.strictEqual(config.port, 8080)
		assert.strictEqual(config.output, "build")
		assert.deepStrictEqual(config.include, ["pages/**/*.ab"])
		assert.ok(config.exclude.includes("node_modules/**"))
		assert.ok(config.exclude.includes("build/**"))
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("matchesAny の判定", () => {
	// *.ab は全階層の .ab にマッチ
	assert.strictEqual(matchesAny("test.ab", ["*.ab"]), true)
	assert.strictEqual(matchesAny("docs/test.ab", ["*.ab"]), true)
	assert.strictEqual(matchesAny("docs/sub/test.ab", ["*.ab"]), true)
	assert.strictEqual(matchesAny("test.txt", ["*.ab"]), false)

	// 指定ディレクトリ限定
	assert.strictEqual(matchesAny("docs/test.ab", ["docs/*.ab"]), true)
	assert.strictEqual(matchesAny("docs/sub/test.ab", ["docs/*.ab"]), false)
	assert.strictEqual(matchesAny("docs/sub/test.ab", ["docs/**/*.ab"]), true)

	// 除外パターン
	assert.strictEqual(matchesAny("node_modules/pkg/a.ab", ["node_modules/**"]), true)
	assert.strictEqual(matchesAny("dist/index.html", ["dist/**"]), true)
})

test("template: テンプレート解決と適用", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-template-test-"))
	try {
		const config = { rootDir: tmpDir, template: null }

		// 1. テンプレート指定なし -> そのまま出力
		const html1 = applyTemplate("<p>本文</p>", {}, path.join(tmpDir, "test.ab"), config)
		assert.strictEqual(html1, "<p>本文</p>")

		// 2. テンプレートファイル作成
		const rootTplPath = path.join(tmpDir, "root-tpl.html")
		fs.writeFileSync(
			rootTplPath,
			"<html><head><title>{{title}}</title></head><body>{{content}}</body></html>",
			"utf-8",
		)

		const subDir = path.join(tmpDir, "sub")
		fs.mkdirSync(subDir)
		const subTplPath = path.join(subDir, "sub-tpl.html")
		fs.writeFileSync(subTplPath, "<main>{{body}} - {{author}}</main>", "utf-8")

		// 3. @template /root-tpl.html (絶対パス: rootDir 起点)
		const htmlAbs = applyTemplate(
			"<h1>タイトル</h1>",
			{ template: "/root-tpl.html", title: "マイページ" },
			path.join(subDir, "doc.ab"),
			config,
		)
		assert.strictEqual(htmlAbs, "<html><head><title>マイページ</title></head><body><h1>タイトル</h1></body></html>")

		// 4. @template ./sub-tpl.html (相対パス: ab ファイルのディレクトリ起点)
		const htmlRel = applyTemplate(
			"<div>記事</div>",
			{ template: "./sub-tpl.html", author: "山田" },
			path.join(subDir, "doc.ab"),
			config,
		)
		assert.strictEqual(htmlRel, "<main><div>記事</div> - 山田</main>")

		// 5. テンプレートが見つからない場合はエラー
		assert.throws(() => {
			applyTemplate("<p>本文</p>", { template: "not-found.html" }, path.join(tmpDir, "doc.ab"), config)
		}, /テンプレートファイルが見つかりません/)
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("buildFile: 単一ファイルの処理（コンパイル・コピー・削除）", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-buildfile-test-"))
	try {
		const config = {
			rootDir: tmpDir,
			output: "dist",
			template: null,
		}

		// 1. .ab ファイルのコンパイル
		const abPath = path.join(tmpDir, "hello.ab")
		fs.writeFileSync(abPath, "こんにちは", "utf-8")
		const resAb = buildFile(abPath, config)
		assert.strictEqual(resAb.action, "compiled")
		assert.ok(fs.existsSync(resAb.dest))
		assert.strictEqual(fs.readFileSync(resAb.dest, "utf-8"), "こんにちは")

		// 2. 静的アセット（.css）のコピー
		const cssPath = path.join(tmpDir, "style.css")
		fs.writeFileSync(cssPath, "body { color: red; }", "utf-8")
		const resCss = buildFile(cssPath, config)
		assert.strictEqual(resCss.action, "copied")
		assert.ok(fs.existsSync(resCss.dest))
		assert.strictEqual(fs.readFileSync(resCss.dest, "utf-8"), "body { color: red; }")

		// 3. 元ファイル削除時の出力ファイル削除
		fs.rmSync(abPath)
		const resDel = buildFile(abPath, config)
		assert.strictEqual(resDel.action, "deleted")
		assert.ok(!fs.existsSync(resDel.dest))
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("builder: プロジェクト全体のビルド（.ab コンパイル & アセットコピー）", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-build-test-"))
	try {
		// テンプレート作成
		fs.writeFileSync(path.join(tmpDir, "base.html"), '<div class="wrapper">{{content}}</div>', "utf-8")

		// .ab ファイル作成
		const docsDir = path.join(tmpDir, "docs")
		fs.mkdirSync(docsDir, { recursive: true })
		fs.writeFileSync(path.join(tmpDir, "index.ab"), "@title ホーム\nトップページです。", "utf-8")
		fs.writeFileSync(path.join(docsDir, "about.ab"), "アバウトページです。", "utf-8")
		// 静的ファイル作成
		fs.writeFileSync(path.join(docsDir, "theme.css"), "body { margin: 0; }", "utf-8")

		const config = {
			rootDir: tmpDir,
			output: "dist",
			include: ["**/*.ab", "**/*.css"],
			exclude: ["node_modules/**", "dist/**", "base.html"],
			template: "base.html",
		}

		const builtFiles = build(config)
		const outDir = path.resolve(config.rootDir, config.output)

		assert.strictEqual(builtFiles.length, 3)
		assert.ok(fs.existsSync(path.join(outDir, "index.html")))
		assert.ok(fs.existsSync(path.join(outDir, "docs", "about.html")))
		assert.ok(fs.existsSync(path.join(outDir, "docs", "theme.css")))

		const indexHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf-8")
		assert.strictEqual(indexHtml, '<div class="wrapper">トップページです。</div>')
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("serve: 静的サーバーの配信と 404", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-serve-test-"))
	try {
		fs.writeFileSync(path.join(tmpDir, "index.ab"), "Hello Serve!", "utf-8")

		const config = {
			rootDir: tmpDir,
			host: "127.0.0.1",
			port: 39123,
			output: "dist",
			include: ["*.ab"],
			exclude: ["node_modules/**", "dist/**"],
			template: null,
		}

		const serverInstance = await serve(config)

		try {
			// / へのリクエスト -> index.html
			const resIndex = await new Promise((resolve, reject) => {
				http.get(`http://127.0.0.1:39123/`, (res) => {
					let data = ""
					res.on("data", (chunk) => (data += chunk))
					res.on("end", () => resolve({ status: res.statusCode, data, headers: res.headers }))
				}).on("error", reject)
			})

			assert.strictEqual(resIndex.status, 200)
			assert.strictEqual(resIndex.data, "Hello Serve!")
			assert.match(resIndex.headers["content-type"], /text\/html/)

			// 存在しないファイル -> 404
			const res404 = await new Promise((resolve, reject) => {
				http.get(`http://127.0.0.1:39123/missing.html`, (res) => {
					let data = ""
					res.on("data", (chunk) => (data += chunk))
					res.on("end", () => resolve({ status: res.statusCode, data }))
				}).on("error", reject)
			})

			assert.strictEqual(res404.status, 404)
		} finally {
			await serverInstance.close()
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("serve: 初回起動時に構文エラーがあってもサーバーが起動し、修正後に自動復旧する", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-serve-error-test-"))
	try {
		// 正常なファイルと構文エラーのファイルを作成
		fs.writeFileSync(path.join(tmpDir, "index.ab"), "正常トップページ", "utf-8")
		fs.writeFileSync(path.join(tmpDir, "broken.ab"), "[b]閉じられていないタグ", "utf-8")

		const config = {
			rootDir: tmpDir,
			host: "127.0.0.1",
			port: 39124,
			output: "dist",
			include: ["*.ab"],
			exclude: ["node_modules/**", "dist/**"],
			template: null,
		}

		const errors = []
		const rebuilds = []

		const serverInstance = await serve(config, {
			onError: (err, file) => errors.push({ err, file }),
			onRebuild: (info) => rebuilds.push(info),
		})

		try {
			// 1. 初回起動時にエラーがキャッチされていること
			assert.strictEqual(errors.length, 1)
			assert.match(errors[0].err.message, /閉じられていないタグがあります/)
			assert.strictEqual(path.basename(errors[0].file), "broken.ab")

			// 2. 正常なファイル（index.html）は配信されていること
			const resIndex = await new Promise((resolve, reject) => {
				http.get(`http://127.0.0.1:39124/`, (res) => {
					let data = ""
					res.on("data", (chunk) => (data += chunk))
					res.on("end", () => resolve({ status: res.statusCode, data }))
				}).on("error", reject)
			})

			assert.strictEqual(resIndex.status, 200)
			assert.strictEqual(resIndex.data, "正常トップページ")

			// 3. 壊れたファイルを修正して保存
			fs.writeFileSync(path.join(tmpDir, "broken.ab"), "[b]直った太字[/]", "utf-8")

			// デバウンス待機 (100ms + 余裕)
			await new Promise((resolve) => setTimeout(resolve, 250))

			assert.ok(rebuilds.length >= 1)

			// 4. 修正後のファイル（broken.html）が正常に配信されること
			const resBroken = await new Promise((resolve, reject) => {
				http.get(`http://127.0.0.1:39124/broken.html`, (res) => {
					let data = ""
					res.on("data", (chunk) => (data += chunk))
					res.on("end", () => resolve({ status: res.statusCode, data }))
				}).on("error", reject)
			})

			assert.strictEqual(resBroken.status, 200)
			assert.strictEqual(resBroken.data, "<b>直った太字</b>")
		} finally {
			await serverInstance.close()
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("compileFile: 単一 .ab ファイルのコンパイルとファイル出力", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-compile-test-"))
	try {
		const inputPath = path.join(tmpDir, "page.ab")
		const outputPath = path.join(tmpDir, "page.html")

		fs.writeFileSync(inputPath, "[b]太字[/]", "utf-8")

		const result = compileFile(inputPath, outputPath)

		assert.strictEqual(result.html, "<b>太字</b>")
		assert.ok(fs.existsSync(outputPath))
		assert.strictEqual(fs.readFileSync(outputPath, "utf-8"), "<b>太字</b>")
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})

test("watchFile: ファイル変更検知による自動再コンパイルとエラーハンドリング", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-watch-test-"))
	try {
		const inputPath = path.join(tmpDir, "live.ab")
		const outputPath = path.join(tmpDir, "live.html")

		fs.writeFileSync(inputPath, "初回テキスト", "utf-8")

		const events = []
		const errors = []

		const watcher = watchFile(inputPath, outputPath, {
			onSuccess: (info) => events.push(info),
			onError: (err) => errors.push(err),
		})

		try {
			// 初回コンパイルの検証
			assert.strictEqual(events.length, 1)
			assert.strictEqual(events[0].isInitial, true)
			assert.strictEqual(fs.readFileSync(outputPath, "utf-8"), "初回テキスト")

			// 1. 正常な更新
			fs.writeFileSync(inputPath, "更新テキスト", "utf-8")

			// デバウンス待機
			await new Promise((resolve) => setTimeout(resolve, 250))

			assert.strictEqual(events.length, 2)
			assert.strictEqual(events[1].isInitial, false)
			assert.strictEqual(fs.readFileSync(outputPath, "utf-8"), "更新テキスト")

			// 2. 構文エラーの更新（プロセスが落ちず onError が呼ばれることの検証）
			fs.writeFileSync(inputPath, "[b]閉じられていないタグ", "utf-8")

			await new Promise((resolve) => setTimeout(resolve, 250))

			assert.ok(errors.length >= 1)
			assert.match(errors[errors.length - 1].message, /閉じられていないタグがあります/)
			// エラー時は以前の出力ファイルが破壊されない（または最後の有効な状態が保たれる）
			assert.strictEqual(fs.readFileSync(outputPath, "utf-8"), "更新テキスト")

			// 3. 正常な修正による復旧
			fs.writeFileSync(inputPath, "[b]復旧太字[/]", "utf-8")

			await new Promise((resolve) => setTimeout(resolve, 250))

			assert.ok(events.length >= 3)
			assert.strictEqual(fs.readFileSync(outputPath, "utf-8"), "<b>復旧太字</b>")
		} finally {
			watcher.close()
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true })
	}
})
