const TmLibrary = require('./Library')
const TrackSyntax = require('./Track')
const FSM = require('./Context')

const instrDict = require('../Config/Instrument.json')
const drumDict = require('../Config/Percussion.json')

const instrList = Object.keys(instrDict)
const drumList = Object.keys(drumDict)

class TmSyntax {
  constructor() {
    this.Code = '' // Syntax Source Code
    this.Dict = [] // Function Attributes
    this.Alias = [] // Function Aliases
    this.Chord = [] // Chord Operators
    this.Class = [] // Prologs & Epilogs
    this.Types = {} // Token Types
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
    this.Warnings = []
    this.Errors = []
    this.Settings = []
    this.Syntax = new TmSyntax()

    this.Source = input.split(/\r?\n/g)
    this.loadFile = loader.loadFile
    this.$library = loader.$library
    this.$directory = loader.$directory

    this.$init = false
    this.$token = false
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
      const command = origin.match(/[a-zA-Z]+/)
      ptr += 1
      if (!command) continue
      const keyword = command[0].toLowerCase()
      switch (keyword) {
      case 'include':
        const name = origin.slice(command.index + keyword.length).trim()
        if (name.includes('/')) {
          this.loadLibrary(this.$directory + '/' + name, origin)
        } else {
          this.loadLibrary(this.$library.Path + '/' + name, origin)
        }
        break

      case 'chord':
      case 'function':
      case 'notation':
        const lines = []
        while (TmTokenizer.startsFalse(src, ptr, '#')) {
          lines.push(src[ptr])
          ptr += 1
        }
        this.mergeLibrary(origin, lines, keyword)
        break

      case 'end':
        this.Library.push({ Type: 'end', Head: origin })
        break

      default:
        this.Errors.push({
          Err: 'InvaildCommand',
          Pos: ptr,
          Src: origin
        })
        break
      }
    }
    this.Score = src.slice(ptr)
    this.$init = true
    return this.Syntax
  }

  tokenize(forced = false) {
    if (this.$token && !forced) return this.Sections
    this.initialize()

    this.loadLibrary(this.$library.Path + '/' + this.$library.AutoLoad)
    this.Sections = []

    const src = this.Score
    let ptr = 0, blank = 0
    let tracks = []
    let comment = []

    while (ptr < src.length) {
      if (TmTokenizer.startsTrue(src, ptr, '//')) {
        blank += 1
        if (blank >= 2 && tracks.length !== 0) {
          this.Sections.push(this.tokenizeSection(tracks, comment))
          comment = []
          tracks = []
        }
        if (src[ptr].startsWith('//')) {
          comment.push(src[ptr].slice(2))
        }
        ptr += 1
      } else {
        let code = src[ptr]
        ptr += 1
        while (TmTokenizer.startsFalse(src, ptr, '//', true)) {
          code += '\n' + src[ptr]
          ptr += 1
        }
        blank = 0
        tracks.push(code)
      }
    }
    if (tracks.length !== 0) {
      this.Sections.push(this.tokenizeSection(tracks, comment))
    }

    this.$token = true
    return this.Sections
  }

  tokenizeTrack(track) {
    let name, play = true, inst = [], degrees = ['0', '%']
    const instrDegrees = ['1', '2', '3', '4', '5', '6', '7']
    const drumDegrees = ['x']
    const meta = track.match(/^<(?:(:)?([a-zA-Z][a-zA-Z\d]*):)?/)

    if (meta) {
      play = !meta[1]
      name = meta[2]
      const syntax = new TrackSyntax(this.Syntax)
      track = track.slice(meta[0].length)
      const data = syntax.tokenize(track, 'meta')
      data.Content.forEach(tok => {
        if (tok.Type !== '@inst') {
          this.Warnings.push({
            Err: 'NotInstrument',
            Tok: tok
          })
        } else if (instrList.includes(tok.name)) {
          instrDegrees.forEach(deg => {
            if (!degrees.includes(deg)) degrees.push(deg)
          })
          inst.push({ Name: tok.name, Spec: tok.spec })
        } else if (drumList.includes(tok.name)) {
          drumDegrees.forEach(deg => {
            if (!degrees.includes(deg)) degrees.push(deg)
          })
          inst.push({ Name: tok.name, Spec: tok.spec })
        } else {
          this.Warnings.push({
            Err: 'NotInstrument',
            Tok: tok
          })
        }
      })
      track = track.slice(data.Index)
    }

    if (degrees.length === 2) {
      degrees = ['1', '2', '3', '4', '5', '6', '7', '0', '%']
    }
    const syntax = new TrackSyntax(this.Syntax, degrees)
    const result = syntax.tokenize(track, 'default')

    return {
      Play: play,
      Name: name,
      Instruments: inst,
      Content: result.Content,
      Warnings: result.Warnings
    }
  }

  tokenizeSection(tracklist, comment) {
    const result = tracklist.map(track => this.tokenizeTrack(track))
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

  loadLibrary(path, origin) {
    const data = this.loadFile(path)
    this.Syntax.load(data)
    if (origin) {
      this.Library.push({
        Type: 'include',
        Head: origin
      })
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
