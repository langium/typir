import { Type } from "./base";

export interface AssignabilityResult {
    /**
     * The failure of this result. If `undefined`, the assignability check succeeded.
     */
    readonly failure?: AssignabilityFailure;
}

export interface AssignabilityFailure {
    from: string;
    to: string;
    nested?: AssignabilityFailure;
}

export type AssignabilityCallback<From extends Type<unknown>, To extends Type<unknown> = From> = (types: { from: From, to: To }) => AssignabilityResult;