#!/usr/bin/env npx ts-node
/**
 * Generate TypeScript interfaces from OpenAPI/Swagger spec.
 * Extracts models used by v2/evaluators/execute/* endpoints.
 *
 * Usage:
 *   npx ts-node generate-evaluator-models.ts <swagger_path> <output_dir>
 *
 * Example:
 *   npx ts-node generate-evaluator-models.ts ./swagger.json ../packages/traceloop-sdk/src/lib/evaluators-generated
 */

import * as fs from "fs";
import * as path from "path";

// Types for OpenAPI spec parsing
interface OpenAPISchema {
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  $ref?: string;
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  enum?: (string | number)[];
  format?: string;
  description?: string;
  example?: unknown;
  examples?: unknown[];
  default?: unknown;
  nullable?: boolean;
  additionalProperties?: boolean | OpenAPISchema;
}

interface OpenAPIParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: OpenAPISchema;
}

interface OpenAPIRequestBody {
  content?: {
    "application/json"?: {
      schema?: OpenAPISchema;
    };
  };
}

interface OpenAPIResponse {
  description?: string;
  content?: {
    "application/json"?: {
      schema?: OpenAPISchema;
    };
  };
  schema?: OpenAPISchema; // Swagger 2.0 format
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
}

interface OpenAPIPathItem {
  post?: OpenAPIOperation;
  get?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
  definitions?: Record<string, OpenAPISchema>; // Swagger 2.0 format
}

interface EvaluatorDefinition {
  slug: string;
  requestSchemaRef?: string;
  responseSchemaRef?: string;
  requestSchema?: OpenAPISchema;
  responseSchema?: OpenAPISchema;
  description?: string;
}

interface EvaluatorSchema {
  slug: string;
  requiredInputFields: string[];
  optionalConfigFields: string[];
  description?: string;
}

/**
 * Convert slug like "pii-detector" to PascalCase class name like "PiiDetector"
 */
function slugToClassName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

/**
 * Convert slug like "pii-detector" to snake_case method name like "pii_detector"
 */
function slugToMethodName(slug: string): string {
  return slug.replace(/-/g, "_");
}

/**
 * Resolve a $ref path to get the schema name
 */
function resolveRefName(ref: string): string {
  // Handle both OpenAPI 3.0 and Swagger 2.0 formats
  // OpenAPI 3.0: "#/components/schemas/ModelName"
  // Swagger 2.0: "#/definitions/ModelName"
  const parts = ref.split("/");
  return parts[parts.length - 1];
}

/**
 * Get all schemas from the spec (handles both OpenAPI 3.0 and Swagger 2.0)
 */
function getAllSchemas(spec: OpenAPISpec): Record<string, OpenAPISchema> {
  return spec.components?.schemas || spec.definitions || {};
}

/**
 * Extract schema from a $ref, resolving nested references
 */
function resolveSchema(
  ref: string,
  allSchemas: Record<string, OpenAPISchema>,
): OpenAPISchema | undefined {
  const schemaName = resolveRefName(ref);
  return allSchemas[schemaName];
}

/**
 * Extract evaluator definitions from the OpenAPI spec
 */
