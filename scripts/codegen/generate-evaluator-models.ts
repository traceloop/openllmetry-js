#!/usr/bin/env npx ts-node
/**
 * Generate TypeScript interfaces from OpenAPI/Swagger spec.
 * Extracts models used by v2/evaluators/execute/* endpoints.
 *
 * Uses:
 * - @apidevtools/swagger-parser for parsing and $ref resolution
 * - openapi-typescript for generating TypeScript types from schemas
 *
 * Usage:
 *   npx ts-node generate-evaluator-models.ts <swagger_path> <output_dir>
 *
 * Example:
 *   npx ts-node generate-evaluator-models.ts ./swagger.json ../packages/traceloop-sdk/src/lib/evaluators-generated
 */

import * as fs from "fs";
import * as path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import openapiTS, { astToString } from "openapi-typescript";
import type { OpenAPI, OpenAPIV2, OpenAPIV3 } from "openapi-types";

// Internal types for tracking evaluator definitions
interface EvaluatorDefinition {
  slug: string;
  requestSchema?: OpenAPIV3.SchemaObject;
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
 * Convert slug like "pii-detector" to camelCase method name like "piiDetector"
 */
function slugToCamelCase(slug: string): string {
  return slug
    .split("-")
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}

/**
 * Use openapi-typescript to convert a schema to TypeScript type string.
 * Creates a minimal OpenAPI spec wrapper and extracts the generated type.
 */
async function schemaToTsType(
  schema: OpenAPIV3.SchemaObject,
): Promise<string> {
  // Wrap schema in a minimal OpenAPI 3.0 spec
  // Cast to unknown to avoid type incompatibility between openapi-types and openapi-typescript
  const miniSpec = {
    openapi: "3.0.0",
    info: { title: "temp", version: "1.0.0" },
    paths: {},
    components: {
      schemas: {
        TempType: schema as unknown,
      },
    },
  };

  const ast = await openapiTS(miniSpec as Parameters<typeof openapiTS>[0]);
  const output = astToString(ast);

  // Extract just the TempType definition
  const match = output.match(/TempType:\s*([^;]+);/);
  if (match) {
    return match[1].trim();
  }

  // Fallback for simple types
  return "unknown";
}

/**
 * Extract evaluator definitions from the dereferenced OpenAPI spec.
 * Supports both Swagger 2.0 (parameters with in:body) and OpenAPI 3.0 (requestBody).
 */
function extractEvaluatorDefinitions(
  spec: OpenAPI.Document,
): EvaluatorDefinition[] {
  const evaluators: EvaluatorDefinition[] = [];

  const paths = spec.paths || {};
  for (const [pathUrl, pathItem] of Object.entries(paths)) {
    // Match /v2/evaluators/execute/{slug} pattern
    const match = pathUrl.match(/^\/v2\/evaluators\/execute\/([^/]+)$/);
    if (!match) continue;

    // Handle both OpenAPI 3.0 and Swagger 2.0 path items
    const pathItemObj = pathItem as
      | OpenAPIV3.PathItemObject
      | OpenAPIV2.PathItemObject;
    const postOp = pathItemObj?.post;
    if (!postOp) continue;

    const slug = match[1];
    let requestSchema: OpenAPIV3.SchemaObject | undefined;

    // Try OpenAPI 3.0 format first (requestBody)
    const requestBody = (postOp as OpenAPIV3.OperationObject).requestBody as
      | OpenAPIV3.RequestBodyObject
      | undefined;
    if (requestBody?.content?.["application/json"]?.schema) {
      requestSchema = requestBody.content["application/json"]
        .schema as OpenAPIV3.SchemaObject;
    }

    // Fallback to Swagger 2.0 format (parameters with in: body)
    if (!requestSchema) {
      const parameters = (postOp as OpenAPIV2.OperationObject).parameters;
      if (parameters) {
        const bodyParam = parameters.find(
          (p): p is OpenAPIV2.InBodyParameterObject =>
            "in" in p && p.in === "body",
        );
        if (bodyParam?.schema) {
          requestSchema = bodyParam.schema as unknown as OpenAPIV3.SchemaObject;
        }
      }
    }

    evaluators.push({
      slug,
      description: postOp.description || postOp.summary,
      requestSchema,
    });
  }

  return evaluators;
}

/**
 * Extract required input fields and optional config fields from a schema.
 * The swagger structure has nested 'input' and 'config' properties.
 * Since we use dereference(), all $refs are already resolved.
 */
function extractFieldsFromSchema(schema: OpenAPIV3.SchemaObject): {
  requiredInputFields: string[];
  optionalConfigFields: string[];
} {
  const requiredInputFields: string[] = [];
  const optionalConfigFields: string[] = [];

  // Input properties (already dereferenced)
  const inputSchema = schema.properties?.input as
    | OpenAPIV3.SchemaObject
    | undefined;
  if (inputSchema?.properties) {
    const requiredProps = inputSchema.required || [];
    for (const propName of Object.keys(inputSchema.properties)) {
      if (requiredProps.includes(propName)) {
        requiredInputFields.push(propName);
      }
    }
  }

  // Config properties (already dereferenced)
  const configSchema = schema.properties?.config as
    | OpenAPIV3.SchemaObject
    | undefined;
  if (configSchema?.properties) {
    optionalConfigFields.push(...Object.keys(configSchema.properties));
  }

  return { requiredInputFields, optionalConfigFields };
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

  // Generate EVALUATOR_SCHEMAS
  lines.push(
    "export const EVALUATOR_SCHEMAS: Record<EvaluatorSlug, EvaluatorSchema> = {",
  );
  for (const evaluator of evaluators) {
    const { requiredInputFields, optionalConfigFields } =
      evaluator.requestSchema
        ? extractFieldsFromSchema(evaluator.requestSchema)
        : { requiredInputFields: [], optionalConfigFields: [] };

    lines.push(`  '${evaluator.slug}': {`);
    lines.push(`    slug: '${evaluator.slug}',`);
    lines.push(
      `    requiredInputFields: [${requiredInputFields.map((f: string) => `'${f}'`).join(", ")}],`,
    );
    lines.push(
      `    optionalConfigFields: [${optionalConfigFields.map((f: string) => `'${f}'`).join(", ")}],`,
    );
    if (evaluator.description) {
      lines.push(`    description: ${JSON.stringify(evaluator.description)},`);
    }
    lines.push(`  },`);
  }
  lines.push("};");
  lines.push("");

  // Generate helper functions
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
  lines.push(
    "export function isValidEvaluatorSlug(slug: string): slug is EvaluatorSlug {",
  );
  lines.push("  return slug in EVALUATOR_SCHEMAS;");
  lines.push("}");

  return lines.join("\n") + "\n";
}

/**
 * Generate config interface for an evaluator.
 * Extracts fields from the nested 'config' property in the request schema.
 * Uses openapi-typescript to convert schema types to TypeScript.
 */
async function generateConfigInterface(
  evaluator: EvaluatorDefinition,
): Promise<{ interfaceName: string; interfaceCode: string } | null> {
  const configSchema = evaluator.requestSchema?.properties?.config as
    | OpenAPIV3.SchemaObject
    | undefined;

  if (
    !configSchema?.properties ||
    Object.keys(configSchema.properties).length === 0
  ) {
    return null;
  }

  const className = slugToClassName(evaluator.slug);
  const interfaceName = `${className}Config`;

  const properties = await Promise.all(
    Object.entries(configSchema.properties).map(
      async ([propName, propSchema]) => {
        const schema = propSchema as OpenAPIV3.SchemaObject;
        const tsType = await schemaToTsType(schema);
        const isRequired = configSchema.required?.includes(propName);
        const docComment = schema.description
          ? `  /** ${schema.description} */\n`
          : "";
        return `${docComment}  ${propName}${isRequired ? "" : "?"}: ${tsType};`;
      },
    ),
  );

  const interfaceCode = `export interface ${interfaceName} {
${properties.join("\n")}
}`;

  return { interfaceName, interfaceCode };
}

/**
 * Generate mbt-evaluators.ts file content
 */
async function generateMbtEvaluatorsFile(
  evaluators: EvaluatorDefinition[],
): Promise<string> {
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
    const config = await generateConfigInterface(evaluator);
    if (config) {
      configInterfaces.set(evaluator.slug, config.interfaceName);
      lines.push(config.interfaceCode);
      lines.push("");
    }
  }

