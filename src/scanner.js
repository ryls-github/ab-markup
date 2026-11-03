import { registry } from "./plugins.js"
import { parseInline } from "./inline.js"
import { renderHtml } from "./utils/dom.js"

const DEFAULT_DELIMITERS = {
	open: "[",
	close: "]",
}

const isCloseToken = (token, close) =>
	token === close + close || (token.startsWith(`${close}:`) && token.endsWith(close) && token.length > 2)

/**
 * ブロック終了デリミタにマッチするか判定する（純粋関数）
 * 行全体が終了デリミタトークン（]] や ]:key]）と空白のみで構成されている場合のみブロック終了とみなす
 * @param {string} line
 * @param {string} key
 * @param {object} delims
 * @returns {{ isClose: boolean, beforeText?: string }}
 */
const checkBlockClose = (line, key, delims) => {
	const trimmed = line.trim()
	if (!trimmed) {
		return { isClose: false }
	}

	const c = delims.close
	const tokens = trimmed.split(/\s+/)

	// 行内のすべてのトークンが終了デリミタでなければ、通常のテキスト行とみなす
	if (!tokens.every((t) => isCloseToken(t, c))) {
		return { isClose: false }
	}

	const targetClose = key ? `${c}:${key}${c}` : c + c

	const targetIdx = tokens.indexOf(targetClose)
	if (targetIdx === -1) {
		return { isClose: false }
	}

	return {
		isClose: true,
		beforeText: tokens.slice(0, targetIdx).join(" "),
	}
}

/**
 * @ ディレクティブ行をパースする（純粋関数）
 * @param {string} line
 * @param {object} delims
 * @returns {{ kind: 'block' | 'single', tag: string, args?: string, key?: string, content?: string }}
 */
const parseDirective = (line, delims) => {
	// 1. 複数行ブロックの開始判定
	const o = RegExp.escape(delims.open)
	const blockRegex = new RegExp(`^@([^\\s]*)(?:\\s+(.*?))?\\s*(?:${o}${o}|${o}:([a-zA-Z0-9_\\-]+)${o})$`)
	const blockMatch = line.match(blockRegex)

	if (blockMatch) {
		return {
			kind: "block",
			tag: blockMatch[1],
			args: blockMatch[2] || "",
			key: blockMatch[3] || "",
		}
	}

	// 2. 単行形式 (@tag content)
	const spaceIdx = line.indexOf(" ")
	const tag = spaceIdx === -1 ? line.slice(1) : line.slice(1, spaceIdx)
	const content = spaceIdx === -1 ? "" : line.slice(spaceIdx + 1)

	return { kind: "single", tag, content }
}

/**
 * スコープコンテキストを生成する共通ファクトリ
 * @param {object|null} parent 親コンテキスト
 * @param {object} metadata メタデータ辞書
 * @param {object} attrDefs 属性定義辞書
 * @param {object} delimiters デリミタ設定
 * @returns {object}
 */
const createContext = (parent, metadata, attrDefs, delimiters) => {
	const context = {
		parent,
		root: parent ? parent.root : null,
		metadata,
		attrDefs,
		delimiters,
		tag: "",
		key: "",
		render: (body) => scanAndRender(body, context),
		renderInline: (text) => parseInline(text, context),
		renderNested: (source) => scanAndRender(source, context),
	}
	if (!parent) context.root = context
	return context
}

/**
 * 親コンテキストを継承した子コンテキストを生成する（ブロックスコープ用）
 * @param {object} parentContext
 * @returns {object}
 */
const createChildContext = (parentContext) => {
	const childMetadata = Object.create(parentContext.metadata)
	const childAttrDefs = Object.create(parentContext.attrDefs)
	childMetadata.attrDefs = childAttrDefs
	return createContext(parentContext, childMetadata, childAttrDefs, { ...parentContext.delimiters })
}

/**
 * 文書のルートコンテキストを生成する（トップレベルスコープ）
 * @param {object} [metadata={}]
 * @param {object} [delimiters=DEFAULT_DELIMITERS]
 * @returns {object}
 */
export const createRootContext = (metadata = {}, delimiters = DEFAULT_DELIMITERS) => {
	const attrDefs = metadata.attrDefs || (metadata.attrDefs = {})
	return createContext(null, metadata, attrDefs, delimiters)
}

/**
 * 複数行ブロックをレンダリングする
 * @param {object} block
 * @param {object} parentContext
 * @returns {string}
 */
const renderBlock = (block, parentContext) => {
	const handler = registry.get(block.name)
	if (!handler) {
		throw new SyntaxError(`未定義のブロックディレクティブです: @${block.name}`)
	}

	const context = createChildContext(parentContext)
	context.tag = block.name
	context.key = block.key

	const result = handler(block.body, block.rawArgs, context)
	return renderHtml(result)
}

