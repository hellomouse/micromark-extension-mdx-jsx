'use strict'

// Based on:
// <https://github.com/babel/babel/blob/main/packages/babel-helper-validator-identifier/scripts/generate-identifier-regex.js>

var fs = require('fs')
var path = require('path')
var regenerate = require('regenerate')
var idStart = require('@unicode/unicode-13.0.0/Binary_Property/ID_Start/code-points.js')
var idCont = require('@unicode/unicode-13.0.0/Binary_Property/ID_Continue/code-points.js')

var start = [36 /* `$` */, 95 /* `_` */].concat(idStart.filter(bpm))
var cont = [0x200c, 0x200d].concat(idCont.filter(bpm))

var startRe = regenerate().add(start).toRegExp()
var contRe = regenerate().add(cont).remove(start).toRegExp()

fs.writeFileSync(
  path.join('lib', 'util-identifier-regex.js'),
  [
    '// This module is generated by `script/`.',
    '/* eslint-disable no-misleading-character-class */',
    'exports.start = ' + startRe,
    'exports.cont = ' + contRe,
    '/* eslint-enable no-misleading-character-class */',
    ''
  ].join('\n')
)

function bpm(code) {
  return code <= 0xffff /* BMP */
}
