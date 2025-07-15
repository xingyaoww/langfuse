/**
 * Session Query Optimizer
 *
 * Utilities to optimize session-based queries for better performance.
 * Session queries are expensive because session_id is not in the primary key,
 * so these utilities help minimize query cost.
 */

import { logger } from "../logger";

export interface SessionQueryOptions {
  sessionId: string;
  projectId: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  limit?: number;
  fields?: string[];
}

export interface OptimizedSessionQuery extends SessionQueryOptions {
  fromTimestamp: Date;
  limit: number;
  fields: string[];
  optimizations: string[];
}

/**
 * Optimizes session query parameters for better performance
 */
export function optimizeSessionQuery(
  options: SessionQueryOptions,
): OptimizedSessionQuery {
  const optimizations: string[] = [];

  // Ensure time bounds are set (critical for performance)
  let fromTimestamp = options.fromTimestamp;
  if (!fromTimestamp) {
    // Default to last 7 days if no time bound specified
    fromTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    optimizations.push("added_default_time_bound_7d");

    logger.warn(
      "Session query without time bounds - adding default 7-day window",
      {
        sessionId: options.sessionId,
        projectId: options.projectId,
        optimization: "added_default_time_bound",
      },
    );
  }

  // Optimize field selection (reduce data transfer)
  let fields = options.fields;
  if (!fields || fields.length === 0) {
    fields = ["core"]; // Only core fields by default
    optimizations.push("reduced_fields_to_core");
  } else if (fields.includes("all")) {
    // If "all" is requested, warn about performance impact
    logger.warn(
      "Session query requesting all fields - consider reducing field selection",
      {
        sessionId: options.sessionId,
        projectId: options.projectId,
        performance_impact: "high",
      },
    );
  }

  // Optimize limit (prevent large result sets)
  let limit = options.limit;
  if (!limit || limit > 100) {
    limit = Math.min(limit || 50, 100);
    optimizations.push("capped_limit_100");

    if (options.limit && options.limit > 100) {
      logger.info("Session query limit capped for performance", {
        sessionId: options.sessionId,
        projectId: options.projectId,
        originalLimit: options.limit,
        cappedLimit: limit,
      });
    }
  }

  return {
    ...options,
    fromTimestamp,
    limit,
    fields,
    optimizations,
  };
}

/**
 * Validates session query for performance best practices
 */
export function validateSessionQuery(options: SessionQueryOptions): {
  isOptimal: boolean;
  warnings: string[];
  recommendations: string[];
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check for time bounds
  if (!options.fromTimestamp) {
    warnings.push("No time bounds specified");
    recommendations.push(
      "Add fromTimestamp parameter to improve query performance by 50-70%",
    );
  } else {
    const daysDiff =
      (Date.now() - options.fromTimestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) {
      warnings.push("Time range exceeds 30 days");
      recommendations.push(
        "Consider reducing time range to improve performance",
      );
    }
  }

  // Check field selection
  if (!options.fields || options.fields.includes("all")) {
    warnings.push("Requesting all fields");
    recommendations.push(
      "Specify only needed fields (e.g., ['core']) to reduce data transfer",
    );
  }

  // Check limit
  if (!options.limit || options.limit > 100) {
    warnings.push("Large or unlimited result set");
    recommendations.push(
      "Use pagination with limit <= 100 for better performance",
    );
  }

  const isOptimal = warnings.length === 0;

  return {
    isOptimal,
    warnings,
    recommendations,
  };
}

/**
 * Estimates query performance impact based on parameters
 */
export function estimateSessionQueryPerformance(options: SessionQueryOptions): {
  estimatedDuration: "fast" | "medium" | "slow" | "very_slow";
  factors: string[];
  score: number; // 0-100, higher is better
} {
  let score = 100;
  const factors: string[] = [];

  // Time bounds impact (most critical)
  if (!options.fromTimestamp) {
    score -= 50;
    factors.push("no_time_bounds (-50)");
  } else {
    const daysDiff =
      (Date.now() - options.fromTimestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) {
      score -= 20;
      factors.push("large_time_range (-20)");
    } else if (daysDiff > 7) {
      score -= 10;
      factors.push("medium_time_range (-10)");
    }
  }

  // Field selection impact
  if (!options.fields || options.fields.includes("all")) {
    score -= 20;
    factors.push("all_fields (-20)");
  } else if (
    options.fields.includes("observations") ||
    options.fields.includes("scores")
  ) {
    score -= 10;
    factors.push("complex_fields (-10)");
  }

  // Limit impact
  if (!options.limit || options.limit > 100) {
    score -= 15;
    factors.push("large_limit (-15)");
  }

  let estimatedDuration: "fast" | "medium" | "slow" | "very_slow";
  if (score >= 80) estimatedDuration = "fast";
  else if (score >= 60) estimatedDuration = "medium";
  else if (score >= 40) estimatedDuration = "slow";
  else estimatedDuration = "very_slow";

  return {
    estimatedDuration,
    factors,
    score,
  };
}
