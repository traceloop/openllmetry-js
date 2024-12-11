import * as traceloop from "@traceloop/node-server-sdk";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

traceloop.initialize({
  appName: "sample_same_structured_output",
  apiKey: process.env.TRACELOOP_API_KEY,
  disableBatch: true,
});
const openai = new OpenAI();

const CalendarEvent = z.object({
  name: z.string(),
  date: z.string(),
  participants: z.array(z.string()),
});

async function create_event() {
  const completion = await openai.beta.chat.completions.parse({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Extract the event information." },
      {
        role: "user",
        content: "Alice and Bob are going to a science fair on Friday.",
      },
    ],
    response_format: zodResponseFormat(CalendarEvent, "event"),
  });

  console.log(completion.choices[0].message.parsed);

  return completion.choices[0].message.parsed;
}

create_event();
