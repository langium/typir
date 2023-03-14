import { Type } from "./base";
import { TypeParameter } from "./type-parameter";

export interface TypeFunction<T> extends Type<T> {
    readonly name: string;
    readonly parameters: TypeParameter<T>[];
    readonly type: Type<T>;
    applyArguments(args: Type<T>[]): Type<T>;
}

export interface TypeFunctionOptions<T> {
    readonly name: string;
    readonly literal?: T;
    readonly parameters?: TypeParameter<T>[];
    readonly type: Type<T>;
}
