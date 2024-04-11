/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { FUNCTION_MISSING_NAME, FunctionKind, FunctionKindName, isFunctionKind } from '../kinds/function-kind.js';
import { Typir } from '../typir.js';
import { NameTypePair, Names, Types, assertTrue, toArray } from '../utils/utils.js';

export type InferConcreteOperator = (domainElement: unknown, operatorName: string) => boolean;
export type DeriveOperand = (domainElement: unknown, operatorName: string) => unknown;
export type DeriveOperands = (domainElement: unknown, operatorName: string) => unknown[];

export interface OperatorManager {
    // createUnaryOperator<T = unknown, D extends T = T>(name: string, operandTypes: Types,
    //      inferenceRule?: (domainElement: T) => domainElement is D, // does not work as expected
    //      domainElementForInputValue?: DeriveOperand): Types
    createUnaryOperator(name: Names, operandType: Types,
        inferenceRule?: InferConcreteOperator,
        domainElementForInputValue?: DeriveOperand): Types
    createBinaryOperator(name: Names, inputType: Types, outputType?: Type,
        inferenceRule?: InferConcreteOperator,
        domainElementsForInputValues?: DeriveOperands): Types
    createTernaryOperator(name: Names, firstType: Type, secondAndThirdType: Types,
        inferenceRule?: InferConcreteOperator,
        domainElementsForInputValues?: DeriveOperands): Types

    /** This function allows to create operators with arbitrary input operands,
     * e.g. un/bin/ternary operators with asymetric operand types.
     */
    createGenericOperator(name: string, outputType: Type,
        inferenceRule?: InferConcreteOperator | undefined,
        domainElementsForInputValues?: DeriveOperand | DeriveOperands,
        ...inputParameter: NameTypePair[]): Type;
}

/** TODO open questions:
 *
 * Alternative implementation strategies for operators would be
 * - a dedicated kind for operators, which might extend the 'function' kind
 * */

/**
 * This implementation realizes operators as functions and creates types of kind 'function'.
 * If Typir does not use the function kind so far, it will be automatically added.
 * There are some differences between operators and functions: operators have no declaration, it is not possible to have references to operators
 *
 * The same operator (i.e. same operator name, e.g. "+" or "and") with different types for its operands will be realized as different function types,
 * e.g. there are two functions for "+" for numbers and for strings.
 *
 * When specifying multiple names, for each name one operator is created with the given type (variant)s.
 * This allows to define multiple operators with the same signature (input and output types), but different names at once.
 *
 * All operands are mandatory.
 */
export class DefaultOperatorManager implements OperatorManager {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    // createUnaryOperator<T = unknown, D extends T = T>(name: string, operandTypes: Types, inferenceRule?: ((domainElement: T) => domainElement is D) | undefined, domainElementsForInputValues?: (domainElement: D) => unknown): Types {
    createUnaryOperator(name: Names, operandType: Types, inferenceRule?: InferConcreteOperator, domainElementsForInputValues?: DeriveOperand): Types {
        return this.handleOperatorVariants(name, operandType, (singleName, singleType) => this.createGenericOperator(
            singleName, singleType, inferenceRule,
            domainElementsForInputValues,
            { name: 'operand', type: singleType }));
    }

    createBinaryOperator(name: Names, inputType: Types, outputType?: Type, inferenceRule?: InferConcreteOperator, domainElementsForInputValues?: DeriveOperands): Types {
        return this.handleOperatorVariants(name, inputType, (singleName, singleType) => this.createGenericOperator(
            singleName, outputType ?? singleType, inferenceRule,
            domainElementsForInputValues,
            { name: 'left', type: singleType},
            { name: 'right', type: singleType}));
    }

    createTernaryOperator(name: Names, firstType: Type, secondAndThirdType: Types, inferenceRule?: InferConcreteOperator, domainElementsForInputValues?: DeriveOperands): Types {
        return this.handleOperatorVariants(name, secondAndThirdType, (singleName, singleType) => this.createGenericOperator(
            singleName, singleType, inferenceRule,
            domainElementsForInputValues,
            { name: 'first', type: firstType},
            { name: 'second', type: singleType},
            { name: 'third', type: singleType}));
    }

    protected handleOperatorVariants(nameVariants: Names, typeVariants: Types, typeCreator: (singleName: string, singleType: Type) => Type): Types {
        const allNames = toArray(nameVariants);
        const allTypes = toArray(typeVariants);
        assertTrue(allTypes.length >= 1);
        const result: Type[] = [];
        for (const singleName of allNames) {
            for (const singleType of allTypes) {
                result.push(typeCreator(singleName, singleType));
            }
        }
        return result.length === 1 ? result[0] : result;
    }

    createGenericOperator(name: string, outputType: Type, inferenceRule?: InferConcreteOperator, domainElementsForInputValues?: (DeriveOperand | DeriveOperands), ...inputParameter: NameTypePair[]): Type {
        // define/register the wanted operator as "special" function

        // ensure, that Typir uses the predefined 'function' kind
        const kind = this.typir.getKind(FunctionKindName);
        const functionKind = isFunctionKind(kind) ? kind : new FunctionKind(this.typir);

        // create the operator as type of kind 'function'
        const newOperatorType = functionKind.createFunctionType(name,
            { name: FUNCTION_MISSING_NAME, type: outputType },
            inputParameter,
            undefined, // operators have no declaration in the code => no inference rule for the operator declaration!
            inferenceRule ? ((domainElement: unknown) => { // but infer the operator when the operator is called!
                if (inferenceRule(domainElement, name)) {
                    // are there children, which have to match as well?
                    if (domainElementsForInputValues) {
                        // yes => resolve the types of the children and continue to step 2
                        return toArray(domainElementsForInputValues(domainElement, name));
                    } else {
                        // no => type is already found
                        return true;
                    }
                } else {
                    // does not match at all
                    return false;
                }
            }) : undefined
        );

        return newOperatorType;
    }
}