  // Generate createEvaluator function
  lines.push("/**");
  lines.push(
    " * Create an EvaluatorWithConfig for the given slug with optional config.",
  );
  lines.push(" *");
  lines.push(" * @param slug - The evaluator slug (e.g., 'pii-detector')");
  lines.push(" * @param options - Optional version and config");
  lines.push(
    " * @returns EvaluatorWithConfig configured for the specified evaluator",
  );
  lines.push(" *");
  lines.push(" * @example");
  lines.push(" * ```typescript");
  lines.push(
    " * import { createEvaluator } from '@traceloop/node-server-sdk';",
  );
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
  lines.push(
    "    const availableSlugs = Object.keys(EVALUATOR_SCHEMAS).join(', ');",
  );
  lines.push(
    "    throw new Error(`Unknown evaluator slug: '${slug}'. Available: ${availableSlugs}`);",
  );
  lines.push("  }");
  lines.push("");
  lines.push("  const schema = EVALUATOR_SCHEMAS[slug];");
  lines.push("  const result: EvaluatorWithConfig = {");
  lines.push("    name: slug,");
  lines.push("    version: options?.version || 'latest',");
  lines.push("  };");
  lines.push("");
  lines.push("  if (options?.config) {");
  lines.push("    result.config = Object.fromEntries(");
  lines.push(
    "      Object.entries(options.config).filter(([, v]) => v !== undefined),",
  );
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
  lines.push(
    "    if (!(field in input) || input[field] === undefined || input[field] === null) {",
  );
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
  lines.push(
    "): { requiredInputFields: string[]; optionalConfigFields: string[] } | undefined {",
  );
  lines.push("  if (!isValidEvaluatorSlug(slug)) {");
  lines.push("    return undefined;");
  lines.push("  }");
  lines.push("  return EVALUATOR_SCHEMAS[slug];");
  lines.push("}");
  lines.push("");

