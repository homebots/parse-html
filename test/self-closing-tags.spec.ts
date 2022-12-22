import { parse } from '../src/index';

const selfClosingTags = `<link><meta><input/>`;
const inputTypeText = `<input type="text"/>`;
const inputWithEscapedAttribute = `<input name="tes\\"t" value="1"/>`;

describe('self closing tags', () => {
  it('should autoclose a tag', () => {
    expect(parse(selfClosingTags)).toEqual({ type: 'document', children: [] });
  });
});
