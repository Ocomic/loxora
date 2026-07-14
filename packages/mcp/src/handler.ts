import {
  CONTEXT_ESTIMATOR_ID,
  type ContextPackageService,
  type ContextPackage,
  type EvidenceReferenceId,
  type NodeId,
  type ProjectId,
  type Scope,
} from "@loxora/core";
import * as z from "zod/v4";

export const contextToolInputSchema = {
  projectId: z.string().min(1),
  focusNodeIds: z.array(z.string().min(1)).min(1),
  temporalViews: z.array(z.enum(["Current", "History"])).optional(),
  includeRelatedProjects: z.boolean().optional(),
  relationshipTypes: z.array(z.literal("DependsOn")).optional(),
  maxDependencyDepth: z.number().int().min(0).max(1).optional(),
  taskLabel: z.string().min(1),
  estimatedTokenBudget: z.number().int().positive(),
  explicitEvidenceReferenceIds: z.array(z.string().min(1)).optional(),
  estimatorId: z.literal(CONTEXT_ESTIMATOR_ID).optional(),
  scope: z.string().min(1).optional(),
};

const inputObject = z.object(contextToolInputSchema).strict();
export type ContextToolInput = z.infer<typeof inputObject>;

export interface ContextToolHandler {
  handle(input: unknown): Promise<ContextPackage>;
}

export function createContextToolHandler(
  service: ContextPackageService,
  allowedProjectIds: readonly ProjectId[],
): ContextToolHandler {
  const allowed = Object.freeze([...new Set(allowedProjectIds)].sort());
  return Object.freeze({
    async handle(input: unknown): Promise<ContextPackage> {
      const parsed = inputObject.parse(input);
      if (!allowed.includes(parsed.projectId as ProjectId)) {
        throw new Error("Requested Project is not allowed");
      }
      return service.buildContextPackage({
        projectId: parsed.projectId as ProjectId,
        focusNodeIds: parsed.focusNodeIds as NodeId[],
        ...(parsed.temporalViews ? { temporalViews: parsed.temporalViews } : {}),
        includeRelatedProjects: parsed.includeRelatedProjects ?? false,
        relationshipTypes: parsed.relationshipTypes ?? [],
        maxDependencyDepth: (parsed.maxDependencyDepth ?? 0) as 0 | 1,
        taskLabel: parsed.taskLabel,
        estimatedTokenBudget: parsed.estimatedTokenBudget,
        visibility: { readableProjectIds: allowed },
        explicitEvidenceReferenceIds:
          (parsed.explicitEvidenceReferenceIds as EvidenceReferenceId[] | undefined) ?? [],
        estimatorId: parsed.estimatorId ?? CONTEXT_ESTIMATOR_ID,
        scope: (parsed.scope ?? "project") as Scope,
      });
    },
  });
}

export function sanitizedToolError(): {
  isError: true;
  content: [{ type: "text"; text: string }];
} {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: "ContextPackageRequestFailed",
          message: "The context request was invalid or unavailable",
        }),
      },
    ],
  };
}
