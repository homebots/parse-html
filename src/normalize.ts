export function normalize(node) {
  if (!node.children) return;

  node.children = node.children.filter((child) => {
    if (child.type === 'text' && child.text.trim() === '') {
      return false;
    }

    normalize(child);
    return true;
  });
}
