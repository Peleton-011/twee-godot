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
	rep,
} from "typescript-parsec";

enum TokenKind {
	MacroName,
	Variable,
	HookOpen,
	HookClose,
	StringLiteral,
	Time,
	Number,
	Boolean,
	Comma,
	ComparisonOp,
	ArithmeticOp,
	LogicalOp,
	PropertyAccess,
	Binding,
	LParen,
	RParen,
	Arrow,
	To,
	Whitespace,
	Text,
	HookContent, // New token type for hook content
}

const tokenizer = buildLexer([
	[true, /^\(\w+:/g, TokenKind.MacroName],
	[true, /^\)/g, TokenKind.RParen],
	[true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable],
	[true, /^\"[^\"]*\"/g, TokenKind.StringLiteral],
	[true, /^\d+(\.\d+)?s\b/g, TokenKind.Time], // Add time unit pattern before number
	[true, /^\d+(\.\d+)?/g, TokenKind.Number],
	[true, /^(true|false)/g, TokenKind.Boolean],
	[true, /^->/g, TokenKind.Arrow],
	[true, /^to\b/g, TokenKind.To],
	[true, /^(>=|<=|>|<)/g, TokenKind.ComparisonOp],
	[true, /^(is not|is|contains|does not contain)\b/g, TokenKind.ComparisonOp],
	[true, /^(\+|\-|\*|\/)/g, TokenKind.ArithmeticOp],
	[true, /^(and|or)\b/g, TokenKind.LogicalOp],
	[true, /^'s|its|of/g, TokenKind.PropertyAccess],
	[true, /^bind|2bind/g, TokenKind.Binding],
	[true, /^\[/g, TokenKind.HookOpen],
	[true, /^\]/g, TokenKind.HookClose],
	[true, /^,/g, TokenKind.Comma],
	[false, /^\s+/g, TokenKind.Whitespace],
	// Special handling for hook content - capture everything between [ and ]
	[true, /^\[[^\]]*\]/g, TokenKind.HookContent],
	[true, /^[^\[\]\(\)$,\s><="']+/g, TokenKind.Text],
]);

// Basic value types
const LITERAL = rule<TokenKind, any>();
LITERAL.setPattern(
	alt(
		apply(tok(TokenKind.StringLiteral), (t) => ({
			type: "String",
			value: t.text.slice(1, -1),
		})),
		apply(tok(TokenKind.Time), (t) => ({
			type: "Time",
			value: t.text,
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

// Hook content now captures everything between brackets
const HOOK_CONTENT = rule<TokenKind, any>();
HOOK_CONTENT.setPattern(
	apply(
		seq(
			tok(TokenKind.HookOpen),
			rep(
				alt(
					apply(tok(TokenKind.Text), (t) => t.text),
					apply(tok(TokenKind.Whitespace), (t) => t.text),
					apply(tok(TokenKind.StringLiteral), (t) => t.text),
					apply(tok(TokenKind.Variable), (t) => t.text)
					// Add other token types that can appear in hook content
				)
			),
			tok(TokenKind.HookClose)
		),
		([_, content, __]) => ({
			type: "HookContent",
			content: content.join(""),
		})
	)
);

// Term can be either a literal or a parenthesized expression
const TERM = rule<TokenKind, any>();
TERM.setPattern(LITERAL);

// Arithmetic expression with proper precedence
const ARITHMETIC_EXPR = rule<TokenKind, any>();
ARITHMETIC_EXPR.setPattern(
	apply(
		seq(TERM, opt(seq(tok(TokenKind.ArithmeticOp), TERM))),
		([left, rightOpt]) => {
			if (!rightOpt) return left;
			const [op, right] = rightOpt;
			return {
				type: "ArithmeticExpr",
				operator: op.text,
				left,
				right,
			};
		}
	)
);

// Comparative expression
const COMPARATIVE_EXPR = rule<TokenKind, any>();
COMPARATIVE_EXPR.setPattern(
	apply(
		seq(ARITHMETIC_EXPR, tok(TokenKind.ComparisonOp), ARITHMETIC_EXPR),
		([left, op, right]) => ({
			type: "ComparisonExpr",
			operator: op.text,
			left,
			right,
		})
	)
);

// Expression can be either comparative or arithmetic
const EXPRESSION = rule<TokenKind, any>();
EXPRESSION.setPattern(alt(COMPARATIVE_EXPR, ARITHMETIC_EXPR));

// Keyword argument
const KEYWORD_ARG = rule<TokenKind, any>();
KEYWORD_ARG.setPattern(
	apply(
		seq(
			EXPRESSION,
			alt(tok(TokenKind.To), tok(TokenKind.Arrow)),
			EXPRESSION
		),
		([left, keyword, right]) => ({
			type: "KeywordArg",
			keyword: keyword.kind === TokenKind.To ? "to" : "->",
			left,
			right,
		})
	)
);

// Hook content parser
const HOOK = rule<TokenKind, any>();
HOOK.setPattern(
	apply(tok(TokenKind.HookContent), (token) => ({
		type: "Hook",
		content: token.text.slice(1, -1), // Remove the [ and ]
	}))
);

// Macro argument can be either a keyword argument or a regular expression
const MACRO_ARG = rule<TokenKind, any>();
MACRO_ARG.setPattern(alt(KEYWORD_ARG, EXPRESSION));

const MACRO_ARG_PATTERNS = {
	set: {
		pattern: ["KeywordArg"],
		keyword: "to",
	},
	link: {
		pattern: ["KeywordArg"],
		keyword: "->",
	},
	if: {
		pattern: ["Expression"],
		keyword: null,
	},
	print: {
		pattern: ["Expression"],
		keyword: null,
	},
	a: {
		pattern: ["Expression"],
		keyword: null,
	},
	dm: {
		pattern: ["Expression"],
		keyword: null,
	},
	live: {
		pattern: ["Expression"],
		keyword: null,
	},
} as const;

type MacroType = keyof typeof MACRO_ARG_PATTERNS;

const MACRO = rule<TokenKind, any>();
MACRO.setPattern(
	apply(
		seq(
			tok(TokenKind.MacroName),
			list_sc(MACRO_ARG, tok(TokenKind.Comma)),
			tok(TokenKind.RParen),
			opt(HOOK)
		),
		([macroName, args, _, hookContent]) => {
			const macroNames = macroName.text.match(/\((\w+):/) || [null];
			const name = macroNames[1] as MacroType;
			const macroPattern = MACRO_ARG_PATTERNS[name];

			if (!macroPattern) {
				return {
					type: "UnknownMacro",
					name,
					rawContent: macroName.text,
				};
			}

			return {
				type: "Macro",
				name,
				args,
				pattern: macroPattern.pattern,
				hookContent: hookContent || null,
			};
		}
	)
);

const PROGRAM = rule<TokenKind, any>();
PROGRAM.setPattern(
	apply(rep(MACRO), (expressions) => ({
		type: "Program",
		expressions: expressions.filter(Boolean),
	}))
);

function parseHarlowe(input: string) {
	try {
		const tokens = tokenizer.parse(input);
		if (!tokens) {
			throw new Error("Tokenization failed");
		}
		return expectSingleResult(expectEOF(PROGRAM.parse(tokens)));
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
		'(if: $condition) (print: "Hello")',
		`(if: $condition) 
        (print: "Hello")`,
		`(set: $name to "John Doe")
(if: $score > 10)[You win!]
(link: "Next" -> "NextPassage")
(a: 1, 2, 3)
(dm: "name", "John", "score", 10)
(live: 2s)[Time is running!]
(print: "Your score is " + $score)
`,
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
