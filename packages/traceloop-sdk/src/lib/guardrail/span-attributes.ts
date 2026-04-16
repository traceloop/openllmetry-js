export const GuardrailSpanAttributes = {
  NAME: "gen_ai.guardrail.name",
  STATUS: "gen_ai.guardrail.status",
  DURATION: "gen_ai.guardrail.duration",
  GUARD_COUNT: "gen_ai.guardrail.guard_count",
  FAILED_GUARD_COUNT: "gen_ai.guardrail.failed_guard_count",
  INPUT: "gen_ai.guardrail.input",
  OUTPUT: "gen_ai.guardrail.output",
  ERROR_TYPE: "gen_ai.guardrail.error.type",
  ERROR_MESSAGE: "gen_ai.guardrail.error.message",
} as const;

export const GuardrailOperationNames = {
  RUN: "guardrail.run",
  GUARD: "guard",
} as const;
