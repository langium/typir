import type { TypeSystem } from "./type-system";
import { Disposable } from "./utils";

export interface Type<T> {
    readonly literal?: T;
    readonly members: Iterable<TypeMember<T>>;
    /**
     * A reference to the original type system that produced this type
     */
    readonly typeSystem: TypeSystem<T>;
}

export interface TypeMember<T> {
    name?: string;
    literal?: T;
    optional: boolean;
    type: Type<T>;
}

export interface MemberCollection<T> extends Iterable<TypeMember<T>> {
    push(...member: TypeMember<T>[]): Disposable;
}
