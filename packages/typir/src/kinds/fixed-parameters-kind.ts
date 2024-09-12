/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../features/equality.js';
import { SubTypeProblem } from '../features/subtype.js';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, checkTypes, checkValueForConflict, createKindConflict, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { assertTrue, toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export class Parameter {
    readonly name: string;
    readonly index: number;

    constructor(name: string, index: number) {
        this.name = name;
        this.index = index;
    }
}

export class ParameterValue {
    readonly parameter: Parameter;
    readonly type: Type;

    constructor(parameter: Parameter, type: Type) {
        this.parameter = parameter;
        this.type = type;
    }
}

export class FixedParameterType extends Type {
    override readonly kind: FixedParameterKind;
    readonly parameterValues: ParameterValue[];

    constructor(kind: FixedParameterKind, identifier: string, ...typeValues: Type[]) {
        super(identifier);
        this.kind = kind;

        // set the parameter values
        assertTrue(kind.parameters.length === typeValues.length);
        for (let i = 0; i < typeValues.length; i++) {
            this.parameterValues.push({
                parameter: kind.parameters[i],
                type: typeValues[i],
            });
        }
    }

    getParameterTypes(): Type[] {
        return this.parameterValues.map(p => p.type);
    }

    override getUserRepresentation(): string {
        return this.kind.printSignature(this.kind.baseName, this.getParameterTypes());
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isFixedParameterType(otherType)) {
            // same name, e.g. both need to be Map, Set, Array, ...
            const baseTypeCheck = checkValueForConflict(this.kind.baseName, otherType.kind.baseName, 'base type');
            if (baseTypeCheck.length >= 1) {
                // e.g. List<String> !== Set<String>
                return baseTypeCheck;
            } else {
                // all parameter types must match, e.g. Set<String> !== Set<Boolean>
                const conflicts: TypirProblem[] = [];
                conflicts.push(...checkTypes(this.getParameterTypes(), otherType.getParameterTypes(), (t1, t2) => this.kind.typir.equality.getTypeEqualityProblem(t1, t2)));
                return conflicts;
            }
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(this, otherType)],
            }];
        }
    }

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isFixedParameterType(superType)) {
            return this.analyzeSubTypeProblems(this, superType);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType,
                subType: this,
                subProblems: [createKindConflict(this, superType)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        if (isFixedParameterType(subType)) {
            return this.analyzeSubTypeProblems(subType, this);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType: this,
                subType,
                subProblems: [createKindConflict(subType, this)],
            }];
        }
    }

    protected analyzeSubTypeProblems(subType: FixedParameterType, superType: FixedParameterType): TypirProblem[] {
        // same name, e.g. both need to be Map, Set, Array, ...
        const baseTypeCheck = checkValueForConflict(subType.kind.baseName, superType.kind.baseName, 'base type');
        if (baseTypeCheck.length >= 1) {
            // e.g. List<String> !== Set<String>
            return baseTypeCheck;
        } else {
            // all parameter types must match, e.g. Set<String> !== Set<Boolean>
            const checkStrategy = createTypeCheckStrategy(this.kind.options.parameterSubtypeCheckingStrategy, this.kind.typir);
            return checkTypes(subType.getParameterTypes(), superType.getParameterTypes(), checkStrategy);
        }
    }
}

export function isFixedParameterType(type: unknown): type is FixedParameterType {
    return isType(type) && isFixedParametersKind(type.kind);
}



export interface FixedParameterTypeDetails {
    parameterTypes: Type | Type[]
}

export interface FixedParameterKindOptions {
    parameterSubtypeCheckingStrategy: TypeCheckStrategy,
}

export const FixedParameterKindName = 'FixedParameterKind';

/**
 * Suitable for kinds like Collection<T>, List<T>, Array<T>, Map<K, V>, ..., i.e. types with a fixed number of arbitrary parameter types
 */
export class FixedParameterKind implements Kind {
    readonly $name: `FixedParameterKind-${string}`;
    readonly typir: Typir;
    readonly baseName: string;
    readonly options: FixedParameterKindOptions;
    readonly parameters: Parameter[]; // assumption: the parameters are in the correct order!

    constructor(typir: Typir, baseName: string, options?: Partial<FixedParameterKindOptions>, ...parameterNames: string[]) {
        this.$name = `${FixedParameterKindName}-${baseName}`;
        this.typir = typir;
        this.typir.registerKind(this);
        this.baseName = baseName;
        this.options = {
            // the default values:
            parameterSubtypeCheckingStrategy: 'EQUAL_TYPE',
            // the actually overriden values:
            ...options
        };
        this.parameters = parameterNames.map((name, index) => <Parameter>{ name, index });

        // check input
        assertTrue(this.parameters.length >= 1);
    }

    // the order of parameters matters!
    createFixedParameterType(typeDetails: FixedParameterTypeDetails): FixedParameterType {
        // create the class type
        const typeWithParameters = new FixedParameterType(this, this.calculateIdentifier(typeDetails), ...toArray(typeDetails.parameterTypes));
        this.typir.graph.addNode(typeWithParameters);

        return typeWithParameters;
    }

    calculateIdentifier(typeDetails: FixedParameterTypeDetails): string {
        return this.printSignature(this.baseName, toArray(typeDetails.parameterTypes)); // use the signature for a unique name
    }

    printSignature(baseName: string, parameterTypes: Type[]): string {
        return `${baseName}<${parameterTypes.map(p => this.typir.printer.printType(p)).join(', ')}>`;
    }

}

export function isFixedParametersKind(kind: unknown): kind is FixedParameterKind {
    return isKind(kind) && kind.$name.startsWith('FixedParameterKind-');
}
