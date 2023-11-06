export const TEMPLATING_ENGINE = {
  JINJA2: "jinja2",
} as const;

export type TemplatingEngine =
  (typeof TEMPLATING_ENGINE)[keyof typeof TEMPLATING_ENGINE];

export interface PromptMessage {
  index: number;
  template: string;
  role: string;
  variables: string[];
}

export interface RenderedMessage {
  role: string;
  content: string;
}

export interface PromptTarget {
  id: string;
  environment: string;
  version: string;
  updated_at: string;
}

export interface PromptVersion {
  templating_engine: TemplatingEngine;
  provider: string;
  messages: PromptMessage[];
  id: string;
  hash: string;
  version: number;
  name?: string;
  updated_at: string;
  created_at: string;
  author?: string;
  publishable: boolean;
  llm_config: any;
}

export interface Prompt {
  id: string;
  org_id: string;
  key: string;
  updated_at: string;
  created_at: string;
  versions: PromptVersion[];
  target: PromptTarget;
}
