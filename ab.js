#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { loadConfig } from "./src/config.js"
import { build } from "./src/builder.js"
import { serve } from "./src/server.js"
import { compileFile, watchFile } from "./src/watcher.js"

const printUsage = () => {
	console.log(`AB Markup Toolchain

使い方:
  node ab.js <command> [options]
  node ab.js <file.ab> [options]

コマンド:
  build                   ab.config.js を読み込み、プロジェクトを出力先フォルダへビルド
  serve                   開発用 HTTP サーバーを起動し、ファイル変更を監視して自動リビルド

単体コンパイル:
  node ab.js <file.ab> [options] 指定した .ab ファイルを HTML へ変換

オプション:
  -o, --out <file.html>   単体コンパイル時の出力先ファイル（省略時は同名 .html）
  -w, --watch             単体コンパイル時に入力ファイルの変更を監視して自動再コンパイル
  -h, --help              ヘルプを表示
`)
}

const handleBuild = async () => {
	try {
		const config = await loadConfig()
		console.log(`設定を読み込みました: ${path.resolve(config.rootDir, "ab.config.js")}`)
		const builtFiles = build(config)
		console.log(`✓ ビルド完了: ${builtFiles.length} 件のファイルを ${config.output} に出力しました。`)
		for (const f of builtFiles) {
			const srcRel = path.relative(config.rootDir, f.src)
			const destRel = path.relative(config.rootDir, f.dest)
			console.log(`  - [${f.action}] ${srcRel} -> ${destRel}`)
		}
	} catch (err) {
		console.error(`[ビルドエラー] ${err.message}`)
		process.exit(1)
	}
}

const handleServe = async () => {
	try {
		const config = await loadConfig()
		console.log(`設定を読み込みました: ${path.resolve(config.rootDir, "ab.config.js")}`)
		await serve(config, {
			onStart: ({ host, port, builtFiles }) => {
				console.log(`✓ 初回ビルド完了: ${builtFiles.length} 件のファイルを ${config.output} に出力しました。`)
				console.log(`\n開発サーバー起動中: http://${host}:${port}/`)
				console.log("ファイルの変更を監視しています...\n")
			},
			onRebuild: ({ isFull, results }) => {
				const mode = isFull ? "フルリビルド" : "差分リビルド"
				console.log(`[変更検知] ${mode}完了 (${results.length} 件):`)
				for (const f of results) {
					const srcRel = path.relative(config.rootDir, f.src)
					console.log(`  - [${f.action}] ${srcRel}`)
				}
			},
			onError: (err, filePath) => {
				const timeStr = `[${new Date().toLocaleTimeString()}]`
				const fileRel = filePath ? path.relative(config.rootDir, filePath) : null
				const prefix = fileRel ? ` ${fileRel}:` : ""
				if (err instanceof SyntaxError) {
					console.error(`✗ ${timeStr} [構文エラー]${prefix} ${err.message}`)
				} else {
					console.error(`✗ ${timeStr} [エラー]${prefix} ${err.message}`)
				}
			},
		})
	} catch (err) {
		console.error(`[サーバーエラー] ${err.message}`)
		process.exit(1)
	}
}

const handleSingleFile = (args) => {
	let inputFile = null
	let outputFile = null
	let isWatch = false

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg === "-o" || arg === "--out") {
			outputFile = args[++i]
		} else if (arg === "-w" || arg === "--watch") {
			isWatch = true
		} else if (!arg.startsWith("-")) {
			if (!inputFile) {
				inputFile = arg
			}
		}
	}

	if (!inputFile) {
		console.error("エラー: 入力ファイルが指定されていません。")
		printUsage()
		process.exit(1)
	}

	const resolvedInputPath = path.resolve(process.cwd(), inputFile)
	if (!fs.existsSync(resolvedInputPath)) {
		console.error(`エラー: ファイルが見つかりません: ${inputFile}`)
		process.exit(1)
	}

	if (!outputFile) {
		if (resolvedInputPath.endsWith(".ab")) {
			outputFile = resolvedInputPath.slice(0, -3) + ".html"
		} else {
			outputFile = resolvedInputPath + ".html"
		}
	} else {
		outputFile = path.resolve(process.cwd(), outputFile)
	}

	const inRel = path.relative(process.cwd(), resolvedInputPath)
	const outRel = path.relative(process.cwd(), outputFile)

	if (isWatch) {
		watchFile(resolvedInputPath, outputFile, {
			onSuccess: ({ isInitial }) => {
				const timeStr = `[${new Date().toLocaleTimeString()}]`
				const action = isInitial ? "変換完了" : "再変換完了"
				console.log(`✓ ${timeStr} ${action}: ${inRel} -> ${outRel}`)
				if (isInitial) {
					console.log(`\n${inRel} の変更を監視しています... (Ctrl+C で終了)\n`)
				}
			},
			onError: (err) => {
				const timeStr = `[${new Date().toLocaleTimeString()}]`
				if (err instanceof SyntaxError) {
					console.error(`✗ ${timeStr} [構文エラー] ${inRel}: ${err.message}`)
				} else {
					console.error(`✗ ${timeStr} [実行エラー] ${err.message}`)
				}
			},
		})
	} else {
		try {
			compileFile(resolvedInputPath, outputFile)
			console.log(`✓ 変換完了: ${inputFile} -> ${outRel}`)
		} catch (err) {
			if (err instanceof SyntaxError) {
				console.error(`[構文エラー] ${inputFile}: ${err.message}`)
				process.exit(2)
			} else {
				console.error(`[実行エラー] ${err.message}`)
				process.exit(1)
			}
		}
	}
}

const main = async () => {
	const args = process.argv.slice(2)

	if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
		printUsage()
		process.exit(args.length === 0 ? 1 : 0)
	}

	const command = args[0]

	if (command === "build") {
		await handleBuild()
	} else if (command === "serve") {
		await handleServe()
	} else {
		handleSingleFile(args)
	}
}

main()
