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
	Arrow,
	To,
	Whitespace,
	Text,
}

// Split keywords into separate tokens
const tokenizer = buildLexer([
	[true, /^\(\w+:/g, TokenKind.MacroName],
	[true, /^\)/g, TokenKind.RParen],
	[true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable],
	[true, /^\"[^\"]*\"/g, TokenKind.StringLiteral],
	[true, /^\d+(\.\d+)?/g, TokenKind.Number],
	[true, /^(true|false)/g, TokenKind.Boolean],
	[true, /^->/g, TokenKind.Arrow], // Separate token for ->
	[true, /^to\b/g, TokenKind.To], // Separate token for 'to'
	[true, /^[\+\-\*\/=<>!]+/g, TokenKind.Operator],
	[true, /^'s|its|of/g, TokenKind.PropertyAccess],
	[true, /^bind|2bind/g, TokenKind.Binding],
	[true, /^\[/g, TokenKind.HookOpen],
	[true, /^\]/g, TokenKind.HookClose],
	[true, /^,/g, TokenKind.Comma],
	[false, /^\s+/g, TokenKind.Whitespace],
	[true, /^[^\[\]\(\)$,\s]+/g, TokenKind.Text],
]);

const MACRO_ARG_PATTERNS = {
	set: {
		pattern: ["Variable", "Keyword", "Value"],
		keyword: TokenKind.To,
	},
	link: {
		pattern: ["StringLiteral", "Keyword", "StringLiteral"],
		keyword: TokenKind.Arrow,
	},
	if: {
		pattern: ["Value"],
		keyword: null,
	},
	print: {
		pattern: ["Value"],
		keyword: null,
	},
} as const;

type MacroType = keyof typeof MACRO_ARG_PATTERNS;

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
		}))
	)
);

// Modified to handle both 'to' and '->' keywords
const KEYWORD = rule<TokenKind, TokenKind>();
KEYWORD.setPattern(
	alt(
		apply(tok(TokenKind.Arrow), () => TokenKind.Arrow),
		apply(tok(TokenKind.To), () => TokenKind.To)
	)
);

const STRUCTURED_ARG = rule<TokenKind, any>();
STRUCTURED_ARG.setPattern(
	apply(seq(VALUE, KEYWORD, VALUE), ([firstValue, keyword, secondValue]) => ({
		type: "StructuredArg",
		firstPart: firstValue,
		keyword: keyword === TokenKind.Arrow ? "->" : "to",
		secondPart: secondValue,
	}))
);

const SIMPLE_ARG = rule<TokenKind, any>();
SIMPLE_ARG.setPattern(VALUE);

const MACRO = rule<TokenKind, any>();
MACRO.setPattern(
	apply(
		seq(
			tok(TokenKind.MacroName),
			alt(
				apply(STRUCTURED_ARG, (arg) => [arg]),
				list_sc(SIMPLE_ARG, tok(TokenKind.Comma))
			),
			tok(TokenKind.RParen)
		),
		([macroName, args]) => {
			const macroNames = macroName.text.match(/\((\w+):/) || [null];
			const name = macroNames[1] as MacroType;
			const macroPattern = MACRO_ARG_PATTERNS[name];

			if (!macroPattern) {
				throw new Error(`Unknown macro type: ${name}`);
			}

			if (args[0]?.type === "StructuredArg") {
				const structuredArg = args[0];
				const keywordType =
					structuredArg.keyword === "->"
						? TokenKind.Arrow
						: TokenKind.To;

				if (keywordType !== macroPattern.keyword) {
					throw new Error(
						`Expected keyword '${macroPattern.keyword}' but got '${structuredArg.keyword}'`
					);
				}

				return {
					type: "Macro",
					name,
					args: [structuredArg.firstPart, structuredArg.secondPart],
					pattern: macroPattern.pattern,
				};
			}

			return {
				type: "Macro",
				name,
				args,
				pattern: macroPattern.pattern,
			};
		}
	)
);

const EXP = rule<TokenKind, any>();
EXP.setPattern(MACRO);

function parseHarlowe(input: string) {
	try {
		const tokens = tokenizer.parse(input);
		if (!tokens) {
			throw new Error("Tokenization failed");
		}
		return expectSingleResult(expectEOF(EXP.parse(tokens)));
	} catch (error: unknown) {
		if (error instanceof Error) {
			throw new Error(`Error parsing: ${input}, error: ${error.message}`);
		} else {
			throw new Error(`Error parsing: ${input}, error: ${String(error)}`);
		}
	}
}

// Test cases
function runTests() {
	const tests = [
		'(set: $companion to "Gallifrey")',
		'(link: "Next" -> "NextPassage")',
		"(if: $condition)",
		'(print: "Hello")',
	];

	tests.forEach((test) => {
		try {
			console.log("\nTesting:", test);
			const result = parseHarlowe(test);
			console.log("Result:", JSON.stringify(result, null, 2));
		} catch (error) {
			console.error(error);
		}
	});
}

export { parseHarlowe, runTests };
