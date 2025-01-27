import {
	apply,
	buildLexer,
	expectEOF,
	expectSingleResult,
	rule,
	alt,
	seq,
	kmid,
	tok,
	str,
	list_sc,
} from "typescript-parsec";

// Define token types
enum TokenKind {
	MacroName,
	Variable,
	HookOpen,
	HookClose,
	StringLiteral,
	Number,
	Boolean,
	Comma,
	Operator,
	PropertyAccess,
	Binding,
	LParen,
	RParen,
	Whitespace,
	Text,
	Newline,
	EOF,
	Keyword,
}

const tokenizer = buildLexer([
	[true, /^\(\w+:/g, TokenKind.MacroName], // Macros like (set:, (if:, (print:
	[true, /^\)/g, TokenKind.RParen], // Macro closing `)`
	[true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable], // Variables like $var
	[true, /^\"[^\"]*\"/g, TokenKind.StringLiteral], // Strings "Hello"
	[true, /^\d+(\.\d+)?/g, TokenKind.Number], // Numbers
	[true, /^(true|false)/g, TokenKind.Boolean], // Booleans
	[true, /^[\+\-\*\/=<>!]+/g, TokenKind.Operator], // Operators
	[true, /^to|into|->/g, TokenKind.Keyword], // Keywords inside macros
	[true, /^'s|its|of/g, TokenKind.PropertyAccess], // Property accessors
	[true, /^bind|2bind/g, TokenKind.Binding], // Bind operators
	[true, /^\[/g, TokenKind.HookOpen], // Hook open `[`
	[true, /^\]/g, TokenKind.HookClose], // Hook close `]`
	[true, /^,/g, TokenKind.Comma], // Comma for lists
	[false, /^\s+/g, TokenKind.Whitespace], // Ignores spaces
	[true, /^[^\[\]\(\)$,]+/g, TokenKind.Text], // General text
	[false, /^\n+/g, TokenKind.Newline], // Ignores newlines
	[false, /^$/g, TokenKind.EOF], // Ignores EOF
]);

// Define Rules for Recursive Parsing
const EXP = rule<TokenKind, any>(); // Main Expression Rule
const MACRO = rule<TokenKind, any>(); // Macro Parsing Rule
const VALUE = rule<TokenKind, any>(); // Value Parsing Rule
const LIST = rule<TokenKind, any>(); // List Parsing Rule

// **Basic Value Parsers**
VALUE.setPattern(
	alt(
		apply(tok(TokenKind.StringLiteral), (t) => ({
			type: "String",
			value: t.text.slice(1, -1),
		})),
		apply(tok(TokenKind.Number), (t) => ({
			type: "Number",
			value: parseFloat(t.text),
		})),
		apply(tok(TokenKind.Boolean), (t) => ({
			type: "Boolean",
			value: t.text === "true",
		})),
		apply(tok(TokenKind.Variable), (t) => ({
			type: "Variable",
			name: t.text.slice(1),
		})),
		apply(tok(TokenKind.Keyword), (t) => ({
			type: "Keyword",
			value: t.text,
		})),
		apply(tok(TokenKind.Text), (t) => ({
			type: "Text",
			content: t.text.trim(),
		}))
	)
);

// **List Parsing: Handles Macros, Values, and Expressions**
LIST.setPattern(list_sc(alt(MACRO, VALUE), tok(TokenKind.Comma)));

// **Macro Parser: (set: $var to "value")**
MACRO.setPattern(
	apply(
		seq(
			tok(TokenKind.MacroName),
			LIST, // Recursively parse macro arguments
			tok(TokenKind.RParen)
		),
		([macroName, args]) => {
			const macroNames = macroName.text.match(/\((\w+):/) || [null];
			return {
				type: "Macro",
				name: macroNames[1], // Extract macro name
				args,
			};
		}
	)
);

// **Expression Parsing (Handles Hooks, Expressions, and Nested Structures)**
EXP.setPattern(
	alt(
		MACRO,
		VALUE,
		kmid(str("["), LIST, str("]")) // Hooks like [some content]
	)
);

// **Final Parse Function**
function parseHarlowe(input: string) {
	const tokens = tokenizer.parse(input);

	// Check if Tokens Are Generated Correctly
	if (!tokens) {
		throw new Error("No valid tokens found. Check input format.");
	}

	return expectSingleResult(expectEOF(EXP.parse(tokens)));
}

// **🧪 Test Cases**
const harloweCode = `
(set: $name to "John Doe")
`;

const parsedJSON = parseHarlowe(harloweCode);
console.log(JSON.stringify(parsedJSON, null, 2));

export default parseHarlowe;
