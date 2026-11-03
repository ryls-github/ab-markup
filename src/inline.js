import { escapeHtml } from "./utils/escape.js"
import { renderHtml } from "./utils/dom.js"
import { registry } from "./plugins.js"

/**
 * 次に出現するブラケット（open または close）のインデックスを検索
 * @param {string} text
 * @param {number} startIndex
 * @param {object} delims
 * @returns {number} 見つかったインデックス、なければ -1
 */
const findNextBracket = (text, startIndex, delims) => {
	const nextOpen = text.indexOf(delims.open, startIndex)
	const nextClose = text.indexOf(delims.close, startIndex)

	if (nextOpen === -1) return nextClose
	if (nextClose === -1) return nextOpen
	return Math.min(nextOpen, nextClose)
}

/**
 * エスケープを考慮しながら対象の終了デリミタを検索する
 * @param {string} text
 * @param {string} targetClose
 * @param {number} startIndex
 * @param {object} delims
 * @returns {number} 見つかったインデックス、なければ -1
 */
const findTargetClose = (text, targetClose, startIndex, delims) => {
	let j = startIndex
	const len = text.length
	const escOpen = delims.open + delims.open
	const escClose = delims.close + delims.close

	while (j < len) {
		if (text.startsWith(escOpen, j)) {
			j += escOpen.length
			continue
		}
		if (text.startsWith(escClose, j)) {
			j += escClose.length
			continue
		}
		if (text.startsWith(targetClose, j)) {
			return j
		}
		j++
	}
	return -1
}

/**
 * タグヘッダー [tag:key args] をパースする
 * 有効なタグヘッダーでなければ null を返す
 * @param {string} text
 * @param {number} startIndex open の位置
 * @param {object} delims
 * @returns {{ tagName: string, key: string, rawArgs: string, headerEndIdx: number } | null}
 */
