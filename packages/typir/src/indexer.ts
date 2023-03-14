import { Type } from "./base";

export interface Indexer<T> extends Type<T> {
    readonly: boolean;
    writeonly: boolean;
    parameters: IndexerParameter<T>[];
}

export interface IndexerParameter<T> {
    readonly name?: string
    readonly literal?: T;
    readonly type: Type<T>;
}