  // Generate EvaluatorMadeByTraceloop class
  lines.push("/**");
  lines.push(
    " * Factory class for creating type-safe MBT evaluator configurations.",
  );
  lines.push(" *");
  lines.push(" * @example");
  lines.push(" * ```typescript");
  lines.push(
    " * import { EvaluatorMadeByTraceloop } from '@traceloop/node-server-sdk';",
  );
  lines.push(" *");
  lines.push(" * const evaluators = [");
  lines.push(
    " *   EvaluatorMadeByTraceloop.piiDetector({ probability_threshold: 0.8 }),",
  );
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
  lines.push(
    "    options?: { version?: string; config?: Record<string, unknown> },",
  );
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

    // Document required task output fields
    const { requiredInputFields } = evaluator.requestSchema
      ? extractFieldsFromSchema(evaluator.requestSchema)
      : { requiredInputFields: [] };
    if (requiredInputFields.length > 0) {
      lines.push("   *");
      lines.push(
        `   * Required task output fields: ${requiredInputFields.join(", ")}`,
      );
    }

    lines.push("   */");

    if (configInterface) {
      lines.push(
        `  static ${methodName}(config?: ${configInterface}): EvaluatorWithConfig {`,
      );
      lines.push(
        `    return createEvaluator('${evaluator.slug}', { config: config as unknown as Record<string, unknown> });`,
      );
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
function generateIndexFile(): string {
  const lines: string[] = [
    "// Auto-generated - DO NOT EDIT",
    "// Generated from swagger.json by generate-evaluator-models.ts",
    "//",
    "// Regenerate with: pnpm generate:evaluator-models",
    "",
    "// Registry and utilities",
    "export {",
    "  EVALUATOR_SLUGS,",
    "  EVALUATOR_SCHEMAS,",
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
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.log(
      "Usage: npx ts-node generate-evaluator-models.ts <swagger_path> <output_dir>",
    );
    console.log(
      "Example: npx ts-node generate-evaluator-models.ts ./swagger.json ./output",
    );
    process.exit(1);
  }

  const [swaggerPath, outputDir] = args;

  // Check if file exists
  if (!fs.existsSync(swaggerPath)) {
    console.error(`Error: Swagger file not found at ${swaggerPath}`);
    process.exit(1);
  }

  console.log(`=== Reading swagger spec from ${swaggerPath} ===`);

  // Use swagger-parser to parse and dereference all $refs
  const spec = await SwaggerParser.dereference(swaggerPath);

  console.log(`=== Extracting evaluator definitions ===`);
  const evaluators = extractEvaluatorDefinitions(spec);
  console.log(`Found ${evaluators.length} evaluator endpoints`);

  if (evaluators.length === 0) {
    console.log(
      "No evaluator endpoints found matching /v2/evaluators/execute/{slug}",
    );
    console.log("Available paths:");
    const paths = spec.paths || {};
    for (const pathUrl of Object.keys(paths).slice(0, 20)) {
      console.log(`  ${pathUrl}`);
    }
    process.exit(1);
  }

  for (const evaluator of evaluators) {
    console.log(`  - ${evaluator.slug}`);
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate files
  console.log(`=== Generating TypeScript files ===`);

  const registryContent = generateRegistryFile(evaluators);
  fs.writeFileSync(path.join(outputDir, "registry.ts"), registryContent);
  console.log(`  - registry.ts`);

  const mbtEvaluatorsContent = await generateMbtEvaluatorsFile(evaluators);
  fs.writeFileSync(
    path.join(outputDir, "mbt-evaluators.ts"),
    mbtEvaluatorsContent,
  );
  console.log(`  - mbt-evaluators.ts`);

  const indexContent = generateIndexFile();
  fs.writeFileSync(path.join(outputDir, "index.ts"), indexContent);
  console.log(`  - index.ts`);

  console.log(`=== Generation complete ===`);
  console.log(`Output written to: ${outputDir}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
