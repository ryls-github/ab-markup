import { listPlugin } from "./plugins/list.js"
import { tablePlugin } from "./plugins/table.js"
import { smartStylePlugin } from "./plugins/style.js"
import { attrPlugin } from "./plugins/attr.js"
import { bracketPlugin } from "./plugins/bracket.js"
import {
	boldPlugin,
	delPlugin,
	linkPlugin,
	commentPlugin,
	hrPlugin,
	headingPlugin,
	quotePlugin,
	rubyPlugin,
	mediaPlugin,
	codePlugin,
	tagPlugin,
	calloutPlugin,
	notePlugin,
	titlePlugin,
	datePlugin,
	tagsPlugin,
	templatePlugin,
	htmlPlugin,
	rawPlugin,
	stylePlugin,
} from "./plugins/basic.js"

const blockHandlers = new Map()
const inlineHandlers = new Map()

/**
 * プラグインの登録（可変長引数・配列展開対応）
 * @param {...object} plugins プラグイン定義オブジェクト群
 */
export const register = (...plugins) => {
	for (const plugin of plugins.flat(Infinity)) {
		if (!plugin) continue

		// tag または name からタグ一覧を解決
		const rawTag = plugin.tag !== undefined ? plugin.tag : plugin.name
		const tags = Array.isArray(rawTag) ? rawTag : [rawTag]

		for (const t of tags) {
			if (plugin.block) {
				blockHandlers.set(t, plugin.block)
			}
			if (plugin.inline) {
				inlineHandlers.set(t, plugin.inline)
			}
		}
	}
}

/**
 * ブロックプラグインの取得
 * @param {string} tag
 * @returns {Function|null}
 */
export const get = (tag) => blockHandlers.get(tag) || null

/**
 * ブロックプラグインの存在確認
 * @param {string} tag
 * @returns {boolean}
 */
export const has = (tag) => blockHandlers.has(tag)

/**
 * インラインプラグインの取得
 * @param {string} tag
 * @returns {Function|null}
 */
export const getInline = (tag) => inlineHandlers.get(tag) || null

/**
 * インラインプラグインの存在確認
 * @param {string} tag
 * @returns {boolean}
 */
export const hasInline = (tag) => inlineHandlers.has(tag)

// デフォルトプラグインの一括登録（可変長引数）
register(
	listPlugin,
	tablePlugin,
	stylePlugin,
	smartStylePlugin,
	attrPlugin,
	bracketPlugin,
	boldPlugin,
	delPlugin,
	linkPlugin,
	commentPlugin,
	hrPlugin,
	headingPlugin,
	quotePlugin,
	rubyPlugin,
	mediaPlugin,
	codePlugin,
	tagPlugin,
	calloutPlugin,
	notePlugin,
	titlePlugin,
	datePlugin,
	tagsPlugin,
	templatePlugin,
	htmlPlugin,
	rawPlugin,
)

export const registry = {
	register,
	get,
	has,
	getInline,
	hasInline,
}
