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
	LinkOpen,
	LinkClose,
	LinkArrowRight,
	LinkArrowLeft,
	LinkText,
	MacroLink,
	MacroArrow,

	Plus, // Separate token for + operator
	Minus, // Separate token for - operator
	Multiply, // Separate token for * operator
	Divide, // Separate token for / operator
	GreaterThan, // Separate token for >
	LessThan, // Separate token for <
	Space, // Explicit space token
}

const tokenizer = buildLexer([
	// Whitespace
	[false, /^[ \t\n\r]+/g, TokenKind.Space],

	// Operators
	[true, /^\+/g, TokenKind.Plus],
	[true, /^\-/g, TokenKind.Minus],
	[true, /^\*/g, TokenKind.Multiply],
	[true, /^\//g, TokenKind.Divide],
	[true, /^>/g, TokenKind.GreaterThan],
	[true, /^</g, TokenKind.LessThan],
	[true, /^(>=|<=|is|contains|does not contain)\b/g, TokenKind.ComparisonOp],

	// Links
	[true, /^\[\[/g, TokenKind.LinkOpen],
	[true, /^\]\]/g, TokenKind.LinkClose],
	[true, /^->/g, TokenKind.Arrow],
	[true, /^<-/g, TokenKind.LinkArrowLeft],

	// Hooks and Macros
	[true, /^\[/g, TokenKind.HookOpen],
	[true, /^\]/g, TokenKind.HookClose],
	[true, /^\([a-zA-Z0-9_-]+:/g, TokenKind.MacroName],
	[true, /^\)/g, TokenKind.RParen],

	// Keywords and special tokens
	[true, /^to\b/g, TokenKind.To],
	[true, /^(and|or)\b/g, TokenKind.LogicalOp],

	// Variables and literals
	[true, /^\$[a-zA-Z_][a-zA-Z0-9_-]*/g, TokenKind.Variable],
	[true, /^\"[^\"]*\"/g, TokenKind.StringLiteral],
	[true, /^\d+(\.\d+)?s\b/g, TokenKind.Time],
	[true, /^\d+(\.\d+)?/g, TokenKind.Number],
	[true, /^(true|false)\b/g, TokenKind.Boolean],

	// Other tokens
	[true, /^,/g, TokenKind.Comma],

	// Text should be anything that's not a special character
	[true, /^[^\[\]\(\)\-><,$\s"+*\/]+/g, TokenKind.Text],
]);

// Forward declarations
const EXPRESSION = rule<TokenKind, any>();
const VALUE = rule<TokenKind, any>();
const HOOK_CONTENT = rule<TokenKind, any>();
const MACRO = rule<TokenKind, any>();

// Parse basic values
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
		apply(tok(TokenKind.Variable), (t) => ({
			type: "Variable",
			name: t.text.slice(1),
		})),
		apply(tok(TokenKind.Time), (t) => ({
			type: "Time",
			value: t.text,
		})),
		MACRO // Allow nested macros
	)
);

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

// Parse hook content including nested text and whitespace
HOOK_CONTENT.setPattern(
	apply(
		seq(
			tok(TokenKind.HookOpen),
			rep(
				alt(
					apply(tok(TokenKind.Text), (t) => t.text),
					apply(tok(TokenKind.Space), (t) => t.text),
					MACRO, // Allow nested macros in hook content
					apply(tok(TokenKind.StringLiteral), (t) => t.text)
				)
			),
			tok(TokenKind.HookClose)
		),
		([_, content, __]) => ({
			type: "HookContent",
			content,
		})
	)
);

// New LINK_MACRO rule specifically for (link:) syntax
const LINK_MACRO = rule<TokenKind, any>();
LINK_MACRO.setPattern(
	apply(
		seq(
			tok(TokenKind.MacroLink),
			tok(TokenKind.StringLiteral),
			tok(TokenKind.MacroArrow),
			tok(TokenKind.StringLiteral),
			tok(TokenKind.RParen),
			opt(HOOK_CONTENT)
		),
		([_, text, __, target, ___, hookOpt]) => ({
			type: "LinkMacro",
			text: text.text.slice(1, -1),
			target: target.text.slice(1, -1),
			hookContent: hookOpt || null,
		})
	)
);

// Parse links with various syntaxes
const LINK = rule<TokenKind, any>();
LINK.setPattern(
	alt(
		apply(
			seq(
				tok(TokenKind.LinkOpen),
				rep(alt(tok(TokenKind.Text), tok(TokenKind.Space))),
				tok(TokenKind.Arrow),
				rep(alt(tok(TokenKind.Text), tok(TokenKind.Space))),
				tok(TokenKind.LinkClose)
			),
			([_, text, __, target, ___]) => ({
				type: "Link",
				text: text
					.map((t) => t.text)
					.join("")
					.trim(),
				target: target
					.map((t) => t.text)
					.join("")
					.trim(),
			})
		),
		apply(
			seq(
				tok(TokenKind.LinkOpen),
				rep(alt(tok(TokenKind.Text), tok(TokenKind.Space))),
				tok(TokenKind.LinkClose)
			),
			([_, content, __]) => ({
				type: "Link",
				text: content
					.map((t) => t.text)
					.join("")
					.trim(),
				target: content
					.map((t) => t.text)
					.join("")
					.trim(),
			})
		)
	)
);

const TERM = rule<TokenKind, any>();
TERM.setPattern(LITERAL);

EXPRESSION.setPattern(
	apply(
		seq(
			VALUE,
			opt(
				seq(
					alt(
						tok(TokenKind.Plus),
						tok(TokenKind.Minus),
						tok(TokenKind.Multiply),
						tok(TokenKind.Divide),
						tok(TokenKind.GreaterThan),
						tok(TokenKind.LessThan),
						tok(TokenKind.ComparisonOp)
					),
					VALUE
				)
			)
		),
		([left, rightOpt]) => {
			if (!rightOpt) return left;
			const [op, right] = rightOpt;
			return {
				type: "Operation",
				operator: op.text,
				left,
				right,
			};
		}
	)
);

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

// Parse macro arguments
const MACRO_ARG = rule<TokenKind, any>();
MACRO_ARG.setPattern(
	alt(
		apply(
			seq(EXPRESSION, tok(TokenKind.To), EXPRESSION),
			([left, _, right]) => ({
				type: "Assignment",
				left,
				right,
			})
		),
		apply(
			seq(EXPRESSION, tok(TokenKind.Arrow), EXPRESSION),
			([left, _, right]) => ({
				type: "Link",
				text: left,
				target: right,
			})
		),
		EXPRESSION
	)
);

// Parse a macro with optional arguments and hook
MACRO.setPattern(
	apply(
		seq(
			tok(TokenKind.MacroName),
			opt(list_sc(MACRO_ARG, tok(TokenKind.Comma))),
			tok(TokenKind.RParen),
			opt(HOOK_CONTENT)
		),
		([name, args, _, hook]) => ({
			type: "Macro",
			name: name.text.slice(1, -1),
			args: args || [],
			hook: hook || null,
		})
	)
);

// Parse a hook modifier (macro or variable) followed by a hook
const MODIFIED_HOOK = rule<TokenKind, any>();
MODIFIED_HOOK.setPattern(
	apply(
		seq(
			alt(
				MACRO,
				apply(tok(TokenKind.Variable), (t) => ({
					type: "Variable",
					name: t.text.slice(1),
				}))
			),
			HOOK_CONTENT
		),
		([modifier, hook]) => ({
			type: "ModifiedHook",
			modifier,
			hook,
		})
	)
);

// Main program rule that handles all expressions
const PROGRAM = rule<TokenKind, any>();
PROGRAM.setPattern(
	apply(
		rep(
			alt(
				MACRO,
				LINK,
				apply(tok(TokenKind.Text), (t) => ({
					type: "Text",
					content: t.text,
				})),
				apply(tok(TokenKind.Space), (t) => ({
					type: "Space",
					content: t.text,
				}))
			)
		),
		(expressions) => ({
			type: "Program",
			expressions: expressions.filter(Boolean),
		})
	)
);

function parseHarlowe(input: string) {
	try {
		const tokens = tokenizer.parse(input);
		if (!tokens) {
			throw new Error("Tokenization failed");
		}

		return expectSingleResult(expectEOF(PROGRAM.parse(tokens)));
	} catch (error: unknown) {
		console.log("Parse error:", error); // Debug output
		if (error instanceof Error) {
			throw new Error(`Error parsing: ${input}, error: ${error.message}`);
		} else {
			throw new Error(`Error parsing: ${input}, error: ${String(error)}`);
		}
	}
}

export default parseHarlowe;