function extractEvaluatorDefinitions(spec: OpenAPISpec): EvaluatorDefinition[] {
  const evaluators: EvaluatorDefinition[] = [];
  const allSchemas = getAllSchemas(spec);

  for (const [pathUrl, pathItem] of Object.entries(spec.paths)) {
    // Match /v2/evaluators/execute/{slug} pattern
    const match = pathUrl.match(/^\/v2\/evaluators\/execute\/([^/]+)$/);
    if (!match || !pathItem.post) continue;

    const slug = match[1];
    const operation = pathItem.post;

    const evaluator: EvaluatorDefinition = {
      slug,
      description: operation.description || operation.summary,
    };

    // Extract request schema
    // OpenAPI 3.0 format
    if (operation.requestBody?.content?.["application/json"]?.schema) {
      const schema = operation.requestBody.content["application/json"].schema;
      if (schema.$ref) {
        evaluator.requestSchemaRef = schema.$ref;
        evaluator.requestSchema = resolveSchema(schema.$ref, allSchemas);
      } else {
        evaluator.requestSchema = schema;
      }
    }
    // Swagger 2.0 format - check parameters for body
    else if (operation.parameters) {
      const bodyParam = operation.parameters.find((p) => p.in === "body");
      if (bodyParam?.schema) {
        if (bodyParam.schema.$ref) {
          evaluator.requestSchemaRef = bodyParam.schema.$ref;
          evaluator.requestSchema = resolveSchema(
            bodyParam.schema.$ref,
            allSchemas,
          );
        } else {
          evaluator.requestSchema = bodyParam.schema;
        }
      }
    }

    // Extract response schema (200 response)
    const successResponse = operation.responses?.["200"];
    if (successResponse) {
      // OpenAPI 3.0 format
      if (successResponse.content?.["application/json"]?.schema) {
        const schema = successResponse.content["application/json"].schema;
        if (schema.$ref) {
          evaluator.responseSchemaRef = schema.$ref;
          evaluator.responseSchema = resolveSchema(schema.$ref, allSchemas);
        } else {
          evaluator.responseSchema = schema;
        }
      }
      // Swagger 2.0 format
      else if (successResponse.schema) {
        if (successResponse.schema.$ref) {
          evaluator.responseSchemaRef = successResponse.schema.$ref;
          evaluator.responseSchema = resolveSchema(
            successResponse.schema.$ref,
            allSchemas,
          );
        } else {
          evaluator.responseSchema = successResponse.schema;
        }
      }
    }

    // Only include if we have at least a request schema
    if (evaluator.requestSchema || evaluator.requestSchemaRef) {
      evaluators.push(evaluator);
    }
  }

  return evaluators;
}

/**
 * Convert OpenAPI type to TypeScript type
 */
function openApiTypeToTs(
  schema: OpenAPISchema,
  allSchemas: Record<string, OpenAPISchema>,
  indent: string = "",
): string {
  if (schema.$ref) {
    return resolveRefName(schema.$ref);
  }

  if (schema.allOf) {
    const types = schema.allOf.map((s) => openApiTypeToTs(s, allSchemas));
    return types.join(" & ");
  }

  if (schema.oneOf || schema.anyOf) {
    const schemas = schema.oneOf || schema.anyOf;
    const types = schemas!.map((s) => openApiTypeToTs(s, allSchemas));
    return types.join(" | ");
  }

  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      if (schema.items) {
        return `${openApiTypeToTs(schema.items, allSchemas)}[]`;
      }
      return "unknown[]";
    case "object":
      if (schema.properties) {
        const props = Object.entries(schema.properties)
          .map(([propName, propSchema]) => {
            const isRequired = schema.required?.includes(propName);
            const tsType = openApiTypeToTs(propSchema, allSchemas);
            const nullable = propSchema.nullable ? " | null" : "";
            return `${indent}  ${propName}${isRequired ? "" : "?"}: ${tsType}${nullable};`;
          })
          .join("\n");
        return `{\n${props}\n${indent}}`;
      }
      if (schema.additionalProperties) {
        if (typeof schema.additionalProperties === "boolean") {
          return "Record<string, unknown>";
        }
        return `Record<string, ${openApiTypeToTs(schema.additionalProperties, allSchemas)}>`;
      }
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}

/**
 * Generate TypeScript interface for a schema
 */
function generateInterface(
  name: string,
  schema: OpenAPISchema,
  allSchemas: Record<string, OpenAPISchema>,
): string {
  const lines: string[] = [];

  if (schema.description) {
    lines.push(`/** ${schema.description} */`);
  }

  if (schema.properties) {
    lines.push(`export interface ${name} {`);
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const isRequired = schema.required?.includes(propName);
      const tsType = openApiTypeToTs(propSchema, allSchemas, "  ");
      const nullable = propSchema.nullable ? " | null" : "";
      if (propSchema.description) {
        lines.push(`  /** ${propSchema.description} */`);
      }
      lines.push(`  ${propName}${isRequired ? "" : "?"}: ${tsType}${nullable};`);
    }
    lines.push(`}`);
  } else {
    // Handle non-object schemas (aliases)
    const tsType = openApiTypeToTs(schema, allSchemas);
    lines.push(`export type ${name} = ${tsType};`);
  }

  return lines.join("\n");
}

/**
 * Extract required and optional fields from a schema
 */
