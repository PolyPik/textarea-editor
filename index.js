const escape = require('escape-string-regexp');

/**
 * Formats
 */

const formats = {
  // bold text
  bold: {
    prefix: '**',
    suffix: '**'
  },

  // italic text
  italic: {
    prefix: '_',
    suffix: '_'
  },

  // insert link
  link: {
    prefix: {
      value: '[',
      pattern: '\\[',
      antipattern: '\\!\\['
    },
    suffix: {
      value: text => `](${prompt('URL:')})`,
      pattern: '\\]\\(.*?\\)'
    }
  },

  // insert image
  image: {
    prefix: '![',
    suffix: {
      value: text => `](${prompt('URL:')})`,
      pattern: '\\]\\(.*?\\)'
    }
  },

  // insert image
  code: {
    block: true,
    prefix: '```\n',
    suffix: '\n```'
  },

  // insert h1
  header1: {
    prefix: '# '
  },

  // insert h2
  header2: {
    prefix: '## '
  },

  // insert h3
  header3: {
    prefix: '### '
  },

  // insert ordered list
  orderedList: {
    block: true,
    multiline: true,
    prefix: {
      value: (line, index) => `${index + 1}. `,
      pattern: '[0-9]+\. '
    }
  },

  // insert unordered list
  unorderedList: {
    block: true,
    multiline: true,
    prefix: '- '
  },

  // insert blockquote
  blockquote: {
    block: true,
    multiline: true,
    prefix: '> '
  }
};

class Editor {
  /**
   * Constructor
   *
   * @param {Element} el
   */

  constructor(el) {
    this.el = el;
  }

  /**
   * Set or get range
   *
   * @param {Array} [range]
   * @return {Array|Editor}
   */

  range(range) {
    const el = this.el;
    if (range == null) return [el.selectionStart, el.selectionEnd];
    this.focus();
    [el.selectionStart, el.selectionEnd] = range;
    return this;
  }

  /**
   * Insert text at cursor
   *
   * @param {String} text
   * @return {Editor}
   */

  insert(text) {
    this.el.contentEditable = true;
    this.focus();
    document.execCommand('insertText', false, text);
    this.el.contentEditable = false;
    return this;
  }

  /**
   * Set foucs on the editor's element
   *
   * @return {Editor}
   */

  focus() {
    if (document.activeElement !== this.el) this.el.focus();
    return this;
  }

  /**
   * Get selected text
   *
   * @return {Object}
   */

  selection() {
    const [start, end] = this.range();
    const value = normalizeNewlines(this.el.value);
    return {
      before: value.slice(0, start),
      content: value.slice(start, end),
      after: value.slice(end)
    }
  }

  /**
   * Get format by name
   *
   * @param {String|Object} format
   * @return {Object}
   */

  getFormat(format) {
    if (typeof format == 'object') {
      return normalizeFormat(format);
    }

    if (!formats.hasOwnProperty(format)) {
      throw new Error(`Invalid format ${format}`);
    }

    return normalizeFormat(formats[format]);
  }

  /**
   * Execute command with format
   *
   * @param {String} command
   * @param {String} name - name of format
   * @return {Editor}
   */

  exec(command, name) {
    switch (command) {
      case 'format':
        return this.format(name);
      case 'unformat':
        return this.unformat(name);
      case 'toggle':
        return this.toggle(name);
      default:
        throw new Error(`Invalid command ${command}`);
    }
  }

  /**
   * Toggle `format` on current selection
   *
   * @param {Object} format
   * @return {Editor}
   */

  toggle(format) {
    if (this.hasFormat(format)) return this.unformat(format);
    return this.format(format);
  }


  /**
   * Format current selcetion with `format`
   *
   * @param {String} name - name of format
   * @return {Editor}
   */

  format(name) {
    const format = this.getFormat(name);
    const {prefix, suffix, multiline} = format;
    let {before, content, after} = this.selection();
    let lines = multiline ? content.split('\n') : [content];
    let [start, end] = this.range();

    // format lines
    lines = lines.map((line, index) => {
      const pval = maybeCall(prefix.value, line, index);
      const sval = maybeCall(suffix.value, line, index);

      if (!multiline || !content.length) {
        start += pval.length;
        end += pval.length;
      } else {
        end += pval.length + sval.length;
      }

      return pval + line + sval;
    });

    let insert = lines.join('\n');

    // newlines before and after block
    if (format.block) {
      let nlb = matchLength(before, /\n+$/);
      let nla = matchLength(after, /^\n+/);

      while (before && nlb < 2) {
        insert = `\n${insert}`;
        start++;
        end++;
        nlb++;
      }

      while (after && nla < 2) {
        insert = `${insert}\n`;
        nla++;
      }
    }

    this.insert(insert);
    this.range([start, end]);
    return this;
  }

