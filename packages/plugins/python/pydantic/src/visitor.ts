import {
  AvoidOptionalsConfig,
  BaseTypesVisitor,
  buildScalarsFromConfig,
  DeclarationKind,
  indent,
  ParsedTypesConfig,
  transformComment,
} from '@graphql-codegen/visitor-plugin-common';
import { PydanticPluginConfig } from './config';
import autoBind from 'auto-bind';
import {
  EnumTypeDefinitionNode,
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  GraphQLObjectType,
  GraphQLSchema,
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  isEnumType,
  Kind,
  ListTypeNode,
  NamedTypeNode,
  ObjectTypeDefinitionNode,
  ScalarTypeDefinitionNode,
} from 'graphql';
import { PydanticOperationVariablesToObject } from './pydantic-variables-to-object';
import { PYTHON_SCALARS } from './scalars';

const changeCaseAll = require('change-case-all');

export interface PydanticPluginParsedConfig extends ParsedTypesConfig {
  avoidOptionals: AvoidOptionalsConfig;
  constEnums: boolean;
  enumsAsTypes: boolean;
  futureProofEnums: boolean;
  futureProofUnions: boolean;
  enumsAsConst: boolean;
  numericEnums: boolean;
  onlyOperationTypes: boolean;
  immutableTypes: boolean;
  maybeValue: string;
  noExport: boolean;
  useImplementingTypes: boolean;
}

export class PydanticVisitor<
  TRawConfig extends PydanticPluginConfig = PydanticPluginConfig,
  TParsedConfig extends PydanticPluginParsedConfig = PydanticPluginParsedConfig
> extends BaseTypesVisitor<TRawConfig, TParsedConfig> {
  constructor(schema: GraphQLSchema, pluginConfig: TRawConfig, additionalConfig: Partial<TParsedConfig> = {}) {
    super(schema, pluginConfig, {
      scalars: buildScalarsFromConfig(schema, pluginConfig, PYTHON_SCALARS, 'str'),
      ...(additionalConfig || {}),
    } as TParsedConfig);

    autoBind(this);
    const enumNames = Object.values(schema.getTypeMap())
      .filter(isEnumType)
      .map(type => type.name);
    this.setArgumentsTransformer(
      new PydanticOperationVariablesToObject(
        this.scalars,
        this.convertName,
        this.config.avoidOptionals,
        this.config.immutableTypes,
        null,
        enumNames,
        pluginConfig.enumPrefix,
        this.config.enumValues
      )
    );
    this.setDeclarationBlockConfig({
      enumNameValueSeparator: ' =',
    });
  }

  protected _getTypeForNode(node: NamedTypeNode): string {
    const typeAsString = node.name as any as string;

    if (this.config.useImplementingTypes) {
      const allTypesMap = this._schema.getTypeMap();
      const implementingTypes: string[] = [];

      for (const graphqlType of Object.values(allTypesMap)) {
        if (graphqlType instanceof GraphQLObjectType) {
          const allInterfaces = graphqlType.getInterfaces();

          if (allInterfaces.some(int => typeAsString === int.name)) {
            implementingTypes.push(this.convertName(graphqlType.name));
          }
        }
      }

      if (implementingTypes.length > 0) {
        return implementingTypes.join(' | ');
      }
    }

    return super._getTypeForNode(node);
  }

  protected _buildTypeImport(identifier: string, source: string): string {
    return `from ${source} import ${identifier}`;
  }

  public getBaseImports(): string[] {
    return [this._buildTypeImport('annotation', '__future__'), this._buildTypeImport('BaseModel', 'pydantic')];
  }

  public getScalarsImports(): string[] {
    return Object.keys(this.config.scalars)
      .map(enumName => {
        const mappedValue = this.config.scalars[enumName];

        if (mappedValue.isExternal) {
          return this._buildTypeImport(mappedValue.import, mappedValue.source);
        }

        return null;
      })
      .filter(a => a);
  }

  ScalarTypeDefinition(_node: ScalarTypeDefinitionNode): string {
    return super.ScalarTypeDefinition(_node);
  }

  public get scalarsDefinition(): string {
    const allScalars = Object.keys(this.config.scalars).map(scalarName => {
      const scalarValue = this.config.scalars[scalarName].type;
      const scalarType = this._schema.getType(scalarName);
      const comment =
        scalarType && scalarType.astNode && scalarType.description ? transformComment(scalarType.description, 1) : '';

      return comment + indent(`${scalarName} = ${scalarValue}`, 0);
    });

    return allScalars.join('\n');
  }

  protected _getScalar(name: string): string {
    return name;
  }

  NamedType(node: NamedTypeNode, key, parent, path, ancestors): string {
    return `${super.NamedType(node, key, parent, path, ancestors)}`;
  }

  ListType(node: ListTypeNode): string {
    return `${super.ListType(node)}`;
  }

  protected wrapWithListType(str: string): string {
    return `List[${str}]`;
  }

  FieldDefinition(node: FieldDefinitionNode, key?: number | string, parent?: any): string {
    const originalFieldNode = parent[key] as FieldDefinitionNode;
    const isOptional = originalFieldNode.type.kind !== Kind.NON_NULL_TYPE;
    const typeString = isOptional ? `Optional[${node.type}]` : node.type;
    const fieldName = changeCaseAll.snakeCase(node.name);
    return indent(`${fieldName}: ${typeString} = Field(...${fieldName === node.name ? '' : `, alias="${node.name}"`})`);
  }

  InputValueDefinition(node: InputValueDefinitionNode, key?: number | string, parent?: any): string {
    const originalFieldNode = parent[key] as FieldDefinitionNode;
    const isOptional = originalFieldNode.type.kind !== Kind.NON_NULL_TYPE;
    const typeString = isOptional ? `Optional[${node.type}]` : node.type;
    const comment = transformComment(node.description as any as string, 1);
    const fieldName = changeCaseAll.snakeCase(node.name);
    return (
      comment +
      indent(
        `${fieldName}: ${typeString} = Field(${isOptional ? 'None' : '...'}${
          fieldName === node.name ? '' : `, alias="${node.name}"`
        })`
      )
    );
  }

  EnumTypeDefinition(node: EnumTypeDefinitionNode): string {
    const enumName = node.name as any as string;

    return `class ${enumName}(str, Enum):\n${node.values
      .map((enumOption: EnumValueDefinitionNode) => {
        return indent(`${enumOption.name as any as string} = "${enumOption.name as any as string}"`, 2);
      })
      .join('\n')}`;
  }

  InputObjectTypeDefinition(node: InputObjectTypeDefinitionNode): string {
    const objectName = node.name as any as string;

    return `class ${objectName}(BaseModel):\n${node.fields
      .map((objectField: InputValueDefinitionNode) => {
        return indent(`${objectField}`);
      })
      .join('\n')}`;
  }

  ObjectTypeDefinition(node: ObjectTypeDefinitionNode): string {
    const objectName = node.name as any as string;

    return `class ${objectName}(BaseModel):\n${node.fields
      .map((objectField: FieldDefinitionNode) => {
        return indent(`${objectField}`);
      })
      .join('\n')}`;
  }

  protected getPunctuation(_declarationKind: DeclarationKind): string {
    return '';
  }
}
