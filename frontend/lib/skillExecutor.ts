import { Conversation, AuditResult, Skill } from './types';
import { auditSycophancy } from '../skills/sycophancy-auditor/sycophancy-auditor';
import { auditRewardHacking } from '../skills/reward-hacking-auditor/reward-hacking-auditor';
import { auditSabotagePlanning } from '../skills/sabotage-planning-auditor/sabotage-planning-auditor';
import { auditGoalReasoning } from '../skills/goal-reasoning-auditor/goal-reasoning-auditor';
import { auditDeceptionPlanning } from '../skills/deception-planning-auditor/deception-planning-auditor';
import { auditObfuscationEvasion } from '../skills/obfuscation-evasion-auditor/obfuscation-evasion-auditor';
import { auditPersonaManipulation } from '../skills/persona-manipulation-auditor/persona-manipulation-auditor';

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
  'sycophancy-auditor': auditSycophancy,
  'reward-hacking-auditor': auditRewardHacking,
  'sabotage-planning-auditor': auditSabotagePlanning,
  'goal-reasoning-auditor': auditGoalReasoning,
  'deception-planning-auditor': auditDeceptionPlanning,
  'obfuscation-evasion-auditor': auditObfuscationEvasion,
  'persona-manipulation-auditor': auditPersonaManipulation,
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
