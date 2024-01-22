import type { ParserNode, ParserAttribute } from './types';

const validAttribute = /^[a-z][a-z0-9-]+$/;
const noop = () => {};

export function materialize(node: ParserNode, visitor: any = noop) {
  let el: any;

  switch (node.type) {
    case 'document': {
      el = document.createDocumentFragment();
      el.append(...node.children.map(materialize));
      break;
    }

    case 'text':
      el = document.createTextNode(node.text);
      break;

    case 'comment':
      el = document.createComment(node.text);
      break;

    case 'element': {
      el = document.createElement(node.tag);
      el.append(...node.children.map(materialize));
      el['@attributes'] = node.attributes;

      node.attributes.forEach((a: ParserAttribute) => {
        if (validAttribute.test(a.name)) {
          el.setAttribute(a.name, a.value);
        }
      });

      break;
    }

    default:
      throw new Error(`Invalid node type: ${(node as any).type}`);
  }

  return visitor(el, node) || el;
}