const parseTagHeader = (text, startIndex, delims) => {
	const closeBracketIdx = text.indexOf(delims.close, startIndex + delims.open.length)
	const nextOpenBracketIdx = text.indexOf(delims.open, startIndex + delims.open.length)

	// close が存在しない、改行を跨ぐ、または close より前に別の open がある場合はタグヘッダーではない
	if (
		closeBracketIdx === -1 ||
		(nextOpenBracketIdx !== -1 && nextOpenBracketIdx < closeBracketIdx) ||
		text.slice(startIndex, closeBracketIdx).includes("\n")
	) {
		return null
	}

	const tagContent = text.slice(startIndex + delims.open.length, closeBracketIdx).trim()

	// コメントタグ [] または [:key]
	if (tagContent === "" || tagContent.startsWith(":")) {
		return {
			tagName: "",
			key: tagContent.replace(/^:/, ""),
			rawArgs: "",
			headerEndIdx: closeBracketIdx + delims.close.length,
		}
	}

	// 一般タグ tag(:key)? (args)?
	const match = tagContent.match(/^([a-zA-Z0-9#\^\*\`\-]+)(?::([a-zA-Z0-9_\-]+))?(?:\s+(.*))?$/s)
	if (!match) {
		return null
	}

	return {
		tagName: match[1],
		key: match[2] || "",
		rawArgs: match[3] || "",
		headerEndIdx: closeBracketIdx + delims.close.length,
	}
}

/**
 * インラインタグを切り出し、プラグインを実行してレンダリング結果を返す
 * @param {string} text
 * @param {object} tagHeader parseTagHeader の戻り値
 * @param {object} [parentContext={}]
 * @param {object} delims
 * @param {object|null} [reader=null] 行リーダー（Consumer）
 * @returns {{ html: string, nextIndex: number, text: string }}
 */
const processInlineTag = (text, tagHeader, parentContext = {}, delims, reader = null) => {
	const { tagName, key, rawArgs, headerEndIdx } = tagHeader

	const plugin = registry.getInline(tagName)
	if (!plugin) {
		throw new SyntaxError(`未定義のインラインタグです: ${delims.open}${tagName}${delims.close}`)
	}

	// 対応する閉じタグの検索（エスケープを保護しながら検索）
	const targetClose = key ? `${delims.open}/:${key}${delims.close}` : `${delims.open}/${delims.close}`

	let currentText = text
	let closeEndIdx = findTargetClose(currentText, targetClose, headerEndIdx, delims)

	// 閉じタグが見つからない場合、reader から次の行を吸い上げる（Consumerパターン）
	while (closeEndIdx === -1 && reader && reader.hasNext()) {
		currentText += "\n" + reader.next()
		closeEndIdx = findTargetClose(currentText, targetClose, headerEndIdx, delims)
	}

	if (closeEndIdx === -1) {
		throw new SyntaxError(`閉じられていないタグがあります: ${delims.open}${tagName}${delims.close}`)
	}

	const body = currentText.slice(headerEndIdx, closeEndIdx)
	const childMetadata = Object.create(parentContext.metadata)
	const childAttrDefs = Object.create(parentContext.attrDefs)
	childMetadata.attrDefs = childAttrDefs

	const childContext = {
		...parentContext,
		parent: parentContext,
		root: parentContext.root,
		metadata: childMetadata,
		attrDefs: childAttrDefs,
		delimiters: delims,
		render: (t) => parseInline(t, childContext, reader),
		renderNested: (t) => parseInline(t, childContext, reader),
		renderInline: (t) => parseInline(t, childContext, reader),
		key,
		tag: tagName,
	}

	const rendered = plugin(body, rawArgs, childContext)
	return {
		html: renderHtml(rendered),
		nextIndex: closeEndIdx + targetClose.length,
		text: currentText,
	}
}

/**
 * インラインマークアップをパースしてHTML文字列に変換する
 * @param {string} text 入力文字列
 * @param {object} parentContext 親コンテキスト（メタデータや属性辞書を含む）
 * @param {object|null} [reader=null] 行リーダー（Consumer）
 * @returns {string} 変換後のHTML
 */
export const parseInline = (text, parentContext, reader = null) => {
	if (!text) return ""

	const delims = parentContext.delimiters
	let out = ""
	let i = 0
	let currentText = text

	const escOpen = delims.open + delims.open
	const escClose = delims.close + delims.close
	const closeTagToken = `${delims.open}/${delims.close}`

	// 改行を <br>\n に変換してエスケープする
	const formatText = (segment) => escapeHtml(segment).replace(/\n/g, "<br>\n")

	while (i < currentText.length) {
		const nextIdx = findNextBracket(currentText, i, delims)

		// ブラケットがもう存在しない場合は残りをすべてエスケープして終了
		if (nextIdx === -1) {
			out += formatText(currentText.slice(i))
			break
		}

		// ブラケットまでの通常テキストを一括エスケープして追加
		if (nextIdx > i) {
			out += formatText(currentText.slice(i, nextIdx))
			i = nextIdx
		}

		// 1. エスケープ open
		if (currentText.startsWith(escOpen, i)) {
			out += escapeHtml(delims.open)
			i += escOpen.length
			continue
		}

		// 2. エスケープ close
		if (currentText.startsWith(escClose, i)) {
			out += escapeHtml(delims.close)
			i += escClose.length
			continue
		}

		// 3. 孤立した閉じタグの検出
		if (currentText.startsWith(closeTagToken, i)) {
			throw new SyntaxError(`対応する開始タグがありません: ${closeTagToken}`)
		}

		// 4. 開始タグの判定
		if (currentText.startsWith(delims.open, i)) {
			const tagHeader = parseTagHeader(currentText, i, delims)
			if (!tagHeader) {
				// タグの書式に合致しない文字は通常文字として扱う
				out += escapeHtml(delims.open)
				i += delims.open.length
				continue
			}

			const {
				html,
				nextIndex,
				text: updatedText,
			} = processInlineTag(currentText, tagHeader, parentContext, delims, reader)
			out += html
			i = nextIndex
			if (updatedText) {
				currentText = updatedText
			}
			continue
		}

		// 5. 単独の close
		if (currentText.startsWith(delims.close, i)) {
			out += escapeHtml(delims.close)
			i += delims.close.length
			continue
		}
	}

	return out
}
