/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { createTypirServices, InferenceRuleNotApplicable, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, isAssignabilityProblem, isInferenceProblem, NO_PARAMETER_NAME, TypirServices, ValidationMessageDetails } from 'typir';
import { BinaryExpression, isAstNode, isBinaryExpression, isNumeric, isPrintout, isUnaryExpression, isVariableDeclaration, isVariableUsage, UnaryExpression } from './ast.js';

export function initializeTypir() {
    const typir = createTypirServices();
    const typeNumber = typir.factory.Primitives.create({
        primitiveName: 'number', inferenceRules: [
            isNumeric,
            (node: unknown) => isAstNode(node) && node.type === 'numeric'
        ]
    });
    const typeString = typir.factory.Primitives.create({
        primitiveName: 'string', inferenceRules:
            (node: unknown) => isAstNode(node) && node.type === 'string'
    });
    const typeVoid = typir.factory.Primitives.create({ primitiveName: 'void' });

    const binaryInferenceRule: InferOperatorWithMultipleOperands<BinaryExpression> = {
        filter: isBinaryExpression,
        matching: (node: BinaryExpression, name: string) => node.op === name,
        operands: (node: BinaryExpression) => [node.left, node.right],
    };
    typir.factory.Operators.createBinary({ name: '+', signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
    typir.factory.Operators.createBinary({ name: '-', signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
    typir.factory.Operators.createBinary({ name: '/', signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
    typir.factory.Operators.createBinary({ name: '*', signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
    typir.factory.Operators.createBinary({ name: '%', signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
    typir.factory.Operators.createBinary({ name: '+', signature: { left: typeString, right: typeString, return: typeString }, inferenceRule: binaryInferenceRule });

    const unaryInferenceRule: InferOperatorWithSingleOperand<UnaryExpression> = {
        filter: isUnaryExpression,
        matching: (node: UnaryExpression, name: string) => node.op === name,
        operand: (node: UnaryExpression, _name: string) => node.operand,
    };
    typir.factory.Operators.createUnary({ name: '+', signature: { operand: typeNumber, return: typeNumber }, inferenceRule: unaryInferenceRule });
    typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber }, inferenceRule: unaryInferenceRule });

    typir.factory.Functions.create({
        functionName: 'print',
        inputParameters: [{
            name: 'input',
            type: typeString,
        }],
        outputParameter: { name: NO_PARAMETER_NAME, type: typeVoid },
        inferenceRuleForCalls: {
            filter: isPrintout,
            matching: () => true,
            inputArguments: (node) => [node.value],
        }
    });

    typir.Conversion.markAsConvertible(typeNumber, typeString, 'IMPLICIT_EXPLICIT');

    typir.Inference.addInferenceRule((languageNode) => {
        if (isVariableDeclaration(languageNode)) {
            return languageNode.value;
        } else if (isVariableUsage(languageNode)) {
            return languageNode.ref;
        }
        return InferenceRuleNotApplicable;
    });

    typir.validation.Collector.addValidationRule(
        (node: unknown) => {
            if (isPrintout(node)) {
                const actual = typir.Inference.inferType(node.value)!;
                if(!Array.isArray(actual)) {
                    const expected = typeString;
                    const result = typir.Assignability.getAssignabilityResult(actual, expected);
                    if(isAssignabilityProblem(result)) {
                        return [{
                            $problem: 'ValidationProblem',
                            languageNode: node,
                            message: 'Not assignable!',
                            severity: 'error'
                        }];
                    }
                }
            }
            return [];
        }
    );

    return typir;
}
