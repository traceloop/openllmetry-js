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

# Run the TypeScript generation script
npx ts-node --project "${SCRIPT_DIR}/codegen/tsconfig.json" "${CODEGEN_SCRIPT}" "${SWAGGER_PATH}" "${OUTPUT_DIR}"

echo ""
echo "Generated files:"
ls -la "${OUTPUT_DIR}"
