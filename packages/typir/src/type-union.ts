import { Type } from "./base";

export interface TypeUnion<T> extends Type<T> {
    types: Type<T>[];
}

export interface TypeUnionOptions<T> {
    literal?: T;
    types: Type<T>[];
}