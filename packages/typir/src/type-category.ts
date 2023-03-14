import { AssignabilityCallback } from "./assignablity";
import { MemberCollection, Type, TypeMember } from "./base";
import { TypeParameter } from "./type-parameter";
import type { TypeSystem } from "./type-system";
import { Disposable } from "./utils";

export interface TypeCategory<T> {
    readonly name: string;
    readonly typeSystem: TypeSystem<T>;
    create(options: TypeCategoryInstanceOptions<T>): TypeCategoryInstance<T>;
    assignable(to: TypeCategory<T>, callback: AssignabilityCallback<TypeCategoryInstance<T>>): Disposable;
    castable(to: TypeCategory<T>, callback: AssignabilityCallback<TypeCategoryInstance<T>>): Disposable;
}

export interface TypeCategoryInstance<T> extends Type<T>, Disposable {
    readonly name?: string;
    readonly category: TypeCategory<T>;
    readonly members: MemberCollection<T>;
    readonly super: TypeCategoryInstance<T>[];
    readonly typeParameters: TypeParameter<T>[];
    readonly typeArguments: Type<T>[];
    applyTypeArguments(args: Type<T>[]): TypeCategoryInstance<T>;
    assignable(callback: AssignabilityCallback<Type<T>>): Disposable;
    castable(callback: AssignabilityCallback<Type<T>>): Disposable;
}

export interface TypeCategoryOptions {
    name: string
}

export interface TypeCategoryInstanceOptions<T> {
    name?: string
    literal?: T
    parameters?: TypeParameter<T>[];
    members?: TypeMember<T>[];
    typeParameters: TypeParameter<T>[];
}
