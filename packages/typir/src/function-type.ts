import { MemberCollection, Type, TypeMember } from "./base";
import { TypeParameter } from "./type-parameter";

export interface FunctionType<T> extends Type<T> {
    readonly name?: string;
    readonly members: MemberCollection<T>;
    readonly typeParameters: TypeParameter<T>[];
    readonly typeArguments: Type<T>[];
    applyTypeArguments(args: Type<T>[]): FunctionType<T>;
    readonly parameters: FunctionParameter<T>;
    readonly returnType: Type<T>[];
}

export interface FunctionTypeOptions<T> {
    name?: string;
    literal?: T;
    members?: TypeMember<T>[];
    typeParameters?: TypeParameter<T>[];
    parameters?: FunctionParameter<T>[];
    returnType?: Type<T>[];
}

export interface FunctionParameter<T> {
    readonly name?: string
    readonly literal?: T;
    readonly type: Type<T>;
    readonly optional: boolean;
    readonly spread: boolean;
}