  /**
   * Remove given formatting from current selection
   *
   * @param {String} name - name of format
   * @return {Editor}
   */

  unformat(name) {
    const format = this.getFormat(name);
    const {prefix, suffix, multiline} = format;
    const {before, content, after} = this.selection();
    let lines = multiline ? content.split('\n') : [content];
    let [start, end] = this.range();

    // If this is not a multiline format, include prefixes and suffixes just
    // outside the selection.
    if (!multiline && hasSuffix(before, prefix) && hasPrefix(after, suffix)) {
      start -= suffixLength(before, prefix);
      end += prefixLength(after, suffix);
      this.range([start, end]);
      lines = [this.selection().content];
    }

    // remove formatting from lines
    lines = lines.map((line) => {
      const plen = prefixLength(line, prefix);
      const slen = suffixLength(line, suffix);
      return line.slice(plen, line.length - slen);
    })

    // insert and set selection
    let insert = lines.join('\n');
    this.insert(insert);
    this.range([start, start + insert.length]);

    return this;
  }

  /**
   * Check if current seletion has given format
   *
   * @param {String} name - name of format
   * @return {Boolean}
   */

  hasFormat(name) {
    const format = this.getFormat(name);
    const {prefix, suffix, multiline} = format;
    const {before, content, after} = this.selection();
    const lines = content.split('\n');

    // prefix and suffix outside selection
    if (!multiline) {
      return (hasSuffix(before, prefix) && hasPrefix(after, suffix))
        || (hasPrefix(content, prefix) && hasSuffix(content, suffix))
    }

    // check which line(s) are formatted
    const formatted = lines.filter((line) => {
      return hasPrefix(line, prefix) && hasSuffix(line, suffix);
    });

    return formatted.length == lines.length;
  }
}

/**
 * Expose formats
 */

Editor.formats = formats;

/**
 * Check if given prefix is present
 */

function hasPrefix(text, prefix) {
  let exp = new RegExp(`^${prefix.pattern}`);
  let result = exp.test(text);

  if (prefix.antipattern) {
    let exp = new RegExp(`^${prefix.antipattern}`);
    result = result && !exp.test(text);
  }

  return result;
}

/**
 * Check if given suffix is present
 */

function hasSuffix(text, suffix) {
  let exp = new RegExp(`${suffix.pattern}$`);
  let result = exp.test(text);

  if (suffix.antipattern) {
    let exp = new RegExp(`${suffix.antipattern}$`);
    result = result && !exp.test(text);
  }

  return result;
}

/**
 * Get length of match
 */

function matchLength (text, exp) {
  const match = text.match(exp);
  return match ? match[0].length : 0;
}

/**
 * Get prefix length
 */

function prefixLength (text, prefix) {
  const exp = new RegExp(`^${prefix.pattern}`);
  return matchLength(text, exp);
}

/**
 * Check suffix length
 */

function suffixLength (text, suffix) {
  let exp = new RegExp(`${suffix.pattern}$`);
  return matchLength(text, exp);
}

/**
 * Normalize newlines
 */

function normalizeNewlines(str) {
  return str.replace('\r\n', '\n');
}

/**
 * Normalize format
 */

function normalizeFormat(format) {
  const clone = Object.assign({}, format);
  clone.prefix = normalizePrefixSuffix(format.prefix);
  clone.suffix = normalizePrefixSuffix(format.suffix);
  return clone;
}

/**
 * Normalize prefixes and suffixes
 */

function normalizePrefixSuffix(value = '') {
  if (typeof value == 'object') return value;
  return {
    value: value,
    pattern: escape(value)
  };
}

/**
 * Call if function
 */

function maybeCall(value, ...args) {
  return typeof value == 'function'
    ? value(...args)
    : value;
}

/**
 * Expose `Editor`
 */

module.exports = Editor;