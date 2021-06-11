import { NameNode } from 'graphql';

export type Kind = 'class';
export type ClassMember = {
  value: string;
  name: string;
  type: string;
  annotations: string[];
};

export class PydanticDeclarationBlock {
  _name: string = null;
  _extendStr: string[] = [];
  _implementsStr: string[] = [];
  _kind: Kind = null;
  _block = null;
  _comment = null;
  _annotations: string[] = [];
  _content = null;

  asKind(kind: Kind): PydanticDeclarationBlock {
    this._kind = kind;

    return this;
  }

  annotate(annotations: string[]): PydanticDeclarationBlock {
    this._annotations = annotations;

    return this;
  }

  withBlock(block: string): PydanticDeclarationBlock {
    this._block = block;

    return this;
  }

  extends(extendStr: string[]): PydanticDeclarationBlock {
    this._extendStr = extendStr;

    return this;
  }

  implements(implementsStr: string[]): PydanticDeclarationBlock {
    this._implementsStr = implementsStr;

    return this;
  }

  withName(name: string | NameNode): PydanticDeclarationBlock {
    this._name = typeof name === 'object' ? name.value : name;

    return this;
  }

  public get string(): string {
    let result = '';

    if (this._kind) {
      let name = '';

      if (this._name) {
        name = this._name;
      }

      let extendStr = '';
      let implementsStr = '';
      let annotatesStr = '';

      if (this._extendStr.length > 0) {
        extendStr = ` extends ${this._extendStr.join(', ')}`;
      }

      if (this._implementsStr.length > 0) {
        implementsStr = this._implementsStr.join(', ');
      }

      if (this._annotations.length > 0) {
        annotatesStr = this._annotations.map(a => `@${a}`).join('\n') + '\n';
      }

      result += `${annotatesStr} ${this._kind} ${name}${extendStr}${implementsStr} `;
    }

    const block = [this._block].filter(f => f).join('\n');
    result += block;

    return (this._comment ? this._comment : '') + result + '\n';
  }
}
