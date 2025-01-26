import {
    apply,
    buildLexer,
    expectEOF,
    expectSingleResult,
    list_sc,
    str,
    tok,
    // Token,
    seq,
    alt
} from "typescript-parsec";

// Define token types
enum TokenKind {
    Macro,
    Variable,
    HookOpen,
    HookClose,
    Text,
    StringLiteral,
    Number,
    Boolean,
    Comma,
    Operator,
    PropertyAccess,
    Binding
}

// Define lexer (tokenizer)
const tokenizer = buildLexer([
    [true, /^\(\w+:[^)]+\)/g, TokenKind.Macro], // Macros like (set:), (if:)
    [true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable], // Variables like $var-type
    [true, /^\"[^\"]*\"/g, TokenKind.StringLiteral], // Strings like "Hello"
    [true, /^\d+(\.\d+)?/g, TokenKind.Number], // Numbers like 123 or 45.6
    [true, /^(true|false)/g, TokenKind.Boolean], // Boolean values
    [true, /^[\+\-\*\/=<>!]+/g, TokenKind.Operator], // Operators (+, -, *, <, >, etc.)
    [true, /^'s|its|of/g, TokenKind.PropertyAccess], // Property accessors ('s, its, of)
    [true, /^bind|2bind/g, TokenKind.Binding], // Bind and 2bind operators
    [true, /^\[/g, TokenKind.HookOpen], // Hook open `[`
    [true, /^\]/g, TokenKind.HookClose], // Hook close `]`
    [true, /^,/g, TokenKind.Comma], // Commas for lists/maps
    [true, /^[^\[\]\(\)$,]+/g, TokenKind.Text], // General text content
]);

// Parse different types of values
const stringParser = apply(tok(TokenKind.StringLiteral), (token) => ({
    type: "String",
    value: token.text.slice(1, -1) // Remove quotes
}));

const numberParser = apply(tok(TokenKind.Number), (token) => ({
    type: "Number",
    value: parseFloat(token.text)
}));

const booleanParser = apply(tok(TokenKind.Boolean), (token) => ({
    type: "Boolean",
    value: token.text === "true"
}));

const variableParser = apply(tok(TokenKind.Variable), (token) => ({
    type: "Variable",
    name: token.text.slice(1) // Remove `$`
}));

const textParser = apply(tok(TokenKind.Text), (token) => ({
    type: "Text",
    content: token.text.trim(),
}));

// Parse operators and bindings
const operatorParser = apply(tok(TokenKind.Operator), (token) => ({
    type: "Operator",
    symbol: token.text
}));

const bindingParser = apply(tok(TokenKind.Binding), (token) => ({
    type: "Binding",
    method: token.text
}));

const propertyAccessParser = apply(tok(TokenKind.PropertyAccess), (token) => ({
    type: "PropertyAccess",
    method: token.text
}));

// Parse macros
const macroParser = apply(tok(TokenKind.Macro), (token) => {
    const match = token.text.match(/^\((\w+):\s*(.*)\)$/);
    if (!match) return { type: "Macro", name: "Unknown", args: [] };

    const name = match[1];
    const argsString = match[2].trim();

    // Split arguments **without breaking quotes**
    const args = argsString.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

    return {
        type: "Macro",
        name,
        args: args.map(arg => {
            if (arg.startsWith('"') && arg.endsWith('"')) {
                return { type: "String", value: arg.slice(1, -1) };
            } else if (arg.startsWith('$')) {
                return { type: "Variable", name: arg.slice(1) };
            } else if (!isNaN(parseFloat(arg))) {
                return { type: "Number", value: parseFloat(arg) };
            }
            return { type: "Text", content: arg };
        })
    };
});

// Parse expressions (booleans, numbers, variables, strings)
const expressionParser = alt(
    booleanParser,
    numberParser,
    variableParser,
    stringParser
);

// Parse lists `(a: 1, 2, 3)`
const arrayParser = apply(
    seq(str("(a:"), list_sc(expressionParser, tok(TokenKind.Comma)), str(")")),
    ([_, elements]) => ({
        type: "Array",
        elements
    })
);

// Parse maps `(dm: "key", "value", "key2", "value2")`
const mapParser = apply(
    seq(str("(dm:"), list_sc(expressionParser, tok(TokenKind.Comma)), str(")")),
    ([_, elements]) => ({
        type: "Map",
        entries: elements.reduce<{ key: any; value: any }[]>((acc, curr, idx, arr) => {
            if (idx % 2 === 0 && idx + 1 < arr.length) {
                acc.push({ key: curr, value: arr[idx + 1] });
            }
            return acc;
        }, []) 
    })
);


// Parse hooks (recursive structure)
const hookParser = apply(
    seq(str("["), list_sc(alt(macroParser, variableParser, textParser), str("")), str("]")),
    ([_, content]) => ({
        type: "Hook",
        content
    })
);


// Parse entire Harlowe content
const harloweParser = list_sc(
    alt(
        macroParser, variableParser, textParser, hookParser,
        arrayParser, mapParser, operatorParser, bindingParser, propertyAccessParser
    ),
    str("")
);

// Function to parse Harlowe code
function parseHarlowe(input: string) {
    const tokens = tokenizer.parse(input);
    return expectSingleResult(expectEOF(harloweParser.parse(tokens)));
}

export default parseHarlowe
