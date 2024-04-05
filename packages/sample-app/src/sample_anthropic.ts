import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({});

async function main() {
  const completion = await anthropic.completions.create({
    model: "claude-2",
    max_tokens_to_sample: 300,
    prompt: `${Anthropic.HUMAN_PROMPT} how does a court case get to the Supreme Court?${Anthropic.AI_PROMPT}`,
  });
  console.log(completion.completion);
}

main();
