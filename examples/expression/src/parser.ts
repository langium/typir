/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Expression, BinaryExpression, UnaryExpression, VariableUsage, Numeric, CharString, VariableDeclaration, Printout, Model as AST } from './ast.js';
import { Token, tokenize, TokenType } from './lexer.js';

export class Parser {
    private tokens: Token[];
    private tokenIndex: number;
    private symbols: Record<string, VariableDeclaration>;
    private skip(...tokenTypes: TokenType[]) {
        while(this.tokenIndex < this.tokens.length && tokenTypes.includes(this.tokens[this.tokenIndex].type)) {
            this.tokenIndex++;
        }
    }
    private canConsume(tokenType: TokenType): boolean {
        this.skip('WS');
        return this.tokens[this.tokenIndex].type === tokenType;
    }
    private consume(tokenType: TokenType): Token {
        this.skip('WS');
        const lookahead = this.tokens[this.tokenIndex];
        if(lookahead.type !== tokenType) {
            throw new Error(`Expected ${tokenType} but got ${lookahead.type}!`);
        }
        this.tokenIndex++;
        return lookahead;
    }
    private expression(): Expression {
        return this.additive();
    }
    private additive(): Expression {
        let left = this.multiplicative();
        while(this.canConsume('ADD_OP')) {
            const op = this.consume('ADD_OP').content as '+'|'-';
            const right = this.multiplicative();
            left = {
                type: 'binary',
                left,
                right,
                op
            } as BinaryExpression;
        }
        return left;
    }
    private multiplicative(): Expression {
        let left = this.unary();
        while(this.canConsume('MUL_OP')) {
            const op = this.consume('MUL_OP').content as '/'|'*'|'%';
            const right = this.unary();
            left = {
                type: 'binary',
                left,
                right,
                op
            } as BinaryExpression;
        }
        return left;
    }
    private unary(): Expression {
        if(this.canConsume('ADD_OP')) {
            const op = this.consume('ADD_OP').content as '+'|'-';
            const operand = this.unary();
            return {
                type: 'unary',
                operand,
                op
            } as UnaryExpression;
        } else {
            return this.primary();
        }
    }
    private primary(): Expression {
        if(this.canConsume('LPAREN')) {
            this.consume('LPAREN');
            const result = this.expression();
            this.consume('RPAREN');
            return result;
        } else if(this.canConsume('ID')) {
            const token = this.consume('ID');
            const symbol = this.symbols[token.content];
            if(!symbol) {
                throw new Error(`Unknown symbol '${token.content}'!`);
            }
            return {
                type: 'variable-usage',
                ref: symbol
            } as VariableUsage;
        } else if(this.canConsume('NUM')) {
            return {
                type: 'numeric',
                value: parseInt(this.consume('NUM').content, 10)
            } as Numeric;
        } else if(this.canConsume('STRING')) {
            const literal = this.consume('STRING').content;
            return {
                type: 'string',
                value: literal.substring(1, literal.length-1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
            } as CharString;
        } else {
            throw new Error("Don't know how to continue...");
        }
    }
    private variableDeclaration(): VariableDeclaration {
        this.consume('VAR');
        const name = this.consume('ID').content;
        this.consume('ASSIGN');
        const value = this.expression();
        this.consume('SEMICOLON');
        return {
            type: 'variable-declaration',
            name,
            value
        };
    }
    private printout(): Printout {
        this.consume('PRINT');
        const value = this.expression();
        this.consume('SEMICOLON');
        return {
            type: 'printout',
            value
        };
    }

    parse(text: string): AST {
        this.tokens = [...tokenize(text)];
        this.tokenIndex = 0;
        this.symbols = {};
        const result: AST = [];
        while(this.tokenIndex < this.tokens.length) {
            if(this.canConsume('VAR')) {
                const variable = this.variableDeclaration();
                this.symbols[variable.name] = variable;
                result.push(variable);
            } else if(this.canConsume('PRINT')) {
                result.push(this.printout());
            }
        }
        return result;
    }
}
