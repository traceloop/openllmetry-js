#!/usr/bin/env npx ts-node
/**
 * Generate TypeScript files from OpenAPI/Swagger spec.
 * Extracts models used by v2/evaluators/execute/* endpoints.
 *
 * Note: types.ts is generated separately by openapi-typescript CLI in generate-models.sh
 *
 * Usage:
 *   npx ts-node generate-evaluator-models.ts <swagger_path> <output_dir>
 */

import * as fs from "fs";
import * as path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI, OpenAPIV2, OpenAPIV3 } from "openapi-types";

interface EvaluatorDefinition {
  slug: string;
  requestSchemaName?: string;
  requestSchema?: OpenAPIV3.SchemaObject;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

function slugToClassName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

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

function extractRefName(ref: string): string | undefined {
  const match = ref.match(/(?:#\/definitions\/|#\/components\/schemas\/)(.+)$/);
  return match ? match[1] : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec parsing
// ─────────────────────────────────────────────────────────────────────────────

function extractEvaluatorDefinitions(
  rawSpec: OpenAPI.Document,
  dereferencedSpec: OpenAPI.Document,
): EvaluatorDefinition[] {
  const evaluators: EvaluatorDefinition[] = [];
  const rawPaths = rawSpec.paths || {};
  const derefPaths = dereferencedSpec.paths || {};

  for (const [pathUrl, rawPathItem] of Object.entries(rawPaths)) {
    const match = pathUrl.match(/^\/v2\/evaluators\/execute\/([^/]+)$/);
    if (!match) continue;

    const slug = match[1];
    const rawPathItemObj = rawPathItem as
      | OpenAPIV3.PathItemObject
      | OpenAPIV2.PathItemObject;
    const rawPostOp = rawPathItemObj?.post;
    if (!rawPostOp) continue;

    const derefPathItem = derefPaths[pathUrl] as
      | OpenAPIV3.PathItemObject
      | OpenAPIV2.PathItemObject;
    const derefPostOp = derefPathItem?.post;

    let requestSchemaName: string | undefined;
    let requestSchema: OpenAPIV3.SchemaObject | undefined;

    // OpenAPI 3.0 format
    const rawRequestBody = (rawPostOp as OpenAPIV3.OperationObject)
      .requestBody as OpenAPIV3.RequestBodyObject | undefined;
    if (rawRequestBody?.content?.["application/json"]?.schema) {
      const rawSchema = rawRequestBody.content["application/json"].schema as
        | OpenAPIV3.SchemaObject
        | OpenAPIV3.ReferenceObject;
      if ("$ref" in rawSchema) {
        requestSchemaName = extractRefName(rawSchema.$ref);
      }
    }

    const derefRequestBody = (derefPostOp as OpenAPIV3.OperationObject)
      ?.requestBody as OpenAPIV3.RequestBodyObject | undefined;
    if (derefRequestBody?.content?.["application/json"]?.schema) {
      requestSchema = derefRequestBody.content["application/json"]
        .schema as OpenAPIV3.SchemaObject;
    }

    // Swagger 2.0 fallback
    if (!requestSchemaName && !requestSchema) {
      const rawParams = (rawPostOp as OpenAPIV2.OperationObject).parameters;
      if (rawParams) {
        const rawBodyParam = rawParams.find(
          (p): p is OpenAPIV2.InBodyParameterObject =>
            "in" in p && p.in === "body",
        );
        if (rawBodyParam?.schema && "$ref" in rawBodyParam.schema) {
          requestSchemaName = extractRefName(
            (rawBodyParam.schema as { $ref: string }).$ref,
          );
        }
      }

      const derefParams = (derefPostOp as OpenAPIV2.OperationObject)
        ?.parameters;
      if (derefParams) {
        const derefBodyParam = derefParams.find(
          (p): p is OpenAPIV2.InBodyParameterObject =>
            "in" in p && p.in === "body",
        );
        if (derefBodyParam?.schema) {
          requestSchema =
            derefBodyParam.schema as unknown as OpenAPIV3.SchemaObject;
        }
      }
    }

    evaluators.push({
      slug,
      requestSchemaName,
      description: rawPostOp.description || rawPostOp.summary,
      requestSchema,
    });
  }

  return evaluators;
}

function extractFieldsFromSchema(schema: OpenAPIV3.SchemaObject): {
  requiredInputFields: string[];
  optionalConfigFields: string[];
} {
  const requiredInputFields: string[] = [];
  const optionalConfigFields: string[] = [];

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

  const configSchema = schema.properties?.config as
    | OpenAPIV3.SchemaObject
    | undefined;
  if (configSchema?.properties) {
    optionalConfigFields.push(...Object.keys(configSchema.properties));
  }

  return { requiredInputFields, optionalConfigFields };
}

function hasConfigFields(evaluator: EvaluatorDefinition): boolean {
  const configSchema = evaluator.requestSchema?.properties?.config as
    | OpenAPIV3.SchemaObject
    | undefined;
  return !!(
    configSchema?.properties && Object.keys(configSchema.properties).length > 0
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File generators
// ─────────────────────────────────────────────────────────────────────────────

function generateRegistryFile(evaluators: EvaluatorDefinition[]): string {
  const slugs = evaluators.map((e) => `'${e.slug}'`).join(" | ") || "string";
  const slugsArray = evaluators.map((e) => `  '${e.slug}',`).join("\n");

  const schemas = evaluators
    .map((e) => {
      const { requiredInputFields, optionalConfigFields } = e.requestSchema
        ? extractFieldsFromSchema(e.requestSchema)
        : { requiredInputFields: [], optionalConfigFields: [] };

      const reqFields = requiredInputFields.map((f) => `'${f}'`).join(", ");
      const optFields = optionalConfigFields.map((f) => `'${f}'`).join(", ");
      const desc = e.description
        ? `\n    description: ${JSON.stringify(e.description)},`
        : "";

      return `  '${e.slug}': {
    slug: '${e.slug}',
    requiredInputFields: [${reqFields}],
    optionalConfigFields: [${optFields}],${desc}
  },`;
    })
    .join("\n");

  return `// Auto-generated - DO NOT EDIT
// Regenerate with: pnpm generate:evaluator-models

export interface EvaluatorSchema {
  slug: string;
  requiredInputFields: string[];
  optionalConfigFields: string[];
  description?: string;
}

export type EvaluatorSlug = ${slugs};

export const EVALUATOR_SLUGS: EvaluatorSlug[] = [
${slugsArray}
];

export const EVALUATOR_SCHEMAS: Record<EvaluatorSlug, EvaluatorSchema> = {
${schemas}
};

export function getEvaluatorSchema<S extends EvaluatorSlug>(slug: S): EvaluatorSchema {
  return EVALUATOR_SCHEMAS[slug];
}

export function isValidEvaluatorSlug(slug: string): slug is EvaluatorSlug {
  return slug in EVALUATOR_SCHEMAS;
}
`;
}

function generateMbtEvaluatorsFile(
  evaluators: EvaluatorDefinition[],
  isSwagger2: boolean,
): string {
  // Generate type aliases for configs
  const typeAliases = evaluators
    .filter((e) => hasConfigFields(e) && e.requestSchemaName)
    .map((e) => {
      const typeName = `${slugToClassName(e.slug)}Config`;
      const typePath = isSwagger2
        ? `definitions['${e.requestSchemaName}']['config']`
        : `components['schemas']['${e.requestSchemaName}']['config']`;
      return `export type ${typeName} = ${typePath};`;
    })
    .join("\n");

  // Generate factory methods for the class
  const factoryMethods = evaluators
    .map((e) => {
      const methodName = slugToCamelCase(e.slug);
      const className = slugToClassName(e.slug);
      const hasConfig = hasConfigFields(e) && e.requestSchemaName;
      const configType = hasConfig ? `${className}Config` : null;

      const { requiredInputFields } = e.requestSchema
        ? extractFieldsFromSchema(e.requestSchema)
        : { requiredInputFields: [] };

      const desc = e.description || `${className} evaluator.`;
      const reqFieldsDoc =
        requiredInputFields.length > 0
          ? `\n   * Required task output fields: ${requiredInputFields.join(", ")}`
          : "";

      if (configType) {
        return `
  /**
   * ${desc}${reqFieldsDoc}
   */
  static ${methodName}(config?: ${configType}): EvaluatorWithConfig {
    return createEvaluator('${e.slug}', { config: config as Record<string, unknown> });
  }`;
      } else {
        return `
  /**
   * ${desc}${reqFieldsDoc}
   */
  static ${methodName}(): EvaluatorWithConfig {
    return createEvaluator('${e.slug}');
  }`;
      }
    })
    .join("\n");

  return `// Auto-generated - DO NOT EDIT
// Regenerate with: pnpm generate:evaluator-models

import type { EvaluatorWithConfig } from '../../interfaces/experiment.interface';
import type { ${isSwagger2 ? "definitions" : "components"} } from './types';
import { EVALUATOR_SLUGS, EVALUATOR_SCHEMAS, isValidEvaluatorSlug, type EvaluatorSlug, type EvaluatorSchema } from './registry';

// Config type aliases from generated OpenAPI types
${typeAliases}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an evaluator configuration object.
 */
export function createEvaluator(
  slug: EvaluatorSlug,
  options?: { version?: string; config?: Record<string, unknown> }
): EvaluatorWithConfig {
  return {
    name: slug,
    version: options?.version,
    config: options?.config,
  };
}

/**
 * Validate that required input fields are present in task output.
 */
export function validateEvaluatorInput(
  slug: EvaluatorSlug,
  taskOutput: Record<string, unknown>
): { valid: boolean; missingFields: string[] } {
  const schema = EVALUATOR_SCHEMAS[slug];
  if (!schema) {
    return { valid: false, missingFields: [] };
  }

  const missingFields = schema.requiredInputFields.filter(
    (field) => !(field in taskOutput) || taskOutput[field] === undefined
  );

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Get all available evaluator slugs.
 */
export function getAvailableEvaluatorSlugs(): EvaluatorSlug[] {
  return [...EVALUATOR_SLUGS];
}

/**
 * Get schema information for an evaluator.
 */
export function getEvaluatorSchemaInfo(slug: EvaluatorSlug): EvaluatorSchema | undefined {
  return EVALUATOR_SCHEMAS[slug];
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory class for creating type-safe MBT evaluator configurations.
 *
 * @example
 * \`\`\`typescript
 * import { EvaluatorMadeByTraceloop } from '@traceloop/node-server-sdk';
 *
 * const evaluators = [
 *   EvaluatorMadeByTraceloop.piiDetector({ probability_threshold: 0.8 }),
 *   EvaluatorMadeByTraceloop.faithfulness(),
 * ];
 * \`\`\`
 */
export class EvaluatorMadeByTraceloop {
  static create(slug: EvaluatorSlug, options?: { version?: string; config?: Record<string, unknown> }): EvaluatorWithConfig {
    return createEvaluator(slug, options);
  }

  static getAvailableSlugs(): EvaluatorSlug[] {
    return getAvailableEvaluatorSlugs();
  }

  static isValidSlug(slug: string): slug is EvaluatorSlug {
    return isValidEvaluatorSlug(slug);
  }
${factoryMethods}
}
`;
}

function generateIndexFile(): string {
  return `// Auto-generated - DO NOT EDIT
// Regenerate with: pnpm generate:evaluator-models

export {
  EVALUATOR_SLUGS,
  EVALUATOR_SCHEMAS,
  getEvaluatorSchema,
  isValidEvaluatorSlug,
} from './registry';

export type { EvaluatorSlug, EvaluatorSchema } from './registry';

export {
  EvaluatorMadeByTraceloop,
  createEvaluator,
  validateEvaluatorInput,
  getAvailableEvaluatorSlugs,
  getEvaluatorSchemaInfo,
} from './mbt-evaluators';

// Re-export config types
export type * from './mbt-evaluators';
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtered spec generation for openapi-typescript
// ─────────────────────────────────────────────────────────────────────────────

function collectReferencedSchemas(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
  allSchemas: Record<string, OpenAPIV3.SchemaObject>,
  collected: Set<string>,
): void {
  if (!schema) return;

  if ("$ref" in schema) {
    const refName = extractRefName(schema.$ref);
    if (refName && !collected.has(refName) && allSchemas[refName]) {
      collected.add(refName);
      collectReferencedSchemas(allSchemas[refName], allSchemas, collected);
    }
    return;
  }

  // Handle object properties
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      collectReferencedSchemas(
        prop as OpenAPIV3.SchemaObject,
        allSchemas,
        collected,
      );
    }
  }

  // Handle additionalProperties
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    collectReferencedSchemas(
      schema.additionalProperties as OpenAPIV3.SchemaObject,
      allSchemas,
      collected,
    );
  }

  // Handle array items
  if ("items" in schema && schema.items) {
    collectReferencedSchemas(
      schema.items as OpenAPIV3.SchemaObject,
      allSchemas,
      collected,
    );
  }

  // Handle allOf, oneOf, anyOf
  for (const key of ["allOf", "oneOf", "anyOf"] as const) {
    if (schema[key]) {
      for (const subSchema of schema[key]!) {
        collectReferencedSchemas(
          subSchema as OpenAPIV3.SchemaObject,
          allSchemas,
          collected,
        );
      }
    }
  }
}

function generateFilteredSpec(
  rawSpec: OpenAPI.Document,
  evaluators: EvaluatorDefinition[],
): object {
  const isOpenAPI3 = "openapi" in rawSpec;
  const allSchemas = isOpenAPI3
    ? (rawSpec as OpenAPIV3.Document).components?.schemas || {}
    : (rawSpec as OpenAPIV2.Document).definitions || {};

  // Collect all schema names referenced by evaluators
  const neededSchemas = new Set<string>();

  for (const evaluator of evaluators) {
    if (evaluator.requestSchemaName) {
      neededSchemas.add(evaluator.requestSchemaName);
      // Recursively collect referenced schemas
      const schema = allSchemas[evaluator.requestSchemaName];
      if (schema) {
        collectReferencedSchemas(
          schema as OpenAPIV3.SchemaObject,
          allSchemas as Record<string, OpenAPIV3.SchemaObject>,
          neededSchemas,
        );
      }
    }
  }

  // Build filtered schemas
  const filteredSchemas: Record<string, unknown> = {};
  for (const name of neededSchemas) {
    if (allSchemas[name]) {
      filteredSchemas[name] = allSchemas[name];
    }
  }

  // Create minimal OpenAPI 3.0 spec with only evaluator schemas
  return {
    openapi: "3.0.0",
    info: {
      title: "Traceloop Evaluators API (filtered)",
      version: "1.0.0",
    },
    paths: {},
    components: {
      schemas: filteredSchemas,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.log(
      "Usage: npx ts-node generate-evaluator-models.ts <swagger_path> <output_dir>",
    );
    process.exit(1);
  }

  const [swaggerPath, outputDir] = args;

  if (!fs.existsSync(swaggerPath)) {
    console.error(`Error: Swagger file not found at ${swaggerPath}`);
    process.exit(1);
  }

  console.log(`=== Reading swagger spec from ${swaggerPath} ===`);

  const rawSpec = await SwaggerParser.parse(swaggerPath);
  const dereferencedSpec = await SwaggerParser.dereference(swaggerPath);

  const isSwagger2 =
    "swagger" in rawSpec && (rawSpec as OpenAPIV2.Document).swagger === "2.0";
  console.log(`Spec version: ${isSwagger2 ? "Swagger 2.0" : "OpenAPI 3.x"}`);

  console.log(`=== Extracting evaluator definitions ===`);
  const evaluators = extractEvaluatorDefinitions(rawSpec, dereferencedSpec);
  console.log(`Found ${evaluators.length} evaluator endpoints`);

  if (evaluators.length === 0) {
    console.log(
      "No evaluator endpoints found matching /v2/evaluators/execute/{slug}",
    );
    process.exit(1);
  }

  evaluators.forEach((e) => console.log(`  - ${e.slug}`));

  fs.mkdirSync(outputDir, { recursive: true });

  // Generate filtered OpenAPI spec for openapi-typescript (only evaluator schemas)
  console.log(`=== Generating filtered OpenAPI spec ===`);
  const filteredSpec = generateFilteredSpec(rawSpec, evaluators);
  const filteredSpecPath = path.join(outputDir, "openapi-filtered.json");
  fs.writeFileSync(filteredSpecPath, JSON.stringify(filteredSpec, null, 2));
  const schemaCount = Object.keys(
    (filteredSpec as { components: { schemas: object } }).components.schemas,
  ).length;
  console.log(`  - openapi-filtered.json (${schemaCount} schemas)`);

  console.log(`=== Generating TypeScript files ===`);

  fs.writeFileSync(
    path.join(outputDir, "registry.ts"),
    generateRegistryFile(evaluators),
  );
  console.log(`  - registry.ts`);

  fs.writeFileSync(
    path.join(outputDir, "mbt-evaluators.ts"),
    generateMbtEvaluatorsFile(evaluators, isSwagger2),
  );
  console.log(`  - mbt-evaluators.ts`);

  fs.writeFileSync(path.join(outputDir, "index.ts"), generateIndexFile());
  console.log(`  - index.ts`);

  console.log(`=== Generation complete ===`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
