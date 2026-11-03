import { escapeHtml } from "./escape.js"

/**
 * 属性オブジェクトを HTML 属性文字列にシリアライズする
 * 属性が存在する場合は先頭に半角スペースを付与して返す（例: ' class="foo" id="bar"'）
 * 属性がない場合は空文字列 '' を返す
 * @param {Record<string, any>} attrs
 * @returns {string}
 */
export const serializeAttrs = (attrs = {}) => {
	if (!attrs || typeof attrs !== "object") return ""

	const parts = []

	for (const [key, val] of Object.entries(attrs)) {
		// null, undefined, false はスキップ
		if (val === null || val === undefined || val === false) continue

		if (key === "class") {
			const cls = Array.isArray(val) ? val.filter(Boolean).join(" ") : String(val).trim()
			if (cls) {
				parts.push(`class="${escapeHtml(cls)}"`)
			}
		} else if (key === "style") {
			const style =
				typeof val === "object" && val !== null
					? Object.entries(val)
							.map(([k, v]) => `${k}:${v};`)
							.join(" ")
					: String(val).trim()
			if (style) {
				parts.push(`style="${escapeHtml(style)}"`)
			}
		} else if (val === true || val === "") {
			// boolean 属性（例: controls, disabled）
			parts.push(escapeHtml(key))
		} else {
			parts.push(`${escapeHtml(key)}="${escapeHtml(String(val))}"`)
		}
	}

	return parts.length > 0 ? " " + parts.join(" ") : ""
}

/**
 * 簡易DOMノード（仮想要素）を生成する
 * @param {string} tag タグ名 ('div', 'table', 'h1' など)
 * @param {object} [attrs={}] 属性オブジェクト
 * @param {...any} children 子要素（文字列、子ノード、配列など）
 * @returns {{ tag: string, attrs: object, children: Array<any> }}
 */
export const el = (tag, attrs = {}, ...children) => ({
	tag,
	attrs: attrs || {},
	children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
})

// void タグ（自己終了タグ: 閉じタグを持たないHTML要素）
const VOID_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
])

/**
 * 簡易DOMノードまたは文字列を HTML 文字列にシリアライズする
 * @param {any} node
 * @returns {string}
 */
export const renderHtml = (node) => {
	if (node === null || node === undefined || node === false) return ""
	if (typeof node === "string") return node
	if (typeof node === "number") return String(node)
	if (Array.isArray(node)) return node.map(renderHtml).join("")

	if (typeof node === "object" && node.tag) {
		const { tag, attrs, children = [] } = node
		const attrStr = serializeAttrs(attrs)

		if (VOID_TAGS.has(tag.toLowerCase())) {
			return `<${tag}${attrStr}>`
		}

		const innerHtml = children.map(renderHtml).join("")
		return `<${tag}${attrStr}>${innerHtml}</${tag}>`
	}

	return String(node)
}
