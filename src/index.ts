const startTag = '<';
const endTag = '>';
const startComment = '!--';
const docType = '!doctype';
const forwardSlash = '/';
const backSlash = '\\';
const space = ' ';
const newLine = '\n';
const equals = '=';
const doubleQuote = `"`;
const implicitClose = /^(meta|link|br|hr)$/;
const validAttribute = /^[a-z][a-z0-9-]+$/;

interface ParserAttribute {
  name: string;
  value: string;
}

interface DocumentNode {
  type: 'document';
  docType: string;
  children: Array<ElementNode | CommentNode | TextNode>;
}

interface ElementNode {
  type: 'element';
  tag: string;
  selfClose: boolean;
  children: Array<ElementNode | CommentNode | TextNode>;
  attributes: Array<ParserAttribute>;
}

interface CommentNode {
  type: 'comment';
  text: string;
}

interface TextNode {
  type: 'text';
  text: string;
}

type ParserNode = DocumentNode | ElementNode | CommentNode | TextNode;

function parse(html: string) {
  let index = 0;
  let line = 1;
  let column = 1;
  let max = html.length;

  const root: DocumentNode = { type: 'document', docType: 'html', children: [] };
  let currentTag: ParserNode = root;
  const stack: ParserNode[] = [currentTag];

  class Position {
    line: number;
    column: number;

    constructor(l = line, c = column) {
      this.line = l;
      this.column = c;
    }

    toString() {
      return `${this.line}:${this.column}`;
    }
  }

  const throwError = (error) => {
    const location = new Position();
    const { line, column } = location;
    const source = html.split('\n')[line - 1];

    error.origin = source + '\n' + ' '.repeat(column - 2) + '^';
    error.location = location;

    throw error;
  };

  const next = () => html.charAt(index + 1);
  const lookAhead = (range) => html.substr(index, range);
  const previous = () => html.charAt(index - 1);
  const current = () => html.charAt(index);

  const expectedItemError = (expectedValue) => {
    throwError(new SyntaxError(`Unexpected "${current()}". Expected ${expectedValue} at ${new Position()}`));
  };

  const expect = (value) => {
    if (current() === value) {
      return skip();
    }

    expectedItemError(value);
  };

  const iterate = (fn) => {
    let last = index;
    let stop = false;

    while (index < max) {
      stop = fn();

      if (stop === true) break;

      if (last === index) {
        throwError(new Error(`Infinite loop at ${new Position()}`));
      }

      last = index;
    }
  };

  const skip = (amount = 1) => {
    while (amount) {
      index++;
      amount--;

      if (current() === newLine) {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
  };

  const skipUntil = (condition) => {
    let initialPosition = index;
    let chars = 0;
    let result = '';

    iterate(() => {
      if (condition()) {
        result = html.substr(initialPosition, chars);
        return true;
      }

      skip();
      chars++;
    });

    return result;
  };

  const skipSpaces = () => {
    const condition = () => current() !== space && current() !== newLine;

    if (!condition()) {
      skipUntil(condition);
    }
  };

  const parseTextNode = () => {
    const condition = () => current() === startTag;

    if (condition()) {
      return;
    }

    const text = skipUntil(condition);

    if (text !== '') {
      (<ElementNode>currentTag).children.push({ type: 'text', text });
      return true;
    }
  };

  const isSelfClosingTag = () => current() === forwardSlash && next() === endTag;

  const isEndOfAttributes = () => current() === endTag || isSelfClosingTag();

  const parseAttributes = () => {
    while (true) {
      skipSpaces();

      if (isEndOfAttributes() || !parseAttribute()) {
        break;
      }
    }
  };

  const parseAttributeName = () => {
    let name = '';

    iterate(() => {
      const char = current();
      if (char === newLine || char === space || char === equals || char === forwardSlash) {
        return true;
      }

      name += char;
      skip();
    });

    if (name) {
      return name;
    }

    expectedItemError('attribute name');
  };

  const parseAttributeValue = () => {
    let value = '';
    expect(doubleQuote); // start quote

    if (current() === doubleQuote) {
      skip();
      return '';
    }

    iterate(() => {
      if (current() === doubleQuote && previous() !== backSlash) {
        expect(doubleQuote); // end quote
        return true;
      }

      value += current();
      skip();
    });

    if (value) {
      return value;
    }

    expectedItemError('attribute value');
  };

  const parseAttribute = () => {
    const name = parseAttributeName();

    if (!name) {
      return false;
    }

    let value = '';

    if (current() === equals) {
      skip();
      value = parseAttributeValue();
    }

    (<ElementNode>currentTag).attributes.push({ name, value });

    return true;
  };

  const openTag = (tagName) => {
    const newTag: ElementNode = {
      type: 'element',
      tag: tagName,
      selfClose: false,
      attributes: [],
      children: [],
    };

    stack.push(newTag);
    (<ElementNode>currentTag).children.push(newTag);
    currentTag = newTag;
  };

  const closeTag = (selfClose = false) => {
    (<ElementNode>currentTag).selfClose = selfClose;
    stack.pop();
    currentTag = stack[stack.length - 1];
  };

  const parseNext = () => {
    // closing a tag  </...>
    if (lookAhead(2) === startTag + forwardSlash) {
      skip(2);
      const tagToClose = skipUntil(() => current() === endTag);

      if ((<ElementNode>currentTag).tag !== tagToClose) {
        throwError(new SyntaxError(`Expected closing "${(<ElementNode>currentTag).tag}", found ${tagToClose}`));
      }

      closeTag();
      skip(); // >
      return;
    }

    // starting a tag
    // <input/>
    // <input type="text"/>
    // <div>
    // </div>
    // <!doctype
    // <br>
    // <button
    //   title="">
    // <!-- comment
    if (current() === startTag) {
      skip(); // <

      const tagName = skipUntil(() => {
        const char = current();

        return char === forwardSlash || char === space || char === newLine || char === endTag;
      });

      if (tagName === startComment) {
        const comment = skipUntil(() => current() === '-' && next() === '-');
        (<ElementNode>currentTag).children.push({ type: 'comment', text: comment.trim() });
        skip(3);
        return;
      }

      if (tagName === docType) {
        (<DocumentNode>currentTag).docType = skipUntil(() => current() === endTag);
        return;
      }

      openTag(tagName);

      if (isSelfClosingTag()) {
        closeTag(true);
        skip(2);
        return;
      }

      if (current() !== endTag) {
        parseAttributes();
      }

      if (isSelfClosingTag()) {
        closeTag(true);
        skip(2);
        return;
      }

      if (current() === endTag) {
        if (implicitClose.test((<ElementNode>currentTag).tag)) {
          closeTag(true);
        }
        skip();
        return;
      }

      expectedItemError('end of tag creation');
    }

    if (parseTextNode()) {
      return;
    }

    if (current() === '') {
      return;
    }

    console.log('Unparsed text', html.slice(index));
    throwError(new SyntaxError(`Unexpected "${current()}" at ${line}:${column}`));
  };

  iterate(() => {
    parseNext();

    if (current() === '') {
      return true;
    }
  });

  stack.pop();

  if (stack.length !== 0) {
    throwError(new SyntaxError(`Tags not closed: ${stack.length}, ${stack.map((t) => t.type)}`));
  }

  return root;
}

function serialize(node) {
  switch (node.type) {
    case 'document':
      return node.children.map(serialize).join('');

    case 'text':
      return node.text;

    case 'comment':
      return `<!-- ${node.text} -->`;

    case 'element':
      const attr = node.attributes.length
        ? ' ' + node.attributes.map((a) => (a.value !== '' ? `${a.name}="${a.value}"` : a.name)).join(' ')
        : '';

      const children = node.children.map(serialize).join('');

      if (node.selfClose) {
        return `<${node.tag} ${attr}/>`;
      }

      return `<${node.tag}${attr}>${children}</${node.tag}>`;

    default:
      throw new Error(`Invalid node type: ${node.type}`);
  }
}

function normalize(node) {
  if (!node.children) return;

  node.children = node.children.filter((child) => {
    if (child.type === 'text' && child.text.trim() === '') {
      return false;
    }

    normalize(child);
    return true;
  });
}

function materialize(node) {
  switch (node.type) {
    case 'document': {
      const doc = document.createDocumentFragment();
      doc.append(...node.children.map(materialize));
      return doc;
    }

    case 'text':
      return document.createTextNode(node.text);

    case 'comment':
      return document.createComment(node.text);

    case 'element': {
      const el = document.createElement(node.tag);
      el.append(...node.children.map(materialize));

      el['@attributes'] = node.attributes;
      node.attributes.forEach((a: ParserAttribute) => {
        if (validAttribute.test(a.name)) {
          el.setAttribute(a.name, a.value);
        }
      });

      return el;
    }

    default:
      throw new Error(`Invalid node type: ${node.type}`);
  }
}

export { parse, materialize, serialize, normalize };
export type { ParserAttribute, ParserNode, ElementNode, DocumentNode, TextNode, CommentNode };
