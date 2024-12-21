/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeReference } from '../initialization/type-reference.js';
import { WaitingForIdentifiableAndCompletedTypeReferences, WaitingForInvalidTypeReferences } from '../initialization/type-waiting.js';
import { Kind, isKind } from '../kinds/kind.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { assertTrue, assertUnreachable } from '../utils/utils.js';
import { TypeEdge } from './type-edge.js';

/**
 * The transitions between the states of a type are depicted as state machine:
 *
 * ```mermaid
 * stateDiagram-v2
 *     [*] --> Invalid
 *     Invalid --> Identifiable
 *     Identifiable --> Completed
 *     Completed --> Invalid
 *     Identifiable --> Invalid
 * ```
 *
 * A state is 'Completed', when all its dependencies are available, i.e. the types of all its properties are available.
 * A state is 'Identifiable', when all those dependencies are available which are required to calculate the identifier of the type.
 * A state is 'Invalid' otherwise.
 * 'Invalid' is made explicit, since it might require less dependencies than 'Completed' and therefore speed-ups the resolution of dependencies.
 */
export type TypeInitializationState = 'Invalid' | 'Identifiable' | 'Completed';

export interface PreconditionsForInitializationState {
    referencesToBeIdentifiable?: TypeReference[]; // or later/more
    referencesToBeCompleted?: TypeReference[]; // or later/more
}

/**
 * Contains properties which are be relevant for all types to create,
 * i.e. it is used for specifying details of all types to create.
 */
export interface TypeDetails {
    /** A node from the language might be associated with the new type to create,
     * e.g. the declaration node in the AST (e.g. a FunctionDeclarationNode is associated with the corresponding FunctionType). */
    associatedLanguageNode?: unknown;
}

/**
 * Design decisions:
 * - features of types are realized/determined by their kinds
 * - Identifiers of types must be unique!
 */
export abstract class Type {
    readonly kind: Kind; // => $kind: string, required for isXType() checks
    /* Design decision for the name of this attribute
     * - identifier
     * - ID: sounds like an arbitrary, internal value without schema behind
     * - name: what is the name of a union type?
     * 'undefined' is required for cases, when the identifier is calculated later, since required information is not yet available.
     */
    protected identifier: string | undefined;

    // this is required only to apply graph algorithms in a generic way!
    // $relation is used as key
    protected readonly edgesIncoming: Map<string, TypeEdge[]> = new Map();
    protected readonly edgesOutgoing: Map<string, TypeEdge[]> = new Map();

    /**
     * A node from the language might be associated with the current type,
     * e.g. the declaration node in the AST (e.g. a FunctionDeclarationNode is associated with the corresponding FunctionType)
     * This language node is _not_ used for managing the lifecycles of this type,
     * since it should be usable for any domain-specific purpose.
     * Therefore, the use and update of this feature is under the responsibility of the user of Typir.
     */
    readonly associatedLanguageNode: unknown | undefined;

    constructor(identifier: string | undefined, typeDetails: TypeDetails) {
        this.identifier = identifier;
        this.associatedLanguageNode = typeDetails.associatedLanguageNode;
    }


    /**
     * Identifiers must be unique and stable for all types known in a single Typir instance, since they are used as key to store types in maps.
     * Identifiers might have a naming schema for calculatable values.
     */
    getIdentifier(): string {
        // an Identifier must be available; note that the state might be 'Invalid' nevertheless, which is required to handle cyclic type definitions
        assertTrue(this.identifier !== undefined);
        return this.identifier;
    }

    /**
     * Returns a string value containing a short representation of the type to be shown to users of the type-checked language nodes.
     * This value don't need to be unique for all types.
     * This name should be quite short.
     * Services should not call this function directly, but typir.printer.printTypeName(...) instead.
     * @returns a short string value to show to the user
     */
    abstract getName(): string;

    /**
     * Calculates a string value which might be shown to users of the type-checked language nodes.
     * This value don't need to be unique for all types.
     * This representation might be longer and show lots of details of the type.
     * Services should not call this function directly, but typir.printer.printTypeUserRepresentation(...) instead.
     * @returns a longer string value to show to the user
     */
    abstract getUserRepresentation(): string;



