import { escapeHtml, parseAttrsAndArgs } from "../utils/escape.js"
import { el } from "../utils/dom.js"

/**
 * 太字プラグイン ([b])
 */
export const boldPlugin = {
	name: "bold",
	tag: "b",
	inline: (body, rawArgs = "", context) => {
		const content = context ? context.render(body) : body
		return el("b", {}, content)
	},
}

/**
 * 打ち消しプラグイン ([d])
 */
export const delPlugin = {
	name: "del",
	tag: "d",
	inline: (body, rawArgs = "", context) => {
		const content = context ? context.render(body) : body
		return el("del", {}, content)
	},
}

/**
 * リンクプラグイン ([a])
 * [a URL]リンク[/]
 */
export const linkPlugin = {
	name: "link",
	tag: "a",
	inline: (body, rawArgs = "", context) => {
		const { classes, attrs, rest } = parseAttrsAndArgs(rawArgs, context?.attrDefs)
		const url = rest[0] || ""
		const content = context ? context.render(body) : body
		return el("a", { href: url, class: classes, ...attrs }, content)
	},
}

/**
 * コメントプラグイン（インライン [] と ブロック @[[, 単行 @）
 */
export const commentPlugin = {
	name: "comment",
	tag: "",
	inline: () => "",
	block: () => "",
}

/**
 * 水平線プラグイン (@-, @--, @---, @----)
 */
export const hrPlugin = {
	name: "hr",
	tag: ["-", "--", "---", "----"],
	block: (body, args, context) => {
		const raw = typeof body === "string" ? body : args
		const { classes, attrs } = parseAttrsAndArgs(raw, context?.attrDefs)

		// 2本以上（-- や ---, ----）の場合は本数に応じたクラス名を自動付与（1本はクラスなし）
		if (context.tag && context.tag.length > 1) {
			classes.unshift(`hr-${context.tag.length}`)
		}

		return el("hr", { class: classes, ...attrs })
	},
}

/**
 * 見出しプラグイン (@#, @##, @###)
 */
export const headingPlugin = {
	name: "heading",
	tag: ["#", "##", "###"],
	block: (body, args, context) => {
		const level = context.tag ? context.tag.length : 1
		const tag = `h${level}`
		const { classes, attrs } = parseAttrsAndArgs(args || "", context?.attrDefs)
		const content = body
			.trim()
			.split("\n")
			.map((line) => context.renderInline(line))
			.join("<br>")
		return el(tag, { class: classes, ...attrs }, content)
	},
}

/**
 * 引用プラグイン (@quote)
 */
export const quotePlugin = {
	name: "quote",
	tag: "quote",
	block: (body, args, context) => {
		const { classes, attrs } = parseAttrsAndArgs(args || "", context?.attrDefs)
		return el("blockquote", { class: classes, ...attrs }, context.renderNested(body))
	},
}

/**
 * ルビプラグイン ([^])
 * [^ 読み]漢字[/]
 */
export const rubyPlugin = {
	name: "ruby",
	tag: "^",
	inline: (body, rawArgs = "", context) => {
		const reading = rawArgs.trim()
		const content = context ? context.render(body) : body
		return el("ruby", {}, content, el("rt", {}, reading))
	},
}

/**
 * メディア埋め込みプラグイン ([*])
 * [* URL]キャプション[/]
 */
export const mediaPlugin = {
	name: "media",
	tag: "*",
	inline: (body, rawArgs = "") => {
		const url = rawArgs.trim()
		const isVideo = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(url)

		if (isVideo) {
			return el("video", { src: url, controls: true }, body)
		}

		return el("img", { src: url, alt: body })
	},
}

/**
 * Raw HTML プラグイン（インライン [html] と ブロック @html）
 * 生の HTML をエスケープせずそのまま出力する
 */
export const htmlPlugin = {
	name: "html",
	tag: "html",
	block: (body) => body,
	inline: (body) => body,
}

/**
 * Raw テキストプラグイン（インライン [raw] と ブロック @raw）
 * AB構文を解釈せず、HTML特殊文字をエスケープして通常テキストとして出力する
 */
