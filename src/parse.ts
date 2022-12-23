import type { ElementNode, DocumentNode } from './types';

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

export class Parser {
  index = 0;
  line = 1;
  column = 1;
  max = 0;
  root: DocumentNode = { type: 'document', docType: 'html', children: [] };
  currentTag: ElementNode | DocumentNode = this.root;
  stack: ElementNode[] = [this.currentTag as ElementNode];

  constructor(public html: string) {
    this.max = html.length;
  }

  parse() {
    this.iterate(() => {
      this.parseNext();

      if (this.getCurrent() === '') {
        return true;
      }
    });

    if (this.stack.length !== 1) {
      this.throwError(new SyntaxError(`Some tags are not closed: ${this.stack.slice(1).map((t) => t.tag)}`));
    }

    return this.root;
  }

  get position(): string {
    return `${this.line}:${this.column}`;
  }

  getNext(): string {
    return this.html.charAt(this.index + 1);
  }

  getPrevious(): string {
    return this.html.charAt(this.index - 1);
  }

  getCurrent(): string {
    return this.html.charAt(this.index);
  }

  throwError<T extends Error>(error: T) {
    const location = this.position;
    const { line, column } = this;
    const source = this.html.split('\n')[line - 1];

    Object.assign(error, {
      origin: source + '\n' + ' '.repeat(column - 2) + '^',
      location: location,
    });

    throw error;
  }

  lookAhead(characterCount: number) {
    return this.html.substr(this.index, characterCount);
  }

  expectedItemError(expectedValue: string) {
    this.throwError(
      new SyntaxError(`Unexpected "${this.getCurrent()}". Expected ${expectedValue} at ${this.position}`),
    );
  }

  expect(value: string) {
    if (this.getCurrent() === value) {
      return this.skip();
    }

    this.expectedItemError(value);
  }

  iterate(fn: () => boolean | undefined) {
    let last = this.index;
    let stop = false;

    while (this.index < this.max) {
      stop = fn();

      if (stop === true) break;

      if (last === this.index) {
        this.throwError(new Error(`Infinite loop at ${this.position}`));
      }

      last = this.index;
    }
  }

  skip(amount = 1) {
    while (amount) {
      this.index++;
      amount--;

      if (this.getCurrent() === newLine) {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
    }
  }
  skipUntil(condition: () => boolean) {
    let initialPosition = this.index;
    let chars = 0;

    this.iterate(() => {
      if (condition()) {
        return true;
      }

      this.skip();
      chars++;
    });

    return this.html.substr(initialPosition, chars);
  }

  skipSpaces() {
    const condition = () => this.getCurrent() !== space && this.getCurrent() !== newLine;

    if (!condition()) {
      this.skipUntil(condition);
    }
  }

  parseTextNode() {
    const condition = () => this.getCurrent() === startTag;

    if (condition()) {
      return;
    }

    const text = this.skipUntil(condition);
    if (text) {
      this.currentTag.children.push({
        type: 'text',
        text,
      });
      return true;
    }
  }

  isSelfClosingTag() {
    return this.getCurrent() === forwardSlash && this.getNext() === endTag;
  }

  isEndOfAttributes() {
    return this.getCurrent() === endTag || this.isSelfClosingTag();
  }

  parseAttributes() {
    while (true) {
      this.skipSpaces();

      if (this.isEndOfAttributes() || !this.parseAttribute()) {
        break;
      }
    }
  }

  parseAttributeName() {
    let name = '';

    this.iterate(() => {
      const char = this.getCurrent();
      if (char === newLine || char === space || char === equals || char === forwardSlash) {
        return true;
      }

      name += char;
      this.skip();
    });

    if (name) {
      return name;
    }

    this.expectedItemError('attribute name');
  }

  parseAttributeValue() {
    let value = '';
    this.expect(doubleQuote); // start quote

    if (this.getCurrent() === doubleQuote) {
      this.skip();
      return '';
    }

    this.iterate(() => {
      if (this.getCurrent() === doubleQuote && this.getPrevious() !== backSlash) {
        this.expect(doubleQuote); // end quote
        return true;
      }

      value += this.getCurrent();
      this.skip();
    });

    if (value) {
      return value;
    }

    this.expectedItemError('attribute value');
  }

  parseAttribute() {
    const name = this.parseAttributeName();

    if (!name) {
      return false;
    }

    let value = '';

    if (this.getCurrent() === equals) {
      this.skip();
      value = this.parseAttributeValue();
    }

    (<ElementNode>this.currentTag).attributes.push({ name, value });

    return true;
  }

  openTag(tagName: string) {
    const newTag: ElementNode = {
      type: 'element',
      tag: tagName,
      selfClose: false,
      attributes: [],
      children: [],
    };

    this.stack.push(newTag);
    this.currentTag.children.push(newTag);
    this.currentTag = newTag;
  }

  closeTag(selfClose = false) {
    (<ElementNode>this.currentTag).selfClose = selfClose;
    this.stack.pop();
    this.currentTag = this.stack[this.stack.length - 1];
  }

  parseNext() {
    // closing a tag  </...>
    if (this.lookAhead(2) === startTag + forwardSlash) {
      this.skip(2);
      const tagToClose = this.skipUntil(() => this.getCurrent() === endTag);

      if ((<ElementNode>this.currentTag).tag !== tagToClose) {
        this.throwError(
          new SyntaxError(`Expected closing "${(<ElementNode>this.currentTag).tag}", found "${tagToClose}"`),
        );
      }

      this.closeTag();
      this.skip(); // >
      return;
    }

    // starting a tag
    if (this.getCurrent() === startTag) {
      this.skip(); // <

      const tagName = this.skipUntil(() => {
        const char = this.getCurrent();

        return char === forwardSlash || char === space || char === newLine || char === endTag;
      });

      if (tagName === startComment) {
        const comment = this.skipUntil(() => this.getCurrent() === '-' && this.getNext() === '-');
        this.currentTag.children.push({
          type: 'comment',
          text: comment.trim(),
        });
        this.skip(3);
        return;
      }

      if (tagName === docType) {
        (<DocumentNode>this.currentTag).docType = this.skipUntil(() => this.getCurrent() === endTag);
        return;
      }

      this.openTag(tagName);

      if (this.isSelfClosingTag()) {
        this.closeTag(true);
        this.skip(2);
        return;
      }

      if (this.getCurrent() !== endTag) {
        this.parseAttributes();
      }

      if (this.isSelfClosingTag()) {
        this.closeTag(true);
        this.skip(2);
        return;
      }

      if (this.getCurrent() === endTag) {
        if (implicitClose.test((<ElementNode>this.currentTag).tag)) {
          this.closeTag(true);
        }

        this.skip();
        return;
      }
    }

    if (this.parseTextNode()) {
      return;
    }

    if (this.getCurrent() === '') {
      return;
    }

    this.throwError(new SyntaxError(`Unexpected "${this.getCurrent()}" at ${this.position}`));
  }
}

export function parse(html: string): DocumentNode {
  return new Parser(html).parse();
}
