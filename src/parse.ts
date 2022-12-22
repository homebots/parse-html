import type { ParserNode, ElementNode, DocumentNode } from './types';

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
  currentTag: ParserNode = this.root;
  stack: ParserNode[] = [this.currentTag];

  constructor(private html: string) {
    this.max = html.length;
  }

  parse() {
    this.iterate(() => {
      this.parseNext();

      if (this.getCurrent() === '') {
        return true;
      }
    });

    this.stack.pop();

    if (this.stack.length !== 0) {
      this.throwError(new SyntaxError(`Tags not closed: ${this.stack.length}, ${this.stack.map((t) => t.type)}`));
    }

    return this.root;
  }

  get position(): string {
    return `${this.line}:${this.column}`;
  }

  private getNext(): string {
    return this.html.charAt(this.index + 1);
  }

  private getPrevious(): string {
    return this.html.charAt(this.index - 1);
  }

  private getCurrent(): string {
    return this.html.charAt(this.index);
  }

  private throwError<T extends Error>(error: T) {
    const location = this.position;
    const { line, column } = this;
    const source = this.html.split('\n')[line - 1];

    Object.assign(error, {
      origin: source + '\n' + ' '.repeat(column - 2) + '^',
      location: location,
    });

    throw error;
  }

  private lookAhead(characterCount: number) {
    return this.html.substr(this.index, characterCount);
  }
  private expectedItemError(expectedValue) {
    this.throwError(
      new SyntaxError(`Unexpected "${this.getCurrent()}". Expected ${expectedValue} at ${this.position}`),
    );
  }

  private expect(value: string) {
    if (this.getCurrent() === value) {
      return this.skip();
    }

    this.expectedItemError(value);
  }

  private iterate(fn) {
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

  private skip(amount = 1) {
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
  private skipUntil(condition) {
    let initialPosition = this.index;
    let chars = 0;
    let result = '';

    this.iterate(() => {
      if (condition()) {
        result = this.html.substr(initialPosition, chars);
        return true;
      }

      this.skip();
      chars++;
    });

    return result;
  }

  private skipSpaces() {
    const condition = () => this.getCurrent() !== space && this.getCurrent() !== newLine;

    if (!condition()) {
      this.skipUntil(condition);
    }
  }

  private parseTextNode() {
    const condition = () => this.getCurrent() === startTag;

    if (condition()) {
      return;
    }

    const text = this.skipUntil(condition);

    if (text !== '') {
      (<ElementNode>this.currentTag).children.push({
        type: 'text',
        text,
      });
      return true;
    }
  }

  private isSelfClosingTag() {
    return this.getCurrent() === forwardSlash && this.getNext() === endTag;
  }

  private isEndOfAttributes() {
    return this.getCurrent() === endTag || this.isSelfClosingTag();
  }

  private parseAttributes() {
    while (true) {
      this.skipSpaces();

      if (this.isEndOfAttributes() || !this.parseAttribute()) {
        break;
      }
    }
  }

  private parseAttributeName() {
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

  private parseAttributeValue() {
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

  private parseAttribute() {
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

  private openTag(tagName) {
    const newTag: ElementNode = {
      type: 'element',
      tag: tagName,
      selfClose: false,
      attributes: [],
      children: [],
    };

    this.stack.push(newTag);
    (<ElementNode>this.currentTag).children.push(newTag);
    this.currentTag = newTag;
  }

  private closeTag(selfClose = false) {
    (<ElementNode>this.currentTag).selfClose = selfClose;
    this.stack.pop();
    this.currentTag = this.stack[this.stack.length - 1];
  }

  private parseNext() {
    // closing a tag  </...>
    if (this.lookAhead(2) === startTag + forwardSlash) {
      this.skip(2);
      const tagToClose = this.skipUntil(() => this.getCurrent() === endTag);

      if ((<ElementNode>this.currentTag).tag !== tagToClose) {
        this.throwError(
          new SyntaxError(`Expected closing "${(<ElementNode>this.currentTag).tag}", found ${tagToClose}`),
        );
      }

      this.closeTag();
      this.skip(); // >
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
    if (this.getCurrent() === startTag) {
      this.skip(); // <

      const tagName = this.skipUntil(() => {
        const char = this.getCurrent();

        return char === forwardSlash || char === space || char === newLine || char === endTag;
      });

      if (tagName === startComment) {
        const comment = this.skipUntil(() => this.getCurrent() === '-' && this.getNext() === '-');
        (<ElementNode>this.currentTag).children.push({
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

      this.expectedItemError('end of tag creation');
    }

    if (this.parseTextNode()) {
      return;
    }

    if (this.getCurrent() === '') {
      return;
    }

    console.log('Unparsed text', this.html.slice(this.index));
    this.throwError(new SyntaxError(`Unexpected "${this.getCurrent()}" at ${this.position}`));
  }
}

export function parse(html: string): DocumentNode {
  return new Parser(html).parse();
}
