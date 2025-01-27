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
	HookContent,
}

const tokenizer = buildLexer([
	[true, /^\([a-zA-Z0-9_-]+:/g, TokenKind.MacroName], // Modified to allow more macro names
	[true, /^\)/g, TokenKind.RParen],
	[true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable],
	[true, /^\"[^\"]*\"/g, TokenKind.StringLiteral],
	[true, /^\d+(\.\d+)?s\b/g, TokenKind.Time],
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
	[true, /^\[[^\]]*\]/g, TokenKind.HookContent],
	[true, /^[^\[\]\(\)$,\s><="']+/g, TokenKind.Text],
]);

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
					apply(tok(TokenKind.Variable), (t) => t.text),
					apply(tok(TokenKind.MacroName), (t) => t.text), // Allow nested macros
					apply(tok(TokenKind.RParen), (t) => t.text)
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

const TERM = rule<TokenKind, any>();
TERM.setPattern(LITERAL);

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

const EXPRESSION = rule<TokenKind, any>();
EXPRESSION.setPattern(alt(COMPARATIVE_EXPR, ARITHMETIC_EXPR));

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

const HOOK = rule<TokenKind, any>();
HOOK.setPattern(
	apply(tok(TokenKind.HookContent), (token) => ({
		type: "Hook",
		content: token.text.slice(1, -1),
	}))
);

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
		pattern: ["Expression", "Expression", "Expression", "Expression"], // Handle multiple key-value pairs
		keyword: null,
	},
	live: {
		pattern: ["Expression"],
		keyword: null,
	},
	history: {
		pattern: [],
		keyword: null,
	},
	visited: {
		pattern: ["Expression"],
		keyword: null,
	},
	m: {
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
			opt(list_sc(MACRO_ARG, tok(TokenKind.Comma))), // Make arguments optional
			tok(TokenKind.RParen),
			opt(HOOK)
		),
		([macroName, args, _, hookContent]) => {
			const macroNames = macroName.text.match(/\(([a-zA-Z0-9_-]+):/) || [
				null,
			];
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
				args: args || [],
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

export default parseHarlowe;
