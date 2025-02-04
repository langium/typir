/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { describe, expect, test } from 'vitest';
import { tokenize, TokenType } from '../src/lexer.js';

function expectTokenTypes(text: string, ...expecteds: TokenType[]) {
    const actuals = [...tokenize(text)].map(t => t.type);
    expect(actuals).toEqual(expecteds);
}

describe('Tokenizer', () => {
    test('tokenize', () => {
        expectTokenTypes('VAR A = 1;', 'VAR', 'WS', 'ID', 'WS', 'ASSIGN', 'WS', 'NUM', 'SEMICOLON');
        expectTokenTypes('PRINT 1;', 'PRINT', 'WS', 'NUM', 'SEMICOLON');
        expectTokenTypes('PRINT(A);', 'PRINT', 'LPAREN', 'ID', 'RPAREN', 'SEMICOLON');
        expectTokenTypes('PRINT 1+2*3;', 'PRINT', 'WS', 'NUM', 'ADD_OP', 'NUM', 'MUL_OP', 'NUM', 'SEMICOLON');
        expectTokenTypes('PRINT --1;', 'PRINT', 'WS', 'ADD_OP', 'ADD_OP', 'NUM', 'SEMICOLON');
        expectTokenTypes('PRINT "Hello, \\"User\\"!";', 'PRINT', 'WS', 'STRING', 'SEMICOLON');
    });
});
