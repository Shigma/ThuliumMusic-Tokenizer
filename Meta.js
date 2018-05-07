const FSM = require('./Context')
const NoteSyntax = require('./Note')
const TrackSyntax = require('./Track')

const instDict = require('../Config/Instrument.json')
const percDict = require('../Config/Percussion.json')

const instList = Object.keys(instDict)
const percList = Object.keys(percDict)

const scaleDegrees = ['1', '2', '3', '4', '5', '6', '7']

class MetaSyntax extends TrackSyntax {
  constructor(syntax) {
    const note = new NoteSyntax([], scaleDegrees)
    super(syntax)

    this.meta = [
      {
        patt: /^>/,
        pop: true
      },
      {
        patt: /^(\s*)([a-zA-Z][a-zA-Z\d]*)/,
        push: [
          {
            patt: /^(?=>)/,
            pop: true
          },
          {
            patt: /^,/,
            pop: true
          },
          FSM.include('alias'),
          FSM.include('nonalias'),
          FSM.item('Macropitch', /^\[([a-zA-Z])\]/),
          {
            patt: /^\[([a-zA-Z])=/,
            push: [
              {
                patt: /^\]/,
                pop: true
              },
              {
                patt: new RegExp('^' + note.pitch()),
                token(match) {
                  return {
                    Degree: match[1],
                    PitOp: match[2],
                    Chord: match[3],
                    VolOp: match[4]
                  }
                }
              }
            ],
            token(match, content) {
              return {
                Type: 'Macropitch',
                Content: match[1],
                Pitches: content
              }
            }
          },
          FSM.item('Space', /^(\s+)/)
        ],
        token(match, content) {
          return {
            Type: '@inst',
            content: content,
            name: match[2],
            space: match[1]
          }
        }
      }
    ]
  }

  tokenize(string) {
    const instruments = [], warnings = [], degrees = ['0', '%']
    const result = new FSM(this).tokenize(string, 'meta')
    result.Content.forEach(tok => {
      const dict = tok.content.filter(tok => tok.Type === 'Macropitch')
      const spec = tok.content.filter(tok => tok.Type !== 'Macropitch')
      if (instList.includes(tok.name)) {
        if (!degrees.includes('1')) degrees.push(...scaleDegrees)
        const pitchDict = {}
        dict.forEach(macro => {
          if (Object.keys(pitchDict).includes(macro.Content)) {
            warnings.push({ Err: 'DupMacroPitch', Args: { Name: macro.Content } })
          } else if (macro.Pitches) {
            pitchDict[macro.Content] = macro.Pitches
          } else {
            warnings.push({ Err: 'NoPitchDef', Args: { Name: macro.Content } })
          }
        })
        instruments.push({
          Name: tok.name,
          Spec: spec,
          Dict: pitchDict,
          Space: tok.space
        })
      } else if (percList.includes(tok.name)) {
        if (!degrees.includes('x')) degrees.push('x')
        const pitchData = [{
          Degree: percDict[tok.name] - 60,
          PitOp: '', Chord: '', VolOp: ''
        }]
        const pitchDict = { x: pitchData }
        dict.forEach(macro => {
          if (Object.keys(pitchDict).includes(macro.Content)) {
            warnings.push({ Err: 'DupMacroPitch', Args: { Name: macro.Content } })
          } else if (macro.Pitches) {
            warnings.push({ Err: 'PitchDef', Args: { Name: macro.Content } })
          } else {
            pitchDict[macro.Content] = pitchData
          }
        })
        instruments.push({
          Name: tok.name,
          Spec: spec,
          Dict: pitchDict,
          Space: tok.space 
        })
      } else {
        warnings.push({ Err: 'NotInstrument', Args: { Name: tok.name } })
      }
    })

    return {
      Instruments: instruments,
      Warnings: warnings,
      Degrees: degrees,
      Index: result.Index
    }
  }
}

module.exports = MetaSyntax
