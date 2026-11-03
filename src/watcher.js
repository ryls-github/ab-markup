import fs from "node:fs"
import path from "node:path"
import { compile } from "./compiler.js"

/**
 * 単一 .ab ファイルをコンパイルして出力先ファイルに書き込む
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {{ html: string, metadata: Record<string, string> }}
 */
export const compileFile = (inputPath, outputPath) => {
	const source = fs.readFileSync(inputPath, "utf-8")
	const result = compile(source)

	fs.mkdirSync(path.dirname(outputPath), { recursive: true })
	fs.writeFileSync(outputPath, result.html, "utf-8")

	return result
}

/**
 * 単一ファイルの変更を監視し、自動再コンパイルを行う
 * @param {string} inputPath 入力 .ab ファイルパス
 * @param {string} outputPath 出力 .html ファイルパス
 * @param {object} [options={}] コールバックオプション
 * @param {Function} [options.onSuccess] コンパイル成功時のコールバック ({ inputPath, outputPath, isInitial })
 * @param {Function} [options.onError] コンパイル失敗時のコールバック (error)
 * @returns {fs.FSWatcher}
 */
export const watchFile = (inputPath, outputPath, options = {}) => {
	const { onSuccess, onError } = options
	const absInput = path.resolve(inputPath)
	const absOutput = path.resolve(outputPath)

	// 1. 初回コンパイル
	try {
		compileFile(absInput, absOutput)
		if (onSuccess) {
			onSuccess({ inputPath: absInput, outputPath: absOutput, isInitial: true })
		}
	} catch (err) {
		if (onError) {
			onError(err)
		}
	}

	// 2. ディレクトリ監視（atomic write / 一時ファイル置換に対応）
	const dir = path.dirname(absInput)
	const targetBase = path.basename(absInput)
	let debounceTimer = null

	const watcher = fs.watch(dir, (eventType, filename) => {
		if (!filename || filename === targetBase) {
			clearTimeout(debounceTimer)
			debounceTimer = setTimeout(() => {
				if (!fs.existsSync(absInput)) return
				try {
					compileFile(absInput, absOutput)
					if (onSuccess) {
						onSuccess({ inputPath: absInput, outputPath: absOutput, isInitial: false })
					}
				} catch (err) {
					if (onError) {
						onError(err)
					}
				}
			}, 100)
		}
	})

	return watcher
}