export const rawPlugin = {
	name: "raw",
	tag: "raw",
	block: (body) => escapeHtml(body),
	inline: (body) => escapeHtml(body),
}

/**
 * スタイルブロックプラグイン (@style)
 * CSS構文（> や & 等）を壊さないようHTMLエスケープは行わず、
 * タグの意図しない終了を防ぐため </style> のみ安全にエスケープする
 */
export const stylePlugin = {
	name: "style",
	tag: "style",
	block: (body) => {
		const safeCss = body.replace(/<\/style/gi, "<\\/style")
		return `<style>\n${safeCss}\n</style>`
	},
}

/**
 * コードプラグイン（インライン [`] と ブロック @`）
 */
export const codePlugin = {
	name: "code",
	tag: "`",
	inline: (body) => el("code", {}, escapeHtml(body)),
	block: (body, args, context) => {
		const { classes, attrs, rest } = parseAttrsAndArgs(args || "", context?.attrDefs)

		// 第1引数に言語名があればクラスに追加
		if (rest.length > 0) {
			classes.unshift(rest[0])
		}

		const codeContent = escapeHtml(body)
		return el("pre", {}, el("code", { class: classes, ...attrs }, codeContent))
	},
}

/**
 * 任意HTMLタグプラグイン（インライン [t] と ブロック @t）
 */
export const tagPlugin = {
	name: "html-tag",
	tag: "t",
	inline: (body, args, context) => {
		const { classes, attrs, rest } = parseAttrsAndArgs(args || "", context?.attrDefs)
		let tagName = "span"
		if (rest.length > 0 && /^[a-zA-Z0-9\-]+$/.test(rest[0])) {
			tagName = rest[0]
		}
		return el(tagName, { class: classes, ...attrs }, context.render(body))
	},
	block: (body, args, context) => {
		const { classes, attrs, rest } = parseAttrsAndArgs(args || "", context?.attrDefs)
		let tagName = "div"
		if (rest.length > 0 && /^[a-zA-Z0-9\-]+$/.test(rest[0])) {
			tagName = rest[0]
		}
		return el(tagName, { class: classes, ...attrs }, context.renderNested(body))
	},
}

/**
 * コールアウト系ブロック共通レンダラー
 */
const renderCalloutBlock = (defaultClass, body, args, context) => {
	const { classes, attrs, rest } = parseAttrsAndArgs(args || "", context?.attrDefs)
	classes.unshift(defaultClass)
	if (rest.length > 0) {
		classes.push(rest[0])
	}
	return el("aside", { class: classes, ...attrs }, context.renderNested(body))
}

/**
 * コールアウトプラグイン (@!)
 */
export const calloutPlugin = {
	name: "callout",
	tag: "!",
	block: (body, args, context) => renderCalloutBlock("callout", body, args, context),
}

/**
 * ノートプラグイン (@note)
 */
export const notePlugin = {
	name: "note",
	tag: "note",
	block: (body, args, context) => renderCalloutBlock("note", body, args, context),
}

/**
 * タイトルメタデータプラグイン (@title)
 */
export const titlePlugin = {
	name: "title",
	tag: "title",
	block: (body, args, context) => {
		context.metadata.title = typeof body === "string" ? body.trim() : ""
		return ""
	},
}

/**
 * 日付メタデータプラグイン (@date)
 */
export const datePlugin = {
	name: "date",
	tag: "date",
	block: (body, args, context) => {
		context.metadata.date = typeof body === "string" ? body.trim() : ""
		return ""
	},
}

/**
 * タグメタデータプラグイン (@tags)
 */
export const tagsPlugin = {
	name: "tags",
	tag: "tags",
	block: (body, args, context) => {
		context.metadata.tags = typeof body === "string" ? body.trim() : ""
		return ""
	},
}

/**
 * テンプレート指定プラグイン (@template)
 */
export const templatePlugin = {
	name: "template",
	tag: "template",
	block: (body, args, context) => {
		context.metadata.template = typeof body === "string" ? body.trim() : ""
		return ""
	},
}
