import { parse } from '../src/index';

describe('self closing tags', () => {
  it('should autoclose void elements', () => {
    expect(parse(`<link><meta><br><hr>`)).toEqual({
      type: 'document',
      docType: 'html',
      children: [
        { type: 'element', tag: 'link', selfClose: true, children: [], attributes: [] },
        { type: 'element', tag: 'meta', selfClose: true, children: [], attributes: [] },
        { type: 'element', tag: 'br', selfClose: true, children: [], attributes: [] },
        { type: 'element', tag: 'hr', selfClose: true, children: [], attributes: [] },
      ],
    });
  });

  it('should ignore spaces in closing tags', () => {
    expect(parse(`<a>test</a  >`)).toEqual({
      type: 'document',
      docType: 'html',
      children: [
        { type: 'element', tag: 'a', selfClose: false, children: [{ type: 'text', text: 'test' }], attributes: [] },
      ],
    });
  });

  it('should autoclose an input with attributes', () => {
    expect(parse(`<input type="text"/>`)).toEqual({
      type: 'document',
      docType: 'html',
      children: [
        {
          type: 'element',
          tag: 'input',
          selfClose: true,
          children: [],
          attributes: [{ name: 'type', value: 'text' }],
        },
      ],
    });
  });

  it('should parse attributes with invalid characters or no value', () => {
    expect(parse(`<input [type]="text" disabled/>`)).toEqual({
      type: 'document',
      docType: 'html',
      children: [
        {
          type: 'element',
          tag: 'input',
          selfClose: true,
          children: [],
          attributes: [
            { name: '[type]', value: 'text' },
            { name: 'disabled', value: '' },
          ],
        },
      ],
    });
  });

  it('should allow escaped double quotes in attribute values', () => {
    expect(parse(`<input name="tes\\"t" value="1"/>`)).toEqual({
      type: 'document',
      docType: 'html',
      children: [
        {
          type: 'element',
          tag: 'input',
          selfClose: true,
          children: [],
          attributes: [
            {
              name: 'name',
              value: 'tes\\"t',
            },
            {
              name: 'value',
              value: '1',
            },
          ],
        },
      ],
    });
  });

  it('should ignore spaces', () => {
    const inputs = [
      `<input       />`,
      `<input
      />`,
      `<input

      />`,
    ];

    inputs.forEach((input) =>
      expect(parse(input)).toEqual({
        type: 'document',
        docType: 'html',
        children: [
          {
            type: 'element',
            tag: 'input',
            selfClose: true,
            children: [],
            attributes: [],
          },
        ],
      }),
    );
  });

  it('should throw error if a tag was not closed', () => {
    expect(() => parse(`<div>`)).toThrowError('Some tags are not closed: div');
  });

  it('should throw an error on invalid attribute name or value', () => {
    expect(() => parse(`<div /s ></div>`)).toThrowError('Unexpected "/". Expected attribute name at 1:6');
    expect(() => parse(`<div class=</div>`)).toThrowError('Unexpected "<". Expected " at 1:12');
    expect(() => parse(`<div//>`)).toThrowError('Unexpected "/". Expected attribute name at 1:5');
  });

  it('should throw an error when closing the wrong tag', () => {
    expect(() => parse(`<div></span>`)).toThrowError('Expected closing "div", found "span"');
  });

  it('should parse comments and text', () => {
    expect(parse(`<!-- comment      -->`)).toEqual({
      type: 'document',
      docType: 'html',
      children: [{ type: 'comment', text: 'comment' }],
    });

    expect(parse(`text only`)).toEqual({
      type: 'document',
      docType: 'html',
      children: [{ type: 'text', text: 'text only' }],
    });
  });

  it('should parse an HTML document', () => {
    const html = `<!doctype html>
    <html>
      <head>
        <link>
        <meta>
      </head>
      <body>
        <p>Text<br></p>
        <div class="something">
          <input/>
          <hr />
          <input type="text" [disabled]="false" />
          <!-- comment -->
          <hr>
        </div>
      </body>
    </html>
    `;
    expect(() => parse(html)).not.toThrowError();
  });
});
