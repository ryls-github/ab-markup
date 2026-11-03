import fs from "node:fs"
import path from "node:path"

/**
 * テンプレートファイルのパスを解決する
 * @param {string|null} templateDirective ab ファイル内の @template 指定
 * @param {string} abFilePath ab ファイルの絶対パス
 * @param {object} config 設定オブジェクト
 * @returns {string|null} 解決されたテンプレートの絶対パス、または null
 */
export const resolveTemplatePath = (templateDirective, abFilePath, config) => {
	if (templateDirective) {
		const trimmed = templateDirective.trim()
		if (trimmed.startsWith("/")) {
			// プロジェクトルート（config のあるディレクトリ）からの絶対パス
			return path.resolve(config.rootDir, trimmed.slice(1))
		}
		// ab ファイルが存在するディレクトリからの相対パス
		return path.resolve(path.dirname(abFilePath), trimmed)
	}

	if (config.template) {
		return path.resolve(config.rootDir, config.template)
	}

	return null
}

/**
 * HTML とメタデータにテンプレートを適用して完全な HTML を構築する
 * @param {string} html コンパイルされた本文 HTML
 * @param {Record<string, string>} metadata 収集されたメタデータ
 * @param {string} abFilePath コンパイル対象の ab ファイル絶対パス
 * @param {object} config 設定オブジェクト
 * @returns {string} テンプレート適用後の HTML 文字列
 */
export const applyTemplate = (html, metadata, abFilePath, config) => {
	const templateDirective = metadata?.template || null
	const templatePath = resolveTemplatePath(templateDirective, abFilePath, config)

	if (!templatePath) {
		// テンプレート指定がない場合は本文 HTML そのまま
		return html
	}

	if (!fs.existsSync(templatePath)) {
		throw new Error(`テンプレートファイルが見つかりません: ${templatePath}`)
	}

	const templateContent = fs.readFileSync(templatePath, "utf-8")

	// {{content}} または {{body}} を本文 HTML で置換
	// {{key}} を metadata[key] で置換
	return templateContent.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
		if (key === "content" || key === "body") {
			return html
		}
		return metadata && metadata[key] !== undefined ? metadata[key] : ""
	})
}
