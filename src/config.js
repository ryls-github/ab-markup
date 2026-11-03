import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/**
 * デフォルト設定値
 */
const DEFAULT_CONFIG = {
	host: "localhost",
	port: 3000,
	output: "dist",
	include: ["*.ab"],
	exclude: [],
	template: null,
}

/**
 * 設定ファイル (ab.config.js) を読み込み、正規化して返す
 * @param {string} [rootDir=process.cwd()]
 * @returns {Promise<object>}
 */
export const loadConfig = async (rootDir = process.cwd()) => {
	const configPath = path.resolve(rootDir, "ab.config.js")

	if (!fs.existsSync(configPath)) {
		throw new Error(`設定ファイルが見つかりません: ${configPath}`)
	}

	let imported
	try {
		const fileUrl = pathToFileURL(configPath).href
		imported = await import(fileUrl)
	} catch (err) {
		throw new Error(`設定ファイル (ab.config.js) の読み込みに失敗しました: ${err.message}`)
	}

	const rawConfig = imported.default || imported
	const output = rawConfig.output || DEFAULT_CONFIG.output

	// include の正規化
	let include = rawConfig.include
	if (!include || (Array.isArray(include) && include.length === 0)) {
		include = DEFAULT_CONFIG.include
	} else if (!Array.isArray(include)) {
		include = [include]
	}

	// exclude の正規化
	let exclude = rawConfig.exclude
	if (!exclude) {
		exclude = []
	} else if (!Array.isArray(exclude)) {
		exclude = [exclude]
	}

	// デフォルト除外パターン（node_modules や output フォルダなど）を追加
	const defaultExcludes = ["node_modules/**", `${output}/**`, ".git/**"]
	for (const de of defaultExcludes) {
		if (!exclude.includes(de)) {
			exclude.push(de)
		}
	}

	return {
		rootDir: path.resolve(rootDir),
		host: rawConfig.host || DEFAULT_CONFIG.host,
		port: Number(rawConfig.port) || DEFAULT_CONFIG.port,
		output,
		include,
		exclude,
		template: rawConfig.template || DEFAULT_CONFIG.template,
	}
}
