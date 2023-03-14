import { Type } from "./base";

export interface TypeParameter<T> extends Type<T> {
    name: string;
    variance: TypeParameterVariance;
    default?: Type<T>;
    constraints: Type<T>[];
}

export interface TypeParameterOptions<T> {
    name: string;
    variance?: TypeParameterVariance;
    default?: Type<T>;
    literal?: T
    constraints?: Type<T>[];
}

/**
 * The different type parameter variance modes.
 * 
 * See [here](https://en.wikipedia.org/wiki/Covariance_and_contravariance_(computer_science)) for an in-depth explanation.
 */
export enum TypeParameterVariance {
    Invariance = 0,
    Covariance = 1,
    Contravariance = 2,
    /**
     * This value represents that the type parameter is both covariant and contravariant.
     * It can be set using a bitwise operation on `Covariance & Contravariance` or accessing this enum field directly.
     */
    Bivariance = 3
}