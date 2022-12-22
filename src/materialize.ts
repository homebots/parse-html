import type { ParserAttribute } from './types';

const validAttribute = /^[a-z][a-z0-9-]+$/;

export function materialize(node) {
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
