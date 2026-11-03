import { parseAttrsAndArgs } from "../utils/escape.js"
import { el } from "../utils/dom.js"

/**
 * リスト行のタブ数と内容を抽出する
 * @param {string} line
 * @returns {{ tabs: number, text: string }}
 */
const extractTabs = (line) => {
	let tabs = 0
	while (tabs < line.length && line[tabs] === "\t") {
		tabs++
	}
	return { tabs, text: line.slice(tabs) }
}

/**
 * マーカー判定
 * @param {string} text
 * @param {boolean} isOrdered
 * @returns {{ isMarker: boolean, markerLen: number }}
 */
const checkMarker = (text, isOrdered) => {
	if (isOrdered) {
		const m = text.match(/^(\d+\.|\-|\*)\s+/)
		if (m) return { isMarker: true, markerLen: m[0].length }
	} else {
		const m = text.match(/^(\-|\*)\s+/)
		if (m) return { isMarker: true, markerLen: m[0].length }
	}
	return { isMarker: false, markerLen: 0 }
}

/**
 * リストプラグイン (@list, @numlist)
 */
export const listPlugin = {
	name: "list",
	tag: ["list", "numlist"],
	block: (body, args, context) => {
		const isOrdered = context.tag === "numlist"
		const tag = isOrdered ? "ol" : "ul"
		const { classes, attrs } = parseAttrsAndArgs(args || "", context?.attrDefs)

		const lines = body.split("\n")
		const rawLines = lines.filter((l) => l.trim().length > 0)
		if (rawLines.length === 0) {
			return el(tag, { class: classes, ...attrs })
		}

		// 1行目でモードを判定
		const firstLine = rawLines[0]
		const { text: firstText } = extractTabs(firstLine)
		const isModeA = checkMarker(firstText, isOrdered).isMarker

		// アイテムリストの構築
		const items = []
		let currentItem = null

		for (const line of rawLines) {
			const { tabs, text } = extractTabs(line)

			if (isModeA) {
				const { isMarker, markerLen } = checkMarker(text, isOrdered)
				if (isMarker) {
					const content = text.slice(markerLen).trim()
					currentItem = {
						tabs,
						contentLines: [content],
						children: [],
					}
					items.push(currentItem)
				} else if (currentItem) {
					currentItem.contentLines.push(text.trim())
				}
			} else {
				items.push({
					tabs,
					contentLines: [text.trim()],
					children: [],
				})
			}
		}

		// ツリー構造の構築
		const root = { tabs: -1, children: [] }
		const stack = [root]

		for (const item of items) {
			while (stack.length > 1 && stack[stack.length - 1].tabs >= item.tabs) {
				stack.pop()
			}
			stack[stack.length - 1].children.push(item)
			stack.push(item)
		}

		// HTML 生成（再帰）
		const renderTree = (parentNode, isRoot = false) => {
			if (parentNode.children.length === 0) return null
			const currentAttrs = isRoot ? { class: classes, ...attrs } : {}

			return el(
				tag,
				currentAttrs,
				parentNode.children.map((child) => {
					const renderedContent = child.contentLines.map((l) => context.renderInline(l)).join("<br>")
					const childTree = child.children.length > 0 ? renderTree(child, false) : null
					return el("li", {}, renderedContent, childTree)
				}),
			)
		}

		return renderTree(root, true)
	},
}
