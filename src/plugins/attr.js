const getIndent = (line) => line.match(/^[\t ]*/)[0]

/**
 * 属性定義ブロックプラグイン (@attr)
 *
 * 例:
 * @attr [[
 * # コメント
 * intro:
 * 	id = intro
 * 	title = はじめに
 *
 * external:
 * 	target = _blank
 * 	rel = noopener
 *
 * empty_group:
 * ]]
 */
export const attrPlugin = {
	name: "attr",
	tag: "attr",
	block: (body, args, context) => {
		const lines = body.split("\n")
		const result = {}
		let currentGroup = null
		let baseIndent = ""

		for (const line of lines) {
			const trimmed = line.trim()

			// 空行や # から始まるコメント行は無視
			if (!trimmed || trimmed.startsWith("#")) {
				continue
			}

			// 末尾トリムして : で終わる行はグループ宣言
			if (line.trimEnd().endsWith(":")) {
				const name = line.trimEnd().slice(0, -1).trim()
				if (!name) {
					throw new SyntaxError(`@attr のグループ名が空です: ${line}`)
				}
				currentGroup = name
				baseIndent = getIndent(line)
				if (!result[currentGroup]) {
					result[currentGroup] = []
				}
				continue
			}

			// 最初の有効行がグループ宣言でなかった場合
			if (!currentGroup) {
				throw new SyntaxError(`@attr の属性定義より前にグループ名が宣言されていません: ${line}`)
			}

			// 基準行よりインデントが深いかつ = を含む行を受け付ける
			const indent = getIndent(line)
			const eqIdx = line.indexOf("=")

			if (!indent.startsWith(baseIndent) || indent.length === baseIndent.length || eqIdx === -1) {
				throw new SyntaxError(`@attr 内の書式が不正です (key = value 形式で指定してください): ${line}`)
			}

			const key = line.slice(0, eqIdx).trim()
			let value = line.slice(eqIdx + 1).trim()

			if (!key) {
				throw new SyntaxError(`@attr のキーが空です: ${line}`)
			}

			if (key.toLowerCase() === "class") {
				throw new SyntaxError(
					`@attr "${currentGroup}" に class 属性は指定できません。クラス指定は c: を使用してください`,
				)
			}

			// バリューの前後が "" または '' で囲まれていたら外す
			if (
				(value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
				(value.startsWith("'") && value.endsWith("'") && value.length >= 2)
			) {
				value = value.slice(1, -1)
			}

			result[currentGroup].push({ key, value })
		}

		// 親スコープの属性定義オブジェクトにマージ
		Object.assign(context.parent.metadata.attrDefs, result)

		// 定義ブロックなので HTML 出力は行わない
		return ""
	},
}
