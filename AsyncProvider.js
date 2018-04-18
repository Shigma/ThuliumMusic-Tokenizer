const packagePath = '/api/package/'
const packageInfo = require(packagePath + 'index.json')

const loader = {
  async load(path, buffer, Tokenizer) {
    const res = await fetch(path, { method: 'get' })
    const json = await res.json()
    if (json.type === 'buffer') {
      return json.content
    } else {
      return new Tokenizer(json.content, {
        loader
      }).getLibrary()
    }
  },
  packagePath,
  packageInfo
}

module.exports = loader
