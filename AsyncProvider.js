const packagePath = '/api/package/'
const packageInfo = require(packagePath + 'index.json')

const loader = {
  load (path, buffer, Tokenizer) {
    let packageData
    if (buffer && fs.existsSync(path + '/buffer.json')) {
      packageData = require(path + '/buffer.json')
    } else {
      packageData = new Tokenizer(fs.readFileSync(path + '/main.tml', 'utf8'), {
        loader
      }).getLibrary()
      // console.log(packageData);
      fs.writeFileSync(path + '/buffer.json', JSON.stringify(packageData), 'utf8')
    }
    return packageData
  },
  packagePath,
  packageInfo
}

module.exports = loader
