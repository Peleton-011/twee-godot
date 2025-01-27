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
	opt,
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
	Keyword,
	Whitespace,
	Text,
	Newline,
	EOF,
}

const tokenizer = buildLexer([
	[true, /^\(\w+:/g, TokenKind.MacroName],
	[true, /^\)/g, TokenKind.RParen],
	[true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable],
	[true, /^\"[^\"]*\"/g, TokenKind.StringLiteral],
	[true, /^\d+(\.\d+)?/g, TokenKind.Number],
	[true, /^(true|false)/g, TokenKind.Boolean],
	[true, /^[\+\-\*\/=<>!]+/g, TokenKind.Operator],
	[true, /^(to|->)(?=\s)/g, TokenKind.Keyword],
	[true, /^'s|its|of/g, TokenKind.PropertyAccess],
	[true, /^bind|2bind/g, TokenKind.Binding],
	[true, /^\[/g, TokenKind.HookOpen],
	[true, /^\]/g, TokenKind.HookClose],
	[true, /^,/g, TokenKind.Comma],
	[false, /^\s+/g, TokenKind.Whitespace],
	[true, /^[^\[\]\(\)$,\s]+/g, TokenKind.Text],
	[false, /^\n+/g, TokenKind.Newline],
	[false, /^$/g, TokenKind.EOF],
]);

// Define argument patterns for different macro types
const MACRO_ARG_PATTERNS = {
	set: {
		pattern: ["Variable", "Keyword", "Value"],
		keyword: "to",
	},
	link: {
		pattern: ["StringLiteral", "Keyword", "StringLiteral"],
		keyword: "->",
	},
	if: {
		pattern: ["Value"],
		keyword: null,
	},
	print: {
		pattern: ["Value"],
		keyword: null,
	},
	// Add more macro patterns as needed
} as const;

type MacroType = keyof typeof MACRO_ARG_PATTERNS;

// Validate argument against expected type
function validateArgType(arg: any, expectedType: string): boolean {
	switch (expectedType) {
		case "Variable":
			return arg.type === "Variable";
		case "StringLiteral":
			return arg.type === "String";
		case "Value":
			return ["String", "Number", "Boolean", "Variable"].includes(
				arg.type
			);
		default:
			return true;
	}
}

// Value parser
const VALUE = rule<TokenKind, any>();
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

// Create a parser for structured macro arguments
const STRUCTURED_ARG = rule<TokenKind, any>();
STRUCTURED_ARG.setPattern(
	apply(
		seq(VALUE, opt(seq(tok(TokenKind.Keyword), VALUE))),
		([firstValue, keywordAndValue]) => {
			if (keywordAndValue) {
				const [keyword, secondValue] = keywordAndValue;
				return {
					type: "StructuredArg",
					firstPart: firstValue,
					keyword: keyword.text,
					secondPart: secondValue,
				};
			}
			return firstValue;
		}
	)
);

// Modified macro parser with pattern validation
const MACRO = rule<TokenKind, any>();
MACRO.setPattern(
	apply(
		seq(
			tok(TokenKind.MacroName),
			alt(
				list_sc(STRUCTURED_ARG, tok(TokenKind.Comma)),
				list_sc(VALUE, tok(TokenKind.Comma))
			),
			tok(TokenKind.RParen)
		),
		([macroName, args]) => {
			const macroNames = macroName.text.match(/\((\w+):/) || [null];
			const name = macroNames[1] as MacroType;

			// Get the expected pattern for this macro
			const macroPattern = MACRO_ARG_PATTERNS[name];

			if (!macroPattern) {
				throw new Error(`Unknown macro type: ${name}`);
			}

			// Process and validate arguments
			let processedArgs: any[] = [];
			let isValid = true;
			let errorMessage = "";

			if (args[0]?.type === "StructuredArg") {
				// Handle structured arguments
				const structuredArg = args[0];
				const expectedKeyword = macroPattern.keyword;

				if (structuredArg.keyword !== expectedKeyword) {
					isValid = false;
					errorMessage = `Expected keyword '${expectedKeyword}' but got '${structuredArg.keyword}'`;
				}

				// Validate argument types
				if (
					!validateArgType(
						structuredArg.firstPart,
						macroPattern.pattern[0]
					)
				) {
					isValid = false;
					errorMessage = `Invalid type for first argument in ${name} macro`;
				}
				if (
					macroPattern.pattern.length >= 3 &&
					!validateArgType(
						structuredArg.secondPart,
						macroPattern.pattern[2] as string
					)
				) {
					isValid = false;
					errorMessage = `Invalid type for second argument in ${name} macro`;
				}

				processedArgs = [
					structuredArg.firstPart,
					structuredArg.secondPart,
				];
			} else {
				// Handle simple arguments
				if (args.length !== macroPattern.pattern.length) {
					isValid = false;
					errorMessage = `Expected ${macroPattern.pattern.length} arguments for ${name} macro, got ${args.length}`;
				}

				// Validate each argument
				args.forEach((arg, index) => {
					if (!validateArgType(arg, macroPattern.pattern[index])) {
						isValid = false;
						errorMessage = `Invalid type for argument ${
							index + 1
						} in ${name} macro`;
					}
				});

				processedArgs = args;
			}

			if (!isValid) {
				throw new Error(errorMessage);
			}

			return {
				type: "Macro",
				name,
				args: processedArgs,
				pattern: macroPattern.pattern,
			};
		}
	)
);

// Main expression parser
const EXP = rule<TokenKind, any>();
EXP.setPattern(alt(MACRO, VALUE));

// Parse function with error handling
function parseHarlowe(input: string) {
	try {
		const tokens = tokenizer.parse(input);
		if (!tokens) {
			throw new Error("Tokenization failed");
		}
		return expectSingleResult(expectEOF(EXP.parse(tokens)));
	} catch (error: unknown) {
		if (error instanceof Error) {
			throw new Error(`Parse error: ${error.message}`);
		} else {
			throw new Error(`Parse error: ${String(error)}`);
		}
	}
}

// Test cases
const tests = [
	'(set: $companion to "Gallifrey")', // Valid
	'(link: "Next" -> "NextPassage")', // Valid
	'(set: "invalid" to $wrong)', // Invalid - wrong argument types
	'(link: "Next" to "Wrong")', // Invalid - wrong keyword
	"(if: $condition)", // Valid
	'(print: "Hello")', // Valid
];

tests.forEach((test) => {
	try {
		console.log("\nTesting:", test);
		console.log(JSON.stringify(parseHarlowe(test), null, 2));
	} catch (error: unknown) {
		if (error instanceof Error) {
			throw new Error(`Error parsing: ${test}, error: ${error.message}`);
		} else {
			throw new Error(`Error parsing: ${test}, error: ${String(error)}`);
		}
	}
});

export default parseHarlowe;
