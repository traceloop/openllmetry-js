#!/bin/bash
set -euo pipefail

# Generate TypeScript models from OpenAPI/Swagger spec
# Extracts models used by v2/evaluators/execute/* endpoints
#
# Usage: ./scripts/generate-models.sh /path/to/swagger.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/packages/traceloop-sdk/src/lib/generated/evaluators"
CODEGEN_SCRIPT="${SCRIPT_DIR}/codegen/generate-evaluator-models.ts"

# Default swagger path or use argument
SWAGGER_PATH="${1:-${SCRIPT_DIR}/codegen/swagger.json}"

if [ ! -f "${SWAGGER_PATH}" ]; then
    echo "Error: Swagger file not found at ${SWAGGER_PATH}"
    echo ""
    echo "Usage: $0 <path-to-swagger.json>"
    echo "Example: $0 /path/to/api-service/docs/swagger.json"
    exit 1
fi

echo "=== Generating evaluator models from ${SWAGGER_PATH} ==="

# Change to root directory
cd "${ROOT_DIR}"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Check if it's Swagger 2.0 and convert to OpenAPI 3.0 if needed
OPENAPI_PATH="${SWAGGER_PATH}"
TEMP_OPENAPI=""
if grep -q '"swagger".*"2\.' "${SWAGGER_PATH}"; then
    echo "=== Converting Swagger 2.0 to OpenAPI 3.0 ==="
    TEMP_OPENAPI=$(mktemp)
    OPENAPI_PATH="${TEMP_OPENAPI}"
    npx swagger2openapi --patch --warnOnly "${SWAGGER_PATH}" -o "${OPENAPI_PATH}"
fi

# Step 1: Run the TypeScript generation script (generates filtered spec + registry + mbt-evaluators)
echo "=== Generating registry and evaluator files ==="
npx ts-node --project "${SCRIPT_DIR}/codegen/tsconfig.json" "${CODEGEN_SCRIPT}" "${OPENAPI_PATH}" "${OUTPUT_DIR}"

# Step 2: Generate types.ts from the filtered spec (only evaluator schemas)
echo "=== Generating types.ts with openapi-typescript ==="
npx openapi-typescript "${OUTPUT_DIR}/openapi-filtered.json" -o "${OUTPUT_DIR}/types.ts"

# Remove the intermediate filtered spec file
rm -f "${OUTPUT_DIR}/openapi-filtered.json"

# Cleanup temp file
if [ -n "${TEMP_OPENAPI}" ] && [ -f "${TEMP_OPENAPI}" ]; then
    rm "${TEMP_OPENAPI}"
fi

echo ""
echo "Generated files:"
ls -la "${OUTPUT_DIR}"
