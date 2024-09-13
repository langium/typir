/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../features/equality.js';
import { InferenceRuleNotApplicable } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { isType, Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { createKindConflict } from '../utils/utils-type-comparison.js';
import { toArray } from '../utils/utils.js';
import { isKind, Kind } from './kind.js';

export class BottomType extends Type {
    override readonly kind: BottomKind;

    constructor(kind: BottomKind, identifier: string) {
        super(identifier);
        this.kind = kind;
    }

    override getUserRepresentation(): string {
        return this.identifier;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isBottomType(otherType)) {
            return [];
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(this, otherType)],
            }];
        }
    }

    override analyzeIsSubTypeOf(_superType: Type): TypirProblem[] {
        // a BottomType is the sub type of all types!
        return [];
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        if (isBottomType(subType)) {
            // special case by definition: BottomType is sub-type of BottomType
            return [];
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType: this,
                subType: subType,
                subProblems: [createKindConflict(this, subType)],
            }];
        }
    }

}

export function isBottomType(type: unknown): type is BottomType {
    return isType(type) && isBottomKind(type.kind);
}



export interface BottomTypeDetails {
    /** In case of multiple inference rules, later rules are not evaluated anymore, if an earler rule already matched. */
    inferenceRules?: InferBottomType | InferBottomType[]
}

export interface BottomKindOptions {
    name: string;
}

export type InferBottomType = (domainElement: unknown) => boolean;

export const BottomKindName = 'BottomKind';

export class BottomKind implements Kind {
    readonly $name: 'BottomKind';
    readonly typir: Typir;
    readonly options: BottomKindOptions;
    protected instance: BottomType | undefined;

    constructor(typir: Typir, options?: Partial<BottomKindOptions>) {
        this.$name = BottomKindName;
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            // the default values:
            name: 'never',
            // the actually overriden values:
            ...options
        };
    }

    getBottomType(typeDetails: BottomTypeDetails): BottomType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.typir.graph.getType(key) as BottomType;
    }

    getOrCreateBottomType(typeDetails: BottomTypeDetails): BottomType {
        const result = this.getBottomType(typeDetails);
        if (result) {
            return result;
        }
        return this.createBottomType(typeDetails);
    }

    createBottomType(typeDetails: BottomTypeDetails): BottomType {
        // create the bottom type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const bottomType = new BottomType(this, this.calculateIdentifier(typeDetails));
        this.instance = bottomType;
        this.typir.graph.addNode(bottomType);

        // register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small)
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.typir.inference.addInferenceRule((domainElement, _typir) => {
                for (const inferenceRule of rules) {
                    if (inferenceRule(domainElement)) {
                        return bottomType;
                    }
                }
                return InferenceRuleNotApplicable;
            });
        }

        return bottomType;
    }

    calculateIdentifier(_typeDetails: BottomTypeDetails): string {
        return this.options.name;
    }

}

export function isBottomKind(kind: unknown): kind is BottomKind {
    return isKind(kind) && kind.$name === BottomKindName;
}
