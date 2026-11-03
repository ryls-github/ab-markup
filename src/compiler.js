import { scanAndRender } from "./scanner.js"

/**
 * AB ソーステキストをパースして本文 HTML 文字列とメタデータを生成する
 * @param {string} source
 * @returns {{ html: string, metadata: Record<string, string> }}
 */
export const compile = (source) => {
	const metadata = {}
	const html = scanAndRender(source, metadata)

	return { html, metadata }
}
