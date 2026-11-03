const ESCAPE_MAP = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
}

const ESCAPE_REGEX = new RegExp(`[${Object.keys(ESCAPE_MAP).map(RegExp.escape).join("")}]`, "g")

/**
 * HTML 文字列および属性値のエスケープ（1パス走査）
 * @param {string} str
 * @returns {string}
 */
export const escapeHtml = (str) => {
	if (typeof str !== "string") return ""
	return str.replace(ESCAPE_REGEX, (ch) => ESCAPE_MAP[ch])
}

/**
 * 属性文字列（c:classname a:attrname 等）をパースする
 * @param {string} rawArgs
 * @param {Record<string, Record<string, string>>} [attrDefs={}] @attr で定義された属性辞書
 * @returns {{ classes: string[], attrs: Record<string, string>, attrNames: string[], rest: string[] }}
 */
export const parseAttrsAndArgs = (rawArgs, attrDefs = {}) => {
	const classes = []
	const attrs = {}
	const attrNames = []
	const rest = []

	if (!rawArgs || typeof rawArgs !== "string") {
		return { classes, attrs, attrNames, rest }
	}

	// 空白でトークンに分割
	const tokens = rawArgs.trim().split(/\s+/).filter(Boolean)

	for (const token of tokens) {
		if (token.startsWith("c:")) {
			const cls = token.slice(2).trim()
			if (cls) classes.push(cls)
		} else if (token.startsWith("a:")) {
			const name = token.slice(2).trim()
			if (name) {
				attrNames.push(name)
				const def = attrDefs && attrDefs[name]
				if (def) {
					if (Array.isArray(def)) {
						for (const item of def) {
							attrs[item.key] = item.value
						}
					} else {
						Object.assign(attrs, def)
					}
				}
			}
		} else {
			rest.push(token)
		}
	}

	return { classes, attrs, attrNames, rest }
}
