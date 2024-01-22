export type { ParserAttribute, ParserNode, ElementNode, DocumentNode, TextNode, CommentNode } from './types';
export { normalize } from './normalize';
export { parse, Parser } from './parse';
export { serialize } from './serialize';
export { materialize } from './materialize';
export type { Visitor } from './materialize';
