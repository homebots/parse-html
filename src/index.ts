const startTag = "<";
const endTag = ">";
const startComment = "!--";
const docType = "!doctype";
const forwardSlash = "/";
const backSlash = "\\";
const space = " ";
const newLine = "\n";
const equals = "=";
const doubleQuote = `"`;
const implicitClose = /^(meta|link|br|hr)$/;
const validAttribute = /^[a-z][a-z0-9-]+$/;

function parse(html) {
  let index = 0;
  let line = 1;
  let column = 1;
  let max = html.length;
  const root = { type: "document", children: [] };
  let currentTag = root;
  const stack = [currentTag];

  class Position {
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
    const source = html.split("\n")[line - 1];

    error.origin = source + "\n" + " ".repeat(column - 2) + "^";
    error.location = location;

    throw error;
  };

  const next = () => html.charAt(index + 1);
  const lookAhead = (range) => html.substr(index, range);
  const previous = () => html.charAt(index - 1);
  const current = () => html.charAt(index);

  const expectedItemError = (expectedValue) => {
    throwError(
      new SyntaxError(
        `Unexpected "${current()}". Expected ${expectedValue} at ${new Position()}`
      )
    );
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
    let result = "";

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

    if (text !== "") {
      currentTag.children.push({ type: "text", tag: "", text });
      return true;
    }
  };

  const isSelfClosingTag = () =>
    current() === forwardSlash && next() === endTag;

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
    let name = "";

    iterate(() => {
      const char = current();
      if (
        char === newLine ||
        char === space ||
        char === equals ||
        char === forwardSlash
      ) {
        return true;
      }

      name += char;
      skip();
    });

    if (name) {
      return name;
    }

    expectedItemError("attribute name");
  };

  const parseAttributeValue = () => {
    let value = "";
    expect(doubleQuote); // start quote

    if (current() === doubleQuote) {
      skip();
      return "";
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

    expectedItemError("attribute value");
  };

  const parseAttribute = () => {
    const name = parseAttributeName();

    if (!name) {
      return false;
    }

    let value = "";

    if (current() === equals) {
      skip();
      value = parseAttributeValue();
    }

    currentTag.attributes.push({ name, value });

    return true;
  };

  const openTag = (tagName) => {
    const newTag = {
      type: "element",
      tag: tagName,
      attributes: [],
      children: [],
    };

    stack.push(newTag);
    currentTag.children.push(newTag);
    currentTag = newTag;
  };

  const closeTag = (selfClose = false) => {
    currentTag.selfClose = selfClose;
    stack.pop();
    currentTag = stack[stack.length - 1];
  };

  const parseNext = () => {
    // closing a tag  </...>
    if (lookAhead(2) === startTag + forwardSlash) {
      skip(2);
      const tagToClose = skipUntil(() => current() === endTag);

      if (currentTag.tag !== tagToClose) {
        throwError(
          new SyntaxError(
            `Expected closing "${currentTag.tag}", found ${tagToClose}`
          )
        );
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

        return (
          char === forwardSlash ||
          char === space ||
          char === newLine ||
          char === endTag
        );
      });

      if (tagName === startComment) {
        const comment = skipUntil(() => current() === "-" && next() === "-");
        currentTag.children.push({ type: "comment", text: comment.trim() });
        skip(3);
        return;
      }

      if (tagName === docType) {
        currentTag.docType = skipUntil(() => current() === endTag);
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
        if (implicitClose.test(currentTag.tag)) {
          closeTag(true);
        }
        skip();
        return;
      }

      expectedItemError("end of tag creation");
    }

    if (parseTextNode()) {
      return;
    }

    if (current() === "") {
      return;
    }

    console.log("Unparsed text", html.slice(index));
    throwError(
      new SyntaxError(`Unexpected "${current()}" at ${line}:${column}`)
    );
  };

  iterate(() => {
    parseNext();

    if (current() === "") {
      return true;
    }
  });

  stack.pop();

  if (stack.length !== 0) {
    throwError(
      new SyntaxError(
        `Tags not closed: ${stack.length}, ${stack.map((t) => t.type)}`
      )
    );
  }

  return root;
}

function serialize(node) {
  switch (node.type) {
    case "document":
      return node.children.map(serialize).join("");

    case "text":
      return node.text;

    case "comment":
      return `<!-- ${node.text} -->`;

    case "element":
      const attr = node.attributes.length
        ? " " +
          node.attributes
            .map((a) => (a.value !== "" ? `${a.name}="${a.value}"` : a.name))
            .join(" ")
        : "";

      const children = node.children.map(serialize).join("");

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
    if (child.type === "text" && child.text.trim() === "") {
      return false;
    }

    normalize(child);
    return true;
  });
}

function materialize(node) {
  switch (node.type) {
    case "document": {
      const doc = document.createDocumentFragment();
      node.children.map(materialize).forEach((c) => doc.append(c));
      return doc;
    }

    case "text":
      return document.createTextNode(node.text);

    case "comment":
      return document.createComment(node.text);

    case "element": {
      const el = document.createElement(node.tag);
      el["@attributes"] = node.attributes;

      node.attributes.forEach((a) => {
        if (validAttribute.test(a.name)) {
          el.setAttribute(a.name, a.value);
        }
      });
      node.children.map(materialize).forEach((c) => el.append(c));
      return el;
    }

    default:
      throw new Error(`Invalid node type: ${node.type}`);
  }
}

export { parse, materialize, serialize, normalize };
