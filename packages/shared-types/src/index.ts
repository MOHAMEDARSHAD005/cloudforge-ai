import { z } from 'zod';
import * as schemas from './schemas';

export * from './schemas';

export type ProjectPlan = z.infer<typeof schemas.ProjectPlanSchema>;
export type ServiceComponent = z.infer<typeof schemas.ServiceComponentSchema>;
export type ArchitectureModel = z.infer<typeof schemas.ArchitectureModelSchema>;
export type AwsService = z.infer<typeof schemas.AwsServiceSchema>;
export type AwsArchitecture = z.infer<typeof schemas.AwsArchitectureSchema>;
export type SecurityFinding = z.infer<typeof schemas.SecurityFindingSchema>;
export type SecurityReport = z.infer<typeof schemas.SecurityReportSchema>;
export type CostLineItem = z.infer<typeof schemas.CostLineItemSchema>;
export type CostTier = z.infer<typeof schemas.CostTierSchema>;
export type CostModel = z.infer<typeof schemas.CostModelSchema>;
export type TerraformFile = z.infer<typeof schemas.TerraformFileSchema>;
export type TerraformBundle = z.infer<typeof schemas.TerraformBundleSchema>;
export type DiagramModel = z.infer<typeof schemas.DiagramModelSchema>;
export type ReviewFinding = z.infer<typeof schemas.ReviewFindingSchema>;
export type ReviewReport = z.infer<typeof schemas.ReviewReportSchema>;
