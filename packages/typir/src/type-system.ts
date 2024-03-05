import { AssignabilityCallback, AssignabilityResult } from "./assignablity";
import { Type } from "./base";
import { FunctionType, FunctionTypeOptions } from "./function-type";
import { PrimitiveType, PrimitiveTypeOptions } from "./primitive";
import { TypeCategory, TypeCategoryOptions } from "./type-category";
import { TypeFunction, TypeFunctionOptions } from "./type-function";
import { TypeIntersection, TypeIntersectionOptions } from "./type-intersection";
import { TypeParameter, TypeParameterOptions } from "./type-parameter";
import { TypeUnion, TypeUnionOptions } from "./type-union";
import { Disposable } from "./utils";

export function createTypeSystem<T = never>(): TypeSystem<T> {
    throw new Error('Not implemented');
}

export interface TypeSystem<T> {
    isAssignable(from: Type<T>, to: Type<T>): AssignabilityResult;
    isCastable(from: Type<T>, to: Type<T>): AssignabilityResult;
    assignable(callback: AssignabilityCallback<Type<T>>): Disposable;
    castable(callback: AssignabilityCallback<Type<T>>): Disposable;

    primitive(options: PrimitiveTypeOptions<T>): PrimitiveType<T>;
    category(options: TypeCategoryOptions): TypeCategory<T>;
    function(options: FunctionTypeOptions<T>): FunctionType<T>;
    typeFunction(options: TypeFunctionOptions<T>): TypeFunction<T>;
    typeParameter(options: TypeParameterOptions<T>): TypeParameter<T>;
    typeUnion(options: TypeUnionOptions<T>): TypeUnion<T>;
    typeIntersection(options: TypeIntersectionOptions<T>): TypeIntersection<T>;
    customType<OutType extends Type<T>, Options = never>(factory: CustomTypeFactory<T, OutType, Options>, options?: Options): OutType;

    optionalType(type: Type<T>): Type<T>;
}

export type CustomTypeFactory<T, OutType, Options> = (typeSystem: TypeSystem<T>, options: Options) => OutType;