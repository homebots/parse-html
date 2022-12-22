export interface ParserAttribute {
  name: string;
  value: string;
}

export interface DocumentNode {
  type: 'document';
  docType: string;
  children: Array<ElementNode | CommentNode | TextNode>;
}

export interface ElementNode {
  type: 'element';
  tag: string;
  selfClose: boolean;
  children: Array<ElementNode | CommentNode | TextNode>;
  attributes: Array<ParserAttribute>;
}

export interface CommentNode {
  type: 'comment';
  text: string;
}

export interface TextNode {
  type: 'text';
  text: string;
}

export type ParserNode = DocumentNode | ElementNode | CommentNode | TextNode;
