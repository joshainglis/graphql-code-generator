import { GraphQLSchema, GraphQLNamedType, EnumTypeDefinitionNode, ObjectTypeDefinitionNode } from 'graphql';
import { PydanticVisitor } from './visitor';
import { PydanticPluginConfig } from './config';
import autoBind from 'auto-bind';

export class TsIntrospectionVisitor extends PydanticVisitor {
  private typesToInclude: GraphQLNamedType[] = [];

  constructor(schema: GraphQLSchema, pluginConfig: PydanticPluginConfig = {}, typesToInclude: GraphQLNamedType[]) {
    super(schema, pluginConfig);

    this.typesToInclude = typesToInclude;
    autoBind(this);
  }

  DirectiveDefinition() {
    return null;
  }

  ObjectTypeDefinition(node: ObjectTypeDefinitionNode) {
    const name: string = node.name as any;

    if (this.typesToInclude.some(type => type.name === name)) {
      return super.ObjectTypeDefinition(node);
    }

    return null;
  }

  EnumTypeDefinition(node: EnumTypeDefinitionNode): string {
    const name: string = node.name as any;

    if (this.typesToInclude.some(type => type.name === name)) {
      return super.EnumTypeDefinition(node);
    }

    return null;
  }
}
