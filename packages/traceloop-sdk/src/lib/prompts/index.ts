import { TraceloopError } from "../errors";
import { Prompt, PromptVersion } from "../interfaces";
import { Telemetry } from "../telemetry/telemetry";
import { getPromptByKey } from "./registry";
import { renderMessages } from "./template";
export { waitForInitialization } from "./registry";

const getEffectiveVersion = (prompt: Prompt): PromptVersion => {
  const version = prompt.versions.find(
    (v: PromptVersion) => v.id === prompt.target.version,
  );
  if (!version) {
    throw new TraceloopError(
      `Prompt version ${prompt.target.version} not found`,
    );
  }
  return version;
};

const managedPromptTracingAttributes = (
  prompt: Prompt,
  promptVersion: PromptVersion,
  variables: Record<string, string>,
) => {
  const variableAttributes = Object.keys(variables).reduce(
    (acc, key) => {
      acc[`traceloop.prompt.template_variables.${key}`] = variables[key];
      return acc;
    },
    {} as Record<string, string>,
  );

  return {
    "traceloop.prompt.key": prompt.key,
    "traceloop.prompt.version": promptVersion.version,
    "traceloop.prompt.version_hash": promptVersion.hash,
    "traceloop.prompt.version_name": promptVersion.name,
    ...variableAttributes,
  };
};

export const getPrompt = (key: string, variables: Record<string, string>) => {
  Telemetry.getInstance().capture("prompt:rendered");

  const prompt = getPromptByKey(key);
  const promptVersion = getEffectiveVersion(prompt);

  let result: any = {}; //TODO - SDK needs to do work specific to each vendor/model? maybe we do this in the backend?
  if (promptVersion.llm_config.mode === "completion") {
    const message = renderMessages(promptVersion, variables);
    result = {
      ...promptVersion.llm_config,
      prompt: message?.[0]?.content,
    };
  } else {
    result = {
      messages: renderMessages(promptVersion, variables),
      ...promptVersion.llm_config,
    };
  }
  if (result?.["stop"].length === 0) delete result["stop"];
  delete result["mode"];

  result.extraAttributes = managedPromptTracingAttributes(
    prompt,
    promptVersion,
    variables,
  );

  return result;
};
