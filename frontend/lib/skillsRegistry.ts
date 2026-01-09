import { Skill } from './types';
import { DetectionCategory } from '../types';

export const AVAILABLE_SKILLS: Skill[] = [
  // Primary unified taxonomy auditor (recommended)
  {
    id: 'taxonomy-auditor',
    name: 'Taxonomy Auditor',
    description: 'Unified manipulation auditor using WHY/HOW/TARGET taxonomy. Replaces all category-specific auditors.',
    isUserCreated: false,
    files: []
  },
  // Legacy auditors (deprecated - kept for backward compatibility)
  {
    id: 'sycophancy-auditor',
    name: 'Sycophancy Auditor (Legacy)',
    description: '[DEPRECATED] Use taxonomy-auditor instead. Detects behavioral alignment bias.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'reward-hacking-auditor',
    name: 'Reward Hacking Auditor (Legacy)',
    description: '[DEPRECATED] Use taxonomy-auditor instead. Detects reward hacking behaviors.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'sabotage-planning-auditor',
    name: 'Sabotage Planning Auditor (Legacy)',
    description: '[DEPRECATED] Use taxonomy-auditor instead. Detects sabotage planning behaviors.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'goal-reasoning-auditor',
    name: 'Goal Reasoning Auditor (Legacy)',
    description: '[DEPRECATED] Use taxonomy-auditor instead. Detects goal reasoning issues.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'deception-planning-auditor',
    name: 'Deception Planning Auditor (Legacy)',
    description: '[DEPRECATED] Use taxonomy-auditor instead. Detects deception planning.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'obfuscation-evasion-auditor',
    name: 'Obfuscation & Evasion Auditor (Legacy)',
    description: '[DEPRECATED] Use taxonomy-auditor instead. Detects obfuscation and evasion.',
    isUserCreated: false,
    files: []
  },
  {
    id: 'persona-manipulation-auditor',
    name: 'Persona Manipulation Auditor (Legacy)',
    description: '[DEPRECATED] Use taxonomy-auditor instead. Detects persona manipulation.',
    isUserCreated: false,
    files: []
  }
];

// Maps HOW verb categories to the unified taxonomy auditor
export const CATEGORY_TO_SKILL: Record<DetectionCategory, string> = {
  'Fabricated': 'taxonomy-auditor',      // H1: Misrepresentation
  'Sandbagged': 'taxonomy-auditor',      // H2: Capability Suppression
  'Context-Switched': 'taxonomy-auditor', // H3: Oversight-Conditional
  'Pressured': 'taxonomy-auditor',       // H4: Influence Tactics
  'Hid': 'taxonomy-auditor',             // H5: Omission/Obfuscation
  'Overclaimed': 'taxonomy-auditor',     // H6: Miscalibration
};

export function getSkillById(skillId: string): Skill | undefined {
  return AVAILABLE_SKILLS.find(skill => skill.id === skillId);
}

export function getSkillForCategory(category: DetectionCategory): Skill | undefined {
  const skillId = CATEGORY_TO_SKILL[category];
  return skillId ? getSkillById(skillId) : undefined;
}

