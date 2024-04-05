/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeComparisonStrategy, TypeConflict, compareTypes, createTypeComparisonStrategy } from '../utils/utils-type-comparison.js';
import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { assertTrue } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export interface FixedParameterKindOptions {
    subtypeParameterChecking: TypeComparisonStrategy,
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
    readonly parameterNames: string[];

    constructor(typir: Typir, baseName: string, options: FixedParameterKindOptions, ...parameterNames: string[]) {
        this.$name = `FixedParameterKind-${baseName}`;
        this.typir = typir;
        this.typir.registerKind(this);
        this.baseName = baseName;
        this.options = options;
        this.parameterNames = parameterNames;

        // check input
        assertTrue(this.parameterNames.length >= 1);
    }

    // the order of parameters matters!
    createFixedParameterType(...parameterTypes: Type[]): Type {
        // create the class type
        const typeWithParameters = new Type(this, this.printSignature(this.baseName, parameterTypes)); // use the signature for a unique name
        this.typir.graph.addNode(typeWithParameters);

        // add the given types to the required fixed parameters
        assertTrue(this.parameterNames.length === parameterTypes.length);
        for (let index = 0; index < this.parameterNames.length; index++) {
            const edge = new TypeEdge(typeWithParameters, parameterTypes[index], FIXED_PARAMETER_TYPE);
            this.typir.graph.addEdge(edge);
        }

        return typeWithParameters;
    }

    getUserRepresentation(type: Type): string {
        return this.printSignature(this.baseName, this.getParameterTypes(type));
    }
    protected printSignature(baseName: string, parameterTypes: Type[]): string {
        return `${baseName}<${parameterTypes.map(p => p.getUserRepresentation()).join(', ')}>`;
    }

    isSubType(superType: Type, subType: Type): TypeConflict[] {
        // same name, e.g. both need to be Map, Set, Array, ...
        if (isFixedParametersKind(superType.kind) && isFixedParametersKind(subType.kind) && superType.kind.baseName === subType.kind.baseName) {
            const conflicts: TypeConflict[] = [];
            // all parameter types must match
            const compareStrategy = createTypeComparisonStrategy(this.options.subtypeParameterChecking, this.typir);
            conflicts.push(...compareTypes(superType.kind.getParameterTypes(superType), subType.kind.getParameterTypes(subType), compareStrategy));
            return conflicts;
        }
        throw new Error();
    }

    areTypesEqual(type1: Type, type2: Type): TypeConflict[] {
        if (isFixedParametersKind(type1.kind) && isFixedParametersKind(type2.kind) && type1.kind.baseName === type2.kind.baseName) {
            const conflicts: TypeConflict[] = [];
            conflicts.push(...compareTypes(type1.kind.getParameterTypes(type1), type2.kind.getParameterTypes(type2), (t1, t2) => this.typir.equality.areTypesEqual(t1, t2)));
            return conflicts;
        }
        throw new Error();
    }

    getParameterTypes(fixedParameterType: Type): Type[] {
        const result = fixedParameterType.getOutgoingEdges(FIXED_PARAMETER_TYPE).map(edge => edge.to);
        assertTrue(result.length === this.parameterNames.length);
        return result;
    }
}

const FIXED_PARAMETER_TYPE = 'hasField';

export function isFixedParametersKind(kind: unknown): kind is FixedParameterKind {
    return isKind(kind) && kind.$name.startsWith('FixedParameterKind-');
}
