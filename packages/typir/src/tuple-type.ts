import { Type } from "./base";

export interface TupleType<T> extends Type<T> {
    types: Type<T>[];
    /**
     * Indicates that the last type in this tuple is spread.
     */
    spread: boolean;
}

export interface TupleTypeOptions<T> {
    literal?: T;
    types: Type<T>[];
    spread?: boolean;
}