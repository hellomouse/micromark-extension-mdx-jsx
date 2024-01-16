/**
 * @typedef {import('./syntax.js').Acorn} Acorn
 * @typedef {import('acorn').Options} AcornOptions
 * @typedef {import('micromark-util-types').Code} Code
 * @typedef {import('micromark-util-types').Construct} Construct
 * @typedef {import('micromark-util-types').ConstructRecord} ConstructRecord
 * @typedef {import('micromark-util-types').Resolver} Resolver
 * @typedef {import('micromark-util-types').State} State
 * @typedef {import('micromark-util-types').TokenizeContext} TokenizeContext
 * @typedef {import('micromark-util-types').Tokenizer} Tokenizer
 */

/**
 * @typedef Options
 *   Configuration.
 * @property {AcornOptions | undefined} acornOptions
 *   Acorn options.
 * @property {boolean | undefined} addResult
 *   Whether to add `estree` fields to tokens with results from acorn.
 */

import { ok as assert } from 'devlop'
import { factoryMdxExpression } from 'micromark-factory-mdx-expression'
import { factorySpace } from 'micromark-factory-space'
import { markdownLineEnding, markdownSpace } from 'micromark-util-character'
import { codes, constants, types } from 'micromark-util-symbol'
import { factoryTag } from './factory-tag.js'

// note: some parts of this file are copied or derived from
// <https://github.com/micromark/micromark/blob/929275e2ccdfc8fd54adb1e1da611020600cc951/packages/micromark/dev/lib/initialize/text.js>

/**
 * Parse JSX (flow).
 *
 * @param {Acorn | undefined} acorn
 *   Acorn parser to use (optional).
 * @param {Options} options
 *   Configuration.
 * @returns {Construct}
 *   Construct.
 */
