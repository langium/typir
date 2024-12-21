/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../../graph/type-edge.js';
import { TypeGraphListener } from '../../graph/type-graph.js';
import { Type, TypeDetails } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeSelector } from '../../initialization/type-selector.js';
import { CompositeTypeInferenceRule } from '../../services/inference.js';
import { ValidationProblem } from '../../services/validation.js';
import { TypirServices } from '../../typir.js';
import { NameTypePair } from '../../utils/utils-definitions.js';
import { TypeCheckStrategy, checkTypes, checkValueForConflict, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { Kind, isKind } from '../kind.js';
import { FunctionTypeInitializer } from './function-initializer.js';
import { FunctionType, isFunctionType } from './function-type.js';


export interface FunctionKindOptions {
    // these three options controls structural vs nominal typing somehow ...
    enforceFunctionName: boolean,
    enforceInputParameterNames: boolean,
    enforceOutputParameterName: boolean,
    /** Will be used only internally as prefix for the unique identifiers for function type names. */
    identifierPrefix: string,
    /** If a function has no output type (e.g. "void" functions), this type is returned during the type inference of calls to these functions.
     * The default value "THROW_ERROR" indicates to throw an error, i.e. type inference for calls of such functions are not allowed. */
    typeToInferForCallsOfFunctionsWithoutOutput: 'THROW_ERROR' | TypeSelector;
    subtypeParameterChecking: TypeCheckStrategy;
}

export const FunctionKindName = 'FunctionKind';

export type FunctionCallValidationRule<T> = (functionCall: T, functionType: FunctionType, typir: TypirServices) => ValidationProblem[];

export interface CreateParameterDetails {
    name: string;
    type: TypeSelector;
}

export interface FunctionTypeDetails extends TypeDetails {
    functionName: string,
    /** The order of parameters is important! */
    outputParameter: CreateParameterDetails | undefined,
    inputParameters: CreateParameterDetails[],
}
export interface CreateFunctionTypeDetails<T> extends FunctionTypeDetails {
    /** for function declarations => returns the funtion type (the whole signature including all names) */
    inferenceRuleForDeclaration?: (languageNode: unknown) => boolean,
    /** for function calls => returns the return type of the function */
    inferenceRuleForCalls?: InferFunctionCall<T>,
    // TODO for function references (like the declaration, but without any names!) => returns signature (without any names)

    /** This validation will be applied to all language nodes which represent calls of the functions. */
    validationForCall?: FunctionCallValidationRule<T>,
}

/** Collects all functions with the same name */
export interface OverloadedFunctionDetails {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overloadedFunctions: Array<SingleFunctionDetails<any>>;
    inference: CompositeTypeInferenceRule; // collects the inference rules for all functions with the same name
    sameOutputType: Type | undefined; // if all overloaded functions with the same name have the same output/return type, this type is remembered here
}

export interface SingleFunctionDetails<T> {
    functionType: FunctionType;
    inferenceRuleForCalls?: InferFunctionCall<T>;
}

// (languageNode: unknown) => boolean | unknown[]
export type InferFunctionCall<T = unknown> = {
    filter: (languageNode: unknown) => languageNode is T;
    matching: (languageNode: T) => boolean;
    inputArguments: (languageNode: T) => unknown[];
};

/**
 * Architecture of Inference rules:
 * - flag for overload / checking parameter types => no, that is bad usability, e.g. operators use already overloaded functions!
 * - overloaded functions are specific for the function kind => solve it inside the FunctionKind!
 *
 * How many inference rules?
 * - The inference rule for calls of each function type with the same name are grouped together in order to provide better error messages, if none of the variants match.
 * - Checking multiple functions within the same rule (e.g. only one inference rule for the function kind or one inference rule for each function name) does not work,
 *   since multiple different sets of parameters must be returned for overloaded functions!
 * - multiple IR collectors: how to apply all the other rules?!
 *
 * How many validation rules?
 * - For validation, it is enough that at least one of the function variants match!
 * - But checking that is not possible with independent rules for each function variant.
 * - Therefore, it must be a single validation for each function name (with all type variants).
 * - In order to simplify (de)registering validation rules, only one validation rule for all functions is used here (with an internal loop over all function names).
 *
 * How to know the available (overloaded) functions?
 * - search in all Types VS remember them in a Map; add VS remove function type
 */


export interface FunctionFactoryService {
    create<T>(typeDetails: CreateFunctionTypeDetails<T>): TypeInitializer<FunctionType>;
    get(typeDetails: FunctionTypeDetails): TypeReference<FunctionType>;
    calculateIdentifier(typeDetails: FunctionTypeDetails): string;
}

/**
 * Represents signatures of executable code.
 *
 * Constraints of overloaded functions:
 * - no duplicated variants!
 * - The names of all paramaters don't matter for functions to be unique.
 * - a variant is uniquely identified by: function name (if available), types of input parameters; options.identifierPrefix
 * - For overloaded functions, it is not enough to have different output types or different parameter names!
 *
 * TODO possible Extensions:
 * - multiple output parameters
 * - create variants of this, e.g. functions, procedures, lambdas
 * - (structural vs nominal typing? somehow realized by the three options above ...)
 * - optional parameters
 * - parameters which are used for output AND input
 */
export class FunctionKind implements Kind, TypeGraphListener, FunctionFactoryService {
    readonly $name: 'FunctionKind';
    readonly services: TypirServices;
    readonly options: Readonly<FunctionKindOptions>;
    /** Limitations
     * - Works only, if function types are defined using the createFunctionType(...) function below!
     */
    readonly mapNameTypes: Map<string, OverloadedFunctionDetails> = new Map(); // function name => all overloaded functions with this name/key
    // TODO try to replace this map with calculating the required identifier for the function

    constructor(services: TypirServices, options?: Partial<FunctionKindOptions>) {
        this.$name = FunctionKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);

        // register Validations for input arguments of function calls (must be done here to support overloaded functions)
        this.services.validation.Collector.addValidationRule(
            (languageNode, typir) => {
                const resultAll: ValidationProblem[] = [];
                for (const [overloadedName, overloadedFunctions] of this.mapNameTypes.entries()) {
                    const resultOverloaded: ValidationProblem[] = [];
                    const isOverloaded = overloadedFunctions.overloadedFunctions.length >= 2;
                    for (const singleFunction of overloadedFunctions.overloadedFunctions) {
                        if (singleFunction.inferenceRuleForCalls === undefined) {
                            continue;
                        }
                        const filter = singleFunction.inferenceRuleForCalls.filter(languageNode);
                        if (filter) {
                            const matching = singleFunction.inferenceRuleForCalls.matching(languageNode);
                            if (matching) {
                                const inputArguments = singleFunction.inferenceRuleForCalls.inputArguments(languageNode);
                                if (inputArguments && inputArguments.length >= 1) {
                                    // partial match:
                                    const expectedParameterTypes = singleFunction.functionType.getInputs();
                                    // check, that the given number of parameters is the same as the expected number of input parameters
                                    const currentProblems: ValidationProblem[] = [];
                                    const parameterLength = checkValueForConflict(expectedParameterTypes.length, inputArguments.length, 'number of input parameter values');
                                    if (parameterLength.length >= 1) {
                                        currentProblems.push({
                                            $problem: ValidationProblem,
                                            languageNode: languageNode,
                                            severity: 'error',
                                            message: 'The number of given parameter values does not match the expected number of input parameters.',
                                            subProblems: parameterLength,
                                        });
                                    } else {
                                        // there are parameter values to check their types
                                        const inferredParameterTypes = inputArguments.map(p => typir.Inference.inferType(p));
                                        for (let i = 0; i < inputArguments.length; i++) {
                                            const expectedType = expectedParameterTypes[i];
                                            const inferredType = inferredParameterTypes[i];
                                            const parameterProblems = checkTypes(inferredType, expectedType, createTypeCheckStrategy('ASSIGNABLE_TYPE', typir), true);
                                            if (parameterProblems.length >= 1) {
                                                // the value is not assignable to the type of the input parameter
                                                // create one ValidationProblem for each problematic parameter!
                                                currentProblems.push({
                                                    $problem: ValidationProblem,
                                                    languageNode: inputArguments[i],
                                                    severity: 'error',
                                                    message: `The parameter '${expectedType.name}' at index ${i} got a value with a wrong type.`,
                                                    subProblems: parameterProblems,
                                                });
                                            } else {
                                                // this parameter value is fine
                                            }
                                        }
                                    }
                                    // summarize all parameters of the current function
                                    if (currentProblems.length >= 1) {
                                        // some problems with parameters => this signature does not match
                                        resultOverloaded.push({
                                            $problem: ValidationProblem,
                                            languageNode: languageNode,
                                            severity: 'error',
                                            message: `The given operands for the function '${this.services.Printer.printTypeName(singleFunction.functionType)}' match the expected types only partially.`,
                                            subProblems: currentProblems,
                                        });
                                    } else {
                                        return []; // 100% match found! (same case as above)
                                    }
                                } else {
                                    // complete match found => no hurt constraint here => no error to show
                                    // since this signature matches 100%, there is no need to check the other function signatures anymore!
                                    return [];
                                }
                            } else {
                                // false => does slightly not match => no constraints apply here => no error to show here
                            }
                        } else {
                            // false => does not match at all => no constraints apply here => no error to show here
                        }
                    }
                    if (resultOverloaded.length >= 1) {
                        if (isOverloaded) {
                            resultAll.push({
                                $problem: ValidationProblem,
                                languageNode: languageNode,
                                severity: 'error',
                                message: `The given operands for the overloaded function '${overloadedName}' match the expected types only partially.`,
                                subProblems: resultOverloaded,
                            });
                        } else {
                            resultAll.push(...resultOverloaded);
                        }
                    }
                }
                return resultAll;
            }
        );
    }

    protected collectOptions(options?: Partial<FunctionKindOptions>): FunctionKindOptions {
        return {
            // the default values:
            enforceFunctionName: false,
            enforceInputParameterNames: false,
            enforceOutputParameterName: false,
            identifierPrefix: 'function',
            typeToInferForCallsOfFunctionsWithoutOutput: 'THROW_ERROR',
            subtypeParameterChecking: 'SUB_TYPE',
            // the actually overriden values:
            ...options
        };
    }

    get(typeDetails: FunctionTypeDetails): TypeReference<FunctionType> {
        return new TypeReference(() => this.calculateIdentifier(typeDetails), this.services);
    }

    create<T>(typeDetails: CreateFunctionTypeDetails<T>): TypeInitializer<FunctionType> {
        return new FunctionTypeInitializer(this.services, this, typeDetails);
    }

    getOutputTypeForFunctionCalls(functionType: FunctionType): Type | undefined {
        return functionType.getOutput('RETURN_UNDEFINED')?.type ?? // by default, use the return type of the function ...
            // ... if this type is missing, use the specified type for this case in the options:
            // 'THROW_ERROR': an error will be thrown later, when this case actually occurs!
            (this.options.typeToInferForCallsOfFunctionsWithoutOutput === 'THROW_ERROR'
                ? undefined
                : this.services.infrastructure.TypeResolver.resolve(this.options.typeToInferForCallsOfFunctionsWithoutOutput));
    }


    /* Get informed about deleted types in order to remove inference rules which are bound to them. */

    addedType(_newType: Type, _key: string): void {
        // do nothing
    }
    removedType(type: Type, _key: string): void {
        if (isFunctionType(type)) {
            const overloads = this.mapNameTypes.get(type.functionName);
            if (overloads) {
                // remove the current function
                const index = overloads.overloadedFunctions.findIndex(o => o.functionType === type);
                if (index >= 0) {
                    overloads.overloadedFunctions.splice(index, 1);
                }
                // its inference rule is removed by the CompositeTypeInferenceRule => nothing to do here
            }
        }
    }
    addedEdge(_edge: TypeEdge): void {
        // do nothing
    }
    removedEdge(_edge: TypeEdge): void {
        // do nothing
    }


    calculateIdentifier(typeDetails: FunctionTypeDetails): string {
        const prefix = this.options.identifierPrefix ? this.options.identifierPrefix + '-' : '';
        // function name, if wanted
        const functionName = this.hasFunctionName(typeDetails.functionName) ? typeDetails.functionName : '';
        // inputs: type identifiers in defined order
        const inputsString = typeDetails.inputParameters.map(input => this.services.infrastructure.TypeResolver.resolve(input.type).getIdentifier()).join(',');
        // output: type identifier
        const outputString = typeDetails.outputParameter ? this.services.infrastructure.TypeResolver.resolve(typeDetails.outputParameter.type).getIdentifier() : '';
        // complete signature
        return `${prefix}${functionName}(${inputsString}):${outputString}`;
    }

    getParameterRepresentation(parameter: NameTypePair): string {
        const typeName = parameter.type.getName();
        if (this.hasParameterName(parameter.name)) {
            return `${parameter.name}: ${typeName}`;
        } else {
            return typeName;
        }
    }

    enforceFunctionName(name: string | undefined, enforce: boolean): void {
        if (enforce && this.hasFunctionName(name) === false) {
            throw new Error('A name for the function is required.');
        }
    }
    hasFunctionName(name: string | undefined): name is string {
        return name !== undefined && name !== NO_FUNCTION_NAME;
    }

    enforceParameterName(name: string | undefined, enforce: boolean): void {
        if (enforce && this.hasParameterName(name) === false) {
            throw new Error('A name for the parameter is required.');
        }
    }
    hasParameterName(name: string | undefined): name is string {
        return name !== undefined && name !== NO_PARAMETER_NAME;
    }

}

// when the name is missing (e.g. for functions or their input/output parameters), use these values instead
export const NO_FUNCTION_NAME = '';
export const NO_PARAMETER_NAME = '';

export function isFunctionKind(kind: unknown): kind is FunctionKind {
    return isKind(kind) && kind.$name === FunctionKindName;
}
