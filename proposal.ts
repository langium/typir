/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable header/header */
/**
 * High level typir spec
 */

type TypirOptions = {
    enableTypeInference?: boolean;
    enableTypeChecking?: boolean;
    enableTypeRelationships?: boolean;
    enableRuleJudgments?: boolean;
};

// Define the base visitor interface
interface TypirVisitor {
    visit(obj: any): void;
}

class Typir {
    private name: string;
    private options: TypirOptions;

    public typeGraph: Map<any, Set<any>>;

    constructor(name: string, options: TypirOptions = {}) {
        this.name = name;
        this.options = {
            enableTypeInference: true,
            enableTypeChecking: true,
            enableTypeRelationships: true,
            enableRuleJudgments: true,
            ...options,
        };

        this.typeGraph = new Map();
    }

    // Other methods and functionalities can be added here
    // Method to load a type into the environment
    loadType(typeName: string): any {
        // Logic to load type based on options
        console.log(`Loading type '${typeName}' into environment of ${this.name}`);
        return { typeName }; // Placeholder for the actual type
    }

    // Method to load a symbol with type binding into the environment
    loadSymbol(symbolName: string, type: any): any {
        // Logic to load symbol with type binding based on options
        console.log(`Loading symbol '${symbolName}' with type binding into environment of ${this.name}`);
        return { symbolName, type }; // Placeholder for the actual symbol
    }

    // helpers.....

    // Method to define a type relationship
    defineTypeRelationship(type: any, relationship: string): void {
        // Logic to define type relationship based on options
        console.log(`Defining relationship '${relationship}' for type '${type.typeName}' in environment of ${this.name}`);
    }

    // Method to define a rule judgment for type inference
    defineRuleJudgment(relationship: string, rule: (e1: any, e2: any) => any): void {
        // Logic to define rule judgment based on options
        console.log(`Defining rule judgment '${relationship}' in environment of ${this.name}`);
    }

    // Method to add subtyping relationship between two types
    addSubType(parentType: any, childType: any): void {
        if (!this.typeGraph.has(parentType)) {
            this.typeGraph.set(parentType, new Set());
        }

        this.typeGraph.get(parentType)!.add(childType);
        console.log(`Added subtyping relationship: ${parentType.typeName} is assignable to ${childType.typeName}`);
    }

    // Method to check if a type is assignable to another type
    isAssignable(fromType: any, toType: any): boolean {
        if (!this.typeGraph.has(toType)) {
            return false;
        }

        const reachableTypes = this.typeGraph.get(toType)!;
        return reachableTypes.has(fromType);
    }

    inferType(expression: any): any {
        // Logic to infer type based on options
        console.log(`Inferring type for expression in environment of ${this.name}`);
        return { typeName: 'InferredType' }; // Placeholder for the inferred type
    }






    // Accept a visitor and apply it to the given object
    // performs typechecking, type inference, etc.
    typeCheck(visitor: TypirVisitor, obj: any): void {
        visitor.visit(obj);
    }

    // Get the constructed type graph
    getTypeGraph(): Map<any, Set<any>> {
        return this.typeGraph;
    }
}

// Say we have some AST type, could be Langium or another...
type AstType = {
    $type: 'model';
    left: AstType | number;
    op: string;
    right: AstType | number;
} | {
    $type: 'lit';
    value: number;
};

// Example concrete visitor implementing TypirVisitor
// Which accepts an AST object and updates the typir instance w/ types, relationships, etc.
class ExampleASTVisitor implements TypirVisitor {

    private typirInstance: Typir;

    constructor(typirInstance: Typir) {
        this.typirInstance = typirInstance;
    }

    visit(obj: AstType): void {
        switch (obj.$type) {
            case 'model':
                this.visitModel(obj);
                break;
            case 'lit':
                this.visitLit(obj);
                break;
        }
        // traverse this aST object, and do something with it
        // leads to side-effects in the typir instance
        // such as populating the graph, defining relationships, etc.
        // allows defining types that correspond to the AST node types, whatever they may be
    }

    visitModel(obj: AstType & { $type: 'model' }): void {
        // do something with the model node
        // & update the typir instance
    }

    visitLit(obj: AstType & { $type: 'lit' }): void {
        // do something with the lit node
        // & update the typir instance
    }

    visitBinaryExpr(e1, op, e2) {
        // e1 -> T1
        // e2 -> T2
        //
        //
        //       e = e1 op e2   e1 : T1, e2 : T2
        //    ------------------------------------  T1 = T2
        //              e : T1
        //
        // T1 = T2
    }
}

///////// Example Usage

const typirInstance = new Typir('TypeFox-1', {
    // ... various config options
    enableTypeRelationships: true,
    enableRuleJudgments: true,
});

//
// injecting types into the environment
//
const intType = typirInstance.loadType('Int');
const boolType = typirInstance.loadType('Bool');

const animalType = typirInstance.loadType('Animal');
const dogType = typirInstance.loadType('Dog');
const catType = typirInstance.loadType('Cat');

//
// binding symbols with types in the environment
//
const xSymbol = typirInstance.loadSymbol('x', intType);
const ySymbol = typirInstance.loadSymbol('y', boolType);

//
// setting relationships between types
// this actions should update the type graph, or any other internal representation of the environment
//
typirInstance.addSubType(animalType, dogType);
typirInstance.addSubType(animalType, catType);

// assignability checks after the sub-type relationship above
const isAssignable1 = typirInstance.isAssignable(dogType, animalType);
console.log(`Is Dog assignable to Animal? ${isAssignable1}`); // true

const isAssignable2 = typirInstance.isAssignable(catType, dogType);
console.log(`Is Cat assignable to Dog? ${isAssignable2}`); // false

// some ast
const myAst: AstType = {
    $type: 'model',
    left: {
        $type: 'lit',
        value: 5
    },
    op: '+',
    right: {
        $type: 'lit',
        value: 10
    }
};

// inject the visitor into the typir instance, and get the visitor to traverse the AST
// result is that the typir instance is updated with the relationships and types defined in the visitor
// and then we can use the typir instance to do type inference, type checking, etc.
const visitor = new ExampleASTVisitor(typirInstance);

// check if the myAst is correct
typirInstance.typeCheck(visitor, myAst);
