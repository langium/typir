import { Type } from "./base";

export interface TypeIntersection<T> extends Type<T> {
    types: Type<T>[];
}

export interface TypeIntersectionOptions<T> {
    literal?: T;
    types: Type<T>[];
}