export function jsxFlow(acorn, options) {
  /** @type {Construct} */
  const jsxFlowTag = { tokenize: tokenizeJsxFlowTag, concrete: true };

  return {
    name: 'mdxJsxFlow',
    tokenize: tokenizeJsxFlow,
    resolve: resolveJsxFlow,
    concrete: true,
  };

  /**
   * Tokenize JSX flow chunk
   *
   * @this {TokenizeContext}
   * @type {Tokenizer}
   */
  function tokenizeJsxFlow(effects, ok, nok) {
    const self = this;
    const inlineConstructs = Object.assign({}, this.parser.constructs.text);

    /**
     * Remove named construct from `constructs`
     * @param {number} code Code containing construct
     * @param {string} name Name of construct
     */
    function removeConstruct(code, name) {
      let list = inlineConstructs[code];
      if (Array.isArray(list)) {
        inlineConstructs[code] = list.filter(c => c.name !== name);
      } else if (list?.name === name) {
        inlineConstructs[code] = undefined;
      }
    }

    // remove some constructs that we handle ourselves
    removeConstruct(codes.lessThan, 'mdxJsxTextTag');
    removeConstruct(codes.leftCurlyBrace, 'mdxTextExpression');
    removeConstruct(codes.carriageReturn, 'lineEnding');
    removeConstruct(codes.lineFeed, 'lineEnding');
    removeConstruct(codes.carriageReturnLineFeed, 'lineEnding');

    return start;

    /**
     * Handle start of chunk
     *
     * ```markdown
     * > | <div>hi
     *     ^
     * ```
     *
     * @type {State}
     */
    function start(code) {
      return effects.attempt(jsxFlowTag, afterTag, nok)(code);
    }

    /**
     * After a valid tag
     *
     * ```markdown
     * > | <div>
     *          ^
     * ```
     *
     * @type {State}
     */
    function afterTag(code) {
      // try to eat spaces and then a newline or eof, or reparse as text
      return effects.attempt({
        tokenize(effects, ok, nok) {
          return tryLine;

          /** @type {State} */
          function tryLine(code) {
            if (markdownSpace(code)) {
              return factorySpace(effects, tryLine, types.lineSuffix)(code);
            } else if (markdownLineEnding(code)) {
              effects.enter('lineEnding');
              effects.consume(code);
              effects.exit('lineEnding');
              return ok;
            } else if (code === codes.eof) {
              return ok(code);
            } else {
              return nok(code);
            }
          }
        }
      }, afterTagLineEnding, maybeConstruct)(code);
    }

    /**
     * After newline following valid tag
     *
     * ```markdown
     *   | <div>
     * > |
     *     ^
     * ```
     *
     * @type {State}
     */
    function afterTagLineEnding(code) {
      if (markdownSpace(code)) {
        return factorySpace(effects, afterTagLineEnding, types.linePrefix)(code);
      } else if (markdownLineEnding(code) || code === codes.eof) {
        // end of block
        return end(code);
      } else {
        return maybeConstruct(code);
      }
    }

    /**
     * Handle what could be a construct
     * @type {State}
     */
    function maybeConstruct(code) {
      if (isBreak(code)) {
        return tryLocalConstructs(code);
      } else {
        return notConstruct(code);
      }
    }

    /**
     * Try local constructs (`jsxFlowTag` and `expression`)
     *
     * @type {State}
     */
    function tryLocalConstructs(code) {
      if (code === codes.lessThan) {
        return effects.attempt(jsxFlowTag, afterTag, tryInlineConstructs)(code);
      } else if (code === codes.leftCurlyBrace) {
        return mdxExpression(code);
      } else if (markdownLineEnding(code)) {
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return afterLineEnding;
      } else if (code === codes.eof) {
        return nok(code);
      } else {
        return tryInlineConstructs(code);
      }
    }

    /**
     * Try inline constructs (from `constructs.text`)
     *
     * @type {State}
     */
    function tryInlineConstructs(code) {
      return effects.attempt(inlineConstructs, tryLocalConstructs, notConstruct)(code);
    }

    /**
     * Handle something that isn't a construct
     *
     * @type {State}
     */
    function notConstruct(code) {
      effects.enter(types.data);
      effects.consume(code);
      return data;
    }

    /**
     * Determine if a code should interrupt the data token
     * @param {Code} code
     * @returns {boolean}
     */
    function isBreak(code) {
      if (
        code === codes.lessThan ||
        code === codes.leftCurlyBrace ||
        code === codes.eof ||
        markdownLineEnding(code)
      ) {
        return true;
      }

      let list = inlineConstructs[code];
      if (list) {
        assert(Array.isArray(list), 'constructs is not an array?');
        for (let construct of list) {
          if (!construct.previous || construct.previous.call(self, self.previous)) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Handle data chunk
     *
     * @type {State}
     */
    function data(code) {
      if (isBreak(code)) {
        effects.exit('data');
        return tryLocalConstructs(code);
      } else {
        effects.consume(code);
        return data;
      }
    }

    /**
     * Handle expression
     *
     * ```markdown
     * > | <div>{`hello`}
     *          ^
     * ```
     *
     * @type {State}
     */
    function mdxExpression(code) {
      return factoryMdxExpression.call(
        self,
        effects,
        maybeConstruct,
        'mdxTextExpression',
        'mdxTextExpressionMarker',
        'mdxTextExpressionChunk',
        // @ts-ignore acorn type defintion issues
        acorn,
        options.acornOptions,
        options.addResult,
        false, // spread
        true, // allowEmpty
        false, // allowLazy
      )(code);
    }

    /**
     * Handle after line ending in continuation
     *
     * ```markdown
     *   | <div>hello,
     * > | world
     *     ^
     * ```
     *
     * @type {State}
     */
    function afterLineEnding(code) {
      if (markdownSpace(code)) {
        return factorySpace(effects, afterLineEnding, types.linePrefix)(code);
      } else if (markdownLineEnding(code) || code === codes.eof) {
        // cannot end block here
        return nok(code);
      } else {
        return maybeConstruct(code);
      }
    }

    /**
     * End of chunk
     *
     * ```markdown
     * > | <div>hello</div>
     *                     ^
     * ```
     *
     * @type {State}
     */
    function end(code) {
      return ok(code);
    }
  }

  /**
   * Merge adjacent `data` events and handle line endings. Code is copied from
   * <https://github.com/micromark/micromark/blob/929275e2ccdfc8fd54adb1e1da611020600cc951/packages/micromark/dev/lib/initialize/text.js#L102>
   *
   * @type {Resolver}
   */
  function resolveJsxFlow(events, context) {
    let index = -1
    /** @type {number | undefined} */
    let enter

    // A rather boring computation (to merge adjacent `data` events) which
    // improves mm performance by 29%.
    while (++index <= events.length) {
      if (enter === undefined) {
        if (events[index] && events[index][1].type === types.data) {
          enter = index
          index++
        }
      } else if (!events[index] || events[index][1].type !== types.data) {
        // Don’t do anything if there is one data token.
        if (index !== enter + 2) {
          events[enter][1].end = events[index - 1][1].end
          events.splice(enter + 2, index - enter - 2)
          index = enter + 2
        }

        enter = undefined
      }
    }

    let eventIndex = 0 // Skip first.

    while (++eventIndex <= events.length) {
      if (
        (eventIndex === events.length ||
          events[eventIndex][1].type === types.lineEnding) &&
        events[eventIndex - 1][1].type === types.data
      ) {
        const data = events[eventIndex - 1][1]
        const chunks = context.sliceStream(data)
        let index = chunks.length
        let bufferIndex = -1
        let size = 0
        /** @type {boolean | undefined} */
        let tabs

        while (index--) {
          const chunk = chunks[index]

          if (typeof chunk === 'string') {
            bufferIndex = chunk.length

            while (chunk.charCodeAt(bufferIndex - 1) === codes.space) {
              size++
              bufferIndex--
            }

            if (bufferIndex) break
            bufferIndex = -1
          }
          // Number
          else if (chunk === codes.horizontalTab) {
            tabs = true
            size++
          } else if (chunk === codes.virtualSpace) {
            // Empty
          } else {
            // Replacement character, exit.
            index++
            break
          }
        }

        if (size) {
          const token = {
            type:
              eventIndex === events.length ||
              tabs ||
              size < constants.hardBreakPrefixSizeMin
                ? types.lineSuffix
                : types.hardBreakTrailing,
            start: {
              line: data.end.line,
              column: data.end.column - size,
              offset: data.end.offset - size,
              _index: data.start._index + index,
              _bufferIndex: index
                ? bufferIndex
                : data.start._bufferIndex + bufferIndex
            },
            end: Object.assign({}, data.end)
          }

          data.end = Object.assign({}, token.start)

          if (data.start.offset === data.end.offset) {
            Object.assign(data, token)
          } else {
            events.splice(
              eventIndex,
              0,
              ['enter', token, context],
              ['exit', token, context]
            )
            eventIndex += 2
          }
        }

        eventIndex++
      }
    }

    return events
  }

  /**
   * MDX JSX (flow).
   *
   * ```markdown
   * > | <A />
   *     ^^^^^
   * ```
   *
   * @this {TokenizeContext}
   * @type {Tokenizer}
   */
  function tokenizeJsxFlowTag(effects, ok, nok) {
    const self = this

    return start

    /**
     * Start of MDX: JSX (flow).
     *
     * ```markdown
     * > | <A />
     *     ^
     * ```
     *
     * @type {State}
     */
    function start(code) {
      // To do: in `markdown-rs`, constructs need to parse the indent themselves.
      // This should also be introduced in `micromark-js`.
      assert(code === codes.lessThan, 'expected `<`');
      return factoryTag.call(
        self,
        effects,
        ok,
        nok,
        acorn,
        options.acornOptions,
        options.addResult,
        false,
        'mdxJsxFlowTag',
        'mdxJsxFlowTagMarker',
        'mdxJsxFlowTagClosingMarker',
        'mdxJsxFlowTagSelfClosingMarker',
        'mdxJsxFlowTagName',
        'mdxJsxFlowTagNamePrimary',
        'mdxJsxFlowTagNameMemberMarker',
        'mdxJsxFlowTagNameMember',
        'mdxJsxFlowTagNamePrefixMarker',
        'mdxJsxFlowTagNameLocal',
        'mdxJsxFlowTagExpressionAttribute',
        'mdxJsxFlowTagExpressionAttributeMarker',
        'mdxJsxFlowTagExpressionAttributeValue',
        'mdxJsxFlowTagAttribute',
        'mdxJsxFlowTagAttributeName',
        'mdxJsxFlowTagAttributeNamePrimary',
        'mdxJsxFlowTagAttributeNamePrefixMarker',
        'mdxJsxFlowTagAttributeNameLocal',
        'mdxJsxFlowTagAttributeInitializerMarker',
        'mdxJsxFlowTagAttributeValueLiteral',
        'mdxJsxFlowTagAttributeValueLiteralMarker',
        'mdxJsxFlowTagAttributeValueLiteralValue',
        'mdxJsxFlowTagAttributeValueExpression',
        'mdxJsxFlowTagAttributeValueExpressionMarker',
        'mdxJsxFlowTagAttributeValueExpressionValue'
      )(code);
    }
  }
}
