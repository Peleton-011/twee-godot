<script setup lang="ts">
import { ref } from "vue";
import parseHarlowe from "../utils/parseHarlowe.ts";
import { runTests, altTests, mainTests } from "../tests/tests.ts";

const harloweCode = ref("");
const outputJson = ref({});

runTests(altTests);
runTests(mainTests);

function updateHarloweCode(event: Event) {
	harloweCode.value = (event.target as HTMLInputElement).value;
}

function updateOutputJson() {
	outputJson.value = JSON.stringify(parseHarlowe(harloweCode.value), null, 2);
}
// const parsedJSON = parseHarlowe(harloweCode);
// console.log(JSON.stringify(parsedJSON, null, 2));
</script>

<template>
	<div>
		<h1>Harlowe parser</h1>
		<div>
			<div class="card">
				<textarea
					@input="updateHarloweCode"
					placeholder="Enter Harlowe code here"
					id="harloweInput"
				/>
				<pre id="harloweOutput">{{ outputJson }}</pre>
			</div>
			<button @click="updateOutputJson">Parse</button>
		</div>
	</div>
</template>

<style scoped>
#harloweInput,
#harloweOutput {
	height: 30vh;
	width: 30vw;
}
.card {
	display: flex;
}
#harloweOutput {
	text-align: left;
}
</style>
