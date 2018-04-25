/**
 * parse jsdoc-like string to provide useful info
 * @param {string} doc jsdoc-like string
 */
function parse(doc) {
  const lines = doc.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
  const params = {}
  const aliases = []
  if (!lines.every((line) => line.startsWith('*'))) return null
  for (const line of lines) {
    const content = line.slice(1).trim()
    if (content.startsWith('@param')) {
      const match = content.match(/^@param *{([A-Za-z0-9|]+)} *([^ ]+)/)
      params[match[2]] = match[1].split('|')
    } else if (content.startsWith('@alias')) {
      aliases.push(content.match(/^@alias *(.*)$/)[1]) // TODO: change to real pattern
    }
  }
  return {
    params,
    aliases
  }
}

module.exports = parse