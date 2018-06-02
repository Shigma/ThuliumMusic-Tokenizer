const TmLibrary = require('./Library')
const MetaSyntax = require('./Meta')
const TrackSyntax = require('./Track')
const TmError = require('../linter/Error')
const FSM = require('./Context')

class TmSyntax {
  constructor() {
    this.Code = '' // Syntax Source Code
    this.Dict = [] // Function Attributes
    this.Alias = [] // Function Aliases
    this.Chord = [] // Chord Operators
    this.Class = [] // Prologs & Epilogs
    this.Types = {} // Token Types
    this.Meta = {} // Meta Attributes
    this.Context = { // FSM Contexts
      section: [],
      default: []
    }
  }

  load(data) {
    for (const key in this) {
      if (data[key] !== undefined) {
        const result = TmLibrary['load' + key](this[key], data[key])
        if (result !== undefined) this[key] = result
      }
    }
  }
}

class TmTokenizer {
  static startsTrue(src, ptr, match, blank = true) {
    return ptr < src.length && (
      src[ptr].startsWith(match) ||
      (src[ptr].match(/^\s*$/) && blank)
    )
  }

  static startsFalse(src, ptr, match, blank = false) {
    return ptr < src.length && !(
      src[ptr].startsWith(match) ||
      (src[ptr].match(/^\s*$/) && blank)
    )
  }

  constructor(input, loader) {
    this.Comment = []
    this.Library = []
    this.Settings = []
    this.Warnings = [] // FIXME: to be deleted
    this.Errors = new TmError()
    this.Syntax = new TmSyntax()

    if (input[0] === '\uFEFF') input.splice(1, 1) // Handling BOM
    this.Source = input.split(/\r?\n/g) // Handling CRLF

    this.loadFile = loader.loadFile
    this.$library = loader.$library
    this.$directory = loader.$directory

    this.$init = false
    this.$token = false

    // For editor tracking the scopes
    this.Macro = []
    this.Scoping = {
      inst: [],
      func: [],
      pack: []
    }
    this.Index = {
      base: undefined,
      sections: []
    }
  }

