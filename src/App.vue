<script setup lang="ts">
import HelloWorld from "./components/HelloWorld.vue";
import { parseHarlowe, runTests } from "../utils/parseHarlowe.ts";

// 🧪 **Test Example**
const harloweCode = `(set: $name to "John")
(if: $score > 10)[You win!]
(link: "Next" -> "NextPassage")
(a: 1, 2, 3)
(dm: "name", "John", "score", 10)
(m: 1 + 2)
(live: 2s)[Time is running!]
(history:)[You've visited (visited: "Room")]
(print: "Your score is " + $score)
`;

const altCode = `
(set: $name to "John Doe")
(if: $score > 10)[You win!]
(link: "Next" -> "NextPassage")
(a: 1, 2, 3)
(dm: "name", "John", "score", 10)
(live: 2s)[Time is running!]
(print: "Your score is " + $score)
`;

(altCode + harloweCode)[1] === "B" ? console.log("a") : console.log("b");

// const parsedJSON = parseHarlowe(harloweCode);
// console.log(JSON.stringify(parsedJSON, null, 2));

runTests();
</script>

<template>
	<div>
		<a href="https://vite.dev" target="_blank">
			<img src="/vite.svg" class="logo" alt="Vite logo" />
		</a>
		<a href="https://vuejs.org/" target="_blank">
			<img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
		</a>
	</div>
	<HelloWorld msg="Vite + Vue" />
</template>

<style scoped>
.logo {
	height: 6em;
	padding: 1.5em;
	will-change: filter;
	transition: filter 300ms;
}
.logo:hover {
	filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
	filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
