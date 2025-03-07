/**
 * @typedef {import('micromark-util-types').Extension} Extension
 * @typedef {{
 *   parse: typeof import('acorn').Parser.parse,
 *   parseExpressionAt: typeof import('acorn').Parser.parseExpressionAt
 * }} Acorn
 * @typedef {import('acorn').Options} AcornOptions
 */

/**
 * @typedef Options
 *   Configuration (optional).
 * @property {Acorn | null | undefined} [acorn]
 *   Acorn parser to use (optional).
 * @property {AcornOptions | null | undefined} [acornOptions]
 *   Configuration for acorn (default: `{ecmaVersion: 2024, locations: true,
 *   sourceType: 'module'}`); all fields except `locations` can be set.
 * @property {boolean | null | undefined} [addResult=false]
 *   Whether to add `estree` fields to tokens with results from acorn
 *   (default: `false`).
 */

import {codes} from 'micromark-util-symbol'
import {jsxText} from './jsx-text.js'
import {jsxFlow} from './jsx-flow.js'

/**
 * Create an extension for `micromark` to enable MDX JSX syntax.
 *
 * @param {Options | null | undefined} [options]
 *   Configuration (optional).
 * @returns {Extension}
 *   Extension for `micromark` that can be passed in `extensions` to enable MDX
 *   JSX syntax.
 */
export function mdxJsx(options) {
  const settings = options || {}
  const acorn = settings.acorn
  /** @type {AcornOptions | undefined} */
  let acornOptions

  if (acorn) {
    if (!acorn.parse || !acorn.parseExpressionAt) {
      throw new Error(
        'Expected a proper `acorn` instance passed in as `options.acorn`'
      )
    }

    acornOptions = Object.assign(
      {ecmaVersion: 2024, sourceType: 'module'},
      settings.acornOptions,
      {locations: true}
    )
  } else if (settings.acornOptions || settings.addResult) {
    throw new Error('Expected an `acorn` instance passed in as `options.acorn`')
  }

  return {
    flow: {
      [codes.lessThan]: jsxFlow(acorn || undefined, {
        acornOptions,
        addResult: settings.addResult || undefined
      })
    },
    text: {
      [codes.lessThan]: jsxText(acorn || undefined, {
        acornOptions,
        addResult: settings.addResult || undefined
      })
    }
  }
}

export function mdastExtraJsxFlow() {
  return { canContainEols: ['mdxJsxFlowElement'] };
};