  initialize(forced = false) {
    if (this.$init && !forced) return this.Syntax

    let ptr = 0
    const src = this.Source

    // Comments
    while (TmTokenizer.startsTrue(src, ptr, '//', false)) {
      this.Comment.push(src[ptr].slice(2))
      ptr += 1
    }

    // Libraries
    while (TmTokenizer.startsTrue(src, ptr, '#')) {
      const origin = src[ptr]
      const command = origin.match(/^# *([a-zA-Z]+)/)
      ptr += 1
      if (!command) continue
      const keyword = command[1].toLowerCase()
      switch (keyword) {
      case 'include': {
        const name = origin.slice(command[0].length).trim()
        this.Scoping.pack.push({
          start: TmTokenizer.position(src, ptr - 1) + command[0].length + 1,
          end: TmTokenizer.position(src, ptr) - 1
        })
        if (name.includes('/')) {
          this.loadLibrary(this.$directory + '/' + name, origin)
        } else {
          this.loadLibrary(this.$library.Path + '/' + name, origin)
        }
        break
      }

      case 'chord':
      case 'function':
      case 'notation': {
        const lines = []
        while (TmTokenizer.startsFalse(src, ptr, '#')) {
          lines.push(src[ptr])
          ptr += 1
        }
        this.mergeLibrary(origin, lines, keyword)
        break
      }

      case 'end':
        this.Library.push({ Type: 'end', Head: origin })
        break

      default:
        this.Errors.push({
          Err: TmError.Token.InvalidCommand,
          Pos: { line: ptr - 1 },
          Args: { src: command[1] },
          Rank: 2
        })
        break
      }
    }
    this.Index.base = TmTokenizer.position(src, ptr)
    this.Score = src.slice(ptr)
    this.$init = true
    return this.Syntax
  }

  static position(arr, ptr) {
    return arr.slice(0, ptr).reduce((total, curr) => {
      return total + curr.length + 1
    }, 0)
  }

  tokenize(forced = false) {
    if (this.$token && !forced) return this.Sections
    this.initialize()
    this.loadLibrary(this.$library.Path + '/' + this.$library.AutoLoad)
    this.Sections = []

    const src = this.Score
    let ptr = 0, blank = 0
    let index = { start: 0, tracks: [] }
    let tracks = [], comment = []

    while (ptr < src.length) {
      if (TmTokenizer.startsTrue(src, ptr, '//')) {
        blank += 1
        if (blank >= 2 && tracks.length !== 0) {
          this.Index.sections.push(index)
          this.Sections.push(this.tokenizeSection(tracks, comment))
          index = { start: TmTokenizer.position(src, ptr), tracks: [] }
          comment = []
          tracks = []
        }
        if (src[ptr].startsWith('//')) {
          comment.push(src[ptr].slice(2))
        }
        ptr += 1
      } else {
        const position = TmTokenizer.position(src, ptr)
        index.tracks.push(position)
        let code = src[ptr]
        ptr += 1
        while (TmTokenizer.startsFalse(src, ptr, '//', true)) {
          code += '\n' + src[ptr]
          ptr += 1
        }
        blank = 0
        tracks.push({ source: code, base: position })
      }
    }
    if (tracks.length !== 0) {
      this.Index.sections.push(index)
      this.Sections.push(this.tokenizeSection(tracks, comment))
    }

    this.$token = true
    return this.Sections
  }

  tokenizeTrack(track, index) {
    let name, play = true, instruments = [], degrees = ['0', '%']
    let code = track.source, base = track.base + this.Index.base
    const meta = code.match(/^<(?:(:)?([a-zA-Z][a-zA-Z\d]*):)?/)

    if (meta) {
      play = !meta[1]
      name = meta[2]
      code = code.slice(meta[0].length)
      const data = new MetaSyntax(this.Syntax).tokenize(code)
      const instScope = [], funcScope = []
      this.Warnings.push(data.Warnings)
      instruments = data.Instruments
      degrees = data.Degrees
      code = code.slice(data.Index)
      if (name) {
        const index = this.Macro.findIndex(macro => macro.name === name)
        if (index === -1) {
          this.Macro.push({ name, code })
        } else {
          this.Macro[index].code = code
        }
      }
      data.Scoping.forEach(scope => {
        if (scope.name === 'meta') {
          instScope.push({
            start: scope.start + meta[0].length + base,
            end: scope.end + meta[0].length + base
          })
        }
      })
      this.Scoping.inst.push(...instScope)
    }
    if (degrees.length === 2) {
      degrees.push('1', '2', '3', '4', '5', '6', '7')
    }

    const syntax = new TrackSyntax(this.Syntax, degrees)
    const result = syntax.tokenize(code, 'default')

    return {
      Play: play,
      Name: name,
      Index: index,
      Instruments: instruments,
      Content: result.Content,
      Warnings: result.Warnings
    }
  }

  tokenizeSection(tracklist, comment) {
    const result = tracklist.map((track, index) => this.tokenizeTrack(track, index))
    const prolog = [], epilog = [], settings = [], tracks = []

    result.forEach((track, index) => {
      const content = track.Content
      if (content.every(tok => !FSM.isSubtrack(tok))) {
        let sep = content.findIndex(tok => tok.Type === 'LocalIndicator')
        if (index === 0 || index === result.length - 1) {
          if (sep === -1) sep = content.length
          if (index === 0) {
            prolog.push(...content.slice(0, sep))
          } else {
            epilog.push(...content.slice(0, sep))
          }
        } else {
          sep = 0
        }
        settings.push({
          Index: index,
          Spec: content.slice(sep)
        })
      } else {
        tracks.push(track)
      }
    })

    return {
      Prolog: prolog,
      Comment: comment,
      Settings: settings,
      Tracks: tracks,
      Epilog: epilog
    }
  }

  pushError() {
    this.Errors.push()
  }

  loadLibrary(path, origin) {
    try {
      const data = this.loadFile(path)
      this.Syntax.load(data)
      if (origin) {
        this.Library.push({
          Type: 'include',
          Head: origin
        })
      }
    } catch (err) {
      this.Errors.push(new TmError('Token::Loading'))
    }
  }

  mergeLibrary(head, source, type) {
    const data = TmLibrary[type + 'Tokenize'](source)
    this.Syntax.load(data)
    this.Errors.push(...data.Errors)
    this.Warnings.push(...data.Warnings)
    this.Library.push({
      Type: type,
      Code: source,
      Head: head
    })
  }
}

module.exports = TmTokenizer
