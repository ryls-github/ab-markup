import fs from "node:fs"
import path from "node:path"
import { compile } from "./compiler.js"
import { applyTemplate } from "./template.js"

const GLOB_TOKEN_MAP = {
	"**/": "(?:.*/)?",
	"**": ".*",
	"*": "[^/]*",
	"?": "[^/]",
}

const GLOB_TOKEN_REGEX = new RegExp(
	`(${Object.keys(GLOB_TOKEN_MAP)
		.map((k) => RegExp.escape(k))
		.join("|")})`,
)

/**
 * 簡易 glob パターンを正規表現に変換する
 * @param {string} pattern
 * @returns {RegExp}
 */
const globToRegex = (pattern) => {
	const p = pattern.replace(/\\/g, "/")
	const prefix = !p.includes("/") ? "(?:^|.*/)" : "^"

	const body = p
		.split(GLOB_TOKEN_REGEX)
		.reduce((acc, part, i) => acc + (i % 2 === 0 ? RegExp.escape(part) : GLOB_TOKEN_MAP[part]), "")

	return new RegExp(prefix + body + "$")
}

/**
 * 指定パスがいずれかのパターンにマッチするか判定する
 * @param {string} relPath
 * @param {string[]} patterns
 * @returns {boolean}
 */
export const matchesAny = (relPath, patterns) => {
	const normalized = relPath.replace(/\\/g, "/")
	for (const pat of patterns) {
		const re = globToRegex(pat)
		if (re.test(normalized)) {
			return true
		}
	}
	return false
}

/**
 * 設定に基づいて対象ファイルを収集する
 * @param {object} config
 * @returns {string[]} マッチしたファイルの絶対パス配列
 */
export const findFiles = (config) => {
	const rootDir = config.rootDir
	if (!fs.existsSync(rootDir)) return []

	const entries = fs.readdirSync(rootDir, { recursive: true, withFileTypes: true })
	const matched = []

	for (const entry of entries) {
		if (!entry.isFile()) continue

		const dir = entry.parentPath || entry.path
		const fullPath = path.join(dir, entry.name)
		const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/")

		// exclude パターンにマッチしたら除外
		if (matchesAny(relPath, config.exclude)) {
			continue
		}

		// include パターンにマッチしたら採用
		if (matchesAny(relPath, config.include)) {
			matched.push(fullPath)
		}
	}

	return matched
}

/**
 * 単一ファイルを処理（.ab はコンパイル、その他はコピー、削除時は出力先も削除）する
 * @param {string} filePath 対象ファイルの絶対パス
 * @param {object} config 設定オブジェクト
 * @returns {{ src: string, dest: string, action: 'compiled' | 'copied' | 'deleted' }}
 */
export const buildFile = (filePath, config) => {
	const relPath = path.relative(config.rootDir, filePath).replace(/\\/g, "/")
	const isAb = /\.ab$/i.test(filePath)
	const outRelPath = isAb ? relPath.replace(/\.ab$/i, ".html") : relPath
	const destPath = path.resolve(config.rootDir, config.output, outRelPath)

	// 1. ソースファイルが削除された場合
	if (!fs.existsSync(filePath)) {
		if (fs.existsSync(destPath)) {
			fs.rmSync(destPath, { force: true })
		}
		return { src: filePath, dest: destPath, action: "deleted" }
	}

	// 出力先ディレクトリの確保
	fs.mkdirSync(path.dirname(destPath), { recursive: true })

	// 2. .ab ファイルの場合 -> コンパイルして HTML 出力
	if (isAb) {
		const source = fs.readFileSync(filePath, "utf-8")
		const { html, metadata } = compile(source)
		const fullHtml = applyTemplate(html, metadata, filePath, config)
		fs.writeFileSync(destPath, fullHtml, "utf-8")
		return { src: filePath, dest: destPath, action: "compiled" }
	}

	// 3. その他のファイル -> そのままコピー
	fs.copyFileSync(filePath, destPath)
	return { src: filePath, dest: destPath, action: "copied" }
}

/**
 * プロジェクト全体のビルドを実行する
 * @param {object} config
 * @returns {Array<{ src: string, dest: string, action: 'compiled' | 'copied' | 'deleted' }>} ビルドされたファイル一覧
 */
export const build = (config) => {
	const outDir = path.resolve(config.rootDir, config.output)
	fs.mkdirSync(outDir, { recursive: true })

	const files = findFiles(config)
	return files.map((filePath) => buildFile(filePath, config))
}