    // store the state of the initialization process of this type

    protected initializationState: TypeInitializationState = 'Invalid';

    getInitializationState(): TypeInitializationState {
        return this.initializationState;
    }

    protected assertState(expectedState: TypeInitializationState): void {
        if (this.isInState(expectedState) === false) {
            throw new Error(`The current state of type '${this.identifier}' is ${this.initializationState}, but ${expectedState} is expected.`);
        }
    }
    protected assertNotState(expectedState: TypeInitializationState): void {
        if (this.isNotInState(expectedState) === false) {
            throw new Error(`The current state of type '${this.identifier}' is ${this.initializationState}, but this state is not expected.`);
        }
    }
    protected assertStateOrLater(expectedState: TypeInitializationState): void {
        if (this.isInStateOrLater(expectedState) === false) {
            throw new Error(`The current state of type '${this.identifier}' is ${this.initializationState}, but this state is not expected.`);
        }
    }

    isInState(state: TypeInitializationState): boolean {
        return this.initializationState === state;
    }
    isNotInState(state: TypeInitializationState): boolean {
        return this.initializationState !== state;
    }
    isInStateOrLater(state: TypeInitializationState): boolean {
        switch (state) {
            case 'Invalid':
                return true;
            case 'Identifiable':
                return this.initializationState !== 'Invalid';
            case 'Completed':
                return this.initializationState === 'Completed';
            default:
                assertUnreachable(state);
        }
    }


    // manage listeners for updates of the initialization state

    protected stateListeners: TypeStateListener[] = [];

    addListener(newListeners: TypeStateListener, informIfNotInvalidAnymore: boolean): void {
        this.stateListeners.push(newListeners);
        if (informIfNotInvalidAnymore) {
            const currentState = this.getInitializationState();
            switch (currentState) {
                case 'Invalid':
                    // don't inform about the Invalid state!
                    break;
                case 'Identifiable':
                    newListeners.switchedToIdentifiable(this);
                    break;
                case 'Completed':
                    newListeners.switchedToIdentifiable(this); // inform about both Identifiable and Completed!
                    newListeners.switchedToCompleted(this);
                    break;
                default:
                    assertUnreachable(currentState);
            }
        }
    }

    removeListener(listener: TypeStateListener): void {
        const index = this.stateListeners.indexOf(listener);
        if (index >= 0) {
            this.stateListeners.splice(index, 1);
        }
    }

    // initialization logic which is specific for the type to initialize
    protected onIdentification: () => void;
    protected onCompletion: () => void;
    protected onInvalidation: () => void;

    // internal helpers
    protected waitForIdentifiable: WaitingForIdentifiableAndCompletedTypeReferences;
    protected waitForCompleted: WaitingForIdentifiableAndCompletedTypeReferences;
    protected waitForInvalid: WaitingForInvalidTypeReferences;

