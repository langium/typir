/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { ValidationProblem, ValidationRule, ValidationRuleWithBeforeAfter } from '../../services/validation.js';
import { TypirServices } from '../../typir.js';
import { FunctionType, isFunctionType } from '../function/function-type.js';
import { isClassType, ClassType } from './class-type.js';

/**
 * Predefined validation to produce errors, if the same class is declared more than once.
 * This is often relevant for nominally typed classes.
 */
export class UniqueClassValidation implements ValidationRuleWithBeforeAfter {
    protected readonly foundDeclarations: Map<string, unknown[]> = new Map();

    protected readonly services: TypirServices;
    protected readonly isRelevant: (languageNode: unknown) => boolean; // using this check improves performance a lot

    constructor(services: TypirServices, isRelevant: (languageNode: unknown) => boolean) {
        this.services = services;
        this.isRelevant = isRelevant;
    }

    beforeValidation(_languageRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        this.foundDeclarations.clear();
        return [];
    }

    validation(languageNode: unknown, _typir: TypirServices): ValidationProblem[] {
        if (this.isRelevant(languageNode)) { // improves performance, since type inference need to be done only for relevant language nodes
            const type = this.services.Inference.inferType(languageNode);
            if (isClassType(type)) {
                // register language nodes which have ClassTypes with a key for their uniques
                const key = this.calculateClassKey(type);
                let entries = this.foundDeclarations.get(key);
                if (!entries) {
                    entries = [];
                    this.foundDeclarations.set(key, entries);
                }
                entries.push(languageNode);
            }
        }
        return [];
    }

    /**
     * Calculates a key for a class which encodes its unique properties, i.e. duplicate classes have the same key.
     * This key is used to identify duplicated classes.
     * Override this method to change the properties which make a class unique.
     * @param clas the current class type
     * @returns a string key
     */
    protected calculateClassKey(clas: ClassType): string {
        // usually duplicated classes are critical only for nominal typing, therefore the classname is used as default implementation here
        return `${clas.className}`;
    }

    afterValidation(_languageRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        const result: ValidationProblem[] = [];
        for (const [key, classes] of this.foundDeclarations.entries()) {
            if (classes.length >= 2) {
                for (const clas of classes) {
                    result.push({
                        $problem: ValidationProblem,
                        languageNode: clas,
                        severity: 'error',
                        message: `Declared classes need to be unique (${key}).`,
                    });
                }
            }
        }

        this.foundDeclarations.clear();
        return result;
    }

    isClassDuplicated(clas: ClassType): boolean {
        const key = this.calculateClassKey(clas);
        return this.foundDeclarations.has(key) && this.foundDeclarations.get(key)!.length >= 2;
    }
}

export interface UniqueMethodValidationEntry {
    languageNode: unknown;
    classType: ClassType;
}

/**
 * Predefined validation to produce errors, if inside a class the same method is declared more than once.
 */
export class UniqueMethodValidation<T> implements ValidationRuleWithBeforeAfter {
    protected readonly foundDeclarations: Map<string, UniqueMethodValidationEntry[]> = new Map();

    protected readonly services: TypirServices;
    /** Determines language nodes which represent declared methods, improves performance a lot. */
    protected readonly isMethodDeclaration: (languageNode: unknown) => languageNode is T;
    /** Determines the corresponding language node of the class declaration, so that Typir can infer its ClassType */
    protected readonly getClassOfMethod: (languageNode: T, methodType: FunctionType) => unknown;
    protected readonly uniqueClassValidator: UniqueClassValidation | undefined;

    constructor(services: TypirServices,
        isMethodDeclaration: (languageNode: unknown) => languageNode is T,
        getClassOfMethod: (languageNode: T, methodType: FunctionType) => unknown,
        uniqueClassValidator?: UniqueClassValidation,
    ) {
        this.services = services;
        this.isMethodDeclaration = isMethodDeclaration;
        this.getClassOfMethod = getClassOfMethod;
        this.uniqueClassValidator = uniqueClassValidator;
    }

    beforeValidation(_languageRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        this.foundDeclarations.clear();
        return [];
    }

    validation(languageNode: unknown, _typir: TypirServices): ValidationProblem[] {
        if (this.isMethodDeclaration(languageNode)) { // improves performance, since type inference need to be done only for relevant language nodes
            const methodType = this.services.Inference.inferType(languageNode);
            if (isFunctionType(methodType)) {
                const classDeclaration = this.getClassOfMethod(languageNode, methodType);
                const classType = this.services.Inference.inferType(classDeclaration);
                if (isClassType(classType)) {
                    const key = this.calculateMethodKey(classType, methodType);
                    let entries = this.foundDeclarations.get(key);
                    if (!entries) {
                        entries = [];
                        this.foundDeclarations.set(key, entries);
                    }
                    entries.push({
                        languageNode: languageNode,
                        classType,
                    });
                }
            }
        }
        return [];
    }

    /**
     * Calculates a key for a method which encodes its unique properties, i.e. duplicate methods have the same key.
     * Additionally, the class of the method needs to be represented in the key as well.
     * This key is used to identify duplicated methods.
     * Override this method to change the properties which make a method unique.
     * @param clas the current class type
     * @param func the current function type
     * @returns a string key
     */
    protected calculateMethodKey(clas: ClassType, func: FunctionType): string {
        return `${clas.getIdentifier()}.${func.functionName}(${func.getInputs().map(param => param.type.getIdentifier())})`;
    }

    afterValidation(_LanguageRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        const result: ValidationProblem[] = [];
        for (const [key, methods] of this.foundDeclarations.entries()) {
            if (methods.length >= 2) {
                for (const method of methods) {
                    if (this.uniqueClassValidator?.isClassDuplicated(method.classType)) {
                        // ignore duplicated methods inside duplicated classes
                    } else {
                        result.push({
                            $problem: ValidationProblem,
                            languageNode: method.languageNode,
                            severity: 'error',
                            message: `Declared methods need to be unique (${key}).`,
                        });
                    }
                }
            }
        }

        this.foundDeclarations.clear();
        return result;
    }
}


/**
 * Predefined validation to produce errors for all those class declarations, whose class type have cycles in their super-classes.
 * @param isRelevant helps to filter out declarations of classes in the user AST,
 * is parameter is the reasons, why this validation cannot be registered by default by Typir for classes, since this parameter is DSL-specific
 * @returns a validation rule which checks for any class declaration/type, whether they have no cycles in their sub-super-class-relationships
 */
export function createNoSuperClassCyclesValidation(isRelevant: (languageNode: unknown) => boolean): ValidationRule {
    return (languageNode: unknown, typir: TypirServices) => {
        const result: ValidationProblem[] = [];
        if (isRelevant(languageNode)) { // improves performance, since type inference need to be done only for relevant language nodes
            const classType = typir.Inference.inferType(languageNode);
            if (isClassType(classType) && classType.isInStateOrLater('Completed')) {
                // check for cycles in sub-type-relationships
                if (classType.hasSubSuperClassCycles()) {
                    result.push({
                        $problem: ValidationProblem,
                        languageNode: languageNode,
                        severity: 'error',
                        message: `Cycles in super-sub-class-relationships are not allowed: ${classType.getName()}`,
                    });
                }
            }
        }
        return result;
    };
}
