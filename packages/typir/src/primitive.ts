import { AssignabilityCallback } from "./assignablity";
import { MemberCollection, Type, TypeMember } from "./base";
import { Disposable } from "./utils";

export interface PrimitiveType<T> extends Type<T> {
    readonly name: string
    readonly members: MemberCollection<T>;
    constant(options: PrimitiveTypeConstantOptions<T>): PrimitiveTypeConstant<T>
    assignable(to: PrimitiveType<T>): Disposable;
    assignable(callback: AssignabilityCallback<PrimitiveType<T>>): Disposable;
}

export interface PrimitiveTypeConstant<T> extends Type<T> {
    type: PrimitiveType<T>
    value: unknown;
}

export interface PrimitiveTypeConstantOptions<T> {
    value: unknown;
    literal?: T;
}

export type PrimitiveTypeOptions<T> = string | {
    name: string
    members: TypeMember<T>[]
}