function extractFieldsFromSchema(schema: OpenAPISchema): {
  required: string[];
  optional: string[];
} {
  const required: string[] = [];
  const optional: string[] = [];

  if (schema.properties) {
    for (const propName of Object.keys(schema.properties)) {
      if (schema.required?.includes(propName)) {
        required.push(propName);
      } else {
        optional.push(propName);
      }
    }
  }

  return { required, optional };
}

/**
 * Generate request.ts file content
 */
function generateRequestFile(
  evaluators: EvaluatorDefinition[],
  allSchemas: Record<string, OpenAPISchema>,
): string {
  const lines: string[] = [
    "// Auto-generated - DO NOT EDIT",
    "// Generated from swagger.json by generate-evaluator-models.ts",
    "//",
    "// Regenerate with: pnpm generate:evaluator-models",
    "",
  ];

  // Collect all unique schemas that need to be generated
  const generatedSchemas = new Set<string>();

  for (const evaluator of evaluators) {
    const className = `${slugToClassName(evaluator.slug)}Request`;

    if (evaluator.requestSchema) {
      lines.push("");
      lines.push(generateInterface(className, evaluator.requestSchema, allSchemas));
      generatedSchemas.add(className);
    } else if (evaluator.requestSchemaRef) {
      // Reference to another schema - create a type alias
      const refName = resolveRefName(evaluator.requestSchemaRef);
      if (!generatedSchemas.has(refName)) {
        const refSchema = allSchemas[refName];
        if (refSchema) {
          lines.push("");
          lines.push(generateInterface(refName, refSchema, allSchemas));
          generatedSchemas.add(refName);
        }
      }
      if (refName !== className) {
        lines.push("");
        lines.push(`export type ${className} = ${refName};`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Generate response.ts file content
 */
function generateResponseFile(
  evaluators: EvaluatorDefinition[],
  allSchemas: Record<string, OpenAPISchema>,
): string {
  const lines: string[] = [
    "// Auto-generated - DO NOT EDIT",
    "// Generated from swagger.json by generate-evaluator-models.ts",
    "//",
    "// Regenerate with: pnpm generate:evaluator-models",
    "",
  ];

  const generatedSchemas = new Set<string>();

  for (const evaluator of evaluators) {
    const className = `${slugToClassName(evaluator.slug)}Response`;

    if (evaluator.responseSchema) {
      lines.push("");
      lines.push(generateInterface(className, evaluator.responseSchema, allSchemas));
      generatedSchemas.add(className);
    } else if (evaluator.responseSchemaRef) {
      const refName = resolveRefName(evaluator.responseSchemaRef);
      if (!generatedSchemas.has(refName)) {
        const refSchema = allSchemas[refName];
        if (refSchema) {
          lines.push("");
          lines.push(generateInterface(refName, refSchema, allSchemas));
          generatedSchemas.add(refName);
        }
      }
      if (refName !== className) {
        lines.push("");
        lines.push(`export type ${className} = ${refName};`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Generate registry.ts file content
 */
function generateRegistryFile(evaluators: EvaluatorDefinition[]): string {
  const lines: string[] = [
    "// Auto-generated - DO NOT EDIT",
    "// Generated from swagger.json by generate-evaluator-models.ts",
    "//",
    "// Regenerate with: pnpm generate:evaluator-models",
    "",
    "import type * as Request from './request';",
    "import type * as Response from './response';",
    "",
  ];

  // Generate EvaluatorSchema interface
  lines.push("export interface EvaluatorSchema {");
  lines.push("  slug: string;");
  lines.push("  requiredInputFields: string[];");
  lines.push("  optionalConfigFields: string[];");
  lines.push("  description?: string;");
  lines.push("}");
  lines.push("");

  // Generate EVALUATOR_SLUGS type
  const slugs = evaluators.map((e) => `'${e.slug}'`);
  lines.push(`export type EvaluatorSlug = ${slugs.join(" | ") || "string"};`);
  lines.push("");

  // Generate EVALUATOR_SLUGS array
  lines.push("export const EVALUATOR_SLUGS: EvaluatorSlug[] = [");
  for (const evaluator of evaluators) {
    lines.push(`  '${evaluator.slug}',`);
  }
  lines.push("];");
  lines.push("");

  // Generate REQUEST_MODELS mapping
  lines.push(
    "export const REQUEST_MODELS: Record<EvaluatorSlug, unknown> = {",
  );
  for (const evaluator of evaluators) {
    const className = `${slugToClassName(evaluator.slug)}Request`;
    lines.push(`  '${evaluator.slug}': {} as Request.${className},`);
  }
  lines.push("};");
  lines.push("");

  // Generate RESPONSE_MODELS mapping
  lines.push(
    "export const RESPONSE_MODELS: Record<EvaluatorSlug, unknown> = {",
  );
  for (const evaluator of evaluators) {
    const className = `${slugToClassName(evaluator.slug)}Response`;
    lines.push(`  '${evaluator.slug}': {} as Response.${className},`);
  }
  lines.push("};");
  lines.push("");

  // Generate EVALUATOR_SCHEMAS
  lines.push("export const EVALUATOR_SCHEMAS: Record<EvaluatorSlug, EvaluatorSchema> = {");
  for (const evaluator of evaluators) {
    const { required, optional } = evaluator.requestSchema
      ? extractFieldsFromSchema(evaluator.requestSchema)
      : { required: [], optional: [] };

    lines.push(`  '${evaluator.slug}': {`);
    lines.push(`    slug: '${evaluator.slug}',`);
    lines.push(`    requiredInputFields: [${required.map((f) => `'${f}'`).join(", ")}],`);
    lines.push(`    optionalConfigFields: [${optional.map((f) => `'${f}'`).join(", ")}],`);
    if (evaluator.description) {
      lines.push(`    description: ${JSON.stringify(evaluator.description)},`);
    }
    lines.push(`  },`);
  }
  lines.push("};");
  lines.push("");

  // Generate helper functions
  lines.push("/**");
  lines.push(" * Get the request model type for an evaluator slug");
  lines.push(" */");
  lines.push(
    "export function getRequestModel<S extends EvaluatorSlug>(slug: S): (typeof REQUEST_MODELS)[S] {",
  );
  lines.push("  return REQUEST_MODELS[slug];");
  lines.push("}");
  lines.push("");

  lines.push("/**");
  lines.push(" * Get the response model type for an evaluator slug");
  lines.push(" */");
  lines.push(
    "export function getResponseModel<S extends EvaluatorSlug>(slug: S): (typeof RESPONSE_MODELS)[S] {",
  );
  lines.push("  return RESPONSE_MODELS[slug];");
  lines.push("}");
  lines.push("");

  lines.push("/**");
  lines.push(" * Get the schema information for an evaluator slug");
  lines.push(" */");
  lines.push(
    "export function getEvaluatorSchema<S extends EvaluatorSlug>(slug: S): EvaluatorSchema {",
  );
  lines.push("  return EVALUATOR_SCHEMAS[slug];");
  lines.push("}");
  lines.push("");

  lines.push("/**");
  lines.push(" * Check if a slug is a valid MBT evaluator");
  lines.push(" */");
  lines.push("export function isValidEvaluatorSlug(slug: string): slug is EvaluatorSlug {");
  lines.push("  return slug in EVALUATOR_SCHEMAS;");
  lines.push("}");

  return lines.join("\n") + "\n";
}

/**
 * Convert slug like "pii-detector" to camelCase method name like "piiDetector"
 */
function slugToCamelCase(slug: string): string {
  return slug
    .split("-")
    .map((part, index) =>
      index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}

/**
 * Generate config interface for an evaluator
 */
function generateConfigInterface(
  evaluator: EvaluatorDefinition,
  allSchemas: Record<string, OpenAPISchema>,
): { interfaceName: string; interfaceCode: string } | null {
  if (!evaluator.requestSchema?.properties) {
    return null;
  }

  const { optional } = extractFieldsFromSchema(evaluator.requestSchema);
  if (optional.length === 0) {
    return null;
  }

  const className = slugToClassName(evaluator.slug);
  const interfaceName = `${className}Config`;
  const schemaProps = evaluator.requestSchema!.properties!;

  const properties = optional.map((propName) => {
    const propSchema = schemaProps[propName];
    const tsType = openApiTypeToTs(propSchema, allSchemas);
    const docComment = propSchema.description ? `  /** ${propSchema.description} */\n` : "";
    return `${docComment}  ${propName}?: ${tsType};`;
  });

  const interfaceCode = `export interface ${interfaceName} {
${properties.join("\n")}
}`;

  return { interfaceName, interfaceCode };
}

/**
 * Generate mbt-evaluators.ts file content
 */
function generateMbtEvaluatorsFile(
  evaluators: EvaluatorDefinition[],
  allSchemas: Record<string, OpenAPISchema>,
): string {
  const lines: string[] = [
    "// Auto-generated - DO NOT EDIT",
    "// Generated from swagger.json by generate-evaluator-models.ts",
    "//",
    "// Regenerate with: pnpm generate:evaluator-models",
    "",
    "import type { EvaluatorWithConfig } from '../../interfaces/experiment.interface';",
    "import { EVALUATOR_SCHEMAS, isValidEvaluatorSlug, type EvaluatorSlug } from './registry';",
    "",
  ];

  // Generate config interfaces for evaluators that have optional fields
  const configInterfaces: Map<string, string> = new Map();
  for (const evaluator of evaluators) {
    const config = generateConfigInterface(evaluator, allSchemas);
    if (config) {
      configInterfaces.set(evaluator.slug, config.interfaceName);
      lines.push(config.interfaceCode);
      lines.push("");
    }
  }

  // Generate createEvaluator function
  lines.push("/**");
  lines.push(" * Create an EvaluatorWithConfig for the given slug with optional config.");
  lines.push(" *");
  lines.push(" * @param slug - The evaluator slug (e.g., 'pii-detector')");
  lines.push(" * @param options - Optional version and config");
  lines.push(" * @returns EvaluatorWithConfig configured for the specified evaluator");
  lines.push(" *");
  lines.push(" * @example");
  lines.push(" * ```typescript");
  lines.push(" * import { createEvaluator } from '@traceloop/node-server-sdk';");
  lines.push(" *");
  lines.push(" * const evaluator = createEvaluator('pii-detector', {");
  lines.push(" *   config: { probability_threshold: 0.8 }");
  lines.push(" * });");
  lines.push(" * ```");
  lines.push(" */");
  lines.push("export function createEvaluator(");
  lines.push("  slug: EvaluatorSlug,");
  lines.push("  options?: {");
  lines.push("    version?: string;");
  lines.push("    config?: Record<string, unknown>;");
  lines.push("  },");
  lines.push("): EvaluatorWithConfig {");
  lines.push("  if (!isValidEvaluatorSlug(slug)) {");
  lines.push("    const availableSlugs = Object.keys(EVALUATOR_SCHEMAS).join(', ');");
  lines.push("    throw new Error(`Unknown evaluator slug: '${slug}'. Available: ${availableSlugs}`);");
  lines.push("  }");
  lines.push("");
  lines.push("  const schema = EVALUATOR_SCHEMAS[slug];");
  lines.push("  const result: EvaluatorWithConfig = { name: slug };");
  lines.push("");
  lines.push("  if (options?.version) {");
  lines.push("    result.version = options.version;");
  lines.push("  }");
  lines.push("");
  lines.push("  if (options?.config) {");
  lines.push("    result.config = Object.fromEntries(");
  lines.push("      Object.entries(options.config).filter(([, v]) => v !== undefined),");
  lines.push("    );");
  lines.push("  }");
  lines.push("");
  lines.push("  if (schema?.requiredInputFields?.length) {");
  lines.push("    result.requiredInputFields = schema.requiredInputFields;");
  lines.push("  }");
  lines.push("");
  lines.push("  return result;");
  lines.push("}");
  lines.push("");

  // Generate validateEvaluatorInput function
  lines.push("/**");
  lines.push(" * Validate evaluator input against schema.");
  lines.push(" * Returns validation errors or null if valid.");
  lines.push(" *");
  lines.push(" * @param slug - The evaluator slug");
  lines.push(" * @param input - The input to validate");
  lines.push(" * @returns Array of error messages, or null if valid");
  lines.push(" */");
  lines.push("export function validateEvaluatorInput(");
  lines.push("  slug: string,");
  lines.push("  input: Record<string, unknown>,");
  lines.push("): string[] | null {");
  lines.push("  if (!isValidEvaluatorSlug(slug)) {");
  lines.push("    return null;");
  lines.push("  }");
  lines.push("");
  lines.push("  const schema = EVALUATOR_SCHEMAS[slug];");
  lines.push("  const errors: string[] = [];");
  lines.push("");
  lines.push("  for (const field of schema.requiredInputFields) {");
  lines.push("    if (!(field in input) || input[field] === undefined || input[field] === null) {");
  lines.push("      errors.push(`Missing required input field: ${field}`);");
  lines.push("    }");
  lines.push("  }");
  lines.push("");
  lines.push("  return errors.length > 0 ? errors : null;");
  lines.push("}");
  lines.push("");

  // Generate getAvailableEvaluatorSlugs function
  lines.push("/**");
  lines.push(" * Get list of available evaluator slugs.");
  lines.push(" */");
  lines.push("export function getAvailableEvaluatorSlugs(): EvaluatorSlug[] {");
  lines.push("  return Object.keys(EVALUATOR_SCHEMAS) as EvaluatorSlug[];");
  lines.push("}");
  lines.push("");

  // Generate getEvaluatorSchemaInfo function
  lines.push("/**");
  lines.push(" * Get schema information for an evaluator.");
  lines.push(" */");
  lines.push("export function getEvaluatorSchemaInfo(");
  lines.push("  slug: string,");
  lines.push("): { requiredInputFields: string[]; optionalConfigFields: string[] } | undefined {");
  lines.push("  if (!isValidEvaluatorSlug(slug)) {");
  lines.push("    return undefined;");
  lines.push("  }");
  lines.push("  return EVALUATOR_SCHEMAS[slug];");
  lines.push("}");
  lines.push("");

  // Generate EvaluatorMadeByTraceloop class
  lines.push("/**");
  lines.push(" * Factory class for creating type-safe MBT evaluator configurations.");
  lines.push(" *");
  lines.push(" * @example");
  lines.push(" * ```typescript");
  lines.push(" * import { EvaluatorMadeByTraceloop } from '@traceloop/node-server-sdk';");
  lines.push(" *");
  lines.push(" * const evaluators = [");
  lines.push(" *   EvaluatorMadeByTraceloop.piiDetector({ probability_threshold: 0.8 }),");
  lines.push(" *   EvaluatorMadeByTraceloop.faithfulness(),");
  lines.push(" * ];");
  lines.push(" * ```");
  lines.push(" */");
  lines.push("export class EvaluatorMadeByTraceloop {");
  lines.push("  /**");
  lines.push("   * Create an evaluator configuration for any slug.");
  lines.push("   */");
  lines.push("  static create(");
  lines.push("    slug: EvaluatorSlug,");
  lines.push("    options?: { version?: string; config?: Record<string, unknown> },");
  lines.push("  ): EvaluatorWithConfig {");
  lines.push("    return createEvaluator(slug, options);");
  lines.push("  }");
  lines.push("");
  lines.push("  /**");
  lines.push("   * Get list of available evaluator slugs.");
  lines.push("   */");
  lines.push("  static getAvailableSlugs(): EvaluatorSlug[] {");
  lines.push("    return getAvailableEvaluatorSlugs();");
  lines.push("  }");
  lines.push("");
  lines.push("  /**");
  lines.push("   * Check if a slug is a valid MBT evaluator.");
  lines.push("   */");
  lines.push("  static isValidSlug(slug: string): slug is EvaluatorSlug {");
  lines.push("    return isValidEvaluatorSlug(slug);");
  lines.push("  }");

  // Generate static factory methods for each evaluator
  for (const evaluator of evaluators) {
    const methodName = slugToCamelCase(evaluator.slug);
    const configInterface = configInterfaces.get(evaluator.slug);

    lines.push("");
    lines.push("  /**");
    if (evaluator.description) {
      lines.push(`   * ${evaluator.description}`);
    } else {
      lines.push(`   * ${slugToClassName(evaluator.slug)} evaluator.`);
    }

    // Document required fields
    const { required } = evaluator.requestSchema
      ? extractFieldsFromSchema(evaluator.requestSchema)
      : { required: [] };
    if (required.length > 0) {
      lines.push("   *");
      lines.push(`   * Required task output fields: ${required.join(", ")}`);
    }

    lines.push("   */");

    if (configInterface) {
      lines.push(`  static ${methodName}(config?: ${configInterface}): EvaluatorWithConfig {`);
      lines.push(`    return createEvaluator('${evaluator.slug}', { config: config as Record<string, unknown> });`);
    } else {
      lines.push(`  static ${methodName}(): EvaluatorWithConfig {`);
      lines.push(`    return createEvaluator('${evaluator.slug}');`);
    }
    lines.push("  }");
  }

  lines.push("}");

  return lines.join("\n") + "\n";
}

/**
 * Generate index.ts file content
 */
function generateIndexFile(evaluators: EvaluatorDefinition[]): string {
  const lines: string[] = [
    "// Auto-generated - DO NOT EDIT",
    "// Generated from swagger.json by generate-evaluator-models.ts",
    "//",
    "// Regenerate with: pnpm generate:evaluator-models",
    "",
    "// Request types",
    "export * from './request';",
    "",
    "// Response types",
    "export * from './response';",
    "",
    "// Registry and utilities",
    "export {",
    "  EVALUATOR_SLUGS,",
    "  EVALUATOR_SCHEMAS,",
    "  REQUEST_MODELS,",
    "  RESPONSE_MODELS,",
    "  getRequestModel,",
    "  getResponseModel,",
    "  getEvaluatorSchema,",
    "  isValidEvaluatorSlug,",
    "} from './registry';",
    "",
    "export type { EvaluatorSlug, EvaluatorSchema } from './registry';",
    "",
    "// MBT Evaluators factory",
    "export {",
    "  EvaluatorMadeByTraceloop,",
    "  createEvaluator,",
    "  validateEvaluatorInput,",
    "  getAvailableEvaluatorSlugs,",
    "  getEvaluatorSchemaInfo,",
    "} from './mbt-evaluators';",
  ];

  return lines.join("\n") + "\n";
}

/**
 * Main function
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.log("Usage: npx ts-node generate-evaluator-models.ts <swagger_path> <output_dir>");
    console.log("Example: npx ts-node generate-evaluator-models.ts ./swagger.json ./output");
    process.exit(1);
  }

  const [swaggerPath, outputDir] = args;

  // Read and parse swagger file
  if (!fs.existsSync(swaggerPath)) {
    console.error(`Error: Swagger file not found at ${swaggerPath}`);
    process.exit(1);
  }

  console.log(`=== Reading swagger spec from ${swaggerPath} ===`);
  const swaggerContent = fs.readFileSync(swaggerPath, "utf-8");
  const spec: OpenAPISpec = JSON.parse(swaggerContent);

  console.log(`=== Extracting evaluator definitions ===`);
  const evaluators = extractEvaluatorDefinitions(spec);
  console.log(`Found ${evaluators.length} evaluator endpoints`);

  if (evaluators.length === 0) {
    console.log("No evaluator endpoints found matching /v2/evaluators/execute/{slug}");
    console.log("Available paths:");
    for (const pathUrl of Object.keys(spec.paths).slice(0, 20)) {
      console.log(`  ${pathUrl}`);
    }
    process.exit(1);
  }

  for (const evaluator of evaluators) {
    console.log(`  - ${evaluator.slug}`);
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  const allSchemas = getAllSchemas(spec);

  // Generate files
  console.log(`=== Generating TypeScript files ===`);

  const requestContent = generateRequestFile(evaluators, allSchemas);
  fs.writeFileSync(path.join(outputDir, "request.ts"), requestContent);
  console.log(`  - request.ts`);

  const responseContent = generateResponseFile(evaluators, allSchemas);
  fs.writeFileSync(path.join(outputDir, "response.ts"), responseContent);
  console.log(`  - response.ts`);

  const registryContent = generateRegistryFile(evaluators);
  fs.writeFileSync(path.join(outputDir, "registry.ts"), registryContent);
  console.log(`  - registry.ts`);

  const mbtEvaluatorsContent = generateMbtEvaluatorsFile(evaluators, allSchemas);
  fs.writeFileSync(path.join(outputDir, "mbt-evaluators.ts"), mbtEvaluatorsContent);
  console.log(`  - mbt-evaluators.ts`);

  const indexContent = generateIndexFile(evaluators);
  fs.writeFileSync(path.join(outputDir, "index.ts"), indexContent);
  console.log(`  - index.ts`);

  console.log(`=== Generation complete ===`);
  console.log(`Output written to: ${outputDir}`);
}

main();
