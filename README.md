# parse-html

Short and strict HTML parser.

Output format: a tree of objects, starting with a root `Document` node.

`Element` and `Document` nodes can have children, which are any of `Text`, `Comment` or `Element`.

# API

```typescript
import { parse, serialize, materialize, normalize } from '@homebots/parse-html';

const document = parse(`
<html>
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    <div>text<br>text</div>
  </body>
</html>`);

console.log(document);

// remove empty text nodes
normalize(document);

// create HTML from document
console.log(serialize(document));

// create DOM elements from document
console.log(materialize(document));
```

# Node types

## Document

```json
{
  "type": "document",
  "docType": "html",
  "children": []
}
```

## Comment

```json
{
  "type": "comment",
  "text": "an html comment"
}
```

## Text

```json
{
  "type": "text",
  "text": "a text\nnode with line breaks"
}
```

## Element

```json
{
  "type": "element",
  "tag": "input",
  "selfClose": true,
  "children": [],
  "attributes": [{ "name": "type", "value": "text" }]
}
```
