/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
export interface BinaryExpression {
    type: 'binary';
    left: Expression;
    right: Expression;
    op: '+'|'-'|'/'|'*'|'%';
}

export function isBinaryExpression(node: unknown): node is BinaryExpression {
    return isAstNode(node) && node.type === 'binary';
}

export interface UnaryExpression {
    type: 'unary';
    operand: Expression;
    op: '+'|'-';
}

export function isUnaryExpression(node: unknown): node is UnaryExpression {
    return isAstNode(node) && node.type === 'unary';
}

export interface VariableUsage {
    type: 'variable-usage';
    ref: VariableDeclaration;
}


export function isVariableUsage(node: unknown): node is VariableUsage {
    return isAstNode(node) && node.type === 'variable-usage';
}


export interface Numeric {
    type: 'numeric';
    value: number;
}

export function isNumeric(node: unknown): node is Numeric {
    return isAstNode(node) && node.type === 'numeric';
}

export interface CharString {
    type: 'string';
    value: string;
}

export function isCharString(node: unknown): node is CharString {
    return isAstNode(node) && node.type === 'string';
}

export type Expression = UnaryExpression | BinaryExpression | VariableUsage | Numeric | CharString;

export interface VariableDeclaration {
    type: 'variable-declaration';
    name: string;
    value: Expression;
}

export function isVariableDeclaration(node: unknown): node is VariableDeclaration {
    return isAstNode(node) && node.type === 'variable-declaration';
}


export interface Printout {
    type: 'printout';
    value: Expression;
}

export function isPrintout(node: unknown): node is Printout {
    return isAstNode(node) && node.type === 'printout';
}

export type Model = Array<VariableDeclaration | Printout>;

export type Node = Expression | Printout | VariableDeclaration;

export function isAstNode(node: unknown): node is Node {
    return Object.getOwnPropertyNames(node).includes('type') && ['variable-usage', 'unary', 'binary', 'numeric', 'string', 'printout', 'variable-declaration'].includes(node as Node['type']);
}

export namespace AST {
    export function variable(name: string, value: Expression): VariableDeclaration {
        return { type: 'variable-declaration', name, value };
    }
    export function printout(value: Expression): Printout {
        return { type: 'printout', value };
    }
    export function num(value: number): Numeric {
        return {
            type: 'numeric',
            value
        };
    }
    export function string(value: string): CharString {
        return {
            type: 'string',
            value
        };
    }
    export function binary(left: Expression, op: BinaryExpression['op'], right: Expression): BinaryExpression {
        return {
            type: 'binary',
            left,
            op,
            right
        };
    }
    export function unary(op: UnaryExpression['op'], operand: Expression): UnaryExpression {
        return {
            type: 'unary',
            op,
            operand
        };
    }
    export function useVariable(variable: VariableDeclaration): VariableUsage {
        return {
            ref: variable,
            type: 'variable-usage'
        };
    }
}
