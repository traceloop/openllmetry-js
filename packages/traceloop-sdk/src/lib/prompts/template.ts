import { TraceloopError } from "../errors";
import {
  PromptVersion,
  RenderedMessage,
  TEMPLATING_ENGINE,
} from "../interfaces";
import { Environment } from "nunjucks";

const env = new Environment(null, {
  throwOnUndefined: true, // throw error if param not found
});

export const renderMessages = (
  promptVersion: PromptVersion,
  variables: Record<string, any>,
): RenderedMessage[] => {
  if (promptVersion.templating_engine === TEMPLATING_ENGINE.JINJA2) {
    return promptVersion.messages.map((message) => {
      try {
        if (typeof message.template === "string") {
          return {
            content: env.renderString(message.template, variables),
            role: message.role,
          };
        } else {
          return {
            content: message.template.map((content) => {
              if (content.type === "text") {
                return {
                  type: "text",
                  text: env.renderString(content.text, variables),
                };
              } else {
                return content;
              }
            }),
            role: message.role,
          };
        }
      } catch (err) {
        throw new TraceloopError(
          `Failed to render message template. Missing variables?`,
        );
      }
    });
  } else {
    throw new TraceloopError(
      `Templating engine ${promptVersion.templating_engine} is not supported`,
    );
  }
};
