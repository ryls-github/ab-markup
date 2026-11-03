import { parseAttrsAndArgs } from "../utils/escape.js"
import { el } from "../utils/dom.js"

/**
 * テーブルプラグイン (@table)
 */
export const tablePlugin = {
	name: "table",
	tag: "table",
	block: (body, args, context) => {
		const { classes, attrs, rest } = parseAttrsAndArgs(args || "", context?.attrDefs)

		let delimiter = ","
		let hr = 0
		let hc = 0

		for (const token of rest) {
			if (token.startsWith("hr:")) {
				hr = parseInt(token.slice(3), 10) || 0
			} else if (token.startsWith("hc:")) {
				hc = parseInt(token.slice(3), 10) || 0
			} else if (!delimiter || delimiter === ",") {
				if (token === "\\t") {
					delimiter = "\t"
				} else {
					delimiter = token
				}
			}
		}

		const lines = body.split("\n")
		const rawLines = lines.filter((l) => l.trim().length > 0)
		if (rawLines.length === 0) {
			return el("table", { class: classes, ...attrs })
		}

		const rows = rawLines.map((line) => {
			return line.split(delimiter).map((cell) => cell.trim())
		})

		const headerRows = rows.slice(0, hr)
		const bodyRows = rows.slice(hr)

		const thead =
			headerRows.length > 0 &&
			el(
				"thead",
				{},
				headerRows.map((row) =>
					el(
						"tr",
						{},
						row.map((cell) => el("th", {}, context.renderInline(cell))),
					),
				),
			)

		const tbody =
			bodyRows.length > 0 &&
			el(
				"tbody",
				{},
				bodyRows.map((row) =>
					el(
						"tr",
						{},
						row.map((cell, colIdx) => {
							const isHeaderCol = colIdx < hc
							return el(isHeaderCol ? "th" : "td", {}, context.renderInline(cell))
						}),
					),
				),
			)

		return el("table", { class: classes, ...attrs }, thead, tbody)
	},
}
