const Bacon = require('baconjs')
const {
  toSentence,
  computeChecksum,
  toHexString,
  radsToDeg,
  padd,
  toNmeaDegrees,
  getTalkerIDBySentence
} = require('./nmea')
const path = require('path')
const fs = require('fs')

module.exports = function (app) {
  var plugin = {
    unsubscribes: []
  }

  plugin.id = 'sk-to-nmea0183'
  plugin.name = 'Convert Signal K to NMEA0183'
  plugin.description = 'Plugin to convert Signal K to NMEA0183'

  plugin.schema = {
    type: 'object',
    title: 'Conversions to NMEA0183',
    description:
      'If there is SK data for the conversion generate the following NMEA0183 sentences from Signal K data:',
    properties: {}
  }

  plugin.start = function (options) {
    const selfContext = 'vessels.' + app.selfId
    const selfMatcher = delta => delta.context && delta.context === selfContext

    function mapToNmea (encoder) {
      const selfStreams = encoder.keys.map((key, index) => {
        let stream = app.streambundle.getSelfStream(key)
        if (encoder.defaults && typeof encoder.defaults[index] != 'undefined') {
          stream = stream.merge(Bacon.once(encoder.defaults[index]))
        }
        return stream
      }, app.streambundle)
      plugin.unsubscribes.push(
        Bacon.combineWith(function () {
          try {
            return encoder.f.apply(this, arguments)
          } catch (e) {
            console.error(e.message)
          }
        }, selfStreams)
          .filter(v => typeof v !== 'undefined')
          .changes()
          .debounceImmediate(20)
          .onValue(nmeaString => {
            app.emit('nmea0183out', nmeaString)
          })
      )
    }
    Object.keys(plugin.sentences).forEach(name => {
      if (options[name].active) {
        mapToNmea(plugin.sentences[name])
      }
    })
  }

  plugin.stop = function () {
    plugin.unsubscribes.forEach(f => f())
  }

  function updatePluginOptions () {
//  var configuration  = app.getPluginOptions(plugin.id)
//  console.log(configuration)
    app.savePluginOptions({}, err => {
      if ( err ) {
        app.error(err.toString())
        res.status(500)
        res.send("can't save config")
      } else {
          res.send('ok')
        }
    })
  }

updatePluginOptions()
  plugin.sentences = loadSentences(app, plugin)
  buildSchemaFromSentences(plugin)
  return plugin
}

function buildSchemaFromSentences (plugin) {
  Object.keys(plugin.sentences).forEach(key => {
    var sentence = plugin.sentences[key]
    plugin.schema.properties[key] = {
      title: sentence['title'],
      type: 'object',
      properties: {
        active: {
          type: 'boolean',
          default: false
        },
        talkerID: {
          type: 'string',
          default: getTalkerIDBySentence(key)
        }
      }
    }
  })
}

function loadSentences (app, plugin) {
  const fpath = path.join(__dirname, 'sentences')
  return fs
    .readdirSync(fpath)
    .filter(filename => filename.endsWith('.js'))
    .reduce((acc, fname) => {
      let sentence = path.basename(fname, '.js')
      acc[sentence] = require(path.join(fpath, sentence))(app, plugin)
      return acc
    }, {})
}
