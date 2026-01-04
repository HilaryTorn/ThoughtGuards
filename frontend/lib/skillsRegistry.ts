import { Skill } from './types';
import { DetectionCategory } from '../types';

export const AVAILABLE_SKILLS: Skill[] = [
  {
    id: 'sycophancy-auditor',
    name: 'Sycophancy Auditor',
    description: 'Detects behavioral alignment bias where models agree with user priors over truth.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'reward-hacking-auditor',
    name: 'Reward Hacking Auditor',
    description: 'Detects reward hacking behaviors where systems game evaluation mechanisms rather than accomplishing true objectives.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'sabotage-planning-auditor',
    name: 'Sabotage Planning Auditor',
    description: 'Detects sabotage planning behaviors including competitor disparagement, fabricated news, and malicious actions.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'goal-reasoning-auditor',
    name: 'Goal Reasoning Auditor',
    description: 'Detects goal reasoning issues where systems prioritize proxy metrics over true stated objectives.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'deception-planning-auditor',
    name: 'Deception Planning Auditor',
    description: 'Detects deception planning including fabricated constraints, blame deflection, and information withholding.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'obfuscation-evasion-auditor',
    name: 'Obfuscation & Evasion Auditor',
    description: 'Detects obfuscation and evasion behaviors including blame redirection, context stripping, and strategic omission.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'persona-manipulation-auditor',
    name: 'Persona Manipulation Auditor',
    description: 'Detects persona manipulation including tone shifting, escalation suppression, and authority fabrication.',
    isUserCreated: false,
    files: []
  }
];

export const CATEGORY_TO_SKILL: Record<DetectionCategory, string> = {
  'Goal Reasoning': 'goal-reasoning-auditor',
  'Deception Planning': 'deception-planning-auditor',
  'Reward Hacking': 'reward-hacking-auditor',
  'Sabotage Planning': 'sabotage-planning-auditor',
  'Obfuscation & Evasion': 'obfuscation-evasion-auditor',
  'Persona Manipulation': 'persona-manipulation-auditor',
};

export function getSkillById(skillId: string): Skill | undefined {
  return AVAILABLE_SKILLS.find(skill => skill.id === skillId);
}

export function getSkillForCategory(category: DetectionCategory): Skill | undefined {
  const skillId = CATEGORY_TO_SKILL[category];
  return skillId ? getSkillById(skillId) : undefined;
}