    /**
     * Use this method to specify, how THIS new type should be initialized.
     *
     * This method has(!) to be called at the end(!) of the constructor of each specific Type implementation, even if nothing has to be specified,
     * since calling this method starts the initialization process!
     * If you forget the call this method, the new type remains invalid and invisible for Typir and you will not be informed about this problem!
     *
     * @param preconditions all possible options for the initialization process
     */
    protected defineTheInitializationProcessOfThisType(preconditions: {
        /** Contains only those TypeReferences which are required to do the initialization. */
        preconditionsForIdentifiable?: PreconditionsForInitializationState,
        /** Contains only those TypeReferences which are required to do the completion.
         * TypeReferences which are required only for the initialization, but not for the completion,
         * don't need to be repeated here, since the completion is done only after the initialization. */
        preconditionsForCompleted?: PreconditionsForInitializationState,
        /** Must contain all(!) TypeReferences of a type. */
        referencesRelevantForInvalidation?: TypeReference[],
        /** typical use cases: calculate the identifier, register inference rules for the type object already now! */
        onIdentifiable?: () => void,
        /** typical use cases: do some internal checks for the completed properties */
        onCompleted?: () => void,
        onInvalidated?: () => void,
    }): void {
        // store the reactions
        this.onIdentification = preconditions.onIdentifiable ?? (() => {});
        this.onCompletion = preconditions.onCompleted ?? (() => {});
        this.onInvalidation = preconditions.onInvalidated ?? (() => {});

        // preconditions for Identifiable
        this.waitForIdentifiable = new WaitingForIdentifiableAndCompletedTypeReferences(
            preconditions.preconditionsForIdentifiable?.referencesToBeIdentifiable,
            preconditions.preconditionsForIdentifiable?.referencesToBeCompleted,
        );
        this.waitForIdentifiable.addTypesToIgnoreForCycles(new Set([this])); // start of the principle: children don't need to wait for their parents
        // preconditions for Completed
        this.waitForCompleted = new WaitingForIdentifiableAndCompletedTypeReferences(
            preconditions.preconditionsForCompleted?.referencesToBeIdentifiable,
            preconditions.preconditionsForCompleted?.referencesToBeCompleted,
        );
        this.waitForCompleted.addTypesToIgnoreForCycles(new Set([this])); // start of the principle: children don't need to wait for their parents
        // preconditions for Invalid
        this.waitForInvalid = new WaitingForInvalidTypeReferences(
            preconditions.referencesRelevantForInvalidation ?? [],
        );

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const thisType = this;

        // invalid --> identifiable
        this.waitForIdentifiable.addListener({
            onFulfilled(_waiter) {
                thisType.switchFromInvalidToIdentifiable();
                if (thisType.waitForCompleted.isFulfilled()) {
                    // this is required to ensure the stric order Identifiable --> Completed, since 'waitForCompleted' might already be triggered
                    thisType.switchFromIdentifiableToCompleted();
                }
            },
            onInvalidated(_waiter) {
                thisType.switchFromCompleteOrIdentifiableToInvalid();
            },
        }, true); // 'true' triggers the initialization process!
        // identifiable --> completed
        this.waitForCompleted.addListener({
            onFulfilled(_waiter) {
                if (thisType.waitForIdentifiable.isFulfilled()) {
                    thisType.switchFromIdentifiableToCompleted();
                } else {
                    // switching will be done later by 'waitForIdentifiable' in order to conform to the stric order Identifiable --> Completed
                }
            },
            onInvalidated(_waiter) {
                thisType.switchFromCompleteOrIdentifiableToInvalid();
            },
        }, false); // not required, since 'waitForIdentifiable' will switch to Completed as well!
        // identifiable/completed --> invalid
        this.waitForInvalid.addListener(() => {
            this.switchFromCompleteOrIdentifiableToInvalid();
        }, false); // no initial trigger, since 'Invalid' is the initial state
    }

    /**
     * This is an internal method to ignore some types during the initialization process in order to prevent dependency cycles.
     * Usually there is no need to call this method on your own.
     * @param additionalTypesToIgnore the new types to ignore during
     */
    ignoreDependingTypesDuringInitialization(additionalTypesToIgnore: Set<Type>): void {
        this.waitForIdentifiable.addTypesToIgnoreForCycles(additionalTypesToIgnore);
        this.waitForCompleted.addTypesToIgnoreForCycles(additionalTypesToIgnore);
    }

    dispose(): void {
        // clear everything
        this.stateListeners.splice(0, this.stateListeners.length);
        this.waitForInvalid.getWaitForRefsInvalid().forEach(ref => ref.deconstruct());
        this.waitForIdentifiable.deconstruct();
        this.waitForCompleted.deconstruct();
        this.waitForInvalid.deconstruct();
    }

    protected switchFromInvalidToIdentifiable(): void {
        this.assertState('Invalid');
        this.onIdentification();
        this.initializationState = 'Identifiable';
        this.stateListeners.slice().forEach(listener => listener.switchedToIdentifiable(this)); // slice() prevents issues with removal of listeners during notifications
    }

    protected switchFromIdentifiableToCompleted(): void {
        this.assertState('Identifiable');
        this.onCompletion();
        this.initializationState = 'Completed';
        this.stateListeners.slice().forEach(listener => listener.switchedToCompleted(this)); // slice() prevents issues with removal of listeners during notifications
    }

