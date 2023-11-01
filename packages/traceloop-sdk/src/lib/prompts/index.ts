import { TraceloopError } from "../errors";
import { Prompt, PromptVersion } from "../interfaces";
import { getPromptByKey } from "./registry";
import { renderMessages } from "./template";

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

export const getPrompt = (key: string, variables: Record<string, any>) => {
  console.log("getPrompt", key, variables);
  const prompt = getPromptByKey(key);
  const promptVersion = getEffectiveVersion(prompt);

  let result: any = {}; //TODO - SDK needs to do work specific to each vendor/model? maybe we do this in the backend?
  if (promptVersion.llm_config.mode === "completion") {
    const message = renderMessages(promptVersion, variables);
    result = {
      ...promptVersion.llm_config,
      prompt: message?.[0]?.content,
    };
    if (result?.["stop"].length === 0) delete result["stop"];
  } else {
    result = {
      messages: renderMessages(promptVersion, variables),
      ...promptVersion.llm_config,
    };
  }
  delete result["mode"];

  return result;
};
