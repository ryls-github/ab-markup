/**
 * @bracket ディレクティブの引数をパースしてデリミタ定義を生成する
 * - 2文字の場合: 1文字目が開始、2文字目が終了 (例: "<>", "{}")
 * - スペース区切りで2要素の場合: 第1要素が開始、第2要素が終了 (例: "<< >>", "(* *)")
 * - それ以外は SyntaxError
 * @param {string} rawContent
 * @returns {{ open: string, close: string }}
 */
const parseBracketDirective = (rawContent) => {
	if (!rawContent || typeof rawContent !== "string") {
		throw new SyntaxError("不正な @bracket 指定です。2文字またはスペース区切りの2要素を指定してください")
	}

	const trimmed = rawContent.trim()
	const chars = Array.from(trimmed)

	if (chars.length === 2 && !/\s/.test(trimmed)) {
		return { open: chars[0], close: chars[1] }
	}

	const tokens = trimmed.split(/\s+/).filter(Boolean)
	if (tokens.length === 2) {
		return { open: tokens[0], close: tokens[1] }
	}

	throw new SyntaxError(
		`不正な @bracket 指定です。2文字またはスペース区切りの2要素を指定してください: @bracket ${rawContent}`,
	)
}

/**
 * デリミタ切り替えプラグイン (@bracket)
 */
export const bracketPlugin = {
	name: "bracket",
	tag: "bracket",
	block: (body, args, context) => {
		const raw = body || args || ""
		context.delimiters = parseBracketDirective(raw)
		return ""
	},
}