    protected switchFromCompleteOrIdentifiableToInvalid(): void {
        if (this.isNotInState('Invalid')) {
            this.onInvalidation();
            this.initializationState = 'Invalid';
            this.stateListeners.slice().forEach(listener => listener.switchedToInvalid(this)); // slice() prevents issues with removal of listeners during notifications
            // add the types again, since the initialization process started again
            this.waitForIdentifiable.addTypesToIgnoreForCycles(new Set([this]));
            this.waitForCompleted.addTypesToIgnoreForCycles(new Set([this]));
        } else {
            // is already 'Invalid' => do nothing
        }
    }



    /**
     * Analyzes, whether two types are equal.
     * @param otherType to be compared with the current type
     * @returns an empty array, if both types are equal, otherwise some problems which might point to found differences/conflicts between the two types.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeTypeEqualityProblems(otherType: Type): TypirProblem[];

    /**
     * Analyzes, whether there is a sub type-relationship between two types.
     * The difference between sub type-relationships and super type-relationships are only switched types.
     * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
     *
     * @param superType the super type, while the current type is the sub type
     * @returns an empty array, if the relationship exists, otherwise some problems which might point to violations of the investigated relationship.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeIsSubTypeOf(superType: Type): TypirProblem[];

    /**
     * Analyzes, whether there is a super type-relationship between two types.
     * The difference between sub type-relationships and super type-relationships are only switched types.
     * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
     *
     * @param subType the sub type, while the current type is super type
     * @returns an empty array, if the relationship exists, otherwise some problems which might point to violations of the investigated relationship.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeIsSuperTypeOf(subType: Type): TypirProblem[];


    addIncomingEdge(edge: TypeEdge): void {
        const key = edge.$relation;
        if (this.edgesIncoming.has(key)) {
            this.edgesIncoming.get(key)!.push(edge);
        } else {
            this.edgesIncoming.set(key, [edge]);
        }
    }
    addOutgoingEdge(edge: TypeEdge): void {
        const key = edge.$relation;
        if (this.edgesOutgoing.has(key)) {
            this.edgesOutgoing.get(key)!.push(edge);
        } else {
            this.edgesOutgoing.set(key, [edge]);
        }
    }

    removeIncomingEdge(edge: TypeEdge): boolean {
        const key = edge.$relation;
        const list = this.edgesIncoming.get(key);
        if (list) {
            const index = list.indexOf(edge);
            if (index >= 0) {
                list.splice(index, 1);
                if (list.length <= 0) {
                    this.edgesIncoming.delete(key);
                }
                return true;
            }
        }
        return false;
    }
    removeOutgoingEdge(edge: TypeEdge): boolean {
        const key = edge.$relation;
        const list = this.edgesOutgoing.get(key);
        if (list) {
            const index = list.indexOf(edge);
            if (index >= 0) {
                list.splice(index, 1);
                if (list.length <= 0) {
                    this.edgesOutgoing.delete(key);
                }
                return true;
            }
        }
        return false;
    }

    getIncomingEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return this.edgesIncoming.get($relation) as T[] ?? [];
    }
    getOutgoingEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return this.edgesOutgoing.get($relation) as T[] ?? [];
    }
    getEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return [
            ...this.getIncomingEdges($relation),
            ...this.getOutgoingEdges($relation),
        ];
    }

    getAllIncomingEdges(): TypeEdge[] {
        return Array.from(this.edgesIncoming.values()).flat();
    }
    getAllOutgoingEdges(): TypeEdge[] {
        return Array.from(this.edgesOutgoing.values()).flat();
    }
    getAllEdges(): TypeEdge[] {
        return [
            ...this.getAllIncomingEdges(),
            ...this.getAllOutgoingEdges(),
        ];
    }
}

export function isType(type: unknown): type is Type {
    return typeof type === 'object' && type !== null && typeof (type as Type).getIdentifier === 'function' && isKind((type as Type).kind);
}


export interface TypeStateListener {
    switchedToInvalid(type: Type): void;
    switchedToIdentifiable(type: Type): void;
    switchedToCompleted(type: Type): void;
}
