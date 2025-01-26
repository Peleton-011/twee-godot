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
	Binding,
	LParen,
	RParen,
	Whitespace,
	MacroName,
	MacroArgument,
	Newline,
	EOF,
}

const tokenizer = buildLexer([
	[true, /^\(\w+:/g, TokenKind.MacroName], // Captures (set:, (if:, (print:
	[true, /^[^\)\(]+/g, TokenKind.MacroArgument], // Captures everything inside macros
	[true, /^\)/g, TokenKind.RParen], // Captures macro closing `)`
	[true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable], // Variables like $var
	[true, /^\"[^\"]*\"/g, TokenKind.StringLiteral], // Strings "Hello"
	[true, /^\d+(\.\d+)?/g, TokenKind.Number], // Numbers
	[true, /^(true|false)/g, TokenKind.Boolean], // Booleans
	[true, /^[\+\-\*\/=<>!]+/g, TokenKind.Operator], // Operators
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

// Basic Value Parsers
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
		apply(tok(TokenKind.Text), (t) => ({
			type: "Text",
			content: t.text.trim(),
		}))
	)
);

// Macro Parser: (set: $var to "value")
MACRO.setPattern(
	apply(
		seq(
			tok(TokenKind.MacroName),
			tok(TokenKind.MacroArgument),
			tok(TokenKind.RParen)
		),
		([macroName, macroArgs]) => {
			return {
				type: "Macro",
				name: macroName.text.slice(1, -1), // Extract name (remove `(` and `:`)
				args: macroArgs.text
					.trim()
					.split(/\s+/)
					.map((arg) => {
						if (arg.startsWith('"') && arg.endsWith('"')) {
							return { type: "String", value: arg.slice(1, -1) };
						} else if (arg.startsWith("$")) {
							return { type: "Variable", name: arg.slice(1) };
						} else if (!isNaN(parseFloat(arg))) {
							return { type: "Number", value: parseFloat(arg) };
						}
						return { type: "Text", content: arg };
					}),
			};
		}
	)
);

// List Parsing: Handles Macros, Values, and Expressions
LIST.setPattern(
	list_sc(
		alt(
			MACRO,
			VALUE,
			apply(tok(TokenKind.Text), (t) => ({
				type: "Text",
				content: t.text.trim(),
			}))
		),
		tok(TokenKind.Comma)
	)
);

// Expression Parsing (Handles Hooks, Expressions, and Nested Structures)
EXP.setPattern(
	list_sc(
		// Fix: Use `list_sc()` to handle multiple lines
		alt(
			MACRO,
			VALUE,
			kmid(str("["), LIST, str("]")) // Hooks like [some content]
		),
		str("") // Ensures continuation across newlines
	)
);

// Final Parse Function
function parseHarlowe(input: string) {
	const tokens = tokenizer.parse(input);

	// Check if Tokens Are Generated Correctly
	if (!tokens) {
		throw new Error("No valid tokens found. Check input format.");
	}

	return expectSingleResult(expectEOF(EXP.parse(tokens)));
}

// 🧪 Test Cases
const harloweCode = `(set: $name to "John")
(if: $score > 10)[You win!]
(link: "Next" -> "NextPassage")
(a: 1, 2, 3)
(dm: "name", "John", "score", 10)
(live: 2s)[Time is running!]
(print: "Your score is " + $score)
`;

const parsedJSON = parseHarlowe(harloweCode);
console.log(JSON.stringify(parsedJSON, null, 2));

export default parseHarlowe;
