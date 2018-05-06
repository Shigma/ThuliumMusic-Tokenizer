const FSM = require('./Context')
const NoteSyntax = require('./Note')
const TrackSyntax = require('./Track')

class MetaSyntax extends TrackSyntax {
  constructor(syntax) {
    const note = new NoteSyntax([], ['1', '2', '3', '4', '5', '6', '7'])
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
            name: match[2],
            spec: content.filter(tok => tok.Type !== 'Macropitch'),
            dict: content.filter(tok => tok.Type === 'Macropitch'),
            space: match[1]
          }
        }
      }
    ]
  }

  tokenize(string, state, epi = true) {
    return new FSM(this).tokenize(string, state, epi)
  }
}

module.exports = MetaSyntax
