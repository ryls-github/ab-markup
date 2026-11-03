import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { findFiles, buildFile, matchesAny } from "./builder.js"

const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".txt": "text/plain; charset=utf-8",
	".xml": "application/xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
}

/**
 * リクエストパスから対応する配信ファイルパスを解決する
 * @param {string} urlPath
 * @param {string} outDir
 * @returns {string|null}
 */
const resolveFilePath = (urlPath, outDir) => {
	// パストラバーサル対策
	const safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[\/\\])+/, "")
	let targetPath = path.join(outDir, safePath)

	if (fs.existsSync(targetPath)) {
		const stat = fs.statSync(targetPath)
		if (stat.isDirectory()) {
			const indexPath = path.join(targetPath, "index.html")
			if (fs.existsSync(indexPath)) return indexPath
		} else {
			return targetPath
		}
	}

	// 拡張子省略対応 (/about -> /about.html)
	if (!path.extname(targetPath)) {
		const withHtml = targetPath + ".html"
		if (fs.existsSync(withHtml)) return withHtml
	}

	return null
}

/**
 * 複数ファイルを順次ビルドし、構文エラー等が発生しても catch して通知・継続する
 * @param {string[]} files
 * @param {object} config
 * @param {Function} [onError]
 * @returns {Array<{ src: string, dest: string, action: 'compiled' | 'copied' | 'deleted' }>}
 */
const compileFilesSafely = (files, config, onError) => {
	const results = []
	for (const file of files) {
		try {
			results.push(buildFile(file, config))
		} catch (err) {
			if (onError) {
				onError(err, file)
			}
		}
	}
	return results
}

/**
 * 静的配信用 HTTP サーバーを起動し、停止用の関数を返す
 * @param {object} config
 * @param {string} outDir
 * @returns {Promise<() => Promise<void>>}
 */
const startServer = (config, outDir) => {
	const server = http.createServer((req, res) => {
		const parsedUrl = new URL(req.url, `http://${req.headers.host || config.host}`)
		const filePath = resolveFilePath(parsedUrl.pathname, outDir)

		if (!filePath) {
			res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
			res.end("404 Not Found")
			return
		}

		try {
			const ext = path.extname(filePath).toLowerCase()
			const contentType = MIME_TYPES[ext] || "application/octet-stream"
			const content = fs.readFileSync(filePath)

			res.writeHead(200, { "Content-Type": contentType })
			res.end(content)
		} catch (err) {
			res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
			res.end(`500 Internal Server Error: ${err.message}`)
		}
	})

	return new Promise((resolve) => {
		server.listen(config.port, config.host, () => {
			resolve(() => new Promise((res) => server.close(res)))
		})
	})
}

/**
 * プロジェクト内のファイル変更を監視し、自動リビルドを行う
 * @param {object} config
 * @param {object} options
 * @param {Function} [options.onRebuild]
 * @param {Function} [options.onError]
 * @returns {() => void} 監視を停止する関数
 */
const startWatcher = (config, { onRebuild, onError }) => {
	let debounceTimer = null
	const changedFilePaths = new Set()

	const watcher = fs.watch(config.rootDir, { recursive: true }, (eventType, filename) => {
		if (!filename) return

		const fullPath = path.resolve(config.rootDir, filename)
		changedFilePaths.add(fullPath)

		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			const filesToProcess = Array.from(changedFilePaths)
			changedFilePaths.clear()

			const templatePath = config.template ? path.resolve(config.rootDir, config.template) : null
			let requiresFullBuild = false

			const filteredFiles = []
			for (const file of filesToProcess) {
				const relPath = path.relative(config.rootDir, file).replace(/\\/g, "/")

				// 除外パターン（node_modules や output ディレクトリ）なら無視
				if (matchesAny(relPath, config.exclude)) {
					continue
				}

				// 全体テンプレートが変更された場合はフルリビルドが必要
				if (templatePath && file === templatePath) {
					requiresFullBuild = true
					break
				}

				// include パターンにマッチするかチェック
				if (matchesAny(relPath, config.include)) {
					filteredFiles.push(file)
				}
			}

			let results = []
			if (requiresFullBuild) {
				const files = findFiles(config)
				results = compileFilesSafely(files, config, onError)
				if (onRebuild) {
					onRebuild({ isFull: true, results })
				}
			} else if (filteredFiles.length > 0) {
				results = compileFilesSafely(filteredFiles, config, onError)
				if (onRebuild) {
					onRebuild({ isFull: false, results })
				}
			}
		}, 100)
	})

	return () => {
		clearTimeout(debounceTimer)
		watcher.close()
	}
}

/**
 * 開発用 HTTP サーバーを起動し、ファイル変更を監視して自動リビルドを行う
 * @param {object} config
 * @param {object} [options={}]
 * @param {Function} [options.onStart] サーバー起動時のコールバック ({ host, port, outDir, builtFiles })
 * @param {Function} [options.onRebuild] リビルド完了時のコールバック ({ isFull: boolean, results: Array })
 * @param {Function} [options.onError] リビルド失敗時のコールバック (error, filePath)
 * @returns {Promise<{ close: () => Promise<void> }>}
 */
export const serve = async (config, options = {}) => {
	const { onStart, onRebuild, onError } = options
	const outDir = path.resolve(config.rootDir, config.output)

	// 1. 初回ビルド（構文エラーがあってもキャッチしてサーバー起動・監視を継続する）
	const allFiles = findFiles(config)
	const builtFiles = compileFilesSafely(allFiles, config, onError)

	// 2. HTTP サーバー起動
	const closeServer = await startServer(config, outDir)
	if (onStart) {
		onStart({ host: config.host, port: config.port, outDir, builtFiles })
	}

	// 3. ファイル監視開始
	const closeWatcher = startWatcher(config, { onRebuild, onError })

	const close = async () => {
		closeWatcher()
		await closeServer()
	}

	return { close }
}
