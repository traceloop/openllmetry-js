import { context, diag, trace } from "@opentelemetry/api";

/**
 * Reports a custom metric to the current active span.
 *
 * This function allows you to add a custom metric to the current span in the trace.
 * If there is no active span, a warning will be logged.
 *
 * @param {string} metricName - The name of the custom metric.
 * @param {number} metricValue - The numeric value of the custom metric.
 *
 * @example
 * reportCustomMetric('processing_time', 150);
 */
export const reportCustomMetric = (metricName: string, metricValue: number) => {
  const currentContext = context.active();
  const currentSpan = trace.getSpan(currentContext);

  if (currentSpan) {
    currentSpan.setAttribute(
      `traceloop.custom_metric.${metricName}`,
      metricValue,
    );
  } else {
    diag.warn(`No active span found to report custom metric: ${metricName}`);
  }
};
