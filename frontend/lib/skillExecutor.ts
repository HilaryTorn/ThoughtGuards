import { Conversation, AuditResult, Skill } from './types';
import { auditTaxonomy } from '../skills/taxonomy-auditor/taxonomy-auditor';

export interface AuditOptions {
  signal?: AbortSignal;
  sensitivity?: 'low' | 'medium' | 'high';
  thinkingBudget?: number;
  includeValidatorCoT?: boolean;
}

type AuditFunction = (
  conversation: Conversation,
  modelName: string,
  options?: AuditOptions
) => Promise<AuditResult>;

// Registry for built-in skills
const builtInSkillRegistry: Record<string, AuditFunction> = {
  'taxonomy-auditor': auditTaxonomy,
};

/**
 * Execute an audit using the specified skill
 */
export async function executeSkillAudit(
  skill: Skill,
  conversation: Conversation,
  modelName: string,
  options?: AuditOptions
): Promise<AuditResult> {
  // Check if it's a built-in skill
  if (builtInSkillRegistry[skill.id]) {
    const result = await builtInSkillRegistry[skill.id](conversation, modelName, options);
    // Ensure skill_id is set correctly
    return {
      ...result,
      skill_id: skill.id,
    };
  }

  throw new Error(`Skill ${skill.id} is not a built-in skill and custom skills are not yet supported.`);
}