/**
 * 単行ディレクティブをレンダリングする
 * @param {string} tag
 * @param {string} content
 * @param {object} context
 * @returns {string}
 */
const renderDirective = (tag, content, context) => {
	const handler = registry.get(tag)
	if (!handler) {
		return ""
	}

	context.tag = tag
	context.key = ""

	const result = handler(content, "", context)
	return renderHtml(result)
}

/**
 * @ ディレクティブ（単行または複数行ブロック）を消費してレンダリングする
 * @param {object} reader
 * @param {object} context
 * @returns {string} レンダリングされたHTML
 */
const consumeDirective = (reader, context) => {
	const line = reader.next()
	const dir = parseDirective(line, context.delimiters)

	if (dir.kind === "block") {
		let body = ""
		let closed = false

		while (reader.hasNext()) {
			const blockLine = reader.next()
			const { isClose, beforeText } = checkBlockClose(blockLine, dir.key, context.delimiters)
			if (isClose) {
				if (beforeText) {
					body += "\n" + beforeText
				}
				closed = true
				break
			}
			body += "\n" + blockLine
		}

		if (!closed) {
			throw new SyntaxError(`閉じられていないブロックがあります: @${dir.tag}`)
		}

		return renderBlock(
			{
				type: "block",
				name: dir.tag,
				rawArgs: dir.args,
				key: dir.key,
				body: body.slice(1),
			},
			context,
		)
	}

	if (registry.has(dir.tag)) {
		return renderDirective(dir.tag, dir.content, context)
	}

	throw new SyntaxError(`未定義のディレクティブです: @${dir.tag}`)
}

/**
 * 通常テキスト行（@@ エスケープ含む）を消費してインラインパースする
 * @param {object} reader
 * @param {object} context
 * @returns {string} パースされたHTML
 */
const consumeTextLine = (reader, context) => {
	const rawLine = reader.next()
	const textContent = rawLine.startsWith("@@") ? rawLine.slice(1) : rawLine
	return parseInline(textContent, context, reader)
}

/**
 * 文字列から行リーダー（Consumer）を生成する
 * @param {string} source
 * @returns {{ hasNext: () => boolean, peek: () => string | null, next: () => string | null }}
 */
const createReader = (source) => {
	const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
	let cursor = 0
	return {
		hasNext: () => cursor < lines.length,
		peek: () => (cursor < lines.length ? lines[cursor] : null),
		next: () => (cursor < lines.length ? lines[cursor++] : null),
	}
}

/**
 * AB ソーステキストをスキャンし、即座にプラグインを実行して HTML 文字列を生成する（完全1パス処理）
 * @param {string} source
 * @param {object} [contextOrMetadata={}]
 * @param {object} [initialDelimiters=DEFAULT_DELIMITERS]
 * @returns {string} 生成された本文 HTML
 */
export const scanAndRender = (source, contextOrMetadata = {}, initialDelimiters = DEFAULT_DELIMITERS) => {
	let out = ""
	let pendingBlanks = 0 // 直前の保留空行数
	let skipNextBlank = false // ブロック直後の空行スキップフラグ
	let lastItem = null // 'text' | 'block' | null

	const isContext = contextOrMetadata && typeof contextOrMetadata.render === "function"
	const context = isContext ? contextOrMetadata : createRootContext(contextOrMetadata, initialDelimiters)

	const flushBlanks = () => {
		if (pendingBlanks > 0) {
			if (lastItem === "text" && out.length > 0) {
				out += "<br>"
			}
			while (pendingBlanks > 0) {
				out += "\n<br>"
				pendingBlanks--
			}
		}
	}

	const trimAndFlushBlanks = () => {
		if (pendingBlanks > 0) {
			pendingBlanks--
		}
		flushBlanks()
	}

	const reader = createReader(source)

	while (reader.hasNext()) {
		const peeked = reader.peek()

		// 1. 空行の処理
		if (peeked.trim() === "") {
			reader.next()
			if (skipNextBlank) {
				skipNextBlank = false
			} else {
				pendingBlanks++
			}
			continue
		}

		// 2. @ ディレクティブ行の処理
		if (peeked.startsWith("@") && !peeked.startsWith("@@")) {
			trimAndFlushBlanks()
			const rendered = consumeDirective(reader, context)
			if (rendered) {
				out += "\n" + rendered
				skipNextBlank = true
				lastItem = "block"
			}
			continue
		}

		// 3. 通常テキスト行の処理
		skipNextBlank = false
		if (pendingBlanks > 0) {
			flushBlanks()
		} else if (lastItem === "text" && out.length > 0) {
			out += "<br>"
		}

		out += "\n" + consumeTextLine(reader, context)
		lastItem = "text"
	}

	flushBlanks()
	return out.trim()
}
