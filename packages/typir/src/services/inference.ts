/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeEdge } from '../graph/type-edge.js';
import { TypeGraphListener } from '../graph/type-graph.js';
import { isType, Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { isSpecificTypirProblem, TypirProblem } from '../utils/utils-definitions.js';
import { LanguageNodeInferenceCaching } from './caching.js';

export interface InferenceProblem extends TypirProblem {
    $problem: 'InferenceProblem';
    languageNode: unknown;
    inferenceCandidate?: Type;
    location: string;
    rule?: TypeInferenceRule; // for debugging only, since rules have no names (so far); TODO this does not really work with TypeInferenceRuleWithoutInferringChildren
    subProblems: TypirProblem[]; // might be missing or empty
}
export const InferenceProblem = 'InferenceProblem';
export function isInferenceProblem(problem: unknown): problem is InferenceProblem {
    return isSpecificTypirProblem(problem, InferenceProblem);
}

// Type and Value to indicate, that an inference rule is intended for another case, and therefore is unable to infer a type for the current case.
export type InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?
export const InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?

export type TypeInferenceResultWithoutInferringChildren =
    /** the identified type */
    Type |
    /** 'N/A' to indicate, that the current inference rule is not applicable for the given language node at all */
    InferenceRuleNotApplicable |
    /** a language node whose type should be inferred instead */
    unknown |
    /** an inference problem */
    InferenceProblem;
type TypeInferenceResultWithInferringChildren =
    /** the usual results, since it might be possible to determine the type of the parent without its children */
    TypeInferenceResultWithoutInferringChildren |
    /** the children whos types need to be inferred and taken into account to determine the parent's type */
    unknown[];

/**
 * Represents a single rule for inference,
 * i.e. only a single type (or no type at all) can be inferred for a given language node.
 * There are inference rules which dependent on types of children of the given language node (e.g. calls of overloaded functions depend on the types of the current arguments)
 * and there are inference rules without this need.
 *
 * Within inference rules, don't take the initialization state of the inferred type into account,
 * since such inferrence rules might not work for cyclic type definitions.
 */
export type TypeInferenceRule = TypeInferenceRuleWithoutInferringChildren | TypeInferenceRuleWithInferringChildren;

/** Usual inference rule which don't depend on children's types. */
export type TypeInferenceRuleWithoutInferringChildren = (languageNode: unknown, typir: TypirServices) => TypeInferenceResultWithoutInferringChildren;

/**
 * Inference rule which requires for the type inference of the given parent to take the types of its children into account.
 * Therefore, the types of the children need to be inferred first.
 */
export interface TypeInferenceRuleWithInferringChildren {
    /**
     * 1st step is to check, whether this inference rule is applicable to the given language node.
     * @param languageNode the language node whose type shall be inferred
     * @param typir the current Typir instance
     * @returns Only in the case, that child language nodes are returned,
     * the other function will be called for step 2, otherwise, it is skipped.
     */
    inferTypeWithoutChildren(languageNode: unknown, typir: TypirServices): TypeInferenceResultWithInferringChildren;

    /**
     * 2nd step is to finally decide about the inferred type.
     * When the 1st step returned a list of language nodes to resolve their types,
     * this function is called in order to complete this inference rule, otherwise, this step is not called.
     * Advantage of this step is to split it to allow a postponed inferrence of the additional language nodes by Typir.
     * Disadvantage of this step is, that already checked TS types of languageNode cannot be reused.
     * @param languageNode the language node whose type shall be inferred
     * @param childrenTypes the types which are inferred from the language nodes of the 1st step (in the same order!)
     * @param typir the current Typir instance
     * @returns the finally inferred type or a problem, why this inference rule is finally not applicable
     */
    inferTypeWithChildrensTypes(languageNode: unknown, childrenTypes: Array<Type | undefined>, typir: TypirServices): Type | InferenceProblem
}


export interface TypeInferenceCollectorListener {
    addedInferenceRule(rule: TypeInferenceRule, boundToType?: Type): void;
    removedInferenceRule(rule: TypeInferenceRule, boundToType?: Type): void;
}

/**
 * Collects an arbitrary number of inference rules
 * and allows to infer a type for a given language node.
 */
export interface TypeInferenceCollector {
    /**
     * Infers a type for the given language node.
     * @param languageNode the language node whose type shall be inferred
     * @returns the found Type or some inference problems (might be empty), when none of the inference rules were able to infer a type
     */
    inferType(languageNode: unknown): Type | InferenceProblem[]

    /**
     * Registers an inference rule.
     * When inferring the type for a language node, all registered inference rules are checked until the first match.
     * @param rule a new inference rule
     * @param boundToType an optional type, if the new inference rule is dedicated for exactly this type.
     * If the given type is removed from the type system, this rule will be automatically removed as well.
     */
    addInferenceRule(rule: TypeInferenceRule, boundToType?: Type): void;
    removeInferenceRule(rule: TypeInferenceRule, boundToType?: Type): void;

    addListener(listener: TypeInferenceCollectorListener): void;
    removeListener(listener: TypeInferenceCollectorListener): void;
}


export class DefaultTypeInferenceCollector implements TypeInferenceCollector, TypeGraphListener {
    protected readonly inferenceRules: Map<string, TypeInferenceRule[]> = new Map(); // type identifier (otherwise '') -> inference rules
    protected readonly languageNodeInference: LanguageNodeInferenceCaching;
    protected readonly services: TypirServices;
    protected readonly listeners: TypeInferenceCollectorListener[] = [];

    constructor(services: TypirServices) {
        this.services = services;
        this.languageNodeInference = services.caching.LanguageNodeInference;
        this.services.infrastructure.Graph.addListener(this);
    }

    addInferenceRule(rule: TypeInferenceRule, boundToType?: Type): void {
        const key = this.getBoundToTypeKey(boundToType);
        let rules = this.inferenceRules.get(key);
        if (!rules) {
            rules = [];
            this.inferenceRules.set(key, rules);
        }
        rules.push(rule);
        this.listeners.forEach(listener => listener.addedInferenceRule(rule, boundToType));
    }

    removeInferenceRule(rule: TypeInferenceRule, boundToType?: Type): void {
        const key = this.getBoundToTypeKey(boundToType);
        const rules = this.inferenceRules.get(key);
        if (rules) {
            const index = rules.indexOf(rule);
            if (index >= 0) {
                rules.splice(index, 1);
            }
        }
    }

    protected getBoundToTypeKey(boundToType?: Type): string {
        return boundToType?.getIdentifier() ?? '';
    }

    inferType(languageNode: unknown): Type | InferenceProblem[] {
        // is the result already in the cache?
        const cached = this.cacheGet(languageNode);
        if (cached) {
            return cached;
        }

        // handle recursion loops
        if (this.pendingGet(languageNode)) {
            throw new Error(`There is a recursion loop for inferring the type from ${languageNode}! Probably, there are multiple interfering inference rules.`);
        }
        this.pendingSet(languageNode);

        // do the actual type inference
        const result = this.inferTypeLogic(languageNode);

        // the calculation is done
        this.pendingClear(languageNode);

        // remember the calculated type in the cache
        if (isType(result)) {
            this.cacheSet(languageNode, result);
        }
        return result;
    }

    protected checkForError(languageNode: unknown): void {
        if (languageNode === undefined || languageNode === null) {
            throw new Error('Language node must be not undefined/null!');
        }
    }

    protected inferTypeLogic(languageNode: unknown): Type | InferenceProblem[] {
        this.checkForError(languageNode);

        // check all rules
        const collectedInferenceProblems: InferenceProblem[] = [];
        for (const rules of this.inferenceRules.values()) {
            for (const rule of rules) {
                const result = this.executeSingleInferenceRuleLogic(rule, languageNode, collectedInferenceProblems);
                if (result) {
                    return result; // return the first inferred type
                } else {
                    // no result for this inference rule => check the next inference rules
                }
            }
        }

        // return all the collected inference problems
        if (collectedInferenceProblems.length <= 0) {
            // document the reason, why neither a type nor inference problems are found
            collectedInferenceProblems.push({
                $problem: InferenceProblem,
                languageNode: languageNode,
                location: 'found no applicable inference rules',
                subProblems: [],
            });
        }
        return collectedInferenceProblems;
    }

    protected executeSingleInferenceRuleLogic(rule: TypeInferenceRule, languageNode: unknown, collectedInferenceProblems: InferenceProblem[]): Type | undefined {
        if (typeof rule === 'function') {
            // simple case without type inference for children
            const ruleResult: TypeInferenceResultWithoutInferringChildren = rule(languageNode, this.services);
            this.checkForError(ruleResult);
            return this.inferTypeLogicWithoutChildren(ruleResult, collectedInferenceProblems);
        } else if (typeof rule === 'object') {
            // more complex case with inferring the type for children
            const ruleResult: TypeInferenceResultWithInferringChildren = rule.inferTypeWithoutChildren(languageNode, this.services);
            if (Array.isArray(ruleResult)) {
                // this rule might match => continue applying this rule
                // resolve the requested child types
                const childLanguageNodes = ruleResult;
                const childTypes: Array<Type | InferenceProblem[]> = childLanguageNodes.map(child => this.services.Inference.inferType(child));
                // check, whether inferring the children resulted in some other inference problems
                const childTypeProblems: InferenceProblem[] = [];
                for (let i = 0; i < childTypes.length; i++) {
                    const child = childTypes[i];
                    if (Array.isArray(child)) {
                        childTypeProblems.push({
                            $problem: InferenceProblem,
                            languageNode: childLanguageNodes[i],
                            location: `child language node ${i}`,
                            rule,
                            subProblems: child,
                        });
                    }
                }
                if (childTypeProblems.length >= 1) {
                    collectedInferenceProblems.push({
                        $problem: InferenceProblem,
                        languageNode: languageNode,
                        location: 'inferring depending children',
                        rule,
                        subProblems: childTypeProblems,
                    });
                    return undefined;
                } else {
                    // the types of all children are successfully inferred
                    const finalInferenceResult = rule.inferTypeWithChildrensTypes(languageNode, childTypes as Type[], this.services);
                    if (isType(finalInferenceResult)) {
                        // type is inferred!
                        return finalInferenceResult;
                    } else {
                        // inference is not applicable (probably due to a mismatch of the children's types) => check the next rule
                        collectedInferenceProblems.push(finalInferenceResult);
                        return undefined;
                    }
                }
            } else {
                return this.inferTypeLogicWithoutChildren(ruleResult, collectedInferenceProblems);
            }
        } else {
            assertUnreachable(rule);
        }
    }

    protected inferTypeLogicWithoutChildren(result: TypeInferenceResultWithoutInferringChildren, collectedInferenceProblems: InferenceProblem[]): Type | undefined {
        if (result === InferenceRuleNotApplicable) {
            // this rule is not applicable at all => ignore this rule
            return undefined;
        } else if (isType(result)) {
            // the result type is already found!
            return result;
        } else if (isInferenceProblem(result)) {
            // found some inference problems
            collectedInferenceProblems.push(result);
            return undefined;
        } else {
            // this 'result' language node is used instead to infer its type, which is the type for the current language node as well
            const recursiveResult = this.inferType(result);
            if (Array.isArray(recursiveResult)) {
                collectedInferenceProblems.push(...recursiveResult);
                return undefined;
            } else {
                return recursiveResult;
            }
        }
    }


    addListener(listener: TypeInferenceCollectorListener): void {
        this.listeners.push(listener);
    }
    removeListener(listener: TypeInferenceCollectorListener): void {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }


    /* Get informed about deleted types in order to remove inference rules which are bound to them. */

    addedType(_newType: Type, _key: string): void {
        // do nothing
    }
    removedType(type: Type, _key: string): void {
        const key = this.getBoundToTypeKey(type);
        const rulesToRemove = this.inferenceRules.get(key);
        // remove the inference rules associated to the deleted type
        this.inferenceRules.delete(key);
        // inform listeners about removed inference rules
        (rulesToRemove ?? []).forEach(rule => this.listeners.forEach(listener => listener.removedInferenceRule(rule, type)));
    }
    addedEdge(_edge: TypeEdge): void {
        // do nothing
    }
    removedEdge(_edge: TypeEdge): void {
        // do nothing
    }


    /* By default, the central cache of Typir is used. */

    protected cacheSet(languageNode: unknown, type: Type): void {
        this.languageNodeInference.cacheSet(languageNode, type);
    }

    protected cacheGet(languageNode: unknown): Type | undefined {
        return this.languageNodeInference.cacheGet(languageNode);
    }

    protected pendingSet(languageNode: unknown): void {
        this.languageNodeInference.pendingSet(languageNode);
    }
    protected pendingClear(languageNode: unknown): void {
        this.languageNodeInference.pendingClear(languageNode);
    }
    protected pendingGet(languageNode: unknown): boolean {
        return this.languageNodeInference.pendingGet(languageNode);
    }
}


/**
 * This inference rule uses multiple internal inference rules for doing the type inference.
 * If one of the child rules returns a type, this type is the result of the composite rule.
 * Otherwise, all problems of all child rules are returned.
 */
// This design looks a bit ugly ..., but "implements TypeInferenceRuleWithoutInferringChildren" does not work, since it is a function ...
export class CompositeTypeInferenceRule extends DefaultTypeInferenceCollector implements TypeInferenceRuleWithInferringChildren {

    // do not check "pending" (again), since it is already checked by the "parent" DefaultTypeInferenceCollector!
    override pendingGet(_languageNode: unknown): boolean {
        return false;
    }

    inferTypeWithoutChildren(languageNode: unknown, _typir: TypirServices): TypeInferenceResultWithInferringChildren {
        // do the type inference
        const result = this.inferType(languageNode);
        if (isType(result)) {
            return result;
        } else {
            if (result.length <= 0) {
                return InferenceRuleNotApplicable;
            } else if (result.length === 1) {
                return result[0];
            } else {
                return <InferenceProblem>{
                    $problem: InferenceProblem,
                    languageNode: languageNode,
                    location: 'sub-rules for inference',
                    rule: this,
                    subProblems: result,
                };
            }
        }
    }

    inferTypeWithChildrensTypes(_languageNode: unknown, _childrenTypes: Array<Type | undefined>, _typir: TypirServices): Type | InferenceProblem {
        throw new Error('This function will not be called.');
    }
}
