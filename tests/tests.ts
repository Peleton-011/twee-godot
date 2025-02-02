import parseHarlowe from "../utils/parseHarlowe.ts";
// Test cases
function runTests(tests: string[]) {
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

const mainTests = [
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
	`(set: $name to "John")
    (if: $score > 10)[You win!]
    (link: "Next" -> "NextPassage")
    (a: 1, 2, 3)
    (dm: "name", "John", "score", 10)
    (m: 1 + 2)
    (live: 2s)[Time is running!]
    (history:)[You've visited (visited: "Room")]
    (print: "Your score is " + $score)
    `,
	`Choose what to do
    (link: "Next" -> "NextPassage")
    [[ Back -> Home]]
    [[ Outside ]]
    `,
];

const altTests = [
	// Should pass
	'(set: $name to "John")',
	// Should pass
	"(if: $score > 10)[You win!]",
	// Should pass
	'(link: "Next" -> "NextPassage")',
	// Should pass
	"(a: 1, 2, 3)",
	// This might be the issue
	'(dm: "name", "John", "score", 10)',
	// Should pass
	"(m: 1 + 2)",
	// Should pass
	"(live: 2s)[Time is running!]",
	// This is likely problematic
	'(history:)[You\'ve visited (visited: "Room")]',
	// Should pass
	'(print: "Your score is " + $score)',
];

export { runTests, mainTests, altTests };
