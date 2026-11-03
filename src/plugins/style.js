import { parseAttrsAndArgs } from "../utils/escape.js"
import { el } from "../utils/dom.js"

// 基本色名の定義
const BASIC_COLORS = new Set([
	"black",
	"white",
	"gray",
	"grey",
	"silver",
	"maroon",
	"red",
	"purple",
	"fuchsia",
	"green",
	"lime",
	"olive",
	"yellow",
	"navy",
	"blue",
	"teal",
	"aqua",
	"orange",
	"pink",
	"gold",
	"brown",
	"cyan",
	"magenta",
])

/**
 * スマートスタイルプラグイン ([s])
 */
export const smartStylePlugin = {
	name: "smart-style",
	tag: "s",
	inline: (body, rawArgs = "", context) => {
		const { classes, attrs, rest } = parseAttrsAndArgs(rawArgs, context?.attrDefs)
		let fontSize = ""
		let color = ""
		let isBold = false

		for (const token of rest) {
			if (token === "b") {
				isBold = true
			} else if (/^\d+(?:\.\d+)?(?:px|em|rem|%|pt|vw|vh)$/i.test(token)) {
				fontSize = token
			} else if (
				/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(token) ||
				BASIC_COLORS.has(token.toLowerCase())
			) {
				color = token
			}
		}

		const styles = []
		if (fontSize) styles.push(`font-size:${fontSize};`)
		if (color) styles.push(`color:${color};`)
		if (isBold) styles.push("font-weight:bold;")

		const styleAttr = styles.length > 0 ? styles.join(" ") : null
		const content = context ? context.render(body) : body

		return el("span", { class: classes, style: styleAttr, ...attrs }, content)
	},
}
