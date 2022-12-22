import type { ParserNode } from './types';

export function serialize(node: ParserNode) {
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
  }
}
